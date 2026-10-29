import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getDictionary, isLocale } from "@/i18n";
import type { ZoneState } from "@/engine/types";

// White text sits on the -strong shades; CAUTION keeps the bright fill with ink text (BRAND.md).
const STATES: { state: ZoneState; className: string }[] = [
  { state: "DANGER", className: "bg-state-danger-strong text-white" },
  { state: "CAUTION", className: "bg-state-caution text-ink" },
  { state: "SAFE", className: "bg-state-safe-strong text-white" },
  { state: "OUT_OF_AREA", className: "bg-state-idle-strong text-white" },
  { state: "NO_FIX", className: "bg-state-idle-strong text-white" },
];

// Monitor screen. M1 shell only: live GPS monitoring lands in M3.
export default async function MonitorPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const other = locale === "en" ? "ar" : "en";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1>
          <BrandLogo locale={locale} height={48} />
        </h1>
        <Link
          href={`/${other}/`}
          lang={other}
          className="shrink-0 rounded-button border border-line px-4 py-2 text-sm font-semibold"
        >
          {t.switchLanguage}
        </Link>
      </header>

      <div>
        <p className="text-lg font-semibold">{t.tagline}</p>
        <div className="shore-line mt-3" aria-hidden="true" />
      </div>

      <p className="rounded-card border border-state-caution p-3 text-sm">{t.geometryWarning}</p>

      <section aria-label={t.appName} className="flex flex-col gap-3">
        {STATES.map(({ state, className }) => (
          <div key={state} className={`rounded-card px-5 py-4 ${className}`} data-state={state}>
            <p className="text-2xl font-bold">{t.states[state]}</p>
            <p className="text-sm opacity-90">{t.stateHints[state]}</p>
          </div>
        ))}
      </section>

      <p className="text-center text-muted">{t.monitorComingSoon}</p>

      <section className="mt-auto rounded-card border border-line p-4 text-sm text-muted">
        <h2 className="mb-1 font-semibold text-fg">{t.disclaimerTitle}</h2>
        <p>{t.rule}</p>
        <p className="mt-2">{t.disclaimer}</p>
        <p className="mt-2">{t.privacy}</p>
      </section>
    </main>
  );
}
