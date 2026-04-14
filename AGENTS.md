# AGENTS.md — StyledGenie AI System Rules

## PURPOSE
This file defines how AI coding agents (Codex) must behave when working on the StyledGenie codebase.

These rules are ALWAYS ACTIVE and must be followed for every task.

The goal is to ensure:
- minimal code disruption
- consistent AI behavior
- high-quality UX
- production-ready logic

---

# CORE PRODUCT PRINCIPLE

StyledGenie is NOT a chatbot.

It is:
→ an AI stylist (for fashion flows)
→ an AI support agent (for customer care)

The system must:
- infer more
- ask less
- decide faster
- explain clearly
- never behave like a question form

---

# GLOBAL BEHAVIOR RULES

## 1. INFER FIRST, ASK LESS
- Extract intent from text or voice automatically
- Do NOT ask unnecessary questions
- Ask only when:
  - required information is missing
  - confidence is low

---

## 2. IMAGE-FIRST INTELLIGENCE
If image is uploaded:
- ALWAYS analyze image first (Google Vision)
- THEN ask only critical questions (event, weather, etc.)
- NEVER ask generic questions before analysis

---

## 3. STRICT MODE SEPARATION

The system must always operate in ONE mode:

### STYLING MODE
- Find My Outfit
- Complete My Look
- Get Inspired

### CUSTOMER SUPPORT MODE
- order tracking
- returns
- exchanges
- shipping
- product queries

RULE:
If support intent is detected:
- disable styling logic completely
- remove styling UI elements
- do not show outfit suggestions

---

## 4. NO GENERIC RESPONSES

The system must NEVER:
- dump long paragraphs
- give generic FAQ answers first
- repeat obvious information

Every response must:
→ lead to action OR decision

---

## 5. ALWAYS EXPLAIN VALUE

Every recommendation must include:
→ "Why this works"

Explanation should include:
- color harmony
- silhouette balance
- occasion fit
- style direction

---

# FEATURE-SPECIFIC RULES

---

# FIND MY OUTFIT

## REQUIRED BEHAVIOR
- Extract from text/voice:
  - event
  - budget
  - vibe
  - weather (if inferable)
  - urgency

- Ask only missing critical inputs

## DECISION MODE (MANDATORY)
Before final output:
Ask:
"Do you want options, or should I pick the best one for you?"

If decision_mode = true:
- return ONLY 1 outfit
- use confident stylist tone

---

# COMPLETE MY LOOK

## MANDATORY FLOW

1. Image upload
2. Analyze image FIRST
3. Identify:
   - anchor item
   - garment type
   - color palette
   - silhouette
   - styling mode (infer if possible)

4. Ask ONLY:
   - menswear/womenswear (if unclear)
   - event
   - weather

---

## GAP ANALYSIS (MANDATORY)

System must identify:
- what user is wearing
- what is missing

Examples:
- t-shirt → recommend bottom + shoes + layer
- blazer → recommend inner + bottom + shoes
- dress → recommend shoes + bag + accessories

---

## COLOR RULE
Recommendations MUST match:
- dominant color palette
- style direction

No random combinations allowed.

---

# GET INSPIRED

## HERO-FIRST RULE (MANDATORY)

DO NOT show multiple unrelated products.

ALWAYS:
1. Identify main garment (hero item)
2. Show ONE closest matching product
3. Show supporting items below

---

## OUTPUT STRUCTURE

1. Short interpretation
2. Hero product (main match)
3. Supporting items:
   - "You might pair with"
   - thumbnails only

---

## MATCHING PRIORITY

1. garment type
2. styling mode
3. color
4. silhouette
5. style

---

# CUSTOMER SUPPORT

## STRICT RULES

- ALWAYS switch to SUPPORT MODE
- NEVER show styling UI

---

## ORDER TRACKING

User:
"Track my order"

DO:
1. ask for order ID/email if missing
2. fetch Shopify data
3. return real status

DO NOT:
- show shipping policy first

---

## RETURNS / EXCHANGES

Flow:
1. identify order
2. ask reason (only if needed)
3. offer:
   - refund
   - exchange

---

## RESPONSE STYLE

- short
- action-oriented
- 1–2 lines max

---

# SMART SWAP (ALL STYLING FEATURES)

Users must be able to:
- swap only one item

RULES:
- keep outfit context fixed
- replace only selected category
- do not regenerate full outfit

---

# FRONTEND RULES

## MUST:
- keep chat clean
- show structured cards
- show actions, not paragraphs

## MUST NOT:
- show irrelevant chips
- mix support + styling UI
- overload screen

---

# BACKEND RESPONSIBILITY SPLIT

## GOOGLE VISION
- garment detection
- color palette
- visual structure
- image analysis

---

## OPENAI
- reasoning
- intent detection
- explanations
- recommendations

---

## LANGCHAIN
- routing between features
- state management
- orchestration
- decision logic

---

# MINIMAL CHANGE POLICY

Codex MUST:

- reuse existing code wherever possible
- avoid rewriting entire modules
- add:
  - helper functions
  - flags
  - small UI updates
- extend existing responses instead of replacing

---

# IMPLEMENTATION PRIORITY

1. Mode separation (CRITICAL)
2. Image-first logic
3. Gap analysis
4. Hero-first recommendation
5. Decision mode
6. Smart swap

---

# SUCCESS CRITERIA

The system is correct ONLY IF:

- AI asks fewer questions
- image flows feel intelligent
- recommendations are visually consistent
- support flows are clean and action-based
- no styling UI appears in support mode
- user can complete tasks quickly
- product feels like a stylist, not a chatbot

---

# FINAL RULE

If a feature adds complexity without improving decision-making or clarity:
→ DO NOT IMPLEMENT IT
