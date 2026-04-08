# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

StyledGenie B2B Intelligence System MVP — an AI-powered fashion styling assistant for Shopify stores. Three services:

| Service | Port | Description |
|---|---|---|
| FastAPI Backend | 8000 | Core Python API (`backend/app/main.py`) |
| Storefront Widget | 3000 | Static HTML/JS customer chat widget (`apps/storefront-widget/`) |
| Merchant Dashboard | 3001 | Static HTML/JS merchant panel (`apps/merchant-dashboard/`) |

### Running services

```bash
# Backend (from /workspace/backend)
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Storefront widget (from /workspace/apps/storefront-widget)
python3 -m http.server 3000

# Merchant dashboard (from /workspace/apps/merchant-dashboard)
python3 -m http.server 3001
```

### Key caveats

- The backend starts and works **without** any external API keys. It has built-in mock/fallback data for all services (Supabase, OpenAI, Google Vision, Shopify). Features activate progressively as keys are added to `.env`.
- Copy `.env.example` to `.env` before starting the backend. The backend uses `python-dotenv` to load it.
- The `supabase` package is imported with `try/except`; it is **not** in `requirements.txt` (only in `requirements-optional.txt`). The backend runs fine without it.
- Frontends are plain static HTML/CSS/JS — no build step, no npm. They call the backend at `http://127.0.0.1:8000`.
- There are no automated tests in the codebase. `tests/manual-qa-checklist.md` has the QA checklist.
- There is no linter config. The codebase uses no `pyproject.toml`, `setup.py`, or similar. Standard Python linting tools (e.g. `ruff`, `flake8`) can be run ad-hoc against `backend/`.
- The venv must be created with `python3 -m venv .venv` inside `backend/`. The system may need `python3.12-venv` installed (`sudo apt-get install -y python3.12-venv`).
- FastAPI auto-generates OpenAPI docs at `http://localhost:8000/docs`.
