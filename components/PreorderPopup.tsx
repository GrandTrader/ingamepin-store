"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PreorderPopupData = {
  gameTitle: string;
  imageUrl: string;
  launchDate: string;
  preorderPrice: number | null;
  bonusText: string;
  buttonText: string;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getTimeLeft(
  launchDate: string,
): TimeLeft {
  const difference = Math.max(
    0,
    new Date(launchDate).getTime() -
      Date.now(),
  );

  return {
    days: Math.floor(
      difference / 86_400_000,
    ),
    hours: Math.floor(
      (difference / 3_600_000) % 24,
    ),
    minutes: Math.floor(
      (difference / 60_000) % 60,
    ),
    seconds: Math.floor(
      (difference / 1_000) % 60,
    ),
  };
}

export default function PreorderPopup({
  popup,
}: {
  popup: PreorderPopupData;
}) {
  const [isOpen, setIsOpen] =
    useState(false);
  const [timeLeft, setTimeLeft] =
    useState(() =>
      getTimeLeft(popup.launchDate),
    );

  useEffect(() => {
    if (
      sessionStorage.getItem(
        "preorder-popup-closed",
      ) !== "true"
    ) {
      setIsOpen(true);
    }

    const timer = window.setInterval(() => {
      setTimeLeft(
        getTimeLeft(popup.launchDate),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [popup.launchDate]);

  function closePopup() {
    sessionStorage.setItem(
      "preorder-popup-closed",
      "true",
    );
    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${popup.gameTitle} preorder`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePopup();
        }
      }}
    >
      <div className="relative grid max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-cyan-400/40 bg-slate-950 shadow-[0_0_70px_rgba(34,211,238,0.2)] md:grid-cols-[42%_58%]">
        <button
          type="button"
          onClick={closePopup}
          aria-label="Close preorder popup"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 text-2xl text-white transition hover:bg-white/10"
        >
          ×
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={popup.imageUrl}
          alt={popup.gameTitle}
          className="h-48 w-full object-cover md:h-full md:min-h-[510px]"
        />

        <div className="flex flex-col justify-center p-5 text-center sm:p-8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-400">
            Game Preorder
          </p>

          <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
            {popup.gameTitle}
          </h2>

          <div className="mx-auto mt-5 h-px w-full max-w-md bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

          <p className="mt-6 font-bold text-slate-300">
            Launches In
          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <CountdownBox
              value={timeLeft.days}
              label="Days"
            />
            <CountdownBox
              value={timeLeft.hours}
              label="Hours"
            />
            <CountdownBox
              value={timeLeft.minutes}
              label="Min"
            />
            <CountdownBox
              value={timeLeft.seconds}
              label="Sec"
            />
          </div>

          {popup.preorderPrice !== null && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-sm font-bold text-slate-400">
                Preorder Price
              </p>
              <p className="mt-1 text-4xl font-black text-white">
                ${popup.preorderPrice.toFixed(2)}
              </p>
            </div>
          )}

          <Link
            href="/preorder"
            onClick={closePopup}
            className="mt-6 rounded-xl bg-cyan-400 px-5 py-4 font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300"
          >
            {popup.buttonText}
          </Link>

          <button
            type="button"
            onClick={closePopup}
            className="mt-3 text-sm text-slate-400 underline underline-offset-4 transition hover:text-white"
          >
            Maybe Later
          </button>

          {popup.bonusText && (
            <p className="mx-auto mt-4 rounded-full border border-cyan-400/50 px-4 py-2 text-xs font-bold text-cyan-300">
              🎁 {popup.bonusText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CountdownBox({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-cyan-400/50 bg-cyan-400/5 px-1 py-3">
      <p className="text-2xl font-black text-cyan-300 sm:text-3xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase text-cyan-500 sm:text-xs">
        {label}
      </p>
    </div>
  );
}
