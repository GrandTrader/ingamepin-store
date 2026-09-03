export type PaymentGatewayId =
  | "WALLET"
  | "UPI"
  | "BINANCE_PAY"
  | "USDT_DIRECT"
  | "PALLY"
  | "FREEKASSA";

export type GatewayCommission = {
  type: "PERCENTAGE" | "FIXED";
  value: number;
  enabled: boolean;
};

export type GatewayCommissionSettings = Partial<
  Record<PaymentGatewayId, GatewayCommission>
>;

export function paymentMethodToGatewayId(
  paymentMethod: string,
): PaymentGatewayId | null {
  switch (paymentMethod.trim().toLowerCase()) {
    case "wallet":
      return "WALLET";
    case "upi":
    case "manual_upi":
      return "UPI";
    case "binance":
    case "binance_pay":
      return "BINANCE_PAY";
    case "usdt":
    case "usdt_direct":
      return "USDT_DIRECT";
    case "pally":
      return "PALLY";
    case "freekassa":
      return "FREEKASSA";
    default:
      return null;
  }
}

export function calculateGatewayCommission(
  settings: GatewayCommissionSettings | null | undefined,
  paymentMethod: string,
  baseTotal: number,
) {
  const gatewayId = paymentMethodToGatewayId(paymentMethod);
  const safeBaseTotal = Math.max(0, Number(baseTotal) || 0);

  if (!gatewayId) {
    return {
      gatewayId: null,
      fee: 0,
      type: null,
      value: null,
      total: Number(safeBaseTotal.toFixed(2)),
    };
  }

  const configured = settings?.[gatewayId];
  const enabled = configured?.enabled === true;
  const type = configured?.type === "FIXED" ? "FIXED" : "PERCENTAGE";
  const value = Math.max(0, Number(configured?.value) || 0);
  const rawFee = !enabled
    ? 0
    : type === "FIXED"
      ? value
      : (safeBaseTotal * value) / 100;
  const fee = Number(rawFee.toFixed(2));

  return {
    gatewayId,
    fee,
    type: enabled ? type : null,
    value: enabled ? value : null,
    total: Number((safeBaseTotal + fee).toFixed(2)),
  };
}
