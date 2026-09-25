export type DefinitePlayItem = {
  sku: string; name: string; brand: string; region: string;
  cardValue: string; cardCurrency: string; price: string; currency: string;
  stock: number | null; available: boolean; asyncOnly: boolean; deliveryMethod: string;
};
export type DefinitePlayCatalogue = {
  items: DefinitePlayItem[]; total: number; categories: string[]; regions: string[]; syncedAt: string | null; stale: boolean;
};
export type DefinitePlayMapping = {
  option_id: string; product_id: string; sku: string; updated: number;
  supplier: DefinitePlayItem | null;
};
export type DefinitePlayStatus = {
  fulfillmentReady?: boolean; fulfillmentError?: string | null;
  balances: unknown; productCount: number; syncedAt: string | null;
  stale: boolean; syncing: boolean; error: string | null;
};
