import { describe, expect, it } from "vitest";
import { createMentirosoTableRenderer as directCreateMentirosoTableRenderer } from "./table.js";
import { createMentirosoTableRenderer } from "./index.js";

/**
 * `mentiroso-ui`'s public barrel (SDD `mentiroso`, task 6.1) — this
 * package's first public export surface. `mentiroso-bot` was in the exact
 * same position (`tier.ts`'s own docblock: "not this unit's job... once
 * mentiroso-bot gets its own index.ts barrel"); this is the same genuine
 * task-order gap on the UI side, closed the moment `apps/widget-app` needs
 * to import the real table renderer through the package's own declared
 * `exports` field (`package.json`), never a deep relative path into `src/`.
 */
describe("index.ts — the package's own public export surface", () => {
  it("re-exports the real createMentirosoTableRenderer, by reference, not a copy", () => {
    // IDENTITY, not merely "a function that behaves the same" — the same
    // proof `mentirosoHiddenState`'s own barrel test uses one package over
    // (mentiroso-module/src/index.test.ts): a barrel that re-implemented
    // rather than re-exported would still satisfy a behavioral test.
    expect(createMentirosoTableRenderer).toBe(directCreateMentirosoTableRenderer);
  });
});
