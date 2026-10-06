-- GiftPort shares the existing protected supplier queue, with separate provider claims.
-- Applying this migration does not activate any product or purchase any card.
begin;
alter table products drop constraint products_stock_source_check;
alter table products add constraint products_stock_source_check check(stock_source in ('OWNED','DEFINITEPLAY','GIFTPORT'));
alter table definiteplay_jobs add column provider text not null default 'DEFINITEPLAY' check(provider in ('DEFINITEPLAY','GIFTPORT'));
alter table definiteplay_jobs add column supplier_payload jsonb;
alter table definiteplay_jobs add column cost_is_estimate boolean not null default false;
alter table definiteplay_stock add column giftport_amount numeric(20,2);
alter table definiteplay_stock add column giftport_limit integer check(giftport_limit between 1 and 100);
create table giftport_settings (
 id boolean primary key default true check(id),
 recipient_name text not null check(length(btrim(recipient_name)) between 1 and 150),
 recipient_email text not null check(recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 mobile text not null check(mobile ~ '^[0-9]{10,15}$'),
 updated_at timestamptz not null default now()
);
create table giftport_cards (
 item_id uuid not null references definiteplay_jobs(item_id), ordinal integer not null check(ordinal between 1 and 1000),
 supplier_reference text not null unique, submitted_at timestamptz,
 transaction_id text unique, code text, completed_at timestamptz,
 primary key(item_id,ordinal)
);
create unique index giftport_unique_redeem_code on giftport_cards((split_part(code,E'\nCard number: ',1))) where code is not null;
alter table giftport_settings enable row level security;
alter table giftport_cards enable row level security;
revoke all on giftport_settings,giftport_cards from public,anon,authenticated;
grant select,insert,update,delete on giftport_settings,giftport_cards to service_role;

-- Release between individual cards without a one-minute delay per successful card.
create or replace function update_definiteplay_job(p_item_id uuid,p_token uuid,p_state text,p_issue text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_state not in ('WAITING','UNCERTAIN','REVIEW','REJECTED') then raise exception 'Invalid job state'; end if;
 update definiteplay_jobs set state=p_state,issue=left(p_issue,200),next_check=now()+(case when provider='GIFTPORT' and p_state='WAITING' then interval '2 seconds' else interval '60 seconds' end),lease_until=null,lease_token=null,updated_at=now()
 where item_id=p_item_id and lease_token=p_token and lease_until>now() and state<>'DELIVERED';
 if not found then raise exception 'Lease was lost'; end if;
end $$;

-- Extend existing guards while retaining installed range/manual-delivery exceptions.
do $$ declare fn text; src text; changed text; begin
 foreach fn in array array['reconcile_code_inventory(uuid)','guard_order_item_combined_stock()','guard_definiteplay_codes()','guard_definiteplay_product()'] loop
  src:=pg_get_functiondef(('public.'||fn)::regprocedure);
  changed:=replace(replace(src,$q$stock_source='DEFINITEPLAY'$q$,$q$stock_source in ('DEFINITEPLAY','GIFTPORT')$q$),$q$v_source='DEFINITEPLAY'$q$,$q$v_source in ('DEFINITEPLAY','GIFTPORT')$q$);
  if changed=src then raise exception 'Unrecognised supplier guard: %',fn; end if;
  execute changed;
 end loop;
 -- Keep the existing worker on Definite Play; provider filtering happens before leasing.
 src:=pg_get_functiondef('public.claim_definiteplay_job()'::regprocedure);
 changed:=replace(src,'claim_definiteplay_job()','claim_supplier_job(p_provider text)');
 changed:=replace(changed,$q$where d.state in$q$,$q$where d.provider=p_provider and d.state in$q$);
 if changed=src or position('d.provider=p_provider' in changed)=0 then raise exception 'Unrecognised supplier queue'; end if;
 execute changed;
 src:=pg_get_functiondef('public.complete_definiteplay_job(uuid,uuid,text[],numeric)'::regprocedure);
 changed:=replace(src,$q$'Definite Play: '||j.supplier_reference$q$,$q$(case when j.provider='GIFTPORT' then 'GiftPort: ' else 'Definite Play: ' end)||j.supplier_reference$q$);
 if changed=src then raise exception 'Unrecognised supplier delivery function'; end if;
 execute changed;
end $$;
create or replace function claim_definiteplay_job() returns jsonb language sql security definer set search_path=public as $$ select claim_supplier_job('DEFINITEPLAY'); $$;

create or replace function snapshot_definiteplay_order_item() returns trigger language plpgsql security definer set search_path=public as $$
declare s definiteplay_stock%rowtype; source text; recipient giftport_settings%rowtype;
begin
 if NEW.fulfillment_mode='RANGE_MANUAL' then return NEW; end if;
 select stock_source into source from products where id=NEW.product_id;
 if source not in ('DEFINITEPLAY','GIFTPORT') then return NEW; end if;
 select * into s from definiteplay_stock where option_id=NEW.product_option_id;
 if not found then raise exception 'Supplier option is not configured'; end if;
 if source='GIFTPORT' then
  select * into recipient from giftport_settings where id;
  if not found or s.giftport_amount is null then raise exception 'GiftPort setup is incomplete'; end if;
 end if;
 insert into definiteplay_jobs(item_id,order_id,supplier_reference,sku,quantity,max_unit_cost,provider,cost_is_estimate,supplier_payload)
 values(NEW.id,NEW.order_id,(case when source='GIFTPORT' then 'IGPGP' else 'IGPDP' end)||replace(NEW.id::text,'-',''),s.sku,NEW.quantity,s.unit_cost,source,source='GIFTPORT',
 case when source='GIFTPORT' then jsonb_build_object('amount',s.giftport_amount,'mobile',recipient.mobile,'recipient_name',recipient.recipient_name,'recipient_email',recipient.recipient_email) else null end);
 if source='GIFTPORT' then
  insert into giftport_cards(item_id,ordinal,supplier_reference) select NEW.id,n,'IGPGP'||replace(NEW.id::text,'-','')||'_'||n from generate_series(1,NEW.quantity)n;
 end if;
 return NEW;
end $$;

create function configure_giftport_product(p_product_id uuid,p_enabled boolean,p_mappings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare p products%rowtype; r jsonb; face numeric; budget numeric; cap integer;
begin
 select * into p from products where id=p_product_id for update;
 if not found or p.seller_id is not null or p.stock_source not in ('OWNED','GIFTPORT') then raise exception 'Switch off the other supplier first'; end if;
 if exists(select 1 from definiteplay_jobs j join orders o on o.id=j.order_id join order_items i on i.id=j.item_id where i.product_id=p_product_id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then raise exception 'Resolve existing supplier orders first'; end if;
 if not p_enabled then
  update products set stock_source='OWNED' where id=p_product_id;
  delete from definiteplay_stock where product_id=p_product_id;
  perform reconcile_code_inventory(p_product_id); return;
 end if;
 if not exists(select 1 from giftport_settings where id) then raise exception 'Save your business recipient details first'; end if;
 if p.allows_custom_value or p.allows_player_id_topup then raise exception 'GiftPort automatic delivery supports fixed code options only'; end if;
 if exists(select 1 from gift_card_codes where product_id=p_product_id and status in ('AVAILABLE','RESERVED')) then raise exception 'Use a separate product for supplier delivery'; end if;
 if jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings) not between 1 and 50 then raise exception 'Invalid supplier links'; end if;
 if (select count(distinct x->>'optionId') from jsonb_array_elements(p_mappings)x)<>jsonb_array_length(p_mappings) then raise exception 'Duplicate options'; end if;
 for r in select value from jsonb_array_elements(p_mappings) loop
  face:=(r->>'amount')::numeric; budget:=(r->>'unitCost')::numeric; cap:=(r->>'limit')::integer;
  if face is null or face<=0 or face::text in ('NaN','Infinity','-Infinity') or face<>round(face,2) or budget is null or budget<=0 or budget::text in ('NaN','Infinity','-Infinity') or cap is null or cap not between 1 and 100 or coalesce(r->>'operatorCode','')!~'^[A-Za-z0-9._-]{1,100}$' then raise exception 'Invalid supplier amount, budget or limit'; end if;
  if not exists(select 1 from product_options where id=(r->>'optionId')::uuid and product_id=p_product_id and denomination=face and denomination_currency='INR') then raise exception 'Option or INR face value does not match'; end if;
 end loop;
 if exists(select 1 from product_options o where o.product_id=p_product_id and o.is_active and not exists(select 1 from jsonb_array_elements(p_mappings)x where (x->>'optionId')::uuid=o.id)) then raise exception 'Link every active option first'; end if;
 delete from definiteplay_stock where product_id=p_product_id;
 insert into definiteplay_stock(option_id,product_id,sku,unit_cost,giftport_amount,giftport_limit)
 select (x->>'optionId')::uuid,p_product_id,x->>'operatorCode',(x->>'unitCost')::numeric,(x->>'amount')::numeric,(x->>'limit')::integer from jsonb_array_elements(p_mappings)x;
 update products set stock_source='GIFTPORT',delivery_type='MANUAL',stock_quantity=0 where id=p_product_id;
 update product_options set stock_quantity=0,is_in_stock=false where product_id=p_product_id;
end $$;

-- Guard direct mode changes, option edits, and accidental cross-provider configuration.
create function guard_giftport_configuration() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='products' then
  if OLD.stock_source='GIFTPORT' and NEW.stock_source='DEFINITEPLAY' then raise exception 'Switch to uploaded stock first'; end if;
  if OLD.stock_source is distinct from NEW.stock_source and exists(select 1 from definiteplay_jobs j join orders o on o.id=j.order_id join order_items i on i.id=j.item_id where i.product_id=OLD.id and j.state not in ('DELIVERED','REJECTED') and (j.submitted_at is not null or o.status not in ('CANCELLED','REFUNDED'))) then raise exception 'Resolve existing supplier orders first'; end if;
 elsif exists(select 1 from products where id=OLD.product_id and stock_source='GIFTPORT') and (TG_OP='DELETE' or NEW.product_id is distinct from OLD.product_id or NEW.denomination is distinct from OLD.denomination or NEW.denomination_currency is distinct from OLD.denomination_currency) then
  raise exception 'Disable supplier delivery before editing denominations';
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
create trigger guard_giftport_mode before update of stock_source on products for each row execute function guard_giftport_configuration();
create trigger guard_giftport_option before update or delete on product_options for each row execute function guard_giftport_configuration();

create function sync_giftport_stock(p_rows jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r record; qty integer;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Invalid supplier availability'; end if;
 for r in select s.*,x.value as facts from definiteplay_stock s join products p on p.id=s.product_id left join lateral(select value from jsonb_array_elements(p_rows) where value->>'optionId'=s.option_id::text limit 1)x on true where p.stock_source='GIFTPORT' order by s.product_id,s.option_id loop
  qty:=least(r.giftport_limit,greatest(0,coalesce((r.facts->>'quantity')::integer,0)));
  update definiteplay_stock set available_quantity=qty,synced_at=now() where option_id=r.option_id;
  update product_options set stock_quantity=qty,is_in_stock=qty>0,updated_at=now() where id=r.option_id;
 end loop;
 update products p set stock_quantity=coalesce((select sum(stock_quantity)::integer from product_options where product_id=p.id and is_active),0),updated_at=now() where p.stock_source='GIFTPORT';
end $$;
create function giftport_active_options() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('optionId',s.option_id,'operatorCode',s.sku,'amount',s.giftport_amount,'limit',s.giftport_limit)), '[]'::jsonb) from definiteplay_stock s join products p on p.id=s.product_id where p.stock_source='GIFTPORT';
$$;

create function next_giftport_card(p_item_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if not exists(select 1 from definiteplay_jobs where item_id=p_item_id and provider='GIFTPORT' and lease_token=p_token and lease_until>now()) then raise exception 'Lease was lost'; end if;
 select to_jsonb(c) into result from giftport_cards c where item_id=p_item_id and completed_at is null order by ordinal limit 1;
 return result;
end $$;
create function mark_giftport_card_submitted(p_item_id uuid,p_token uuid,p_ordinal integer) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from orders o join definiteplay_jobs j on j.order_id=o.id where j.item_id=p_item_id for update of o;
 perform 1 from definiteplay_jobs j join orders o on o.id=j.order_id where j.item_id=p_item_id and j.provider='GIFTPORT' and j.submitted_at is not null and j.lease_token=p_token and j.lease_until>now() and o.paid_at is not null and o.status in ('PAID','PROCESSING') and o.currency='USD' and exists(select 1 from payments where order_id=o.id and status='VERIFIED' and currency='USD' and amount>=o.total) for update of j;
 if not found then raise exception 'GiftPort order is not eligible'; end if;
 if exists(select 1 from order_item_refunds where order_item_id=p_item_id and status<>'CANCELLED') then raise exception 'Item was refunded'; end if;
 if exists(select 1 from giftport_cards where item_id=p_item_id and ordinal<p_ordinal and completed_at is null) then raise exception 'Complete the previous card first'; end if;
 update giftport_cards set submitted_at=now() where item_id=p_item_id and ordinal=p_ordinal and submitted_at is null and completed_at is null;
 if not found then raise exception 'Card was already submitted'; end if;
end $$;
create function record_giftport_card(p_item_id uuid,p_token uuid,p_ordinal integer,p_transaction_id text,p_code text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from definiteplay_jobs where item_id=p_item_id and provider='GIFTPORT' and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'Lease was lost'; end if;
 if coalesce(p_transaction_id,'')!~'^[A-Za-z0-9_-]{1,100}$' or p_code is null or length(btrim(p_code)) not between 1 and 10000 then raise exception 'Invalid supplier delivery'; end if;
 if exists(select 1 from giftport_cards where code=p_code and (item_id<>p_item_id or ordinal<>p_ordinal)) then raise exception 'Duplicate supplier code'; end if;
 update giftport_cards set transaction_id=p_transaction_id,code=p_code,completed_at=now() where item_id=p_item_id and ordinal=p_ordinal and submitted_at is not null and completed_at is null;
 if not found and not exists(select 1 from giftport_cards where item_id=p_item_id and ordinal=p_ordinal and code=p_code and transaction_id=p_transaction_id and completed_at is not null) then raise exception 'Card is not eligible'; end if;
end $$;
create function complete_giftport_job(p_item_id uuid,p_token uuid) returns void language plpgsql security definer set search_path=public as $$
declare codes text[]; j definiteplay_jobs%rowtype; begin
 select * into j from definiteplay_jobs where item_id=p_item_id and provider='GIFTPORT';
 if not found then raise exception 'Invalid GiftPort job'; end if;
 select array_agg(code order by ordinal) into codes from giftport_cards where item_id=p_item_id and completed_at is not null;
 -- GiftPort exposes face value, not invoiced supplier cost. Record the explicitly
 -- configured budget as an estimate; never claim it is a confirmed wholesale cost.
 perform complete_definiteplay_job(p_item_id,p_token,codes,j.max_unit_cost*j.quantity);
end $$;
revoke all on function claim_supplier_job(text),configure_giftport_product(uuid,boolean,jsonb),sync_giftport_stock(jsonb),giftport_active_options(),next_giftport_card(uuid,uuid),mark_giftport_card_submitted(uuid,uuid,integer),record_giftport_card(uuid,uuid,integer,text,text),complete_giftport_job(uuid,uuid),guard_giftport_configuration() from public,anon,authenticated;
grant execute on function claim_supplier_job(text),configure_giftport_product(uuid,boolean,jsonb),sync_giftport_stock(jsonb),giftport_active_options(),next_giftport_card(uuid,uuid),mark_giftport_card_submitted(uuid,uuid,integer),record_giftport_card(uuid,uuid,integer,text,text),complete_giftport_job(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
