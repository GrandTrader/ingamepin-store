import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { countryCode, regionShortName } from "./country-flag";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

/** Creates an upload-only copy. Never modifies the source image or storage URL. */
export async function renderDigiSellerImage(source: Buffer, region?: string | null) {
  const input = sharp(source, { limitInputPixels: 40_000_000 });
  const metadata = await input.metadata();
  // Remove white source padding, but preserve coloured product backgrounds.
  if ((metadata.width ?? 0) >= 3 && (metadata.height ?? 0) >= 3) {
    input.trim({ background: "#ffffff", threshold: 20 });
  }
  const { data: artwork, info } = await input
    .rotate()
    .resize({ width: 1000, height: 1000, fit: "inside" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const footerHeight = Math.max(1, Math.round(width * 0.22));
  const footer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${footerHeight}" viewBox="0 0 1000 220">
    <rect width="1000" height="220" fill="#ffffff"/>
    <rect x="56" y="16" width="188" height="188" rx="48" fill="#00c4df"/>
    <text x="150" y="156" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="128" fill="#08223d">iP</text>
    <text x="272" y="150" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="128" fill="#08223d">iNgame<tspan fill="#00c4df">PIN</tspan></text>
  </svg>`);
  const overlays: OverlayOptions[] = [{ input: artwork, top: 0, left: 0 }, { input: footer, top: info.height, left: 0 }];
  if (region?.trim()) {
    const code = countryCode(region);
    const label = regionShortName(region);
    const badgeWidth = Math.min(520, Math.max(190, 116 + label.length * 23));
    const badgeHeight = 76;
    const flag = code
      ? `<image x="14" y="16" width="60" height="45" href="data:image/svg+xml;base64,${(await readFile(path.join(process.cwd(), "node_modules/flag-icons/flags/4x3", `${code}.svg`))).toString("base64")}"/>`
      : '<g fill="none" stroke="#007f98" stroke-width="3"><circle cx="44" cy="38" r="23"/><ellipse cx="44" cy="38" rx="10" ry="23"/><path d="M21 38h46M25 26h38M25 50h38"/></g>';
    const scale = width / 1000;
    const badge = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${badgeWidth}" height="${badgeHeight}" viewBox="0 0 ${badgeWidth} ${badgeHeight}">
      <rect x="1" y="1" width="${badgeWidth - 2}" height="74" rx="14" fill="#ffffff" stroke="#d6e4ec" stroke-width="2"/>
      ${flag}<text x="90" y="50" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" font-weight="800" fill="#17243a" textLength="${Math.min(label.length * 23, badgeWidth - 105)}" lengthAdjust="spacingAndGlyphs">${escapeXml(label)}</text>
    </svg>`)).resize(Math.max(1, Math.round(badgeWidth * scale))).png().toBuffer();
    overlays.push({ input: badge, top: Math.round(16 * scale), left: Math.max(0, width - Math.round((badgeWidth + 16) * scale)) });
  }
  return sharp({ create: { width, height: info.height + footerHeight, channels: 3, background: "#ffffff" } })
    .composite(overlays)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
