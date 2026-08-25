"use client";

import { useMemo, useState } from "react";

import { saveGatewayCommissions } from "./actions";

type CommissionType = "PERCENTAGE" | "FIXED";
type GatewayId =
  | "WALLET"
  | "UPI"
  | "BINANCE_PAY"
  | "USDT_DIRECT"
  | "PALLY"
  | "FREEKASSA";

type GatewayCommission = {
  type: CommissionType;
  value: number;
  enabled: boolean;
};

type GatewayCommissionSettingsProps = {
  initialSettings: Partial<Record<GatewayId, GatewayCommission>> | null;
};

const gateways: Array<{
  id: GatewayId;
  name: string;
  description: string;
  icon: string;
  color: string;
  enabledByDefault: boolean;
}> = [
  {
    id: "WALLET",
    name: "InGamePin Wallet",
    description: "Customer wallet balance",
    icon: "W",
    color: "bg-cyan-100 text-cyan-700",
    enabledByDefault: true,
  },
  {
    id: "BINANCE_PAY",
    name: "Binance Pay",
    description: "Binance merchant checkout",
    icon: "B",
    color: "bg-amber-100 text-amber-700",
    enabledByDefault: true,
  },
  {
    id: "USDT_DIRECT",
    name: "Direct USDT",
    description: "TRC20, BEP20 and Solana",
    icon: "T",
    color: "bg-emerald-100 text-emerald-700",
    enabledByDefault: true,
  },
  {
    id: "PALLY",
    name: "Pally Payment",
    description: "Pally payment links",
    icon: "P",
    color: "bg-blue-100 text-blue-700",
    enabledByDefault: true,
  },
  {
    id: "FREEKASSA",
    name: "FreeKassa",
    description: "Cards and local payment methods",
    icon: "F",
    color: "bg-violet-100 text-violet-700",
    enabledByDefault: true,
  },
  {
    id: "UPI",
    name: "Manual Crypto",
    description: "USDT BEP20 with manual TX ID verification",
    icon: "T",
    color: "bg-emerald-100 text-emerald-700",
    enabledByDefault: false,
  },
];

function normaliseSettings(
  initialSettings: GatewayCommissionSettingsProps["initialSettings"],
) {
  return gateways.reduce(
    (result, gateway) => {
      const saved = initialSettings?.[gateway.id];

      result[gateway.id] = {
        type: saved?.type === "FIXED" ? "FIXED" : "PERCENTAGE",
        value:
          Number.isFinite(Number(saved?.value)) && Number(saved?.value) >= 0
            ? Number(saved?.value)
            : 0,
        enabled:
          typeof saved?.enabled === "boolean"
            ? saved.enabled
            : gateway.enabledByDefault,
      };

      return result;
    },
    {} as Record<GatewayId, GatewayCommission>,
  );
}

export default function GatewayCommissionSettings({
  initialSettings,
}: GatewayCommissionSettingsProps) {
  const initial = useMemo(
    () => normaliseSettings(initialSettings),
    [initialSettings],
  );
  const [settings, setSettings] =
    useState<Record<GatewayId, GatewayCommission>>(initial);
  const previewSubtotal = 100;

  function updateGateway(
    gatewayId: GatewayId,
    update: Partial<GatewayCommission>,
  ) {
    setSettings((current) => ({
      ...current,
      [gatewayId]: {
        ...current[gatewayId],
        ...update,
      },
    }));
  }

  return (
    <form
      action={saveGatewayCommissions}
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-black">Gateway commissions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Increase or decrease the customer fee separately for each payment
            method.
          </p>
        </div>

        <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
          Preview subtotal: <strong className="text-slate-900">$100.00</strong>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        {gateways.map((gateway) => {
          const commission = settings[gateway.id];
          const fee = commission.enabled
            ? commission.type === "PERCENTAGE"
              ? (previewSubtotal * commission.value) / 100
              : commission.value
            : 0;
          const customerTotal = previewSubtotal + fee;

          return (
            <div
              key={gateway.id}
              className="grid gap-4 border-b border-slate-200 p-4 last:border-b-0 lg:grid-cols-[minmax(220px,1fr)_170px_180px_170px_90px] lg:items-center"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-black ${gateway.color}`}
                >
                  {gateway.icon}
                </span>
                <div>
                  <p className="font-black text-slate-900">{gateway.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {gateway.description}
                  </p>
                </div>
              </div>

              <label>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Fee type
                </span>
                <select
                  name={`${gateway.id}_type`}
                  value={commission.type}
                  onChange={(event) =>
                    updateGateway(gateway.id, {
                      type: event.target.value as CommissionType,
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-bold outline-none focus:border-blue-500"
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
              </label>

              <label>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Customer fee
                </span>
                <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500">
                  <span className="flex w-10 items-center justify-center bg-slate-50 font-black text-slate-500">
                    {commission.type === "PERCENTAGE" ? "%" : "$"}
                  </span>
                  <input
                    name={`${gateway.id}_value`}
                    type="number"
                    min="0"
                    max={commission.type === "PERCENTAGE" ? "100" : "100000"}
                    step="0.0001"
                    required
                    value={commission.value}
                    onChange={(event) =>
                      updateGateway(gateway.id, {
                        value: Math.max(0, Number(event.target.value)),
                      })
                    }
                    className="min-w-0 flex-1 px-3 py-2.5 font-bold outline-none"
                  />
                </div>
              </label>

              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Customer pays
                </p>
                <p className="mt-1 font-black text-slate-900">
                  ${customerTotal.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500">Fee ${fee.toFixed(2)}</p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 lg:justify-center">
                <span className="text-sm font-bold text-slate-600 lg:hidden">
                  Apply fee
                </span>
                <input
                  name={`${gateway.id}_enabled`}
                  type="checkbox"
                  checked={commission.enabled}
                  onChange={(event) =>
                    updateGateway(gateway.id, {
                      enabled: event.target.checked,
                    })
                  }
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-700"
        >
          Save gateway commissions
        </button>
      </div>
    </form>
  );
}
