import { notFound } from "next/navigation";
import { MapScreen } from "@/components/MapScreen";
import { getDictionary, isLocale } from "@/i18n";

export default async function MapPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col pt-3">
      <MapScreen t={t} />
    </main>
  );
}
