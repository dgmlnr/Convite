import { describe, expect, it } from "vitest";
import { parseTargetOrigin } from "./target-origin.js";

describe("parseTargetOrigin", () => {
  it("accepts a well-formed https origin with no path", () => {
    const origin = parseTargetOrigin("https://tenant.example");

    expect(origin).toBe("https://tenant.example");
  });

  it("accepts a well-formed origin carrying a port", () => {
    const origin = parseTargetOrigin("http://localhost:5173");

    expect(origin).toBe("http://localhost:5173");
  });

  it("throws for the wildcard '*' — this is the structural ban", () => {
    expect(() => parseTargetOrigin("*")).toThrow(/targetOrigin "\*" is banned/);
  });

  it("throws for an origin carrying a path, which is not a valid origin", () => {
    expect(() => parseTargetOrigin("https://tenant.example/embed")).toThrow(/not a valid origin/);
  });

  it("throws for an empty string", () => {
    expect(() => parseTargetOrigin("")).toThrow(/not a valid origin/);
  });
});
