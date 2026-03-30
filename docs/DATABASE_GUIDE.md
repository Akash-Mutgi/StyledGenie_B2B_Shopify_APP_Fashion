# Database Guide

This MVP uses Supabase as the database layer.

## Main Tables

### merchants

Stores the merchant account or Shopify store record.

### products

Stores catalog items imported from Shopify.

### product_tags

Stores styling tags like `blazer`, `formal`, `neutral`, or `summer`.

### curated_looks

Stores complete outfits created by a merchant or by the AI team.

### curated_look_items

Stores which products belong to each curated look.

### faqs

Stores support answers the chatbot can use.

### knowledge_base_entries

Stores brand guidance, styling rules, and tone instructions.

### chat_sessions

Stores a customer conversation thread.

### chat_messages

Stores each message inside the session.

### recommendation_events

Stores recommendation actions for analytics.

## Why This Matters

The database lets you:

- keep merchant data organized
- track what customers ask
- measure recommendation performance
- train the AI using merchant-specific context

## Beginner Tip

Start with a simple schema and simple queries.
Do not try to design a perfect database on day one.

