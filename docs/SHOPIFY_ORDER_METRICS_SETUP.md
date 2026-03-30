# Shopify Order Metrics Setup

Use this guide to turn on real commerce metrics for StyledGenie.

## What this enables

- Real `Revenue Assisted`
- Real `AOV`
- Real `AI Conversion Rate`
- Real `AI-assisted order` counts

## Step 1: Add Shopify order access

In your Shopify app:

1. Open the app in Shopify Dev Dashboard.
2. Go to the app version.
3. Add the access scope `read_orders`.
4. Release the app version.
5. Reinstall or update the app on your store if Shopify asks you to approve new scopes.

Important:
- Shopify usually gives access to the last 60 days of orders by default.
- If you need older orders, Shopify requires additional order access approval.

## Step 2: Run the Supabase migration

Open Supabase SQL Editor and run:

- [add_shopify_order_metrics.sql](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/supabase/add_shopify_order_metrics.sql)

If you are setting up a brand-new database, [schema.sql](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/supabase/schema.sql) already includes these tables.

## Step 3: Check environment settings

Make sure your [`.env`](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/.env) includes:

```env
SHOPIFY_APP_NAME=StyledGenieB2B_Test
SHOPIFY_APP_URL=https://admin.shopify.com/store/ea4aad-0f/settings/domains/142453670222
SHOPIFY_STORE_DOMAIN=styledgenie-webshop.myshopify.com
SHOPIFY_STOREFRONT_DOMAIN=styledgenie.com
SHOPIFY_API_VERSION=2026-01
SHOPIFY_CLIENT_ID=your_real_client_id
SHOPIFY_CLIENT_SECRET=your_real_client_secret
SHOPIFY_ADMIN_ACCESS_TOKEN=your_shopify_admin_access_token_here
SHOPIFY_ORDERS_LOOKBACK_DAYS=60
```

## Step 4: Restart the backend

```bash
cd /Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Step 5: Sync the store again

Open:

- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Run:

- `POST /api/catalog/import`

This sync now imports:

- products
- Shopify orders
- AI-assisted order attribution

## Step 6: Generate future assisted-order tracking

The storefront widget now sends StyledGenie attribution into Shopify cart line item properties when a shopper clicks `Add to Cart` from a recommendation card.

That means future orders placed from those assisted cart additions can count toward:

- AI-assisted orders
- Revenue assisted
- AI conversion rate

## Step 7: Check the merchant dashboard

Open:

- [merchant-dashboard/index.html](/Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/apps/merchant-dashboard/index.html)

Then go to:

- `Chatbot Customization`
- `Bot Builder`

You should now see real order-based metrics once orders are synced and assisted orders exist.
