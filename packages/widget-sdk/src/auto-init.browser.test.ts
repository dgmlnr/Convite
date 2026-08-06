import { describe, expect, it } from "vitest";

describe("auto-init (the module a bundler wraps into the classic-script IIFE)", () => {
  it("calls bootstrap() as a side effect of being loaded, without throwing", async () => {
    // Same disclosed constraint as bootstrap.browser.test.ts: in THIS test
    // environment (an ES module) document.currentScript is null by spec, so
    // bootstrap() safely no-ops. The real classic-script harness that proves
    // the auto-init path against a genuine <script> tag is the IIFE build
    // itself, exercised via the hostile-host demo page and the manual
    // end-to-end verification (see apply-progress), not this unit test.
    expect(document.currentScript).toBeNull();
    const iframeCountBefore = document.querySelectorAll("iframe").length;

    await expect(import("./auto-init.js")).resolves.toBeDefined();

    expect(document.querySelectorAll("iframe").length).toBe(iframeCountBefore);
  });
});
