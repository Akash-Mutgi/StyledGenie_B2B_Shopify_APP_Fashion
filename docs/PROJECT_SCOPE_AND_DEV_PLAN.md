# StyledGenie MVP Project Scope And Development Plan

This document is written for a person with zero development experience.

If some words feel new, that is normal.
You do not need to understand everything on the first read.
The goal is to help you move step by step without feeling lost.

## 1. Project Summary

StyledGenie is an AI-powered fashion intelligence system for Shopify stores.

It has 2 main parts:

1. A customer-facing AI assistant on the storefront.
2. A merchant-facing dashboard for managing the AI system.

The first version is an MVP.

MVP means:

- build the smallest useful version first
- make it work
- test it with real users
- improve it later

## 2. Problem We Are Solving

Most online fashion stores only help customers find single products.
They do not help customers build a complete outfit.
They also do not give strong visual inspiration, styling help, or smart product support.

StyledGenie solves this by adding an AI layer that can:

- suggest full outfits
- understand fashion images
- complete an existing look
- answer common support questions

## 3. Main Goal Of The MVP

Build a Shopify app that helps shoppers discover products faster and helps merchants manage AI-driven styling and support.

## 4. Who Will Use It

### Customer users

- shoppers visiting the store website
- shoppers who want outfit suggestions
- shoppers who want image-based inspiration
- shoppers who need support answers

### Merchant users

- store owners
- store managers
- customer support teams
- merchandising and styling teams

## 5. What Is In Scope For The MVP

These are the things we will build in the first version.

### Customer-facing features

1. AI chatbot on the Shopify storefront
2. Complete outfit recommendations from store products
3. Image-based inspiration flow
4. Complete-the-look flow
5. Product and support question answering

### Merchant-facing features

1. Dashboard overview
2. Catalog intelligence section
3. Analytics and KPI section
4. Look management section
5. Customer care setup section
6. Knowledge base and AI training section

### Core integrations

1. Shopify for catalog and storefront connection
2. Supabase for database and authentication
3. OpenAI for text intelligence
4. Google Vision for image understanding
5. LangChain or Langflow later for orchestration

## 6. What Is Not In Scope For The MVP

These things are useful, but should not be built first.

1. Multi-language support
2. Advanced personalization by customer history
3. Complex billing plans
4. Multi-store merchant management
5. Advanced recommendation machine learning models
6. Full production-grade admin permissions
7. Deep analytics dashboards with dozens of filters
8. Perfect AI orchestration from day one

This is important:
do not try to build everything at once.

## 7. MVP Success Criteria

The MVP is successful if:

1. The storefront widget appears in a Shopify store.
2. A shopper can ask for an outfit and get a useful answer.
3. A shopper can upload an image and get useful style suggestions.
4. A shopper can ask support questions and get store-specific answers.
5. A merchant can view basic dashboard metrics.
6. A merchant can manage FAQs, looks, and guidance.
7. Product catalog data can be imported from Shopify.

## 8. Simple System Explanation

Think of the product like a team of helpers.

### Part 1: Shopify storefront widget

This is the chat box the shopper sees.

### Part 2: Merchant dashboard

This is the control panel the store owner sees.

### Part 3: Backend API

This is the brain in the middle.
It receives requests from the widget and dashboard.
It decides what to do next.

### Part 4: Supabase database

This stores:

- products
- FAQs
- looks
- AI training notes
- chats
- analytics events

### Part 5: AI services

OpenAI helps with:

- conversation
- styling logic
- support replies

Google Vision helps with:

- reading fashion images
- detecting clothing items or style clues

### Part 6: Shopify

Shopify provides:

- product catalog
- storefront
- merchant environment

## 9. Very Simple User Flows

### Flow A: Outfit curation

1. Shopper opens the chat widget.
2. Shopper says they want an outfit.
3. Backend reads the message.
4. Backend looks at store products.
5. AI chooses matching pieces.
6. Widget shows the full outfit suggestion.

### Flow B: Get inspired

1. Shopper uploads a fashion image.
2. Backend sends the image to Google Vision.
3. The system detects style clues.
4. Backend compares those clues to store products.
5. AI returns similar products from the catalog.

### Flow C: Complete the look

1. Shopper uploads an image of one item or one outfit.
2. The system detects what is in the image.
3. AI suggests matching items from the catalog.
4. Shopper sees complementary products.

### Flow D: Customer support

1. Shopper asks a support question.
2. Backend checks FAQ and knowledge base data.
3. AI writes a friendly answer.
4. Widget shows the answer.

## 10. Project Deliverables

At the end of the MVP, we want these deliverables:

1. Shopify storefront widget
2. Merchant dashboard
3. Python backend API
4. Supabase database schema
5. Shopify catalog import flow
6. OpenAI integration
7. Google Vision integration
8. Beginner-friendly documentation
9. Basic QA checklist

## 11. Technology Stack In Plain English

### HTML

Used to build the page structure.
Example: buttons, sections, forms, headings.

### CSS

Used to style the pages.
Example: colors, spacing, fonts, layout.

### JavaScript

Used to make the pages interactive.
Example: sending chat messages, opening sections, calling APIs.

### Python

Used to build the backend logic.
Example: creating API routes, calling OpenAI, connecting to Supabase.

### Supabase

Used as the database and backend storage layer.

### Shopify

Used to connect the app to the online store and catalog.

### OpenAI

Used for the chatbot and recommendation reasoning.

### Google Vision

Used to detect fashion items and style clues from images.

### LangChain or Langflow

Used later if we want more advanced AI workflows.
This should not be the first thing we build.

## 12. Development Rule For Beginners

Always build in this order:

1. Static screen
2. Working button
3. Mock backend response
4. Real backend response
5. Real database connection
6. Real third-party integration

This rule prevents confusion.

## 13. Step-By-Step Development Plan

This is the most important section.

## Step 0: Prepare Your Mindset

Goal:

- understand that you are not building everything today

What to do:

1. Accept that confusion is normal at the beginning.
2. Work on one small task at a time.
3. Test after each small change.
4. Keep notes of what you changed.

Done means:

- you are ready to build in small pieces instead of trying to finish the whole app in one jump

## Step 1: Install The Basic Tools

Goal:

- set up the software you need on your computer

What to install:

1. A code editor such as VS Code
2. Python 3
3. Google Chrome
4. Git
5. A Shopify Partner account
6. A Supabase account
7. An OpenAI account
8. A Google Cloud account

Done means:

- all required software and accounts exist

## Step 2: Understand The Project Folders

Goal:

- know where things live in the project

What to read:

1. `README.md`
2. `docs/START_HERE.md`
3. `docs/BEGINNER_ROADMAP.md`
4. `backend/app/main.py`
5. `supabase/schema.sql`

Folder meanings:

- `apps/storefront-widget/` = customer side demo
- `apps/merchant-dashboard/` = merchant side demo
- `backend/` = backend logic
- `supabase/` = database setup
- `shopify/` = storefront app integration
- `docs/` = written guides

Done means:

- you can explain what each main folder is for

## Step 3: Open The Frontend Demo Screens

Goal:

- see the app visually before touching backend code

What to do:

1. Open `apps/storefront-widget/index.html` in your browser.
2. Open `apps/merchant-dashboard/index.html` in your browser.
3. Click the buttons and read the content.

Why this matters:

- it helps you understand the product before adding logic

Done means:

- you can see both demo screens and understand their purpose

## Step 4: Run The Backend Locally

Goal:

- make the backend server run on your computer

What to do:

1. Open a terminal.
2. Go to the backend folder.
3. Create a Python virtual environment.
4. Install the packages.
5. Start the FastAPI server.

Commands:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

What to check:

1. Open `http://127.0.0.1:8000/health`
2. Open `http://127.0.0.1:8000/docs`

Done means:

- the API is running and you can open the API docs page

## Step 5: Understand What An API Route Is

Goal:

- understand the basic idea of backend endpoints

Very simple explanation:

- a route is an address on the backend
- the frontend sends a request to that address
- the backend sends back a response

Example routes in this project:

1. `/health`
2. `/api/chat`
3. `/api/inspire`
4. `/api/complete-look`
5. `/api/support/faqs`
6. `/api/analytics/overview`

Done means:

- you understand that the frontend talks to the backend using URLs

## Step 6: Connect The Storefront Chat To The Backend

Goal:

- make the chat box talk to the API

What to do:

1. Open the storefront JavaScript file.
2. Find where the fake response is shown.
3. Replace the fake response with a `fetch()` request to `/api/chat`.
4. Send the user message in JSON format.
5. Show the backend reply in the chat area.

Start with:

- text chat only

Do not start with:

- images
- OpenAI
- Shopify

Done means:

- typing a message in the widget returns a response from the local backend

## Step 7: Connect The Dashboard Overview To The Backend

Goal:

- make the merchant dashboard display real API data

What to do:

1. Open the dashboard JavaScript file.
2. Replace hardcoded numbers with a request to `/api/analytics/overview`.
3. Show the numbers from the response.

Done means:

- the dashboard cards are filled from the backend instead of fixed demo values

## Step 8: Add Support FAQ Data

Goal:

- make support answers come from stored business content

What to do:

1. Study the `/api/support/faqs` route.
2. Create a simple FAQ list in the backend first.
3. Show those answers in the storefront support flow.

Done means:

- the support mode can return real FAQ answers from backend data

## Step 9: Add Mock Image Flows First

Goal:

- make image-based features work in a simple way before real AI is added

What to do:

1. Use the existing `/api/inspire` route.
2. Use the existing `/api/complete-look` route.
3. Pretend the image name is enough to choose a result.
4. Show the detected tags and recommended products on screen.

Why this matters:

- you prove the product flow works before dealing with real image analysis

Done means:

- both image features work in a simple mock version

## Step 10: Create The Supabase Project

Goal:

- set up the real database

What to do:

1. Create a Supabase account.
2. Create a new project.
3. Open the SQL editor.
4. Copy the content of `supabase/schema.sql`.
5. Run the SQL.

What this creates:

1. merchants
2. products
3. product_tags
4. curated_looks
5. curated_look_items
6. faqs
7. knowledge_base_entries
8. chat_sessions
9. chat_messages
10. recommendation_events

Done means:

- your database tables exist in Supabase

## Step 11: Connect The Backend To Supabase

Goal:

- replace temporary mock data with saved data

What to do:

1. Add your Supabase keys to `.env`.
2. Create a helper file for Supabase access.
3. Save FAQs in the database.
4. Save chat messages in the database.
5. Save recommendation events in the database.

Start with these tables first:

1. faqs
2. chat_sessions
3. chat_messages
4. recommendation_events

Done means:

- your app keeps data after refresh instead of losing it

## Step 12: Create A Shopify Development Store

Goal:

- get a real store environment for testing

What to do:

1. Create a Shopify Partner account.
2. Create a development store.
3. Add sample fashion products.
4. Add product images, tags, prices, and collections.

Done means:

- you have a real test store with products

## Step 13: Import Products From Shopify

Goal:

- pull real catalog data into your app

What to do:

1. Create Shopify API credentials.
2. Save the credentials in `.env`.
3. Use the backend import route.
4. Request products from Shopify.
5. Save them in the `products` table.
6. Save tags in the `product_tags` table.

Done means:

- your app can read and store the merchant catalog

## Step 14: Add Basic Styling Compatibility Rules

Goal:

- teach the system how products work together

What to do:

1. Define simple outfit logic.
2. Create rules like:
   - blazer goes with trousers
   - sneakers go with casual looks
   - heels go with formal looks
   - linen shirt goes with summer looks
3. Store these rules in code first.
4. Later move them into the dashboard or knowledge base.

Done means:

- the assistant can recommend combinations instead of random products

## Step 15: Add OpenAI For Smarter Responses

Goal:

- upgrade from template replies to real AI replies

What to do:

1. Add your OpenAI key to `.env`.
2. Send the shopper request, catalog context, and styling rules to OpenAI.
3. Ask OpenAI to return a full outfit suggestion and reasoning.
4. Keep fallback logic in case the AI call fails.

Very important:

- do not send every product in a huge catalog at once
- start with a small filtered list of relevant products

Done means:

- the assistant gives more natural and useful replies

## Step 16: Add Google Vision For Real Image Detection

Goal:

- replace mock image handling with real image understanding

What to do:

1. Add your Google Vision credentials.
2. Upload an image from the storefront.
3. Send it to the backend.
4. Send it from the backend to Google Vision.
5. Read the labels or detected fashion clues.
6. Match those clues to store products.

Done means:

- image flows use real image analysis

## Step 17: Build Merchant Management Screens

Goal:

- allow store owners to control the AI system

What to build:

1. FAQ management
2. Look management
3. Knowledge base management
4. Catalog tag review
5. Analytics overview

Start with the easiest forms first:

1. FAQ create
2. FAQ edit
3. curated look create

Done means:

- a merchant can manage important AI content without editing code

## Step 18: Add The Widget To Shopify

Goal:

- show the assistant on a real storefront

What to do:

1. Use the theme app extension placeholder as the starting point.
2. Connect the widget file to your backend URL.
3. Install the extension in the development store.
4. Test on a product page and homepage.

Done means:

- the chat widget is visible in the Shopify store

## Step 19: Test Everything Slowly

Goal:

- make sure the app works end to end

What to test:

1. outfit request
2. image inspiration request
3. complete-the-look request
4. support question
5. dashboard metrics
6. catalog import
7. error cases

Also test:

1. mobile view
2. empty data
3. bad image input
4. missing product tags
5. failed OpenAI call
6. failed Google Vision call

Done means:

- the system works reliably enough for demo or pilot use

## Step 20: Prepare The MVP Demo

Goal:

- make the project easy to show to merchants or partners

What to prepare:

1. one test Shopify store
2. one merchant login
3. one set of sample products
4. one support FAQ set
5. one knowledge base sample
6. one curated look set

Done means:

- you can give a full demo without manual fixes during the meeting

## 14. Best Build Order For A Beginner

If you are starting from zero, use this order:

1. Read the docs
2. Open the static demos
3. Run the backend
4. Connect text chat
5. Connect dashboard metrics
6. Add support FAQ flow
7. Add mock image flows
8. Add Supabase
9. Add Shopify catalog import
10. Add compatibility rules
11. Add OpenAI
12. Add Google Vision
13. Add merchant forms
14. Add storefront Shopify extension
15. Test everything

## 15. Suggested 8-Week Beginner Timeline

### Week 1

- read the docs
- understand the folders
- open the static demos

### Week 2

- run the backend
- understand routes
- test API docs

### Week 3

- connect text chat to backend
- connect dashboard metrics to backend

### Week 4

- add support FAQ flow
- add mock image flows

### Week 5

- create Supabase project
- save FAQs and chats

### Week 6

- connect Shopify
- import products
- add product tags and simple styling rules

### Week 7

- connect OpenAI
- connect Google Vision

### Week 8

- improve merchant dashboard
- add final testing
- prepare demo

## 16. Common Beginner Mistakes To Avoid

1. Trying to build the full app before running the simple demo
2. Connecting too many services on the same day
3. Changing many files without testing
4. Starting with AI orchestration before the basic product flow works
5. Building fancy UI before the core logic works
6. Forgetting to save sample data for testing
7. Not writing down what changed

## 17. Recommended First Real Coding Tasks

If you want the simplest possible starting point, do only these 5 things first:

1. Run the backend
2. Open the storefront demo
3. Open the dashboard demo
4. Connect the storefront text chat to `/api/chat`
5. Connect the dashboard cards to `/api/analytics/overview`

That is enough to create your first working milestone.

## 18. Final Advice

You do not need to become an expert before building.
You only need to keep the next step small and clear.

When in doubt, ask this question:

"What is the smallest working version of this feature?"

That question will protect you from overwhelm.

