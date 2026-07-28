"use client";

import { useEffect, useState } from "react";

import { useStorePreferences } from "./StorePreferences";

type StoreTheme = "dark" | "light";

const STORAGE_KEY = "storeTheme";
const THEME_EVENT = "ingamepin-theme-change";

function applyTheme(theme: StoreTheme) {
  document.documentElement.dataset.storeTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeModeSwitch({
  className = "",
}: {
  className?: string;
}) {
  const { language } = useStorePreferences();
  const [theme, setTheme] = useState<StoreTheme>("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const initialTheme: StoreTheme =
      savedTheme === "light" ? "light" : "dark";

    setTheme(initialTheme);
    applyTheme(initialTheme);

    const syncTheme = (event: Event) => {
      const nextTheme = (event as CustomEvent<StoreTheme>).detail;
      if (nextTheme === "dark" || nextTheme === "light") {
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }
    };

    const syncStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextTheme: StoreTheme =
        event.newValue === "light" ? "light" : "dark";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    window.addEventListener(THEME_EVENT, syncTheme);
    window.addEventListener("storage", syncStorage);

    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const nextTheme: StoreTheme = theme === "dark" ? "light" : "dark";
  const label =
    language === "ru"
      ? nextTheme === "light"
        ? "\u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430"
        : "\u0422\u0451\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430"
      : nextTheme === "light"
        ? "Light mode"
        : "Dark mode";

  function toggleTheme() {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    window.dispatchEvent(
      new CustomEvent<StoreTheme>(THEME_EVENT, { detail: nextTheme }),
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-mode-switch inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 ${className}`}
      aria-label={label}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {theme === "dark" ? "\u2600" : "\u263E"}
      </span>
      <span>{label}</span>
    </button>
  );
}