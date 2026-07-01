alter table products add column if not exists shopify_legacy_id text;
alter table products add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table products add column if not exists metafields jsonb not null default '{}'::jsonb;

create index if not exists idx_products_shopify_legacy_id on products(shopify_legacy_id);
