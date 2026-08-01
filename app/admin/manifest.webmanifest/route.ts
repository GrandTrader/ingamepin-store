import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "InGamePin Admin",
    short_name: "IP Admin",
    description: "Manage InGamePin products, orders, payments and customers.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/admin-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/admin-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
