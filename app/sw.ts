/// <reference lib="webworker" />
// Service worker source. Bundled by scripts/build-sw.ts after `next build`;
// self.__SW_MANIFEST is replaced with the precache list of everything in out/.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanURLs: true, directoryIndex: "index.html" },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Map tiles (M5): large PMTiles archive served with range requests.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/tiles/"),
      handler: new CacheFirst({
        cacheName: "tiles",
        plugins: [new ExpirationPlugin({ maxEntries: 2000 })],
      }),
    },
  ],
});

serwist.addEventListeners();
