import type { NextConfig } from "next";
import { productImageRemotePatterns } from "./lib/product-image";

const securityHeaders = [
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: productImageRemotePatterns(), maximumRedirects: 0 },
  outputFileTracingIncludes: {
    "/admin/customers/*/report": ["./lib/assets/customer-report-fonts/*"],
    "/admin/products": ["./node_modules/flag-icons/flags/4x3/*.svg", "./lib/assets/fonts/*"],
    "/admin/products/**": ["./node_modules/flag-icons/flags/4x3/*.svg", "./lib/assets/fonts/*"],
  },
  reactStrictMode: true,
  experimental: {
    staleTimes: { dynamic: 0, static: 30 },
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  async headers() {
    return [
      ...["/account/:path*", "/business/:path*"].map((source) => ({
        source,
        headers: [{ key: "Accept-CH", value: "Sec-CH-UA-Model, Sec-CH-UA-Platform" }],
      })),
      ...["/api/customer-discounts", "/api/wallet/:path*", "/api/orders/:path*", "/api/support/chat", "/api/admin/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
