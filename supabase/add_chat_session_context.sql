alter table if exists chat_sessions
    add column if not exists active_profile_id text,
    add column if not exists selected_service text,
    add column if not exists last_entry_mode text,
    add column if not exists updated_at timestamptz not null default now();
