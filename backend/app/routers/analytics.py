from fastapi import APIRouter, Depends

from app.models.schemas import AnalyticsOverview, MerchantDashboardSnapshot
from app.services.supabase_service import SupabaseService

from app.services.support_guard import require_admin_token

router = APIRouter(tags=["analytics"], dependencies=[Depends(require_admin_token)])
supabase_service = SupabaseService()


@router.get("/api/analytics/overview", response_model=AnalyticsOverview)
def analytics_overview() -> AnalyticsOverview:
    return supabase_service.fetch_dashboard_snapshot().overview


@router.get("/api/analytics/dashboard", response_model=MerchantDashboardSnapshot)
def analytics_dashboard() -> MerchantDashboardSnapshot:
    return supabase_service.fetch_dashboard_snapshot()
