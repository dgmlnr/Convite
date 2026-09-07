import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveDiceAsset } from "./static-dice-assets.js";

/**
 * THE SECOND OF THE TWO INDEPENDENT LAYERS behind this route, and the only
 * one that holds any vocabulary.
 *
 * `resolveRoute` already refuses `""`, `/`, `\`, `..` and `%2f` before a
 * route object exists, and it refuses them by SHAPE — it does not know a die
 * has six faces any more than it knows the wall has forty-two drawings. This
 * accepts ONLY membership in a Set derived from `dice-ui`'s own `DIE_FACES`,
 * so nothing outside the seven can reach `readFile` even if the first layer
 * were removed. Failure is a 404 with no path in the body, never an error
 * naming a directory.
 *
 * THE FILENAMES ARE WRITTEN OUT HERE, not imported from the set the
 * production code reads. A test that derives its expectations from the same
 * source as the code under test agrees with it by construction and cannot
 * notice the source being wrong — `art.test.ts` makes the same call for the
 * same reason.
 */
describe("serveDiceAsset (the widget-app bundle resolves dice art at runtime from its OWN served location — /assets/dice/<name>.webp — never bundled inline)", () => {
  let assetsDir: string;

  beforeEach(() => {
    assetsDir = mkdtempSync(join(tmpdir(), "dice-assets-"));
  });

  afterEach(() => {
    rmSync(assetsDir, { recursive: true, force: true });
  });

  it("serves a real die face with a webp content-type", async () => {
    writeFileSync(join(assetsDir, "3.webp"), Buffer.from([1, 2, 3]));
    const result = await serveDiceAsset(assetsDir, "3.webp");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/webp");
    expect(result.body).toEqual(Buffer.from([1, 2, 3]));
  });

  it("serves every one of the six faces, both ends of the range included", async () => {
    for (const filename of ["1.webp", "2.webp", "3.webp", "4.webp", "5.webp", "6.webp"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([7]));
      const result = await serveDiceAsset(assetsDir, filename);
      expect(result.status, filename).toBe(200);
    }
  });

  /**
   * THE ONE ALLOWED NON-FACE, and the reason this route needed no exact-path
   * companion: the cup moved into `assets/dice/` so one prefix, one directory
   * and one membership check answer for everything the package ships.
   */
  it("serves the cup, which is the only name here that is not a face", async () => {
    writeFileSync(join(assetsDir, "cup.webp"), Buffer.from([4, 2]));
    const result = await serveDiceAsset(assetsDir, "cup.webp");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/webp");
  });

  /**
   * THE CASE A BARE `/\.webp$/` WOULD ACCEPT, and the case a hand-typed set
   * would get wrong the day the die changes. A regex over the extension is
   * the shape the deck route's neighbour reaches for, and it cannot be proven
   * sound — only complete. A Set derived from `DIE_FACES` answers this one
   * correctly without anybody having to think about it.
   */
  it("refuses a seventh face even when it really is on disk", async () => {
    for (const filename of ["7.webp", "0.webp"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([9]));
      expect((await serveDiceAsset(assetsDir, filename)).status, filename).toBe(404);
    }
  });

  /**
   * EVERY REFUSAL CASE PUTS THE FILE ON DISK FIRST, and that is not padding.
   * A name this route rejects would 404 anyway when `readFile` fails, so a
   * refusal asserted against a MISSING file passes for the wrong reason and
   * cannot tell a real filter from no filter at all — the measurement
   * `static-tile-assets.test.ts` recorded on its own first draft.
   */
  it("refuses a plausible-looking name that is not one of the seven, even sitting right there", async () => {
    for (const filename of ["dice.webp", "cup-2.webp", "01.webp", "1.0.webp"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([9]));
      expect((await serveDiceAsset(assetsDir, filename)).status, filename).toBe(404);
    }
  });

  it("refuses a real name under any other extension, even sitting right there", async () => {
    for (const filename of ["1.svg", "1", "cup.png", "cup"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([9]));
      expect((await serveDiceAsset(assetsDir, filename)).status, filename).toBe(404);
    }
  });

  /**
   * The escape target is REAL and READABLE, and that is what stops this case
   * passing for the wrong reason: `join(assetsDir, "../dice-secret.txt")`
   * resolves to a file that exists, so with NO filter at all the route would
   * answer 200 with its contents. The 404 is a refusal, not a failed read.
   *
   * It does NOT measure the ordering, and the first draft of this docstring
   * claimed it did. Measured: with the membership check moved to after a
   * successful `readFile`, this case stays green — the bytes are read and
   * then thrown away, which is a worse implementation returning the same
   * answer. The case below is the one that separates those two.
   */
  it("refuses a traversal before ever touching the filesystem", async () => {
    writeFileSync(join(assetsDir, "..", "dice-secret.txt"), "should never be served");
    expect((await serveDiceAsset(assetsDir, "../dice-secret.txt")).status).toBe(404);
    expect((await serveDiceAsset(assetsDir, "../../etc/passwd")).status).toBe(404);
    rmSync(join(assetsDir, "..", "dice-secret.txt"));
  });

  /**
   * WHICH REFUSAL IT IS, because "membership before the filesystem is
   * touched" is otherwise a claim no assertion in this file reaches. Both
   * refusals answer 404, so the STATUS cannot separate them; the body can.
   * Measured: moving the membership check to after a successful `readFile` —
   * the natural way to get the ordering wrong — left every other case here
   * green, traversal included, because that escape target really is readable
   * and the check still catches it on the way out.
   *
   * `9.webp` is neither one of the seven nor on disk. Decided on membership
   * it reads "not a real dice asset"; decided by the filesystem it would read
   * "dice asset not found", which is the honest answer for a name that IS one
   * of the seven and is merely missing — the second half below.
   *
   * This pins two body strings, and that is the price of measuring an
   * ordering rather than asserting it in a comment.
   */
  it("refuses on membership rather than on a failed read, and says which", async () => {
    const refused = await serveDiceAsset(assetsDir, "9.webp");
    expect(refused.status).toBe(404);
    expect(String(refused.body)).toBe("not a real dice asset");

    const missing = await serveDiceAsset(assetsDir, "2.webp");
    expect(missing.status).toBe(404);
    expect(String(missing.body)).toBe("dice asset not found");
  });

  it("refuses an empty name", async () => {
    expect((await serveDiceAsset(assetsDir, "")).status).toBe(404);
  });

  it("404s a real face whose file is missing, without naming the path it looked in", async () => {
    const result = await serveDiceAsset(assetsDir, "5.webp");
    expect(result.status).toBe(404);
    expect(String(result.body)).not.toContain(assetsDir);
  });
});
