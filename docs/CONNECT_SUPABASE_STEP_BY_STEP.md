# Connect Supabase Step By Step

This guide explains the exact beginner path for making the app save data in Supabase.

## What will be saved

After this setup works, the app will use Supabase for:

- FAQs
- chat sessions
- chat messages
- recommendation events

## Step 1: Install the Supabase Python package

Open Terminal and run:

```bash
cd /Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/backend
source .venv/bin/activate
pip install supabase==2.15.0
```

## Step 2: Create the tables in Supabase

In the Supabase SQL Editor:

1. Run `supabase/reset_dev_schema.sql` if older test tables already exist.
2. Run `supabase/schema.sql`
3. Run `supabase/sample_seed.sql`

## Step 3: Add the environment variables

Open the `.env` file in the project root and add your real values:

```env
SUPABASE_URL=your_real_supabase_url
SUPABASE_ANON_KEY=your_real_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_real_service_role_key
DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111
```

## Step 4: Restart the backend

Run:

```bash
cd /Users/akashmutgi/Documents/StyledGenie_B2B_Shopify_APP_Fashion/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

## Step 5: Test FAQ saving and loading

1. Open the storefront widget
2. Switch to Support mode
3. Ask: `What is your return policy?`

Expected result:

- the answer should come from the FAQ data in Supabase if it exists there

## Step 6: Test chat session and message saving

1. In outfit mode, ask for an outfit
2. In support mode, ask a support question
3. In Get Inspired mode, upload a file like `blazer-look.jpg`
4. In Complete The Look mode, upload a file like `linen-shirt.png`

Then open the Supabase Table Editor and check:

- `chat_sessions`
- `chat_messages`
- `recommendation_events`

Expected result:

- one session row appears for the customer
- customer and assistant messages appear in `chat_messages`
- events appear in `recommendation_events`

## Step 7: What to check if nothing is saved

Check these in order:

1. `.env` has real values, not placeholder text
2. the backend was restarted after editing `.env`
3. `supabase==2.15.0` is installed in the backend virtual environment
4. the tables exist in Supabase
5. `DEFAULT_MERCHANT_ID` matches the merchant row inserted by `sample_seed.sql`

