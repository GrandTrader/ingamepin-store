#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


BASE_DIR = Path("/opt/usdt-gateway")
DB_PATH = BASE_DIR / "gateway.db"
LOG_PATH = BASE_DIR / "gateway.log"
TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
BSC_USDT_CONTRACT = "0x55d398326f99059ff775485246999027b3197955"
SOLANA_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
TRANSFER_TOPIC = (
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
)
BSC_RPC_URLS = tuple(
    dict.fromkeys(
        (
            os.environ["BSC_RPC_URL"],
            "https://bsc-dataseed.bnbchain.org",
            "https://bsc-dataseed.binance.org",
            "https://bsc-dataseed1.binance.org",
            "https://bsc-dataseed2.binance.org",
        )
    )
)
SOLANA_RPC_URLS = (
    "https://api.mainnet-beta.solana.com",
)
INVOICE_TTL_SECONDS = 60 * 60
MAX_CALLBACK_ATTEMPTS = 100
POLL_SECONDS = 3
BSC_CONFIRMATIONS = 5
BSC_RESCAN_BLOCKS = 50
PAYMENT_GRACE_SECONDS = 0


def load_env(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env(BASE_DIR / "gateway.env")

TRONGRID_API_KEY = os.environ["TRONGRID_API_KEY"]
TRC20_WALLET = os.environ["TRC20_WALLET"]
BEP20_WALLET = os.environ["BEP20_WALLET"].lower()
SOLANA_WALLET = os.environ["SOLANA_WALLET"]
API_SECRET = os.environ["GATEWAY_API_SECRET"]
CALLBACK_SECRET = os.environ["GATEWAY_CALLBACK_SECRET"]
RESTRICTED_ADDRESSES_PATH = Path(
    os.environ.get(
        "RESTRICTED_ADDRESSES_FILE",
        str(BASE_DIR / "restricted_addresses.json"),
    )
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
LOGGER = logging.getLogger("usdt-gateway")
DB_LOCK = threading.RLock()


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize_db() -> None:
    with DB_LOCK, connect_db() as db:
        existing = db.execute(
            "select sql from sqlite_master where type = 'table' and name = 'invoices'"
        ).fetchone()
        if existing and "'SOLANA'" not in str(existing["sql"]):
            db.executescript(
                """
                begin immediate;

                alter table invoices rename to invoices_before_solana;

                create table invoices (
                  id text primary key,
                  order_id text not null unique,
                  network text not null
                    check (network in ('TRC20', 'BEP20', 'SOLANA')),
                  address text not null,
                  base_amount_micros integer not null,
                  required_amount_micros integer not null,
                  status text not null default 'PENDING'
                    check (status in ('PENDING', 'PAID', 'EXPIRED')),
                  callback_url text not null,
                  created_at integer not null,
                  expires_at integer not null,
                  paid_at integer,
                  tx_hash text unique,
                  payer_address text,
                  received_amount_micros integer,
                  callback_attempts integer not null default 0,
                  callback_next_at integer not null default 0,
                  callback_sent_at integer
                );

                insert into invoices (
                  id, order_id, network, address, base_amount_micros,
                  required_amount_micros, status, callback_url, created_at,
                  expires_at, paid_at, tx_hash, payer_address,
                  received_amount_micros, callback_attempts,
                  callback_next_at, callback_sent_at
                )
                select
                  id, order_id, network, address, base_amount_micros,
                  required_amount_micros, status, callback_url, created_at,
                  expires_at, paid_at, tx_hash, payer_address,
                  received_amount_micros, callback_attempts,
                  callback_next_at, callback_sent_at
                from invoices_before_solana;

                drop table invoices_before_solana;
                commit;
                """
            )

        db.executescript(
            """
            create table if not exists invoices (
              id text primary key,
              order_id text not null unique,
              network text not null
                check (network in ('TRC20', 'BEP20', 'SOLANA')),
              address text not null,
              base_amount_micros integer not null,
              required_amount_micros integer not null,
              status text not null default 'PENDING'
                check (status in ('PENDING', 'PAID', 'EXPIRED')),
              callback_url text not null,
              created_at integer not null,
              expires_at integer not null,
              paid_at integer,
              tx_hash text unique,
              payer_address text,
              received_amount_micros integer,
              callback_attempts integer not null default 0,
              callback_next_at integer not null default 0,
              callback_sent_at integer
            );

            create index if not exists invoices_pending_idx
              on invoices(network, status, expires_at);

            create table if not exists gateway_state (
              key text primary key,
              value text not null
            );
            """
        )
        columns = {
            str(row["name"])
            for row in db.execute("pragma table_info(invoices)").fetchall()
        }
        if "compliance_hold" not in columns:
            db.execute(
                "alter table invoices add column compliance_hold integer not null default 0"
            )
        if "compliance_entity" not in columns:
            db.execute("alter table invoices add column compliance_entity text")
        if "compliance_label" not in columns:
            db.execute("alter table invoices add column compliance_label text")


def restricted_address(network: str, address: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(RESTRICTED_ADDRESSES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        LOGGER.error("Restricted-address list unavailable: %s", error)
        return None
    normalized = address.strip().lower() if network == "BEP20" else address.strip()
    for entry in payload.get("addresses", []):
        entry_network = str(entry.get("network", "")).upper()
        entry_address = str(entry.get("address", "")).strip()
        if entry_network != network:
            continue
        if network == "BEP20":
            entry_address = entry_address.lower()
        if entry_address == normalized:
            return entry
    return None


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: Any | None = None,
    timeout: int = 20,
) -> Any:
    data = None if body is None else json_bytes(body)
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "User-Agent": "InGamePin-USDT-Gateway/1.0",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def api_authorized(headers: Any) -> bool:
    supplied = str(headers.get("X-Gateway-Secret", ""))
    return hmac.compare_digest(supplied, API_SECRET)


def amount_to_micros(value: Any) -> int:
    try:
        amount = Decimal(str(value)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount.") from None
    if amount < Decimal("0.01") or amount > Decimal("100000"):
        raise ValueError("Amount is outside the permitted range.")
    return int(amount * Decimal(1_000_000))


def format_micros(value: int) -> str:
    return f"{Decimal(value) / Decimal(1_000_000):.2f}"


def callback_is_allowed(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname in {"www.ingamepin.com", "ingamepin.com"}
        and parsed.path in {"/api/usdt/webhook", "/api/digiseller/usdt/webhook"}
        and not parsed.username
        and not parsed.password
        and parsed.port in {None, 443}
    )


def invoice_payload(row: sqlite3.Row) -> dict[str, Any]:
    held = "compliance_hold" in row.keys() and bool(row["compliance_hold"])
    return {
        "invoiceId": row["id"],
        "orderId": row["order_id"],
        "network": row["network"],
        "token": "USDT",
        "address": row["address"],
        "amount": format_micros(row["required_amount_micros"]),
        "status": "COMPLIANCE_HOLD" if held else row["status"],
        "createdAt": row["created_at"],
        "expiresAt": row["expires_at"],
        "paidAt": row["paid_at"],
        "transactionHash": row["tx_hash"],
        "payerAddress": row["payer_address"],
        "receivedAmount": (
            format_micros(row["received_amount_micros"])
            if row["received_amount_micros"] is not None
            else None
        ),
        "complianceEntity": row["compliance_entity"] if held else None,
        "complianceLabel": row["compliance_label"] if held else None,
    }


def create_invoice(order_id: str, network: str, amount: Any, callback_url: str) -> dict:
    order_id = order_id.strip()
    network = network.strip().upper()
    if not order_id or len(order_id) > 100:
        raise ValueError("Invalid order ID.")
    if network not in {"TRC20", "BEP20", "SOLANA"}:
        raise ValueError("Invalid network.")
    if not callback_is_allowed(callback_url):
        raise ValueError("Invalid callback URL.")

    base_micros = amount_to_micros(amount)
    now = int(time.time())

    with DB_LOCK, connect_db() as db:
        existing = db.execute(
            "select * from invoices where order_id = ?", (order_id,)
        ).fetchone()
        if existing:
            return invoice_payload(existing)

        used = {
            row[0]
            for row in db.execute(
                """
                select required_amount_micros from invoices
                where network = ? and status = 'PENDING' and expires_at > ?
                """,
                (network, now),
            )
        }
        suffixes = list(range(1, 100))
        candidate_offsets = [0, *suffixes]
        required_micros = next(
            (
                base_micros + (offset * 10_000)
                for offset in candidate_offsets
                if base_micros + (offset * 10_000) not in used
            ),
            None,
        )
        if required_micros is None:
            raise RuntimeError("No payment amount is currently available.")

        invoice_id = str(uuid.uuid4())
        addresses = {
            "TRC20": TRC20_WALLET,
            "BEP20": BEP20_WALLET,
            "SOLANA": SOLANA_WALLET,
        }
        address = addresses[network]
        expires_at = now + INVOICE_TTL_SECONDS
        db.execute(
            """
            insert into invoices (
              id, order_id, network, address, base_amount_micros,
              required_amount_micros, callback_url, created_at, expires_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                invoice_id,
                order_id,
                network,
                address,
                base_micros,
                required_micros,
                callback_url,
                now,
                expires_at,
            ),
        )
        row = db.execute("select * from invoices where id = ?", (invoice_id,)).fetchone()
        return invoice_payload(row)


def get_invoice(invoice_id: str) -> dict[str, Any] | None:
    with DB_LOCK, connect_db() as db:
        row = db.execute(
            "select * from invoices where id = ?", (invoice_id,)
        ).fetchone()
        return invoice_payload(row) if row else None


def mark_paid(
    network: str,
    amount_micros: int,
    tx_hash: str,
    payer_address: str,
    paid_at: int,
) -> bool:
    with DB_LOCK, connect_db() as db:
        duplicate = db.execute(
            "select 1 from invoices where tx_hash = ?", (tx_hash,)
        ).fetchone()
        if duplicate:
            return False
        row = db.execute(
            """
            select id from invoices
            where network = ? and required_amount_micros = ?
              and status = 'PENDING'
              and created_at <= ?
              and expires_at + ? >= ?
            order by created_at asc limit 1
            """,
            (
                network,
                amount_micros,
                paid_at + 60,
                PAYMENT_GRACE_SECONDS,
                paid_at,
            ),
        ).fetchone()
        if not row:
            return False
        restriction = restricted_address(network, payer_address)
        if restriction:
            db.execute(
                """
                update invoices
                set compliance_hold = 1, paid_at = ?, tx_hash = ?,
                    payer_address = ?, received_amount_micros = ?,
                    compliance_entity = ?, compliance_label = ?
                where id = ? and status = 'PENDING'
                """,
                (
                    paid_at,
                    tx_hash,
                    payer_address,
                    amount_micros,
                    str(restriction.get("entity", "Restricted source")),
                    str(restriction.get("label", "Restricted address")),
                    row["id"],
                ),
            )
            LOGGER.warning(
                "Payment placed on compliance hold network=%s invoice=%s tx=%s entity=%s",
                network,
                row["id"],
                tx_hash,
                restriction.get("entity", "Restricted source"),
            )
            return True
        db.execute(
            """
            update invoices
            set status = 'PAID', paid_at = ?, tx_hash = ?,
                payer_address = ?, received_amount_micros = ?
            where id = ? and status = 'PENDING'
            """,
            (paid_at, tx_hash, payer_address, amount_micros, row["id"]),
        )
        LOGGER.info("Payment confirmed network=%s invoice=%s tx=%s", network, row["id"], tx_hash)
        return True


def expire_invoices() -> None:
    with DB_LOCK, connect_db() as db:
        db.execute(
            """
            update invoices set status = 'EXPIRED'
            where status = 'PENDING' and compliance_hold = 0
              and expires_at + ? < ?
            """,
            (PAYMENT_GRACE_SECONDS, int(time.time())),
        )


def poll_tron() -> None:
    url = (
        f"https://api.trongrid.io/v1/accounts/{TRC20_WALLET}/transactions/trc20"
        f"?only_confirmed=true&limit=200&contract_address={TRON_USDT_CONTRACT}"
    )
    result = request_json(
        url,
        headers={"TRON-PRO-API-KEY": TRONGRID_API_KEY},
    )
    for tx in result.get("data", []):
        token = tx.get("token_info") or {}
        if str(token.get("address", "")) != TRON_USDT_CONTRACT:
            continue
        if str(tx.get("to", "")) != TRC20_WALLET:
            continue
        decimals = int(token.get("decimals", 6))
        raw_value = int(str(tx.get("value", "0")))
        if decimals >= 6:
            divisor = 10 ** (decimals - 6)
            if raw_value % divisor:
                continue
            amount_micros = raw_value // divisor
        else:
            amount_micros = raw_value * (10 ** (6 - decimals))
        mark_paid(
            "TRC20",
            amount_micros,
            str(tx.get("transaction_id", "")),
            str(tx.get("from", "")),
            int(tx.get("block_timestamp", 0)) // 1000,
        )


def rpc_call(method: str, params: list[Any]) -> Any:
    last_error: Exception | None = None
    for url in BSC_RPC_URLS:
        try:
            result = request_json(
                url,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "InGamePin-USDT-Gateway/1.0",
                },
                body={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params,
                },
            )
            if result.get("error"):
                raise RuntimeError(str(result["error"]))
            return result["result"]
        except Exception as error:
            last_error = error
            LOGGER.warning("BSC RPC failed endpoint=%s error=%s", url, error)
    raise RuntimeError("All BSC RPC endpoints failed.") from last_error


def solana_rpc_call(method: str, params: list[Any]) -> Any:
    last_error: Exception | None = None
    for url in SOLANA_RPC_URLS:
        try:
            result = request_json(
                url,
                method="POST",
                headers={"Content-Type": "application/json"},
                body={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params,
                },
            )
            if result.get("error"):
                raise RuntimeError(str(result["error"]))
            return result["result"]
        except Exception as error:
            last_error = error
            LOGGER.warning("Solana RPC failed endpoint=%s error=%s", url, error)
    raise RuntimeError("All Solana RPC endpoints failed.") from last_error


def get_state(key: str) -> str | None:
    with DB_LOCK, connect_db() as db:
        row = db.execute(
            "select value from gateway_state where key = ?", (key,)
        ).fetchone()
        return str(row["value"]) if row else None


def set_state(key: str, value: str) -> None:
    with DB_LOCK, connect_db() as db:
        db.execute(
            """
            insert into gateway_state(key, value) values (?, ?)
            on conflict(key) do update set value = excluded.value
            """,
            (key, value),
        )


def poll_bsc() -> None:
    latest = int(rpc_call("eth_blockNumber", []), 16)
    safe_latest = latest - BSC_CONFIRMATIONS
    if safe_latest <= 0:
        return

    # Keep the checkpoint close to the confirmed chain head while there are no
    # payable BEP20 invoices. This prevents a long historical backlog from
    # delaying detection when the next customer creates an invoice.
    if not pending_invoice_exists("BEP20"):
        set_state("last_bsc_block", str(safe_latest))
        return

    saved = get_state("last_bsc_block")
    if saved is None:
        set_state("last_bsc_block", str(safe_latest))
        return

    # Public BSC RPC nodes can briefly disagree about the chain head. Always
    # overlap the recent confirmed range so a checkpoint from a faster node
    # cannot permanently skip a payment observed later by a slower node.
    start = max(0, min(int(saved) + 1, safe_latest - BSC_RESCAN_BLOCKS + 1))
    if start > safe_latest:
        return

    # Read the token's Transfer events instead of decoding only the top-level
    # transaction call. Exchange withdrawals can be routed through batching or
    # helper contracts even though the final, canonical USDT Transfer event is
    # identical to a direct wallet transfer.
    end = min(safe_latest, start + 99)
    padded_recipient = "0x" + ("0" * 24) + BEP20_WALLET[2:]
    events = rpc_call(
        "eth_getLogs",
        [
            {
                "address": BSC_USDT_CONTRACT,
                "fromBlock": hex(start),
                "toBlock": hex(end),
                "topics": [TRANSFER_TOPIC, None, padded_recipient],
            }
        ],
    )
    block_times: dict[int, int] = {}
    for event in events:
        try:
            topics = event.get("topics") or []
            if len(topics) < 3:
                continue
            raw_value = int(str(event.get("data", "0x0")), 16)
            if raw_value <= 0 or raw_value % (10**12):
                continue

            block_number = int(str(event["blockNumber"]), 16)
            if block_number not in block_times:
                block = rpc_call("eth_getBlockByNumber", [hex(block_number), False])
                block_times[block_number] = int(block["timestamp"], 16)

            sender_topic = str(topics[1]).lower()
            payer_address = "0x" + sender_topic[-40:]
            mark_paid(
                "BEP20",
                raw_value // (10**12),
                str(event.get("transactionHash", "")),
                payer_address,
                block_times[block_number],
            )
        except (KeyError, TypeError, ValueError):
            LOGGER.warning("Ignored malformed BSC USDT transfer event: %r", event)

    # Advance only after the complete confirmed range was processed. If any RPC
    # request fails, the monitor retries the same range on its next cycle.
    set_state("last_bsc_block", str(end))


def pending_invoice_exists(network: str) -> bool:
    with DB_LOCK, connect_db() as db:
        return (
            db.execute(
                """
                select 1 from invoices
                where network = ? and status = 'PENDING'
                  and expires_at + ? >= ?
                limit 1
                """,
                (network, PAYMENT_GRACE_SECONDS, int(time.time())),
            ).fetchone()
            is not None
        )


def solana_token_accounts() -> list[str]:
    result = solana_rpc_call(
        "getTokenAccountsByOwner",
        [
            SOLANA_WALLET,
            {"mint": SOLANA_USDT_MINT},
            {"encoding": "jsonParsed", "commitment": "finalized"},
        ],
    )
    accounts: list[str] = []
    for item in result.get("value", []):
        address = str(item.get("pubkey", ""))
        if address:
            accounts.append(address)
    return accounts


def solana_account_delta(transaction: dict[str, Any]) -> int:
    meta = transaction.get("meta") or {}
    pre_by_index: dict[int, int] = {}
    post_by_index: dict[int, int] = {}

    for balance in meta.get("preTokenBalances") or []:
        if (
            str(balance.get("mint", "")) == SOLANA_USDT_MINT
            and str(balance.get("owner", "")) == SOLANA_WALLET
        ):
            amount = (balance.get("uiTokenAmount") or {}).get("amount", "0")
            pre_by_index[int(balance["accountIndex"])] = int(str(amount))

    for balance in meta.get("postTokenBalances") or []:
        if (
            str(balance.get("mint", "")) == SOLANA_USDT_MINT
            and str(balance.get("owner", "")) == SOLANA_WALLET
        ):
            amount = (balance.get("uiTokenAmount") or {}).get("amount", "0")
            post_by_index[int(balance["accountIndex"])] = int(str(amount))

    indexes = set(pre_by_index) | set(post_by_index)
    return sum(post_by_index.get(index, 0) - pre_by_index.get(index, 0) for index in indexes)


def solana_payer(transaction: dict[str, Any]) -> str:
    message = ((transaction.get("transaction") or {}).get("message") or {})
    for account in message.get("accountKeys") or []:
        if isinstance(account, dict) and account.get("signer"):
            return str(account.get("pubkey", ""))
    return ""


def poll_solana() -> None:
    if not pending_invoice_exists("SOLANA"):
        return

    for token_account in solana_token_accounts():
        state_key = f"last_solana_signature:{token_account}"
        saved_signature = get_state(state_key)
        options: dict[str, Any] = {
            "limit": 100,
            "commitment": "finalized",
        }
        if saved_signature:
            options["until"] = saved_signature
        signatures = solana_rpc_call(
            "getSignaturesForAddress",
            [token_account, options],
        )
        if not signatures:
            continue
        for entry in reversed(signatures):
            signature = str(entry.get("signature", ""))
            if not signature or entry.get("err") is not None:
                continue
            transaction = solana_rpc_call(
                "getTransaction",
                [
                    signature,
                    {
                        "encoding": "jsonParsed",
                        "commitment": "finalized",
                        "maxSupportedTransactionVersion": 0,
                    },
                ],
            )
            if not transaction:
                continue
            amount_micros = solana_account_delta(transaction)
            paid_at = int(transaction.get("blockTime") or 0)
            if amount_micros <= 0 or paid_at <= 0:
                continue
            mark_paid(
                "SOLANA",
                amount_micros,
                signature,
                solana_payer(transaction),
                paid_at,
            )
        newest_signature = str(signatures[0].get("signature", ""))
        if newest_signature:
            set_state(state_key, newest_signature)


def send_callbacks() -> None:
    with DB_LOCK, connect_db() as db:
        rows = db.execute(
            """
            select * from invoices
            where (status = 'PAID' or compliance_hold = 1)
              and callback_sent_at is null
              and callback_attempts < ?
              and callback_next_at <= ?
            order by paid_at asc limit 20
            """,
            (MAX_CALLBACK_ATTEMPTS, int(time.time())),
        ).fetchall()

    for row in rows:
        payload = invoice_payload(row)
        body = json_bytes(payload)
        timestamp = str(int(time.time()))
        signature = hmac.new(
            CALLBACK_SECRET.encode("utf-8"),
            timestamp.encode("ascii") + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        try:
            request = urllib.request.Request(
                row["callback_url"],
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-Gateway-Timestamp": timestamp,
                    "X-Gateway-Signature": signature,
                    "User-Agent": "InGamePin-USDT-Gateway/1.0",
                },
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"Callback returned {response.status}.")
            with DB_LOCK, connect_db() as db:
                db.execute(
                    """
                    update invoices
                    set callback_sent_at = ?, callback_attempts = callback_attempts + 1
                    where id = ?
                    """,
                    (int(time.time()), row["id"]),
                )
        except Exception as error:
            LOGGER.warning("Callback failed invoice=%s error=%s", row["id"], error)
            with DB_LOCK, connect_db() as db:
                db.execute(
                    """
                    update invoices
                    set callback_attempts = callback_attempts + 1,
                        callback_next_at = ?
                    where id = ?
                    """,
                    (
                        int(time.time())
                        + min(3600, 15 * (2 ** min(row["callback_attempts"], 8))),
                        row["id"],
                    ),
                )


def network_monitor_loop(name: str, poller: Any) -> None:
    while True:
        try:
            poller()
        except Exception:
            LOGGER.exception("%s monitor error", name)
        time.sleep(POLL_SECONDS)


def callback_loop() -> None:
    while True:
        try:
            expire_invoices()
            send_callbacks()
        except Exception:
            LOGGER.exception("Callback worker error")
        time.sleep(POLL_SECONDS)


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "InGamePinUSDTGateway/1.0"

    def log_message(self, format_string: str, *args: Any) -> None:
        LOGGER.info("%s - %s", self.client_address[0], format_string % args)

    def send_json(self, status: int, payload: Any) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 32_768:
            raise ValueError("Invalid request body.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(200, {"status": "ok"})
            return
        if not api_authorized(self.headers):
            self.send_json(401, {"error": "Unauthorized."})
            return
        if path.startswith("/v1/invoices/"):
            invoice = get_invoice(path.removeprefix("/v1/invoices/"))
            if not invoice:
                self.send_json(404, {"error": "Invoice not found."})
                return
            self.send_json(200, invoice)
            return
        self.send_json(404, {"error": "Not found."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not api_authorized(self.headers):
            self.send_json(401, {"error": "Unauthorized."})
            return
        if path != "/v1/invoices":
            self.send_json(404, {"error": "Not found."})
            return
        try:
            body = self.read_json()
            invoice = create_invoice(
                str(body.get("orderId", "")),
                str(body.get("network", "")),
                body.get("amount"),
                str(body.get("callbackUrl", "")),
            )
            self.send_json(201, invoice)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception:
            LOGGER.exception("Invoice creation failed")
            self.send_json(500, {"error": "Unable to create invoice."})


def main() -> None:
    BASE_DIR.mkdir(mode=0o750, parents=True, exist_ok=True)
    initialize_db()
    for name, poller in (
        ("TRON", poll_tron),
        ("BSC", poll_bsc),
        ("SOLANA", poll_solana),
    ):
        threading.Thread(
            target=network_monitor_loop,
            args=(name, poller),
            daemon=True,
            name=f"{name.lower()}-monitor",
        ).start()
    threading.Thread(
        target=callback_loop,
        daemon=True,
        name="callback-worker",
    ).start()
    server = ThreadingHTTPServer(("127.0.0.1", 8788), GatewayHandler)
    LOGGER.info("USDT gateway listening on 127.0.0.1:8788")
    server.serve_forever()


if __name__ == "__main__":
    main()
