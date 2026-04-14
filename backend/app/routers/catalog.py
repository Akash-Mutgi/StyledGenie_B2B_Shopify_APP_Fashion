from fastapi import APIRouter, HTTPException

from app.models.schemas import CatalogImportRequest, CatalogImportResponse, CatalogProductListResponse
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService


router = APIRouter(tags=["catalog"])
shopify_service = ShopifyService()
supabase_service = SupabaseService()


@router.post("/api/catalog/import", response_model=CatalogImportResponse)
def import_catalog(payload: CatalogImportRequest) -> CatalogImportResponse:
    try:
        sync_result = shopify_service.import_catalog(payload.store_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return CatalogImportResponse(
        message="Store sync finished.",
        imported_count=sync_result.get("imported_count", 0),
        orders_imported=sync_result.get("orders_imported", 0),
        orders_scope_ready=sync_result.get("orders_scope_ready", False),
    )


@router.get("/api/catalog/products", response_model=CatalogProductListResponse)
def list_catalog_products() -> CatalogProductListResponse:
    return CatalogProductListResponse(items=supabase_service.fetch_catalog_product_options())
