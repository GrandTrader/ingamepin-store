import { requireSellerAdministrator } from "@/lib/seller-access";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSellerAdministrator();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", {status:404});
  const db = createAdminClient();
  const {data, error} = await db.from("seller_accounts").select("marketplace_proof_path").eq("id",id).maybeSingle();
  if (error || !data?.marketplace_proof_path) return new Response("Not found", {status:404});
  const file = await db.storage.from("seller-marketplace-proofs").download(data.marketplace_proof_path);
  if (file.error || !file.data) return new Response("Proof unavailable", {status:404});
  const extension = file.data.type === "application/pdf" ? "pdf" : file.data.type === "image/png" ? "png" : "jpg";
  return new Response(file.data, {headers:{"Content-Type":"application/octet-stream", "Content-Disposition":'attachment; filename="marketplace-proof.'+extension+'"', "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"}});
}
