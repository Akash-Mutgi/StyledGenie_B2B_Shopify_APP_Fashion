# StyledGenie MVP Detailed Functional Flows

This document defines the click-by-click functional flows for the StyledGenie MVP.

The goal is to make the shopper chatbot and merchant dashboard practical, testable, and implementation-ready without adding unnecessary complexity outside MVP.

## Scope Rules

- This is an MVP flow document, not a future-state enterprise architecture.
- Shopify storefront image flows support file upload and pasted image URLs. Native Instagram or Pinterest OAuth is not required for MVP.
- Shopify admin write-backs should default to safe review mode unless the merchant explicitly enables auto-apply mode.
- All recommendations must come from the connected Shopify catalog.
- Menswear and womenswear flows must stay separate.

## Core System Objects

- `shopper_session`: active user session for the storefront chatbot
- `shopper_profile`: dynamic style + intent + emotional profile built during conversation
- `catalog_product`: synced Shopify product enriched with tags/metafields
- `recommendation_event`: logged recommendation or support interaction
- `merchant_workspace`: merchant dashboard configuration, AI rules, and analytics state
- `look_record`: merchant-curated or AI-generated outfit set
- `policy_entry`: FAQ, shipping, returns, or care knowledge entry

## Global Shopper Logic

These rules apply to all shopper-facing flows.

1. When the shopper opens the chatbot, create or load `shopper_session`.
   UI: widget opens with assistant name, welcome title, and starter prompts.
   System: load merchant chatbot settings and recent session data.
   Logic: if prior session exists, reuse profile and message history.
   Output: shopper sees a personalized or brand-aware greeting.

2. On every shopper message, update `shopper_profile`.
   UI: typing state appears.
   System: classify intent, enrich profile, log customer message, shortlist products, generate response.
   Logic: use text, recent messages, image tags, hesitation signals, budget phrases, and prior feedback.
   Output: response tone, product selection, and follow-up prompts adapt to profile.

3. Every recommendation must be explainable.
   UI: recommendation cards plus `Why this works` block.
   System: store selected product IDs, logic explanation, and shopper feedback.
   Logic: explain anchor item, silhouette balance, color harmony, occasion fit, comfort, and confidence level.
   Output: shopper understands why the look was selected.

4. Menswear and womenswear must be kept separate.
   UI: no mixed-gender outfit cards in one answer.
   System: segment request, segment catalog, and filter shortlist before final AI reasoning.
   Logic: if shopper explicitly says menswear or womenswear, strict segment match wins. Use unisex only when compatible and necessary.
   Output: coherent outfit structures.

## 1. Chatbot Entry Flow

### Goal
Open the chatbot and guide the shopper into the most relevant next action.

### Trigger
Shopper clicks the launcher or floating widget.

### Flow
1. Shopper clicks the chat launcher.
   UI: widget expands; header shows merchant logo, assistant name, welcome title, and mode buttons.
   System: fetch merchant customization and session state from backend.
   Logic: if merchant saved a custom welcome message, show it. Otherwise show default StyledGenie welcome.
   Output: chatbot opens in `Outfit Curation` mode by default.

2. Widget renders quick prompt chips.
   UI: examples such as `Style me for dinner`, `Get inspired`, `Complete the look`, `Track my order`.
   System: map each chip to a mode and starter prompt.
   Logic: prioritize styling chips first and support chips second.
   Output: shopper is nudged toward a first action instead of seeing an empty bot.

3. Shopper chooses a mode or types freely.
   UI: active mode pill changes.
   System: save active mode in the session.
   Logic: free text can still override the active mode if intent routing detects support or image-led styling intent.
   Output: smoother entry into the correct flow.

## 2. Dynamic User Profiling Flow

### Goal
Build a useful style profile without forcing a boring form.

### Trigger
First shopper message or image upload.

### Flow
1. Shopper types a request such as `I need a polished dinner look under 150 euros`.
   UI: message appears in chat.
   System: create or update `shopper_profile`.
   Logic: extract style identity, shopping intent, occasion, budget awareness, confidence level, and decision style.
   Output: profile state becomes richer after each turn.

2. If gender segment is unclear, the assistant asks a light-touch clarifier only when needed.
   UI: `Would you like me to keep this in menswear or womenswear?`
   System: route answer back into profile.
   Logic: do not ask if the shopper already said menswear or womenswear.
   Output: catalog shortlist becomes segment-safe.

3. If hesitation is detected, adjust tone.
   UI: assistant sounds reassuring, not pushy.
   System: add signals like `needs reassurance`, `wants low effort confidence`, or `budget-aware`.
   Logic: look for phrases like `not sure`, `don't want to look overdressed`, `I want something easy`.
   Output: explanation style becomes more confidence-building.

4. If the shopper uploads an image or pastes a social/image URL, add image signals.
   UI: upload or pasted URL is accepted.
   System: run Google Vision analysis and store visual cues in profile.
   Logic: extract item types, colors, mood, apparent occasion, and styling direction.
   Output: profile now reflects visual context as well as text.

## 3. Menswear/Womenswear Selection Flow

### Goal
Guarantee the recommendation engine respects the shopper’s requested segment.

### Trigger
Explicit menswear or womenswear request, or clarification answer.

### Flow
1. Shopper types `menswear`, `womenswear`, `for men`, or `for women`.
   UI: nothing special changes visually.
   System: segment detector marks `target_segment`.
   Logic: use token-based detection, not substring matching.
   Output: backend filters shortlist to the correct segment before response generation.

2. Recommendation shortlist is built.
   UI: typing state.
   System: rank products with segment, budget, and occasion-aware scoring.
   Logic: strict segment products first, compatible unisex later only if needed.
   Output: cards shown to shopper are segment-correct.

3. If the connected store lacks enough products in that segment, the assistant explains the limitation.
   UI: assistant says it is pulling the closest available options and may ask to loosen constraints.
   System: fallback to best compatible options only when segment inventory is insufficient.
   Logic: never silently mix menswear and womenswear if a strict segment was explicitly requested.
   Output: trust is preserved.

## 4. Full Outfit Recommendation Flow

### Goal
Return a full, logic-based outfit instead of isolated products.

### Trigger
Shopper enters an outfit request in `Outfit Curation` mode.

### Flow
1. Shopper enters a request.
   UI: `Send` button clicked.
   System: log message, resolve mode, build profile, shortlist catalog items.
   Logic: parse occasion, mood, budget, preferred polish level, and practical constraints.
   Output: shortlist of 6 to 8 candidate products.

2. Backend chooses an anchor item.
   UI: typing state remains visible.
   System: score likely anchor categories based on request.
   Logic: for menswear, anchor is often shirt, jacket, knit, trouser, or sneaker. For womenswear, anchor may be jacket, dress, skirt, trouser, knit, or shoe depending on the ask.
   Output: one clear styling direction.

3. Backend builds the look around the anchor.
   UI: no additional shopper action.
   System: compatibility rules evaluate silhouette, bucket coverage, and color harmony.
   Logic: prioritize outfit completeness over random top-scoring items.
   Output: 2 to 4 final recommendation cards.

4. Assistant returns the recommendation.
   UI: response shows:
   Outfit title
   Outfit breakdown
   Why this works
   Optional safer or bolder variation
   Product cards
   Follow-up prompt chips
   System: log recommendation event and selected products.
   Logic: explanation should feel premium, concise, and confidence-building.
   Output: shopper understands both the products and the reasoning.

## 5. Recommendation Refinement Flow

### Goal
Let the shopper improve a recommendation without restarting the conversation.

### Trigger
Shopper clicks feedback or types a refinement.

### Flow
1. Shopper clicks a refinement button such as `Show another option`, `Make it more casual`, `Change colours`, or `Keep it under my budget`.
   UI: chip becomes active or disabled briefly.
   System: log feedback event tied to the recommendation.
   Logic: convert the feedback into new ranking constraints.
   Output: next recommendation round is more relevant.

2. Shopper can also type a free-text refinement such as `Make it sharper` or `I want flatter shoes`.
   UI: typed message appears as normal.
   System: update `shopper_profile` and rerun recommendation.
   Logic: refinement has higher priority than prior default assumptions.
   Output: adjusted outfit cards and new explanation.

3. Merchant dashboard receives the feedback signal.
   UI: merchant later sees reaction counts and top preference signals.
   System: aggregate feedback in analytics summary.
   Logic: do not retrain instantly; use aggregated patterns.
   Output: merchant learns what shoppers actually respond to.

## 6. Complete The Look Image Upload Flow

### Goal
Use a shopper’s current item or partial outfit as the starting point and suggest complementary products.

### Trigger
Shopper clicks `Complete The Look`.

### Flow
1. Shopper clicks `Complete The Look`.
   UI: upload panel becomes visible with file input and URL input.
   System: mode switches to `complete_the_look`.
   Logic: preserve current session and profile.
   Output: shopper is ready to upload.

2. Shopper uploads an image or pastes an image URL.
   UI: selected file name or URL remains visible.
   System: send image content or image URL to backend.
   Logic: use Google Vision to extract detected items, colors, and mood cues.
   Output: image is analyzed.

3. Shopper clicks `Send`.
   UI: assistant typing state says it is finishing the look.
   System: shortlist complementary products.
   Logic: avoid duplicates of the uploaded item category. Suggest missing categories that improve balance.
   Output: complementary product cards only.

4. Assistant explains the recommendation.
   UI: `Why this works` block says how the additions complete the silhouette, make the look more polished, or add practicality.
   System: log event type `complete_the_look`.
   Logic: explanation should make it obvious why each addition matters.
   Output: shopper sees a clearer finished look.

## 7. Get Inspired Image Upload Flow

### Goal
Translate a fashion reference into purchasable in-store alternatives.

### Trigger
Shopper clicks `Get Inspired`.

### Flow
1. Shopper clicks `Get Inspired`.
   UI: upload panel opens.
   System: mode switches to `get_inspired`.
   Logic: preserve session and past style context.
   Output: ready for image upload or pasted URL.

2. Shopper uploads a celebrity, Pinterest, Instagram, or image URL reference.
   UI: image source is accepted.
   System: run Google Vision analysis.
   Logic: extract colors, apparel cues, probable styling direction, and mood.
   Output: detected tags and vision summary.

3. Backend translates inspiration into catalog terms.
   UI: typing state.
   System: convert `structured, minimal, monochrome, smart casual` style signals into candidate search terms.
   Logic: stay realistic to the store inventory.
   Output: shortlisted in-store alternatives.

4. Assistant responds with translation, not imitation.
   UI: reply explains the style mood and how it has been adapted into products that can actually be bought.
   System: log event type `get_inspired`.
   Logic: never pretend the store has exact celebrity duplicates if it does not.
   Output: inspiring but believable recommendations.

## 8. Smart Customer Support Flow

### Goal
Handle support questions without making the assistant feel like a separate bot.

### Trigger
Shopper clicks `Support` or types a support question.

### Flow
1. Shopper asks a support question like `What is your return policy?`
   UI: question appears in chat.
   System: intent routing classifies request as `support`.
   Logic: support wins only when support intent is clearly primary.
   Output: FAQ or policy answer instead of styling output.

2. Assistant responds in the same chat.
   UI: no context switch to a separate support page.
   System: query merchant FAQs and policy entries.
   Logic: answer should be concise and human, not a pasted legal wall.
   Output: support answer in the same widget.

3. If the shopper returns to styling, the session continues.
   UI: shopper can ask `Now style me something for Friday night`.
   System: mode is re-resolved on every message.
   Logic: support and styling should coexist in one conversation thread.
   Output: fluid chat experience.

## 9. Order Tracking Flow

### Goal
Let shoppers check order status without leaving the chatbot.

### Trigger
Shopper types `Track my order` or clicks a support chip.

### Flow
1. Shopper clicks `Track my order`.
   UI: assistant asks for order number and email.
   System: set session into a temporary tracking subflow.
   Logic: collect only required fields.
   Output: shopper knows what to provide.

2. Shopper enters order number and email.
   UI: message submitted in chat.
   System: validate format and query order data source.
   Logic: if Shopify order access is available, fetch order and fulfillment status. If not, return a safe message explaining tracking is not fully available and offer human help.
   Output: tracking result or fallback.

3. Assistant shows result.
   UI: order status, fulfillment state, and tracking link if available.
   System: log support event.
   Logic: do not expose data if email/order mismatch fails validation.
   Output: secure tracking answer.

## 10. Returns / FAQ / Human Handoff Flow

### Goal
Handle post-purchase help cleanly and escalate when needed.

### Trigger
Shopper asks about returns, refunds, damaged items, or unresolved help.

### Flow
1. Shopper asks `Can I return this?`
   UI: message appears normally.
   System: fetch the best matching FAQ or policy answer.
   Logic: compress policy into shopper-friendly language.
   Output: clear return guidance.

2. If question indicates damage, exception, or unresolved issue, offer handoff.
   UI: assistant responds with next step and support contact path.
   System: create a human-handoff event.
   Logic: trigger handoff on phrases like `damaged`, `wrong item`, `still not solved`, `need help`.
   Output: shopper is guided toward a real support path.

3. If merchant has email-only handoff in MVP, assistant provides that route.
   UI: `Please email info@... with your order number and photos.`
   System: log support escalation.
   Logic: handoff path is merchant-configurable in dashboard.
   Output: consistent escalation experience.

## 11. Product CTA Flow

### Goal
Move the shopper from recommendation to commerce action.

### Trigger
Recommendation cards are shown.

### Flow
1. Shopper clicks `View Product`.
   UI: product page opens on the merchant storefront.
   System: use the real Shopify product URL.
   Logic: URL must come from synced product handle or stored product URL.
   Output: shopper lands on the correct PDP.

2. Shopper clicks `Add to Cart`.
   UI: button changes state or shows success note.
   System: use Shopify cart API and selected variant ID.
   Logic: add only if `shopify_variant_id` is present.
   Output: product is added to cart.

3. System logs commerce intent.
   UI: no extra shopper step required.
   System: create cart attribution event for analytics.
   Logic: use this later for AI-assisted revenue and conversion metrics.
   Output: merchant analytics improves.

## 12. Merchant Dashboard Overview Flow

### Goal
Give merchants one clear control center for AI performance and store intelligence.

### Trigger
Merchant opens the dashboard.

### Flow
1. Merchant opens the dashboard home.
   UI: `Dashboard Overview` loads with KPI cards, synced catalog summary, AI activity, and product readiness.
   System: load workspace snapshot from Supabase.
   Logic: show live store domain, product count, interaction counts, and recent AI activity.
   Output: merchant sees current system state.

2. Merchant scans overview cards.
   UI: cards for conversations, outfit recommendations, image requests, support questions, products imported, and feedback summary.
   System: aggregate from chat messages, recommendation events, feedback logs, and catalog tables.
   Logic: all metrics should be derived from stored events, not hardcoded placeholders.
   Output: dashboard feels live and trustworthy.

## 13. Catalog Sync Flow

### Goal
Pull the latest Shopify products into StyledGenie.

### Trigger
Merchant clicks `Sync Catalog`.

### Flow
1. Merchant clicks `Sync Catalog`.
   UI: button enters loading state and status pill updates.
   System: call backend catalog import endpoint.
   Logic: ensure merchant store is connected and app credentials are valid.
   Output: sync process starts.

2. Backend pulls products from Shopify.
   UI: merchant sees progress or completion toast.
   System: upsert merchant record, refresh product records, refresh tags/metafields cache, refresh order metrics if enabled.
   Logic: replace only synced catalog records for that merchant, not unrelated merchant data.
   Output: local intelligence dataset is current.

3. Dashboard refreshes.
   UI: product counts, recent products, and sync freshness update.
   System: fetch updated workspace snapshot.
   Logic: catalog sync timestamp should be visible.
   Output: merchant sees successful refresh.

## 14. AI Auto-Tagging Flow

### Goal
Turn raw Shopify products into styling-ready intelligence.

### Trigger
Catalog sync completes or merchant manually triggers tagging.

### Flow
1. Product is synced into StyledGenie.
   UI: no immediate merchant click required if auto-tagging is enabled.
   System: send product title, category, description, and image cues into tagging pipeline.
   Logic: generate structured tags such as style, occasion, season, fit, color family, mood, and pairing logic.
   Output: enriched tag set on the internal product record.

2. If Shopify write-back is enabled in review mode, queue suggestions.
   UI: merchant sees proposed tag suggestions in Catalog Intelligence.
   System: store suggested tags/metafields separately from current Shopify values.
   Logic: do not overwrite live Shopify data silently in review mode.
   Output: merchant can approve or reject.

3. If auto-apply is enabled, push safe updates.
   UI: status indicator shows applied.
   System: write tags/metafields to Shopify admin.
   Logic: append intelligently, avoid destructive overwrites, keep audit trail where possible.
   Output: Shopify product data becomes AI-enriched.

## 15. AI Product Description Generation Flow

### Goal
Help merchants create concise, fashion-commerce-ready descriptions.

### Trigger
Merchant opens Catalog Intelligence or Product Description tool and clicks generate.

### Flow
1. Merchant selects a product or batch.
   UI: product row or detail card shows `Generate Description`.
   System: fetch product source fields and AI tag data.
   Logic: use title, category, tags, mood, silhouette, and visual cues.
   Output: prompt-ready description payload.

2. Merchant clicks `Generate Description`.
   UI: button enters loading state.
   System: call OpenAI description generation flow.
   Logic: produce short, clear, premium fashion copy; avoid SEO spam or hallucinated fit claims.
   Output: proposed description draft.

3. Merchant reviews the output.
   UI: compare current and suggested description.
   System: store draft in review queue.
   Logic: auto-overwrite only if merchant enabled auto-apply.
   Output: safe merchant control over copy updates.

4. Merchant clicks `Apply to Shopify`.
   UI: success toast or status update.
   System: push description to Shopify admin.
   Logic: preserve auditability and avoid destructive write without consent.
   Output: live Shopify product description updated.

## 16. Merchant Look Builder Flow

### Goal
Generate styled outfit sets from a hero product.

### Trigger
Merchant opens `Look Management` or `Bot Builder` and selects a product.

### Flow
1. Merchant chooses a hero product.
   UI: product selector or recent product list.
   System: load product data and compatible catalog candidates.
   Logic: use bucket compatibility and brand rules.
   Output: look-builder workspace opens.

2. Merchant clicks `Generate Looks`.
   UI: loading state and draft outfit cards appear.
   System: create 2 to 3 outfit variations.
   Logic: each look must include outfit structure, styling note, and occasion use case.
   Output: merchant sees draft looks.

3. Merchant edits or saves a look.
   UI: inline form for title, occasion, styling note, and included products.
   System: save to `look_record`.
   Logic: merchant can accept AI draft and then refine manually.
   Output: reusable curated look is stored.

4. Saved looks can influence shopper recommendations.
   UI: no shopper action required.
   System: include curated looks in merchant context used by stylist.
   Logic: curated looks can guide response tone and outfit logic.
   Output: more brand-consistent recommendations.

## 17. Merchant Settings / AI Behavior Controls Flow

### Goal
Give merchants clear control over how StyledGenie behaves.

### Trigger
Merchant opens `Chatbot Customization` or `Settings`.

### Flow
1. Merchant edits assistant name, welcome title, and welcome message.
   UI: live preview updates immediately.
   System: auto-save or save on submit depending on form behavior.
   Logic: storefront widget should reflect the saved values.
   Output: chatbot branding updates.

2. Merchant edits AI controls.
   UI: fields for recommendation strictness, product priority rules, forbidden recommendation types, tone, and review mode.
   System: save to merchant workspace.
   Logic: these settings must be passed into recommendation and generation prompts.
   Output: merchant can shape AI behavior safely.

3. Merchant changes preview styling.
   UI: preview surface, accent, bubble, and text colors update.
   System: save customizer settings.
   Logic: storefront widget consumes the same settings payload.
   Output: stronger brand fit.

## 18. Knowledge / Policy Setup Flow

### Goal
Train the assistant with merchant-specific rules, brand guidance, and policy content.

### Trigger
Merchant opens `Knowledge & AI Training`.

### Flow
1. Merchant adds a knowledge entry.
   UI: form for title, type, and body.
   System: save knowledge base entry.
   Logic: allow types like brand voice, styling rule, fitting guidance, shipping note, and support policy.
   Output: new knowledge is stored.

2. Merchant edits brand rules.
   UI: text areas for target customer, positioning, compatibility rules, and fit guidance.
   System: save to workspace.
   Logic: these rules shape product ranking and AI copy.
   Output: merchant AI becomes brand-aware.

3. Merchant updates shipping or returns content.
   UI: editable policy entries.
   System: save policy entries and expose them to support routing.
   Logic: customer support answers should prefer this live merchant data.
   Output: support answers stay accurate.

## 19. Customer Care Setup Flow

### Goal
Control how the support side of the chatbot behaves.

### Trigger
Merchant opens `Customer Care Setup`.

### Flow
1. Merchant edits FAQs.
   UI: FAQ rows with question and answer fields.
   System: save to `policy_entry` or FAQ table.
   Logic: latest merchant answer overrides generic fallback copy.
   Output: accurate support answers.

2. Merchant sets escalation or handoff details.
   UI: support email, optional phone, optional handoff note.
   System: save escalation config.
   Logic: when support intent requires human help, assistant uses these settings.
   Output: support path is defined.

3. Merchant can test support flows.
   UI: dashboard test prompt or preview panel.
   System: run mock support question through the same support routing.
   Logic: merchant can validate answers before going live.
   Output: better trust in setup.

## 20. Analytics Flow

### Goal
Show merchants whether the AI is commercially useful.

### Trigger
Merchant opens Overview, Bot Analytics, or Bot Builder analytics blocks.

### Flow
1. Merchant opens analytics panels.
   UI: KPI cards, top journeys, feature performance, feedback summary, recent activity, and recommendation product tables.
   System: fetch aggregated workspace snapshot.
   Logic: metrics should come from chat sessions, recommendation events, feedback logs, sync status, and order attribution when available.
   Output: merchant sees performance.

2. Merchant reviews `Needs Attention`.
   UI: flagged cards for low-performing journeys, outdated training, or missing policy setup.
   System: generate action items from current workspace state.
   Logic: only show actionable items that the merchant can fix in MVP.
   Output: dashboard becomes operational, not just informative.

3. Merchant clicks a CTA such as `Update training`, `Review support setup`, or `Re-sync catalog`.
   UI: navigate directly to the relevant page or modal.
   System: preserve dashboard context.
   Logic: analytics should drive action, not just reporting.
   Output: faster improvement loop.

## MVP Acceptance Checklist

The MVP is functionally complete when all of the following work:

1. Shopper can open chatbot and receive a branded welcome.
2. Shopper profile updates dynamically from text and image inputs.
3. Menswear and womenswear requests stay separated.
4. Full outfit recommendations return product cards plus logic explanations.
5. Shopper can refine recommendations without restarting.
6. `Complete The Look` works with file upload or image URL.
7. `Get Inspired` works with file upload or image URL.
8. Support, tracking, returns, and handoff all work inside the same chat.
9. `View Product` opens the correct PDP and `Add to Cart` works where Shopify cart API is available.
10. Merchant dashboard loads live connected-store data.
11. Catalog sync refreshes products from Shopify.
12. AI auto-tagging produces structured styling tags.
13. AI product description generation produces reviewable drafts.
14. Merchant look builder can generate and save outfit drafts.
15. Merchant settings update storefront assistant behavior.
16. Knowledge and policy setup change support and styling behavior.
17. Analytics surface real operational and commercial signals.

## Recommended Build Order

1. Chatbot entry and profile capture
2. Menswear/womenswear-safe shortlist logic
3. Full outfit recommendation and refinement
4. Complete the look and get inspired image flows
5. Smart support, returns, order tracking, and handoff
6. Product CTA flow
7. Merchant overview and catalog sync
8. Auto-tagging and AI controls
9. Product description generation
10. Look builder
11. Knowledge, customer care, and analytics polish
