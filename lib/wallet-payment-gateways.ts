export type WalletGatewayId =
  | "BINANCE_PAY"
  | "FREEKASSA"
  | "USDT_DIRECT"
  | "PALLY";

export type WalletGateway = {
  id: WalletGatewayId;
  name: string;
  description: string;
  icon: string;
};

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function getWalletPaymentGateways(): WalletGateway[] {
  const gateways: Array<WalletGateway & { enabled: boolean }> = [
    {
      id: "BINANCE_PAY",
      name: "Binance Pay",
      description: "Instant verification",
      icon: "B",
      enabled: true,
    },
    {
      id: "FREEKASSA",
      name: "FreeKassa",
      description: "Cards and local methods",
      icon: "F",
      enabled: configured(
        "FREEKASSA_MERCHANT_ID",
        "FREEKASSA_SECRET_WORD_1",
        "FREEKASSA_SECRET_WORD_2",
      ),
    },
    {
      id: "USDT_DIRECT",
      name: "Direct USDT",
      description: "TRC20, BEP20, or Solana",
      icon: "T",
      enabled: configured(
        "USDT_GATEWAY_URL",
        "USDT_GATEWAY_API_SECRET",
        "USDT_GATEWAY_CALLBACK_SECRET",
      ),
    },
    {
      id: "PALLY",
      name: "PayPalych",
      description: "Available payment methods",
      icon: "P",
      enabled:
        configured("PALLY_SHOP_ID") &&
        (configured("PALLY_API_TOKEN") ||
          configured("PALLY_RELAY_URL", "PALLY_RELAY_SECRET")),
    },
  ];

  return gateways
    .filter((gateway) => gateway.enabled)
    .map(({ enabled: _enabled, ...gateway }) => gateway);
}

export function isWalletGatewayId(value: string): value is WalletGatewayId {
  return ["BINANCE_PAY", "FREEKASSA", "USDT_DIRECT", "PALLY"].includes(
    value,
  );
}
