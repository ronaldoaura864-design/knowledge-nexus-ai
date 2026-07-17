from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============ Models ============
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: str


class SessionRequest(BaseModel):
    session_id: str


class GenerateRequest(BaseModel):
    prompt: str
    project_id: Optional[str] = None


class Project(BaseModel):
    project_id: str
    user_id: str
    name: str
    prompt: str
    description: Optional[str] = ""
    html: str = ""
    css: str = ""
    js: str = ""
    created_at: str
    updated_at: str


# ============ Auth helpers ============
async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> User:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


# ============ Routes ============
@api_router.get("/")
async def root():
    return {"message": "Knowledge-Nexus AI is running"}


@api_router.post("/auth/session")
async def create_session(payload: SessionRequest, response: Response):
    """Exchange Emergent session_id for a persistent session token."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data["email"]
    name = data["name"]
    picture = data.get("picture", "")
    session_token = data["session_token"]

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user_doc, "session_token": session_token}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@api_router.post("/auth/logout")
async def logout(
    response: Response,
    session_token: Optional[str] = Cookie(default=None),
):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


# ============ Projects / Generation ============
SYSTEM_PROMPT = """You are an expert web designer/developer. Generate a complete multi-page single-file website from the user's prompt.

Return ONLY valid JSON (no markdown fences, no commentary). Schema:
{
  "name": "<=5 word project name",
  "description": "one-sentence pitch",
  "html": "inner body markup only (NO <html>/<head>/<body>/<style>/<script> tags). Include: <nav> with links to #home #about #services #contact, four <section id='home|about|services|contact'>, <footer>. Include realistic content and Unsplash <img> URLs matching the topic.",
  "css": "complete responsive CSS. Import ONE Google font. Use CSS variables, flexbox/grid, mobile-first. Cohesive palette matching topic.",
  "js": "vanilla JS: smooth-scroll nav, mobile menu toggle. No external libs."
}

Rules:
- All strings must be valid JSON (escape quotes/newlines).
- Keep total output concise but complete (target 6-10KB html, 4-8KB css, <2KB js).
- No <html>/<head>/<body>/<style>/<script> tags inside html field.
- Anchor links only (#home etc)."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown fences if any
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fallback: find first { ... last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return json.loads(text[start : end + 1])
    raise ValueError("Model did not return valid JSON")


import asyncio


async def _run_generation(project_id: str, user_id: str, prompt: str):
    """Background task: call LLM and update project doc."""
    try:
        session_id = f"proj_{uuid.uuid4().hex[:10]}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT,
        ).with_model("openai", "gpt-5.2")
        raw = await chat.send_message(
            UserMessage(text=f"Build a website for: {prompt}\n\nReturn ONLY the JSON object.")
        )
        result = _extract_json(raw if isinstance(raw, str) else str(raw))
        now = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user_id},
            {
                "$set": {
                    "name": (result.get("name") or "Untitled Site")[:80],
                    "description": result.get("description", ""),
                    "html": result.get("html", ""),
                    "css": result.get("css", ""),
                    "js": result.get("js", ""),
                    "status": "ready",
                    "error": None,
                    "updated_at": now,
                }
            },
        )
    except Exception as e:
        logger.exception("Background generation failed")
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user_id},
            {
                "$set": {
                    "status": "failed",
                    "error": str(e)[:500],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )


@api_router.post("/projects/generate")
async def generate_project(
    req: GenerateRequest, user: User = Depends(get_current_user)
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    now = datetime.now(timezone.utc).isoformat()
    project_id = req.project_id or f"proj_{uuid.uuid4().hex[:12]}"

    # Preserve existing name for regenerate; otherwise placeholder
    existing = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    base_name = existing.get("name") if existing else "Generating…"

    project = {
        "project_id": project_id,
        "user_id": user.user_id,
        "name": base_name,
        "prompt": req.prompt,
        "description": (existing.get("description") if existing else "") or "",
        "html": (existing.get("html") if existing else "") or "",
        "css": (existing.get("css") if existing else "") or "",
        "js": (existing.get("js") if existing else "") or "",
        "status": "generating",
        "error": None,
        "created_at": existing.get("created_at") if existing else now,
        "updated_at": now,
    }
    await db.projects.replace_one(
        {"project_id": project_id, "user_id": user.user_id}, project, upsert=True
    )

    # Kick off background LLM task
    asyncio.create_task(_run_generation(project_id, user.user_id, req.prompt))

    return {"project_id": project_id, "status": "generating"}


@api_router.get("/projects")
async def list_projects(user: User = Depends(get_current_user)):
    cursor = db.projects.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(200)
    # Trim payload for list view
    for it in items:
        it["html"] = ""
        it["css"] = ""
        it["js"] = ""
        it.setdefault("status", "ready")
    return items


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, user: User = Depends(get_current_user)):
    doc = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: User = Depends(get_current_user)):
    res = await db.projects.delete_one(
        {"project_id": project_id, "user_id": user.user_id}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
