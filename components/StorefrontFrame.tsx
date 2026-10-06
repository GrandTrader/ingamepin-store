"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isBusinessPortalPath } from "@/lib/portal-navigation";
function BusinessFrame({children}:{children:ReactNode}) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the current scroll position possible when the next page is shorter.
    const preserveViewport = () => {
      if (frame.current) frame.current.style.minHeight = `${window.innerHeight + window.scrollY}px`;
    };
    preserveViewport();
    window.addEventListener("scroll", preserveViewport, {passive:true});
    window.addEventListener("resize", preserveViewport);
    return () => {window.removeEventListener("scroll", preserveViewport);window.removeEventListener("resize", preserveViewport);};
  }, []);
  return <div ref={frame} className="flex min-h-screen w-full min-w-0 flex-1 flex-col bg-[#f1eee9]">{children}</div>;
}
export default function StorefrontFrame({ children, header, footer, extras }: {
  children: ReactNode; header: ReactNode; footer: ReactNode; extras: ReactNode;
}) {
  const pathname = usePathname();
  const business = isBusinessPortalPath(pathname);
  if (pathname === "/business/login") return <main className="flex min-h-dvh flex-1 flex-col bg-[#f1eee9]">{children}</main>;
  if (business) return <BusinessFrame>{children}</BusinessFrame>;
  if (pathname === "/account") return <main className="flex min-h-dvh flex-1 flex-col justify-center bg-slate-100">{children}</main>;
  return <>{header}<main className="flex flex-1 flex-col">{children}</main>{footer}{extras}</>;
}
