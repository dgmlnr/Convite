import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WHICH CALL SITE SAYS WHAT — a SOURCE SCAN, and it is the only fence there
 * can be over this particular claim.
 *
 * `enterMatch` lives inside `main()`'s closure in the composition root. It is
 * not exported, nothing constructs it, and this repository's own record says
 * why that file has no unit test of its own: "there is no production LOGIC
 * here that isn't already covered where it lives". The mapping from a
 * provenance to a render context IS covered where it lives —
 * `matchRenderContextFor`, fenced in `game-ui-registry.test.ts`.
 *
 * WHAT IS COVERED NOWHERE ELSE is which of the three call sites passes which
 * literal, and that is the load-bearing fact of this whole feature: the
 * resume path is the one path whose elapsed time would be a lie. TypeScript
 * makes the argument REQUIRED and narrows it to exactly two strings; it
 * cannot make the resume site pick the right one of them. A behaviour test
 * cannot either — reaching that line needs a live websocket, a persisted
 * session and a page reload.
 *
 * So the fence reads the source, for the reason
 * `mahjong-solitaire-ui/no-measurement.test.ts` already writes out (R20): a
 * claim about what code SAYS is not observable by running it. And, exactly as
 * that file had to, every pattern here is proven against a source that trips
 * it — a scanner nobody has falsified reports "clean" forever.
 *
 * The scanner lives in this file rather than in a module beside `main.ts`,
 * following that same precedent: it has no runtime consumer, and a production
 * file nothing runs is the enumerating-config shape this repository already
 * refuses elsewhere.
 */

const MAIN_SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");

interface EnterMatchCallSite {
  /** The call, from `enterMatch(` to its matching close paren. */
  readonly text: string;
  /** The last argument when it is a plain string literal, `null` otherwise —
   * because "somebody passed a variable" is a different failure from
   * "somebody passed the wrong word", and the two deserve different reds. */
  readonly entry: string | null;
}

/**
 * The arguments of the call whose opening paren is at `openParen`, split at
 * the commas that are actually at argument depth.
 *
 * The bracket walk is not decoration: two of the three call sites pass an
 * arrow function whose own parentheses would otherwise close the call early,
 * and a naive `indexOf(")")` would read `(departure)` as the end of the
 * argument list. Quoted spans are skipped so a string containing a bracket
 * cannot move the depth either.
 */
function callArguments(source: string, openParen: number): { readonly args: readonly string[]; readonly end: number } | null {
  const args: string[] = [];
  let depth = 0;
  let start = openParen + 1;
  let quote: string | null = null;
  for (let index = openParen; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
      if (depth === 0) {
        args.push(source.slice(start, index));
        return { args, end: index };
      }
    } else if (character === "," && depth === 1) {
      args.push(source.slice(start, index));
      start = index + 1;
    }
  }
  return null;
}

/** Every place `enterMatch` is CALLED — the declaration is not one of them. */
function enterMatchCallSites(source: string): readonly EnterMatchCallSite[] {
  const sites: EnterMatchCallSite[] = [];
  const needle = "enterMatch(";
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
    if (source.slice(0, at).trimEnd().endsWith("function")) continue;
    const call = callArguments(source, at + needle.length - 1);
    if (call === null) continue;
    const last = call.args[call.args.length - 1]?.trim() ?? "";
    const literal = /^"([^"]*)"$/.exec(last);
    sites.push({ text: source.slice(at, call.end + 1), entry: literal === null ? null : literal[1]! });
  }
  return sites;
}

describe("the scanner can actually find a call site", () => {
  it("finds three of them in the real composition root", () => {
    // R6, and not decoration: every assertion below counts or iterates this
    // collection, and a scanner that found nothing would agree with all of
    // them.
    expect(enterMatchCallSites(MAIN_SOURCE)).toHaveLength(3);
  });

  it("and does not count the declaration as one of them", () => {
    expect(MAIN_SOURCE).toContain("function enterMatch(");
    expect(enterMatchCallSites(`function enterMatch(a, b, c, d) {}`)).toHaveLength(0);
  });

  it("and reads past an arrow function's own parentheses", () => {
    const site = enterMatchCallSites(`enterMatch(id, conn, (departure) => back(conn, departure), "joined");`);
    expect(site).toHaveLength(1);
    expect(site[0]!.entry).toBe("joined");
  });
});

describe("every call site declares where the match came from", () => {
  it("each one ends in one of the two literals, and nothing else", () => {
    for (const site of enterMatchCallSites(MAIN_SOURCE)) {
      expect(["joined", "resumed"], site.text).toContain(site.entry);
    }
  });

  it("two fresh joins and exactly one resume", () => {
    const entries = enterMatchCallSites(MAIN_SOURCE).map((site) => site.entry);
    expect(entries.filter((entry) => entry === "joined")).toHaveLength(2);
    expect(entries.filter((entry) => entry === "resumed")).toHaveLength(1);
  });

  it("and the resume is the one that resumes", () => {
    /**
     * THE ASSERTION THIS FILE EXISTS FOR. All three sites call the same
     * function, and — this is the part that makes the provenance unknowable
     * from inside it — all three have already called `persistMatchSession`
     * by the time they get there, so storage reports "a session exists" in
     * every case. What tells them apart is the connection each is holding:
     * the resume path's came out of `tryResumeSession`, and it is the only
     * one whose game id is read off the persisted session.
     */
    const resumed = enterMatchCallSites(MAIN_SOURCE).filter((site) => site.entry === "resumed");
    expect(resumed).toHaveLength(1);
    expect(resumed[0]!.text).toContain("pendingSession");
  });

  it("and neither fresh join mentions the persisted session", () => {
    for (const site of enterMatchCallSites(MAIN_SOURCE).filter((site) => site.entry === "joined")) {
      expect(site.text).not.toContain("pendingSession");
    }
  });
});

describe("and the word each call site says is actually SPENT", () => {
  /**
   * R17 IN ITS PUREST FORM, and this block exists because the mutation that
   * found the gap came back with ZERO REDS.
   *
   * Hardcoding `matchRenderContextFor("joined", Date.now)` one line below the
   * parameter — so that `entry` arrives, is required, is type-checked, and is
   * then thrown away — left EVERY fence above green. Proving that three call
   * sites say the right word says nothing whatsoever about the word being
   * read, and the discarded word here is the exact defect the whole feature
   * exists to prevent.
   *
   * "Counting how many times a resource is consumed never proves the consumed
   * value was used" — the same rule the deal path's entropy budget ran into,
   * arriving this time through a text scan instead of a call counter.
   */
  const BUILT_FROM_THE_PARAMETER = /createRenderer\(\s*matchRenderContextFor\(\s*entry\s*,/;

  it("the renderer is built from `entry`, not from a literal somebody typed twice", () => {
    expect(MAIN_SOURCE).toMatch(BUILT_FROM_THE_PARAMETER);
  });

  it("and a hardcoded provenance is caught", () => {
    const doctored = MAIN_SOURCE.replace("matchRenderContextFor(entry,", 'matchRenderContextFor("joined",');
    expect(doctored, "the doctoring has to land, or this proves nothing").not.toBe(MAIN_SOURCE);
    expect(doctored).not.toMatch(BUILT_FROM_THE_PARAMETER);
  });
});

describe("each pattern is proven against a source that trips it", () => {
  /**
   * R18, applied to a text scan: a fence that refuses something is worth
   * nothing until the refused thing exists. These are the refused things,
   * built here so that the assertions above are known to be CAPABLE of
   * failing rather than merely observed to pass.
   */
  it("a fourth call site is counted", () => {
    expect(enterMatchCallSites(`${MAIN_SOURCE}\nenterMatch(gameId, connection, onDepart, "joined");\n`)).toHaveLength(4);
  });

  /**
   * The doctoring goes through the scanner's OWN answer rather than through a
   * bare `MAIN_SOURCE.replace('"resumed"', ...)`, and that is not tidiness:
   * the first `"resumed"` in the file is inside a docblock explaining the
   * union, so a naive replace rewrites the prose and leaves the call site
   * exactly as it was — a counterexample that never lands, which is the very
   * failure R18 is about. Found by running it.
   */
  function withEntrySwappedAt(entry: string, replacement: string): string {
    const site = enterMatchCallSites(MAIN_SOURCE).find((candidate) => candidate.entry === entry);
    expect(site, `there has to be a "${entry}" call site to doctor`).not.toBeUndefined();
    const doctored = MAIN_SOURCE.replace(site!.text, site!.text.replace(`"${entry}"`, `"${replacement}"`));
    expect(doctored, "the doctoring has to land, or this proves nothing").not.toBe(MAIN_SOURCE);
    return doctored;
  }

  it("a resume that claims to be a fresh join is caught by the tally", () => {
    const entries = enterMatchCallSites(withEntrySwappedAt("resumed", "joined")).map((site) => site.entry);
    expect(entries.filter((entry) => entry === "resumed")).toHaveLength(0);
    expect(entries.filter((entry) => entry === "joined")).toHaveLength(3);
  });

  it("a fresh join that claims to be a resume is caught by the same tally", () => {
    const entries = enterMatchCallSites(withEntrySwappedAt("joined", "resumed")).map((site) => site.entry);
    expect(entries.filter((entry) => entry === "resumed")).toHaveLength(2);
    expect(entries.filter((entry) => entry === "joined")).toHaveLength(1);
  });

  it("an argument that is not a literal reports no entry at all", () => {
    const doctored = `${MAIN_SOURCE}\nenterMatch(gameId, connection, onDepart, whicheverItWas);\n`;
    expect(enterMatchCallSites(doctored).map((site) => site.entry)).toContain(null);
  });

  it("a resume no longer reading the persisted session stops matching", () => {
    // The `pendingSession` assertion's own counterexample, so that it is
    // about THIS source rather than about any source at all.
    const doctored = MAIN_SOURCE.replace("enterMatch(pendingSession.gameId as GameId", "enterMatch(gameId as GameId");
    expect(doctored).not.toBe(MAIN_SOURCE);
    const resumed = enterMatchCallSites(doctored).filter((site) => site.entry === "resumed");
    expect(resumed).toHaveLength(1);
    expect(resumed[0]!.text).not.toContain("pendingSession");
  });
});
