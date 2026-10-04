export function contentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.yandex.ru https://*.yandex.com https://*.google-analytics.com https://*.analytics.google.com https://*.google.com https://*.googleadservices.com https://*.googlesyndication.com https://*.doubleclick.net https://*.vercel-insights.com https://challenges.cloudflare.com https://translate.googleapis.com${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "frame-src 'self' https://challenges.cloudflare.com https://*.google.com https://*.doubleclick.net https://*.didit.me",
    "media-src 'self' blob: https:", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
