begin;
-- The original gateway is taken from the verified payment by the request RPC.
-- Wallet is common to all gateways. Crypto may only return to crypto or wallet;
-- other gateways may only return to the original gateway or wallet.
create function public.enforce_customer_refund_gateway() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if NEW.refund_method='WALLET' then return NEW; end if;
  if NEW.original_method in ('BINANCE_PAY','USDT_DIRECT') then
    if NEW.refund_method in ('BINANCE_PAY','USDT_DIRECT') then return NEW; end if;
    raise exception 'Crypto payments can only be refunded through crypto or your InGamePIN wallet.';
  end if;
  if NEW.refund_method=NEW.original_method then return NEW; end if;
  raise exception 'Choose the original payment method or your InGamePIN wallet for this refund.';
end;
$$;
revoke all on function public.enforce_customer_refund_gateway() from public,anon,authenticated,service_role;
create trigger customer_refund_gateway_guard before insert on public.order_refund_requests
  for each row execute function public.enforce_customer_refund_gateway();
notify pgrst, 'reload schema';
commit;
