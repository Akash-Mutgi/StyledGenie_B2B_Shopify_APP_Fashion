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

backend_root = Path(__file__).resolve().parent.parent
repo_root = backend_root.parent
merchant_dashboard_dir = backend_root / "merchant-dashboard"
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

app.mount("/static", StaticFiles(directory=backend_root / "static"), name="static")

@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/merchant-dashboard/")
