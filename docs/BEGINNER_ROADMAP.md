# Beginner Roadmap

This roadmap is designed for a beginner. Follow it from top to bottom.

## Phase 1: Understand The Product

Goal: know what you are building before writing code.

Tasks:

- Read the requirement summary in `README.md`.
- Write one sentence for each MVP feature in your own words.
- Draw the system on paper: customer widget -> backend -> database.

Success result:

- You can explain the MVP without reading the brief.

## Phase 2: Learn The Basics

Goal: learn the minimum coding concepts needed to move safely.

Topics to learn:

- HTML: page structure
- CSS: styling and layout
- JavaScript: clicks, forms, fetch requests
- Python: functions, files, lists, dictionaries
- APIs: request and response

Success result:

- You understand what each folder in this repo is for.

## Phase 3: Run The Static Demos

Goal: see the UI before connecting real services.

Tasks:

- Open `apps/storefront-widget/index.html` in a browser.
- Open `apps/merchant-dashboard/index.html` in a browser.
- Click through the interface and study how the pieces fit together.

Success result:

- You can describe what the shopper sees and what the merchant sees.

## Phase 4: Run The Python Backend

Goal: get the API server working on your machine.

Tasks:

- Install Python.
- Create a virtual environment.
- Install the packages listed in `backend/requirements.txt`.
- Start the API with FastAPI and Uvicorn.
- Open the API docs in the browser.

Suggested commands:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Success result:

- `http://127.0.0.1:8000/docs` opens and shows API routes.

## Phase 5: Connect Frontend To Backend

Goal: make the demos call the real local API.

Tasks:

- Update the storefront widget to call `/api/chat`.
- Add an image upload flow to call `/api/inspire`.
- Add a complete-the-look flow to call `/api/complete-look`.
- Make the dashboard request `/api/analytics/overview`.

Success result:

- Frontend screens display data from the backend instead of hardcoded mock data.

## Phase 6: Add Supabase

Goal: save real data.

Tasks:

- Create a Supabase project.
- Run `supabase/schema.sql`.
- Store products, FAQs, chat logs, and recommendation events.
- Replace mock backend data with Supabase queries.

Success result:

- Data still exists after refreshing the page.

## Phase 7: Add Shopify

Goal: connect the MVP to a real store.

Tasks:

- Create a Shopify Partner account.
- Create a development store.
- Create a private or custom app during early testing.
- Pull products from Shopify into your database.
- Add the chat widget to the storefront through a theme app extension or app embed.

Success result:

- Store catalog products appear in the recommendation flow.

## Phase 8: Add OpenAI And Google Vision

Goal: replace placeholder intelligence with real AI services.

Tasks:

- Connect OpenAI for outfit reasoning and support responses.
- Connect Google Vision for image tag extraction.
- Save prompt inputs and outputs for debugging.
- Add fallback behavior when AI services fail.

Success result:

- AI output uses real product and image context.

## Phase 9: Add Merchant Controls

Goal: let merchants manage the system without editing code.

Tasks:

- Build forms for FAQs.
- Build forms for looks and styling rules.
- Add a knowledge base editor.
- Add analytics charts and filters.

Success result:

- A merchant can update the AI system from the dashboard.

## Phase 10: Test The Full MVP

Goal: prove the product works from start to finish.

Tasks:

- Follow `tests/manual-qa-checklist.md`.
- Test on mobile and desktop.
- Test with empty catalog data.
- Test with missing images.
- Test common support questions.

Success result:

- The product is stable enough for a pilot merchant.

## Weekly Build Order

If you are starting from zero, a realistic order is:

1. Week 1: learn basics and run demos
2. Week 2: run backend and understand API routes
3. Week 3: connect frontend to backend
4. Week 4: add Supabase
5. Week 5: add Shopify catalog import
6. Week 6: add OpenAI and Google Vision
7. Week 7: polish merchant dashboard
8. Week 8: manual testing and fixes

## Beginner Advice

- Build one feature at a time.
- Keep every version working.
- Save notes about what you changed.
- Test after every small change.
- Do not start by chasing perfect architecture.

