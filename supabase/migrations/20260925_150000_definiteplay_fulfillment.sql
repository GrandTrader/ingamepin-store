begin;

alter table public.products add column if not exists stock_source text not null default 'OWNED';
alter table public.products add constraint products_stock_source_check check (stock_source in ('OWNED','DEFINITEPLAY'));

create table public.definiteplay_stock (
  option_id uuid primary key references public.product_options(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null check (sku ~ '^[A-Za-z0-9._-]{1,100}$'),
  unit_cost numeric(20,8) not null default 0 check (unit_cost>=0 and unit_cost::text not in ('NaN','Infinity','-Infinity')),
  currency text not null default 'USD' check(currency='USD'),
  available_quantity integer not null default 0 check(available_quantity between 0 and 1000),
  synced_at timestamptz not null default 'epoch'
);
create table public.definiteplay_jobs (
  item_id uuid primary key references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  supplier_reference text not null unique,
  sku text not null,
  quantity integer not null check(quantity between 1 and 1000),
  max_unit_cost numeric(20,8) not null check(max_unit_cost>0 and max_unit_cost::text not in ('NaN','Infinity','-Infinity')),
  state text not null default 'QUEUED' check(state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN','REVIEW','REJECTED','DELIVERED')),
  submitted_at timestamptz,
  next_check timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  issue text,
  actual_cost numeric(20,8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index definiteplay_jobs_due on public.definiteplay_jobs(next_check) where state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN');
alter table public.definiteplay_stock enable row level security;
alter table public.definiteplay_jobs enable row level security;
revoke all on public.definiteplay_stock,public.definiteplay_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.definiteplay_stock,public.definiteplay_jobs to service_role;

create function public.configure_definiteplay_product(p_product_id uuid,p_enabled boolean,p_mappings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_product public.products%rowtype; r jsonb;
begin
  select * into v_product from products where id=p_product_id for update;
  if not found or v_product.seller_id is not null then raise exception 'Invalid store product'; end if;
  if exists(select 1 from definiteplay_jobs j join order_items i on i.id=j.item_id join orders o on o.id=j.order_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED','EXPIRED'))) then
    raise exception 'Resolve existing supplier orders before changing supplier mode or links';
  end if;
  if not p_enabled then
    update products set stock_source='OWNED' where id=p_product_id;
    delete from definiteplay_stock where product_id=p_product_id;
    perform reconcile_code_inventory(p_product_id);
    return;
  end if;
  if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then
    raise exception 'This product already has owned or reserved codes; use a separate supplier product';
  end if;
  if v_product.allows_custom_value or v_product.allows_player_id_topup then raise exception 'Supplier delivery supports fixed code options only'; end if;
  if p_mappings is null or jsonb_typeof(p_mappings)<>'array' or jsonb_array_length(p_mappings)<1 or jsonb_array_length(p_mappings)>50 then raise exception 'Invalid supplier links'; end if;
  if (select count(distinct x->>'optionId') from jsonb_array_elements(p_mappings) x)<>jsonb_array_length(p_mappings) then raise exception 'Duplicate options'; end if;
  for r in select value from jsonb_array_elements(p_mappings) loop
    if not exists(select 1 from product_options where id=(r->>'optionId')::uuid and product_id=p_product_id) then raise exception 'Option belongs to another product'; end if;
    if coalesce(r->>'sku','')!~'^[A-Za-z0-9._-]{1,100}$' then raise exception 'Invalid supplier SKU'; end if;
  end loop;
  if exists(select 1 from product_options o where o.product_id=p_product_id and o.is_active and not exists(select 1 from jsonb_array_elements(p_mappings) x where (x->>'optionId')::uuid=o.id)) then raise exception 'Link every active option first'; end if;
  delete from definiteplay_stock where product_id=p_product_id;
  insert into definiteplay_stock(option_id,product_id,sku)
    select (x->>'optionId')::uuid,p_product_id,x->>'sku' from jsonb_array_elements(p_mappings) x;
  update products set stock_source='DEFINITEPLAY',delivery_type='MANUAL',stock_quantity=0 where id=p_product_id;
  update product_options set stock_quantity=0,is_in_stock=false where product_id=p_product_id;
end;
$$;

-- The bridge submits supplier facts. Currency mismatch, missing SKUs or stale
-- snapshots become zero stock, never unlimited or converted balances.
create function public.sync_definiteplay_stock(p_rows jsonb,p_synced_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare r record; v_qty integer; v_cost numeric; v_synced timestamptz; v_count integer:=0;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Invalid catalogue'; end if;
  v_synced:=least(coalesce(p_synced_at,'epoch'),now());
  for r in select s.*,x.value as supplier from definiteplay_stock s join products p on p.id=s.product_id
    left join lateral (select value from jsonb_array_elements(p_rows) where value->>'sku'=s.sku limit 1) x on true
    where p.stock_source='DEFINITEPLAY' order by s.product_id,s.option_id
  loop
    v_qty:=0;v_cost:=0;
    if v_synced>now()-interval '15 minutes' and r.supplier->>'currency'='USD' then
      v_cost:=(r.supplier->>'cost')::numeric;
      if v_cost>0 and v_cost::text not in ('NaN','Infinity','-Infinity') then
        v_qty:=least(1000,greatest(0,(r.supplier->>'quantity')::integer));
      else v_cost:=0; end if;
    end if;
    update definiteplay_stock set unit_cost=v_cost,available_quantity=v_qty,synced_at=v_synced where option_id=r.option_id;
    update product_options set stock_quantity=v_qty,is_in_stock=(v_qty>0),updated_at=now() where id=r.option_id;
    v_count:=v_count+1;
  end loop;
  update products p set stock_quantity=coalesce((select sum(o.stock_quantity)::integer from product_options o where o.product_id=p.id and o.is_active),0),updated_at=now()
    where p.stock_source='DEFINITEPLAY';
  return v_count;
end;
$$;

-- Preserve the previous owned-inventory functions verbatim.
alter function public.reconcile_code_inventory(uuid) rename to reconcile_owned_code_inventory;
create function public.reconcile_code_inventory(p_product_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from products where id=p_product_id and stock_source='DEFINITEPLAY') then return; end if;
  perform reconcile_owned_code_inventory(p_product_id);
end;
$$;

create or replace function public.guard_order_item_combined_stock()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_mode integer; v_available bigint; v_requested bigint; v_product uuid; v_source text; v_stock public.definiteplay_stock%rowtype;
begin
  if NEW.quantity is null or NEW.quantity<1 then raise exception 'The cart quantity is invalid.'; end if;
  select product_id into v_product from product_options where id=NEW.product_option_id;
  if not found or v_product is distinct from NEW.product_id then raise exception 'The product denomination is invalid.'; end if;
  perform 1 from orders where id=NEW.order_id for update;
  select stock_quantity,stock_source into v_mode,v_source from products where id=NEW.product_id;
  if v_source='DEFINITEPLAY' then
    select * into v_stock from definiteplay_stock where option_id=NEW.product_option_id and product_id=NEW.product_id;
    if not found or v_stock.synced_at<now()-interval '15 minutes' or v_stock.unit_cost<=0 then raise exception 'Supplier stock is temporarily unavailable'; end if;
    if NEW.quantity>1000 or NEW.custom_value is not null or NEW.fulfillment_mode='PLAYER_ID_TOPUP' then raise exception 'Invalid supplier order'; end if;
    v_available:=v_stock.available_quantity;
  else
    if v_mode=2147483647 then return NEW; end if;
    select count(*) into v_available from gift_card_codes where product_id=NEW.product_id and product_option_id=NEW.product_option_id and status='AVAILABLE';
  end if;
  select coalesce(sum(quantity),0)+NEW.quantity into v_requested from order_items where order_id=NEW.order_id and product_option_id=NEW.product_option_id;
  if v_requested>v_available then raise exception 'Only % code(s) are available. Combined requested quantity: %.',v_available,v_requested; end if;
  return NEW;
end;
$$;

create function public.snapshot_definiteplay_order_item()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from products where id=NEW.product_id and stock_source='DEFINITEPLAY') then
    insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost)
      select NEW.id,NEW.order_id,'IGPDP'||replace(NEW.id::text,'-',''),sku,NEW.quantity,unit_cost
      from definiteplay_stock where option_id=NEW.product_option_id;
  end if;
  return NEW;
end;
$$;
create trigger snapshot_definiteplay_item after insert on public.order_items for each row execute function public.snapshot_definiteplay_order_item();

create function public.claim_definiteplay_job()
returns jsonb language plpgsql security definer set search_path=public as $$
declare candidate record; j public.definiteplay_jobs%rowtype; o public.orders%rowtype; i public.order_items%rowtype; token uuid;
begin
  for candidate in select d.item_id,d.order_id from definiteplay_jobs d join orders x on x.id=d.order_id
    where d.state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') and d.next_check<=now()
      and coalesce(d.lease_until,'epoch')<now() and x.paid_at is not null and x.status in ('PAID','PROCESSING')
    order by d.next_check,d.created_at limit 50
  loop
    select * into o from orders where id=candidate.order_id for update skip locked;
    if not found then continue; end if;
    select * into j from definiteplay_jobs where item_id=candidate.item_id for update skip locked;
    if not found or o.paid_at is null or o.status not in ('PAID','PROCESSING') or coalesce(j.lease_until,'epoch')>=now() or j.state not in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') then continue; end if;
    if not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) or o.currency<>'USD' then
      update definiteplay_jobs set next_check=now()+interval '1 minute' where item_id=j.item_id; continue;
    end if;
    select * into i from order_items where id=j.item_id;
    if exists(select 1 from order_item_refunds where order_item_id=i.id and status<>'CANCELLED') or
      exists(select 1 from gift_card_codes where order_item_id=i.id and status='SOLD') or i.service_delivered_at is not null then
      update definiteplay_jobs set state='REVIEW',issue='Existing delivery or refund needs review',updated_at=now() where item_id=j.item_id; continue;
    end if;
    if j.submitted_at is null and (o.subtotal<=0 or j.max_unit_cost*j.quantity > i.total_price*greatest(o.subtotal-o.discount,0)/o.subtotal) then
      update definiteplay_jobs set state='REVIEW',issue='Supplier cost exceeds net selling price',updated_at=now() where item_id=j.item_id; continue;
    end if;
    token:=gen_random_uuid();
    update definiteplay_jobs set lease_token=token,lease_until=now()+interval '5 minutes',updated_at=now() where item_id=j.item_id;
    return to_jsonb(j)||jsonb_build_object('lease_token',token);
  end loop;
  return null;
end;
$$;

create function public.mark_definiteplay_submitted(p_item_id uuid,p_token uuid)
returns void language plpgsql security definer set search_path=public as $$
declare j public.definiteplay_jobs%rowtype; o public.orders%rowtype;
begin
  select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
  select * into j from definiteplay_jobs where item_id=p_item_id for update;
  if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<now() or j.submitted_at is not null or j.state<>'QUEUED' then raise exception 'Job is not eligible for submission'; end if;
  if o.paid_at is null or o.status not in ('PAID','PROCESSING') or not exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) then raise exception 'Payment is not verified'; end if;
  if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') then raise exception 'Item was refunded'; end if;
  update definiteplay_jobs set submitted_at=now(),state='SUBMITTED',updated_at=now() where item_id=p_item_id;
end;
$$;

create function public.update_definiteplay_job(p_item_id uuid,p_token uuid,p_state text,p_issue text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_state not in ('WAITING','UNCERTAIN','REVIEW','REJECTED') then raise exception 'Invalid job state'; end if;
  update definiteplay_jobs set state=p_state,issue=left(p_issue,200),next_check=now()+interval '60 seconds',lease_until=null,lease_token=null,updated_at=now()
    where item_id=p_item_id and lease_token=p_token and lease_until>now() and state<>'DELIVERED';
  if not found then raise exception 'Lease was lost'; end if;
end;
$$;

create function public.complete_definiteplay_job(p_item_id uuid,p_token uuid,p_codes text[],p_actual_cost numeric)
returns void language plpgsql security definer set search_path=public as $$
declare j public.definiteplay_jobs%rowtype; o public.orders%rowtype; i public.order_items%rowtype;
begin
  select x.* into o from orders x join definiteplay_jobs d on d.order_id=x.id where d.item_id=p_item_id for update of x;
  select * into j from definiteplay_jobs where item_id=p_item_id for update;
  if j.state='DELIVERED' then return; end if;
  if j.item_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<now() or j.submitted_at is null then raise exception 'Lease was lost'; end if;
  if o.status not in ('PAID','PROCESSING') or o.paid_at is null then raise exception 'Order is no longer deliverable'; end if;
  select * into i from order_items where id=p_item_id for update;
  if cardinality(p_codes) is distinct from j.quantity or (select count(distinct c) from unnest(p_codes)c)<>j.quantity
     or exists(select 1 from unnest(p_codes)c where c is null or length(btrim(c))=0 or length(c)>10000) then raise exception 'Invalid supplier codes'; end if;
  if p_actual_cost is null or p_actual_cost<=0 or p_actual_cost::text in ('NaN','Infinity','-Infinity') or p_actual_cost>j.max_unit_cost*j.quantity then raise exception 'Supplier cost requires review'; end if;
  if exists(select 1 from order_item_refunds where order_item_id=i.id and status<>'CANCELLED') or
     exists(select 1 from gift_card_codes where order_item_id=i.id) then raise exception 'Item already has delivery or refunds'; end if;
  perform set_config('app.definiteplay_delivery',p_item_id::text,true);
  insert into gift_card_codes(product_id,product_option_id,order_item_id,denomination,code,status,reserved_at,sold_at,note)
    select i.product_id,i.product_option_id,i.id,i.denomination,c,'SOLD',now(),now(),'Definite Play: '||j.supplier_reference from unnest(p_codes)c;
  update definiteplay_jobs set state='DELIVERED',actual_cost=p_actual_cost,issue=null,lease_token=null,lease_until=null,updated_at=now() where item_id=i.id;
  if not exists(select 1 from order_items oi where oi.order_id=o.id and oi.service_delivered_at is null
    and (select count(*) from gift_card_codes gc where gc.order_item_id=oi.id and gc.status='SOLD')+
      coalesce((select sum(r.quantity) from order_item_refunds r where r.order_item_id=oi.id and r.status<>'CANCELLED'),0)<oi.quantity) then
    update orders set status='DELIVERED',delivered_at=now(),updated_at=now() where id=o.id;
  else update orders set status='PROCESSING',updated_at=now() where id=o.id; end if;
end;
$$;

-- Serialize refunds/cancellations against submission. An ambiguous external
-- purchase must be reconciled, not refunded while codes may still arrive.
create function public.guard_definiteplay_refund()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform 1 from orders where id=NEW.order_id for update;
  if exists(select 1 from definiteplay_jobs where item_id=NEW.order_item_id and submitted_at is not null and state not in ('DELIVERED','REJECTED')) then raise exception 'Resolve the supplier purchase before refunding this item'; end if;
  return NEW;
end;
$$;
create trigger guard_definiteplay_refund before insert or update on public.order_item_refunds for each row execute function public.guard_definiteplay_refund();

create function public.guard_definiteplay_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (TG_OP='DELETE' or NEW.status in ('CANCELLED','REFUNDED')) and exists(select 1 from definiteplay_jobs where order_id=OLD.id and submitted_at is not null and state not in ('DELIVERED','REJECTED')) then
    raise exception 'Resolve pending supplier purchases before cancelling or deleting this order';
  end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end;
$$;
create trigger guard_definiteplay_order before update of status or delete on public.orders for each row execute function public.guard_definiteplay_order();

create function public.guard_definiteplay_codes()
returns trigger language plpgsql security definer set search_path=public as $$
declare item uuid;
begin
  if TG_OP='INSERT' and NEW.order_item_id is null and exists(select 1 from products where id=NEW.product_id and stock_source='DEFINITEPLAY') then
    raise exception 'Supplier products cannot accept uploaded codes';
  end if;
  item:=case when TG_OP='INSERT' then NEW.order_item_id else OLD.order_item_id end;
  if exists(select 1 from definiteplay_jobs where item_id=item) and current_setting('app.definiteplay_delivery',true) is distinct from item::text then
    raise exception 'Supplier codes are managed by supplier fulfilment';
  end if;
  if TG_OP='UPDATE' and NEW.order_item_id is distinct from OLD.order_item_id and exists(select 1 from definiteplay_jobs where item_id=NEW.order_item_id) then raise exception 'Supplier codes cannot be assigned manually'; end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end;
$$;
create trigger guard_definiteplay_codes before insert or update or delete on public.gift_card_codes for each row execute function public.guard_definiteplay_codes();

create function public.guard_definiteplay_product()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.stock_source='DEFINITEPLAY' and (NEW.delivery_type<>'MANUAL' or NEW.stock_quantity=2147483647 or NEW.allows_custom_value or NEW.allows_player_id_topup) then raise exception 'Use the Supplier tab to manage supplier delivery'; end if;
  return NEW;
end;
$$;
create trigger guard_definiteplay_product before insert or update on public.products for each row execute function public.guard_definiteplay_product();

create function public.guard_definiteplay_item()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then
    if exists(select 1 from definiteplay_jobs where item_id=OLD.id and submitted_at is not null) then
      raise exception 'Supplier order history cannot be deleted';
    end if;
    return OLD;
  end if;
  if exists(select 1 from definiteplay_jobs where item_id=OLD.id) and
    (NEW.unit_price is distinct from OLD.unit_price or NEW.total_price is distinct from OLD.total_price or NEW.quantity is distinct from OLD.quantity or NEW.product_option_id is distinct from OLD.product_option_id or NEW.product_id is distinct from OLD.product_id
     or NEW.order_id is distinct from OLD.order_id or NEW.service_delivered_at is distinct from OLD.service_delivered_at or NEW.fulfillment_mode='PLAYER_ID_TOPUP') then raise exception 'Supplier order items cannot be changed after checkout'; end if;
  return NEW;
end;
$$;
create trigger guard_definiteplay_item before update or delete on public.order_items for each row execute function public.guard_definiteplay_item();

revoke all on function public.configure_definiteplay_product(uuid,boolean,jsonb),public.sync_definiteplay_stock(jsonb,timestamptz),
 public.claim_definiteplay_job(),public.mark_definiteplay_submitted(uuid,uuid),public.update_definiteplay_job(uuid,uuid,text,text),
 public.complete_definiteplay_job(uuid,uuid,text[],numeric),public.snapshot_definiteplay_order_item(),
 public.guard_definiteplay_refund(),public.guard_definiteplay_order(),public.guard_definiteplay_codes(),public.guard_definiteplay_product(),public.guard_definiteplay_item(),
 public.reconcile_owned_code_inventory(uuid),public.reconcile_code_inventory(uuid) from public,anon,authenticated;
grant execute on function public.configure_definiteplay_product(uuid,boolean,jsonb),public.sync_definiteplay_stock(jsonb,timestamptz),
 public.claim_definiteplay_job(),public.mark_definiteplay_submitted(uuid,uuid),public.update_definiteplay_job(uuid,uuid,text,text),
 public.complete_definiteplay_job(uuid,uuid,text[],numeric),public.reconcile_code_inventory(uuid) to service_role;
revoke all on function public.reconcile_owned_code_inventory(uuid) from service_role;
notify pgrst,'reload schema';
commit;
