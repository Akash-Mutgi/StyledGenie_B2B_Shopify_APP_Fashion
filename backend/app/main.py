import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers.analytics import router as analytics_router
from app.routers.catalog import router as catalog_router
from app.routers.chat import router as chat_router
from app.routers.customer_profiles import router as customer_profiles_router
from app.routers.health import router as health_router
from app.routers.merchant import router as merchant_router
from app.routers.support import router as support_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Starter API for the StyledGenie B2B Intelligence System MVP.",
)

repo_root = Path(__file__).resolve().parents[2]
merchant_dashboard_dir = repo_root / "apps" / "merchant-dashboard"
storefront_widget_dir = repo_root / "apps" / "storefront-widget"
my_style_camera_dir = repo_root / "apps" / "my-style-camera"
my_style_camera_index = my_style_camera_dir / "index.html"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_dashboard_caching(request: Request, call_next):
    response = await call_next(request)

    if (
        request.url.path == "/"
        or request.url.path.startswith("/merchant-dashboard")
        or request.url.path.startswith("/storefront-widget-demo")
        or request.url.path.startswith("/my-style-camera")
    ):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    if request.url.path.startswith("/my-style-camera") and response.status_code >= 400:
        logger.warning("My Style camera route returned %s for %s", response.status_code, request.url.path)

    return response

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(support_router)
app.include_router(analytics_router)
app.include_router(catalog_router)
app.include_router(merchant_router)
app.include_router(customer_profiles_router)

if merchant_dashboard_dir.exists():
    app.mount("/merchant-dashboard", StaticFiles(directory=merchant_dashboard_dir, html=True), name="merchant-dashboard")

if storefront_widget_dir.exists():
    app.mount("/storefront-widget-demo", StaticFiles(directory=storefront_widget_dir, html=True), name="storefront-widget-demo")

@app.get("/my-style-camera", include_in_schema=False)
@app.get("/my-style-camera/", include_in_schema=False)
def my_style_camera_page() -> FileResponse:
    if not my_style_camera_index.exists():
        return FileResponse((merchant_dashboard_dir / "index.html"))
    return FileResponse(my_style_camera_index)


if my_style_camera_dir.exists():
    app.mount("/my-style-camera", StaticFiles(directory=my_style_camera_dir, html=True), name="my-style-camera")


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/merchant-dashboard/index.html?v=20260413a")
