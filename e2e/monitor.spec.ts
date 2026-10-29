import { expect, test } from "@playwright/test";

// Inland is roughly west here (the coast runs NNE).
const SHORE = { latitude: 24.810126, longitude: 51.491547 }; // vertex of the shipped OSM shoreline
const M_PER_DEG_LON = 111_195 * Math.cos((24.810126 * Math.PI) / 180);
const inland = (m: number) => ({ ...SHORE, longitude: SHORE.longitude - m / M_PER_DEG_LON, accuracy: 5 });

test.describe("live GPS (mocked)", () => {
  test.use({ permissions: ["geolocation"] });

  test("10 m from the water: red overlay, siren, then acknowledge", async ({ page, context }) => {
    await context.setGeolocation(inland(10));
    await page.goto("/en/monitor/");
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
    await page.goto("/en/monitor/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    const panel = page.getByTestId("status-panel");
    await expect(panel).toHaveAttribute("data-state", "SAFE");
    // 500 m due west; the shore runs at an angle, so the perpendicular distance is a bit less.
    await expect(page.getByTestId("distance")).toHaveText(/^4\d\d m$/);
    await expect(page.getByTestId("inland-arrow")).toBeVisible();
    await expect(page.getByTestId("danger-overlay")).toHaveCount(0);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Start monitoring" })).toBeVisible();
  });

  test("monitoring from the map: status card, follow on, slim controls", async ({ page, context }) => {
    await context.setGeolocation(inland(500));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    const card = page.getByTestId("map-status");
    await expect(card).toHaveAttribute("data-state", "SAFE");
    await expect(page.getByTestId("map-distance")).toHaveText(/^4\d\d m$/);
    await expect(card.getByTestId("inland-arrow")).toBeVisible();
    await expect(page.getByRole("button", { name: "Follow me" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Regulated area")).toHaveCount(0);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(card).toHaveCount(0);
    // Legend and satellite switch live in the Layers sheet.
    await page.getByRole("button", { name: "Map layers" }).click();
    await expect(page.getByText("Regulated area")).toBeVisible();
    await expect(page.getByLabel("Satellite (online)")).toBeChecked();
  });

  test("Doha: OUT_OF_AREA", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 25.29, longitude: 51.53, accuracy: 5 });
    await page.goto("/ar/monitor/");
    await page.getByRole("button", { name: "ابدأ المراقبة" }).click();
    await expect(page.getByTestId("status-panel")).toHaveAttribute("data-state", "OUT_OF_AREA");
  });
});

test("simulated drive reaches DANGER and the map keeps tracking", async ({ page }) => {
  await page.clock.install();
  await page.goto("/en/monitor/");
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
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator("[data-testid=map] canvas")).toBeVisible();
  // Monitoring survived the navigation.
  await expect(page.getByTestId("danger-banner")).toBeVisible();
});

test.describe("go to a marked place", () => {
  test.use({ permissions: ["geolocation"] });

  test("right-click marks a destination; distance and clear work", async ({ page, context }) => {
    await context.setGeolocation(inland(500));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    await expect(page.getByTestId("map-status")).toHaveAttribute("data-state", "SAFE");

    const map = page.locator("[data-testid=map] canvas");
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4, { button: "right" });
    await expect(page.getByTestId("goto-card")).toBeVisible();
    await expect(page.getByTestId("goto-distance")).toHaveText(/^\d+(\.\d)? (m|km)$/);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByTestId("goto-card")).toHaveCount(0);
  });

  test("warns when the straight path passes inside the shore band", async ({ page, context }) => {
    await context.setGeolocation(inland(500));
    // Destination 15 m from the water, 200 m further north.
    const dest = inland(15);
    await page.addInitScript(
      ([lon, lat]) => localStorage.setItem("sg-destination", JSON.stringify([lon, lat])),
      [dest.longitude, dest.latitude + 200 / 111_195],
    );
    await page.goto("/en/");
    await expect(page.getByTestId("goto-card")).toContainText("Start monitoring to see distance");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    await expect(page.getByTestId("goto-card").getByRole("alert")).toContainText("within 40 m of the shoreline");
  });
});

test.describe("stationary phone", () => {
  test.use({ permissions: ["geolocation"] });

  test("parked inside the band stays DANGER (no stale fall-back to NO_FIX)", async ({ page, context }) => {
    test.setTimeout(40_000);
    await context.setGeolocation(inland(10));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    await page.getByTestId("danger-overlay").getByRole("button", { name: /Acknowledge/ }).click();
    // Longer than maxFixAgeMs (10 s) with no movement at all.
    await page.waitForTimeout(14_000);
    await expect(page.getByTestId("map-status")).toHaveAttribute("data-state", "DANGER");
  });
});

test.describe("stationary phone, far from the water", () => {
  test.use({ permissions: ["geolocation"] });

  test("a stale SAFE still falls back to NO_FIX", async ({ page, context }) => {
    test.setTimeout(40_000);
    await context.setGeolocation(inland(500));
    await page.goto("/en/");
    await page.getByRole("button", { name: "Start monitoring" }).click();
    await expect(page.getByTestId("map-status")).toHaveAttribute("data-state", "SAFE");
    await page.waitForTimeout(14_000);
    await expect(page.getByTestId("map-status")).toHaveAttribute("data-state", "NO_FIX");
  });
});
