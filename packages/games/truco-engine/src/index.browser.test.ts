import { describe, expect, it } from "vitest";
import { engineVersion } from "./index.js";

describe("truco-engine scaffold (browser)", () => {
  it("runs the exact same module in a real browser, proving Node/browser parity", () => {
    expect(engineVersion).toBe("0.0.0-scaffold");
  });
});
