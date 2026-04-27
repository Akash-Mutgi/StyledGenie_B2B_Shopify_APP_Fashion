# StyledGenie Production Cutover Checklist

Use this checklist when moving StyledGenie from the current dev store setup to a new production Shopify store.

## 1. Prepare production config

- Copy [shopify.app.production.toml](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/shopify.app.production.toml) and replace:
  - `client_id`
  - `name`
  - `application_url`
  - `redirect_urls`
- Copy [.env.production.example](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/.env.production.example) to your real production env file and replace:
  - `DEFAULT_MERCHANT_ID`
  - `SHOPIFY_APP_URL`
  - `SHOPIFY_STORE_DOMAIN`
  - `SHOPIFY_STOREFRONT_DOMAIN`
  - `SHOPIFY_CLIENT_ID`
  - `SHOPIFY_CLIENT_SECRET`
  - `SHOPIFY_ADMIN_ACCESS_TOKEN`
  - `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
  - all email/Twilio/OpenAI/Google placeholders

## 2. Deploy the production backend

- Deploy the backend to a stable HTTPS domain such as `https://app.your-production-domain.com`
- Confirm the app root opens successfully
- Confirm the merchant dashboard loads successfully at `/merchant-dashboard/`
- Confirm the backend env points to the new store, not the dev store

## 3. Create or verify the production merchant record

- Ensure Supabase has a merchant row for the new store domain
- Set `DEFAULT_MERCHANT_ID` to that production merchant UUID
- Verify the merchant dashboard reads the correct store domain

## 4. Deploy the Shopify app version

- From the repo root, run:
  - `shopify app deploy --config shopify.app.production.toml --allow-updates`
- If you use a new Shopify app instead of the dev app, confirm the production app is selected before deploy
- Confirm the released version includes:
  - app home
  - branding
  - the `styledgenie-chat` theme app extension

## 5. Install the app on the new store

- Install the app on the new Shopify production store using the correct distribution method
- Open the app from Shopify Admin
- Verify the merchant dashboard opens inside Shopify Admin

## 6. Enable the storefront app embed

- Go to `Online Store` -> `Themes` -> `Customize`
- Open `App embeds`
- Enable `StyledGenie Chat`
- Set `Backend API Base URL` to the production backend URL
- Save

## 7. Sync production catalog data

- Run the real catalog import/sync path
- Verify catalog rows have:
  - Shopify product IDs
  - product handles
  - product URLs
  - variant IDs
- Verify recommendation cards resolve to live production products

## 8. Verify storefront actions

- Open the storefront and confirm the floating chat appears
- Test `Find My Outfit`
- Test `Complete My Look`
- Test `Get Inspired`
- Test `View Product`
- Test `Add to Cart`
- Confirm unavailable variants fail gracefully without crashing the chat

## 9. Verify customer care on the new store

- Test `Track my order`
- Confirm prompts match the configured lookup requirements
- Verify order data comes from the new store
- Confirm snapshot wording remains honest if live data is unavailable

## 10. Final production sanity checks

- Confirm the app is not pointing to an ngrok URL
- Confirm the theme embed is enabled on the live theme
- Confirm recommendation links open the new store, not the dev store
- Confirm no dev-store order or catalog data is leaking into production
