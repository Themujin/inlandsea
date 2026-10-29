// Copies runtime files that bundlers cannot pick up into public/vendor/ (gitignored).
// MapLibre v6 loads its worker from a URL at runtime; serving it ourselves keeps it offline-capable.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dest = path.join(root, "public", "vendor");

const FILES = [["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"]];

async function main() {
  await mkdir(dest, { recursive: true });
  for (const [from, to] of FILES) await copyFile(path.join(root, from), path.join(dest, to));
  console.log(`[vendor] copied ${FILES.length} file(s) to public/vendor`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
