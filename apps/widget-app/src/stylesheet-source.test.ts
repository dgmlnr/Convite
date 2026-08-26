import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * NO BACKTICK EVER APPEARS INSIDE A CSS TEMPLATE LITERAL.
 *
 * Both stylesheets in this repo are template literals authored by hand, and a
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
 */
const STYLESHEETS = [
  new URL("./chrome-styles.ts", import.meta.url),
  new URL("../../../packages/games/truco-ui/src/table-styles.ts", import.meta.url),
];

/** The CSS body: from the first template that opens a stylesheet to the
 * `.trim()` that closes it. Comments elsewhere in the file may say whatever
 * they like — only this span is inside the literal. */
function cssBody(source: string): string {
  const open = source.indexOf("return `");
  const close = source.lastIndexOf("`.trim();");
  return open < 0 || close < open ? "" : source.slice(open + "return `".length, close);
}

describe("the CSS template literals stay closed", () => {
  it.each(STYLESHEETS.map((url) => [url.pathname.split("/").slice(-1)[0]!, url] as const))(
    "%s contains no backtick inside its stylesheet",
    (_name, url) => {
      const body = cssBody(readFileSync(fileURLToPath(url), "utf8"));

      expect(body.length, "fence setup: no stylesheet template was found to check").toBeGreaterThan(0);
      const at = body.indexOf("`");
      const context = at < 0 ? "" : body.slice(Math.max(0, at - 70), at + 20).replace(/\n/g, "  ");
      expect(at, `a backtick closes the stylesheet early. Around it: …${context}…`).toBe(-1);
    },
  );

  it.each(STYLESHEETS.map((url) => [url.pathname.split("/").slice(-1)[0]!, url] as const))(
    "%s opens and closes every block",
    (_name, url) => {
      // The other silent structural failure, and the one that cost a whole
      // afternoon: an unclosed brace swallows every rule after it without
      // throwing, warning, or breaking the rules above.
      // Interpolations contribute a closing brace of their own, so they come
      // out before the braces are counted.
      const withoutInterpolation = cssBody(readFileSync(fileURLToPath(url), "utf8")).replace(/\$\{[^}]*\}/g, "");
      let clean = 0;
      for (const character of withoutInterpolation) {
        if (character === "{") clean += 1;
        if (character === "}") clean -= 1;
      }
      expect(clean, "an unclosed block is silently swallowing every rule after it").toBe(0);
    },
  );
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
  it.each(STYLESHEETS.map((url) => [url.pathname.split("/").slice(-1)[0]!, url] as const))(
    "%s: every nested rule differs from the base rule it shadows",
    (file, url) => {
      // The CSS BODY, not the file: depth is counted in braces, and the
      // TypeScript function the literal lives in opens one of its own. A
      // first version counted from the top of the file and every top-level
      // rule came out one level deep, so nothing was ever recognised as a
      // base rule and the fence passed on everything.
      const source = cssBody(readFileSync(fileURLToPath(url), "utf8"));
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
      for (const line of source.split("\n")) {
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
    },
  );
});
