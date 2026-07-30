"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function UsdtQrCode({
  address,
  network,
}: {
  address: string;
  network: "TRC20" | "BEP20" | "SOLANA";
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    void QRCode.toDataURL(address, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#020617",
        light: "#ffffff",
      },
    }).then((value) => {
      if (active) setDataUrl(value);
    });

    return () => {
      active = false;
    };
  }, [address]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white p-5 text-center">
      {dataUrl ? (
        <Image
          src={dataUrl}
          alt={`USDT ${network} receiving-address QR code`}
          width={280}
          height={280}
          unoptimized
          className="mx-auto h-auto w-full max-w-[280px]"
        />
      ) : (
        <div className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-xl bg-slate-200" />
      )}
      <p className="mt-3 text-sm font-black text-slate-950">
        Scan the {network} wallet address
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Confirm the network and exact amount before sending.
      </p>
    </div>
  );
}
