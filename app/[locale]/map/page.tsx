import { notFound } from "next/navigation";
import { MapScreen } from "@/components/MapScreen";
import { getDictionary, isLocale } from "@/i18n";

export default async function MapPage({ params }: PageProps<"/[locale]/map">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <main className="mx-auto mt-4 flex min-h-[70dvh] w-full max-w-3xl flex-1 flex-col">
      <MapScreen t={t} />
    </main>
  );
}
