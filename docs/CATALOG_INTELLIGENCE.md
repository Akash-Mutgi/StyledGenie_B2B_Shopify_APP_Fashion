# Catalog Intelligence

The catalog intelligence layer turns raw Shopify products into recommendation-ready fashion data.

## What it does

When products are imported from Shopify, the app now infers styling tags from:

- product title
- product type or category
- product description
- useful Shopify tags

## Example inferred tags

Depending on the product, the system can infer tags such as:

- `tops`
- `bottoms`
- `outerwear`
- `footwear`
- `dresswear`
- `casual`
- `formal`
- `workwear`
- `activewear`
- `denim`
- `linen`
- `leather`
- `summer`
- `winter`
- `tailored`
- `lightweight`
- `heavyweight`
- `neutral`

## Why this matters

Raw Shopify tags are often vendor names or operational tags like `Shopify Collective`.

Those are not very useful for styling recommendations.

The intelligence layer makes the chatbot more fashion-aware by creating recommendation-friendly tags and category buckets.

## Compatibility logic

The system also understands simple outfit compatibility:

- tops pair with bottoms, outerwear, footwear, and accessories
- bottoms pair with tops, outerwear, footwear, and accessories
- dresses pair with outerwear, footwear, and accessories
- footwear can complement many look types

This helps `Complete The Look` feel more like outfit building instead of keyword search.

## Important note

If you want the best results, re-run the Shopify catalog import after changing the intelligence rules.

That refreshes `products` and `product_tags` in Supabase using the newest inference logic.

