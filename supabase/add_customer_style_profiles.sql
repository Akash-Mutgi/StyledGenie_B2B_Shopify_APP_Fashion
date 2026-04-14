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

create index if not exists idx_customer_style_profiles_merchant_id
    on customer_style_profiles(merchant_id);
