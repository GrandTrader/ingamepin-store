"""Validated open-value catalogue and USD purchase preflight. No network calls."""
import re
from decimal import Decimal, InvalidOperation, ROUND_UP


def decimal(value):
    try:
        text = str(value)
        if not re.fullmatch(r"-?\d+(?:\.\d{1,6})?", text):
            raise ValueError()
        number = Decimal(text)
        if not number.is_finite():
            raise ValueError()
        return number
    except (ValueError, InvalidOperation):
        raise ValueError("Invalid supplier range amount") from None


def normalize(rows):
    if not isinstance(rows, list) or len(rows) > 10000:
        raise ValueError("Invalid supplier range catalogue")
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid supplier range")
        sku = row.get("sku", "")
        if not isinstance(sku, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", sku) or sku in seen:
            raise ValueError("Invalid or duplicate supplier range code")
        seen.add(sku)
        low, high, step = [decimal(row.get(key)) for key in ("lowerLimit", "upperLimit", "minimumIncrement")]
        discount = str(row.get("discount", ""))
        if not discount.endswith("%"):
            raise ValueError("Invalid supplier range discount")
        percent = decimal(discount[:-1])
        if not (0 < low <= high <= 1000000 and 0 < step <= high and -1000 <= percent < 100):
            raise ValueError("Invalid supplier range bounds")
        currency = row.get("cardCurrency", "")
        if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
            raise ValueError("Invalid supplier range currency")
        item = {"sku": sku, "lowerLimit": str(low), "upperLimit": str(high), "minimumIncrement": str(step), "cardCurrency": currency, "discount": discount}
        for key in ("brand", "product", "region"):
            value = row.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                raise ValueError("Invalid supplier range label")
            item[key] = value.strip()
        result.append(item)
    return result


def preflight(job, rows, available_usd):
    if job.get("card_currency") != "USD":
        raise ValueError("Foreign currency billing requires verification")
    matches = [row for row in normalize(rows) if row["sku"] == job["sku"]]
    if len(matches) != 1:
        raise ValueError("Supplier range is unavailable")
    row = matches[0]
    value, low, high, step = [decimal(v) for v in (job.get("card_value"), row["lowerLimit"], row["upperLimit"], row["minimumIncrement"])]
    quantity = job.get("quantity")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 1000:
        raise ValueError("Invalid supplier range quantity")
    if row["cardCurrency"] != job["card_currency"] or not low <= value <= high or (value-low) % step or value != value.quantize(Decimal("0.01")):
        raise ValueError("Requested value is outside the supplier range")
    cost = (value * (1 - decimal(row["discount"][:-1])/100)).quantize(Decimal("0.01"), rounding=ROUND_UP)
    if cost <= 0 or cost > decimal(job["max_unit_cost"]):
        raise ValueError("Supplier range price changed")
    if available_usd < cost * quantity:
        raise ValueError("Insufficient confirmed supplier balance")
    return {"sku": job["sku"], "quantity": str(quantity), "cardvalue": format(value, "f"), "currency": job["card_currency"]}
