revoke update on table public.profiles from authenticated;

grant update (name, phone)
on table public.profiles
to authenticated;
