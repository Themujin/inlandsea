// Renders PWA icons from an inline SVG into public/icons/.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve(import.meta.dirname, "..", "public", "icons");

// Shield over a shoreline: sand (left), sea (right), red 30 m band.
const icon = (padding: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b1220"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - 2 * padding) / 512})">
    <path d="M256 40 L448 112 V256 C448 368 364 440 256 472 C148 440 64 368 64 256 V112 Z" fill="#e8c98f"/>
    <path d="M300 40 L448 112 V256 C448 368 364 440 256 472 C270 380 250 300 300 200 C330 140 300 90 300 40 Z" fill="#1e5aa8"/>
    <path d="M262 52 L300 40 C300 90 330 140 300 200 C250 300 270 380 256 472 L236 466 C252 380 228 296 278 196 C306 138 280 96 262 52 Z" fill="#dc2626"/>
  </g>
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const jobs: [string, number, number][] = [
    ["icon-192.png", 192, 0],
    ["icon-512.png", 512, 0],
    ["apple-touch-icon.png", 180, 24],
    ["maskable-512.png", 512, 72],
  ];
  for (const [name, size, pad] of jobs) {
    await sharp(Buffer.from(icon(pad))).resize(size, size).png().toFile(path.join(outDir, name));
  }
  console.log(`Wrote ${jobs.length} icons to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
