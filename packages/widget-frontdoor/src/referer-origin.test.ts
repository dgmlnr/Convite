import { describe, expect, it } from "vitest";
import { refererOrigin } from "./referer-origin.js";

describe("refererOrigin (real-browser discovery: GET navigations never send an Origin header, only Referer does)", () => {
  it("extracts the scheme+host+port origin from a full referer URL, dropping the path", () => {
    expect(refererOrigin("https://tenant.example/nota/truco-en-la-redaccion")).toBe("https://tenant.example");
  });

  it("preserves a non-default port", () => {
    expect(refererOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
  });

  it("returns undefined for a missing referer", () => {
    expect(refererOrigin(undefined)).toBeUndefined();
  });

  it("returns undefined for a malformed referer rather than throwing", () => {
    expect(refererOrigin("not a url")).toBeUndefined();
  });
});
