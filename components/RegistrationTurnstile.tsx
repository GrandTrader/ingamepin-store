"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": (errorCode?: string) => void;
          theme: "light";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function RegistrationTurnstile({
  message = "Complete the security check to create your account.",
}: {
  message?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.turnstile) {
      setScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (!scriptReady || !siteKey || !containerRef.current) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | undefined;

    function renderWidget() {
      if (
        cancelled ||
        widgetIdRef.current ||
        !containerRef.current ||
        !window.turnstile
      ) {
        return Boolean(window.turnstile);
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (value) => {
            setToken(value);
            setError("");
          },
          "expired-callback": () => setToken(""),
          "error-callback": (errorCode) => {
            setToken("");
            setError(
              errorCode === "110200"
                ? "Security check cannot load because this hostname is not authorized in Cloudflare Turnstile."
                : "Security check could not load. Refresh the page and try again.",
            );
          },
        });
        setError("");
        return true;
      } catch {
        setError(
          "Security check could not start. Refresh the page and try again.",
        );
        return false;
      }
    }

    if (!renderWidget()) {
      retryTimer = window.setInterval(() => {
        attempts += 1;

        if (renderWidget() || attempts >= 50) {
          if (retryTimer !== undefined) {
            window.clearInterval(retryTimer);
          }

          if (attempts >= 50 && !window.turnstile) {
            setError(
              "Security check could not load. Check your connection, disable content blocking for this page, and refresh.",
            );
          }
        }
      }, 100);
    }

    return () => {
      cancelled = true;

      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer);
      }

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady]);

  if (!siteKey) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
        Registration security is temporarily unavailable.
      </p>
    );
  }

  return (
    <div className="sm:col-span-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => {
          setScriptReady(false);
          setError(
            "Security check script was blocked. Allow challenges.cloudflare.com and refresh the page.",
          );
        }}
      />
      <input type="hidden" name="captcha_token" value={token} />
      <div
        ref={containerRef}
        className="flex min-h-16 justify-center overflow-hidden"
      />
      {error && (
        <p className="mt-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-center text-xs text-red-300">
          {error}
        </p>
      )}
      <p className="mt-2 text-center text-xs text-slate-500">
        {message}
      </p>
    </div>
  );
}
