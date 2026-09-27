export type GiftPortStatus = {
  configured: boolean;
  syncing: boolean;
  error: string | null;
  stale: boolean;
  purchasingEnabled: false;
  snapshot: null | {
    balance: string;
    currency: "INR";
    syncedAt: number;
    items: { operatorCode: string; brandName: string; denominations: string[]; variable: boolean | null }[];
  };
};
