# StyledGenie Shopify Implementation Guide

This is the primary implementation guide for connecting the current StyledGenie repository to Shopify. It reflects the code that exists today and separates the working single-store flow from future multi-merchant work.

## 1. Implementation target

Current target:

```text
Shopify app: StyledGenieB2B_Test
Client ID: 4a82f71b23a7b71f01ce45ca28454fd8
Development store: styledgenie.myshopify.com
Backend: FastAPI
Frontend: static HTML, CSS, and JavaScript
Shopify integration: theme app extension/app embed
Database: Supabase
```

Current deployment model:

```text
Shopify storefront
        |
        v
StyledGenie theme app extension
        |
        v
Public HTTPS FastAPI backend
        |
        +--> Supabase
        +--> OpenAI
        +--> Google Vision
        +--> Shopify Admin API
```

The Python backend is not hosted by Shopify. It must run on Render, AWS, or another public HTTPS host.

## 2. Source-of-truth files

| Responsibility | File or directory |
| --- | --- |
| Local Shopify configuration | `shopify.app.toml` |
| Hosted/test configuration | `shopify.app.production.toml` |
| Theme extension configuration | `shopify/theme-app-extension/shopify.extension.toml` |
| Shopify app embed | `shopify/theme-app-extension/blocks/styledgenie-chat.liquid` |
| Theme widget JavaScript | `shopify/theme-app-extension/assets/chat-widget.js` |
| Theme widget CSS | `shopify/theme-app-extension/assets/chat-widget.css` |
| Standalone widget demo | `apps/storefront-widget/` |
| FastAPI entry point | `backend/app/main.py` |
| Shopify API integration | `backend/app/services/shopify_service.py` |
| Merchant dashboard | `backend/merchant-dashboard/` |
| Production environment template | `.env.production.example` |
| Container deployment | `Dockerfile` |

## 3. What the current implementation supports

- One configured Shopify store.
- Shopify product and inventory reads.
- Shopify order reads when permission is available.
- Shopify product-description updates.
- Manual catalog and order synchronization through `POST /api/catalog/import`.
- Storefront theme app embed.
- Merchant dashboard served at `/merchant-dashboard/`.
- OpenAI, Google Vision, Supabase, SMTP, and Twilio integrations when configured.

## 4. Current limitations

The current application does not implement:

- A Shopify OAuth callback route.
- Per-shop access-token storage.
- Shopify session-token verification.
- Product, order, privacy, or uninstall webhooks.
- Shopify App Bridge authentication for the dashboard.
- Tenant isolation for multiple independent merchants.

Do not configure imaginary callback or webhook URLs. Add them only after the corresponding backend routes are implemented and tested.

## 5. Local development setup

### 5.1 Open PowerShell in the repository

```powershell
cd C:\Users\Shubhangi\Desktop\stylegens\StyledGenie_B2B_Shopify_APP_Fashion
```

### 5.2 Start FastAPI

```powershell
cd backend
..\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
```

Keep this terminal running.

### 5.3 Verify the local backend

Open:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/merchant-dashboard/
http://127.0.0.1:8000/storefront-widget-demo/
```

The health response must be:

```json
{"status":"ok"}
```

### 5.4 Expose the backend with HTTPS

Install and authenticate ngrok, then open a second terminal:

```powershell
ngrok http 8000
```

Copy the generated HTTPS URL:

```text
https://YOUR-TUNNEL.ngrok-free.app
```

Verify:

```text
https://YOUR-TUNNEL.ngrok-free.app/health
```

### 5.5 Update local Shopify configuration

In `shopify.app.toml`, set:

```toml
client_id = "4a82f71b23a7b71f01ce45ca28454fd8"
name = "StyledGenieB2B_Test"
application_url = "https://YOUR-TUNNEL.ngrok-free.app/"
```

In `.env`, set:

```text
SHOPIFY_APP_URL=https://YOUR-TUNNEL.ngrok-free.app
```

Restart FastAPI after changing `.env`.

## 6. Deploy the theme extension for development

From the repository root:

```powershell
shopify auth login
shopify app build --config shopify.app.toml
shopify app deploy --config shopify.app.toml --allow-updates
```

The Shopify CLI must show `StyledGenieB2B_Test` before deployment. Stop if it shows a different app.

## 7. Install and enable the development app

### 7.1 Install the app

In the Shopify Dev Dashboard:

1. Open **Apps**.
2. Open **StyledGenieB2B_Test**.
3. Select the testing or distribution option.
4. Select `styledgenie.myshopify.com`.
5. Install or update the app.
6. Approve the requested permissions.

### 7.2 Enable the app embed

In Shopify Admin:

1. Open **Online Store > Themes**.
2. Select **Customize**.
3. Open **App embeds**.
4. Enable **StyledGenie Chat**.
5. Set **Backend API Base URL** to the current ngrok HTTPS URL.
6. Save the theme.

Keep FastAPI and ngrok running while testing. If ngrok generates a new URL, update `shopify.app.toml`, `.env`, and the app-embed setting.

## 8. Persistent backend deployment

Use this when the app must remain available without the local computer.

### 8.1 Push reviewed code

Never use `git add .` without reviewing the worktree. The repository can contain logs, generated output, temporary files, and unrelated changes.

```powershell
git status --short
git add backend apps shopify docs Dockerfile shopify.app.toml shopify.app.production.toml .env.production.example
git diff --cached --stat
git commit -m "Prepare StyledGenie Shopify deployment"
git push origin main
```

Confirm `.env` was not committed:

```powershell
git check-ignore .env
```

Expected output:

```text
.env
```

### 8.2 Deploy the Docker service

Recommended simple path:

1. Create a Render Web Service from the GitHub repository.
2. Select the `main` branch.
3. Select Docker deployment.
4. Use `./Dockerfile`.
5. Set the health-check path to `/health`.
6. Add environment variables securely.
7. Deploy and copy the generated HTTPS URL.

Equivalent Docker platforms can be used if they expose port `8000`, honor the `PORT` environment variable, and provide HTTPS.

### 8.3 Required environment variables

Core AI and database:

```text
OPENAI_API_KEY
OPENAI_MODEL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DEFAULT_MERCHANT_ID
```

Google Vision:

```text
GOOGLE_VISION_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_CLOUD_PROJECT
```

Shopify:

```text
SHOPIFY_APP_NAME
SHOPIFY_APP_URL
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_DOMAIN
SHOPIFY_API_VERSION
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_STOREFRONT_ACCESS_TOKEN
SHOPIFY_ORDERS_LOOKBACK_DAYS
APP_BASE_URL
CORS_ALLOWED_ORIGINS
```

Optional notifications:

```text
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM_EMAIL
SMTP_REPLY_TO
SMTP_USE_TLS
SMTP_USE_SSL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
```

Use the exact variable names above. Do not rename them to `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, or `SUPABASE_SERVICE_KEY`; the current backend does not read those names.

### 8.4 Configure production origins

Set the fixed app origin; storefront origins are resolved from each merchant's registered `storefront_domains` in Supabase:

```text
CORS_ALLOWED_ORIGINS=https://app.nexoraaicommerce.com
```

Do not add every merchant storefront to this fixed variable and do not use `*`. Save each merchant's HTTPS storefront host in its dashboard profile; after the RLS migration, the API resolves that exact host to its merchant row for CORS and request scoping. The embedded dashboard page is served from the app URL; `admin.shopify.com` is the iframe parent, not the browser request origin.

## 9. Connect the hosted URL to Shopify

Assume the host provides:

```text
https://YOUR-BACKEND.example.com
```

### 9.1 Verify the host

```text
https://YOUR-BACKEND.example.com/health
https://YOUR-BACKEND.example.com/merchant-dashboard/
```

### 9.2 Update hosting variables

```text
SHOPIFY_APP_URL=https://YOUR-BACKEND.example.com
APP_BASE_URL=https://YOUR-BACKEND.example.com
```

### 9.3 Update Shopify production configuration

In `shopify.app.production.toml`:

```toml
client_id = "4a82f71b23a7b71f01ce45ca28454fd8"
name = "StyledGenieB2B_Test"
application_url = "https://YOUR-BACKEND.example.com/"
embedded = true
```

Keep callback URLs empty until OAuth is implemented:

```toml
[auth]
redirect_urls = []
```

### 9.4 Build and deploy

```powershell
shopify auth login
shopify app build --config shopify.app.production.toml
shopify app deploy --config shopify.app.production.toml --allow-updates
```

### 9.5 Update the app embed

Set **Backend API Base URL** to the same hosted URL and save the theme.

## 10. Catalog and order synchronization

The current backend does not rely on product webhooks.

Trigger synchronization through the merchant dashboard or:

```http
POST /api/catalog/import
```

After synchronization, verify:

- Products exist in Supabase for the intended merchant.
- Shopify product IDs and handles are populated.
- Variant IDs are valid.
- Inventory values are present where available.
- Order synchronization succeeds when `read_orders` is granted.
- Product links point to the intended storefront.

## 11. Current API verification list

Core endpoints:

```text
GET  /health
GET  /api/runtime/status
POST /api/chat
POST /api/inspire
POST /api/complete-look
POST /api/onboarding/analyze-scan
POST /api/support-image
POST /api/chat/refine
POST /api/feedback
POST /api/catalog/import
GET  /api/catalog/products
GET  /api/analytics/dashboard
GET  /api/merchant/workspace
GET  /api/support/faqs
```

Static interfaces:

```text
GET /merchant-dashboard/
GET /storefront-widget-demo/
```

## 12. Functional acceptance tests

### Styling mode

- Find My Outfit collects only missing critical inputs.
- Decision mode asks whether the shopper wants options or one best outfit.
- Complete My Look analyzes the image before asking questions.
- Complete My Look identifies what is present and what is missing.
- Get Inspired displays one hero product before supporting products.
- Every recommendation contains a concise “Why this works” explanation.
- Smart Swap changes only the selected category.

### Support mode

- Support intent removes styling controls.
- Order tracking requests the required order details.
- Returns and exchanges are short and action-oriented.
- No outfit recommendations appear in support mode.

### Shopify behavior

- Product links open the correct storefront product.
- Add to Cart uses a valid variant ID.
- Unavailable variants fail gracefully.
- Catalog data belongs to the intended store.
- Order data belongs to the intended store.

## 13. Security rules

- Never commit `.env`.
- Never expose service-role keys or Admin API tokens in frontend JavaScript.
- Treat CORS as a browser control, not authentication.
- Do not expose merchant write endpoints publicly without authentication.
- Rotate any secret that was committed or shared accidentally.
- Use provider secret storage for hosted credentials.
- Keep development and production merchant data separate.

## 14. Troubleshooting

### The widget does not appear

- Confirm the app embed is enabled and saved.
- Confirm the correct theme is being previewed.
- Confirm the extension version was deployed.
- Refresh without browser cache.

### The widget appears but API calls fail

- Open `/health` on the configured backend URL.
- Confirm FastAPI/ngrok is still running for local development.
- Confirm the app embed contains the current backend URL.
- Confirm the storefront domain is registered in that merchant's profile and `storefront_domains` row.

### Catalog synchronization fails

- Confirm the store domain.
- Confirm the app is installed on that store.
- Confirm `read_products`, `read_inventory`, and `read_orders` were approved.
- Confirm the Admin access token or client-credentials flow works for the selected store.

### Product-description updates fail

- Confirm `write_products` is approved.
- Reinstall or update the app after changing scopes.
- Confirm the Shopify staff user has product-edit permissions.

## 15. Completion criteria

The current single-store implementation is complete when:

- The hosted `/health` endpoint is healthy.
- The Shopify app version deploys successfully.
- The app is installed on the intended development store.
- The app embed is enabled with the correct backend URL.
- Catalog import succeeds.
- Product cards and Add to Cart use real Shopify data.
- Styling and customer-support flows pass acceptance testing.
- Secrets are stored only in approved secret storage.

For public or multi-merchant launch work, continue with `SHOPIFY_PRODUCTION_READINESS_PLAN.md`.
