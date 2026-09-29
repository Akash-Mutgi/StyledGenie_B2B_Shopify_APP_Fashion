-- Run once in Supabase SQL Editor before deploying tenant-scoped backend code.
-- API requests receive short-lived JWTs with role=authenticated and merchant_id=<uuid>.

alter table public.merchants
    add column if not exists storefront_domains text[] not null default '{}';

update public.merchants
set storefront_domains = array[lower(trim(trailing '.' from shopify_store_domain))]
where cardinality(storefront_domains) = 0;

do $$
declare
    profile_row record;
    profile_json jsonb;
    storefront_host text;
begin
    for profile_row in
        select merchant_id, body
        from public.knowledge_base_entries
        where entry_type = 'merchant_profile'
    loop
        begin
            profile_json := profile_row.body::jsonb;
        exception when others then
            continue;
        end;

        storefront_host := lower(
            regexp_replace(
                split_part(regexp_replace(coalesce(profile_json ->> 'storefront_domain', ''), '^https?://', ''), '/', 1),
                '\.$', ''
            )
        );
        if storefront_host <> '' then
            update public.merchants m
            set storefront_domains = array(
                select distinct domain
                from unnest(coalesce(m.storefront_domains, '{}'::text[]) || array[storefront_host]) as domains(domain)
            )
            where m.id = profile_row.merchant_id;
        end if;
    end loop;
end $$;

create or replace function public.request_merchant_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
    select nullif(auth.jwt() ->> 'merchant_id', '')::uuid
$$;

grant execute on function public.request_merchant_id() to authenticated;

grant select, insert, update, delete on
    public.merchants,
    public.products,
    public.product_tags,
    public.curated_looks,
    public.curated_look_items,
    public.faqs,
    public.knowledge_base_entries,
    public.chat_sessions,
    public.chat_messages,
    public.recommendation_events,
    public.support_requests,
    public.shopify_orders,
    public.shopify_order_line_items
to authenticated;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'merchants', 'products', 'product_tags', 'curated_looks',
        'curated_look_items', 'faqs', 'knowledge_base_entries',
        'chat_sessions', 'chat_messages', 'recommendation_events',
        'support_requests', 'shopify_orders', 'shopify_order_line_items'
    ] loop
        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
        execute format('drop policy if exists tenant_authenticated_access on public.%I', table_name);
        execute format(
            'create policy tenant_authenticated_access on public.%I as permissive for all to authenticated using (true) with check (true)',
            table_name
        );
    end loop;
end $$;

drop policy if exists merchant_tenant_isolation on public.merchants;
create policy merchant_tenant_isolation on public.merchants
    as restrictive for all to authenticated
    using (id = public.request_merchant_id())
    with check (id = public.request_merchant_id());

drop policy if exists products_tenant_isolation on public.products;
create policy products_tenant_isolation on public.products
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists product_tags_tenant_isolation on public.product_tags;
create policy product_tags_tenant_isolation on public.product_tags
    as restrictive for all to authenticated
    using (exists (
        select 1 from public.products p
        where p.id = product_tags.product_id
          and p.merchant_id = public.request_merchant_id()
    ))
    with check (exists (
        select 1 from public.products p
        where p.id = product_tags.product_id
          and p.merchant_id = public.request_merchant_id()
    ));

drop policy if exists curated_looks_tenant_isolation on public.curated_looks;
create policy curated_looks_tenant_isolation on public.curated_looks
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists curated_look_items_tenant_isolation on public.curated_look_items;
create policy curated_look_items_tenant_isolation on public.curated_look_items
    as restrictive for all to authenticated
    using (exists (
        select 1 from public.curated_looks l
        where l.id = curated_look_items.look_id
          and l.merchant_id = public.request_merchant_id()
    ))
    with check (
        exists (
            select 1 from public.curated_looks l
            where l.id = curated_look_items.look_id
              and l.merchant_id = public.request_merchant_id()
        )
        and exists (
            select 1 from public.products p
            where p.id = curated_look_items.product_id
              and p.merchant_id = public.request_merchant_id()
        )
    );

drop policy if exists faqs_tenant_isolation on public.faqs;
create policy faqs_tenant_isolation on public.faqs
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists knowledge_base_entries_tenant_isolation on public.knowledge_base_entries;
create policy knowledge_base_entries_tenant_isolation on public.knowledge_base_entries
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists chat_sessions_tenant_isolation on public.chat_sessions;
create policy chat_sessions_tenant_isolation on public.chat_sessions
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists chat_messages_tenant_isolation on public.chat_messages;
create policy chat_messages_tenant_isolation on public.chat_messages
    as restrictive for all to authenticated
    using (exists (
        select 1 from public.chat_sessions s
        where s.id = chat_messages.session_id
          and s.merchant_id = public.request_merchant_id()
    ))
    with check (exists (
        select 1 from public.chat_sessions s
        where s.id = chat_messages.session_id
          and s.merchant_id = public.request_merchant_id()
    ));

drop policy if exists recommendation_events_tenant_isolation on public.recommendation_events;
create policy recommendation_events_tenant_isolation on public.recommendation_events
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (
        merchant_id = public.request_merchant_id()
        and (
            session_id is null
            or exists (
                select 1 from public.chat_sessions s
                where s.id = recommendation_events.session_id
                  and s.merchant_id = public.request_merchant_id()
            )
        )
    );

drop policy if exists support_requests_tenant_isolation on public.support_requests;
create policy support_requests_tenant_isolation on public.support_requests
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (
        merchant_id = public.request_merchant_id()
        and (
            session_id is null
            or exists (
                select 1 from public.chat_sessions s
                where s.id = support_requests.session_id
                  and s.merchant_id = public.request_merchant_id()
            )
        )
    );

drop policy if exists shopify_orders_tenant_isolation on public.shopify_orders;
create policy shopify_orders_tenant_isolation on public.shopify_orders
    as restrictive for all to authenticated
    using (merchant_id = public.request_merchant_id())
    with check (merchant_id = public.request_merchant_id());

drop policy if exists shopify_order_line_items_tenant_isolation on public.shopify_order_line_items;
create policy shopify_order_line_items_tenant_isolation on public.shopify_order_line_items
    as restrictive for all to authenticated
    using (exists (
        select 1 from public.shopify_orders o
        where o.id = shopify_order_line_items.order_id
          and o.merchant_id = public.request_merchant_id()
    ))
    with check (
        exists (
            select 1 from public.shopify_orders o
            where o.id = shopify_order_line_items.order_id
              and o.merchant_id = public.request_merchant_id()
        )
        and (
            product_id is null
            or exists (
                select 1 from public.products p
                where p.id = shopify_order_line_items.product_id
                  and p.merchant_id = public.request_merchant_id()
            )
        )
    );
