import { describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";

describe("bootstrap", () => {
  it("no-ops without throwing and mounts nothing when document.currentScript is not a classic <script> tag", () => {
    // In this test environment (an ES module loaded by Vitest's browser
    // runner) document.currentScript is always null — the same as it would
    // be for ANY ES module, per spec. This is the one behavior bootstrap()
    // can safely prove here; see bootstrap.ts's own doc comment for the
    // disclosed limitation this points at.
    expect(document.currentScript).toBeNull();
    const iframeCountBefore = document.querySelectorAll("iframe").length;

    expect(() => bootstrap()).not.toThrow();

    expect(document.querySelectorAll("iframe").length).toBe(iframeCountBefore);
  });
});
