# StyledGenie Shopify Production Readiness Plan

This document defines the work required to evolve the current single-store implementation into a secure production or multi-merchant Shopify application.

## 1. Current readiness level

The current code is appropriate for:

- Local development.
- A development store.
- Controlled single-store testing.
- A hosted demonstration with carefully limited access.

It is not yet appropriate for unrestricted public or multi-merchant distribution.

## 2. Production gaps

| Area | Current state | Required production state |
| --- | --- | --- |
| Installation | Manual store configuration | Verified Shopify installation flow |
| Tokens | Shopify session token verified; client-credentials tokens cached by shop | Persist and rotate per-shop credentials; complete install/uninstall lifecycle |
| Merchant identity | Verified session destination maps to a merchant row | Shop-to-merchant mapping on every request |
| Dashboard authentication | Static dashboard | Shopify session-token verification |
| API authorization | Public merchant endpoints | Role- and shop-aware authorization |
| Webhooks | Not implemented | Verified, idempotent Shopify webhooks |
| Uninstall cleanup | Not implemented | Token revocation and merchant deactivation |
| Privacy webhooks | Not implemented | Required privacy handlers and records |
| CORS | App origins plus exact registered storefront origins | Verify live merchant-domain registration and hosted preflight behavior |
| Data isolation | Tenant-scoped JWT/RLS code and SQL migration added; live migration/configuration pending | Apply migration, configure Supabase signing secret, and verify with two stores |
| Observability | Local/runtime logs | Central logs, alerts, error tracking, audit trail |
| Reliability | Synchronous operations | Queued retries and idempotent background work |

## 3. Recommended release stages

### Stage A: Development store

Goal: validate features on `styledgenie.myshopify.com`.

- Use `StyledGenieB2B_Test`.
- Use ngrok or a test hosting URL.
- Keep callback URLs empty.
- Use the current manual catalog import.
- Test all styling and support flows.

Exit criteria:

- Theme app embed works.
- Product and order access works.
- No test data leaks across merchants.

### Stage B: Controlled single-store deployment

Goal: keep the app online for one approved store.

- Deploy the Docker backend to stable HTTPS hosting.
- Restrict CORS to the approved storefront.
- Protect the merchant dashboard and write endpoints.
- Store secrets in the hosting provider.
- Add monitoring and backups.
- Document manual recovery and secret rotation.

Exit criteria:

- Authentication protects all merchant operations.
- The store can be disconnected safely.
- Backups and monitoring are verified.

### Stage C: Multi-merchant/private distribution

Goal: allow more than one store.

- Implement Shopify installation authorization.
- Verify HMAC/state requirements where applicable.
- Store access credentials per shop.
- Resolve merchant identity from the verified shop/session.
- Remove business-critical dependence on `DEFAULT_MERCHANT_ID`.
- Add uninstall handling.
- Enforce tenant isolation in Supabase.

The repository now includes `supabase/multi_tenant_rls.sql` and request-scoped Supabase JWTs that carry a `merchant_id` claim. The service-role key is restricted in application code to tenant lookup/provisioning; normal table queries use the anon key and tenant JWT. These controls are not active until the SQL migration is applied and `SUPABASE_JWT_SECRET` is configured in the backend environment.

Storefront CORS resolves exact registered hosts from `merchants.storefront_domains` and binds the request to that merchant. The Shopify app origin is a fixed trusted origin. `admin.shopify.com` is the iframe parent; browser API calls from the embedded page originate from the configured app URL, `https://app.nexoraaicommerce.com`.

Exit criteria:

- Two test stores can install independently.
- Each store sees only its own catalog, orders, settings, sessions, and analytics.
- Uninstalling one store does not affect another.

### Stage D: Public production launch

Goal: meet Shopify distribution and operational requirements.

- Complete required privacy and compliance work.
- Complete Shopify app review requirements.
- Finalize support, privacy policy, terms, and data-retention procedures.
- Add billing only if the commercial model requires it.
- Complete load, security, and disaster-recovery testing.

## 4. Authentication implementation plan

### 4.1 Create an installation/auth module

Add a dedicated router and service rather than mixing authentication into styling logic.

Suggested files:

```text
backend/app/routers/auth.py
backend/app/services/shopify_auth_service.py
backend/app/services/session_service.py
```

Responsibilities:

- Validate the Shopify shop domain.
- Start the approved installation flow.
- Validate callback/session authenticity.
- Exchange authorization data for credentials when required.
- Store credentials using server-side secret protection.
- Redirect safely into the Shopify Admin application.

### 4.2 Protect merchant APIs

Protect at least:

```text
/api/merchant/*
/api/catalog/import
/api/analytics/*
/api/merchant/product-description-apply
```

Each request must resolve:

```text
verified shop -> merchant row -> authorized operation
```

Do not trust a merchant ID supplied only by the browser.

### 4.3 Integrate the embedded dashboard

If `embedded = true` remains enabled:

- Initialize Shopify App Bridge.
- Obtain Shopify session tokens in the dashboard.
- Send the token with API requests.
- Verify tokens in FastAPI.
- Apply the correct Shopify frame and content-security policies.

If the dashboard remains a normal external website, set the Shopify configuration accordingly instead of claiming it is embedded.

## 5. Multi-tenant data plan

### 5.1 Required mapping

Create or verify a durable mapping:

```text
Shopify permanent domain -> merchant ID -> credentials/settings
```

### 5.2 Tenant-filtered data

Verify that every query and mutation filters by the authenticated merchant for:

- Products and product intelligence.
- Orders.
- Chat sessions and messages.
- Shopper profiles.
- Recommendation and analytics events.
- Curated looks.
- FAQs and knowledge base.
- Merchant branding and customer-care settings.

### 5.3 Database protections

- Add unique constraints for shop identifiers where appropriate.
- Apply Supabase row-level security where practical.
- Keep the service-role key server-side only.
- Add tests proving cross-merchant reads and writes are rejected.

## 6. Webhook implementation plan

Do not register a webhook until its route exists and passes verification tests.

Potential webhook groups:

- Product create/update/delete.
- Order creation or update when needed for analytics.
- App uninstall.
- Mandatory privacy topics required for the selected distribution model.

Each webhook handler must:

1. Read the raw request body.
2. Verify Shopify authenticity before parsing business data.
3. Identify the shop and merchant.
4. Return quickly.
5. Queue slow work.
6. Use an event identifier or equivalent idempotency control.
7. Record success/failure for retries and auditing.

Suggested files:

```text
backend/app/routers/webhooks.py
backend/app/services/webhook_service.py
```

## 7. Background processing plan

Move long-running work out of webhook and request handlers:

- Catalog imports.
- Large order imports.
- Image enrichment.
- Embedding or tag generation.
- Notification retries.

Use a queue supported by the chosen hosting platform. Define retry limits, dead-letter handling, and idempotency before enabling automatic sync.

## 8. Security implementation plan

### Critical controls

- Authentication on merchant and write endpoints.
- Authorization by verified shop and merchant.
- Per-merchant credential storage.
- Shopify request/session verification.
- Restricted production CORS.
- Rate limits on public chat, image, and support endpoints.
- File-size and content-type limits for uploads.
- Secret rotation process.
- Audit logs for product changes and administrative actions.

### Security verification

- Attempt API requests without a session.
- Attempt requests using a different shop identity.
- Attempt cross-merchant Supabase access.
- Replay webhook payloads.
- Test oversized and invalid uploads.
- Confirm secrets do not appear in browser bundles or logs.

## 9. Reliability and operations

Add before launch:

- Centralized exception tracking.
- Structured application logs with request IDs.
- Health and readiness checks.
- Deployment rollback procedure.
- Supabase backup and restore test.
- Alerting for API error rates and background-job failures.
- Shopify API rate-limit handling.
- OpenAI and Google Vision timeout/fallback behavior.
- Operational ownership and escalation contacts.

## 10. Test plan

### Installation tests

- First installation.
- Reinstallation.
- Scope update.
- Uninstallation.
- Invalid shop domain.
- Invalid or expired authorization/session data.

### Tenant-isolation tests

- Store A cannot read Store B products.
- Store A cannot read Store B orders.
- Store A cannot update Store B settings.
- Store A analytics do not include Store B activity.

### Webhook tests

- Valid event accepted.
- Invalid signature rejected.
- Duplicate event ignored safely.
- Slow processing moved to the queue.
- Failed work retried within policy.

### Functional regression tests

- Find My Outfit.
- Complete My Look image-first flow.
- Get Inspired hero-first flow.
- Smart Swap.
- Support mode separation.
- Add to Cart.
- Order tracking.
- Merchant settings and catalog sync.

## 11. Definition of production-ready

The app is production-ready only when:

- Every merchant API request is authenticated and authorized.
- Credentials are scoped and stored per shop.
- Tenant isolation tests pass.
- Required webhooks are verified and idempotent.
- Uninstall and privacy processes work.
- Monitoring, backups, alerts, and rollback are tested.
- Shopify configuration matches implemented routes exactly.
- The production app passes the relevant Shopify review or distribution requirements.

Until these conditions are satisfied, describe the deployment as a controlled single-store implementation, not a public multi-merchant Shopify app.
