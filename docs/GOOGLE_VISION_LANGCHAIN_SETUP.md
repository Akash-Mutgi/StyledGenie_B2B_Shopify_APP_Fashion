# Google Vision + LangChain Setup

## What is now wired in

- `Google Vision`
  - image understanding
  - apparel/object cues
  - inspiration image reading
  - visual context extraction
- `LangChain`
  - support vs styling routing
  - prompt chains
  - profile enrichment flow
  - tool orchestration
  - structured outputs

## Install dependencies

From [backend](/Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/backend):

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

## Google Vision credentials

### Best option
Use a Google service account JSON file and set:

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-service-account.json
```

### Fallback option
You can also keep:

```env
GOOGLE_VISION_API_KEY=your_google_vision_api_key
```

The backend will try:
1. Google client library with service account credentials
2. Vision REST API with API key
3. local fallback heuristics if neither is available

## OpenAI + LangChain

Make sure these are set:

```env
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5-mini
```

LangChain uses your existing OpenAI model for:
- route resolution
- shopper profile enrichment
- stylist response generation

## Restart the backend

```bash
cd /Users/akashmutgi/.codex/worktrees/d977/StyledGenie_B2B_Shopify_APP_Fashion/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

## How to test

### Vision
Use `Get Inspired` or `Complete The Look` and:
- upload a real image file
- or paste a direct image URL
- or paste a Pinterest / Instagram image CDN URL

### LangChain routing
In the normal styling mode, try:
- `What is your return policy?`

It should route to support even without manually switching modes.

### LangChain profile enrichment
Try:
- `I need something polished for dinner but I’m nervous about going too bold`

The reply should sound more reassuring and profile-aware.
