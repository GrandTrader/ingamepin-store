-- Manual payment proofs are submitted through the protected server API.
-- Prevent direct browser clients from invoking the privileged database function.

revoke all on function public.submit_manual_payment(uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.submit_manual_payment(uuid, text, text, text, text)
to service_role;
