-- Supplier cost = INR face value * (1 - supplier discount / 100) / website INR rate.
-- Existing order cost snapshots and customer selling prices are not changed.
begin;
create table public.giftport_product_pricing (
 product_id uuid primary key references public.products(id) on delete cascade,
 discount_percent numeric(5,2) not null check(discount_percent>=0 and discount_percent<100 and discount_percent::text not in ('NaN','Infinity','-Infinity')),
 purchase_limit integer not null check(purchase_limit between 1 and 100),
 updated_at timestamptz not null default now()
);
alter table public.giftport_product_pricing enable row level security;
revoke all on public.giftport_product_pricing from public,anon,authenticated;
grant select,insert,update,delete on public.giftport_product_pricing to service_role;

create function public.refresh_giftport_costs(p_product_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare rate numeric;
begin
 select store_usd_inr_rate into rate from payment_gateway_settings where id=true;
 if rate is null or rate<1 or rate>1000 or rate::text in ('NaN','Infinity','-Infinity') then raise exception 'Save a valid INR exchange rate in Payment Settings first'; end if;
 update definiteplay_stock s set unit_cost=ceil((s.giftport_amount*(100-g.discount_percent)/100/rate)*100000000)/100000000
 from giftport_product_pricing g,products p
 where s.product_id=g.product_id and p.id=s.product_id and p.stock_source='GIFTPORT'
 and (p_product_id is null or s.product_id=p_product_id);
end $$;
create function public.refresh_giftport_exchange_costs() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from giftport_product_pricing) then perform refresh_giftport_costs(null); end if;
 return NEW;
end $$;
create trigger giftport_exchange_costs after insert or update of store_usd_inr_rate on payment_gateway_settings
for each row execute function refresh_giftport_exchange_costs();

create function public.save_giftport_pricing(p_product_id uuid,p_discount numeric,p_limit integer)
returns void language plpgsql security definer set search_path=public as $$
declare p products%rowtype; rate numeric;
begin
 if p_discount is null or p_discount<0 or p_discount>=100 or p_discount::text in ('NaN','Infinity','-Infinity') or p_discount<>round(p_discount,2) or p_limit is null or p_limit not between 1 and 100 then raise exception 'Enter a discount from 0 to 99.99 percent and a purchase limit from 1 to 100'; end if;
 select store_usd_inr_rate into rate from payment_gateway_settings where id=true for share;
 if rate is null or rate<1 or rate>1000 or rate::text in ('NaN','Infinity','-Infinity') then raise exception 'Save a valid INR exchange rate in Payment Settings first'; end if;
 select * into p from products where id=p_product_id for update;
 if not found or p.seller_id is not null or p.stock_source not in ('OWNED','GIFTPORT') then raise exception 'Choose an owned or GiftPort product'; end if;
 insert into giftport_product_pricing(product_id,discount_percent,purchase_limit) values(p_product_id,p_discount,p_limit)
 on conflict(product_id) do update set discount_percent=excluded.discount_percent,purchase_limit=excluded.purchase_limit,updated_at=now();
 perform refresh_giftport_costs(p_product_id);
 if p.stock_source='GIFTPORT' then
  update definiteplay_stock set giftport_limit=p_limit,available_quantity=least(available_quantity,p_limit) where product_id=p_product_id;
  update product_options o set stock_quantity=s.available_quantity,is_in_stock=s.available_quantity>0,updated_at=now()
  from definiteplay_stock s where o.id=s.option_id and s.product_id=p_product_id;
  update products set stock_quantity=coalesce((select sum(stock_quantity)::integer from product_options where product_id=p_product_id and is_active),0),updated_at=now() where id=p_product_id;
 end if;
end $$;

create function public.configure_giftport_discount_product(p_product_id uuid,p_mappings jsonb,p_discount numeric,p_limit integer)
returns void language plpgsql security definer set search_path=public as $$
declare rate numeric; prepared jsonb;
begin
 -- Save/check discount, exchange rate and product ownership in this same transaction.
 perform save_giftport_pricing(p_product_id,p_discount,p_limit);
 select store_usd_inr_rate into rate from payment_gateway_settings where id=true;
 if jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings) not between 1 and 50 then raise exception 'Invalid supplier links'; end if;
 select jsonb_agg(x||jsonb_build_object('unitCost',ceil(((x->>'amount')::numeric*(100-p_discount)/100/rate)*100000000)/100000000,'limit',p_limit)) into prepared from jsonb_array_elements(p_mappings)x;
 perform configure_giftport_product(p_product_id,true,prepared);
end $$;
revoke all on function public.refresh_giftport_costs(uuid),public.refresh_giftport_exchange_costs(),public.save_giftport_pricing(uuid,numeric,integer),public.configure_giftport_discount_product(uuid,jsonb,numeric,integer) from public,anon,authenticated;
grant execute on function public.save_giftport_pricing(uuid,numeric,integer),public.configure_giftport_discount_product(uuid,jsonb,numeric,integer) to service_role;
notify pgrst,'reload schema';
commit;
