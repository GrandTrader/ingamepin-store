"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useStorePreferences } from "./StorePreferences";

const LiveSupportWidget = dynamic(() => import("./LiveSupportWidget"), {
  ssr: false,
});

const RussianWebsiteTranslator = dynamic(
  () => import("./RussianWebsiteTranslator"),
  { ssr: false },
);

export default function PublicStoreEnhancements() {
  const pathname = usePathname();
  const { language } = useStorePreferences();
  const [loadLiveChat, setLoadLiveChat] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setLoadLiveChat(false);
      return;
    }

    let timer: number | undefined;

    const loadChat = () => {
      setLoadLiveChat(true);
    };

    const scheduleChat = () => {
      timer = window.setTimeout(loadChat, 1500);
    };

    if (document.readyState === "complete") {
      scheduleChat();
    } else {
      window.addEventListener("load", scheduleChat, { once: true });
    }

    window.addEventListener("pointerdown", loadChat, { once: true });
    window.addEventListener("keydown", loadChat, { once: true });
    window.addEventListener("scroll", loadChat, {
      once: true,
      passive: true,
    });

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }

      window.removeEventListener("load", scheduleChat);
      window.removeEventListener("pointerdown", loadChat);
      window.removeEventListener("keydown", loadChat);
      window.removeEventListener("scroll", loadChat);
    };
  }, [pathname]);

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      {language === "ru" && <RussianWebsiteTranslator />}
      {loadLiveChat && <LiveSupportWidget />}
    </>
  );
}
