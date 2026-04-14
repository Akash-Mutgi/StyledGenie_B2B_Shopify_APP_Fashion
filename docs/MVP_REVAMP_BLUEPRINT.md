# StyledGenie MVP Revamp Blueprint

## Step 1. Current Audit

### What exists today
- A working FastAPI backend with routers for chat, merchant workspace, analytics, catalog sync, and support.
- A Supabase-backed merchant workspace that already stores merchant profile, chatbot customization, catalog intelligence, looks, FAQs, and knowledge-base entries.
- Shopify catalog sync that imports real products and order-related snapshots.
- A storefront demo widget and Shopify theme widget that already render recommendations, styling insights, and product cards.
- A merchant dashboard with multiple sections and live workspace loading.
- OpenAI-based recommendation copy generation, plus local fallback logic when OpenAI is unavailable.
- A catalog intelligence layer that adds fashion-aware tags to imported products.

### What is weak
- Chat orchestration was previously spread across the router layer instead of being handled by a reusable conversation service.
- Shopper memory and profile reasoning were shallow, so conversations could feel generic across turns.
- Image flows depended on mock file-name parsing instead of a richer interpretation layer.
- Merchant controls existed visually, but the recommendation engine had limited behavioral inputs from them.
- Storefront responses had good product cards, but weaker “why this is right for me” guidance and next-step steering.

### What is missing
- A dynamic shopper profile that combines emotional intent, confidence, practicality, and styling direction.
- A clear response framework that consistently blends empathy with logic.
- A merchant-visible control surface for recommendation strictness, product priority, and forbidden suggestion patterns.
- A practical MVP-safe way to ingest inspiration links from social platforms without overbuilding native social integrations.

### What should be preserved
- Supabase as the source of merchant memory and connected-store context.
- Shopify sync and catalog intelligence as the foundation for real recommendations.
- Existing product-card rendering, add-to-cart flow, and merchant dashboard shell.
- OpenAI as the reasoning layer on top of real catalog candidates, not as a catalog source.

### What should be refactored
- Move chat flow into a dedicated orchestration service.
- Introduce a reusable shopper profile service.
- Pass merchant controls and shopper profile into AI reasoning.
- Improve storefront rendering so profile understanding, confidence cues, and next-best actions are visible.

## Step 2. Updated MVP Architecture

### Core modules
- `ConversationService`
  - routes styling vs support flows
  - manages session logging
  - enriches each turn with shopper profile and recent memory
- `ShopperProfileService`
  - infers shopper state from text, image signals, constraints, and hesitation behavior
- `RecommendationService`
  - ranks only real connected-store products from Supabase
- `OpenAIService`
  - selects from shortlisted products
  - writes empathetic, logic-based stylist replies
  - adapts tone using shopper profile + merchant rules
- `VisionService`
  - MVP-safe interpretation layer for uploaded image references and pasted inspiration URLs
- `SupabaseService`
  - merchant memory
  - session memory
  - feedback loop
  - workspace snapshot
- `ShopifyService`
  - syncs products and commerce context
  - feeds merchant dashboard and recommendation inventory

### Data flow
1. Merchant connects Shopify store and syncs catalog.
2. Products are stored in Supabase and enriched with catalog-intelligence tags.
3. Shopper sends message or image reference.
4. Conversation service logs the turn and fetches recent session history.
5. Shopper profile service infers the current shopper state.
6. Recommendation service ranks live catalog candidates using query terms built from the profile.
7. OpenAI chooses the best shortlist items and writes the shopper-facing stylist response.
8. Storefront renders:
   - reply
   - profile summary
   - product cards
   - styling insights
   - next-step prompts
   - feedback actions
9. Feedback and events flow back into Supabase and inform future turns plus merchant analytics.

### Frontend responsibilities
- Storefront widget
  - collect text/image/image-url input
  - show polished conversation UI
  - render cards, insights, profile cues, and next actions
- Merchant dashboard
  - configure brand and AI behavior
  - show catalog health and AI performance
  - act as the “brain” for the connected store

### Backend responsibilities
- session + memory handling
- product retrieval and ranking
- AI orchestration
- support answer routing
- merchant control enforcement
- feedback logging and merchant analytics updates

## Step 3. Unique Shopper Profiling Framework

### Framework name
`Style State Matrix`

This is a dynamic shopper-state model, not a fixed quiz.

### Profile dimensions
- `style_identity`
  - minimal, polished, expressive, relaxed, romantic, trend-aware
- `shopping_intent`
  - outfit curation, finish existing look, translate inspiration, support resolution
- `emotional_context`
  - needs reassurance, wants to impress, comfort protective, body conscious, time pressed, experimental
- `occasion_context`
  - work, dinner, event, weekend, travel, inspiration-driven
- `confidence_level`
  - low, medium, high
- `decision_style`
  - guided, comparative, decisive
- `experimentation_preference`
  - safe, balanced, experimental
- `practical_constraints`
  - budget aware, comfort first, low effort, versatile
- `silhouette_goals`
  - sharper, slimmer, softer, elevated
- `image_signals`
  - inspiration tags from uploaded image or pasted URL
- `focus_points`
  - concise summary chips shown to the shopper

### State detection logic
- user text
- recent customer messages
- feedback behaviors such as “show another option” or “make more casual”
- detected image tags
- practical language such as budget or comfort needs
- hesitation cues such as “not sure”, “won’t suit me”, or “safe option”

### Update rules
- infer a fresh profile every turn
- blend current request with recent session memory
- let feedback actions nudge the next state
- never treat the shopper profile as permanent identity; treat it as current styling state

### How the profile changes recommendations
- product ranking
  - prioritize safer, easier-to-style items for low-confidence shoppers
- explanation style
  - more reassuring for uncertain shoppers
  - more direct for decisive shoppers
- tone
  - emotionally aware but commercially focused
- cross-sell logic
  - comfort-first shoppers get practical complements
  - expressive shoppers can receive stronger statement accents

## Step 4. Improved Response System

### Response pattern
`Acknowledge -> Decide -> Explain -> Reassure -> Guide next step`

### Example structure
1. Acknowledge the shopper’s goal, mood, or hesitation.
2. State the outfit direction clearly.
3. Explain why the selected pieces work.
4. Give confidence without sounding theatrical.
5. Offer 2 to 3 next-best actions.

### Empathy rules
- validate uncertainty without overdramatizing it
- avoid judgmental or body-negative phrasing
- use confidence-building language only when it is grounded in logic

### Logic explanation rules
- explain silhouette balance
- explain occasion fit
- explain comfort/practicality tradeoffs
- explain why the recommendation is easier to say yes to
- never rely on empty compliments

### Fallback rules
- if OpenAI is unavailable, still return:
  - real product cards
  - logic-based local response
  - styling insights
  - next-step prompts
- if catalog match is weak, ask for one useful refinement rather than bluffing
- if image analysis is limited, use visible signals plus merchant catalog logic

### Tone principles
- premium
- warm
- intelligent
- concise
- non-repetitive
- fashion-aware
- commercially useful

## Step 5. Implementation Roadmap

### Build first
1. conversation orchestration service
2. shopper profile service
3. storefront profile summary + next-step prompts
4. merchant AI controls that actually feed OpenAI
5. richer image input via direct URLs

### Refactor now
- chat router logic
- recommendation prompt inputs
- storefront response rendering

### Keep but improve later
- Google Vision real API integration
- LangChain routing only when workflows genuinely become complex
- merchant look builder generation
- product description generation in Shopify admin

### Cut from this MVP slice
- native Instagram/Pinterest OAuth integrations
- heavy agentic workflows
- full-blown body-measurement personalization
- automated destructive Shopify overwrites

## Step 6. Highest-Priority Improvements Implemented In Code

### Backend
- Added `ConversationService` to centralize stylist/support orchestration.
- Added `ShopperProfileService` to infer current shopper state from text, history, and image signals.
- Extended chat responses with:
  - `shopper_profile`
  - `follow_up_prompts`
- Enriched OpenAI payloads with:
  - shopper profile
  - recent session memory
  - merchant AI controls
- Added session message/event fetch helpers for memory-aware recommendations.
- Expanded image requests to support pasted inspiration URLs.

### Storefront
- Added profile-summary cards that show what the stylist is optimizing for.
- Added next-step prompt chips after each recommendation.
- Added support for pasted Instagram/Pinterest/image URLs in image flows.
- Synced merchant-provided prompt suggestions into the live welcome state.

### Merchant controls
- Extended catalog intelligence to include:
  - recommendation strictness
  - product priority rules
  - forbidden recommendation types
  - tagging mode
  - description write mode
- Wired those controls into the AI prompt context.

### Next code slice after this
- merchant-side AI look builder
- AI product description generation with safe review mode
- richer visual intelligence with Google Vision
