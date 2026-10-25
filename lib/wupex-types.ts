export type WupexCredentials = { baseUrl: string; apiKey: string; merchantCode: string };
export type WupexBalance = { amount: number; currency: string };
export type WupexProduct = {
  id: number; sku: string; name: string; price: number;
  available: number | null; cardType: "voucher" | "topup"; subType: number | null;
  region: string; faceValue: number | null; category?: string;
};
export type WupexCatalog = { products: WupexProduct[]; page: number; pageSize: number; totalPages: number; totalCount: number };
export type WupexCatalogFilterSelection = { category?: string; region?: string };
export type WupexCatalogFilters = { categories: string[]; regions: string[] };
export type WupexAction<T> = { data: T; error?: never } | { error: string; data?: never };
export type WupexDashboard = {
  databaseReady: boolean; connected: boolean; configuredByEnvironment: boolean;
  baseUrl: string | null; sandbox: boolean; balance: WupexBalance | null;
  preorderEnabled: boolean | null; errors: string[];
};
