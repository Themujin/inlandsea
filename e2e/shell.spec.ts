import { expect, test } from "@playwright/test";

test("root redirects to a locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|ar)\/$/);
});

test("English monitor page renders LTR", async ({ page }) => {
  await page.goto("/en/");
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
