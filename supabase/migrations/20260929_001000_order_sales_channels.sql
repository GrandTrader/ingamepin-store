begin;
-- Navigation preference only; top-ups still credit the same customer wallet.
alter table public.wallet_topup_requests add column if not exists return_to_business boolean not null default false;
alter table public.orders add column if not exists sales_channel text not null default 'RETAIL' check (sales_channel in ('RETAIL','BUSINESS'));
-- Identify existing B2B orders using their authoritative checkout records.
update public.orders o set sales_channel='BUSINESS'
where o.sales_channel<>'BUSINESS' and (
 exists(select 1 from public.portal_wallet_orders p where p.order_id=o.id)
 or exists(select 1 from public.bulk_api_requests b where b.order_id=o.id)
 or o.order_number ~ '^IPB2B[0-9]{14}$'
);
create or replace function public.assign_order_sales_channel()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.sales_channel:=case when coalesce(current_setting('app.order_sales_channel',true),'')='BUSINESS'
   or coalesce(current_setting('app.business_bulk_api',true),'')='yes' then 'BUSINESS' else 'RETAIL' end;
 return new;
end $$;
revoke all on function public.assign_order_sales_channel() from public,anon,authenticated;
drop trigger if exists assign_order_sales_channel on public.orders;
create trigger assign_order_sales_channel before insert on public.orders
 for each row execute function public.assign_order_sales_channel();
create index if not exists orders_customer_channel_created_idx on public.orders(customer_email,sales_channel,created_at desc);
notify pgrst,'reload schema';
commit;
