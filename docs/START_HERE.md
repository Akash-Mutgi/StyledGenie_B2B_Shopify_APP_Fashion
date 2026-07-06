# Start Here

This file is written for a person with little or no coding experience.

## What You Are Building

You are building a Shopify-focused AI assistant for fashion stores.

The system has two big parts:

1. The storefront AI assistant that customers use.
2. The merchant dashboard that store owners use.

## What The MVP Must Do

### Customer side

- Recommend complete outfits, not only one product.
- Let shoppers upload a fashion image for inspiration.
- Let shoppers upload an outfit image and get complementary items.
- Answer support questions like shipping, returns, sizing, and policy questions.

### Merchant side

- Show high-level usage numbers.
- Manage catalog intelligence and product tags.
- Review AI recommendation performance.
- Manage curated looks.
- Manage FAQs and support answers.
- Train the system with brand guidance and styling rules.

## Simple Mental Model

Think of the project as 4 boxes:

1. Shopify storefront widget
2. Merchant dashboard
3. Python backend API
4. Supabase database

The widget and dashboard talk to the backend.
The backend talks to Supabase, OpenAI, Google Vision, and Shopify.

## What To Learn First

Do not try to learn everything at once.

Learn in this order:

1. HTML
2. CSS
3. JavaScript
4. How APIs work
5. Basic Python
6. FastAPI
7. Supabase tables and SQL
8. Shopify app basics

## Your First 6 Actions

1. Read `docs/PROCESS_AND_ARCHITECTURE.md`.
2. Read `docs/PROJECT_SCOPE_AND_DEV_PLAN.md`.
3. Read `docs/BEGINNER_ROADMAP.md`.
4. Open the files in `apps/storefront-widget/`.
5. Open the files in `apps/merchant-dashboard/`.
6. Read `backend/app/main.py`.

## Important Rule

Build the MVP in small layers.

Do not start with advanced AI orchestration.
Start with a mock version that works end-to-end.
Then replace mock logic with real integrations one by one.
