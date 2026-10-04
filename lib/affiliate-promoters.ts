import type { PromoterFinance } from "./affiliate-directory-finance";
export type PromoterView = "applications" | "approved";
export type AffiliatePromoter = {
  id: string;
  affiliate_code: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  full_name: string;
  email: string;
  country_code: string;
  promotion_channel: string;
  promotion_url: string | null;
  commission_override_percent: number | null;
  created_at: string;
  finance: PromoterFinance;
};

export function promoterDirectoryPath(view: unknown) {
  return view === "approved" ? "/admin/affiliates/approved" : "/admin/affiliates/promoters";
}

export function filterPromotersByEmail(accounts: AffiliatePromoter[], query: string) {
  const email = query.trim().toLowerCase();
  return accounts.filter(account => account.email.toLowerCase().includes(email));
}
