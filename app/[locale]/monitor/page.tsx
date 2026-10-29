import { notFound } from "next/navigation";
import { MonitorScreen } from "@/components/MonitorScreen";
import { getDictionary, isLocale } from "@/i18n";

// Monitor screen: live state from MonitorRunner (mounted in the layout).
export default async function MonitorPage({ params }: PageProps<"/[locale]/monitor">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <p className="rounded-card border border-state-caution p-3 text-sm">{t.geometryWarning}</p>

      <MonitorScreen t={t} />

      <section className="mt-auto rounded-card border border-line p-4 text-sm text-muted">
        <h2 className="mb-1 font-semibold text-fg">{t.disclaimerTitle}</h2>
        <p>{t.rule}</p>
        <p className="mt-2">{t.disclaimer}</p>
        <p className="mt-2">{t.privacy}</p>
        <p className="mt-2">{t.dataCredit}</p>
      </section>
    </main>
  );
}
