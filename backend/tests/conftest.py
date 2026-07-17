"""Shared fixtures for Knowledge-Nexus AI backend tests."""
import os
import time
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://knowledge-nexus-120.preview.emergentagent.com"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def test_user(mongo_db):
    """Insert a fresh test user + session directly into MongoDB."""
    ts = int(time.time() * 1000)
    user_id = f"test-user-{ts}"
    session_token = f"test_session_{ts}"
    email = f"test.user.{ts}@example.com"
    from datetime import datetime, timezone, timedelta
    mongo_db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Test User",
        "picture": "https://via.placeholder.com/150",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo_db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": user_id, "session_token": session_token, "email": email}
    # Cleanup
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.users.delete_many({"user_id": user_id})
    mongo_db.projects.delete_many({"user_id": user_id})


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_client(api_client, test_user):
    api_client.headers.update({"Authorization": f"Bearer {test_user['session_token']}"})
    return api_client


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL
