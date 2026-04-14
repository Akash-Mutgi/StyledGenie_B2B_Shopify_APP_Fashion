# StyledGenie MVP Implementation Tickets

This document converts the functional flows into practical implementation tickets for the MVP.

Each ticket includes:

- objective
- scope
- key files or systems
- dependencies
- acceptance criteria

## How To Use This Backlog

- Build tickets in order unless a dependency note says otherwise.
- Keep each ticket small enough to demo.
- Prefer review mode before auto-apply mode for Shopify admin write-backs.
- Do not add features outside this backlog unless they unblock a listed ticket.

## Status Legend

- `Now` = should be built immediately
- `Next` = build after the `Now` group
- `Later` = still MVP-relevant but not first demo-critical

---

## Epic 1: Shopper Chat Foundation

### SG-001 Shopper Session And Branded Chat Entry
Status: `Now`

Objective:
Open the widget with merchant-specific branding, session continuity, and a useful first state.

Scope:
- load assistant name, welcome title, welcome message, and logo
- create or resume `shopper_session`
- show quick prompt starters

Key files:
- `apps/storefront-widget/app.js`
- `apps/storefront-widget/index.html`
- `shopify/theme-app-extension/assets/chat-widget.js`
- `backend/app/services/supabase_service.py`
- `backend/app/services/conversation_service.py`

Dependencies:
- merchant workspace endpoint must return chatbot customization

Acceptance criteria:
- opening the chatbot shows merchant branding, not generic defaults
- quick prompts are visible and clickable
- repeat visitor session reuses previous chat context
- no support/styling confusion on first load

### SG-002 Intent Routing For Styling Vs Support
Status: `Now`

Objective:
Correctly route shopper input into styling or support without forcing separate bots.

Scope:
- route support questions to support answers
- route styling requests to stylist logic
- preserve single conversation thread

Key files:
- `backend/app/services/langchain_service.py`
- `backend/app/services/conversation_service.py`
- `backend/app/services/faq_service.py`

Dependencies:
- SG-001

Acceptance criteria:
- support questions return support answers
- outfit requests return styling output
- the same session can move from support to styling and back

### SG-003 Dynamic Shopper Profile Engine
Status: `Now`

Objective:
Build a usable profile from natural conversation instead of a rigid questionnaire.

Scope:
- capture style identity
- capture emotional context
- capture occasion and constraints
- capture confidence and decision style
- store profile summary for each session

Key files:
- `backend/app/services/shopper_profile_service.py`
- `backend/app/models/schemas.py`
- `backend/app/services/conversation_service.py`

Dependencies:
- SG-001
- SG-002

Acceptance criteria:
- each shopper session gets a profile object
- profile updates after each message
- profile affects follow-up prompts and response tone

### SG-004 Menswear And Womenswear Guardrails
Status: `Now`

Objective:
Guarantee that menswear and womenswear recommendations stay separated.

Scope:
- detect requested segment from user message
- filter shortlist before final AI reasoning
- allow compatible unisex fallback only when needed

Key files:
- `backend/app/services/recommendation_service.py`
- `backend/app/services/openai_service.py`
- `backend/app/services/langchain_service.py`

Dependencies:
- SG-003

Acceptance criteria:
- explicit menswear request returns no womenswear items
- explicit womenswear request returns no menswear items
- segment detection uses token-safe matching

---

## Epic 2: Recommendation Intelligence

### SG-005 Real Catalog Shortlisting Engine
Status: `Now`

Objective:
Shortlist only real Shopify products with practical ranking logic.

Scope:
- use synced Shopify catalog only
- rank by occasion, budget, style terms, compatibility, and segment
- penalize irrelevant accessories when not asked for

Key files:
- `backend/app/services/recommendation_service.py`
- `backend/app/services/catalog_intelligence_service.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-004
- synced catalog data available

Acceptance criteria:
- recommendations come from connected store only
- budget-aware queries influence ranking
- shortlist quality improves over raw keyword matching

### SG-006 Complete Outfit Recommendation Response
Status: `Now`

Objective:
Return full outfit logic instead of isolated product search results.

Scope:
- select anchor item
- build outfit around it
- explain outfit logic
- include product cards and reasoning

Key files:
- `backend/app/services/openai_service.py`
- `backend/app/services/langchain_service.py`
- `backend/app/services/conversation_service.py`
- `apps/storefront-widget/app.js`
- `shopify/theme-app-extension/assets/chat-widget.js`

Dependencies:
- SG-005

Acceptance criteria:
- response includes outfit title, breakdown, and why it works
- 2 to 4 product cards are shown
- explanation feels premium and non-generic

### SG-007 Recommendation Refinement Loop
Status: `Now`

Objective:
Let the shopper refine recommendations without restarting.

Scope:
- feedback buttons
- text-based refinement
- updated re-ranking
- feedback logging

Key files:
- `apps/storefront-widget/app.js`
- `shopify/theme-app-extension/assets/chat-widget.js`
- `backend/app/routers/chat.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-006

Acceptance criteria:
- `Show another option` triggers a new recommendation round
- `Make it more casual` changes the next shortlist
- refinement feedback appears in merchant analytics

### SG-008 Product Card Commerce Flow
Status: `Now`

Objective:
Turn recommendations into shoppable commerce actions.

Scope:
- real product links
- add to cart
- commerce attribution events

Key files:
- `shopify/theme-app-extension/assets/chat-widget.js`
- `backend/app/services/shopify_service.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-005
- product handles and variant IDs synced

Acceptance criteria:
- `View Product` opens the correct StyledGenie PDP
- `Add to Cart` works on Shopify storefront
- add-to-cart events are logged for analytics

---

## Epic 3: Image-Based Styling

### SG-009 Google Vision Image Intake
Status: `Now`

Objective:
Use real image signals for styling instead of filename-only heuristics.

Scope:
- file upload
- image URL input
- Google Vision analysis
- save detected tags and summary

Key files:
- `backend/app/services/vision_service.py`
- `backend/app/models/schemas.py`
- `apps/storefront-widget/app.js`
- `shopify/theme-app-extension/assets/chat-widget.js`

Dependencies:
- valid Google Vision credentials

Acceptance criteria:
- uploaded image or URL produces detected tags
- image summary is passed into conversation pipeline

### SG-010 Complete The Look Flow
Status: `Next`

Objective:
Use one uploaded item or partial outfit to suggest complementary pieces.

Scope:
- complete-the-look mode
- complementary product selection
- clear explanation of what the added pieces improve

Key files:
- `backend/app/services/conversation_service.py`
- `backend/app/services/recommendation_service.py`
- `backend/app/services/openai_service.py`

Dependencies:
- SG-009

Acceptance criteria:
- returned products complement, not duplicate, the uploaded item
- explanation makes clear why the additions improve balance

### SG-011 Get Inspired Flow
Status: `Next`

Objective:
Translate inspiration images into realistic in-store alternatives.

Scope:
- inspiration mode
- style direction extraction
- in-catalog translation
- confidence-building explanation

Key files:
- `backend/app/services/vision_service.py`
- `backend/app/services/conversation_service.py`
- `backend/app/services/openai_service.py`

Dependencies:
- SG-009

Acceptance criteria:
- inspiration image results feel stylistically aligned
- results stay realistic to the actual catalog

---

## Epic 4: Smart Customer Support

### SG-012 FAQ And Policy Response Layer
Status: `Now`

Objective:
Serve short, merchant-specific support answers inside the same assistant.

Scope:
- shipping
- returns
- refunds
- sizing
- damaged item support

Key files:
- `backend/app/services/faq_service.py`
- `backend/app/services/supabase_service.py`
- `backend/app/services/conversation_service.py`

Dependencies:
- merchant FAQ and policy data available

Acceptance criteria:
- support answers are concise and accurate
- merchant policy changes reflect in chatbot answers

### SG-013 Order Tracking Flow
Status: `Next`

Objective:
Support order tracking inside the chatbot.

Scope:
- collect order number and email
- validate shopper input
- return order status or fallback

Key files:
- `backend/app/services/conversation_service.py`
- `backend/app/services/shopify_service.py`
- `backend/app/services/faq_service.py`

Dependencies:
- order access available in Shopify app scopes

Acceptance criteria:
- shopper can request tracking without leaving chat
- invalid lookup returns safe guidance

### SG-014 Human Handoff Flow
Status: `Next`

Objective:
Escalate unresolved support issues to a human path.

Scope:
- detect escalation intent
- use merchant support contact settings
- log support escalation event

Key files:
- `backend/app/services/conversation_service.py`
- `backend/app/services/supabase_service.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- SG-012

Acceptance criteria:
- damaged item and unresolved issues trigger handoff guidance
- merchant can configure support contact path

---

## Epic 5: Merchant Control Center

### SG-015 Merchant Dashboard Live Workspace Snapshot
Status: `Now`

Objective:
Make the dashboard feel live with real connected-store data.

Scope:
- overview KPIs
- recent AI activity
- connected store info
- live product counts

Key files:
- `backend/app/services/supabase_service.py`
- `backend/app/routers/merchant.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- catalog sync working

Acceptance criteria:
- dashboard loads from real merchant workspace data
- no placeholder counts remain on main overview

### SG-016 Catalog Sync Action
Status: `Now`

Objective:
Allow merchants to refresh Shopify product data on demand.

Scope:
- sync button
- sync success or failure states
- last sync freshness in workspace

Key files:
- `apps/merchant-dashboard/app.js`
- `backend/app/routers/catalog.py`
- `backend/app/services/shopify_service.py`

Dependencies:
- valid Shopify app credentials

Acceptance criteria:
- clicking `Sync Catalog` updates the local intelligence layer
- dashboard reflects refreshed counts and product data

### SG-017 Chatbot Customization Controls
Status: `Now`

Objective:
Give merchants visible control over chatbot branding and behavior.

Scope:
- assistant name
- welcome title and message
- colors
- stylist tone
- quick prompts

Key files:
- `apps/merchant-dashboard/app.js`
- `apps/storefront-widget/app.js`
- `shopify/theme-app-extension/assets/chat-widget.js`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-015

Acceptance criteria:
- changes saved in dashboard appear in storefront widget
- preview and live widget stay aligned

### SG-018 Merchant AI Behavior Rules
Status: `Next`

Objective:
Let merchants shape recommendation behavior without editing code.

Scope:
- recommendation strictness
- product priority rules
- forbidden recommendation types
- tagging mode
- description write mode

Key files:
- `apps/merchant-dashboard/app.js`
- `backend/app/models/schemas.py`
- `backend/app/services/openai_service.py`

Dependencies:
- SG-017

Acceptance criteria:
- saved rules appear in AI prompt payload
- merchants can make the assistant stricter or more flexible

---

## Epic 6: Catalog Intelligence And Shopify Admin Value

### SG-019 AI Catalog Auto-Tagging
Status: `Next`

Objective:
Convert raw catalog products into styling-ready intelligence.

Scope:
- style tags
- occasion tags
- fit and silhouette tags
- season and color family
- pairing logic

Key files:
- `backend/app/services/catalog_intelligence_service.py`
- `backend/app/services/shopify_service.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-016

Acceptance criteria:
- synced products have structured styling tags
- merchant can see catalog intelligence coverage

### SG-020 Shopify Tag And Metafield Write-Back
Status: `Later`

Objective:
Push approved AI-generated tags and metafields back to Shopify admin safely.

Scope:
- review mode queue
- optional auto-apply mode
- non-destructive updates

Key files:
- `backend/app/services/shopify_service.py`
- `backend/app/services/supabase_service.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- SG-019

Acceptance criteria:
- merchant can review suggested changes
- approved changes update Shopify safely

### SG-021 AI Product Description Drafting
Status: `Next`

Objective:
Generate concise, polished product descriptions using product data plus AI styling signals.

Scope:
- single-product draft generation
- review and apply flow
- merchant-controlled overwrite rules

Key files:
- `backend/app/services/openai_service.py`
- `backend/app/services/shopify_service.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- SG-019

Acceptance criteria:
- generated descriptions sound like fashion-commerce copy
- merchant can review before applying

### SG-022 Merchant Look Builder
Status: `Next`

Objective:
Generate and save curated looks from a hero product.

Scope:
- choose hero product
- generate 2 to 3 outfit drafts
- save editing and look records

Key files:
- `apps/merchant-dashboard/app.js`
- `backend/app/services/openai_service.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-019

Acceptance criteria:
- merchant can generate, edit, and save looks
- saved looks are visible in merchant workspace

---

## Epic 7: Merchant Knowledge And Customer Care Setup

### SG-023 Knowledge Base And AI Training Entries
Status: `Next`

Objective:
Let merchants train the assistant with brand and policy context.

Scope:
- styling rules
- brand guidance
- fitting guidance
- policy notes

Key files:
- `apps/merchant-dashboard/app.js`
- `backend/app/services/supabase_service.py`
- `backend/app/services/openai_service.py`

Dependencies:
- SG-017

Acceptance criteria:
- new knowledge entries are saved and later appear in AI prompt context

### SG-024 Customer Care Setup
Status: `Next`

Objective:
Configure FAQs and support escalation inside the merchant dashboard.

Scope:
- FAQ editing
- support email
- handoff copy

Key files:
- `apps/merchant-dashboard/app.js`
- `backend/app/services/faq_service.py`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-012

Acceptance criteria:
- dashboard changes affect chatbot support responses
- escalation path is merchant-specific

---

## Epic 8: Analytics And Merchant Trust

### SG-025 Recommendation Feedback Analytics
Status: `Now`

Objective:
Show merchants what shoppers respond to.

Scope:
- love it
- show another option
- make it more casual
- change colours
- save for later

Key files:
- `backend/app/services/supabase_service.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- feedback events already being logged

Acceptance criteria:
- dashboard shows reaction counts and preference signals

### SG-026 Bot Analytics Dashboard
Status: `Next`

Objective:
Expose live chatbot performance in a merchant-friendly way.

Scope:
- conversation volume
- support vs styling mix
- top journeys
- drop-off signals
- unresolved intent hints

Key files:
- `apps/merchant-dashboard/app.js`
- `apps/merchant-dashboard/styles.css`
- `backend/app/services/supabase_service.py`

Dependencies:
- SG-015
- SG-025

Acceptance criteria:
- Bot Analytics page uses live data, not placeholders

### SG-027 Orders And AI-Assisted Commerce Metrics
Status: `Later`

Objective:
Show real AI-assisted revenue, AOV, and conversion where Shopify order data is available.

Scope:
- order sync
- AI attribution logic
- dashboard metrics

Key files:
- `backend/app/services/shopify_service.py`
- `backend/app/services/supabase_service.py`
- `apps/merchant-dashboard/app.js`

Dependencies:
- Shopify `read_orders`
- add-to-cart attribution events

Acceptance criteria:
- dashboard shows real order-derived metrics when data exists

---

## Recommended Build Sequence

Phase 1:
- SG-001
- SG-002
- SG-003
- SG-004
- SG-005
- SG-006
- SG-008
- SG-015
- SG-016
- SG-017
- SG-025

Phase 2:
- SG-007
- SG-009
- SG-010
- SG-011
- SG-012
- SG-013
- SG-014
- SG-018
- SG-019
- SG-021
- SG-022
- SG-023
- SG-024
- SG-026

Phase 3:
- SG-020
- SG-027

## Best First Coding Ticket

If we start coding one flow at a time, the best next ticket is:

`SG-006 Complete Outfit Recommendation Response`

Reason:
- highest shopper-visible value
- directly improves perceived intelligence
- builds on the catalog and profile work already in the repo
- easiest to demo to a merchant
