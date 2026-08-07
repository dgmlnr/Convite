import { afterEach, describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

afterEach(() => {
  document.getElementById(TABLE_STYLE_ID)?.remove();
});

describe("ensureTableStyles", () => {
  it("injects exactly one <style> element into <head>, even when called twice", () => {
    ensureTableStyles(document);
    ensureTableStyles(document);

    expect(document.head.querySelectorAll(`#${TABLE_STYLE_ID}`)).toHaveLength(1);
  });
});
