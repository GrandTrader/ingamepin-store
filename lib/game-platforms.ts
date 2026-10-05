export const GAME_PLATFORMS = [
  "PS4", "PS5", "Xbox", "Xbox One", "Xbox Series X|S", "Xbox 360",
  "Steam", "PC Only", "Nintendo Switch", "Nintendo Switch 2",
  "Epic Games", "EA App", "Ubisoft Connect", "Battle.net", "GOG",
  "Rockstar Games Launcher", "Microsoft Store", "Android", "iOS", "macOS", "Linux",
] as const;

export type GamePlatform = (typeof GAME_PLATFORMS)[number];

export function isGamesCategory(category?: { slug?: string | null; name?: string | null } | null) {
  return category?.slug?.trim().toLowerCase() === "games" ||
    category?.name?.trim().toLowerCase() === "games";
}

export function normalizeGamePlatforms(values: unknown): GamePlatform[] {
  if (!Array.isArray(values)) return [];
  const selected = new Set(values);
  return GAME_PLATFORMS.filter((platform) => selected.has(platform));
}

export function validGamePlatforms(values: unknown[]): boolean {
  return values.length <= GAME_PLATFORMS.length && values.every(
    (value) => typeof value === "string" && GAME_PLATFORMS.some((platform) => platform === value),
  );
}
