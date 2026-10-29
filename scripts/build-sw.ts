// Builds out/sw.js after `next build` (static export).
// 1. Bundle app/sw.ts with esbuild.  2. Inject the precache manifest for everything in out/.
import { injectManifest } from "@serwist/build";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "out");

async function main() {
  const tmp = await mkdtemp(path.join(tmpdir(), "sg-sw-"));
  const bundled = path.join(tmp, "sw.js");
  try {
    await build({
      entryPoints: [path.join(root, "app", "sw.ts")],
      outfile: bundled,
      bundle: true,
      format: "iife",
      target: "es2020",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });

    const { count, size, warnings } = await injectManifest({
      swSrc: bundled,
      swDest: path.join(outDir, "sw.js"),
      globDirectory: outDir,
      globPatterns: ["**/*.{html,txt,js,css,json,geojson,webmanifest,png,ico,svg,woff2}"],
      globIgnores: ["sw.js", "404.html", "_not-found/**"],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // Next's hashed assets are immutable; skip revision hashes for them.
      dontCacheBustURLsMatching: /^_next\/static\//,
    });
    for (const w of warnings) console.warn(`[sw] ${w}`);
    console.log(`[sw] out/sw.js: precached ${count} files, ${(size / 1024).toFixed(0)} KiB`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
