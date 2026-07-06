# StyledGenie AWS App Runner Deployment

This repo is ready to deploy as a Docker-based AWS App Runner service.

## Service Settings

- Source: GitHub repository
- Runtime/deployment type: Dockerfile
- Dockerfile path: `Dockerfile`
- Port: `8000`
- Health check path: `/health`

## Required Environment Variables

Add these in App Runner as environment variables or use AWS Secrets Manager for sensitive values.

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini

SHOPIFY_API_VERSION=2026-01
SHOPIFY_APP_NAME=StyledGenieB2B_Production
SHOPIFY_APP_URL=https://YOUR-AWS-OR-CUSTOM-DOMAIN
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_ADMIN_ACCESS_TOKEN=

GOOGLE_VISION_API_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_CLOUD_PROJECT=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_MERCHANT_ID=
```

Only set the variables your current environment actually uses. Do not commit `.env` files or secret values.

## After AWS Deploys

Check these URLs:

```text
https://YOUR-AWS-OR-CUSTOM-DOMAIN/health
https://YOUR-AWS-OR-CUSTOM-DOMAIN/merchant-dashboard/
https://YOUR-AWS-OR-CUSTOM-DOMAIN/storefront-widget-demo/
```

Then update Shopify production config:

```toml
application_url = "https://YOUR-AWS-OR-CUSTOM-DOMAIN/"
```

Finally deploy the Shopify app config:

```powershell
shopify app deploy --config shopify.app.production.toml --allow-updates
```
