export type GiftPortItem = {
  operatorCode: string; brandName: string; denominations: string[];
  denominationsIncomplete?: boolean; variable: boolean | null;
  variableRange?: { min: string; max: string } | null; currency?: string | null;
  category?: string; country?: string; deliveryType?: string;
};
export type GiftPortMapping = {
  option_id: string; product_id: string; operator_code: string;
  amount: string; currency: string; updated: number; supplier: GiftPortItem | null;
};
export type GiftPortStatus = {
  configured: boolean; syncing: boolean; error: string | null;
  stale: boolean; purchasingEnabled: boolean; fulfillmentReady?: boolean; fulfillmentError?: string | null;
  snapshot: null | {
    balance: string | null; warnings?: string[]; currency: "INR";
    syncedAt: number; items: GiftPortItem[];
  };
};
