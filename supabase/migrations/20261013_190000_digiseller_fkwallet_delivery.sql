-- Recipient forms and a separate, paid-invoice FKWallet queue for DigiSeller.
-- Does not publish products, change prices, or create supplier purchases.
begin;
create table public.digiseller_fkwallet_products (
 digiseller_product_id bigint primary key check(digiseller_product_id>0),
 product_id uuid not null references fkwallet_imports(product_id),
 field_map jsonb not null default '[]' check(jsonb_typeof(field_map)='array'),
 ready boolean not null default false, updated_at timestamptz not null default now()
);
create table public.digiseller_fkwallet_jobs (
 invoice_id bigint primary key check(invoice_id>0), digiseller_product_id bigint not null,
 option_id uuid not null references product_options(id), quantity integer not null check(quantity between 1 and 1000),
 supplier_payload jsonb not null, max_unit_cost numeric(24,8) not null check(max_unit_cost>0),
 net_revenue_usd numeric(24,8) not null check(net_revenue_usd>0), verified_at timestamptz not null default now(),
 state text not null default 'QUEUED' check(state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN','REVIEW','DELIVERED')),
 lease_token uuid, lease_until timestamptz, next_check timestamptz not null default now(),
 issue text, goods text, actual_cost numeric(24,8), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index digiseller_fkwallet_jobs_due on digiseller_fkwallet_jobs(next_check) where state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN');
create table public.digiseller_fkwallet_units (
 invoice_id bigint not null references digiseller_fkwallet_jobs(invoice_id), ordinal integer not null check(ordinal between 1 and 1000),
 connection_id text not null, request_key text not null unique,
 submitted_at timestamptz, request_ciphertext text, provider_id text,
 provider_status text check(provider_status in ('in_process','success','error','cancel','refund','unknown')),
 result_ciphertext text, charged_amount numeric(24,8) check(charged_amount>0 and charged_amount::text not in ('NaN','Infinity','-Infinity')),
 primary key(invoice_id,ordinal), unique(connection_id,provider_id)
);
alter table digiseller_fkwallet_products enable row level security;
alter table digiseller_fkwallet_jobs enable row level security;
alter table digiseller_fkwallet_units enable row level security;
revoke all on digiseller_fkwallet_products,digiseller_fkwallet_jobs,digiseller_fkwallet_units from public,anon,authenticated;
grant select on digiseller_fkwallet_products,digiseller_fkwallet_jobs,digiseller_fkwallet_units to service_role;

create function configure_digiseller_fkwallet(p_product_id uuid,p_digiseller_id bigint,p_fields jsonb,p_ready boolean)
returns void language plpgsql security definer set search_path=public as $$
declare imp fkwallet_imports%rowtype;
begin
 perform pg_advisory_xact_lock(p_digiseller_id);
 select * into imp from fkwallet_imports where product_id=p_product_id;
 if imp.product_id is null or p_digiseller_id is null or p_digiseller_id<=0 or p_ready is null then raise exception 'Invalid product setup'; end if;
 if exists(select 1 from product_options where digiseller_product_id=p_digiseller_id and product_id<>p_product_id)
  or exists(select 1 from digiseller_fkwallet_products where digiseller_product_id=p_digiseller_id and product_id<>p_product_id)
  then raise exception 'DigiSeller product belongs to another website product'; end if;
 if p_ready then
  if jsonb_typeof(p_fields) is distinct from 'array' or jsonb_array_length(p_fields)<>jsonb_array_length(imp.customer_fields)
   or (select count(distinct x->>'fieldId') from jsonb_array_elements(p_fields)x)<>jsonb_array_length(p_fields)
   or (select count(distinct x->>'optionId') from jsonb_array_elements(p_fields)x)<>jsonb_array_length(p_fields)
   or exists(select 1 from jsonb_array_elements(p_fields)x where coalesce(x->>'optionId','')!~'^[1-9][0-9]{0,14}$'
    or not exists(select 1 from product_customer_fields f join lateral jsonb_array_elements(imp.customer_fields)m on m->>'fieldId'=f.id::text
     where f.product_id=p_product_id and f.id::text=x->>'fieldId' and f.field_type=x->>'fieldType' and f.field_type=m->>'fieldType' and f.is_required))
   or exists(select 1 from product_options o join lateral jsonb_array_elements(p_fields)x on o.digiseller_option_id=(x->>'optionId')::bigint where o.digiseller_product_id=p_digiseller_id)
   then raise exception 'Customer field links are incomplete'; end if;
 end if;
 insert into digiseller_fkwallet_products(digiseller_product_id,product_id,field_map,ready)
 values(p_digiseller_id,p_product_id,case when p_ready then p_fields else '[]'::jsonb end,p_ready)
 on conflict(digiseller_product_id) do update set ready=excluded.ready,
  field_map=case when p_ready then excluded.field_map else digiseller_fkwallet_products.field_map end,updated_at=now();
end $$;

create function digiseller_fkwallet_available(p_option_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare qty integer; reserved bigint;
begin
 select least(1000,s.available_quantity) into qty from product_options o join products p on p.id=o.product_id
 join definiteplay_stock s on s.option_id=o.id join fkwallet_imports i on i.product_id=p.id
 join fkwallet_delivery_settings d on d.product_id=p.id
 join digiseller_fkwallet_products c on c.product_id=p.id and c.digiseller_product_id=o.digiseller_product_id and c.ready
 where o.id=p_option_id and o.is_active and p.status='ACTIVE' and p.stock_source='FKWALLET'
 and s.synced_at>now()-interval '15 minutes' and s.synced_at<now()+interval '1 minute'
 and exists(select 1 from fkwallet_worker_state where id and connection_id=i.connection_id and seen_at>now()-interval '3 minutes');
 if qty is null then return 0; end if;
 select coalesce(sum(quantity),0) into reserved from digiseller_fkwallet_jobs where option_id=p_option_id and state<>'DELIVERED';
 return greatest(0,qty-reserved)::integer;
end $$;

create function queue_digiseller_fkwallet_order(p_invoice_id bigint,p_digiseller_id bigint,p_option_id uuid,p_quantity integer,p_net_usd numeric,p_recipient jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare j digiseller_fkwallet_jobs%rowtype; o product_options%rowtype; imp fkwallet_imports%rowtype;
 l fkwallet_product_links%rowtype; cfg digiseller_fkwallet_products%rowtype; kind text; cost numeric; info jsonb;
begin
 if p_invoice_id is null or p_invoice_id<=0 or p_quantity is null or p_quantity not between 1 and 1000
  or p_net_usd is null or p_net_usd<=0 or p_net_usd::text in ('NaN','Infinity','-Infinity')
  or jsonb_typeof(p_recipient) is distinct from 'array' or octet_length(p_recipient::text)>50000 then raise exception 'Invalid verified invoice'; end if;
 perform pg_advisory_xact_lock(p_invoice_id);
 select coalesce(jsonb_agg(x order by x->>'fieldId'),'[]'::jsonb) into info from jsonb_array_elements(p_recipient)x;
 select * into j from digiseller_fkwallet_jobs where invoice_id=p_invoice_id for update;
 if found then
  if j.digiseller_product_id<>p_digiseller_id or j.option_id<>p_option_id or j.quantity<>p_quantity
   or j.supplier_payload->'customerInformation' is distinct from info then raise exception 'Invoice recipient or selection changed'; end if;
  update digiseller_fkwallet_jobs set verified_at=now(),net_revenue_usd=least(net_revenue_usd,p_net_usd) where invoice_id=p_invoice_id;
  return j.goods;
 end if;
 if exists(select 1 from digiseller_deliveries where invoice_id=p_invoice_id) or exists(select 1 from digiseller_supplier_jobs where invoice_id=p_invoice_id) then raise exception 'Invoice already belongs to another delivery'; end if;
 select * into o from product_options where id=p_option_id and is_active and digiseller_product_id=p_digiseller_id for update;
 if o.id is null or o.is_custom_value then raise exception 'Supplier option is not connected'; end if;
 select * into imp from fkwallet_imports where product_id=o.product_id;
 select * into l from fkwallet_product_links where option_id=o.id and product_id=o.product_id and connection_id=imp.connection_id;
 select * into cfg from digiseller_fkwallet_products where digiseller_product_id=p_digiseller_id and product_id=o.product_id and ready;
 select delivery_kind into kind from fkwallet_delivery_settings where product_id=o.product_id;
 if l.option_id is null or cfg.product_id is null or kind is null or digiseller_fkwallet_available(o.id)<p_quantity then raise exception 'Supplier delivery is not ready'; end if;
 if jsonb_array_length(info)<>jsonb_array_length(imp.customer_fields)
  or jsonb_array_length(cfg.field_map)<>jsonb_array_length(imp.customer_fields)
  or (select count(distinct x->>'fieldId') from jsonb_array_elements(info)x)<>jsonb_array_length(info)
  or exists(select 1 from jsonb_array_elements(imp.customer_fields)m where not exists(
   select 1 from jsonb_array_elements(info)x join product_customer_fields f on f.id::text=x->>'fieldId'
   join lateral jsonb_array_elements(cfg.field_map) cm on cm->>'fieldId'=f.id::text
   where x->>'fieldId'=m->>'fieldId' and f.product_id=o.product_id and f.field_type=m->>'fieldType' and cm->>'fieldType'=f.field_type and f.is_required
   and jsonb_typeof(x->'value')='string' and length(btrim(x->>'value')) between 1 and 2000
   and (f.field_type<>'EMAIL' or x->>'value' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   and (f.field_type<>'NUMBER' or x->>'value' ~ '^[0-9]+(\.[0-9]+)?$')))
  then raise exception 'Required recipient details are missing or invalid'; end if;
 cost:=ceil(l.supplier_cost/imp.exchange_rate*100000000)/100000000;
 if cost<=0 or cost*p_quantity>p_net_usd then raise exception 'Supplier cost exceeds verified proceeds'; end if;
 insert into digiseller_fkwallet_jobs(invoice_id,digiseller_product_id,option_id,quantity,max_unit_cost,net_revenue_usd,supplier_payload)
 values(p_invoice_id,p_digiseller_id,o.id,p_quantity,cost,p_net_usd,jsonb_build_object(
  'connectionId',imp.connection_id,'categoryId',imp.supplier_category_id,'productId',l.supplier_product_id,
  'supplierCost',l.supplier_cost,'currency',l.supplier_currency,'exchangeRate',imp.exchange_rate,'deliveryKind',kind,
  'fieldMap',imp.customer_fields,'customerInformation',info,'digiFieldMap',cfg.field_map,
  'digiOptionId',o.digiseller_option_id,'digiVariantId',o.digiseller_variant_id));
 insert into digiseller_fkwallet_units(invoice_id,ordinal,connection_id,request_key)
 select p_invoice_id,n,imp.connection_id,'igpdsfk-'||p_invoice_id::text||'-'||n from generate_series(1,p_quantity)n;
 return null;
end $$;

create function claim_digiseller_fkwallet_job() returns jsonb language plpgsql security definer set search_path=public as $$
declare j digiseller_fkwallet_jobs%rowtype; token uuid;
begin
 select * into j from digiseller_fkwallet_jobs where state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN')
  and next_check<=now() and coalesce(lease_until,'epoch')<now() order by next_check,created_at for update skip locked limit 1;
 if not found then return null; end if;
 token:=gen_random_uuid();
 update digiseller_fkwallet_jobs set lease_token=token,lease_until=now()+interval '5 minutes',updated_at=now() where invoice_id=j.invoice_id;
 return to_jsonb(j)||jsonb_build_object('item_id','digiseller-'||j.invoice_id::text,'lease_token',token);
end $$;
create function update_digiseller_fkwallet_job(p_invoice_id bigint,p_token uuid,p_state text,p_issue text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_state is null or p_state not in ('WAITING','UNCERTAIN','REVIEW') then raise exception 'Invalid state'; end if;
 update digiseller_fkwallet_jobs set state=p_state,issue=left(p_issue,200),next_check=now()+interval '60 seconds',lease_until=null,lease_token=null,updated_at=now()
 where invoice_id=p_invoice_id and lease_token=p_token and lease_until>now() and state<>'DELIVERED';
 if not found then raise exception 'Lease was lost'; end if;
end $$;
create function mark_digiseller_fkwallet_unit(p_invoice_id bigint,p_token uuid,p_ordinal integer,p_request text)
returns void language plpgsql security definer set search_path=public as $$
declare j digiseller_fkwallet_jobs%rowtype;
begin
 select * into j from digiseller_fkwallet_jobs where invoice_id=p_invoice_id for update;
 if j.invoice_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now()
  or j.state not in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') then raise exception 'Lease was lost'; end if;
 if j.verified_at<now()-interval '5 minutes' or j.max_unit_cost*j.quantity>j.net_revenue_usd then raise exception 'Reverify invoice payment and proceeds'; end if;
 if coalesce(length(p_request),0) not between 20 and 100000 then raise exception 'Invalid purchase record'; end if;
 if exists(select 1 from digiseller_fkwallet_units where invoice_id=p_invoice_id and ordinal<p_ordinal and provider_status is distinct from 'success') then raise exception 'Complete the previous unit first'; end if;
 update digiseller_fkwallet_units set submitted_at=now(),request_ciphertext=p_request where invoice_id=p_invoice_id and ordinal=p_ordinal and submitted_at is null;
 if not found then raise exception 'Unit was already submitted'; end if;
 update digiseller_fkwallet_jobs set state='SUBMITTED',updated_at=now() where invoice_id=p_invoice_id;
end $$;
create function record_digiseller_fkwallet_unit(p_invoice_id bigint,p_token uuid,p_ordinal integer,p_provider_id text,p_status text,p_amount numeric,p_result text)
returns void language plpgsql security definer set search_path=public as $$
declare j digiseller_fkwallet_jobs%rowtype; u digiseller_fkwallet_units%rowtype;
begin
 select * into j from digiseller_fkwallet_jobs where invoice_id=p_invoice_id for update;
 if j.invoice_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.state='DELIVERED' then raise exception 'Lease was lost'; end if;
 select * into u from digiseller_fkwallet_units where invoice_id=p_invoice_id and ordinal=p_ordinal for update;
 if u.submitted_at is null or coalesce(p_provider_id,'')!~'^[1-9][0-9]*$' or p_status is null or p_status not in ('unknown','success')
  or (u.provider_id is not null and u.provider_id<>p_provider_id) or u.provider_status='success'
  or coalesce(length(p_result),0) not between 20 and 100000 then raise exception 'Invalid supplier result'; end if;
 if p_status='success' and (p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount>(j.supplier_payload->>'supplierCost')::numeric) then raise exception 'Invalid supplier charge'; end if;
 update digiseller_fkwallet_units set provider_id=p_provider_id,provider_status=p_status,charged_amount=p_amount,result_ciphertext=p_result where invoice_id=p_invoice_id and ordinal=p_ordinal;
end $$;
create function complete_digiseller_fkwallet_job(p_invoice_id bigint,p_token uuid,p_codes text[])
returns void language plpgsql security definer set search_path=public as $$
declare j digiseller_fkwallet_jobs%rowtype; cost numeric; delivered_goods text;
begin
 select * into j from digiseller_fkwallet_jobs where invoice_id=p_invoice_id for update;
 if j.invoice_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<=now() or j.state='DELIVERED' then raise exception 'Lease was lost'; end if;
 if (select count(*) from digiseller_fkwallet_units where invoice_id=p_invoice_id and provider_status='success' and charged_amount>0)<>j.quantity then raise exception 'Delivery is not confirmed'; end if;
 select ceil(sum(charged_amount)/(j.supplier_payload->>'exchangeRate')::numeric*100000000)/100000000 into cost from digiseller_fkwallet_units where invoice_id=p_invoice_id;
 if cost is null or cost>j.max_unit_cost*j.quantity or cost>j.net_revenue_usd or j.verified_at<now()-interval '5 minutes' then raise exception 'Review payment and supplier cost'; end if;
 if j.supplier_payload->>'deliveryKind'='CODE' then
  if cardinality(p_codes) is distinct from j.quantity or (select count(distinct c) from unnest(p_codes)c)<>j.quantity
   or exists(select 1 from unnest(p_codes)c where c is null or length(btrim(c)) not between 1 and 10000) then raise exception 'Invalid delivery codes'; end if;
  delivered_goods:=array_to_string(p_codes,E'\n\n');
 else
  if cardinality(p_codes) is distinct from 0 then raise exception 'Account activation does not deliver codes'; end if;
  delivered_goods:='Successfully delivered to the account details provided with your order.';
 end if;
 update digiseller_fkwallet_jobs set state='DELIVERED',goods=delivered_goods,actual_cost=cost,issue=null,lease_token=null,lease_until=null,updated_at=now() where invoice_id=p_invoice_id;
end $$;

-- A DigiSeller invoice can never be fulfilled by two different stock sources.
create function guard_digiseller_fkwallet_invoice() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(NEW.invoice_id);
 if TG_TABLE_NAME<>'digiseller_fkwallet_jobs' and exists(select 1 from digiseller_fkwallet_jobs where invoice_id=NEW.invoice_id)
  or TG_TABLE_NAME='digiseller_fkwallet_jobs' and (exists(select 1 from digiseller_supplier_jobs where invoice_id=NEW.invoice_id) or exists(select 1 from digiseller_deliveries where invoice_id=NEW.invoice_id))
  then raise exception 'Invoice already belongs to another delivery'; end if;
 return NEW;
end $$;
create trigger guard_fk_invoice before insert on digiseller_fkwallet_jobs for each row execute function guard_digiseller_fkwallet_invoice();
create trigger guard_fk_invoice before insert on digiseller_supplier_jobs for each row execute function guard_digiseller_fkwallet_invoice();
create trigger guard_fk_invoice before insert on digiseller_deliveries for each row execute function guard_digiseller_fkwallet_invoice();
create function guard_digiseller_fkwallet_source() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if OLD.stock_source is distinct from NEW.stock_source and exists(select 1 from digiseller_fkwallet_jobs j join product_options o on o.id=j.option_id where o.product_id=OLD.id and j.state<>'DELIVERED') then raise exception 'Resolve outstanding DigiSeller FKWallet orders first'; end if;
 return NEW;
end $$;
create trigger guard_digiseller_fkwallet_source before update of stock_source on products for each row execute function guard_digiseller_fkwallet_source();

revoke all on function configure_digiseller_fkwallet(uuid,bigint,jsonb,boolean),digiseller_fkwallet_available(uuid),queue_digiseller_fkwallet_order(bigint,bigint,uuid,integer,numeric,jsonb),claim_digiseller_fkwallet_job(),update_digiseller_fkwallet_job(bigint,uuid,text,text),mark_digiseller_fkwallet_unit(bigint,uuid,integer,text),record_digiseller_fkwallet_unit(bigint,uuid,integer,text,text,numeric,text),complete_digiseller_fkwallet_job(bigint,uuid,text[]),guard_digiseller_fkwallet_invoice(),guard_digiseller_fkwallet_source() from public,anon,authenticated;
grant execute on function configure_digiseller_fkwallet(uuid,bigint,jsonb,boolean),digiseller_fkwallet_available(uuid),queue_digiseller_fkwallet_order(bigint,bigint,uuid,integer,numeric,jsonb),claim_digiseller_fkwallet_job(),update_digiseller_fkwallet_job(bigint,uuid,text,text),mark_digiseller_fkwallet_unit(bigint,uuid,integer,text),record_digiseller_fkwallet_unit(bigint,uuid,integer,text,text,numeric,text),complete_digiseller_fkwallet_job(bigint,uuid,text[]) to service_role;
notify pgrst,'reload schema';
commit;
