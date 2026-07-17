"""Backend API tests for Knowledge-Nexus AI.

New async pattern:
- POST /api/projects/generate returns immediately with {project_id, status: 'generating'}
- Background task calls GPT-5.2 and updates the doc to status='ready' (or 'failed')
- Client polls GET /api/projects/{id} until status transitions.
"""
import time
import pytest


# --- Health ---
class TestRoot:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "message" in data
        assert "Knowledge-Nexus" in data["message"]


# --- Auth guard tests ---
class TestAuth:
    def test_auth_me_without_token_returns_401(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_auth_me_with_token_returns_user(self, auth_client, base_url, test_user):
        r = auth_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == test_user["user_id"]
        assert data["email"] == test_user["email"]
        assert data["name"] == "Test User"

    def test_projects_list_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects")
        assert r.status_code == 401

    def test_projects_generate_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/projects/generate", json={"prompt": "test"})
        assert r.status_code == 401

    def test_project_get_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects/nonexistent")
        assert r.status_code == 401

    def test_project_delete_requires_auth(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/projects/nonexistent")
        assert r.status_code == 401


# --- Project generation via async background task + polling ---
class TestProjects:
    _project_id = None

    def test_generate_returns_immediately(self, auth_client, base_url):
        """POST should return quickly with project_id + status='generating' (no 502)."""
        prompt = "Create a modern restaurant website with menu and reservations"
        t0 = time.time()
        r = auth_client.post(
            f"{base_url}/api/projects/generate",
            json={"prompt": prompt},
            timeout=30,
        )
        dt = time.time() - t0
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
        assert dt < 15, f"generate endpoint took too long ({dt:.1f}s) — should return immediately"
        data = r.json()
        assert data.get("project_id"), "project_id missing"
        assert data.get("status") == "generating", f"unexpected status {data.get('status')}"
        TestProjects._project_id = data["project_id"]

    def test_generating_status_visible_on_get(self, auth_client, base_url):
        """Immediately after POST, GET should show status=generating with empty html/css/js."""
        assert TestProjects._project_id, "generate must run first"
        r = auth_client.get(f"{base_url}/api/projects/{TestProjects._project_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == TestProjects._project_id
        # status must be one of the valid states
        assert data.get("status") in {"generating", "ready", "failed"}, data.get("status")
        assert data.get("prompt")

    def test_poll_until_ready(self, auth_client, base_url):
        """Poll GET every 3s (max ~4min) until status transitions to ready/failed."""
        assert TestProjects._project_id, "generate must run first"
        deadline = time.time() + 240  # 4 minutes
        final = None
        polls = 0
        while time.time() < deadline:
            r = auth_client.get(f"{base_url}/api/projects/{TestProjects._project_id}")
            assert r.status_code == 200
            d = r.json()
            polls += 1
            if d.get("status") in {"ready", "failed"}:
                final = d
                break
            time.sleep(3)
        assert final is not None, f"Project stuck in 'generating' after 4min ({polls} polls)"
        if final["status"] == "failed":
            pytest.fail(f"Generation failed: {final.get('error')!r}")
        # status == 'ready' — validate real AI output
        assert isinstance(final.get("html"), str) and len(final["html"]) > 200, \
            f"html too short ({len(final.get('html', ''))} chars)"
        assert isinstance(final.get("css"), str) and len(final["css"]) > 100, \
            f"css too short ({len(final.get('css', ''))} chars)"
        assert isinstance(final.get("js"), str), "js missing"
        # Semantic checks: required section ids present
        html_lower = final["html"].lower()
        for sec in ["home", "about", "services", "contact"]:
            assert sec in html_lower, f"section '{sec}' missing from html"
        assert final.get("name") and final["name"] != "Generating…", "name not updated"

    def test_list_projects_returns_generated(self, auth_client, base_url):
        assert TestProjects._project_id
        r = auth_client.get(f"{base_url}/api/projects")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        target = next((it for it in items if it["project_id"] == TestProjects._project_id), None)
        assert target is not None, "generated project missing from list"
        # List view trims html/css/js
        assert target["html"] == ""
        assert target["css"] == ""
        assert target["js"] == ""
        assert target.get("status") in {"ready", "generating", "failed"}

    def test_get_project_returns_full(self, auth_client, base_url):
        pid = TestProjects._project_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == pid
        assert data["status"] == "ready"
        assert len(data["html"]) > 200
        assert len(data["css"]) > 100

    def test_get_nonexistent_project_returns_404(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/projects/does-not-exist-xyz")
        assert r.status_code == 404

    def test_delete_project_and_verify_removal(self, auth_client, base_url):
        pid = TestProjects._project_id
        r = auth_client.delete(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        r2 = auth_client.get(f"{base_url}/api/projects/{pid}")
        assert r2.status_code == 404


# --- Logout ---
class TestLogout:
    def test_logout_deletes_session(self, api_client, base_url, mongo_db):
        from datetime import datetime, timezone, timedelta
        import time as _t
        ts = int(_t.time() * 1000)
        user_id = f"test-user-logout-{ts}"
        session_token = f"test_session_logout_{ts}"
        mongo_db.users.insert_one({
            "user_id": user_id,
            "email": f"logout.{ts}@example.com",
            "name": "Logout User",
            "picture": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        mongo_db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = api_client.post(
                f"{base_url}/api/auth/logout",
                cookies={"session_token": session_token},
            )
            assert r.status_code == 200
            assert r.json().get("ok") is True
            assert mongo_db.user_sessions.find_one({"session_token": session_token}) is None
            set_cookie = r.headers.get("set-cookie", "")
            assert "session_token=" in set_cookie
        finally:
            mongo_db.users.delete_many({"user_id": user_id})
            mongo_db.user_sessions.delete_many({"user_id": user_id})
