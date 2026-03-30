# Supabase Setup

If you are using a brand new Supabase project, run the SQL files in this order:

1. `supabase/schema.sql`
2. `supabase/sample_seed.sql`

If you already ran older SQL before and got an error like `column "merchant_id" does not exist`, it usually means:

- a table already exists from an older version
- `create table if not exists` did not replace it
- later index creation failed because the old table structure is incomplete

## Beginner-safe fix for a development database

Only do this if you are fine deleting the current test data.

Run these files in this order:

1. `supabase/reset_dev_schema.sql`
2. `supabase/schema.sql`
3. `supabase/sample_seed.sql`

## Why this happens

Example:

- an old `recommendation_events` table exists
- it does not have `merchant_id`
- `schema.sql` does not recreate it because of `if not exists`
- the line `create index ... on recommendation_events(merchant_id)` fails

## After setup

Add these values to `.env`:

```env
SUPABASE_URL=your_real_supabase_url
SUPABASE_ANON_KEY=your_real_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_real_service_role_key
DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111
```

Then restart the backend.

