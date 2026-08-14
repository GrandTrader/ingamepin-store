type CookieLike = {
  name: string;
};

export function hasSupabaseAuthCookie(cookies: CookieLike[]) {
  return cookies.some(
    ({ name }) =>
      name.startsWith("sb-") && name.includes("-auth-token"),
  );
}
