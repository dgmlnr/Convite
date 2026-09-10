import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * NO BACKTICK EVER APPEARS INSIDE A CSS TEMPLATE LITERAL.
 *
 * Every stylesheet in this repo is a template literal authored by hand, and a
 * backtick inside one ENDS it. What follows is then parsed as TypeScript,
 * which it is not, and the file stops compiling.
 *
 * THE REASON THIS EXISTS IS THE SYMPTOM, not the mistake. The mistake is easy
 * and almost always the same: writing `--gx-color-surface` in a comment,
 * quoting an identifier the way one does in prose. The symptom is
 * "Failed to import test file" on twenty unrelated tests at once, with no
 * mention of the file that broke and no mention of a backtick — so the time
 * goes on the tests that are fine. It happened SEVEN times in one sitting
 * before this test was written, which is the entire argument for it.
 *
 * READ AS TEXT, NEVER IMPORTED, and that is load-bearing: a file with this
 * defect cannot be imported, so any check that imports it dies with the same
 * useless error instead of reporting the real one. `fs` is what can still see
 * a broken file.
 *
 * ────────────────────────────────────────────────────────────────────────
 *
 * THE STYLESHEETS ARE DISCOVERED, NEVER LISTED, and the cost of the list it
 * replaces is measured rather than argued. This file was born on 2026-08-26
 * (`72ff9a4`) naming two stylesheets by hand. Twenty-one exist today, and
 * NINETEEN OF THEM WERE WRITTEN AFTER THAT DAY — the escoba felt, the
 * generala planilla and tray, the solitaire board, the dice cup, the turn
 * clock, the bot's notice. Not one was added to the list. So the hand-typed
 * list did not decay slowly: it covered 100% of the repository on the day it
 * was written and 9% ten working days later, and every single sheet it missed
 * was a sheet whose author had this file open in the same suite.
 *
 * That is the same enumerating-config defect `stylesheet-tokens.test.ts` next
 * door names by pointing AT THIS FILE ("covered two files out of eleven"), and
 * the same one `ci-suite-coverage.test.ts` closes for suite configs. The walk,
 * the workspace-root guard and the comment stripper below are borrowed from
 * that neighbour whole, deliberately — a third dialect of the same scan would
 * be a third thing to get wrong.
 *
 * A DISCOVERING FENCE HAS ITS OWN FAILURE MODE, AND IT IS WORSE THAN THE
 * LIST'S: a walk that stops matching anything passes in green while watching
 * nothing, which is a lie the list could never tell. Everything under
 * "the scan reaches what it is written to reach" is the floor under that —
 * a count that cannot fall below what is known to exist, named anchors for
 * the sheets the list missed, and a per-sheet assertion that the literal was
 * actually FOUND rather than silently read as empty.
 *
 * WHY IT LIVES IN `apps/widget-app`: same reason as its neighbour. This is
 * the composition root that assembles every game's UI, so it is the one place
 * that may legitimately know about all of them at once. The scan reads files
 * as TEXT and imports nothing from them, so it creates no dependency edge and
 * needs no build.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The two directories every workspace package lives under. Not taken on
 * trust: the first guard below reads `pnpm-workspace.yaml` and fails if it
 * ever declares a root outside them, which is how a new tree gets scanned
 * instead of silently skipped. */
const WORKSPACE_ROOTS = ["packages", "apps"] as const;

const repoRelative = (fullPath: string): string => relative(REPO_ROOT, fullPath).split(sep).join("/");

/** The `packages:` list out of `pnpm-workspace.yaml`, without a YAML parser:
 * the entries are one-line sequence items and the block ends at the next
 * top-level key. */
function workspaceGlobs(): readonly string[] {
  const lines = readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("packages:"));
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const item = /^\s*-\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (item !== null) globs.push(item[1]!);
  }
  return globs;
}

/** Every production module under the workspace roots. `.tsx` is in here for
 * one file — `apps/admin/src/ui/main.tsx` installs a `<style>` element and is
 * therefore something this fence has to have an opinion about, even though
 * the opinion turns out to be "not a hand-written literal". A scan that could
 * not see it would have taken that decision by accident. */
function productionSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith("dist")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test-support.ts")) found.push(repoRelative(full));
    }
  };
  for (const root of WORKSPACE_ROOTS) walk(join(REPO_ROOT, root));
  return found.sort();
}

const sourceOf = (file: string): string => readFileSync(join(REPO_ROOT, file), "utf8");

/**
 * COMMENTS COME OUT FIRST, and here that is not a nicety. Fourteen of these
 * stylesheets document their own idempotence guard with the words
 * "never duplicates the `<style>` tag" — so a scan looking for `<style>` in
 * raw source would find prose in half the repository and the set would stop
 * meaning anything. Copied from `stylesheet-tokens.test.ts`, including the
 * reason a line comment must be preceded by whitespace: it is what spares a
 * URL.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/**
 * WHAT MAKES A MODULE THIS FENCE'S BUSINESS: it puts CSS into a document.
 *
 * DELIBERATELY NOT "it exports a `build*Stylesheet`", which is what all
 * twenty of the builder-shaped ones happen to be called today. Matching the
 * naming convention would mean the fence covers exactly the sheets whose
 * author already followed the convention — and the sheet that breaks this
 * repo is by definition the one whose author was not thinking about this
 * repo's conventions. Installing CSS is what a stylesheet cannot avoid doing,
 * so that is what is asked.
 *
 * It admits `embed-shell.ts`, which is not a builder at all: a whole HTML
 * document with one inlined fallback rule. Admitting it is the point rather
 * than an accident — a stray backtick breaks it in exactly the same silent
 * way, and it was invisible to every shape-based predicate tried before this
 * one.
 */
function installsCss(source: string): boolean {
  return /createElement\(\s*["'`]style["'`]\s*\)/.test(source) || /<style[\s>]/.test(source);
}

/**
 * The modules that install CSS but hold no hand-written literal for a
 * backtick to close. A RECORD RATHER THAN A LIST because the reason is the
 * point: this is a decision, and `ci-suite-coverage.test.ts` makes the same
 * distinction — the set of things needing a verdict is discovered, the
 * verdicts are necessarily written by hand. The guard below reds if an entry
 * here stops installing CSS at all, so a stale exemption cannot quietly
 * excuse a file that has since become a real stylesheet.
 */
const NO_HAND_WRITTEN_LITERAL: Readonly<Record<string, string>> = {
  "apps/admin/src/ui/main.tsx":
    "its CSS is generated, not authored: `themeTokensToCss()` builds the whole `<style>` body out of `DEFAULT_THEME_TOKENS` in widget-protocol, so there is no template literal here and nothing a backtick could end early.",
};

const CSS_INSTALLERS = productionSources().filter((file) => installsCss(stripComments(sourceOf(file))));
const STYLESHEETS = CSS_INSTALLERS.filter((file) => !(file in NO_HAND_WRITTEN_LITERAL));

/**
 * THE FLOOR UNDER THE WALK, and the one number in this file that is typed by
 * hand on purpose.
 *
 * A discovering fence's whole failure mode is finding nothing and saying so
 * in green. `toBeGreaterThan(0)` would not have caught the case that actually
 * threatens this one — a predicate that still matches the two oldest sheets
 * and quietly stops matching the nineteen newer ones is exactly the shape of
 * the bug being fixed here, and it is not zero.
 *
 * GREATER-OR-EQUAL, never equal: a new stylesheet must not have to touch this
 * file, which is the entire reason the list was deleted. A DELETED stylesheet
 * does have to, and that is intended — deleting a sheet is a deliberate act,
 * and lowering this number by hand is how the fence is told the loss was
 * meant.
 */
const STYLESHEETS_KNOWN_TO_EXIST = 21;

/** The CSS body: from the template that opens a stylesheet to the backtick
 * that closes it.
 *
 * THE CLOSING ANCHOR IS A LINE-START BACKTICK, generalized from the literal
 * `` `.trim(); `` an earlier version looked for. That older anchor is why the
 * fence could not have covered these files even if somebody had listed them:
 * exactly two of the twenty-one close that way and the other nineteen close
 * with a bare `` `; ``, so nineteen of them would have extracted an empty
 * body and every rule below would have run on nothing. Line-start is what
 * keeps it unambiguous — an escaped backtick in prose is preceded by its
 * backslash, and the stray one this file hunts sits mid-line inside a
 * comment. The `body.length` guard is the fence for the anchor itself.
 *
 * Comments elsewhere in the file may say whatever they like — only this span
 * is inside the literal, which matters more than it sounds: fourteen of these
 * modules write a backtick in the docblock that FOLLOWS the literal, so an
 * anchor reaching to the last backtick in the file would red on every one of
 * them. */
function cssBody(source: string): string {
  const open = source.indexOf("return `");
  if (open < 0) return "";
  const rest = source.slice(open + "return `".length);
  const close = /\n`(?:\.trim\(\))?;/.exec(rest);
  return close === null ? "" : rest.slice(0, close.index + 1);
}

/**
 * The literal's body as CSS: escapes resolved and `${…}` interpolations
 * removed.
 *
 * BOTH REMOVALS WERE BOUGHT BY A FALSE RED. An escaped backtick is legal
 * prose inside the literal and this repo writes 518 of them — `board-styles.ts`
 * alone names `\`size\`` and `\`<img>\`` in its own comments — so a scan for a
 * bare "`" would have reported the defect in fourteen healthy files. And an
 * interpolation may legally contain a NESTED template: `dice-styles.ts` and
 * the solitaire's `board-styles.ts` both spread their theme defaults with
 * ``.map(([token, value]) => `${token}: ${value};`)``, whose two backticks are
 * real, unescaped, and correct.
 *
 * The interpolation is skipped by MATCHING ITS BRACE rather than by
 * `/\$\{[^}]*\}/`, which is what that older expression could not do: it
 * stopped at the first `}` — the one closing the nested `${token}` — and left
 * the tail of the expression behind as CSS, which is why those same two files
 * came out with an unbalanced brace count.
 */
function cssText(body: string): string {
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;
    if (character === "\\") {
      // The escaped character survives, except a backtick: `\`` is prose and
      // must not be able to look like the defect this file exists for.
      const escaped = body[index + 1];
      if (escaped !== undefined && escaped !== "`") out += escaped;
      index += 1;
      continue;
    }
    if (character === "$" && body[index + 1] === "{") {
      let depth = 1;
      index += 2;
      while (index < body.length && depth > 0) {
        if (body[index] === "\\") {
          index += 2;
          continue;
        }
        if (body[index] === "{") depth += 1;
        else if (body[index] === "}") depth -= 1;
        index += 1;
      }
      index -= 1;
      continue;
    }
    out += character;
  }
  return out;
}

/** Where the stylesheet ends early, or -1. */
const strayBacktick = (css: string): number => css.indexOf("`");

/** Net braces. Anything but 0 is a block that never closes — or one closed
 * twice. */
function braceBalance(css: string): number {
  let clean = 0;
  for (const character of css) {
    if (character === "{") clean += 1;
    if (character === "}") clean -= 1;
  }
  return clean;
}

/** Read once. `truco-ui`'s felt alone is 204 KB of CSS, and every rule below
 * wants the same text. */
const CSS = new Map(STYLESHEETS.map((file) => [file, cssText(cssBody(sourceOf(file)))] as const));
const cssOf = (file: string): string => CSS.get(file)!;

describe("the scan reaches what it is written to reach", () => {
  it("walks every workspace root pnpm-workspace.yaml declares", () => {
    // The whole fence is vacuous if a tree is not walked, and the way a tree
    // stops being walked is somebody adding one to the workspace.
    const globs = workspaceGlobs();
    expect(globs.length, "fence setup: no packages: list was found in pnpm-workspace.yaml").toBeGreaterThan(0);
    expect(
      globs.filter((glob) => !WORKSPACE_ROOTS.some((root) => glob === root || glob.startsWith(`${root}/`))),
      "pnpm-workspace.yaml declares a root this scan does not walk — add it to WORKSPACE_ROOTS",
    ).toEqual([]);
  });

  it("finds at least as many stylesheets as are known to exist", () => {
    expect(
      STYLESHEETS.length,
      `the walk found ${String(STYLESHEETS.length)} stylesheets and ${String(STYLESHEETS_KNOWN_TO_EXIST)} are known to exist. Either the predicate stopped matching — in which case this fence is now guarding nothing — or a stylesheet was deliberately deleted, in which case lower STYLESHEETS_KNOWN_TO_EXIST and say which.`,
    ).toBeGreaterThanOrEqual(STYLESHEETS_KNOWN_TO_EXIST);
  });

  it("finds the sheets the hand-written list left uncovered", () => {
    // Sized against the defect rather than against the collection. These four
    // are the ones the previous version of this file did NOT name, chosen
    // because each reaches the walk by a different road: two more games, one
    // module whose name does not end in `-styles`, and one that is not a
    // stylesheet builder at all. The two the old list DID name are below, so
    // a predicate that narrowed to "what it used to cover" still reds.
    expect(STYLESHEETS).toContain("packages/games/generala-ui/src/turn-clock-styles.ts");
    expect(STYLESHEETS).toContain("packages/dice-ui/src/dice-styles.ts");
    expect(STYLESHEETS).toContain("packages/games/mahjong-solitaire-ui/src/elapsed-readout.ts");
    expect(STYLESHEETS).toContain("packages/widget-frontdoor/src/embed-shell.ts");
    expect(STYLESHEETS).toContain("apps/widget-app/src/chrome-styles.ts");
    expect(STYLESHEETS).toContain("packages/games/truco-ui/src/table-styles.ts");
  });

  it("keeps no exemption for a module that no longer installs CSS", () => {
    // A written-down verdict is only worth what its subject is. An exemption
    // outliving the file it excused is how a hand-written list rots, and this
    // file has one of those by necessity — so it gets the guard the list it
    // replaced never had.
    expect(
      Object.keys(NO_HAND_WRITTEN_LITERAL).filter((file) => !CSS_INSTALLERS.includes(file)),
      "this module is exempted from the stylesheet fence but no longer installs CSS at all — drop the entry",
    ).toEqual([]);
  });

  it.each(STYLESHEETS)("%s yields a stylesheet body the rules can actually read", (file) => {
    // THE ONE THAT TURNS "DOES NOT FIT THE MOULD" FROM A SKIP INTO A RED, and
    // it is the reason the predicate above may be shape-blind. A module can
    // join the set by installing CSS and still fail to be parsed here; when
    // that happens the fence says so, by name, instead of counting it and
    // checking nothing. The escape hatch is NO_HAND_WRITTEN_LITERAL, which
    // costs a written reason.
    expect(cssOf(file).length, `fence setup: ${file} installs CSS but no stylesheet template was found in it to check`).toBeGreaterThan(0);
  });
});

describe("the CSS template literals stay closed", () => {
  it.each(STYLESHEETS)("%s contains no backtick inside its stylesheet", (file) => {
    const css = cssOf(file);
    const at = strayBacktick(css);
    const context = at < 0 ? "" : css.slice(Math.max(0, at - 70), at + 20).replace(/\n/g, "  ");
    expect(at, `a backtick closes the stylesheet early. Around it: …${context}…`).toBe(-1);
  });

  it.each(STYLESHEETS)("%s opens and closes every block", (file) => {
    // The other silent structural failure, and the one that cost a whole
    // afternoon: an unclosed brace swallows every rule after it without
    // throwing, warning, or breaking the rules above.
    expect(braceBalance(cssOf(file)), "an unclosed block is silently swallowing every rule after it").toBe(0);
  });
});

describe("each stylesheet can be put in the red", () => {
  // A FENCE THAT CANNOT FAIL IS NOT A FENCE, and with twenty-one sheets that
  // stops being a thing anybody can check by hand once. Both defects are
  // planted into each sheet's OWN text, at an anchor that sheet really has,
  // so "this file is covered" is asserted per file rather than assumed from
  // the fact that it appears in a list.
  //
  // Planted into the extracted CSS rather than onto the file on disk,
  // deliberately: the fence's other half — that the literal was found at all
  // — is asserted just above, on the real file. Doctoring the disk would
  // prove the same thing twice and could not run in CI.
  //
  // AND THAT CHOICE IS ALSO WHAT MAKES THE ANCHOR HONEST, which was learned
  // the other way round. A ladder that doctored the twenty-one files ON DISK
  // planted at their first `{` and came back GREEN on three of them —
  // `board-styles.ts`, `autoplay-notice-styles.ts`, `elapsed-readout.ts` —
  // for a reason that looks like a hole and is not: those three open with
  // `.${SOMETHING} {`, so their first `{` is the interpolation's, and the
  // fence is RIGHT to ignore a backtick in there. A control planted where the
  // rule does not look proves nothing about the rule. Here the interpolations
  // are already gone by construction, so the first `{` is always real CSS.
  // (Re-anchored on disk, all twenty-one red on both defects, by name.)

  it.each(STYLESHEETS)("%s reds on the exact mistake that keeps happening", (file) => {
    const css = cssOf(file);
    // The historical mistake, verbatim: an identifier quoted in a comment the
    // way one quotes it in prose. Every stylesheet has a `{`, so every one of
    // them has somewhere real to put it.
    const doctored = css.replace("{", "{ /* `--gx-color-surface` */");
    expect(doctored, "the doctoring changed nothing — this stylesheet has no brace to plant the defect after").not.toBe(css);
    expect(strayBacktick(doctored)).toBeGreaterThan(-1);
  });

  it.each(STYLESHEETS)("%s reds on a block that never closes", (file) => {
    const css = cssOf(file);
    const doctored = css.replace("}", "");
    expect(doctored, "the doctoring changed nothing — this stylesheet has no closing brace to remove").not.toBe(css);
    expect(braceBalance(doctored)).not.toBe(0);
  });
});

describe("no override overrides nothing", () => {
  // WHAT THIS ACTUALLY CAUGHT, and it was not what I went looking for. I
  // thought chrome-styles.ts held ~170 stray duplicated lines. It did not:
  // they were inside a real @container (min-width: 1024px) block, written
  // flush against the left margin, which is why they read as top-level copies
  // at a glance. Seven of its eight rules were their base rule word for word,
  // so the whole tier changed exactly one thing -- the content padding -- and
  // spent a hundred and fifteen lines saying nothing.
  //
  // Dead weight is the small half. The real cost is DRIFT: an override that
  // repeats its base wins on source order, so editing the base silently does
  // nothing. That is exactly how it was found, mid-way through changing the
  // lobby's deal animation.
  it.each(STYLESHEETS)("%s: every nested rule differs from the base rule it shadows", (file) => {
    const css = cssOf(file);
    // The CSS BODY, not the file: depth is counted in braces, and the
    // TypeScript function the literal lives in opens one of its own. A
    // first version counted from the top of the file and every top-level
    // rule came out one level deep, so nothing was ever recognised as a
    // base rule and the fence passed on everything.
    const declarations = (body: string): string =>
      body
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .sort()
        .join(";");

    // Depth 1 is a rule at the stylesheet's own top level. Anything deeper
    // is inside an @container or @media block.
    const base = new Map<string, string>();
    const pointless: string[] = [];
    let depth = 0;
    let selector: string | null = null;
    let selectorDepth = 0;
    let body = "";
    for (const line of css.split("\n")) {
      const opens = (line.match(/\{/g) ?? []).length;
      const closes = (line.match(/\}/g) ?? []).length;
      if (selector !== null && depth === selectorDepth) body += `${line}\n`;
      if (opens > 0 && selector === null && /^\s*[.#][^{]*\{\s*$/.test(line)) {
        selector = line.replace("{", "").trim();
        selectorDepth = depth + 1;
        body = "";
      }
      depth += opens - closes;
      if (selector !== null && depth < selectorDepth) {
        const key = selector;
        const decls = declarations(body);
        if (selectorDepth === 1) base.set(key, decls);
        else if (base.get(key) === decls && decls.length > 0) pointless.push(key);
        selector = null;
      }
    }

    expect(pointless, `these nested rules repeat their base rule word for word, so they change nothing`).toEqual([]);
  });
});
