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

create index if not exists idx_shopify_orders_merchant_id on shopify_orders(merchant_id);
create index if not exists idx_shopify_orders_ai_assisted on shopify_orders(ai_assisted);
create index if not exists idx_shopify_order_line_items_order_id on shopify_order_line_items(order_id);
