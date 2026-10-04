import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AffiliatePromoter, PromoterView } from "@/lib/affiliate-promoters";
import { emptyPromoterFinance, addPromoterCommission, addPromoterPayout } from "@/lib/affiliate-directory-finance";

// Call only after checking administrator access. Resolve only promoter accounts,
// rather than downloading the entire customer directory to find their emails.
export async function loadAffiliatePromoters(view: PromoterView): Promise<AffiliatePromoter[]> {
  const admin = createAdminClient();
  const rows: (Omit<AffiliatePromoter, "email" | "finance"> & { user_id: string })[] = [];
  for (let offset = 0; ; offset += 1000) {
    const query = admin.from("affiliate_accounts").select("id, user_id, affiliate_code, status, full_name, country_code, promotion_channel, promotion_url, commission_override_percent, created_at");
    const result = await (view === "approved" ? query.eq("status", "APPROVED") : query.neq("status", "APPROVED"))
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Unable to load promoters. Please try again.");
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 1000) break;
  }
  const accounts: AffiliatePromoter[] = new Array(rows.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => {
    while (next < rows.length) {
      const index = next++;
      const { user_id, ...account } = rows[index];
      const result = await admin.auth.admin.getUserById(user_id);
      if (result.error) throw new Error("Unable to load promoter emails. Please try again.");
      accounts[index] = { ...account, email: result.data.user?.email ?? "", finance:emptyPromoterFinance() };
    }
  }));
  const byId = new Map(accounts.map(account => [account.id,account.finance]));
  // Batch IDs and page every result: never truncate balances at the database row limit.
  for(let start=0;start<accounts.length;start+=100) {
    const ids=accounts.slice(start,start+100).map(account=>account.id);
    await Promise.all([
      (async()=>{for(let offset=0;;offset+=1000){
        const result=await admin.from("affiliate_commissions").select("id,affiliate_id,commission_amount,status").in("affiliate_id",ids).order("id").range(offset,offset+999);
        if(result.error)throw Error("Unable to load promoter earnings. Please try again.");
        for(const row of result.data??[]) {const finance=byId.get(row.affiliate_id);if(finance)addPromoterCommission(finance,row);}
        if((result.data?.length??0)<1000)break;
      }})(),
      (async()=>{for(let offset=0;;offset+=1000){
        const result=await admin.from("affiliate_payout_requests").select("id,affiliate_id,net_amount,status,created_at,network").in("affiliate_id",ids).order("id").range(offset,offset+999);
        if(result.error)throw Error("Unable to load promoter payouts. Please try again.");
        for(const row of result.data??[]) {const finance=byId.get(row.affiliate_id);if(finance)addPromoterPayout(finance,row);}
        if((result.data?.length??0)<1000)break;
      }})(),
    ]);
  }
  return accounts;
}
