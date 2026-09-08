from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CatalogImportRequest,
    CatalogImportResponse,
    CatalogProductDetail,
    CatalogProductListResponse,
)
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService


router = APIRouter(tags=["catalog"])
shopify_service = ShopifyService()
supabase_service = SupabaseService()


def _build_catalog_product_detail(product: dict, source: str) -> CatalogProductDetail:
    return CatalogProductDetail(
        id=product.get("id"),
        shopify_product_id=product.get("shopify_product_id") or "",
        shopify_legacy_id=product.get("shopify_legacy_id"),
        title=product.get("title") or "Untitled product",
        category=product.get("category") or "General",
        description=product.get("description"),
        price=str(product.get("price")) if product.get("price") is not None else None,
        image_url=product.get("image_url"),
        image_urls=product.get("image_urls") or ([product.get("image_url")] if product.get("image_url") else []),
        product_url=product.get("product_url"),
        handle=product.get("handle"),
        shopify_variant_id=product.get("shopify_variant_id"),
        sku=product.get("sku"),
        available_for_sale=product.get("available_for_sale"),
        inventory_quantity=product.get("inventory_quantity"),
        inventory_policy=product.get("inventory_policy"),
        inventory_tracked=product.get("inventory_tracked"),
        segment=product.get("segment"),
        tags=product.get("tags") or [],
        metafields=product.get("metafields") or {},
        source=source,
    )


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
def list_catalog_products(limit: int = 0) -> CatalogProductListResponse:
    return CatalogProductListResponse(items=supabase_service.fetch_catalog_product_options(limit=limit))


@router.get("/api/catalog/products/shopify/{legacy_product_id}", response_model=CatalogProductDetail)
def get_shopify_product_detail(legacy_product_id: str) -> CatalogProductDetail:
    synced_product = supabase_service.fetch_catalog_product_by_shopify_legacy_id(legacy_product_id)
    if synced_product:
        return _build_catalog_product_detail(synced_product, source="synced_catalog")

    try:
        live_product = shopify_service.fetch_product_by_legacy_id(legacy_product_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not live_product:
        raise HTTPException(status_code=404, detail="Product not found in Shopify.")

    return _build_catalog_product_detail(live_product, source="shopify_live")
