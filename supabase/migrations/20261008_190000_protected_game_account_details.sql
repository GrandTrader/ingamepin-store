-- Protected account details for Games. Ordinary orders contain masked markers only.
begin;

-- Installation is inactive until the compatible website release is deployed.
create table if not exists public.protected_account_settings (
  id boolean primary key default true check(id),
  games_enabled boolean not null default false
);
insert into public.protected_account_settings(id) values(true) on conflict do nothing;
alter table public.protected_account_settings enable row level security;
revoke all on public.protected_account_settings from public,anon,authenticated;
grant all on public.protected_account_settings to service_role;

create table if not exists public.protected_account_details (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  field_id uuid not null,
  ciphertext text not null check (ciphertext like 'v1.%' and length(ciphertext) < 2000),
  consent_at timestamptz not null,
  expires_at timestamptz not null,
  order_id uuid references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '25 hours'),
  unique (order_item_id, field_id)
);
create index if not exists protected_account_expiry_idx on public.protected_account_details(expires_at);
create table if not exists public.protected_account_access_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null,
  field_id uuid not null,
  accessed_at timestamptz not null default now()
);
create table if not exists public.game_customer_fields_before_protection (
  product_id uuid primary key,
  fields jsonb not null,
  captured_at timestamptz not null default now()
);
alter table public.protected_account_details enable row level security;
alter table public.protected_account_access_log enable row level security;
alter table public.game_customer_fields_before_protection enable row level security;
revoke all on public.protected_account_details,public.protected_account_access_log,public.game_customer_fields_before_protection from public,anon,authenticated;
grant all on public.protected_account_details,public.protected_account_access_log,public.game_customer_fields_before_protection to service_role;

create or replace function public.protect_order_account_details() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid; f record; v text; entry jsonb; vault protected_account_details; output jsonb := '[]';
begin
  if not exists(select 1 from product_customer_fields where product_id=NEW.product_id and label ~* 'password|passcode|\m2fa\M|\mrecovery\M|\mbackup\M|security code|verification code') then return NEW; end if;
  actor:=coalesce(nullif(current_setting('app.business_buyer',true),'')::uuid,auth.uid());
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
    raise exception 'Sign in with a verified InGamePin account before ordering this product.';
  end if;
  if NEW.quantity<>1 then raise exception 'Provide separate account details for each game purchase.'; end if;
  for f in select id,label,is_required from product_customer_fields where product_id=NEW.product_id
    and label ~* 'password|passcode|\m2fa\M|\mrecovery\M|\mbackup\M|security code|verification code' loop
    select x->>'value' into v from jsonb_array_elements(NEW.customer_information) x where x->>'fieldId'=f.id::text limit 1;
    if coalesce(v,'')='' and not f.is_required then continue; end if;
    if coalesce(v,'') !~ '^protected:[0-9a-f-]{36}$' then
      raise exception 'Return to the product page and submit account details using the protected form.';
    end if;
    select * into vault from protected_account_details where id=substring(v from 11)::uuid for update;
    if not found or vault.user_id<>actor or vault.product_id<>NEW.product_id or vault.field_id<>f.id
       or vault.order_item_id is not null or vault.expires_at<=clock_timestamp() then
      raise exception 'Account details expired or cannot be reused. Enter them again on the product page.';
    end if;
    update protected_account_details set order_id=NEW.order_id,order_item_id=NEW.id where id=vault.id;
  end loop;
  for entry in select value from jsonb_array_elements(NEW.customer_information) loop
    if exists(select 1 from product_customer_fields where product_id=NEW.product_id and id::text=entry->>'fieldId'
      and label ~* 'password|passcode|\m2fa\M|\mrecovery\M|\mbackup\M|security code|verification code') then
      entry:=jsonb_set(entry,'{value}','"[Protected account detail]"');
    end if;
    output:=output||jsonb_build_array(entry);
  end loop;
  NEW.customer_information:=output;
  return NEW;
end $$;
revoke all on function public.protect_order_account_details() from public,anon,authenticated;
drop trigger if exists protect_order_account_details on public.order_items;
create trigger protect_order_account_details before insert on public.order_items for each row execute function public.protect_order_account_details();

create or replace function public.reveal_protected_account_detail(p_admin uuid,p_item uuid,p_field uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare vault protected_account_details; order_state text;
begin
  if not exists(select 1 from admin_users where user_id=p_admin) then raise exception 'Administrator access required.'; end if;
  -- Same lock order as terminal-order cleanup: order first, then protected detail.
  select o.status::text into order_state from orders o join order_items i on i.order_id=o.id where i.id=p_item for update of o;
  if coalesce(order_state,'') not in ('PAID','PROCESSING') then raise exception 'Order is not awaiting delivery.'; end if;
  select * into vault from protected_account_details where order_item_id=p_item and field_id=p_field and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Protected detail is unavailable or expired.'; end if;
  insert into protected_account_access_log(admin_id,order_id,order_item_id,field_id) values(p_admin,vault.order_id,p_item,p_field);
  return to_jsonb(vault);
end $$;
revoke all on function public.reveal_protected_account_detail(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reveal_protected_account_detail(uuid,uuid,uuid) to service_role;

create or replace function public.purge_finished_account_details() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.status::text in ('DELIVERED','COMPLETED','CANCELLED','CANCELED','REFUNDED','FAILED','EXPIRED') then
    delete from protected_account_details where order_id=NEW.id;
  end if;
  return NEW;
end $$;
revoke all on function public.purge_finished_account_details() from public,anon,authenticated;
drop trigger if exists purge_finished_account_details on public.orders;
create trigger purge_finished_account_details after update of status on public.orders for each row execute function public.purge_finished_account_details();
create or replace function public.purge_expired_account_details() returns void
language sql security definer set search_path=public as $$ delete from protected_account_details where expires_at<=clock_timestamp(); $$;
revoke all on function public.purge_expired_account_details() from public,anon,authenticated;
grant execute on function public.purge_expired_account_details() to service_role;

-- Preserve the original field settings before the category-wide change.
insert into public.game_customer_fields_before_protection(product_id,fields)
select p.id,coalesce((select jsonb_agg(to_jsonb(f)) from product_customer_fields f where f.product_id=p.id),'[]')
from products p join categories c on c.id=p.category_id where lower(c.slug)='games'
on conflict(product_id) do nothing;

create or replace function public.configure_game_account_fields(p_product uuid) returns void
language plpgsql security definer set search_path=public as $$
declare spec jsonb; keep_id uuid;
begin
  if not exists(select 1 from protected_account_settings where id and games_enabled) then return; end if;
  if not exists(select 1 from products p join categories c on c.id=p.category_id where p.id=p_product and lower(c.slug)='games') then return; end if;
  delete from product_customer_fields where product_id=p_product and lower(label)='psn online id';
  for spec in select value from jsonb_array_elements('[
    {"label":"Login Email","type":"EMAIL","placeholder":"Email used to sign in to your game account","match":"^(playstation account email|customer login email|login email)$","sort":0},
    {"label":"Login Password","type":"TEXT","placeholder":"Your game account password","match":"^(login password|password)$","sort":1},
    {"label":"2FA Security Code","type":"TEXT","placeholder":"One backup/recovery code, not an authenticator code","match":"^(2fa security code|backup code|recovery code)$","sort":2}
  ]'::jsonb) loop
    select id into keep_id from product_customer_fields where product_id=p_product and label ~* (spec->>'match') order by created_at,id limit 1;
    if keep_id is null then
      insert into product_customer_fields(product_id,label,field_type,placeholder,is_required,sort_order)
      values(p_product,spec->>'label',spec->>'type',spec->>'placeholder',true,(spec->>'sort')::int);
    else
      update product_customer_fields set label=spec->>'label',field_type=spec->>'type',placeholder=spec->>'placeholder',is_required=true,sort_order=(spec->>'sort')::int,updated_at=now() where id=keep_id;
      delete from product_customer_fields where product_id=p_product and id<>keep_id and label ~* (spec->>'match');
    end if;
  end loop;
end $$;
revoke all on function public.configure_game_account_fields(uuid) from public,anon,authenticated;
do $$ declare p record; begin
  for p in select x.id from products x join categories c on c.id=x.category_id where lower(c.slug)='games' loop
    perform configure_game_account_fields(p.id);
  end loop;
end $$;

create or replace function public.initialize_game_account_fields() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform configure_game_account_fields(NEW.id); return NEW; end $$;
revoke all on function public.initialize_game_account_fields() from public,anon,authenticated;
drop trigger if exists initialize_game_account_fields on public.products;
create trigger initialize_game_account_fields after insert or update of category_id on public.products for each row execute function public.initialize_game_account_fields();

-- Keep older catalog CSV presets compatible without recreating PSN Online ID.
create or replace function public.normalize_game_account_field() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from protected_account_settings where id and games_enabled) then return NEW; end if;
  if not exists(select 1 from products p join categories c on c.id=p.category_id where p.id=NEW.product_id and lower(c.slug)='games') then return NEW; end if;
  if lower(NEW.label)='psn online id' then return null; end if;
  if lower(NEW.label)='playstation account email' then NEW.label:='Login Email'; end if;
  if NEW.label in ('Login Email','Login Password','2FA Security Code') and exists(select 1 from product_customer_fields where product_id=NEW.product_id and label=NEW.label) then return null; end if;
  return NEW;
end $$;
revoke all on function public.normalize_game_account_field() from public,anon,authenticated;
drop trigger if exists normalize_game_account_field on public.product_customer_fields;
create trigger normalize_game_account_field before insert on public.product_customer_fields for each row execute function public.normalize_game_account_field();

create or replace function public.activate_game_account_fields() returns integer
language plpgsql security definer set search_path=public as $$
declare p record; changed integer:=0;
begin
  update protected_account_settings set games_enabled=true where id;
  for p in select x.id from products x join categories c on c.id=x.category_id where lower(c.slug)='games' loop
    perform configure_game_account_fields(p.id);
    changed:=changed+1;
  end loop;
  return changed;
end $$;
revoke all on function public.activate_game_account_fields() from public,anon,authenticated;
grant execute on function public.activate_game_account_fields() to service_role;

notify pgrst,'reload schema';
commit;
