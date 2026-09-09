import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THIS PACKAGE ASKS FOR NO RANDOM NUMBER, AND UNTIL NOW THAT WAS A COMMENT.
 *
 * `index.ts` states it ("Nothing here calls `Math.random()` or decides which
 * face lands"), `dice.ts` states it again, and the whole design of the toss
 * rests on it: `generala-module` draws exactly `5 - kept.length` values
 * through the platform's one entropy door and that COUNT is the package's
 * integrity claim, measured by a `RandomSource` that counts calls. A drawing
 * layer that reached for a random number of its own would not break that
 * count — it would break the far worse thing the count exists to protect,
 * which is that the face was decided once, upstream, before anything moved.
 *
 * NOTHING CHECKED IT. Verified by looking: the eslint config fences
 * `Math.random` in every `*-engine` package and in the solitaire's deal path,
 * and reaches neither this package nor any other `*-ui`. So the claim was
 * three prose sentences and an honour system — and this is the change that
 * makes it most tempting to break, because a rattle is LITERALLY MADE OF
 * NOISE and `Math.random()` is the one-line way to get some. `dice-sound.ts`
 * computes a fixed waveform instead; this is what stops the next person from
 * not bothering.
 *
 * A SOURCE SCAN, DELIBERATELY, and `stylesheet-tokens.test.ts` gives the
 * general form of the argument: a rule about what code may CONSULT cannot be
 * checked by running it, because a forbidden call in an environment where
 * nothing observes the result produces no consequence to assert on. Its
 * comment stripper is borrowed whole, including why a line comment must be
 * preceded by whitespace — it is what spares a URL.
 *
 * TESTS ARE EXCLUDED, for the reason that file gives: a test naming a
 * forbidden call in a fixture is how these fences prove themselves, and a
 * scan that could not tell the two apart would forbid its own
 * counterexamples. The anti-vacuity case below is exactly such a fixture.
 */

const SRC = fileURLToPath(new URL(".", import.meta.url));

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function productionSources(): readonly { readonly name: string; readonly code: string }[] {
  return readdirSync(SRC, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts"))
    .map((entry) => ({ name: entry.name, code: stripComments(readFileSync(join(SRC, entry.name), "utf8")) }));
}

/**
 * Every way a browser hands a program a number nobody chose. `Math.random`
 * is the obvious one and the only one anybody would reach for by accident;
 * the other three are here because a scan that forbade only the obvious one
 * would be a fence somebody could step over without meaning to lie.
 */
const ENTROPY: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: "Math.random()", pattern: /\bMath\s*\.\s*random\b/ },
  { what: "crypto.getRandomValues()", pattern: /\bgetRandomValues\b/ },
  { what: "crypto.randomUUID()", pattern: /\brandomUUID\b/ },
  { what: "node:crypto", pattern: /["']node:crypto["']/ },
];

describe("dice-ui: no file in this package asks for a random number", () => {
  it("really is scanning this package's production source, so the cases below cannot pass vacuously", () => {
    const files = productionSources();
    expect(files.length, "expected a directory full of modules to scan").toBeGreaterThan(8);
    // The scan reads real code and not an empty string: every one of these
    // modules exports something.
    for (const file of files) expect(file.code, file.name).toContain("export");
  });

  it.each(ENTROPY)("names $what nowhere", ({ pattern }) => {
    const offenders = productionSources()
      .filter((file) => pattern.test(file.code))
      .map((file) => file.name);
    expect(offenders, "a die's face is decided upstream, once, before anything moves").toEqual([]);
  });

  /**
   * THE CONTROL THAT PROVES THE FENCE CAN CLOSE. Without this, every
   * assertion above would also pass against a scanner that matched nothing at
   * all — a broken regex, a directory walk that found no files, a comment
   * stripper that ate the whole program.
   */
  it.each(ENTROPY)("would catch $what if a module ever added one", ({ what, pattern }) => {
    const planted = stripComments(`export const x = 1;\n// a comment mentioning ${what} must not trip this\nconst y = ${what.startsWith("node:") ? 'import("node:crypto")' : what};\n`);
    expect(pattern.test(planted), `expected the ${what} scan to fire on a planted call`).toBe(true);
  });

  /**
   * AND THAT PROSE IS STILL ALLOWED TO NAME IT. Every one of these modules
   * argues about entropy in its own docblock — `index.ts` and `dice.ts` say
   * "Math.random" outright while explaining why it is absent — so a scan that
   * could not tell a docblock from a call would force the documentation to
   * stop naming what it forbids. That is not hypothetical here: two files
   * already do it.
   */
  it("reads declarations and not prose, which two shipped modules depend on", () => {
    const raw = productionSources();
    expect(raw.length).toBeGreaterThan(0);
    const mentionedInProse = readdirSync(SRC)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .filter((name) => /\bMath\s*\.\s*random\b/.test(readFileSync(join(SRC, name), "utf8")));
    expect(mentionedInProse.length, "expected at least one module to discuss Math.random in prose").toBeGreaterThan(0);
  });
});
