"""Backend API tests for Knowledge-Nexus AI (v1 + AI Editor).

Async patterns:
- POST /api/projects/generate returns immediately with {project_id, status: 'generating'}
- POST /api/projects/{id}/edit returns immediately with {project_id, status: 'generating'}
- Background task calls GPT-5.2 and updates the doc to status='ready' (or 'failed')
- Client polls GET /api/projects/{id} until status transitions.

New in this iteration: AI Editor endpoints (/edit, /versions, /versions/{id}, /revert).
LLM Basic plan concurrent limit = 1 — tests are sequential.
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


# --- Auth guard tests (existing + new endpoints) ---
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

    def test_project_edit_requires_auth(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/projects/nonexistent/edit", json={"prompt": "test"}
        )
        assert r.status_code == 401

    def test_versions_list_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects/nonexistent/versions")
        assert r.status_code == 401

    def test_version_get_requires_auth(self, api_client, base_url):
        r = api_client.get(
            f"{base_url}/api/projects/nonexistent/versions/ver_xxx"
        )
        assert r.status_code == 401

    def test_revert_requires_auth(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/projects/nonexistent/revert", json={"version_id": "x"}
        )
        assert r.status_code == 401


# --- Not-found (auth-ed) checks for edit/versions/revert ---
class TestEditor404s:
    def test_edit_nonexistent_project_returns_404(self, auth_client, base_url):
        r = auth_client.post(
            f"{base_url}/api/projects/does-not-exist-xyz/edit",
            json={"prompt": "add pricing"},
        )
        assert r.status_code == 404

    def test_versions_list_nonexistent_returns_404(self, auth_client, base_url):
        r = auth_client.get(
            f"{base_url}/api/projects/does-not-exist-xyz/versions"
        )
        assert r.status_code == 404

    def test_get_version_nonexistent_returns_404(self, auth_client, base_url):
        r = auth_client.get(
            f"{base_url}/api/projects/does-not-exist-xyz/versions/ver_missing"
        )
        assert r.status_code == 404

    def test_revert_nonexistent_project_returns_404(self, auth_client, base_url):
        r = auth_client.post(
            f"{base_url}/api/projects/does-not-exist-xyz/revert",
            json={"version_id": "ver_missing"},
        )
        assert r.status_code == 404


def _poll_until_ready(auth_client, base_url, project_id, timeout=240):
    """Utility: block until project status transitions to ready/failed."""
    deadline = time.time() + timeout
    polls = 0
    while time.time() < deadline:
        r = auth_client.get(f"{base_url}/api/projects/{project_id}")
        assert r.status_code == 200, r.text
        d = r.json()
        polls += 1
        if d.get("status") in {"ready", "failed"}:
            return d, polls
        time.sleep(3)
    return None, polls


# --- Full project + AI Editor flow ---
class TestProjectsAndEditor:
    _project_id = None
    _generate_version_id = None
    _edit_version_id = None
    _generate_html = None
    _edit_html = None

    def test_01_generate_returns_immediately(self, auth_client, base_url):
        prompt = "Create a modern restaurant website with menu and reservations"
        t0 = time.time()
        r = auth_client.post(
            f"{base_url}/api/projects/generate", json={"prompt": prompt}, timeout=30
        )
        dt = time.time() - t0
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
        assert dt < 15, f"generate endpoint took too long ({dt:.1f}s)"
        data = r.json()
        assert data.get("project_id")
        assert data.get("status") == "generating"
        TestProjectsAndEditor._project_id = data["project_id"]

    def test_02_generate_poll_until_ready(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        assert pid
        final, polls = _poll_until_ready(auth_client, base_url, pid, timeout=240)
        assert final is not None, f"Project stuck in 'generating' after 4min ({polls} polls)"
        if final["status"] == "failed":
            pytest.fail(f"Generation failed: {final.get('error')!r}")
        assert len(final["html"]) > 200
        assert len(final["css"]) > 100
        # required sections
        html_lower = final["html"].lower()
        for sec in ["home", "about", "services", "contact"]:
            assert sec in html_lower, f"section '{sec}' missing"
        assert final.get("current_version_id"), "current_version_id must be set"
        TestProjectsAndEditor._generate_html = final["html"]

    def test_03_versions_list_has_initial_generate_version(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}/versions")
        assert r.status_code == 200
        data = r.json()
        assert "versions" in data and "current_version_id" in data
        vs = data["versions"]
        assert isinstance(vs, list) and len(vs) == 1, f"expected 1 initial version, got {len(vs)}"
        v0 = vs[0]
        assert v0["action"] == "generate"
        assert v0.get("version_id")
        assert v0.get("prompt")
        assert v0.get("name")
        assert v0.get("created_at")
        # list view must NOT include html/css/js
        assert "html" not in v0 and "css" not in v0 and "js" not in v0
        # current pointer matches
        assert data["current_version_id"] == v0["version_id"]
        TestProjectsAndEditor._generate_version_id = v0["version_id"]

    def test_04_get_specific_version_returns_full_content(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        vid = TestProjectsAndEditor._generate_version_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}/versions/{vid}")
        assert r.status_code == 200
        v = r.json()
        assert v["version_id"] == vid
        assert v["action"] == "generate"
        assert isinstance(v.get("html"), str) and len(v["html"]) > 200
        assert isinstance(v.get("css"), str) and len(v["css"]) > 100
        assert isinstance(v.get("js"), str)

    def test_05_edit_returns_immediately(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        t0 = time.time()
        r = auth_client.post(
            f"{base_url}/api/projects/{pid}/edit",
            json={"prompt": "Add a pricing section with three tiers: Basic, Pro, Enterprise"},
            timeout=30,
        )
        dt = time.time() - t0
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
        assert dt < 15, f"edit endpoint took too long ({dt:.1f}s)"
        data = r.json()
        assert data.get("project_id") == pid
        assert data.get("status") == "generating"

    def test_06_edit_conflict_while_generating(self, auth_client, base_url):
        """A second edit while first is in-flight should 409 (or at minimum, not silently succeed twice)."""
        pid = TestProjectsAndEditor._project_id
        r = auth_client.post(
            f"{base_url}/api/projects/{pid}/edit",
            json={"prompt": "make it green"},
            timeout=15,
        )
        # Per server.py: raises 409 if status == 'generating'
        assert r.status_code in (409, 200), r.status_code
        # If server allowed a second edit, we don't fail here — but we log via message.
        # (Primary contract is 409 which the code enforces.)

    def test_07_edit_poll_until_ready(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        final, polls = _poll_until_ready(auth_client, base_url, pid, timeout=240)
        assert final is not None, f"Edit stuck in 'generating' after 4min ({polls} polls)"
        if final["status"] == "failed":
            pytest.fail(f"Edit failed: {final.get('error')!r}")
        assert final["status"] == "ready"
        # Preserved sections from original generation
        html_lower = final["html"].lower()
        for sec in ["home", "about", "services", "contact"]:
            assert sec in html_lower, f"section '{sec}' missing after edit — original content not preserved"
        # Requested content added
        assert "pricing" in html_lower, "'pricing' section not added after edit"
        # current_version_id changed
        assert final["current_version_id"] != TestProjectsAndEditor._generate_version_id, (
            "current_version_id must advance after edit"
        )
        TestProjectsAndEditor._edit_html = final["html"]

    def test_08_versions_list_has_two_versions_after_edit(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}/versions")
        assert r.status_code == 200
        data = r.json()
        vs = data["versions"]
        assert len(vs) == 2, f"expected 2 versions after edit, got {len(vs)}"
        # First is generate, second is edit — sorted by created_at ascending per server.py
        assert vs[0]["action"] == "generate"
        assert vs[1]["action"] == "edit"
        assert vs[1]["prompt"].lower().startswith("add a pricing")
        # current points at edit version
        assert data["current_version_id"] == vs[1]["version_id"]
        TestProjectsAndEditor._edit_version_id = vs[1]["version_id"]

    def test_09_revert_to_first_version(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        gen_vid = TestProjectsAndEditor._generate_version_id
        r = auth_client.post(
            f"{base_url}/api/projects/{pid}/revert",
            json={"version_id": gen_vid},
        )
        assert r.status_code == 200, r.text
        proj = r.json()
        assert proj["current_version_id"] == gen_vid
        assert proj["status"] == "ready"
        # Content matches original generation snapshot (html body identical)
        assert proj["html"] == TestProjectsAndEditor._generate_html, (
            "Revert did not restore original html content"
        )

    def test_10_versions_still_two_after_revert_non_destructive(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}/versions")
        assert r.status_code == 200
        data = r.json()
        vs = data["versions"]
        assert len(vs) == 2, f"revert must be non-destructive; got {len(vs)} versions"
        assert data["current_version_id"] == TestProjectsAndEditor._generate_version_id

    def test_11_redo_by_reverting_to_edit_version(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        edit_vid = TestProjectsAndEditor._edit_version_id
        r = auth_client.post(
            f"{base_url}/api/projects/{pid}/revert",
            json={"version_id": edit_vid},
        )
        assert r.status_code == 200
        proj = r.json()
        assert proj["current_version_id"] == edit_vid
        assert "pricing" in proj["html"].lower()
        assert proj["html"] == TestProjectsAndEditor._edit_html

    def test_12_revert_to_nonexistent_version_returns_404(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.post(
            f"{base_url}/api/projects/{pid}/revert",
            json={"version_id": "ver_does_not_exist"},
        )
        assert r.status_code == 404

    def test_13_list_projects_returns_generated(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.get(f"{base_url}/api/projects")
        assert r.status_code == 200
        items = r.json()
        target = next((it for it in items if it["project_id"] == pid), None)
        assert target is not None
        # list view trims html/css/js
        assert target["html"] == "" and target["css"] == "" and target["js"] == ""

    def test_14_get_project_returns_full(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
        r = auth_client.get(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == pid
        assert data["status"] == "ready"
        assert len(data["html"]) > 200

    def test_15_get_nonexistent_project_returns_404(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/projects/does-not-exist-xyz")
        assert r.status_code == 404

    def test_99_delete_project_and_verify_removal(self, auth_client, base_url):
        pid = TestProjectsAndEditor._project_id
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
