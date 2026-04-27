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

create index if not exists idx_support_requests_merchant_id on support_requests(merchant_id);
create index if not exists idx_support_requests_session_id on support_requests(session_id);
