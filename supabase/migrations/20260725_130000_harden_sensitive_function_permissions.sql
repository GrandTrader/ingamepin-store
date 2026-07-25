-- Keep sensitive payment and fulfillment functions server-only.
-- This migration repairs permissions that can be reset when a function is replaced.

revoke all on function public.fulfill_instant_items(uuid)
from public, anon, authenticated;
grant execute on function public.fulfill_instant_items(uuid)
to service_role;

revoke all on function public.approve_manual_payment(uuid)
from public, anon, authenticated;
grant execute on function public.approve_manual_payment(uuid)
to service_role;

revoke all on function public.reject_manual_payment(uuid, text)
from public, anon, authenticated;
grant execute on function public.reject_manual_payment(uuid, text)
to service_role;

revoke all on function public.approve_wallet_topup(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.approve_wallet_topup(uuid, uuid)
to service_role;

revoke all on function public.reject_wallet_topup(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.reject_wallet_topup(uuid, uuid, text)
to service_role;

revoke all on function public.pay_order_with_wallet(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.pay_order_with_wallet(uuid, uuid)
to service_role;

revoke all on function public.complete_binance_payment(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.complete_binance_payment(uuid, text, text)
to service_role;

revoke all on function public.complete_binance_wallet_topup(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.complete_binance_wallet_topup(uuid, text, text)
to service_role;

revoke all on function public.create_wallet_topup_request(numeric, text, text)
from public, anon;
grant execute on function public.create_wallet_topup_request(numeric, text, text)
to authenticated, service_role;
