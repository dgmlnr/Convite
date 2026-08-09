import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { attachConsoleGuard } from "./support/console-guard.js";
import { startSystem, type StartSystemOptions } from "./support/system.js";

/**
 * Real-browser proof of design §10's PRIMARY, server-delivered theming path
 * (the path this whole unit built: `TenantRecord.theme` -> sanitized at
 * `createStaticTenantRepository` construction -> returned in `/embed`'s
 * bootstrap payload -> applied by `widget-app`'s `main.ts` directly, with
 * ZERO loader involvement — the host fixture page below offers no
 * `data-theme-*` attribute at all, so nothing here goes through the
 * secondary/host-override path). Unit tests already prove the sanitizer and
 * the wire payload; this is the thing this project has repeatedly found only
 * a real browser catches (apply prompt) — theming either visibly applies to
 * the real rendered DOM or it does not, and a mocked DOM cannot tell the
 * difference between "applied" and "silently no-op'd."
 *
 * Each `it` below starts its OWN isolated system AND its OWN isolated
 * browser, torn down in a `finally` before the next `it` runs — not a
 * shared `beforeAll`/`afterAll` pair, since the host-fixture port is FIXED
 * for the whole harness run (`harness-info.ts`, written once by
 * `global-setup.ts`): two systems running concurrently would collide on
 * that same port. The two cases also need genuinely different tenant
 * configuration (themed vs. unthemed) at server-boot time.
 */
interface RenderedTheme {
  readonly primary: string;
  readonly radius: string;
}

async function withThemedSystem(options: StartSystemOptions, run: (rendered: RenderedTheme) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();
  const system = await startSystem(options);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const guard = attachConsoleGuard(page);

    await page.goto(system.hostOrigin, { waitUntil: "load" });
    await page.waitForSelector("iframe", { timeout: 15_000 });
    const table = page.frameLocator("iframe");
    // Proves the PRIMARY path specifically: this must already be true before
    // any match starts, before any human interaction at all — the theme
    // applies at boot, independent of the widget's own game-selection UI
    // ever rendering anything.
    await table.locator('[data-tier="easy"]').first().waitFor({ state: "visible", timeout: 15_000 });

    const primary = await table.locator("html").evaluate((el) => getComputedStyle(el).getPropertyValue("--gx-color-primary").trim());
    const radius = await table.locator("html").evaluate((el) => getComputedStyle(el).getPropertyValue("--gx-radius").trim());
    await run({ primary, radius });

    expect(guard.errors, `console/page errors during the run: ${guard.errors.join("; ")}`).toEqual([]);
    await context.close();
  } finally {
    await browser.close();
    await system.stop();
  }
}

describe("a themed tenant renders themed, end to end, through a real Chromium tab", () => {
  it(
    "applies the tenant's configured brand token as a real CSS custom property on the iframe's own document root",
    async () => {
      await withThemedSystem({ tenantTheme: { "--gx-color-primary": "#ff3366", "--gx-radius": "12px" } }, async (rendered) => {
        expect(rendered.primary).toBe("#ff3366");
        expect(rendered.radius).toBe("12px");
      });
    },
    45_000,
  );

  it(
    "a tenant with no theme configured renders with no theme token set at all — theming is optional, this is today's unchanged path",
    async () => {
      // no tenantTheme — the exact config every other e2e spec already runs against
      await withThemedSystem({}, async (rendered) => {
        expect(rendered.primary).toBe("");
      });
    },
    45_000,
  );
});
