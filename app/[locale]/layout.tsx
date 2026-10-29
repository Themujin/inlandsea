import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { AlertOverlay } from "@/components/AlertOverlay";
import { AppNav, LocaleSwitch } from "@/components/AppNav";
import { BrandLogo } from "@/components/BrandLogo";
import { MonitorRunner } from "@/components/MonitorRunner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { LOCALES, dirOf, getDictionary, isLocale } from "@/i18n";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

// Deployed origin for absolute OG image URLs. Set SITE_URL at build time.
const SITE_URL = process.env.SITE_URL;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    ...(SITE_URL && { metadataBase: new URL(SITE_URL) }),
    title: { default: t.appName, template: `%s · ${t.appName}` },
    description: t.tagline,
    applicationName: "Shoreline Guard",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: t.appName, statusBarStyle: "black-translucent" },
    openGraph: {
      title: "Shoreline Guard · حارس الشاطئ",
      description: t.tagline,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    // app/icon.svg, app/apple-icon.png and app/favicon.ico are picked up automatically.
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B3B5C" },
    { media: "(prefers-color-scheme: dark)", color: "#0E2230" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const otherLocale = locale === "en" ? "ar" : "en";
  const other = getDictionary(otherLocale);
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${inter.variable} ${plexArabic.variable}`}
    >
      <body
        className={`flex min-h-dvh flex-col antialiased ${locale === "ar" ? "font-arabic" : "font-sans"}`}
      >
        <AlertOverlay t={t} other={other} otherLocale={otherLocale} />
        <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 pt-4">
          <h1>
            <BrandLogo locale={locale} height={44} />
          </h1>
          <LocaleSwitch to={otherLocale} label={t.switchLanguage} />
        </header>
        {children}
        <AppNav locale={locale} t={t} />
        <MonitorRunner locale={locale} t={t} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
