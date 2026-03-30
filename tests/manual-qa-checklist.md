# Manual QA Checklist

Use this checklist before showing the MVP to a merchant.

## Storefront Widget

- Widget loads on desktop.
- Widget loads on mobile.
- Shopper can switch between all four modes.
- Message input works.
- Upload control is visible.
- Long answers remain readable.

## Merchant Dashboard

- Metrics cards load correctly.
- All sections are visible on desktop.
- All sections stack properly on mobile.
- Sync button is visible and clickable.

## Backend API

- `/health` returns `ok`.
- `/api/chat` returns a reply.
- `/api/inspire` returns tags.
- `/api/complete-look` returns tags.
- `/api/support/faqs` returns FAQ data.
- `/api/analytics/overview` returns metrics.
- `/api/catalog/import` returns import counts.

## Data Quality

- Product titles are not empty.
- Recommendation reasons are understandable.
- FAQ answers match actual store policy.
- Empty or missing image cases are handled safely.

