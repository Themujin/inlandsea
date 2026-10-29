import type { MetadataRoute } from "next";

// Required with output: "export" so the manifest is emitted at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shoreline Guard — حارس الشاطئ",
    short_name: "Shoreline Guard",
    description:
      "Alerts you when you drive within 30 m of the shoreline between Sealine and Khor Al Adaid, Qatar.",
    start_url: "/en/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B3B5C",
    theme_color: "#0B3B5C",
    lang: "en",
    dir: "auto",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Start monitoring", url: "/en/?start=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ابدأ المراقبة", url: "/ar/?start=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
