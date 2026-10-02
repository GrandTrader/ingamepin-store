# Annual password expiry

Applies to administrators and customers with passwords. Passwordless accounts do not acquire a password requirement. Administrator MFA remains mandatory. Existing MFA must also be verified during password recovery.

## Staged rollout

1. Apply `supabase/migrations/20261002_150000_annual_password_expiry.sql`. It installs the database checks with expiry disabled. It refuses to replace a different existing PostgREST pre-request hook.
2. Deploy the application release containing the renewal and recovery screens. Deploying before the migration will make authenticated requests fail closed because the status RPC is missing.
3. Apply `supabase/operations/enable_annual_password_expiry.sql`. Verify the returned flag is true. Check customer and administrator login, renewal, reset and protected API access.

Existing accounts are initialized from account creation time because reliable historic password-change timestamps are unavailable. An older account may therefore require renewal even if its password changed more recently. This avoids silently granting a fresh year to every account. New timestamps change only when Supabase Auth changes the stored password hash; login and user metadata updates do not extend expiry.

Expiry is enforced at 365 days by the request proxy, authenticated server action client, PostgREST pre-request hook, administrator permission function and restrictive policies on existing public RLS tables and storage objects. Any new RLS table must receive the restrictive policy too. Service-role jobs bypass user RLS and must continue validating callers before privileged operations. Newly introduced authenticated entry points must use the guarded server client.

The trigger depends on the managed `auth.users.encrypted_password` field. Review this integration after Auth upgrades or password hash/encryption migrations. A provider-side hash rewrite can reset the timestamp and must be reconciled during such migrations.

For rollback, disable enforcement before reverting application code:

```sql
update public.account_password_policy set enabled = false where id;
```

Keep the timestamp records and trigger so that rollback does not erase password history. Never edit a customer's timestamp to bypass a required password change.

## Validation

Run the password-expiry, administrator MFA, audit and security regression suites in `scripts/tests`. `password-expiry-db.cjs` runs in a disposable PostgreSQL-compatible PGlite database (set `PGLITE_PATH` to the installed package directory); it does not change production data. Production configuration and live password flows still require verification after the staged rollout.
