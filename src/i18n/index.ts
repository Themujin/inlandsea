import ar from "./ar.json";
import en from "./en.json";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export type Dictionary = typeof en;

const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
