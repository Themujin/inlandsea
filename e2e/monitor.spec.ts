import { expect, test } from "@playwright/test";

// A vertex on the placeholder open-sea shore; inland is west.
const SHORE = { latitude: 24.81, longitude: 51.495 };
const M_PER_DEG_LON = 111_195 * Math.cos((24.81 * Math.PI) / 180);
const inland = (m: number) => ({ ...SHORE, longitude: SHORE.longitude - m / M_PER_DEG_LON, accuracy: 5 });

test.describe("live GPS (mocked)", () => {
  test.use({ permissions: ["geolocation"] });

  test("10 m from the water: red overlay, siren, then acknowledge", async ({ page, context }) => {
    await context.setGeolocation(inland(10));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();

    const overlay = page.getByTestId("danger-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-siren", "on");
    await expect(overlay).toContainText("Move inland");
    await expect(overlay).toContainText("ابتعد عن الشاطئ");

    await overlay.getByRole("button", { name: /Acknowledge/ }).click();
    const banner = page.getByTestId("danger-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-siren", "off");
    await expect(page.getByTestId("status-panel")).toHaveAttribute("data-state", "DANGER");
  });

  test("500 m inland: SAFE with distance and inland arrow", async ({ page, context }) => {
    await context.setGeolocation(inland(500));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    const panel = page.getByTestId("status-panel");
    await expect(panel).toHaveAttribute("data-state", "SAFE");
    // 500 m due west; the shore runs at an angle, so the perpendicular distance is a bit less.
    await expect(page.getByTestId("distance")).toHaveText(/^4[6-9]\d m$/);
    await expect(page.getByTestId("inland-arrow")).toBeVisible();
    await expect(page.getByTestId("danger-overlay")).toHaveCount(0);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Start monitoring" })).toBeVisible();
  });

  test("Doha: OUT_OF_AREA", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 25.29, longitude: 51.53, accuracy: 5 });
    await page.goto("/ar/");
    await page.getByRole("button", { name: "ابدأ المراقبة" }).click();
    await expect(page.getByTestId("status-panel")).toHaveAttribute("data-state", "OUT_OF_AREA");
  });
});

test("simulated drive reaches DANGER and the map keeps tracking", async ({ page }) => {
  await page.clock.install();
  await page.goto("/en/");
  await page.getByRole("button", { name: "Simulate a drive" }).click();
  const panel = page.getByTestId("status-panel");
  await expect(panel).toHaveAttribute("data-state", "SAFE");

  const seen = new Set<string>();
  for (let i = 0; i < 60 && !seen.has("DANGER"); i++) {
    await page.clock.runFor(1000);
    const overlay = await page.getByTestId("danger-overlay").count();
    seen.add(overlay ? "DANGER" : ((await panel.getAttribute("data-state")) ?? ""));
  }
  expect(seen).toContain("CAUTION");
  expect(seen).toContain("DANGER");

  await page.getByTestId("danger-overlay").getByRole("button", { name: /Acknowledge/ }).click();
  await page.getByRole("link", { name: "Map" }).click();
  await expect(page).toHaveURL(/\/en\/map\/$/);
  await expect(page.locator("[data-testid=map] canvas")).toBeVisible();
  // Monitoring survived the navigation.
  await expect(page.getByTestId("danger-banner")).toBeVisible();
});
