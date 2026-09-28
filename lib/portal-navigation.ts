export function isBusinessPortalPath(path: string | null) {
  return path === "/account/portal" || Boolean(path?.startsWith("/account/portal/"));
}
export function portalAccountHref(href: string) {
  const boundary=href.search(/[?#]/);
  const path=boundary<0?href:href.slice(0,boundary), suffix=boundary<0?"":href.slice(boundary);
  if (path === "/account/dashboard" || path === "/account/orders") return "/account/portal";
  for (const area of ["wallet", "business", "profile", "security", "orders"]) {
    const base = "/account/" + area;
    if (path === base || path.startsWith(base + "/")) return "/account/portal/" + area + path.slice(base.length) + suffix;
  }
  return href;
}
