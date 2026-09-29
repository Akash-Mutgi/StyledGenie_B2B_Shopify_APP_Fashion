# StyledGenie: Local Code to Shopify Deployment Guide

This document explains how to move StyledGenie from the local computer to a working Shopify development store.

## Deployment overview

StyledGenie contains two deployable parts:

1. The FastAPI backend, merchant dashboard, and standalone demo are hosted on Render.
2. The theme app extension is deployed to Shopify with Shopify CLI.

The complete flow is:

```text
Local project -> GitHub -> Render backend -> Shopify theme extension
```

Shopify does not host the Python backend. The Shopify storefront widget calls the public backend URL supplied by Render.

## Current Shopify target

```text
Shopify app: StyledGenieB2B_Test
Client ID: 4a82f71b23a7b71f01ce45ca28454fd8
Development store: styledgenie.myshopify.com
Production config: shopify.app.production.toml
```

Do not share or commit the Shopify Client Secret, Admin API token, OpenAI key, Supabase keys, Google credentials, email credentials, or Twilio credentials.

---

## Part 1: Prepare and push the code to GitHub

### Step 1: Open PowerShell in the project

```powershell
cd C:\Users\Shubhangi\Desktop\stylegens\StyledGenie_B2B_Shopify_APP_Fashion
```

### Step 2: Confirm that `.env` is ignored

Run:

```powershell
git check-ignore .env
```

Expected output:

```text
.env
```

Never upload `.env` to GitHub.

### Step 3: Review the pending changes

```powershell
git status --short
```

Review the files before staging them. Do not commit local virtual environments, temporary files, generated output, or runtime logs.

### Step 4: Stage the application files

```powershell
git add backend apps shopify docs Dockerfile shopify.app.toml shopify.app.production.toml .env.production.example
```

Review the staged files:

```powershell
git diff --cached --stat
```

### Step 5: Commit and push

```powershell
git commit -m "Prepare StyledGenie Shopify deployment"
git push origin main
```

Open the GitHub repository and confirm that the latest commit is visible. Confirm again that `.env` is not present in the repository.

---

## Part 2: Deploy the backend on Render

### Step 6: Sign in to Render

1. Open https://dashboard.render.com/.
2. Select **Sign in with GitHub**.
3. Authorize Render to access the StyledGenie repository.

### Step 7: Create a Web Service

1. Select **New**.
2. Select **Web Service**.
3. Choose `StyledGenie_B2B_Shopify_APP_Fashion`.
4. Use the following settings:

```text
Name: styledgenie-api
Branch: main
Runtime: Docker
Dockerfile path: ./Dockerfile
```

If Render asks for a Docker build context, use:

```text
.
```

### Step 8: Configure the health check

Use:

```text
Health check path: /health
```

The Docker container listens on port `8000`. Render normally supplies the public port automatically.

### Step 9: Add environment variables

Open the Render service's **Environment** section. Copy the values from the local `.env` file one at a time.

Add the variables used by the application:

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TIMEOUT_SECONDS
OPENAI_REASONING_EFFORT
OPENAI_TEXT_VERBOSITY

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DEFAULT_MERCHANT_ID

GOOGLE_VISION_API_KEY
GOOGLE_APPLICATION_CREDENTIALS
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_CLOUD_PROJECT

SHOPIFY_APP_NAME
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_DOMAIN
SHOPIFY_API_VERSION
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_ORDERS_LOOKBACK_DAYS
SHOPIFY_STOREFRONT_ACCESS_TOKEN

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

Only add optional email or Twilio variables if those integrations are being used.

Set the initial CORS value to the Shopify storefront origin:

```text
CORS_ALLOWED_ORIGINS=https://styledgenie.myshopify.com
```

Do not paste secrets into GitHub files, Shopify TOML files, chat messages, screenshots, or documentation.

### Step 10: Deploy the service

Select **Create Web Service** or **Deploy Web Service**. Wait until the deployment status is live.

Render will provide a public URL similar to:

```text
https://styledgenie-api.onrender.com
```

The actual generated URL might be different. Use the exact URL shown by Render.

### Step 11: Verify the backend

Open:

```text
https://YOUR-RENDER-URL/health
```

Expected response:

```json
{"status":"ok"}
```

Also verify:

```text
https://YOUR-RENDER-URL/merchant-dashboard/
https://YOUR-RENDER-URL/storefront-widget-demo/
```

Do not continue to Shopify deployment until `/health` works.

---

## Part 3: Connect the Render URL to the app

### Step 12: Update the production Shopify URL

Open `shopify.app.production.toml` and set `application_url` to the exact Render URL:

```toml
client_id = "4a82f71b23a7b71f01ce45ca28454fd8"
name = "StyledGenieB2B_Test"
application_url = "https://YOUR-RENDER-URL/"
embedded = true
```

Keep the trailing slash in `application_url`.

### Step 13: Add the backend URLs to Render

In the Render environment settings, add:

```text
SHOPIFY_APP_URL=https://YOUR-RENDER-URL
APP_BASE_URL=https://YOUR-RENDER-URL
```

Save the environment settings and redeploy the Render service.

### Step 14: Commit the final URL

The public Render URL is not a secret and can be committed:

```powershell
git add shopify.app.production.toml
git commit -m "Set StyledGenie production backend URL"
git push origin main
```

Wait for Render to finish any automatic redeployment.

---

## Part 4: Deploy the Shopify app extension

### Step 15: Check Shopify CLI

```powershell
shopify version
```

### Step 16: Sign in to Shopify

```powershell
shopify auth login
```

Complete the login in the browser using the Shopify account that owns `StyledGenieB2B_Test`.

### Step 17: Build the Shopify app package

```powershell
shopify app build --config shopify.app.production.toml
```

The expected result is a successful build for `StyledGenieB2B_Test`.

### Step 18: Deploy the Shopify app version

```powershell
shopify app deploy --config shopify.app.production.toml --allow-updates
```

This uploads the Shopify configuration and the `StyledGenie Chat` theme app extension. It does not upload the Python backend; Render hosts that part.

If Shopify asks for permission to update app scopes or configuration, review the changes and approve them.

---

## Part 5: Install the app on the development store

### Step 19: Open the app in Shopify Dev Dashboard

1. Open the Shopify Dev Dashboard.
2. Select **Apps**.
3. Open **StyledGenieB2B_Test**.
4. Open the testing or distribution section.
5. Choose the development store `styledgenie.myshopify.com`.
6. Select **Install app**.
7. Review and approve the requested permissions.

The configured scopes are:

```text
read_products
write_products
read_orders
read_inventory
```

`write_products` is used by the product-description update feature in the merchant dashboard.

---

## Part 6: Enable the storefront widget

### Step 20: Open the Shopify theme editor

In the development store's Shopify Admin:

1. Open **Online Store**.
2. Open **Themes**.
3. Select **Customize** for the test theme.
4. Open **App embeds**.
5. Enable **StyledGenie Chat**.

### Step 21: Set the backend URL

In the `StyledGenie Chat` app-embed settings, set **Backend API Base URL** to:

```text
https://YOUR-RENDER-URL
```

Do not add a path such as `/api` or `/health`. Save the theme.

---

## Part 7: Final testing

### Step 22: Test the storefront

Open the development storefront and confirm:

- The StyledGenie launcher appears.
- The widget opens and closes correctly.
- Find My Outfit works.
- Complete My Look accepts an image.
- Get Inspired displays the hero product first.
- Product links open the correct Shopify products.
- Add to Cart uses real Shopify variants.
- Smart Swap replaces only the selected item.
- Customer-support mode does not show styling controls.
- Order tracking requests the required order details and returns store data.

### Step 23: Test the merchant dashboard

Open:

```text
https://YOUR-RENDER-URL/merchant-dashboard/
```

Confirm that catalog sync, settings, analytics, and product actions use the intended development store.

### Step 24: Run a final security check

Confirm that:

- `.env` is not in GitHub.
- No API keys appear in frontend JavaScript.
- Render contains the production secrets.
- `CORS_ALLOWED_ORIGINS` does not use `*` in production.
- Product links point to the intended store.
- Test and production store data are not mixed.

---

## Optional: Add the custom domain later

The initial deployment can use the Render URL. A custom domain is not required for testing.

After approval, `app.nexoraaicommerce.com` can be connected to Render using the CNAME records provided by Render. Once the custom domain works, update these values:

```text
shopify.app.production.toml -> application_url
Render -> SHOPIFY_APP_URL
Render -> APP_BASE_URL
Shopify theme app embed -> Backend API Base URL
```

Verify this URL before switching Shopify:

```text
https://app.nexoraaicommerce.com/health
```

---

## Updating the application later

### Backend or dashboard changes

Commit and push the changes:

```powershell
git add <changed-files>
git commit -m "Describe the update"
git push origin main
```

Render can automatically deploy the latest `main` branch.

### Shopify theme-extension changes

After pushing the code, release a new Shopify app version:

```powershell
shopify app deploy --config shopify.app.production.toml --allow-updates
```

---

## Quick deployment checklist

- [ ] `.env` is ignored and not uploaded.
- [ ] Latest application code is pushed to GitHub.
- [ ] Render Web Service is deployed using `Dockerfile`.
- [ ] Render environment variables are configured.
- [ ] `/health` returns `{"status":"ok"}`.
- [ ] `shopify.app.production.toml` contains the Render URL.
- [ ] `SHOPIFY_APP_URL` and `APP_BASE_URL` contain the Render URL.
- [ ] Shopify CLI login is complete.
- [ ] Shopify app build succeeds.
- [ ] Shopify app version is deployed.
- [ ] App is installed on `styledgenie.myshopify.com`.
- [ ] `StyledGenie Chat` app embed is enabled.
- [ ] The app embed contains the Render backend URL.
- [ ] Styling, support, products, cart, and orders are tested.
