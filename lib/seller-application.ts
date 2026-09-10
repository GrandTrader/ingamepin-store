export const SELLER_DECLARATION_VERSION = "2026-09-10-v1";
export const SELLER_DECLARATION = "I declare that I do not use this platform for gambling-related transactions, fraud, money laundering, or transactions involving stolen or illegally obtained funds. I confirm that all products, voucher codes, and supporting documents I submit are genuine and lawfully obtained. I will not knowingly sell stolen, previously redeemed, or fraudulently acquired codes. I agree to provide supporting records when requested and understand that suspected violations may result in suspension and investigation.";

export type SellerApplication = {
  address_line1?: string | null; address_line2?: string | null; city?: string | null; district?: string | null; state_region?: string | null; postal_code?: string | null;
  didit_face_score?: number | null; didit_environment?: string | null;
  submission_ip?: string | null;
  id: string; user_id: string; username: string; status: string;
  first_name?: string | null; surname?: string | null; marketplace_proof_path?: string | null; legal_name: string | null; country_code: string | null; phone_number: string | null;
  email_verified_at: string | null; phone_verified_at: string | null;
  identity_verified_at: string | null; physical_id_verified_at: string | null;
  face_liveness_verified_at: string | null; sells_on_other_marketplaces: boolean;
  marketplace_statement_verified_at: string | null;
  declaration_version: string | null; declaration_accepted_at: string | null;
  submitted_at: string | null; updated_at: string;
  review_note: string | null;
};

export function sellerVerificationChecks(seller: SellerApplication) {
  return [
    { label: "Email verification", complete: Boolean(seller.email_verified_at) },
    { label: "Government ID verification", complete: Boolean(seller.identity_verified_at) },
    { label: "Original physical ID photo", complete: Boolean(seller.physical_id_verified_at) },
    { label: "Facial and liveness verification", complete: Boolean(seller.face_liveness_verified_at && seller.didit_environment === "live" && typeof seller.didit_face_score === "number" && seller.didit_face_score >= 80 && seller.didit_face_score <= 100) },
    ...(seller.sells_on_other_marketplaces ? [{ label: "Marketplace account statement", complete: Boolean(seller.marketplace_statement_verified_at) }] : []),
    { label: "Seller declaration", complete: Boolean(seller.declaration_version && seller.declaration_accepted_at) },
  ];
}
