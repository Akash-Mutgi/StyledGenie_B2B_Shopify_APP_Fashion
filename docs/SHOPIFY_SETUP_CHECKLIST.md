# Shopify Setup Checklist

Use this checklist when you are ready to connect the MVP to Shopify.

## Accounts

- Create a Shopify Partner account.
- Create one development store for testing.
- Create one test storefront theme.

## Store Data

- Add at least 20 products.
- Add product images.
- Add categories, tags, colors, and sizes.
- Add a few collections for different styles.

## App Setup

- App name: `StyledGenieB2B_Test`
- App URL: `https://shopify.dev/apps/default-app-home` until you host a real HTTPS app URL
- Store the Shopify app metadata and credentials in [`.env`](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/.env).
- Confirm that you can call the Shopify Admin API.

## Storefront Widget

- Add the chat block through a theme app extension or app embed.
- Test widget loading on desktop and mobile.
- Confirm the widget can call your backend URL.

## Catalog Intelligence

- Import products from Shopify into Supabase.
- Save tags and product metadata.
- Add compatibility rules such as:
  - blazer pairs with trousers
  - heels pair with formal looks
  - denim pairs with casual looks

## Merchant Dashboard

- Show interaction counts.
- Show recommendation counts.
- Show image upload counts.
- Show FAQ usage.

## Final Pre-Launch Checks

- Remove placeholder responses.
- Add real OpenAI and Google Vision integrations.
- Add error handling for missing products and failed API calls.
- Test with a real merchant catalog.
