// Keep product pages readable while the additive platform migration is pending.
export async function readWithGamingPlatforms<T extends { error: { code?: string; message: string } | null }>(
  query: (fields: string) => PromiseLike<T>,
  fields: string,
): Promise<T> {
  const result = await query(fields);
  if ((result.error?.code === "42703" || result.error?.code === "PGRST204") &&
      result.error.message.includes("gaming_platforms")) {
    return await query(fields.replace(/\bgaming_platforms\s*,?/g, ""));
  }
  return result;
}
