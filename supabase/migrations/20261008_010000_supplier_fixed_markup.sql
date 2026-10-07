begin;

-- Private cost/price pairs preserve each option's exact existing markup.
create table if not exists public.definiteplay_price_rules (
 option_id uuid primary key references public.product_options(id) on delete cascade,
 sku text not null check (sku ~ '^[A-Za-z0-9._-]{1,100}$'),
 base_unit_cost numeric(20,8) not null check (base_unit_cost>0 and base_unit_cost::text not in ('NaN','Infinity','-Infinity')),
 base_selling_price numeric(20,8) not null check (base_selling_price>=0 and base_selling_price::text not in ('NaN','Infinity','-Infinity')),
 last_applied_price numeric(12,2) not null check (last_applied_price>=0),
 updated_at timestamptz not null default now()
);
alter table public.definiteplay_price_rules enable row level security;
revoke all on public.definiteplay_price_rules from public,anon,authenticated;
grant select,insert,update,delete on public.definiteplay_price_rules to service_role;

-- Capture existing margins before the next cost update. Do not change prices here.
insert into public.definiteplay_price_rules(option_id,sku,base_unit_cost,base_selling_price,last_applied_price)
 select s.option_id,s.sku,s.unit_cost,o.selling_price,o.selling_price
 from public.definiteplay_stock s join public.product_options o on o.id=s.option_id
 join public.products p on p.id=s.product_id
 where p.stock_source='DEFINITEPLAY' and p.seller_id is null and not o.is_custom_value
  and s.currency='USD' and s.unit_cost>0 and o.selling_price>=0
 on conflict(option_id) do nothing;

create or replace function public.capture_definiteplay_price_edit()
returns trigger language plpgsql security definer set search_path=public as $$
declare s definiteplay_stock%rowtype; rule definiteplay_price_rules%rowtype;
begin
 if new.selling_price is not distinct from old.selling_price or new.is_custom_value then return new;end if;
 if not exists(select 1 from products where id=new.product_id and stock_source='DEFINITEPLAY' and seller_id is null) then return new;end if;
 select * into s from definiteplay_stock where option_id=new.id and product_id=new.product_id;
 if not found then raise exception 'Link this option to a supplier before changing its price.';end if;
 select * into rule from definiteplay_price_rules where option_id=new.id for update;
 -- Sync records its intended price while holding the option lock; never recapture a rounded margin.
 if found and rule.sku=s.sku and new.selling_price=rule.last_applied_price then return new;end if;
 if s.currency<>'USD' or s.unit_cost<=0 or s.synced_at<now()-interval '15 minutes' or s.synced_at>now()+interval '1 minute' then
  raise exception 'Refresh supplier prices before changing this selling price.';
 end if;
 insert into definiteplay_price_rules(option_id,sku,base_unit_cost,base_selling_price,last_applied_price)
 values(new.id,s.sku,s.unit_cost,new.selling_price,new.selling_price)
 on conflict(option_id) do update set sku=excluded.sku,base_unit_cost=excluded.base_unit_cost,
  base_selling_price=excluded.base_selling_price,last_applied_price=excluded.last_applied_price,updated_at=now();
 return new;
end;$$;
revoke all on function public.capture_definiteplay_price_edit() from public,anon,authenticated;
drop trigger if exists capture_definiteplay_price_edit on public.product_options;
create trigger capture_definiteplay_price_edit before update of selling_price on public.product_options
 for each row execute function public.capture_definiteplay_price_edit();

-- Actual USD supplier cost works for every fixed denomination, including GBP/EUR cards.
create or replace function public.sync_definiteplay_stock(p_rows jsonb,p_synced_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare r record;s definiteplay_stock%rowtype;o product_options%rowtype;rule definiteplay_price_rules%rowtype;
 v_qty integer;v_cost numeric;v_price numeric;v_synced timestamptz;v_count integer:=0;
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Invalid catalogue';end if;
 if p_synced_at>now()+interval '1 minute' then raise exception 'Invalid supplier snapshot time';end if;
 v_synced:=least(coalesce(p_synced_at,'epoch'),now());
 for r in select stock.option_id,stock.sku,x.value as supplier from definiteplay_stock stock join products p on p.id=stock.product_id
  left join lateral(select value from jsonb_array_elements(p_rows) where value->>'sku'=stock.sku limit 1) x on true
  where p.stock_source='DEFINITEPLAY' and p.seller_id is null order by stock.product_id,stock.option_id
 loop
  -- Manual edits lock the option first as well, serializing price/rule writes.
  select * into o from product_options where id=r.option_id for update;
  if not found or o.is_custom_value then continue;end if;
  select * into s from definiteplay_stock where option_id=r.option_id for update;
  if not found or s.synced_at>v_synced or s.sku<>r.sku or s.product_id<>o.product_id then continue;end if;
  if not exists(select 1 from products where id=s.product_id and stock_source='DEFINITEPLAY' and seller_id is null) then continue;end if;
  v_qty:=0;v_cost:=0;v_price:=o.selling_price;
  if v_synced>now()-interval '15 minutes' and r.supplier->>'currency'='USD' then
   v_cost:=(r.supplier->>'cost')::numeric;
   if v_cost>0 and v_cost::text not in ('NaN','Infinity','-Infinity') then
    v_qty:=least(1000,greatest(0,(r.supplier->>'quantity')::integer));
   else v_cost:=0;end if;
  end if;
  if v_cost>0 then
   select * into rule from definiteplay_price_rules where option_id=o.id for update;
   if not found or rule.sku<>s.sku then
    -- New links keep the current selling price on their first valid sync.
    insert into definiteplay_price_rules(option_id,sku,base_unit_cost,base_selling_price,last_applied_price)
    values(o.id,s.sku,case when s.unit_cost>0 then s.unit_cost else v_cost end,o.selling_price,o.selling_price)
    on conflict(option_id) do update set sku=excluded.sku,base_unit_cost=excluded.base_unit_cost,
     base_selling_price=excluded.base_selling_price,last_applied_price=excluded.last_applied_price,updated_at=now()
    returning * into rule;
   end if;
   v_price:=round(v_cost*rule.base_selling_price/rule.base_unit_cost,2);
   if v_price<0 or v_price>9999999999.99 then raise exception 'Supplier selling price is outside the supported range';end if;
   update definiteplay_price_rules set last_applied_price=v_price,updated_at=now()
    where option_id=o.id and last_applied_price is distinct from v_price;
  end if;
  update definiteplay_stock set unit_cost=v_cost,available_quantity=v_qty,synced_at=v_synced where option_id=o.id;
  update product_options set stock_quantity=v_qty,is_in_stock=(v_qty>0),selling_price=v_price,updated_at=now() where id=o.id;
  v_count:=v_count+1;
 end loop;
 update products p set stock_quantity=coalesce((select sum(opt.stock_quantity)::integer from product_options opt where opt.product_id=p.id and opt.is_active),0),updated_at=now()
  where p.stock_source='DEFINITEPLAY' and p.seller_id is null;
 return v_count;
end;$$;
revoke all on function public.sync_definiteplay_stock(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_definiteplay_stock(jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
