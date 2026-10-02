begin;

-- Separate from website orders: DigiSeller invoices are independently verified.
create table public.digiseller_supplier_jobs (
  invoice_id bigint primary key check(invoice_id>0),
  digiseller_product_id bigint not null check(digiseller_product_id>0),
  option_id uuid not null references public.product_options(id),
  supplier_reference text not null unique,
  sku text not null,
  quantity integer not null check(quantity between 1 and 1000),
  max_unit_cost numeric(20,8) not null check(max_unit_cost>0 and max_unit_cost::text not in ('NaN','Infinity','-Infinity')),
  net_revenue_usd numeric(20,8) not null check(net_revenue_usd>0 and net_revenue_usd::text not in ('NaN','Infinity','-Infinity')),
  verified_at timestamptz not null default now(),
  state text not null default 'QUEUED' check(state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN','REVIEW','REJECTED','DELIVERED')),
  submitted_at timestamptz, next_check timestamptz not null default now(),
  lease_until timestamptz, lease_token uuid, issue text, goods text,
  actual_cost numeric(20,8), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index digiseller_supplier_jobs_due on public.digiseller_supplier_jobs(next_check) where state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN');
create table public.digiseller_supplier_worker (id boolean primary key default true check(id), seen_at timestamptz not null);
alter table public.digiseller_supplier_jobs enable row level security;
alter table public.digiseller_supplier_worker enable row level security;
revoke all on public.digiseller_supplier_jobs, public.digiseller_supplier_worker from public,anon,authenticated;
grant select,insert,update on public.digiseller_supplier_jobs,public.digiseller_supplier_worker to service_role;

create function public.digiseller_supplier_available(p_option_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare s public.definiteplay_stock%rowtype; reserved integer;
begin
  if not exists(select 1 from digiseller_supplier_worker where seen_at>now()-interval '2 minutes') then return 0; end if;
  if not exists(select 1 from product_options o join products p on p.id=o.product_id where o.id=p_option_id and o.is_active and p.stock_source='DEFINITEPLAY') then return 0; end if;
  select * into s from definiteplay_stock where option_id=p_option_id;
  if not found or s.currency<>'USD' or s.unit_cost<=0 or s.synced_at<now()-interval '15 minutes' or s.synced_at>now()+interval '1 minute' then return 0; end if;
  select coalesce(sum(quantity),0)::integer into reserved from digiseller_supplier_jobs where option_id=p_option_id and state not in ('DELIVERED','REJECTED');
  return greatest(0,s.available_quantity-reserved);
end $$;

-- Called only by the service after querying DigiSeller's authenticated purchase API.
create function public.queue_digiseller_supplier_order(p_invoice_id bigint,p_product_id bigint,p_option_id uuid,p_quantity integer,p_net_revenue_usd numeric)
returns text language plpgsql security definer set search_path=public as $$
declare j public.digiseller_supplier_jobs%rowtype; s public.definiteplay_stock%rowtype;
begin
  if p_invoice_id is null or p_invoice_id<=0 or p_quantity is null or p_quantity not between 1 and 1000 or p_net_revenue_usd is null or p_net_revenue_usd<=0 or p_net_revenue_usd::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid verified purchase'; end if;
  perform pg_advisory_xact_lock(p_invoice_id);
  select * into j from digiseller_supplier_jobs where invoice_id=p_invoice_id for update;
  if found then
    if j.digiseller_product_id<>p_product_id or j.option_id<>p_option_id or j.quantity<>p_quantity then raise exception 'Invoice selection changed'; end if;
    update digiseller_supplier_jobs set verified_at=now(),net_revenue_usd=least(net_revenue_usd,p_net_revenue_usd) where invoice_id=p_invoice_id;
    return j.goods;
  end if;
  if exists(select 1 from digiseller_deliveries where invoice_id=p_invoice_id) then raise exception 'Invoice already delivered from owned stock'; end if;
  perform 1 from product_options o join products p on p.id=o.product_id where o.id=p_option_id and o.digiseller_product_id=p_product_id and o.is_active and p.stock_source='DEFINITEPLAY' for update of o;
  if not found then raise exception 'Supplier product is not connected'; end if;
  select * into s from definiteplay_stock where option_id=p_option_id;
  if public.digiseller_supplier_available(p_option_id)<p_quantity then raise exception 'Supplier stock unavailable'; end if;
  if s.unit_cost*p_quantity>p_net_revenue_usd then raise exception 'Supplier cost exceeds verified proceeds'; end if;
  insert into digiseller_supplier_jobs(invoice_id,digiseller_product_id,option_id,supplier_reference,sku,quantity,max_unit_cost,net_revenue_usd)
    values(p_invoice_id,p_product_id,p_option_id,'IGPDS'||p_invoice_id::text,s.sku,p_quantity,s.unit_cost,p_net_revenue_usd);
  return null;
end $$;

create function public.claim_digiseller_supplier_job()
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.digiseller_supplier_jobs%rowtype; token uuid;
begin
  insert into digiseller_supplier_worker(id,seen_at) values(true,now()) on conflict(id) do update set seen_at=excluded.seen_at;
  select * into j from digiseller_supplier_jobs where state in ('QUEUED','SUBMITTED','WAITING','UNCERTAIN') and next_check<=now() and coalesce(lease_until,'epoch')<now()
    and (submitted_at is not null or verified_at>now()-interval '5 minutes') order by next_check,created_at for update skip locked limit 1;
  if not found then return null; end if;
  if j.submitted_at is null and j.max_unit_cost*j.quantity>j.net_revenue_usd then
    update digiseller_supplier_jobs set state='REVIEW',issue='Supplier cost exceeds verified proceeds' where invoice_id=j.invoice_id; return null;
  end if;
  token:=gen_random_uuid();
  update digiseller_supplier_jobs set lease_token=token,lease_until=now()+interval '5 minutes',updated_at=now() where invoice_id=j.invoice_id;
  return to_jsonb(j)||jsonb_build_object('item_id',j.invoice_id::text,'lease_token',token);
end $$;

create function public.mark_digiseller_supplier_submitted(p_invoice_id bigint,p_token uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update digiseller_supplier_jobs set submitted_at=now(),state='SUBMITTED',updated_at=now()
    where invoice_id=p_invoice_id and lease_token=p_token and lease_until>now() and submitted_at is null and state='QUEUED'
      and verified_at>now()-interval '5 minutes' and max_unit_cost*quantity<=net_revenue_usd;
  if not found then raise exception 'Job is not eligible for submission'; end if;
end $$;

create function public.update_digiseller_supplier_job(p_invoice_id bigint,p_token uuid,p_state text,p_issue text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_state not in ('WAITING','UNCERTAIN','REVIEW','REJECTED') then raise exception 'Invalid job state'; end if;
  update digiseller_supplier_jobs set state=p_state,issue=left(p_issue,200),next_check=now()+interval '60 seconds',lease_until=null,lease_token=null,updated_at=now()
    where invoice_id=p_invoice_id and lease_token=p_token and lease_until>now() and state<>'DELIVERED';
  if not found then raise exception 'Lease was lost'; end if;
end $$;

create function public.complete_digiseller_supplier_job(p_invoice_id bigint,p_token uuid,p_codes text[],p_actual_cost numeric)
returns void language plpgsql security definer set search_path=public as $$
declare j public.digiseller_supplier_jobs%rowtype;
begin
  select * into j from digiseller_supplier_jobs where invoice_id=p_invoice_id for update;
  if not found then raise exception 'Unknown supplier job'; end if;
  if j.state='DELIVERED' then return; end if;
  if p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until,'epoch')<now() or j.submitted_at is null then raise exception 'Lease was lost'; end if;
  if cardinality(p_codes) is distinct from j.quantity or (select count(distinct c) from unnest(p_codes)c)<>j.quantity or exists(select 1 from unnest(p_codes)c where c is null or length(btrim(c))=0 or length(c)>10000) then raise exception 'Invalid supplier codes'; end if;
  if p_actual_cost is null or p_actual_cost<=0 or p_actual_cost::text in ('NaN','Infinity','-Infinity') or p_actual_cost>j.max_unit_cost*j.quantity then raise exception 'Supplier cost requires review'; end if;
  update digiseller_supplier_jobs set state='DELIVERED',goods=array_to_string(p_codes,E'\n\n'),actual_cost=p_actual_cost,issue=null,lease_token=null,lease_until=null,updated_at=now() where invoice_id=p_invoice_id;
end $$;

-- Keep owned-stock delivery and supplier delivery mutually exclusive per invoice.
create function public.guard_owned_digiseller_delivery()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from digiseller_supplier_jobs where invoice_id=NEW.invoice_id) then raise exception 'Invoice belongs to supplier delivery'; end if;
  return NEW;
end $$;
create trigger guard_owned_digiseller_delivery before insert on public.digiseller_deliveries for each row execute function public.guard_owned_digiseller_delivery();

create function public.guard_digiseller_supplier_mode()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if OLD.stock_source is distinct from NEW.stock_source and exists(select 1 from digiseller_supplier_jobs j join product_options o on o.id=j.option_id where o.product_id=OLD.id and j.state not in ('DELIVERED','REJECTED')) then raise exception 'Resolve DigiSeller supplier orders before changing stock source'; end if;
  return NEW;
end $$;
create trigger guard_digiseller_supplier_mode before update of stock_source on public.products for each row execute function public.guard_digiseller_supplier_mode();
revoke all on function public.guard_owned_digiseller_delivery(),public.guard_digiseller_supplier_mode() from public,anon,authenticated;

revoke all on function public.digiseller_supplier_available(uuid),public.queue_digiseller_supplier_order(bigint,bigint,uuid,integer,numeric),public.claim_digiseller_supplier_job(),public.mark_digiseller_supplier_submitted(bigint,uuid),public.update_digiseller_supplier_job(bigint,uuid,text,text),public.complete_digiseller_supplier_job(bigint,uuid,text[],numeric) from public,anon,authenticated;
grant execute on function public.digiseller_supplier_available(uuid),public.queue_digiseller_supplier_order(bigint,bigint,uuid,integer,numeric),public.claim_digiseller_supplier_job(),public.mark_digiseller_supplier_submitted(bigint,uuid),public.update_digiseller_supplier_job(bigint,uuid,text,text),public.complete_digiseller_supplier_job(bigint,uuid,text[],numeric) to service_role;
commit;
