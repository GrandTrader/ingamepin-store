export function canPrefetchPage(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && !url.search && !url.hash &&
      (url.pathname === "/" || /^\/(?:product\/[^/]+|category\/[^?#]+|products(?:\/[^?#]+)?)\/?$/.test(url.pathname));
  } catch { return false; }
}
