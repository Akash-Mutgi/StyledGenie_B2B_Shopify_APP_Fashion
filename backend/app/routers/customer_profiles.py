from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from app.config import build_customer_account_profile_url
from app.models.schemas import (
    ChatSelectProfileRequest,
    CreateStyleProfileRequest,
    CreateStyleProfileResponse,
    CustomerStyleProfilesRequest,
    CustomerStyleProfilesResponse,
    ProfileImageAnalysisRequest,
    ProfileImageAnalysisResponse,
    ProfileImageAnalysisResult,
    ProfileScanHandoffPayload,
    ProfileScanHandoffResponse,
    ProfileScanHandoffStoreRequest,
    ProfileImageValidationRequest,
    ProfileImageValidationResponse,
    SetActiveStyleProfileRequest,
    SetActiveStyleProfileResponse,
    StyleProfile,
    StyleProfileAnalysis,
    StyleProfileFeatures,
    StyleProfileImageValidation,
    StyleProfileSizes,
    StyleProfileSource,
    StyleProfileScanRequest,
    StyleProfileScanResponse,
    StyleProfileVibe,
)
from app.services.conversation_service import ConversationService
from app.services.openai_service import OpenAIService
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionService


router = APIRouter(tags=["customer-style-profiles"])
supabase_service = SupabaseService()
vision_service = VisionService()
openai_service = OpenAIService()
conversation_service = ConversationService()
SCAN_HANDOFF_TTL_MINUTES = 20
_pending_scan_handoffs: dict[str, tuple[datetime, ProfileScanHandoffStoreRequest]] = {}


def _scan_handoff_key(
    customer_id: Optional[str],
    customer_email: Optional[str],
    session_id: Optional[str],
) -> str:
    normalized_customer_id = str(customer_id or "").strip()
    if normalized_customer_id:
        return f"customer:{normalized_customer_id}"

    normalized_customer_email = str(customer_email or "").strip().lower()
    if normalized_customer_email:
        return f"email:{normalized_customer_email}"

    normalized_session_id = str(session_id or "").strip()
    if normalized_session_id:
        return f"session:{normalized_session_id}"

    return ""


def _prune_expired_scan_handoffs() -> None:
    now = datetime.now(timezone.utc)
    expiry_cutoff = now - timedelta(minutes=SCAN_HANDOFF_TTL_MINUTES)
    expired_keys = [key for key, (timestamp, _payload) in _pending_scan_handoffs.items() if timestamp < expiry_cutoff]
    for key in expired_keys:
        _pending_scan_handoffs.pop(key, None)

def _budget_key_from_range(min_budget: Optional[float], max_budget: Optional[float]) -> Optional[str]:
    if min_budget is None and max_budget is None:
        return None
    if max_budget is not None and max_budget <= 50:
        return "under_50"
    if min_budget is not None and max_budget is not None and min_budget >= 50 and max_budget <= 100:
        return "50_100"
    if min_budget is not None and max_budget is not None and min_budget >= 100 and max_budget <= 200:
        return "100_200"
    if min_budget is not None and min_budget >= 200:
        return "200_plus"
    return None


def _dedupe_text_list(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        normalized = str(value or "").strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _validate_style_profile(profile: StyleProfile, *, require_image_validation: bool = False) -> None:
    if not str(profile.name or "").strip():
        raise HTTPException(status_code=400, detail="Each saved style profile needs a profile name.")
    if not str(profile.shoppingCategoryPreference or "").strip():
        raise HTTPException(status_code=400, detail="Each saved style profile needs a shopping category preference.")
    if not str(profile.sizes.top or "").strip():
        raise HTTPException(status_code=400, detail="Each saved style profile needs a top size.")
    if not str(profile.sizes.bottom or "").strip():
        raise HTTPException(status_code=400, detail="Each saved style profile needs a bottom size.")
    if not str(profile.sizes.shoeEu or "").strip():
        raise HTTPException(status_code=400, detail="Each saved style profile needs a shoe size.")
    if not profile.favoriteColorPalette:
        raise HTTPException(status_code=400, detail="Add at least one favorite color palette cue before saving.")
    if not profile.fabricAllergies:
        raise HTTPException(status_code=400, detail="Add any fabric allergies or choose None before saving.")
    if not (profile.minBudget or profile.maxBudget or str(profile.budget or "").strip()):
        raise HTTPException(status_code=400, detail="Add a budget range before saving.")
    if require_image_validation:
        attempted_validation = bool(
            profile.imageValidation
            and (
                profile.imageValidation.ok
                or profile.imageValidation.guidance
                or profile.imageValidation.qualityWarnings
            )
        )
        if not attempted_validation:
            raise HTTPException(
                status_code=400,
                detail="Add a full body scan or upload, then review the image guidance before saving.",
            )


def _build_style_analysis_payload(payload: CreateStyleProfileRequest) -> StyleProfileAnalysis:
    tags = [
        payload.shoppingCategoryPreference,
        *(payload.favoriteColorPalette or []),
        *(payload.preferredFits or []),
        *(payload.preferredOccasions or []),
    ]
    summary_parts = [
        f"Primary category: {payload.shoppingCategoryPreference.replace('_', ' ')}.",
        f"Preferred palette: {', '.join(payload.favoriteColorPalette[:3])}." if payload.favoriteColorPalette else "",
        payload.styleNotes or "",
        (
            f"Budget guide: EUR{int(payload.minBudget)}-EUR{int(payload.maxBudget)}."
            if payload.minBudget and payload.maxBudget
            else ""
        ),
    ]
    return StyleProfileAnalysis(
        summary=" ".join(part for part in summary_parts if part).strip(),
        tags=[str(item).strip() for item in tags if str(item).strip()][:8],
    )


def _build_style_profile_from_create_payload(
    payload: CreateStyleProfileRequest,
    *,
    is_primary: bool,
) -> StyleProfile:
    source_method = str(payload.sourceMethod or "").strip().lower() or "upload"
    return StyleProfile(
        id=f"profile-{uuid4()}",
        isPrimary=is_primary,
        name=str(payload.profileName or "").strip(),
        relationship="self" if is_primary else "other",
        shoppingCategoryPreference=str(payload.shoppingCategoryPreference or "").strip().lower(),
        gender=str(payload.gender or "").strip(),
        sizes=StyleProfileSizes(
            top=str(payload.topSize or "").strip(),
            bottom=str(payload.bottomSize or "").strip(),
            shoeEu=str(payload.shoeSize or "").strip(),
        ),
        features=StyleProfileFeatures(
            bodyType=str(payload.bodyType or "").strip() or None,
            skinTone=str(payload.skinTone or "").strip() or None,
            hairColor=str(payload.hairColor or "").strip() or None,
            eyeColor=str(payload.eyeColor or "").strip() or None,
        ),
        vibe=StyleProfileVibe(styleDescription=str(payload.styleNotes or "").strip() or None),
        styleAnalysis=_build_style_analysis_payload(payload),
        favoriteColorPalette=[str(item).strip() for item in (payload.favoriteColorPalette or []) if str(item).strip()],
        fabricAllergies=[str(item).strip() for item in (payload.fabricAllergies or []) if str(item).strip()],
        styleNotes=str(payload.styleNotes or "").strip() or None,
        preferredFits=[str(item).strip() for item in (payload.preferredFits or []) if str(item).strip()],
        preferredOccasions=[str(item).strip() for item in (payload.preferredOccasions or []) if str(item).strip()],
        dislikedColors=[str(item).strip() for item in (payload.dislikedColors or []) if str(item).strip()],
        dislikedFabrics=[str(item).strip() for item in (payload.dislikedFabrics or []) if str(item).strip()],
        budget=_budget_key_from_range(payload.minBudget, payload.maxBudget),
        minBudget=payload.minBudget,
        maxBudget=payload.maxBudget,
        source=StyleProfileSource(
            method=source_method,
            sourceImageUrl=str(payload.sourceImageUrl or "").strip() or None,
        ),
        imageValidation=payload.imageValidation or StyleProfileImageValidation(),
    )


@router.get("/api/customer/style-profiles", response_model=CustomerStyleProfilesResponse)
def get_customer_style_profiles(
    customer_id: Optional[str] = Query(default=None, min_length=1),
    customer_email: Optional[str] = None,
    account_display_name: Optional[str] = None,
) -> CustomerStyleProfilesResponse:
    if not customer_id and not customer_email:
        raise HTTPException(status_code=400, detail="Customer ID or customer email is required.")

    return supabase_service.fetch_customer_style_profiles(
        customer_identifier=customer_id,
        customer_email=customer_email,
        account_display_name=account_display_name,
    )


@router.get("/api/customer/account-profile-url")
def get_customer_account_profile_url() -> dict:
    profile_url = build_customer_account_profile_url()
    if not profile_url:
        raise HTTPException(status_code=404, detail="Customer account profile URL is not configured.")
    return {"ok": True, "profileUrl": profile_url}


@router.post("/api/profiles/scan-handoff", response_model=ProfileScanHandoffResponse)
def store_profile_scan_handoff(payload: ProfileScanHandoffStoreRequest) -> ProfileScanHandoffResponse:
    _prune_expired_scan_handoffs()
    key = _scan_handoff_key(payload.customerId, payload.customerEmail, payload.sessionId)
    if not key:
        raise HTTPException(status_code=400, detail="Customer ID, customer email, or session ID is required.")

    _pending_scan_handoffs[key] = (datetime.now(timezone.utc), payload)
    return ProfileScanHandoffResponse(
        ok=True,
        hasPending=True,
        sessionId=payload.sessionId,
        scanPayload=payload.scanPayload,
    )


@router.get("/api/profiles/scan-handoff", response_model=ProfileScanHandoffResponse)
def consume_profile_scan_handoff(
    customer_id: Optional[str] = Query(default=None),
    customer_email: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    allow_fallback: bool = Query(default=False),
) -> ProfileScanHandoffResponse:
    _prune_expired_scan_handoffs()
    key = _scan_handoff_key(customer_id, customer_email, session_id)
    pending = _pending_scan_handoffs.pop(key, None) if key else None
    if not pending and allow_fallback and _pending_scan_handoffs:
        latest_key, latest_value = max(
            _pending_scan_handoffs.items(),
            key=lambda item: item[1][0],
        )
        _pending_scan_handoffs.pop(latest_key, None)
        pending = latest_value
    if not key and not allow_fallback:
        raise HTTPException(status_code=400, detail="Customer ID, customer email, or session ID is required.")
    if not pending:
        return ProfileScanHandoffResponse(ok=True, hasPending=False)

    _timestamp, payload = pending
    return ProfileScanHandoffResponse(
        ok=True,
        hasPending=True,
        sessionId=payload.sessionId,
        scanPayload=ProfileScanHandoffPayload(
            method=str(payload.scanPayload.method or "camera").strip().lower() or "camera",
            imageName=payload.scanPayload.imageName,
            imageValidation=payload.scanPayload.imageValidation,
            analysisResult=payload.scanPayload.analysisResult,
        ),
    )


@router.put("/api/customer/style-profiles", response_model=CustomerStyleProfilesResponse)
def save_customer_style_profiles(payload: CustomerStyleProfilesRequest) -> CustomerStyleProfilesResponse:
    if not str(payload.customerId or "").strip() and not str(payload.customerEmail or "").strip():
        raise HTTPException(status_code=400, detail="Customer ID or customer email is required.")

    primary_count = sum(1 for profile in payload.profiles if profile.isPrimary)
    if primary_count > 1:
        raise HTTPException(status_code=400, detail="Only one primary style profile can be saved at a time.")

    for profile in payload.profiles:
        if not str(profile.name or "").strip():
            raise HTTPException(status_code=400, detail="Each saved style profile needs a profile name.")

    return supabase_service.save_customer_style_profiles(payload)


@router.post("/api/profiles/validate-image", response_model=ProfileImageValidationResponse)
def validate_profile_image(payload: ProfileImageValidationRequest) -> ProfileImageValidationResponse:
    image_reference = payload.imageUrl or payload.imageName
    if not image_reference:
        raise HTTPException(status_code=400, detail="An image is required for validation.")

    validation = vision_service.validate_profile_setup_image(
        image_reference=image_reference,
        image_content_base64=payload.imageContentBase64,
        image_mime_type=payload.imageMimeType,
    )
    return ProfileImageValidationResponse(ok=validation.ok, result=validation)


@router.post("/api/profiles/analyze-image", response_model=ProfileImageAnalysisResponse)
def analyze_profile_image(payload: ProfileImageAnalysisRequest) -> ProfileImageAnalysisResponse:
    image_reference = payload.imageUrl or payload.imageName
    if not image_reference:
        raise HTTPException(status_code=400, detail="An image is required for analysis.")

    validation = vision_service.validate_profile_setup_image(
        image_reference=image_reference,
        image_content_base64=payload.imageContentBase64,
        image_mime_type=payload.imageMimeType,
    )
    vision_analysis = vision_service.analyze_image(
        image_reference=image_reference,
        image_content_base64=payload.imageContentBase64,
        image_mime_type=payload.imageMimeType,
    )
    scan_response = openai_service.analyze_style_profile_scan(
        vision_analysis=vision_analysis,
        draft_profile=payload.draftProfile,
    )
    suggestion = scan_response.suggestion if scan_response else None

    guidance = _dedupe_text_list(
        [
            *(validation.guidance or []),
            *(suggestion.observationLines if suggestion else []),
            suggestion.qualityNote if suggestion else "",
            scan_response.message if scan_response else "",
        ]
    )

    return ProfileImageAnalysisResponse(
        ok=True,
        result=ProfileImageAnalysisResult(
            hairColor=(suggestion.features.hairColor if suggestion and suggestion.features else None),
            eyeColor=(suggestion.features.eyeColor if suggestion and suggestion.features else None),
            qualityWarnings=_dedupe_text_list(validation.qualityWarnings or []),
            guidance=guidance,
            appearanceNotes=(suggestion.vibe.styleDescription if suggestion and suggestion.vibe else None),
        ),
    )


@router.post("/api/profiles", response_model=CreateStyleProfileResponse)
def create_style_profile(payload: CreateStyleProfileRequest) -> CreateStyleProfileResponse:
    if not str(payload.shopifyCustomerId or "").strip() and not str(payload.customerEmail or "").strip():
        raise HTTPException(status_code=400, detail="Customer ID or customer email is required.")

    existing = supabase_service.fetch_customer_style_profiles(
        customer_identifier=payload.shopifyCustomerId,
        customer_email=payload.customerEmail,
        account_display_name=payload.accountDisplayName,
    )
    created_profile = _build_style_profile_from_create_payload(payload, is_primary=not bool(existing.profiles))
    _validate_style_profile(created_profile, require_image_validation=True)

    next_profiles = [*existing.profiles, created_profile]
    saved = supabase_service.save_customer_style_profiles(
        CustomerStyleProfilesRequest(
            customerId=payload.shopifyCustomerId,
            customerEmail=payload.customerEmail,
            accountDisplayName=payload.accountDisplayName,
            profiles=next_profiles,
        )
    )

    saved_profile = next((profile for profile in saved.profiles if str(profile.id) == str(created_profile.id)), created_profile)
    return CreateStyleProfileResponse(ok=True, profile=saved_profile)


@router.post("/api/profiles/set-active", response_model=SetActiveStyleProfileResponse)
def set_active_style_profile(payload: SetActiveStyleProfileRequest) -> SetActiveStyleProfileResponse:
    response = conversation_service.select_active_profile(
        ChatSelectProfileRequest(
            sessionId=payload.sessionId,
            profileId=payload.profileId,
            customerEmail=payload.customerEmail,
            accountDisplayName=payload.accountDisplayName,
        )
    )
    return SetActiveStyleProfileResponse(ok=response.ok, activeProfileId=response.activeProfileId or payload.profileId)


@router.post("/api/customer/style-profiles/scan", response_model=StyleProfileScanResponse)
def scan_customer_style_profile(payload: StyleProfileScanRequest) -> StyleProfileScanResponse:
    image_reference = payload.imageUrl or payload.imageName
    if not image_reference:
        raise HTTPException(status_code=400, detail="An image is required for scan analysis.")

    vision_analysis = vision_service.analyze_image(
        image_reference=image_reference,
        image_content_base64=payload.imageContentBase64,
        image_mime_type=payload.imageMimeType,
    )

    return openai_service.analyze_style_profile_scan(
        vision_analysis=vision_analysis,
        draft_profile=payload.draftProfile,
    )
