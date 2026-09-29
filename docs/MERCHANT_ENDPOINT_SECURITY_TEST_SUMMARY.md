# Merchant Endpoint Security Test Summary

## Implemented

- Shopify App Bridge ID/session JWTs are verified with HS256 and bound to the configured app client ID and the same HTTPS `.myshopify.com` host in `iss` and `dest`. The verifier checks `exp`, `nbf`, `aud`, and `sub`, then resolves that shop to its merchant row.
- Requests without a valid bearer token receive `401` on every `/api/merchant/*` and `/api/analytics/*` route. The catalog import write endpoint is protected as well.
- The embedded merchant dashboard obtains a fresh App Bridge ID token for protected API calls. Storefront customization now uses a separate public endpoint that returns only its public-facing configuration.
- CORS has no wildcard fallback. App origins are explicit/fixed; storefront origins are allowed only when their exact HTTPS host is registered in that merchant's `storefront_domains` column. Unknown origins are rejected, and accepted storefront requests receive that merchant's request context.
- Tenant-facing Supabase requests use a short-lived JWT with an RLS `merchant_id` claim. The SQL migration enables and forces RLS on all current tenant tables; service-role access is limited to tenant lookup/provisioning.
- Public text chat/refinement is limited to 30 requests per client IP per minute, image/complete-look analysis to 8 per endpoint per minute, and feedback to 60 per minute. `429` responses include `Retry-After`.

## Automated checks

Run from the repository root:

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p test_merchant_endpoint_security.py -v
```

The previously recorded baseline was **10 tests passed on 28 September 2026**. The multi-tenant CORS and RLS changes above have not yet been exercised against Supabase or a two-store deployment. Apply `supabase/multi_tenant_rls.sql`, configure `SUPABASE_JWT_SECRET`, then rerun the security checks before treating the controls as production-ready.

## Dev-store confirmation

The automated checks use locally signed test JWTs. Opening the dashboard's direct URL is expected to return `401`, because Shopify issues the ID token to the embedded app inside Shopify Admin. The direct URL now explains this and provides an **Open in Shopify Admin** link when the app and store are configured. A live browser demonstration in the installed Shopify dev store has not yet been recorded. Verify successful requests for two separate stores, cross-tenant reads/writes returning no rows, unknown storefront origins being rejected, and valid registered origins receiving the correct tenant context.

The rate limiter is in process memory. It is suitable for the current single-worker dev setup; use a shared limiter store before running multiple backend workers or replicas.
