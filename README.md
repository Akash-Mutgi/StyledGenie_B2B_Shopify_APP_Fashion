# StyledGenie Shopify MVP

StyledGenie is a Shopify-connected MVP for two distinct jobs:

- an AI stylist for storefront fashion journeys
- an AI support agent for customer care

This repo now contains the live development setup used for the Shopify dev app and dev store, not just a starter scaffold.

## Current Architecture

- [apps/storefront-widget](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/apps/storefront-widget)  
  Standalone storefront widget demo
- [apps/merchant-dashboard](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/apps/merchant-dashboard)  
  Merchant-facing dashboard UI served by the backend
- [backend](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/backend)  
  FastAPI API for chat, catalog, support, analytics, and merchant endpoints
- [shopify/theme-app-extension](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/shopify/theme-app-extension)  
  Shopify theme app embed for the floating storefront chat
- [supabase](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/supabase)  
  Schema and supporting data layer setup
- [docs](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs)  
  Setup, product, and cutover notes

## What Is Working Now

### Storefront stylist flows

- `Find My Outfit`
  - first-time preference onboarding
  - saved preference confirmation screen
  - shorter guided collection before styling starts
  - decision mode prompted only when the backend is ready
- `Complete My Look`
  - image-first analysis
  - anchor-based completion
  - category-balanced support items
- `Get Inspired`
  - hero-first recommendation structure
  - compact supporting items
- `Smart Swap`
  - swap one item while keeping the rest of the look intact

### Customer care flows

- support-mode separation from styling
- order tracking prompt aligned to require both order number and email
- snapshot vs live wording support in payloads
- support image flow for damaged-item and wrong-item cases

### Shopify integration

- merchant dashboard served at `/merchant-dashboard/`
- Shopify theme app embed for storefront chat
- real Shopify catalog hydration for product links and variant ids
- add-to-cart fallback logic for stale or unavailable variants

## Shopper Preference Confirmation Flow

- first-time `Find My Outfit` starts with preference onboarding
- answers are stored in browser storage under `styledgenie-shopper-preferences-v1`
- after onboarding, the user sees:
  - `You’re all set!`
  - `Preferences updated. Tap Next to style.`
- `Next` now moves directly into styling instead of stopping at a dead-end state

## Local Development

### 1. Start the backend

From the repo root:

```bash
cd backend
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl -s http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

### 2. Start the public tunnel for Shopify

```bash
ngrok http 8000
```

Use the HTTPS URL from ngrok for:

- Shopify app `application_url`
- the theme app embed setting `Backend API Base URL`

### 3. Open the local demo surface

With the backend running:

- [http://127.0.0.1:8000/storefront-widget-demo/](http://127.0.0.1:8000/storefront-widget-demo/)
- [http://127.0.0.1:8000/merchant-dashboard/](http://127.0.0.1:8000/merchant-dashboard/)

## Shopify Dev Store Workflow

### App URL

The Shopify app must point to your live dev tunnel, for example:

- `https://your-ngrok-url.ngrok-free.dev/`

Do not use:

- the storefront domain
- a dead ngrok URL
- `127.0.0.1`

### Theme app embed

In Shopify Admin:

1. `Online Store`
2. `Themes`
3. `Customize`
4. `App embeds`
5. Enable `StyledGenie Chat`
6. Set `Backend API Base URL` to your current ngrok URL
7. Save

### Deploy updated theme extension code

From the repo root:

```bash
shopify app deploy --config shopify.app.toml --allow-updates
```

If the widget UI changes are not visible in the dev store:

- redeploy the extension
- refresh the storefront/theme preview
- confirm the backend and ngrok are both still running

## Key Config Files

- [shopify.app.toml](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/shopify.app.toml)  
  Current Shopify dev app config
- [shopify.app.production.toml](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/shopify.app.production.toml)  
  Production app config template
- [.env](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/.env)  
  Current local environment
- [.env.production.example](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/.env.production.example)  
  Production environment template

## Useful Docs

- [docs/PROJECT_SCOPE_AND_DEV_PLAN.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/PROJECT_SCOPE_AND_DEV_PLAN.md)
- [docs/SHOPIFY_SETUP_CHECKLIST.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/SHOPIFY_SETUP_CHECKLIST.md)
- [docs/API_CONTRACTS.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/API_CONTRACTS.md)
- [docs/DETAILED_FUNCTIONAL_FLOWS.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/DETAILED_FUNCTIONAL_FLOWS.md)
- [docs/PRODUCTION_CUTOVER_CHECKLIST.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/PRODUCTION_CUTOVER_CHECKLIST.md)

## Quick Manual QA

### Storefront

1. Open the storefront with the app embed enabled
2. Confirm the floating chat appears
3. Test `Find My Outfit`
4. Test `Get Inspired`
5. Test `Complete My Look`
6. Test `View Product`
7. Test `Add to Cart`
8. Test `Track my order`

### Runtime sanity checks

1. backend responds on `/health`
2. ngrok is still running
3. Shopify app URL matches the current ngrok URL
4. theme embed `Backend API Base URL` matches the same ngrok URL

## Current Limitations

- the backend still depends on local runtime for the dev-store setup unless you deploy it to a stable host
- production hosting is not part of the active dev-store workflow
- some integrations still rely on merchant/store data quality in Shopify and Supabase

## Production Notes

For moving beyond the dev store, use:

- [shopify.app.production.toml](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/shopify.app.production.toml)
- [.env.production.example](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/.env.production.example)
- [docs/PRODUCTION_CUTOVER_CHECKLIST.md](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/docs/PRODUCTION_CUTOVER_CHECKLIST.md)
