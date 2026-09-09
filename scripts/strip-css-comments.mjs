/**
 * Keeps the stylesheets' prose out of the browser bundle, without moving one
 * word of it out of the code it explains.
 *
 * THE MEASUREMENT THAT MOTIVATED THIS. `widget-app.js` was 589 750 bytes,
 * 89.4% of `scripts/bundle-budget.mjs`'s budget and +3 797 since that budget
 * was fixed. Of those bytes, **296 114 in 471 comments** — half the bundle —
 * were CSS comments: the design arguments, measured defects and rejected
 * alternatives that every `*-styles.ts` file records beside the rule it is
 * arguing about. A minifier strips every JS comment in this bundle; it
 * cannot strip these, because inside a template literal they are not
 * comments, they are string CONTENT.
 *
 * WHY THIS AND NOT "MOVE THE PROSE ABOVE THE LITERAL", which is the repo's
 * own stated convention (`tray-styles.ts`: "the prose belongs where it costs
 * nobody anything"). Two measurements decided it:
 *
 *   - It is 4 423 lines across 18 files, and 2 540 of them are in ONE file.
 *     `AGENTS.md`'s review budget is 400 production lines.
 *   - `truco-ui/src/table-styles.ts` is a 3 674-line stylesheet with 238
 *     comments in it, each anchored to the declaration it argues about.
 *     Hoisting all 238 to the top of the file keeps every word and destroys
 *     what makes them worth keeping.
 *
 * So the convention stays good advice for a comment about the sheet as a
 * whole, and stops being load-bearing for a comment about one declaration.
 * Nobody has to remember it for the bundle's sake any more, which is the
 * same reasoning `scripts/visual-container.mjs` records for its own rebuild:
 * a rule that depends on everyone remembering is not a fix.
 *
 * THE SOURCE IS PARSED, NEVER PATTERN-MATCHED, and that is not caution for
 * its own sake — a regex over the file would delete
 * `packages/spanish-deck-ui/src/front-image.ts`'s `/* @vite-ignore *\/` and
 * every `/*#__PURE__*\/` annotation a bundler reads, both of which are real
 * instructions and neither of which is inside a template literal. TypeScript's
 * own parser (already a dependency: it is what `tsc -b` is) answers exactly
 * one question — which byte ranges are template-literal text — and only those
 * ranges are touched.
 *
 * The bundle is fenced against this silently stopping: `bundle-budget.mjs`
 * fails if `widget-app.js` carries more than 12 000 bytes of CSS comment —
 * the 9 476 that stay on purpose (see below), plus a little room. Without
 * that, a Vite upgrade that skipped this plugin would put 288 kB back and
 * nothing would say so: the size budget alone would not, because ~590 000 is
 * still far under 660 000.
 */
import ts from "typescript";

/**
 * A CSS comment, MINUS the legal ones. `/*!` is the universal "keep me"
 * marker every minifier honours, and a licence that has to travel with the
 * code it licenses is the one comment whose whole purpose is to be shipped.
 * Non-greedy so `/* a *\/ x /* b *\/` is two comments, not one.
 */
const CSS_COMMENT = /\/\*(?!!)[\s\S]*?\*\//g;

/**
 * How many bytes of that a given text still carries. `scripts/bundle-budget.mjs`
 * reads the built bundle through this, so the ceiling it enforces and the
 * comments this file removes are the SAME definition rather than two regexes
 * that agree until one of them is edited.
 */
export function cssCommentBytes(source) {
  let total = 0;
  for (const comment of source.match(CSS_COMMENT) ?? []) total += Buffer.byteLength(comment, "utf8");
  return total;
}

/**
 * Every byte range in `source` that is template-literal TEXT — the quoted
 * chunks themselves, never an interpolation.
 *
 * A `${` ENDS a chunk and the next one starts after the matching `}`, so a
 * range returned here can never span an interpolated expression: the four
 * node kinds below are precisely TypeScript's names for those chunks. That
 * is what makes a comment containing a `${` safe by construction — its `/*`
 * and its `*\/` land in two different ranges, so neither half matches and
 * nothing is removed.
 *
 * Nested templates inside an interpolation are their own nodes and are
 * visited too, so a stylesheet assembled from smaller ones is handled the
 * same way, at the same precision.
 */
export function templateTextRanges(source, fileName = "input.ts") {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ranges = [];
  const visit = (node) => {
    if (
      node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      ranges.push([node.getStart(parsed), node.end]);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return ranges;
}

/**
 * Grows a comment's span to swallow the whole line when the comment IS the
 * whole line — the leading indentation and the one newline that closes it.
 *
 * Without this a hoisted 60-line block comment leaves 60 blank lines behind,
 * which is most of the bytes back again. Bounded on purpose to the comment's
 * own lines: a comment with code before it on the same line keeps that line,
 * and only the comment itself goes.
 */
function widenToWholeLines(source, start, end) {
  let from = start;
  while (from > 0 && (source[from - 1] === " " || source[from - 1] === "\t")) from -= 1;
  if (from > 0 && source[from - 1] !== "\n") return [start, end];

  let to = end;
  while (to < source.length && (source[to] === " " || source[to] === "\t")) to += 1;
  if (to < source.length && source[to] === "\n") return [from, to + 1];
  return [start, end];
}

/**
 * The whole transform: `source` with every CSS comment inside a template
 * literal removed, and nothing else changed. Pure, so
 * `strip-css-comments.test.ts` can prove both halves — what goes and what
 * must not — without building anything.
 */
export function stripCssComments(source, fileName = "input.ts") {
  if (!source.includes("/*")) return source;

  const cuts = [];
  for (const [start, end] of templateTextRanges(source, fileName)) {
    const chunk = source.slice(start, end);
    for (const match of chunk.matchAll(CSS_COMMENT)) {
      cuts.push(widenToWholeLines(source, start + match.index, start + match.index + match[0].length));
    }
  }
  if (cuts.length === 0) return source;

  cuts.sort((left, right) => left[0] - right[0]);
  let out = "";
  let cursor = 0;
  for (const [start, end] of cuts) {
    if (start < cursor) continue;
    out += source.slice(cursor, start);
    // A CSS COMMENT IS ALSO A TOKEN SEPARATOR, so `margin: 0/* why */10px`
    // must not become `margin: 010px`. No comment in this repository is
    // currently written tight on both sides — measured, all 485 of them — but
    // "nobody has done it yet" is not a property of the transform, and one
    // space costs a byte in a case that does not occur.
    if (isTight(source[start - 1]) && isTight(source[end])) out += " ";
    cursor = end;
  }
  return out + source.slice(cursor);
}

/** A character that would end up touching its neighbour if what was between
 * them simply vanished. `undefined` (past either end of the file) cannot
 * touch anything. */
function isTight(character) {
  return character !== undefined && !/\s/.test(character);
}

/**
 * The Vite plugin, `enforce: "pre"` so it sees the ORIGINAL TypeScript — the
 * same text a person reads — rather than whatever an earlier transform left
 * behind.
 *
 * `.js` IS IN THE LIST, and leaving it out would have made this plugin a
 * decoration. Only `apps/widget-app`'s own files reach this build as
 * TypeScript; every `@hexdev/*` import resolves through the importee's
 * `exports`, which point at its `dist/` — so `truco-ui`'s 168 kB of stylesheet
 * prose, the single biggest item, arrives here as `dist/table-styles.js`.
 * `tsc` does not touch the inside of a string either.
 *
 * `map: null` is honest here rather than lazy: this build has no sourcemap
 * (`apps/widget-app/vite.config.ts` never asks for one), so there is no map
 * to keep accurate and nothing downstream reads one.
 */
export function stripCssCommentsPlugin() {
  return {
    name: "hexdev-strip-css-comments",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("/node_modules/") || !/\.[cm]?[jt]sx?$/.test(id.split("?")[0])) return null;
      const stripped = stripCssComments(code, id.split("?")[0]);
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}
