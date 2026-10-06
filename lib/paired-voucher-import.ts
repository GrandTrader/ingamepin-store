export type PairedVoucher = { cardNumber: string; pin: string };
export const PAIRED_VOUCHER_CSV_TEMPLATE = "card_number,pin\r\n";
export const MAX_PAIRED_VOUCHERS = 10000;

/** Keep identifiers as text: converting to numbers loses leading zeroes. */
export function validatePairedVouchers(input: unknown): PairedVoucher[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Add at least one card number and PIN.");
  if (input.length > MAX_PAIRED_VOUCHERS) throw new Error("Upload a maximum of 10,000 vouchers at once.");
  const seen = new Set<string>();
  return input.map((entry, index) => {
    if (!entry || typeof entry.cardNumber !== "string" || typeof entry.pin !== "string") {
      throw new Error(`Row ${index + 1}: card number and PIN must be text.`);
    }
    const cardNumber = entry.cardNumber.trim();
    const pin = entry.pin.trim();
    if (!cardNumber || !pin) throw new Error(`Row ${index + 1}: both card number and PIN are required.`);
    for (const value of [cardNumber, pin]) {
      if (value.length > 200 || /[\x00-\x1f\x7f|]/.test(value)) {
        throw new Error(`Row ${index + 1}: use a single line of up to 200 characters per field, without |.`);
      }
      if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)) {
        throw new Error(`Row ${index + 1}: scientific notation is not a valid voucher. Format spreadsheet columns as Text and use the original number.`);
      }
    }
    if (seen.has(cardNumber)) throw new Error(`Row ${index + 1}: duplicate card number. Keep each card only once.`);
    seen.add(cardNumber);
    return { cardNumber, pin };
  });
}

export function formatPairedVoucher(entry: PairedVoucher): string {
  return `Card Number: ${entry.cardNumber} | PIN: ${entry.pin}`;
}

export function parsePairedVoucherPayload(raw: string): string[] {
  if (raw.length > 2000000) throw new Error("The voucher list is too large. Split it into smaller uploads.");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("Invalid voucher list. Preview the cards again."); }
  return validatePairedVouchers(input).map(formatPairedVoucher);
}

// Strict CSV parsing: quoted commas/escaped quotes are preserved, malformed rows are rejected.
export function parseVoucherCsvRecords(raw: string): string[][] {
  if (raw.length > 1000000) throw new Error("CSV must be smaller than 1 MB. Split it into smaller files.");
  const text = raw.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closedQuote = false;
  function endCell() { row.push(cell); cell = ""; closedQuote = false; }
  function endRow() {
    endCell();
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
    if (records.length > MAX_PAIRED_VOUCHERS + 1) throw new Error("Upload a maximum of 10,000 vouchers at once.");
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === ",") endCell();
    else if (char === "\r" || char === "\n") { endRow(); if (char === "\r" && text[i + 1] === "\n") i++; }
    else if (char === '"' && !cell && !closedQuote) quoted = true;
    else {
      if (closedQuote || char === '"') throw new Error("Invalid CSV quoting. Use the downloaded template.");
      cell += char;
    }
  }
  if (quoted) throw new Error("A CSV quoted field is incomplete. Check the file and try again.");
  if (cell || row.length || closedQuote) endRow();
  return records;
}

export function parsePairedVoucherCsv(raw: string): PairedVoucher[] {
  const records = parseVoucherCsvRecords(raw);
  const header = records.shift()?.map((value) => value.trim().toLowerCase().replace(/[ _-]+/g, ""));
  if (!header || header.length !== 2 || !header.includes("cardnumber") || !header.includes("pin")) {
    throw new Error("CSV needs exactly two columns: card_number,pin. Download the template below.");
  }
  const cardIndex = header.indexOf("cardnumber"), pinIndex = header.indexOf("pin");
  return validatePairedVouchers(records.map((values, index) => {
    if (values.length !== 2) throw new Error(`CSV row ${index + 2}: expected exactly two columns.`);
    return { cardNumber: values[cardIndex], pin: values[pinIndex] };
  }));
}

/** Pasted lists may omit the CSV header; identifiers always remain strings. */
export function parsePairedVoucherText(raw: string): PairedVoucher[] {
  const records = parseVoucherCsvRecords(raw);
  const first = records[0]?.map((value) => value.trim().toLowerCase().replace(/[ _-]+/g, ""));
  if (first?.includes("cardnumber") || first?.includes("pin")) return parsePairedVoucherCsv(raw);
  return validatePairedVouchers(records.map((values, index) => {
    if (values.length !== 2) throw new Error(`Row ${index + 1}: use card number,PIN with one voucher per line.`);
    return { cardNumber: values[0], pin: values[1] };
  }));
}
