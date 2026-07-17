# Knowledge-Nexus AI — PRD

## Problem Statement
Production-ready AI Website Builder ("Knowledge-Nexus AI") MVP. React + FastAPI + MongoDB, Emergent Universal LLM key (GPT-5.2), Emergent-managed Google Auth, dark/light modes, glassmorphism SaaS design.

## User Personas
- **Solo founder / marketer**: needs a launch-ready website without coding.
- **Designer / freelancer**: rapid prototyping of niche sites for clients.
- **Student / hobbyist**: creates a portfolio or event site in minutes.

## Core Requirements (static)
1. Premium landing page: hero, features, CTA, footer, Google login.
2. Emergent Google Auth with secure httpOnly cookie sessions.
3. Dashboard: New Project, My Projects, History, Profile.
4. AI website generator (GPT-5.2) — multi-section site (Home, About, Services, Contact) + nav + footer.
5. Live in-app preview + Copy/Download HTML/CSS/JS.
6. Dark mode default, light mode toggle, fully responsive.

## What's Implemented (Feb 2026)
- Backend `/api/auth/session`, `/api/auth/me`, `/api/auth/logout`
- Backend `/api/projects/generate`, `/api/projects` list, `/api/projects/{id}` get/delete
- LLM: emergentintegrations + GPT-5.2 (openai)
- Frontend routes: `/`, `/dashboard`, `/builder/:id`, OAuth hash callback handler
- Live preview via sandboxed `<iframe srcDoc>`
- Copy/download per file + full HTML download
- Sonner toasts, shadcn UI (Dialog, Tabs, DropdownMenu, Card, Button, Textarea)

## Prioritized Backlog
### P0 (remaining)
- End-to-end testing (auth + generation + preview + code export)

### P1
- Streaming generation progress to UI (SSE)
- Regenerate with diff/version history
- Public share link for generated sites

### P2
- Custom domains
- Team workspaces
- Image asset library (fal.ai / nano-banana integration)

## Next Tasks
1. Run testing subagent for backend + frontend.
2. Fix issues surfaced by tests.
3. Deliver first finish summary.
