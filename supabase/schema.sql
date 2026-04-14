create extension if not exists pgcrypto;

create table if not exists merchants (
    id uuid primary key default gen_random_uuid(),
    shopify_store_domain text not null unique,
    brand_name text not null,
    created_at timestamptz not null default now()
);

create table if not exists products (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    shopify_product_id text not null,
    handle text,
    shopify_variant_id text,
    title text not null,
    category text,
    description text,
    image_url text,
    product_url text,
    price numeric(10, 2),
    created_at timestamptz not null default now()
);

create table if not exists product_tags (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    tag text not null,
    created_at timestamptz not null default now()
);

create table if not exists curated_looks (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    title text not null,
    occasion text,
    style_notes text,
    created_at timestamptz not null default now()
);

create table if not exists curated_look_items (
    id uuid primary key default gen_random_uuid(),
    look_id uuid not null references curated_looks(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,
    role text,
    created_at timestamptz not null default now()
);

create table if not exists faqs (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    question text not null,
    answer text not null,
    category text,
    created_at timestamptz not null default now()
);

create table if not exists knowledge_base_entries (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    title text not null,
    body text not null,
    entry_type text not null,
    created_at timestamptz not null default now()
);

create table if not exists chat_sessions (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    customer_identifier text,
    active_profile_id text,
    selected_service text,
    last_entry_mode text,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references chat_sessions(id) on delete cascade,
    sender text not null,
    message text not null,
    mode text,
    created_at timestamptz not null default now()
);

create table if not exists recommendation_events (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    session_id uuid references chat_sessions(id) on delete set null,
    event_type text not null,
    input_summary text,
    recommended_product_ids text[],
    created_at timestamptz not null default now()
);

create table if not exists support_requests (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    session_id uuid references chat_sessions(id) on delete set null,
    customer_identifier text,
    shopper_email text,
    shopper_phone text,
    order_reference text,
    issue_summary text not null,
    transcript_excerpt text,
    assigned_contacts jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    notification_status text not null default 'pending',
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists customer_style_profiles (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    customer_identifier text not null,
    customer_email text,
    account_display_name text,
    profiles jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (merchant_id, customer_identifier)
);

create table if not exists shopify_orders (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    shopify_order_id text not null,
    order_name text,
    currency_code text,
    customer_email text,
    ordered_at timestamptz,
    updated_at timestamptz,
    total_price numeric(12, 2),
    subtotal_price numeric(12, 2),
    ai_assisted boolean not null default false,
    ai_assist_modes text[] not null default '{}',
    assisted_product_ids uuid[] not null default '{}',
    synced_at timestamptz not null default now(),
    unique (merchant_id, shopify_order_id)
);

create table if not exists shopify_order_line_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references shopify_orders(id) on delete cascade,
    shopify_line_item_id text not null,
    product_id uuid references products(id) on delete set null,
    shopify_product_id text,
    title text not null,
    quantity integer not null default 1,
    unit_price numeric(12, 2),
    ai_assisted boolean not null default false,
    ai_assist_mode text,
    ai_customer_identifier text,
    custom_attributes jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now(),
    unique (order_id, shopify_line_item_id)
);

create index if not exists idx_products_merchant_id on products(merchant_id);
create index if not exists idx_product_tags_product_id on product_tags(product_id);
create index if not exists idx_chat_sessions_merchant_id on chat_sessions(merchant_id);
create index if not exists idx_chat_messages_session_id on chat_messages(session_id);
create index if not exists idx_recommendation_events_merchant_id on recommendation_events(merchant_id);
create index if not exists idx_support_requests_merchant_id on support_requests(merchant_id);
create index if not exists idx_support_requests_session_id on support_requests(session_id);
create index if not exists idx_customer_style_profiles_merchant_id on customer_style_profiles(merchant_id);
create index if not exists idx_shopify_orders_merchant_id on shopify_orders(merchant_id);
create index if not exists idx_shopify_orders_ai_assisted on shopify_orders(ai_assisted);
create index if not exists idx_shopify_order_line_items_order_id on shopify_order_line_items(order_id);
