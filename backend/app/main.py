from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
