"""Tests for Iteration 7: Gemini model selector addition.

Scope of this iteration (per review request):
- NEW backend: GET /api/settings/models — public endpoint returning default+models.
- NEW backend: POST /api/chats/{id}/messages accepts optional `model` field:
  * model omitted or 'gpt-5.2' -> OpenAI/emergentintegrations path (unchanged).
  * model='gemini-2.5-flash' AND GEMINI_API_KEY empty -> 503 with the
    message 'Gemini not configured — set GEMINI_API_KEY on the server' AND
    the just-inserted user_message must be rolled back (chat_messages count
    is unchanged after the call).
  * unknown/invalid model -> silently fall back to gpt-5.2 (200 or budget
    error, never 400/422).
- NEW backend: assistant_msg includes `model` indicating producing model.
"""
import os
import time
import uuid
import pytest
import requests


# -------- helpers --------
def _register_new_user(base_url: str):
    ts = int(time.time() * 1000)
    email = f"gemini_it7_{ts}_{uuid.uuid4().hex[:6]}@example.com"
    password = "SuperSecret123!"
    r = requests.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": password, "name": "GeminiIt7"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return email, password, d["token"], d["user"]


@pytest.fixture(scope="module")
def gm_user(base_url, mongo_db):
    email, password, token, user = _register_new_user(base_url)
    yield {"token": token, "user": user, "email": email}
    # cleanup
    mongo_db.users.delete_many({"email": email})
    mongo_db.chats.delete_many({"user_id": user["user_id"]})
    mongo_db.chat_messages.delete_many({"user_id": user["user_id"]})


@pytest.fixture
def gm_client(api_client, gm_user):
    api_client.headers.update({"Authorization": f"Bearer {gm_user['token']}"})
    return api_client


@pytest.fixture
def new_chat(gm_client, base_url):
    r = gm_client.post(f"{base_url}/api/chats", json={"title": "It7 chat"})
    assert r.status_code == 200, r.text
    return r.json()["chat_id"]


# ==================== GET /api/settings/models ====================
class TestSettingsModels:
    def test_public_no_auth_required(self, base_url):
        # Auth NOT required per spec
        r = requests.get(f"{base_url}/api/settings/models", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["default"] == "gpt-5.2"
        assert isinstance(d["models"], list)
        assert len(d["models"]) == 2

    def test_gpt_available_true(self, base_url):
        r = requests.get(f"{base_url}/api/settings/models", timeout=10)
        d = r.json()
        gpt = next(m for m in d["models"] if m["id"] == "gpt-5.2")
        assert gpt["provider"] == "openai"
        assert gpt["label"] == "GPT-5.2 (OpenAI)"
        assert gpt["available"] is True

    def test_gemini_available_false_when_key_missing(self, base_url):
        r = requests.get(f"{base_url}/api/settings/models", timeout=10)
        d = r.json()
        gem = next(m for m in d["models"] if m["id"] == "gemini-2.5-flash")
        assert gem["provider"] == "gemini"
        assert gem["label"] == "Gemini 2.5 Flash (Google)"
        # GEMINI_API_KEY is intentionally empty for this iteration
        assert gem["available"] is False


# ==================== POST /chats/{id}/messages with model routing ====================
class TestChatModelRouting:
    def _count_messages(self, gm_client, base_url, chat_id):
        r = gm_client.get(f"{base_url}/api/chats/{chat_id}")
        assert r.status_code == 200, r.text
        return len(r.json()["messages"])

    def test_gemini_selected_returns_503_and_rolls_back_user_msg(
        self, gm_client, base_url, new_chat
    ):
        """Primary NEW behavior: model=gemini-2.5-flash while key empty
        should return 503 'Gemini not configured' and NOT persist the
        orphan user message.
        """
        chat_id = new_chat
        before = self._count_messages(gm_client, base_url, chat_id)
        r = gm_client.post(
            f"{base_url}/api/chats/{chat_id}/messages",
            json={"content": "hi from gemini path", "model": "gemini-2.5-flash"},
            timeout=30,
        )
        # Contract: 503 not 502/500
        assert r.status_code == 503, (
            f"Expected 503 'Gemini not configured' but got {r.status_code}: {r.text[:300]}"
        )
        body = r.json()
        # detail should mention Gemini not configured
        detail = body.get("detail") or body.get("message") or ""
        assert "gemini" in detail.lower() and (
            "not configured" in detail.lower() or "gemini_api_key" in detail.lower()
        ), f"Expected 'Gemini not configured' style message, got: {detail}"

        # No orphan user_message should remain
        after = self._count_messages(gm_client, base_url, chat_id)
        assert after == before, (
            f"Orphan user_message left behind. before={before} after={after}"
        )

    def test_default_model_takes_openai_path(self, gm_client, base_url, new_chat):
        """When model is omitted -> uses OpenAI path (same as before).
        Real LLM may be budget-blocked -> may return 502; either 200 or 502
        is acceptable (as long as it doesn't route through gemini/503)."""
        chat_id = new_chat
        r = gm_client.post(
            f"{base_url}/api/chats/{chat_id}/messages",
            json={"content": "hello default"},
            timeout=90,
        )
        if r.status_code == 200:
            body = r.json()
            assert "assistant_message" in body
            assert body["assistant_message"]["role"] == "assistant"
            assert body["assistant_message"].get("model") == "gpt-5.2", (
                f"assistant_message.model expected 'gpt-5.2', got: "
                f"{body['assistant_message'].get('model')}"
            )
        else:
            # Budget block / provider error -> ok, but must NOT be 503 gemini
            assert r.status_code != 503, (
                f"Default model should not hit gemini not-configured path: {r.text[:300]}"
            )
            pytest.skip(
                f"OpenAI real-LLM path blocked (status={r.status_code}): "
                f"{r.text[:200]} — model routing itself works, but full end-to-end "
                f"unverified due to budget."
            )

    def test_explicit_gpt52_takes_openai_path(self, gm_client, base_url, new_chat):
        chat_id = new_chat
        r = gm_client.post(
            f"{base_url}/api/chats/{chat_id}/messages",
            json={"content": "hello gpt52", "model": "gpt-5.2"},
            timeout=90,
        )
        assert r.status_code != 503, r.text[:300]
        if r.status_code == 200:
            body = r.json()
            assert body["assistant_message"].get("model") == "gpt-5.2"
        else:
            pytest.skip(
                f"OpenAI real-LLM path blocked (status={r.status_code}): "
                f"{r.text[:200]}"
            )

    def test_unknown_model_falls_back_to_gpt(self, gm_client, base_url, new_chat):
        """Unknown/invalid model should silently fall back to gpt-5.2, not error."""
        chat_id = new_chat
        r = gm_client.post(
            f"{base_url}/api/chats/{chat_id}/messages",
            json={"content": "hi unknown model", "model": "some-unknown-model-xyz"},
            timeout=90,
        )
        # Must NOT be 400/422 (validation) or 503 (gemini-not-configured)
        assert r.status_code not in (400, 422, 503), (
            f"Unknown model should silently fall back, got {r.status_code}: {r.text[:300]}"
        )
        if r.status_code == 200:
            body = r.json()
            # Should have fallen back to gpt-5.2
            assert body["assistant_message"].get("model") == "gpt-5.2"
        else:
            pytest.skip(
                f"Fallback path reached OpenAI but real-LLM is blocked "
                f"(status={r.status_code}): {r.text[:200]}"
            )
