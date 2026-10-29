import { expect, test } from "@playwright/test";

test("map is the home screen", async ({ page }) => {
  await page.goto("/en/");
  await expect(page.locator("[data-testid=map] canvas")).toBeVisible();
  await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Start monitoring" })).toBeVisible();
});

test("root redirects to a locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|ar)\/$/);
});

test("English monitor page renders LTR", async ({ page }) => {
  await page.goto("/en/monitor/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Shoreline Guard" })).toBeVisible();
  await expect(page.getByText(/unofficial safety aid/)).toBeVisible();
});

test("Arabic monitor page renders RTL", async ({ page }) => {
  await page.goto("/ar/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "حارس الشاطئ" })).toBeVisible();
});

test("manifest, service worker and geometry are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

  expect((await request.get("/sw.js")).ok()).toBe(true);
  for (const f of ["corridor.geojson", "shoreline.geojson", "meta.json"]) {
    expect((await request.get(`/geo/${f}`)).ok()).toBe(true);
  }
});

test("service worker takes control and serves the shell offline", async ({ page, context }) => {
  await page.goto("/en/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto("/ar/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const geo = await page.evaluate(async () => (await fetch("/geo/shoreline.geojson")).ok);
  expect(geo).toBe(true);
  await context.setOffline(false);
});

test.describe("short screen", () => {
  test.use({ viewport: { width: 360, height: 600 } });

  test("map controls stay above the bottom nav, even with a go-to card", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("sg-destination", JSON.stringify([51.49, 24.82])));
    await page.goto("/en/");
    await expect(page.getByTestId("goto-card")).toBeVisible();
    const start = (await page.getByRole("button", { name: "Start monitoring" }).boundingBox())!;
    const nav = (await page.getByRole("navigation").boundingBox())!;
    expect(start.y + start.height).toBeLessThanOrEqual(nav.y);
    expect(nav.y + nav.height).toBeLessThanOrEqual(600);
  });
});
