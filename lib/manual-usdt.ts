export const MANUAL_USDT_NETWORKS = [
  { id: "BEP20", label: "BEP20", address: "0x37a7374989d960e58be99ea603c086f1a54a5179" },
  { id: "TRC20", label: "TRC20", address: "TSVHuaL5qhroTrVg566qKGLoQo8WopVa5o" },
  { id: "PLASMA", label: "Plasma", address: "0xa12f70b721a8d79c7895648b677ad2282c06dffa" },
  { id: "APTOS", label: "Aptos", address: "0x676062d2899f6facfaf8bb16cb989d83afa51def53fef07403fad7b6d910eaa1" },
  { id: "SOLANA", label: "Solana", address: "Hikd8CGNBptiMgnRxvHjsX7pBBVNtR1MBmQJfJk8wp4W" },
  { id: "TON", label: "TON (The Open Network)", address: "UQAMPIkVx6v0corEHYh-NAgr-xbq-51mdJImL82TgP-vQ97B" },
  { id: "AVAX_C", label: "AVAX C-Chain", address: "0xa12f70b721a8d79c7895648b677ad2282c06dffa" },
] as const;

export type ManualUsdtNetwork = (typeof MANUAL_USDT_NETWORKS)[number]["id"];

export function isManualUsdtNetwork(value: string): value is ManualUsdtNetwork {
  return MANUAL_USDT_NETWORKS.some((network) => network.id === value);
}
