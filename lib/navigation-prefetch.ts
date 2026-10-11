const informationPages = new Set(["/about", "/about-us", "/contact", "/contact-us", "/terms", "/privacy-policy", "/refund-policy", "/work-with-us", "/affiliate-program", "/preorder"]);
export function canPrefetchPage(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && !url.search && !url.hash &&
      (informationPages.has(url.pathname) || url.pathname === "/" || /^\/(?:product\/[^/]+|category\/[^?#]+|products(?:\/[^?#]+)?)\/?$/.test(url.pathname));
  } catch { return false; }
}
