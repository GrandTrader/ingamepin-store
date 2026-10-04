export function isExpiredAffiliateLink(pathname: string, searchParams: URLSearchParams) {
  return /^\/product\/[^/]+\/?$/.test(pathname) && searchParams.getAll("ref").some(value => value.trim().length > 0);
}
