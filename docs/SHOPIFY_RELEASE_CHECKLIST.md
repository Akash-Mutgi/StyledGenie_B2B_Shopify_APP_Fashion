# StyledGenie Shopify Release Checklist

Use this checklist while implementing and releasing the multi-merchant Shopify integration.

## A. Repository safety

- [ ] `git status --short` was reviewed.
- [ ] Only intended application files are staged.
- [ ] `.env` is ignored.
- [ ] No API key, password, access token, or service-account JSON is staged.
- [ ] Temporary files, logs, generated output, and local environments are excluded.

## B. Local backend

- [ ] FastAPI starts on port `8000`.
- [ ] `GET /health` returns `{"status":"ok"}`.
- [ ] `/merchant-dashboard/` loads.
- [ ] `/storefront-widget-demo/` loads.
- [ ] OpenAI runtime status is correct.
- [ ] Google Vision runtime status is correct when image features are enabled.
- [ ] Supabase connection uses the intended project and merchant.

## C. Shopify configuration

- [ ] The selected app is `NexoraAICommerceB2B_Production`.
- [ ] Client ID matches the released app version.
- [ ] `application_url` is `https://app.nexoraaicommerce.com/`.
- [ ] `API_BASE_URL` is `https://api.nexoraaicommerce.com`.
- [ ] Requested scopes are limited to `read_products,write_products,read_orders,read_inventory`.
- [ ] `redirect_urls` remains empty until an auth callback exists.
- [ ] `shopify app build` succeeds.
- [ ] `shopify app deploy` releases the intended configuration and extension.

## D. Hosted backend

- [ ] The Docker deployment succeeds.
- [ ] The platform passes `GET /health`.
- [ ] `SHOPIFY_APP_URL` contains the hosted HTTPS URL.
- [ ] `API_BASE_URL` and `APP_BASE_URL` contain the API host.
- [ ] `CORS_ALLOWED_ORIGINS` contains the app origin, not a fixed list of storefronts.
- [ ] `supabase/multi_tenant_rls.sql` has been applied.
- [ ] `SUPABASE_JWT_SECRET` is configured in Railway secrets.
- [ ] Hosted secrets are configured outside Git.
- [ ] The service restarts successfully after environment changes.

## E. Store installation

- [ ] Two dev stores install independently and receive their approved scopes.
- [ ] New or changed scopes were approved.
- [ ] The intended theme is selected.
- [ ] `StyledGenie Chat` is enabled under App embeds.
- [ ] The app embed contains the same backend HTTPS URL.
- [ ] The theme was saved after changing app-embed settings.

## F. Catalog and Shopify API

- [ ] Catalog import succeeds.
- [ ] Products are stored for the correct merchant.
- [ ] A merchant cannot read or write another merchant's rows under Postgres RLS.
- [ ] Shopify product IDs are populated.
- [ ] Product handles and URLs are valid.
- [ ] Variant IDs are valid.
- [ ] Inventory values are populated where available.
- [ ] Order sync works when `read_orders` is granted.
- [ ] Product-description apply works when `write_products` is granted.

## G. Styling acceptance

- [ ] Find My Outfit infers event, budget, vibe, weather, and urgency where possible.
- [ ] Missing critical inputs are requested without turning the flow into a form.
- [ ] Decision mode offers options or one best outfit.
- [ ] Complete My Look analyzes the image first.
- [ ] Complete My Look identifies the anchor item and missing categories.
- [ ] Recommendations follow the detected color palette and style direction.
- [ ] Get Inspired presents one hero product first.
- [ ] Supporting items appear below the hero product.
- [ ] Every recommendation includes “Why this works”.
- [ ] Smart Swap replaces only the selected category.

## H. Customer-support acceptance

- [ ] Support intent switches fully into support mode.
- [ ] Styling controls are absent in support mode.
- [ ] Order tracking asks only for missing required identifiers.
- [ ] Returns and exchanges are concise and action-oriented.
- [ ] Live versus snapshot order status wording is accurate.
- [ ] Support image flows handle damaged or incorrect products.

## I. Storefront behavior

- [ ] Widget launcher appears on desktop.
- [ ] Widget launcher appears on mobile.
- [ ] Widget opens, closes, and reopens correctly.
- [ ] Image upload works.
- [ ] Product cards are readable and actionable.
- [ ] View Product opens the intended storefront product.
- [ ] Add to Cart uses a real available variant.
- [ ] Unavailable products fail gracefully.
- [ ] Long product names do not break the layout.
- [ ] Loading, empty, and error states are understandable.

## J. Security checks

- [ ] No server secret appears in frontend code or browser responses.
- [ ] Service-role credentials remain server-side.
- [ ] Production CORS does not use `*`.
- [ ] Merchant write endpoints are not exposed beyond the accepted deployment risk.
- [ ] Store and merchant identifiers match the target environment.
- [ ] Development data is not mixed with production data.

## K. Release verification

- [ ] A clean browser session was tested.
- [ ] Desktop and mobile storefronts were tested.
- [ ] Merchant dashboard was tested.
- [ ] Critical API errors were checked in hosted logs.
- [ ] The release version and commit are recorded.
- [ ] A rollback target is known.
- [ ] The person responsible for post-release monitoring is identified.

## L. Public-launch gate

Do not call the app public-production-ready unless all items below are complete:

- [ ] Shopify installation authorization is implemented.
- [ ] Shopify session-token verification is implemented.
- [ ] Merchant APIs require authentication.
- [ ] Credentials are stored per shop.
- [ ] Tenant-isolation tests pass.
- [ ] Required privacy webhooks are implemented.
- [ ] App-uninstall cleanup is implemented.
- [ ] Webhook authenticity and idempotency tests pass.
- [ ] Monitoring, backups, alerts, and rollback are tested.
- [ ] Relevant Shopify distribution/review requirements are satisfied.
