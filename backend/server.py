# Vercel Build Trigger - All emergentintegrations references removed. Dependencies verified clean.
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse, RedirectResponse, HTMLResponse, PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import io
import base64
import zipfile
import secrets
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import httpx
import bcrypt
import jwt as pyjwt

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    EMERGENT_INTEGRATIONS_AVAILABLE = True
except ImportError:
    EMERGENT_INTEGRATIONS_AVAILABLE = False

    class UserMessage:
        def __init__(self, text: str = ""):
            self.text = text

    class ImageContent:
        def __init__(self, content: str = ""):
            self.content = content

    class LlmChat:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("emergentintegrations is not installed")

        def with_model(self, provider, model):
            raise RuntimeError("emergentintegrations is not installed")

        async def send_message(self, *args, **kwargs):
            raise RuntimeError("emergentintegrations is not installed")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "insecure-dev-secret")
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30

# Available chat models
CHAT_MODELS = {
    "gpt-5.2": {
        "provider": "openai",
        "label": "GPT-5.2 (OpenAI)",
        "available": bool(EMERGENT_LLM_KEY and EMERGENT_INTEGRATIONS_AVAILABLE),
    },
    "gemini-2.5-flash": {
        "provider": "gemini",
        "label": "Gemini 2.5 Flash (Google)",
        "available": bool(GEMINI_API_KEY),
    },
}
DEFAULT_CHAT_MODEL = "gpt-5.2"

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


class EditRequest(BaseModel):
    prompt: str


class RevertRequest(BaseModel):
    version_id: str


class GithubPushRequest(BaseModel):
    repo_name: str
    private: bool = False
    existing: bool = False
    commit_message: Optional[str] = "Update from Knowledge-Nexus AI"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ImageGenRequest(BaseModel):
    prompt: str


class ChatCreateRequest(BaseModel):
    title: Optional[str] = None


class ChatUpdateRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    content: str
    doc_ids: Optional[List[str]] = None
    model: Optional[str] = None


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
def _make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode_jwt(token: str) -> Optional[str]:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except Exception:
        return None


async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> User:
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # 1) Try session token (Google flow / seed sessions)
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    user_id: Optional[str] = None
    if sess:
        expires_at = sess.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user_id = sess["user_id"]
    else:
        # 2) Try JWT (email auth)
        user_id = _decode_jwt(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**{k: v for k, v in user_doc.items() if k in User.model_fields})


# ============ Routes ============
@api_router.get("/")
async def root():
    return {"message": "Knowledge-Nexus AI is running"}


@api_router.get("/settings/models")
async def list_chat_models():
    return {
        "default": DEFAULT_CHAT_MODEL,
        "models": [
            {"id": mid, "label": m["label"], "provider": m["provider"], "available": m["available"]}
            for mid, m in CHAT_MODELS.items()
        ],
    }


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


EDIT_SYSTEM_PROMPT = """You are an expert web designer/developer. The user will give you an existing website (html/css/js) and an EDIT INSTRUCTION. Modify ONLY what the instruction asks for. Preserve all other content, structure, and functionality.

Return ONLY valid JSON (no markdown fences, no commentary). Schema:
{
  "name": "<project name — keep existing unless user asks to rename>",
  "description": "<one-sentence description — keep or refine>",
  "html": "complete updated body markup (NO <html>/<head>/<body>/<style>/<script> tags). Must still contain <nav>, four <section id='home|about|services|contact'>, and <footer>. Add new sections if requested.",
  "css": "complete updated CSS",
  "js": "complete updated vanilla JS"
}

Rules:
- Preserve existing text/images/copy unless the instruction changes them.
- Preserve section IDs (#home #about #services #contact) unless user explicitly renames.
- If the user asks to ADD a section (e.g. pricing, testimonials, faq, contact form), append it and add it to <nav>.
- If the user asks a COLOR/FONT/STYLE change, only touch CSS.
- If they ask for ANIMATION change, update CSS and/or JS.
- Return full files (not diffs). All three fields must be complete.
- Output must be strict valid JSON with properly escaped strings."""


async def _save_version(project_id: str, user_id: str, action: str, prompt: str, snapshot: dict):
    """Append a version snapshot to project_versions and update project's version list."""
    version_id = f"ver_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    await db.project_versions.insert_one(
        {
            "version_id": version_id,
            "project_id": project_id,
            "user_id": user_id,
            "action": action,  # "generate" | "edit" | "revert"
            "prompt": prompt,
            "name": snapshot.get("name", ""),
            "description": snapshot.get("description", ""),
            "html": snapshot.get("html", ""),
            "css": snapshot.get("css", ""),
            "js": snapshot.get("js", ""),
            "created_at": now,
        }
    )
    await db.projects.update_one(
        {"project_id": project_id, "user_id": user_id},
        {
            "$push": {"version_ids": version_id},
            "$set": {"current_version_id": version_id, "updated_at": now},
        },
    )
    return version_id


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
        snapshot = {
            "name": (result.get("name") or "Untitled Site")[:80],
            "description": result.get("description", ""),
            "html": result.get("html", ""),
            "css": result.get("css", ""),
            "js": result.get("js", ""),
        }
        now = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user_id},
            {"$set": {**snapshot, "status": "ready", "error": None, "updated_at": now}},
        )
        await _save_version(project_id, user_id, "generate", prompt, snapshot)
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


async def _run_edit(project_id: str, user_id: str, prompt: str):
    """Background task: apply an AI edit to the existing project."""
    try:
        proj = await db.projects.find_one(
            {"project_id": project_id, "user_id": user_id}, {"_id": 0}
        )
        if not proj:
            return

        session_id = f"edit_{uuid.uuid4().hex[:10]}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=EDIT_SYSTEM_PROMPT,
        ).with_model("openai", "gpt-5.2")

        current = json.dumps(
            {
                "name": proj.get("name", ""),
                "description": proj.get("description", ""),
                "html": proj.get("html", ""),
                "css": proj.get("css", ""),
                "js": proj.get("js", ""),
            }
        )
        user_text = (
            f"EDIT INSTRUCTION: {prompt}\n\n"
            f"CURRENT WEBSITE JSON:\n{current}\n\n"
            "Apply the instruction and return the updated JSON object with the same schema."
        )
        raw = await chat.send_message(UserMessage(text=user_text))
        result = _extract_json(raw if isinstance(raw, str) else str(raw))
        snapshot = {
            "name": (result.get("name") or proj.get("name") or "Untitled Site")[:80],
            "description": result.get("description", proj.get("description", "")),
            "html": result.get("html", proj.get("html", "")),
            "css": result.get("css", proj.get("css", "")),
            "js": result.get("js", proj.get("js", "")),
        }
        now = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user_id},
            {"$set": {**snapshot, "status": "ready", "error": None, "updated_at": now}},
        )
        await _save_version(project_id, user_id, "edit", prompt, snapshot)
    except Exception as e:
        logger.exception("Background edit failed")
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


@api_router.post("/projects/{project_id}/edit")
async def edit_project(
    project_id: str, req: EditRequest, user: User = Depends(get_current_user)
):
    """Apply a natural-language edit to an existing project (async)."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    proj = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if proj.get("status") == "generating":
        raise HTTPException(status_code=409, detail="A generation is already in progress")

    await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {
            "$set": {
                "status": "generating",
                "error": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    asyncio.create_task(_run_edit(project_id, user.user_id, req.prompt))
    return {"project_id": project_id, "status": "generating"}


@api_router.get("/projects/{project_id}/versions")
async def list_versions(project_id: str, user: User = Depends(get_current_user)):
    proj = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cursor = (
        db.project_versions.find(
            {"project_id": project_id, "user_id": user.user_id},
            {"_id": 0, "html": 0, "css": 0, "js": 0},
        ).sort("created_at", 1)
    )
    versions = await cursor.to_list(500)
    return {
        "versions": versions,
        "current_version_id": proj.get("current_version_id"),
    }


@api_router.get("/projects/{project_id}/versions/{version_id}")
async def get_version(
    project_id: str, version_id: str, user: User = Depends(get_current_user)
):
    v = await db.project_versions.find_one(
        {"project_id": project_id, "user_id": user.user_id, "version_id": version_id},
        {"_id": 0},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return v


@api_router.post("/projects/{project_id}/revert")
async def revert_project(
    project_id: str, req: RevertRequest, user: User = Depends(get_current_user)
):
    """Set the project's active content to a specific version. Non-destructive: does not delete newer versions."""
    proj = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    v = await db.project_versions.find_one(
        {"project_id": project_id, "user_id": user.user_id, "version_id": req.version_id},
        {"_id": 0},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {
            "$set": {
                "name": v["name"] or proj.get("name", ""),
                "description": v.get("description", ""),
                "html": v.get("html", ""),
                "css": v.get("css", ""),
                "js": v.get("js", ""),
                "status": "ready",
                "error": None,
                "current_version_id": req.version_id,
                "updated_at": now,
            }
        },
    )
    updated = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    return updated


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
    await db.project_versions.delete_many(
        {"project_id": project_id, "user_id": user.user_id}
    )
    return {"ok": True}


# ============ Export: ZIP ============
def _build_project_files(project: dict) -> dict:
    """Return dict of filename -> file content (str or bytes) for a deployable static site."""
    name = project.get("name") or "site"
    safe_name = re.sub(r"[^a-zA-Z0-9-]+", "-", name).strip("-").lower() or "site"
    description = project.get("description") or ""
    html_body = project.get("html") or ""
    css = project.get("css") or ""
    js = project.get("js") or ""

    index_html = (
        "<!doctype html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '  <meta charset="utf-8" />\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f'  <meta name="description" content="{description}" />\n'
        f"  <title>{name}</title>\n"
        '  <link rel="stylesheet" href="style.css" />\n'
        "</head>\n"
        "<body>\n"
        f"{html_body}\n"
        '  <script src="script.js"></script>\n'
        "</body>\n"
        "</html>\n"
    )

    readme = (
        f"# {name}\n\n"
        f"{description}\n\n"
        "Generated with **Knowledge-Nexus AI**.\n\n"
        "## Files\n\n"
        "- `index.html` — main page\n"
        "- `style.css` — styles\n"
        "- `script.js` — interactivity\n"
        "- `assets/` — put images / fonts / other static files here\n\n"
        "## Deploy\n\n"
        "This project is ready to deploy on:\n\n"
        "- **GitHub Pages** — push to a repo and enable Pages on the main branch.\n"
        "- **Netlify** — `netlify.toml` is pre-configured. Drag the folder into Netlify or connect the repo.\n"
        "- **Vercel** — `vercel.json` is pre-configured. `vercel --prod` from this directory.\n\n"
        "## Local preview\n\n"
        "Open `index.html` in a browser, or run any static server:\n\n"
        "```bash\n"
        "python3 -m http.server 8080\n"
        "```\n"
    )

    metadata = {
        "name": name,
        "description": description,
        "project_id": project.get("project_id"),
        "prompt": project.get("prompt", ""),
        "generated_at": project.get("created_at"),
        "updated_at": project.get("updated_at"),
        "current_version_id": project.get("current_version_id"),
        "generator": "Knowledge-Nexus AI",
    }

    gitignore = (
        "# OS\n.DS_Store\nThumbs.db\n\n"
        "# Editors\n.vscode/\n.idea/\n\n"
        "# Node/Vercel\nnode_modules/\n.vercel/\n\n"
        "# Netlify\n.netlify/\n"
    )

    netlify_toml = (
        "[build]\n"
        '  publish = "."\n\n'
        "[[headers]]\n"
        '  for = "/*"\n'
        "  [headers.values]\n"
        '    X-Frame-Options = "SAMEORIGIN"\n'
        '    Referrer-Policy = "no-referrer-when-downgrade"\n'
    )

    vercel_json = json.dumps(
        {
            "version": 2,
            "cleanUrls": True,
            "trailingSlash": False,
            "builds": [{"src": "**/*", "use": "@vercel/static"}],
        },
        indent=2,
    )

    assets_readme = (
        "# assets/\n\n"
        "Place images, fonts, videos or other static files here.\n"
        "Reference them from `index.html` or `style.css` with relative paths, e.g. `assets/logo.png`.\n"
    )

    return {
        "index.html": index_html,
        "style.css": css or "/* your styles */\n",
        "script.js": js or "// your JS\n",
        "assets/README.md": assets_readme,
        "README.md": readme,
        "project.json": json.dumps(metadata, indent=2),
        ".gitignore": gitignore,
        "netlify.toml": netlify_toml,
        "vercel.json": vercel_json,
    }, safe_name


@api_router.get("/projects/{project_id}/export.zip")
async def export_project_zip(project_id: str, user: User = Depends(get_current_user)):
    project = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("html"):
        raise HTTPException(status_code=400, detail="Project has no generated content yet")

    files, safe_name = _build_project_files(project)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            data = content.encode("utf-8") if isinstance(content, str) else content
            zf.writestr(path, data)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.zip"',
            "Cache-Control": "no-store",
        },
    )


# ============ Public Share Link ============
def _slug() -> str:
    return secrets.token_hex(6)


@api_router.post("/projects/{project_id}/share")
async def enable_share(project_id: str, user: User = Depends(get_current_user)):
    project = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    slug = project.get("share_slug")
    if not slug:
        # Ensure uniqueness
        for _ in range(5):
            candidate = _slug()
            existing = await db.projects.find_one({"share_slug": candidate})
            if not existing:
                slug = candidate
                break
        if not slug:
            raise HTTPException(status_code=500, detail="Could not allocate slug")

    await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {"$set": {"share_slug": slug, "share_enabled": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"share_enabled": True, "share_slug": slug}


@api_router.post("/projects/{project_id}/share/regenerate")
async def regenerate_share(project_id: str, user: User = Depends(get_current_user)):
    project = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    slug = None
    for _ in range(5):
        candidate = _slug()
        existing = await db.projects.find_one({"share_slug": candidate})
        if not existing:
            slug = candidate
            break
    if not slug:
        raise HTTPException(status_code=500, detail="Could not allocate slug")
    await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {"$set": {"share_slug": slug, "share_enabled": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"share_enabled": True, "share_slug": slug}


@api_router.delete("/projects/{project_id}/share")
async def disable_share(project_id: str, user: User = Depends(get_current_user)):
    result = await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {"$set": {"share_enabled": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"share_enabled": False}


@api_router.get("/public/sites/{slug}", response_class=HTMLResponse)
async def public_site(slug: str):
    """Serve the generated site as a full HTML document. Anonymous — no auth."""
    project = await db.projects.find_one(
        {"share_slug": slug, "share_enabled": True}, {"_id": 0}
    )
    if not project:
        return HTMLResponse(
            "<!doctype html><html><body style='font-family:sans-serif;padding:40px;'>"
            "<h1>Not available</h1><p>This share link is disabled or does not exist.</p></body></html>",
            status_code=404,
        )
    name = project.get("name") or "Preview"
    description = project.get("description") or ""
    html_body = project.get("html") or ""
    css = (project.get("css") or "").replace("</style>", "<\\/style>")
    js = (project.get("js") or "").replace("</script>", "<\\/script>")
    doc = (
        "<!doctype html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '<meta charset="utf-8" />\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f'<meta name="description" content="{description}" />\n'
        f"<title>{name}</title>\n"
        f"<style>{css}</style>\n"
        "</head>\n"
        f"<body>\n{html_body}\n<script>{js}</script>\n</body>\n</html>\n"
    )
    return HTMLResponse(content=doc, headers={"Cache-Control": "no-store"})


@api_router.get("/public/sites/{slug}/meta")
async def public_site_meta(slug: str):
    """Lightweight metadata for the /p/:slug React page (no auth)."""
    project = await db.projects.find_one(
        {"share_slug": slug, "share_enabled": True}, {"_id": 0, "user_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Not available")
    return {
        "name": project.get("name"),
        "description": project.get("description"),
        "share_slug": slug,
    }


# ============ GitHub OAuth + Push ============
def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@api_router.get("/github/status")
async def github_status(user: User = Depends(get_current_user)):
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    configured = bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)
    return {
        "configured": configured,
        "connected": bool(doc and doc.get("github_access_token")),
        "github_username": doc.get("github_username") if doc else None,
    }


@api_router.get("/github/authorize")
async def github_authorize(
    request: Request,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    if not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="GitHub integration not configured on this server")
    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one(
        {
            "state": state,
            "user_id": user.user_id,
            "project_id": project_id,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    redirect_uri = f"{_base_url(request)}/api/github/callback"
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "repo",
        "state": state,
        "allow_signup": "false",
    }
    from urllib.parse import urlencode
    return {"authorize_url": f"https://github.com/login/oauth/authorize?{urlencode(params)}"}


@api_router.get("/github/callback")
async def github_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None):
    frontend_base = _base_url(request)
    if not (code and state):
        return RedirectResponse(f"{frontend_base}/dashboard?github=error&reason=missing_params")
    st = await db.oauth_states.find_one({"state": state}, {"_id": 0})
    if not st:
        return RedirectResponse(f"{frontend_base}/dashboard?github=error&reason=invalid_state")
    await db.oauth_states.delete_one({"state": state})
    user_id = st["user_id"]
    project_id = st.get("project_id")
    redirect_uri = f"{frontend_base}/api/github/callback"

    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        if r.status_code != 200:
            return RedirectResponse(f"{frontend_base}/dashboard?github=error&reason=token_exchange")
        token_data = r.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{frontend_base}/dashboard?github=error&reason=no_token")

        u = await http.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        gh_username = u.json().get("login") if u.status_code == 200 else None

    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "github_access_token": access_token,
                "github_username": gh_username,
                "github_connected_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    dest = f"/builder/{project_id}" if project_id else "/dashboard"
    return RedirectResponse(f"{frontend_base}{dest}?github=connected")


@api_router.post("/github/disconnect")
async def github_disconnect(user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$unset": {"github_access_token": "", "github_username": "", "github_connected_at": ""}},
    )
    return {"ok": True}


@api_router.get("/github/repos")
async def github_repos(user: User = Depends(get_current_user)):
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    token = doc.get("github_access_token") if doc else None
    if not token:
        raise HTTPException(status_code=400, detail="GitHub not connected")
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(
            "https://api.github.com/user/repos",
            params={"per_page": 100, "sort": "updated", "affiliation": "owner"},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="GitHub API error")
        repos = [
            {"name": it["name"], "full_name": it["full_name"], "private": it["private"], "html_url": it["html_url"]}
            for it in r.json()
        ]
    return {"repos": repos, "username": doc.get("github_username")}


@api_router.post("/projects/{project_id}/github")
async def push_to_github(
    project_id: str,
    req: GithubPushRequest,
    user: User = Depends(get_current_user),
):
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    token = doc.get("github_access_token") if doc else None
    username = doc.get("github_username") if doc else None
    if not token or not username:
        raise HTTPException(status_code=400, detail="GitHub not connected")

    project = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("html"):
        raise HTTPException(status_code=400, detail="Project has no generated content yet")

    files, _ = _build_project_files(project)
    repo_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", req.repo_name).strip("-")[:80]
    if not repo_name:
        raise HTTPException(status_code=400, detail="Invalid repo name")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=30.0) as http:
        # Create repo if requested
        if not req.existing:
            r = await http.post(
                "https://api.github.com/user/repos",
                headers=headers,
                json={
                    "name": repo_name,
                    "private": req.private,
                    "description": (project.get("description") or "")[:200],
                    "auto_init": True,
                },
            )
            if r.status_code not in (200, 201):
                detail = r.json().get("message", "Failed to create repo")
                raise HTTPException(status_code=r.status_code, detail=f"GitHub: {detail}")

        # Get default branch
        rp = await http.get(f"https://api.github.com/repos/{username}/{repo_name}", headers=headers)
        if rp.status_code != 200:
            raise HTTPException(status_code=rp.status_code, detail="Could not read target repo")
        default_branch = rp.json().get("default_branch", "main")

        # Upload each file via Contents API
        for path, content in files.items():
            data = content.encode("utf-8") if isinstance(content, str) else content
            b64 = base64.b64encode(data).decode("ascii")
            # Check if file exists to grab sha
            existing_sha = None
            g = await http.get(
                f"https://api.github.com/repos/{username}/{repo_name}/contents/{path}",
                params={"ref": default_branch},
                headers=headers,
            )
            if g.status_code == 200:
                existing_sha = g.json().get("sha")

            body = {
                "message": req.commit_message or "Update from Knowledge-Nexus AI",
                "content": b64,
                "branch": default_branch,
            }
            if existing_sha:
                body["sha"] = existing_sha
            put = await http.put(
                f"https://api.github.com/repos/{username}/{repo_name}/contents/{path}",
                headers=headers,
                json=body,
            )
            if put.status_code not in (200, 201):
                detail = put.json().get("message", "Failed to push file")
                raise HTTPException(status_code=put.status_code, detail=f"GitHub ({path}): {detail}")

    repo_url = f"https://github.com/{username}/{repo_name}"
    await db.projects.update_one(
        {"project_id": project_id, "user_id": user.user_id},
        {"$set": {"github_repo": f"{username}/{repo_name}", "github_repo_url": repo_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "repo": f"{username}/{repo_name}", "html_url": repo_url, "branch": default_branch}


# ============ Email + Password Auth ============
def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


@api_router.post("/auth/register")
async def register(payload: RegisterRequest):
    email = payload.email.lower().strip()
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    total = await db.users.count_documents({})
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id,
        "email": email,
        "name": payload.name or email.split("@")[0],
        "picture": "",
        "password_hash": _hash_password(payload.password),
        "auth_provider": "email",
        "is_admin": total == 0,
        "created_at": now,
    }
    await db.users.insert_one(doc)
    token = _make_jwt(user_id)
    return {
        "token": token,
        "user": {"user_id": user_id, "email": email, "name": doc["name"], "picture": "", "is_admin": doc["is_admin"]},
    }


@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    email = payload.email.lower().strip()
    doc = await db.users.find_one({"email": email})
    if not doc or not doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not _verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = _make_jwt(doc["user_id"])
    return {
        "token": token,
        "user": {
            "user_id": doc["user_id"],
            "email": doc["email"],
            "name": doc.get("name", ""),
            "picture": doc.get("picture", ""),
            "is_admin": doc.get("is_admin", False),
        },
    }


# ============ AI Image Generator (Gemini Nano Banana) ============
async def _run_image_generation(image_id: str, user_id: str, prompt: str):
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"img_{uuid.uuid4().hex[:10]}",
            system_message="You are a professional AI image generator. Produce a single high-quality image based on the prompt.",
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if not images:
            raise ValueError("Model returned no image")
        img = images[0]
        now = datetime.now(timezone.utc).isoformat()
        await db.ai_images.update_one(
            {"image_id": image_id, "user_id": user_id},
            {
                "$set": {
                    "status": "ready",
                    "mime_type": img.get("mime_type", "image/png"),
                    "data_b64": img["data"],
                    "caption": (text or "")[:400],
                    "updated_at": now,
                    "error": None,
                }
            },
        )
    except Exception as e:
        logger.exception("Image generation failed")
        await db.ai_images.update_one(
            {"image_id": image_id, "user_id": user_id},
            {"$set": {"status": "failed", "error": str(e)[:500], "updated_at": datetime.now(timezone.utc).isoformat()}},
        )


@api_router.post("/images/generate")
async def generate_image(req: ImageGenRequest, user: User = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt required")
    image_id = f"img_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_images.insert_one(
        {
            "image_id": image_id,
            "user_id": user.user_id,
            "prompt": req.prompt,
            "status": "generating",
            "data_b64": "",
            "mime_type": "",
            "caption": "",
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    asyncio.create_task(_run_image_generation(image_id, user.user_id, req.prompt))
    return {"image_id": image_id, "status": "generating"}


@api_router.get("/images")
async def list_images(user: User = Depends(get_current_user)):
    cursor = db.ai_images.find(
        {"user_id": user.user_id},
        {"_id": 0, "data_b64": 0},
    ).sort("created_at", -1)
    return await cursor.to_list(200)


@api_router.get("/images/{image_id}")
async def get_image(image_id: str, user: User = Depends(get_current_user)):
    doc = await db.ai_images.find_one({"image_id": image_id, "user_id": user.user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    return doc


@api_router.delete("/images/{image_id}")
async def delete_image(image_id: str, user: User = Depends(get_current_user)):
    res = await db.ai_images.delete_one({"image_id": image_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


# ============ Documents ============
def _extract_text_pdf(data: bytes) -> tuple[List[str], int]:
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = []
    for p in reader.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception:
            pages.append("")
    return pages, len(pages)


def _extract_text_docx(data: bytes) -> tuple[List[str], int]:
    import docx
    d = docx.Document(io.BytesIO(data))
    text = "\n".join(p.text for p in d.paragraphs if p.text)
    return [text], 1


def _extract_text_txt(data: bytes) -> tuple[List[str], int]:
    text = data.decode("utf-8", errors="replace")
    return [text], 1


MAX_DOC_SIZE = 15 * 1024 * 1024  # 15 MB


@api_router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_DOC_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
    name = file.filename or "document"
    ext = (name.rsplit(".", 1)[-1] or "").lower()
    if ext == "pdf":
        pages, count = _extract_text_pdf(data)
        mime = "application/pdf"
    elif ext == "docx":
        pages, count = _extract_text_docx(data)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext == "txt":
        pages, count = _extract_text_txt(data)
        mime = "text/plain"
    else:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT are supported")

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    await db.documents.insert_one(
        {
            "doc_id": doc_id,
            "user_id": user.user_id,
            "name": name,
            "mime": mime,
            "size": len(data),
            "page_count": count,
            "pages": pages,
            "created_at": now,
        }
    )
    return {"doc_id": doc_id, "name": name, "mime": mime, "size": len(data), "page_count": count}


@api_router.get("/documents")
async def list_documents(user: User = Depends(get_current_user)):
    cursor = db.documents.find(
        {"user_id": user.user_id},
        {"_id": 0, "pages": 0},
    ).sort("created_at", -1)
    return await cursor.to_list(200)


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: User = Depends(get_current_user)):
    res = await db.documents.delete_one({"doc_id": doc_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


# ============ Chats ============
CHAT_SYSTEM_PROMPT = """You are a helpful, concise AI assistant. Format answers in Markdown when useful. If DOCUMENTS are provided, ground your answer in them and cite sources inline in the format [source: <doc_name>, page: <n>]. If the answer is not in the documents, say so."""


def _build_docs_context(docs: List[dict], max_chars: int = 60000) -> str:
    if not docs:
        return ""
    lines = ["--- DOCUMENTS ---"]
    used = 0
    for d in docs:
        pages = d.get("pages", []) or []
        header = f"\n### DOCUMENT: {d['name']} (pages: {d.get('page_count', len(pages))})\n"
        if used + len(header) > max_chars:
            break
        lines.append(header)
        used += len(header)
        for i, p in enumerate(pages, 1):
            block = f"\n[page {i}]\n{p}\n"
            if used + len(block) > max_chars:
                lines.append(f"\n[…truncated, {len(pages) - i + 1} pages omitted…]")
                break
            lines.append(block)
            used += len(block)
    lines.append("\n--- END DOCUMENTS ---")
    return "".join(lines)


@api_router.post("/chats")
async def create_chat(payload: ChatCreateRequest, user: User = Depends(get_current_user)):
    chat_id = f"chat_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "chat_id": chat_id,
        "user_id": user.user_id,
        "title": (payload.title or "New chat")[:120],
        "share_slug": None,
        "share_enabled": False,
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }
    await db.chats.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/chats")
async def list_chats(
    q: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    filter_ = {"user_id": user.user_id}
    if q:
        filter_["title"] = {"$regex": re.escape(q), "$options": "i"}
    cursor = db.chats.find(filter_, {"_id": 0}).sort("updated_at", -1)
    return await cursor.to_list(200)


@api_router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: User = Depends(get_current_user)):
    chat = await db.chats.find_one({"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msgs = await db.chat_messages.find(
        {"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return {"chat": chat, "messages": msgs}


@api_router.patch("/chats/{chat_id}")
async def rename_chat(chat_id: str, payload: ChatUpdateRequest, user: User = Depends(get_current_user)):
    res = await db.chats.update_one(
        {"chat_id": chat_id, "user_id": user.user_id},
        {"$set": {"title": payload.title[:120], "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"ok": True}


@api_router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: User = Depends(get_current_user)):
    res = await db.chats.delete_one({"chat_id": chat_id, "user_id": user.user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.chat_messages.delete_many({"chat_id": chat_id, "user_id": user.user_id})
    return {"ok": True}


@api_router.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str, payload: SendMessageRequest, user: User = Depends(get_current_user)
):
    chat = await db.chats.find_one({"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    now = datetime.now(timezone.utc).isoformat()
    user_msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "chat_id": chat_id,
        "user_id": user.user_id,
        "role": "user",
        "content": payload.content,
        "doc_ids": payload.doc_ids or [],
        "created_at": now,
    }
    await db.chat_messages.insert_one(user_msg)

    # Load docs
    docs: List[dict] = []
    if payload.doc_ids:
        cursor = db.documents.find(
            {"user_id": user.user_id, "doc_id": {"$in": payload.doc_ids}}, {"_id": 0}
        )
        docs = await cursor.to_list(20)

    # Build LLM chat with prior history
    history = await db.chat_messages.find(
        {"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    session_id = f"chat_{chat_id}"

    # Compose one user message that includes prior turns + docs context
    context_lines = []
    if docs:
        context_lines.append(_build_docs_context(docs))
    if len(history) > 1:  # prior turns exist (excluding just-inserted user msg)
        context_lines.append("\n--- PRIOR CONVERSATION ---")
        for m in history[:-1][-12:]:
            role = m["role"].upper()
            context_lines.append(f"\n{role}: {m['content']}")
        context_lines.append("\n--- END PRIOR CONVERSATION ---\n")
    context_lines.append(f"\nUSER: {payload.content}")
    prompt_text = "".join(context_lines)

    # Select model with fallback to default
    requested_model = (payload.model or DEFAULT_CHAT_MODEL).strip()
    if requested_model not in CHAT_MODELS:
        requested_model = DEFAULT_CHAT_MODEL
    provider = CHAT_MODELS[requested_model]["provider"]

    try:
        if provider == "gemini":
            if not GEMINI_API_KEY:
                await db.chat_messages.delete_one({"message_id": user_msg["message_id"]})
                raise HTTPException(status_code=503, detail="Gemini not configured — set GEMINI_API_KEY on the server")
            from google import genai as _genai
            gclient = _genai.Client(api_key=GEMINI_API_KEY)
            gresp = await asyncio.to_thread(
                gclient.models.generate_content,
                model=requested_model,
                contents=f"{CHAT_SYSTEM_PROMPT}\n\n{prompt_text}",
            )
            answer = getattr(gresp, "text", None) or ""
        else:
            llm = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=session_id,
                system_message=CHAT_SYSTEM_PROMPT,
            ).with_model("openai", "gpt-5.2")
            answer = await llm.send_message(UserMessage(text=prompt_text))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Chat send failed")
        await db.chat_messages.delete_one({"message_id": user_msg["message_id"]})
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)[:200]}")
    if not isinstance(answer, str):
        answer = str(answer)

    assistant_msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "chat_id": chat_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": answer,
        "doc_ids": payload.doc_ids or [],
        "model": requested_model,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(assistant_msg)

    # Auto-title on first turn
    new_title = chat.get("title")
    if chat.get("message_count", 0) == 0 and (not new_title or new_title == "New chat"):
        new_title = payload.content.strip().split("\n")[0][:60] or "New chat"

    await db.chats.update_one(
        {"chat_id": chat_id, "user_id": user.user_id},
        {
            "$set": {"updated_at": assistant_msg["created_at"], "title": new_title},
            "$inc": {"message_count": 2},
        },
    )

    user_msg.pop("_id", None)
    assistant_msg.pop("_id", None)
    return {"user_message": user_msg, "assistant_message": assistant_msg, "title": new_title}


# ============ Chat share ============
@api_router.post("/chats/{chat_id}/share")
async def enable_chat_share(chat_id: str, user: User = Depends(get_current_user)):
    chat = await db.chats.find_one({"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    slug = chat.get("share_slug")
    if not slug:
        for _ in range(5):
            candidate = _slug()
            if not await db.chats.find_one({"share_slug": candidate}):
                slug = candidate
                break
    await db.chats.update_one(
        {"chat_id": chat_id, "user_id": user.user_id},
        {"$set": {"share_slug": slug, "share_enabled": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"share_enabled": True, "share_slug": slug}


@api_router.delete("/chats/{chat_id}/share")
async def disable_chat_share(chat_id: str, user: User = Depends(get_current_user)):
    res = await db.chats.update_one(
        {"chat_id": chat_id, "user_id": user.user_id},
        {"$set": {"share_enabled": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"share_enabled": False}


@api_router.get("/public/chats/{slug}")
async def public_chat(slug: str):
    chat = await db.chats.find_one({"share_slug": slug, "share_enabled": True}, {"_id": 0, "user_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Not available")
    msgs = await db.chat_messages.find(
        {"chat_id": chat["chat_id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", 1).to_list(500)
    return {"chat": chat, "messages": msgs}


# ============ Chat export ============
def _chat_to_text(chat: dict, messages: List[dict]) -> str:
    lines = [f"# {chat.get('title', 'Chat')}", ""]
    for m in messages:
        role = "You" if m["role"] == "user" else "AI"
        lines.append(f"[{m['created_at']}] {role}:")
        lines.append(m["content"])
        lines.append("")
    lines.append("---")
    lines.append("Exported from Knowledge-Nexus AI")
    return "\n".join(lines)


@api_router.get("/chats/{chat_id}/export.txt")
async def export_chat_txt(chat_id: str, user: User = Depends(get_current_user)):
    chat = await db.chats.find_one({"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msgs = await db.chat_messages.find(
        {"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    text = _chat_to_text(chat, msgs)
    safe_name = re.sub(r"[^a-z0-9-]+", "-", chat["title"].lower()).strip("-") or "chat"
    return PlainTextResponse(
        content=text,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.txt"'},
    )


@api_router.get("/chats/{chat_id}/export.pdf")
async def export_chat_pdf(chat_id: str, user: User = Depends(get_current_user)):
    chat = await db.chats.find_one({"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    msgs = await db.chat_messages.find(
        {"chat_id": chat_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)

    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.7 * inch, bottomMargin=0.7 * inch, leftMargin=0.8 * inch, rightMargin=0.8 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=20, textColor=HexColor("#7c3aed"))
    user_style = ParagraphStyle("user", parent=styles["BodyText"], textColor=HexColor("#0369a1"), spaceBefore=10)
    ai_style = ParagraphStyle("ai", parent=styles["BodyText"], textColor=HexColor("#111827"), spaceBefore=4)
    meta_style = ParagraphStyle("meta", parent=styles["BodyText"], fontSize=8, textColor=HexColor("#6b7280"))

    story = [Paragraph(chat.get("title", "Chat"), title_style), Spacer(1, 0.15 * inch)]
    for m in msgs:
        who = "You" if m["role"] == "user" else "AI"
        story.append(Paragraph(f"<b>{who}</b> · <font color='#6b7280'>{m['created_at']}</font>", meta_style))
        # Escape HTML-ish content for reportlab
        safe = (
            m["content"]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )
        story.append(Paragraph(safe, user_style if m["role"] == "user" else ai_style))
        story.append(Spacer(1, 0.08 * inch))

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("<i>Exported from Knowledge-Nexus AI</i>", meta_style))
    doc.build(story)
    buf.seek(0)
    safe_name = re.sub(r"[^a-z0-9-]+", "-", chat["title"].lower()).strip("-") or "chat"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )


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
