from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers.analytics import router as analytics_router
from app.routers.catalog import router as catalog_router
from app.routers.chat import router as chat_router
from app.routers.health import router as health_router
from app.routers.merchant import router as merchant_router
from app.routers.support import router as support_router


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Starter API for the StyledGenie B2B Intelligence System MVP.",
)

repo_root = Path(__file__).resolve().parents[2]
merchant_dashboard_dir = repo_root / "apps" / "merchant-dashboard"
storefront_widget_dir = repo_root / "apps" / "storefront-widget"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(support_router)
app.include_router(analytics_router)
app.include_router(catalog_router)
app.include_router(merchant_router)

if merchant_dashboard_dir.exists():
    app.mount("/merchant-dashboard", StaticFiles(directory=merchant_dashboard_dir, html=True), name="merchant-dashboard")

if storefront_widget_dir.exists():
    app.mount("/storefront-widget-demo", StaticFiles(directory=storefront_widget_dir, html=True), name="storefront-widget-demo")

app.mount("/static", StaticFiles(directory=Path(__file__).resolve().parent.parent / "static"), name="static")

@app.get("/debug-paths", include_in_schema=False)
async def debug_paths():
    import os
    return {
        "repo_root": str(repo_root),
        "merchant_dashboard_dir": str(merchant_dashboard_dir),
        "exists": merchant_dashboard_dir.exists(),
        "cwd": os.getcwd(),
        "listdir_repo": os.listdir(repo_root) if repo_root.exists() else "repo_root missing",
    }

@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/merchant-dashboard/")
