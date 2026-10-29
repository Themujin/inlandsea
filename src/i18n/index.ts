import config from "../../public/config.json";
import ar from "./ar.json";
import en from "./en.json";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export type Dictionary = typeof en;

/**
 * Threshold placeholders in strings, filled from public/config.json so the copy can never
 * disagree with the engine. {rule} = legal distance, {tide} = tide margin,
 * {danger}/{caution} = the effective warning distances (rule/caution + tide).
 */
const VARS: Record<string, number> = {
  rule: config.dangerMeters,
  tide: config.tideMarginMeters,
  danger: config.dangerMeters + config.tideMarginMeters,
  caution: config.cautionMeters + config.tideMarginMeters,
};

function fill<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(/\{(rule|tide|danger|caution)\}/g, (_, k: string) => String(VARS[k])) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)])) as T;
  return value;
}

const DICTIONARIES: Record<Locale, Dictionary> = { en: fill(en), ar: fill(ar) };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
