begin;

-- Login/setup needs only the caller's membership row before MFA is verified.
-- Other administrator data remains behind is_admin().
drop policy if exists "Users read own admin membership" on public.admin_users;
create policy "Users read own admin membership" on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1 from public.admin_users a where a.user_id = auth.uid()
    )
    and exists (
      -- Reject stale AAL2 tokens after the last verified factor is removed.
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

comment on function public.is_admin() is
  'Administrator privileges require membership, an AAL2 session and a currently verified MFA factor.';

commit;
