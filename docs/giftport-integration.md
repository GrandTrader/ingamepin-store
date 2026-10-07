# GiftPort integration retired

GiftPort administration, imports, configuration, relay calls and worker deployment have been removed. The supplier database backup endpoint accepts Definite Play only. The backup installer cannot restart GiftPort.

Existing GiftPort product source markers and supplier job/card records are retained for order reconciliation. These products must remain inactive and unavailable; unresolved submitted orders must be reviewed manually, not repurchased or automatically refunded.

Apply `20261007_210000_retire_giftport.sql` to enforce retirement in the database. Stop and disable the dedicated VPS service, preserve its private supplier records for reconciliation, and replace its public route with HTTP 410. Do not rotate the shared Definite Play relay secret as part of this removal.

## Operational status — 7 October 2026

The production GiftPort service is stopped and disabled. A systemd condition prevents accidental startup. Caddy returns HTTP 410 for `/giftport/*`; externally verified. Definite Play remains active.

The one GiftPort-backed product is INACTIVE with zero stock and inactive options. Two unresolved supplier jobs are in REVIEW, with existing payment/order records retained. One had been submitted to GiftPort and must not be automatically repurchased or refunded. Supplier records, credentials and mappings remain private on the stopped service; automatic approval review rejected permanent deletion, so reversible isolation was used instead.

Website code removal was deployed as 6d503f37 on 7 October 2026 and verified live. The retirement SQL migration remains unapplied because database management access was unavailable. Pending Nexapin domain changes were excluded from this release.

Validation: TypeScript and targeted ESLint pass; supplier API/authentication, pricing, retirement and existing Definite Play checks pass. The product-range browser fixture now loads its CSS and localized image dependencies and passes cart/price/quantity checks. No real purchase was used for testing.
