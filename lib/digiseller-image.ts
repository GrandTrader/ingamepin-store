import "server-only";
import { assertRasterImage } from "./product-image-format";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { countryCode, regionShortName } from "./country-flag";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

// Explicitly load the shipped font: production servers may have no system fonts.
const fontFile = path.join(process.cwd(), "lib/assets/fonts/Geist-Bold.ttf");
async function textImage(markup: string, width: number, height: number) {
  const png = await sharp({ text: { text: markup, font: "Geist Bold 128", fontfile: fontFile, rgba: true } })
    .resize({ width, height, fit: "inside" })
    .png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Creates an upload-only copy. Never modifies the source image or storage URL. */
export async function renderDigiSellerImage(source: Buffer, region?: string | null) {
  assertRasterImage(source);
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
  const [iconText, wordmark] = await Promise.all([
    textImage('<span foreground="#08223d">iP</span>', 132, 128),
    textImage('<span foreground="#08223d">iNgame</span><span foreground="#00c4df">PIN</span>', 672, 128),
  ]);
  const footer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${footerHeight}" viewBox="0 0 1000 220">
    <rect width="1000" height="220" fill="#ffffff"/>
    <rect x="56" y="16" width="188" height="188" rx="48" fill="#00c4df"/>
    <image x="84" y="46" width="132" height="128" href="${iconText}"/>
    <image x="272" y="46" width="672" height="128" href="${wordmark}" preserveAspectRatio="xMinYMid meet"/>
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
    const labelImage = await textImage(`<span foreground="#17243a">${escapeXml(label)}</span>`, badgeWidth - 105, 38);
    const scale = width / 1000;
    const badge = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${badgeWidth}" height="${badgeHeight}" viewBox="0 0 ${badgeWidth} ${badgeHeight}">
      <rect x="1" y="1" width="${badgeWidth - 2}" height="74" rx="14" fill="#ffffff" stroke="#d6e4ec" stroke-width="2"/>
      ${flag}<image x="90" y="19" width="${badgeWidth - 105}" height="38" href="${labelImage}" preserveAspectRatio="xMinYMid meet"/>
    </svg>`)).resize(Math.max(1, Math.round(badgeWidth * scale))).png().toBuffer();
    overlays.push({ input: badge, top: Math.round(16 * scale), left: Math.max(0, width - Math.round((badgeWidth + 16) * scale)) });
  }
  return sharp({ create: { width, height: info.height + footerHeight, channels: 3, background: "#ffffff" } })
    .composite(overlays)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
