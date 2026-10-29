import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/i18n";
import type { ZoneState } from "@/engine/types";

const STATES: { state: ZoneState; className: string }[] = [
  { state: "DANGER", className: "bg-danger" },
  { state: "CAUTION", className: "bg-caution text-black" },
  { state: "SAFE", className: "bg-safe" },
  { state: "OUT_OF_AREA", className: "bg-idle" },
  { state: "NO_FIX", className: "bg-idle" },
];

// Monitor screen. M1 shell only: live GPS monitoring lands in M3.
export default async function MonitorPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const other = locale === "en" ? "ar" : "en";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.appName}</h1>
          <p className="mt-1 text-muted">{t.tagline}</p>
        </div>
        <Link
          href={`/${other}/`}
          lang={other}
          className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-sm"
        >
          {t.switchLanguage}
        </Link>
      </header>

      <p className="rounded-xl bg-caution/15 p-3 text-sm text-caution">{t.geometryWarning}</p>

      <section aria-label={t.appName} className="flex flex-col gap-3">
        {STATES.map(({ state, className }) => (
          <div key={state} className={`rounded-2xl px-5 py-4 ${className}`} data-state={state}>
            <p className="text-xl font-semibold">{t.states[state]}</p>
            <p className="text-sm opacity-90">{t.stateHints[state]}</p>
          </div>
        ))}
      </section>

      <p className="text-center text-muted">{t.monitorComingSoon}</p>

      <section className="mt-auto rounded-xl border border-white/10 p-4 text-sm text-muted">
        <h2 className="mb-1 font-semibold text-foreground">{t.disclaimerTitle}</h2>
        <p>{t.rule}</p>
        <p className="mt-2">{t.disclaimer}</p>
        <p className="mt-2">{t.privacy}</p>
      </section>
    </main>
  );
}
