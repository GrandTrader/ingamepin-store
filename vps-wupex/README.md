# Wupex VPS transport

Production requests flow from Next.js to the existing HTTPS host
https://pally-relay.ingamepin.com/wupex/request, then to Wupex from
187.127.167.138. Supplier connections explicitly resolve IPv4 and bind to
that source address, while retaining TLS hostname verification. IPv6 is
not used by this relay. Other supplier services are independent.

The relay listens only on 127.0.0.1:8803 under the ingamepin-wupex
systemd service. Caddy terminates HTTPS. Requests are signed with HMAC,
expire after 60 seconds, and carry single-use nonces checked in SQLite.
A purpose-specific HKDF subkey is installed on the VPS; the Supabase
master key is never copied to it. Supplier credentials are transient
and are never logged or persisted by the relay.

Only the documented API routes on service.wupex.com and
sandbox-service.wupex.com are permitted. Redirects, arbitrary URLs,
and automatic retries are disabled. The existing application queue
retains purchase authorization, durable submission markers, payment
checks, and reconciliation. The relay does not schedule or originate
orders itself.

Run the Python unit tests before installing:
python3 -m unittest discover -s vps-wupex -p 'test_*.py'

From the active Windows checkout with its existing environment and
SSH key, run node scripts/wupex-install-relay.cjs. The installer backs
up its files and HTTPS configuration, validates Caddy, checks local
authentication, and rolls back on failure. It never restarts another
supplier service. Deploy the application only after HTTPS relay
authentication has been checked.

If WUPEX_ENCRYPTION_KEY or SUPABASE_SECRET_KEY used by the application
changes, reinstall the relay with the same new environment before
resuming supplier traffic. No direct-connection fallback is attempted.
