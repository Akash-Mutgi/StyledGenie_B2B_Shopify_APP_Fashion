# API Contracts

These are the main backend routes for the MVP starter.

## GET /health

Purpose:

- confirm the API server is running

Response:

```json
{
  "status": "ok"
}
```

## POST /api/chat

Purpose:

- handle normal outfit and product discovery chat

Request:

```json
{
  "message": "I need a smart casual outfit for a buyer meeting.",
  "mode": "outfit_curation",
  "customer_id": "guest-001"
}
```

Response:

```json
{
  "reply": "Here is a smart casual outfit idea using your catalog.",
  "recommended_products": [
    {
      "id": "prod-101",
      "title": "Structured Navy Blazer",
      "category": "outerwear",
      "reason": "Adds polish for a meeting."
    }
  ]
}
```

## POST /api/inspire

Purpose:

- analyze an inspiration image and recommend similar products

Request:

```json
{
  "image_name": "celebrity-look.jpg",
  "customer_id": "guest-001"
}
```

Response:

```json
{
  "detected_tags": ["blazer", "wide-leg trousers", "neutral palette"],
  "reply": "This image suggests a polished tailored look.",
  "recommended_products": []
}
```

## POST /api/complete-look

Purpose:

- detect an item or outfit in an image and recommend complementary items

Request:

```json
{
  "image_name": "linen-shirt.png",
  "customer_id": "guest-001"
}
```

Response:

```json
{
  "detected_tags": ["shirt", "linen", "lightweight"],
  "reply": "Here are matching pieces that complete the look.",
  "recommended_products": []
}
```

## GET /api/support/faqs

Purpose:

- return support FAQs for the storefront assistant

Response:

```json
{
  "items": [
    {
      "question": "What is your return window?",
      "answer": "Returns are accepted within 30 days."
    }
  ]
}
```

## GET /api/analytics/overview

Purpose:

- provide top-level merchant dashboard metrics

Response:

```json
{
  "chat_interactions": 128,
  "outfit_recommendations": 54,
  "image_uploads": 21,
  "support_questions_answered": 37
}
```

## POST /api/catalog/import

Purpose:

- pull product data from Shopify into the app database

Request:

```json
{
  "store_name": "styledgenie-demo"
}
```

Response:

```json
{
  "message": "Catalog import finished.",
  "imported_count": 24
}
```

