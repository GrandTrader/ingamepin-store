begin;
create table if not exists public.manual_delivery_batches (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 order_item_id uuid not null references public.order_items(id),
 transaction_id bigint,
 sent_at timestamptz not null default now(),
 sent_by uuid,
 code_count integer not null check(code_count>0),
 legacy boolean not null default false,
 revoked_at timestamptz,
 revoked_by uuid,
 revoke_reason text,
 unique(order_item_id,transaction_id),
 check ((revoked_at is null and revoked_by is null and revoke_reason is null) or
        (revoked_at is not null and revoked_by is not null and revoke_reason is not null and length(btrim(revoke_reason)) between 3 and 500))
);
alter table public.manual_delivery_batches enable row level security;
revoke all on public.manual_delivery_batches from public,anon,authenticated,service_role;
grant select on public.manual_delivery_batches to service_role;
create index if not exists manual_delivery_batches_order_idx on public.manual_delivery_batches(order_id,sent_at,id);
alter table public.gift_card_codes add column if not exists manual_delivery_batch_id uuid references public.manual_delivery_batches(id);
create index if not exists gift_card_codes_manual_batch_idx on public.gift_card_codes(manual_delivery_batch_id) where manual_delivery_batch_id is not null;

-- Saved timestamps identify earlier sends. Unknown timestamps remain separate rather than being merged.
-- Supplier jobs cover Definite Play, GiftPort and FKWallet, including historical
-- orders whose product now uses owned stock. These codes remain supplier-managed.
lock table public.gift_card_codes in share row exclusive mode;
-- Permit a repeat run to include older deliveries whose refund hold has since ended.
drop trigger if exists track_manual_delivery_batch on public.gift_card_codes;
do $$ declare r record; bid uuid;
begin
 for r in
  select oi.order_id,c.order_item_id,c.sold_at,
    coalesce(c.sold_at,min(c.created_at),now()) sent_at,array_agg(c.id) code_ids,count(*)::integer code_count
  from public.gift_card_codes c join public.order_items oi on oi.id=c.order_item_id
  join public.products p on p.id=oi.product_id
  where c.status='SOLD' and c.manual_delivery_batch_id is null
    and (p.delivery_type='MANUAL' or oi.fulfillment_mode='RANGE_MANUAL')
    and oi.fulfillment_mode is distinct from 'PLAYER_ID_TOPUP' and oi.service_delivered_at is null
    and not exists(select 1 from public.definiteplay_jobs supplier_job where supplier_job.item_id=oi.id)
    and not exists(select 1 from public.order_refund_requests hold_request where hold_request.order_id=oi.order_id and hold_request.status in ('REQUESTED','APPROVED','COMPLETED'))
  group by oi.order_id,c.order_item_id,c.sold_at,case when c.sold_at is null then c.id end
 loop
  insert into public.manual_delivery_batches(order_id,order_item_id,sent_at,code_count,legacy)
    values(r.order_id,r.order_item_id,r.sent_at,r.code_count,true) returning id into bid;
  update public.gift_card_codes set manual_delivery_batch_id=bid where id=any(r.code_ids);
 end loop;
end $$;

create or replace function public.track_manual_delivery_batch() returns trigger
language plpgsql security definer set search_path=public as $$
declare oid uuid; actor uuid; bid uuid;
begin
 if TG_OP in ('UPDATE','DELETE') and OLD.manual_delivery_batch_id is not null then
  if TG_OP='DELETE' then raise exception 'Sent batch history cannot be deleted. Revoke the delivery batch instead.'; end if;
  if NEW.manual_delivery_batch_id is distinct from OLD.manual_delivery_batch_id or NEW.code is distinct from OLD.code
    or NEW.order_item_id is distinct from OLD.order_item_id or NEW.product_id is distinct from OLD.product_id
    or NEW.product_option_id is distinct from OLD.product_option_id or NEW.denomination is distinct from OLD.denomination
    or NEW.sold_at is distinct from OLD.sold_at then raise exception 'Sent batch history cannot be changed.'; end if;
  if NEW.status is distinct from OLD.status and not (
     OLD.status='SOLD' and NEW.status='DISABLED'
     and current_setting('app.revoking_manual_batch',true)=OLD.manual_delivery_batch_id::text
     and exists(select 1 from manual_delivery_batches where id=OLD.manual_delivery_batch_id and revoked_at is not null)
   ) then raise exception 'Use Revoke batch to withdraw sent codes. Revoked codes cannot be reused.'; end if;
  return NEW;
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 if NEW.manual_delivery_batch_id is not null then raise exception 'Delivery batches are assigned automatically.'; end if;
 if NEW.status<>'SOLD' or NEW.order_item_id is null then return NEW; end if;
 select oi.order_id into oid from order_items oi join products p on p.id=oi.product_id
   where oi.id=NEW.order_item_id and (p.delivery_type='MANUAL' or oi.fulfillment_mode='RANGE_MANUAL')
     and oi.fulfillment_mode is distinct from 'PLAYER_ID_TOPUP' and oi.service_delivered_at is null
     and not exists(select 1 from public.definiteplay_jobs supplier_job where supplier_job.item_id=oi.id);
 if not found then return NEW; end if;
 actor:=nullif(current_setting('app.manual_delivery_actor',true),'')::uuid;
 if actor is null and TG_OP='INSERT' then actor:=NEW.created_by; end if;
 if not exists(select 1 from admin_users where user_id=actor) then actor:=null; end if;
 insert into manual_delivery_batches(order_id,order_item_id,transaction_id,sent_at,sent_by,code_count)
   values(oid,NEW.order_item_id,txid_current(),coalesce(NEW.sold_at,now()),actor,1)
   on conflict(order_item_id,transaction_id) do update set code_count=manual_delivery_batches.code_count+1
   returning id into bid;
 NEW.manual_delivery_batch_id:=bid;
 return NEW;
end $$;
drop trigger if exists track_manual_delivery_batch on public.gift_card_codes;
create trigger track_manual_delivery_batch before insert or update or delete on public.gift_card_codes
 for each row execute function public.track_manual_delivery_batch();

-- Preserve existing delivery validation and retry behavior, recording the verified sender for stocked codes too.
do $$ declare signature text; source text;
begin
 foreach signature in array array['public.deliver_manual_codes_batch(uuid,uuid,uuid,text[])','public.complete_manual_order(uuid,uuid,jsonb)'] loop
  source:=pg_get_functiondef(signature::regprocedure);
  if position('app.manual_delivery_actor' in source)=0 then
   source:=regexp_replace(source,'(begin\s*)',E'\\1\n  perform set_config(''app.manual_delivery_actor'',p_admin_user_id::text,true);\n','i');
   execute source;
  end if;
 end loop;
end $$;

create or replace function public.revoke_manual_delivery_batch(p_order_id uuid,p_batch_id uuid,p_admin_user_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b manual_delivery_batches%rowtype; o orders%rowtype; i order_items%rowtype; n integer; remaining integer;
begin
 if not exists(select 1 from admin_users where user_id=p_admin_user_id) then raise exception 'Administrator access is required.'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'Enter a reason between 3 and 500 characters.'; end if;
 select * into o from orders where id=p_order_id for update;
 if not found then raise exception 'Order was not found.'; end if;
 select * into b from manual_delivery_batches where id=p_batch_id and order_id=p_order_id;
 if not found then raise exception 'Delivery batch was not found for this order.'; end if;
 select * into i from order_items where id=b.order_item_id and order_id=p_order_id for update;
 if not found then raise exception 'Order denomination was not found.'; end if;
 select * into b from manual_delivery_batches where id=p_batch_id for update;
 if b.revoked_at is not null then return jsonb_build_object('revoked',0,'alreadyRevoked',true); end if;
 if o.status not in ('PAID','PROCESSING','DELIVERED') then raise exception 'Only a paid order can have a delivery batch revoked.'; end if;
 if exists(select 1 from order_refund_requests where order_id=p_order_id and status in ('REQUESTED','APPROVED','COMPLETED')) then
  raise exception 'Resolve the customer refund request before revoking delivery.';
 end if;
 if i.service_delivered_at is not null then raise exception 'Account delivery cannot be revoked as codes.'; end if;
 if exists(select 1 from public.definiteplay_jobs supplier_job where supplier_job.item_id=i.id) then
  raise exception 'Supplier deliveries cannot be revoked as manual batches.';
 end if;
 perform 1 from gift_card_codes where manual_delivery_batch_id=b.id order by id for update;
 select count(*)::integer into n from gift_card_codes where manual_delivery_batch_id=b.id and order_item_id=i.id and status='SOLD';
 if n<>b.code_count then raise exception 'Batch contents changed. Refresh the order before retrying.'; end if;
 update manual_delivery_batches set revoked_at=now(),revoked_by=p_admin_user_id,revoke_reason=btrim(p_reason) where id=b.id;
 perform set_config('app.revoking_manual_batch',b.id::text,true);
 update gift_card_codes set status='DISABLED',updated_at=now() where manual_delivery_batch_id=b.id;
 update orders set status='PROCESSING',delivered_at=null,updated_at=now() where id=p_order_id;
 select i.quantity-(select count(*) from gift_card_codes where order_item_id=i.id and status='SOLD')
  -coalesce((select sum(quantity) from order_item_refunds where order_item_id=i.id and status<>'CANCELLED'),0) into remaining;
 return jsonb_build_object('revoked',n,'alreadyRevoked',false,'remaining',greatest(remaining,0));
end $$;

-- A completion request that read old counts before a revocation must not complete the order afterwards.
create or replace function public.guard_revoked_batch_completion() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if NEW.status='DELIVERED' and exists(
   select 1 from order_items i where i.order_id=NEW.id and i.service_delivered_at is null
     and exists(select 1 from manual_delivery_batches b where b.order_item_id=i.id and b.revoked_at is not null)
     and i.quantity<>(select count(*) from gift_card_codes c where c.order_item_id=i.id and c.status='SOLD')
       +coalesce((select sum(quantity) from order_item_refunds r where r.order_item_id=i.id and r.status<>'CANCELLED'),0)
 ) then raise exception 'Replace or refund the revoked batch quantity before completing this order.'; end if;
 return NEW;
end $$;
drop trigger if exists guard_revoked_batch_completion on public.orders;
create trigger guard_revoked_batch_completion before update of status on public.orders for each row execute function public.guard_revoked_batch_completion();
revoke all on function public.track_manual_delivery_batch(),public.guard_revoked_batch_completion(),public.revoke_manual_delivery_batch(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_manual_delivery_batch(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
