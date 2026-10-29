/* eslint-disable @next/next/no-img-element -- static SVG lockups; <picture> needs a plain <img> */
// Header logo that swaps lockup by locale and colour scheme. Static files, no runtime cost.
type Props = { locale: "en" | "ar"; height?: number; variant?: "auto" | "light" | "dark" };

export function BrandLogo({ locale, height = 40, variant = "auto" }: Props) {
  const lang = locale === "ar" ? "ar" : "en";
  const alt = locale === "ar" ? "حارس الشاطئ" : "Shoreline Guard";
  if (variant !== "auto") {
    return <img src={`/brand/logo-${lang}-${variant}.svg`} alt={alt} height={height} style={{ height, width: "auto" }} />;
  }
  return (
    <picture>
      <source srcSet={`/brand/logo-${lang}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/brand/logo-${lang}-light.svg`} alt={alt} height={height} style={{ height, width: "auto" }} />
    </picture>
  );
}
