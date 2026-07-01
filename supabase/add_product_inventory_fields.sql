alter table products add column if not exists sku text;
alter table products add column if not exists available_for_sale boolean;
alter table products add column if not exists inventory_quantity integer;
alter table products add column if not exists inventory_policy text;
alter table products add column if not exists inventory_tracked boolean;
