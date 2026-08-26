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
