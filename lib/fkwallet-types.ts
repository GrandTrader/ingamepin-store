export type FKCategory = { id: number; name: string; parentId: number | null };
export type FKCurrency = { id: number; code: string };
export type FKField = { key: string; placeholder: string; values: string[]; info: string[];
  label?: string; type?: string; required?: boolean; hasChoices?: boolean };
export type FKProduct = {
  id: number; name: string; description: string; help: string;
  price: number; currency: string; fields: FKField[];
  params: { key: string; value: string }[];
  nameRu?: string; descriptionRu?: string; helpRu?: string;
  productType?: string; priceType?: string; imageUrl?: string;
};
export type FKBalance = { currency: string; value: number };
export type FKResult = {
  id: string; status: number; couponCode?: string;
  deliveryStatus?: "in_process" | "success" | "error" | "cancel" | "refund" | "unknown";
  fields?: { key: string; value: string }[];
  esim?: { qrCode: string; universalLink: string; androidLink: string };
};
export type FKSummary = {
  title: string; currency: string; amount: number;
  categoryId?: number; productId?: number; listedPrice?: number;
  requestedAmount?: number;
};
export type FKTransaction = {
  id: string; reference: number;
  state: "READY" | "SUBMITTING" | "SUBMITTED" | "UNKNOWN" | "CANCELLED";
  summary: FKSummary; provider_id: string | null; provider_status: number | null;
  created_at: string; expires_at: string; note: string | null;
};
export type FKDashboard = {
  connected: boolean; databaseReady: boolean; configuredByEnvironment: boolean;
  balances: FKBalance[]; categories: FKCategory[]; currencies: FKCurrency[];
  transactions: FKTransaction[];
  errors: string[];
};
export type FKAction<T> = { data: T; error?: never } | { error: string; data?: never };
export type FKPurchaseInput = {
  categoryId: number; productId: number; expectedPrice: number; expectedCurrency: string;
  amount: string; fields: { key: string; value: string }[];
};
export type FKReview = { transaction: FKTransaction; fields: { key: string; value: string }[] };
export type FKImportedProduct = { productId: string; name: string; status: string; markup: number; exchangeRate: number; createdAt: string };
