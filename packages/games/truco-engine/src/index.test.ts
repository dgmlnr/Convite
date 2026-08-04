import { describe, expect, it } from "vitest";
import { engineVersion } from "./index.js";

describe("truco-engine scaffold", () => {
  it("exposes a version placeholder, proving the node project runs this package", () => {
    expect(engineVersion).toBe("0.0.0-scaffold");
  });
});
