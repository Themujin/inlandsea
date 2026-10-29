"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary, Locale } from "@/i18n";

/** Bottom tab bar: Map (home) / Monitor. Client-side navigation keeps monitoring running. */
export function AppNav({ locale, t }: { locale: Locale; t: Dictionary }) {
  const pathname = usePathname();
  const onMonitor = pathname.includes("/monitor");
  const tabs = [
    { href: `/${locale}/`, label: t.nav.map, active: !onMonitor },
    { href: `/${locale}/monitor/`, label: t.nav.monitor, active: onMonitor },
  ];
  return (
    <nav className="sticky bottom-0 z-30 border-t border-line bg-[var(--app-bg)]">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`block py-4 text-center font-semibold ${
                tab.active ? "text-channel dark:text-lagoon" : "text-muted"
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Switches locale with a full load (each locale is its own root layout) and remembers the choice. */
export function LocaleSwitch({ to, label }: { to: Locale; label: string }) {
  const pathname = usePathname();
  const href = pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${to}`);
  return (
    <a
      href={href}
      lang={to}
      onClick={() => {
        try {
          localStorage.setItem("sg-locale", to);
        } catch {}
      }}
      className="shrink-0 rounded-button border border-line px-4 py-2 text-sm font-semibold"
    >
      {label}
    </a>
  );
}
