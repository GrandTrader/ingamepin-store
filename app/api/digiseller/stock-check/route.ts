import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { playstationStock, PLAYSTATION_LISTING_ID } from "@/lib/digiseller-playstation-stock";
import { resolveDigiSelection } from "@/lib/digiseller-customer-information";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only DigiSeller parameter precheck for this PlayStation listing only.
export async function POST(request: Request) {
  let ru = false;
  const reply = (error: string) => NextResponse.json({ error }, { headers: { "Cache-Control": "no-store" } });
  try {
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Invalid request");
    const body = JSON.parse(raw);
    ru = body?.product?.lang === "ru-RU";
    const id = Number(body?.product?.id), count = Number(body?.product?.cnt);
    if (id !== PLAYSTATION_LISTING_ID || !Number.isSafeInteger(count) || count < 1 || count > 1000
      || !Array.isArray(body.options) || body.options.length > 50) throw new Error("Invalid request");
    const rows = await playstationStock(createAdminClient());
    const selections = body.options.map((o: { id?: unknown; type?: unknown; value?: unknown }) => {
      if (!o || !["radio", "select", "checkbox", "text", "textarea"].includes(String(o.type))) throw new Error("Invalid selection");
      return { id: String(o.id), ...(["radio", "select", "checkbox"].includes(String(o.type))
        ? { user_data_id: String(o.value) } : { user_data: String(o.value) }) };
    });
    const selected = resolveDigiSelection(rows, selections);
    const option = rows.find(row => row.id === selected?.id);
    if (!option) return reply(ru ? "Выберите доступный номинал." : "Please select an available denomination.");
    if (count > option.available) return reply(ru ? "Этот номинал закончился или нужное количество недоступно. Выберите другой номинал." : "This denomination is sold out or the requested quantity is unavailable. Please select another denomination.");
    return reply("");
  } catch {
    return reply(ru ? "Не удалось проверить наличие. Попробуйте позже." : "Stock could not be verified. Please try again shortly.");
  }
}
