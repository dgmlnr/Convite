import { afterEach, describe, expect, it } from "vitest";
import { CHROME_STYLE_ID, ensureChromeStyles } from "./chrome-styles.js";

afterEach(() => {
  document.getElementById(CHROME_STYLE_ID)?.remove();
});

describe("ensureChromeStyles", () => {
  it("injects exactly one <style> element into <head>, even when called twice", () => {
    ensureChromeStyles(document);
    ensureChromeStyles(document);

    expect(document.head.querySelectorAll(`#${CHROME_STYLE_ID}`)).toHaveLength(1);
  });
});
