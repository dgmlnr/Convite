import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cssCommentBytes, stripCssComments, templateTextRanges } from "./strip-css-comments.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * WHAT THIS IS FENCING, and it is not "does the bundle get smaller".
 *
 * The size is measured once, by `scripts/bundle-budget.mjs`, on the real
 * artifact — 589 750 bytes down to 302 112. What can silently regress is the
 * BOUNDARY: a transform that reaches one character past a template literal
 * edits code, and the failure mode is a widget that stops mounting with
 * nothing red, which is the exact shape `bundle-budget.mjs`'s own docstring
 * was written about.
 *
 * So the fences below are mostly negative: they are the things a regex over
 * the file would get wrong, and every one of them is a construct that
 * actually exists in this repository.
 */
describe("what the strip removes", () => {
  it("removes a CSS comment from inside a template literal", () => {
    const source = ["export const sheet = `", ".a {", "  /* why this colour */", "  color: red;", "}", "`;"].join("\n");

    expect(stripCssComments(source)).toBe(["export const sheet = `", ".a {", "  color: red;", "}", "`;"].join("\n"));
  });

  it("takes the whole line when the comment IS the line, indentation and newline included", () => {
    // Otherwise a hoisted 60-line block leaves 60 blank lines behind, which is
    // most of the bytes back again.
    expect(stripCssComments("const s = `\n    /* gone */\nkept`;")).toBe("const s = `\nkept`;");
  });

  it("keeps the rest of a line that has CSS on it too", () => {
    expect(stripCssComments("const s = `\ncolor: red; /* gone */\n`;")).toBe("const s = `\ncolor: red; \n`;");
  });

  it("removes several comments from one literal, and the second is not swallowed by the first", () => {
    // Non-greedy matching: `/* a */ x /* b */` is two comments with `x`
    // between them, never one comment containing `x`. The spaces are the
    // token-separator rule below, doing its job at the literal's own edges.
    expect(stripCssComments("const s = `/* a */keep/* b */`;")).toBe("const s = ` keep `;");
  });

  // A CSS COMMENT IS ALSO A TOKEN SEPARATOR, which a byte-count-driven strip
  // is exactly the wrong mood to remember: `margin: 0`, a comment, `10px`
  // deleted naively is `margin: 010px` — valid CSS, wrong number, nothing red.
  // No comment in this repository is written tight on both sides today
  // (measured, all 485), so this fence is about the transform rather than
  // about the current tree.
  //
  // Line comments and not a block, because the example this paragraph is
  // about would close a block comment on its way past — the same shape
  // `stylesheet-source.test.ts` records for a backtick.
  it("leaves a space behind when the comment was the only thing separating two tokens", () => {
    expect(stripCssComments("const s = `margin: 0/* why */10px;`;")).toBe("const s = `margin: 0 10px;`;");
  });

  it("does not leave a space where there was already whitespace on a side", () => {
    expect(stripCssComments("const s = `margin: 0 /* why */10px;`;")).toBe("const s = `margin: 0 10px;`;");
    expect(stripCssComments("const s = `margin: 0/* why */ 10px;`;")).toBe("const s = `margin: 0 10px;`;");
  });

  it("reaches into a template nested inside an interpolation", () => {
    // The space is the token-separator rule again: a backtick is not
    // whitespace, so a comment written flush against one gets one byte back.
    expect(stripCssComments("const s = `a${cond ? `/* gone */b` : ``}c`;")).toBe("const s = `a${cond ? ` b` : ``}c`;");
  });

  it("leaves a source with nothing to strip byte-identical", () => {
    const source = "export const x = `.a { color: red; }`;\n";
    expect(stripCssComments(source)).toBe(source);
  });
});

/**
 * THE NEGATIVE HALF, which is the half worth having. Every construct here is
 * one a regex over the file would damage, and every one of them is real:
 * `/* @vite-ignore *\/` is in `packages/spanish-deck-ui/src/front-image.ts`
 * and `/*#__PURE__*\/` is named in `packages/platform-core/src/index.ts`.
 * Both are INSTRUCTIONS to a bundler, and deleting either changes what the
 * build does.
 */
describe("what the strip must never touch", () => {
  it("leaves a bundler's own annotations alone — they are code, not prose", () => {
    const source = 'export const u = new URL(/* @vite-ignore */ `./a/${id}.webp`, import.meta.url);\n';
    expect(stripCssComments(source)).toBe(source);
  });

  it("leaves a purity annotation alone", () => {
    const source = "const formatter = /*#__PURE__*/ makeFormatter(`es-AR`);\n";
    expect(stripCssComments(source)).toBe(source);
  });

  it("leaves a comment-shaped substring inside an ordinary quoted string alone", () => {
    // A quoted string is not a template literal, and its content is data.
    const source = 'const s = "a /* not a comment */ b";\n';
    expect(stripCssComments(source)).toBe(source);
  });

  it("is not derailed by a regex literal containing a backtick", () => {
    // THE ONE THAT DECIDES parser vs. scanner. A hand-rolled scanner reads
    // this backtick as the start of a template literal and then treats real
    // code as string content until the next one.
    const source = ["const backtickish = /[`]/;", "const s = `x /* gone */ y`;", "const t = `/* also gone */`;"].join("\n");

    expect(stripCssComments(source)).toBe(["const backtickish = /[`]/;", "const s = `x  y`;", "const t = ` `;"].join("\n"));
  });

  it("keeps a legal comment, which is the one comment whose purpose is to ship", () => {
    const source = "const s = `/*! (c) somebody */\n.a{}`;";
    expect(stripCssComments(source)).toBe(source);
  });

  /**
   * DELIBERATE, AND THE REASON IS BETTER THAN THE SAVING. A comment that
   * interpolates a live constant into its own prose has its `/*` in one
   * template chunk and its `*\/` in another, so neither half matches and it
   * stays. Five real comments in `packages/dice-ui/src/dice-styles.ts` are
   * exactly this shape (9 476 bytes of the 302 112 that remain), and they are
   * RIGHT to stay: they quote the numbers they describe, so they cannot go
   * stale, and hoisting them out of the literal would freeze those numbers
   * into text that later lies.
   */
  it("leaves a comment that interpolates a live value where it is", () => {
    const source = "const s = `/* grew to ${String(SIZE)}px */\n.a{}`;";
    expect(stripCssComments(source)).toBe(source);
  });
});

/**
 * THE INVARIANT, checked against every real source file in the repository
 * rather than against a fixture: whatever the strip removed, it removed it
 * from INSIDE a template literal. Anything else is an edit to code.
 *
 * Stated as "the bytes outside every template literal are unchanged", which
 * is provable without knowing anything about what CSS the file holds.
 */
describe("across every source file in the repository, nothing outside a template literal moves", () => {
  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "dist-app", "dist-iife", "dist-ui", ".git"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, found);
      else if (/\.[cm]?tsx?$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  /** Everything that is NOT template-literal text, concatenated. */
  function codeOutsideTemplates(source: string, fileName: string): string {
    let out = "";
    let cursor = 0;
    for (const [start, end] of templateTextRanges(source, fileName)) {
      out += source.slice(cursor, start);
      cursor = end;
    }
    return out + source.slice(cursor);
  }

  const files = [...sourceFiles(join(REPO_ROOT, "packages")), ...sourceFiles(join(REPO_ROOT, "apps"))];

  it("finds a repository to check, so this suite cannot pass by looking at nothing", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("changes at least the stylesheets, so this suite cannot pass by doing nothing", () => {
    const changed = files.filter((file) => stripCssComments(readFileSync(file, "utf8"), file) !== readFileSync(file, "utf8"));

    expect(changed.length).toBeGreaterThan(10);
  });

  it("leaves every byte outside a template literal exactly where it was", () => {
    const damaged: string[] = [];
    for (const file of files) {
      const before = readFileSync(file, "utf8");
      const after = stripCssComments(before, file);
      if (after === before) continue;
      if (codeOutsideTemplates(after, file) !== codeOutsideTemplates(before, file)) damaged.push(file.slice(REPO_ROOT.length));
    }

    expect(damaged, "the strip edited code outside a template literal in these files").toEqual([]);
  });

  /** Every template literal's text, concatenated — the other half of the file
   * from `codeOutsideTemplates`, so between them the two cover all of it. */
  function templateText(source: string, fileName: string): string {
    let out = "";
    for (const [start, end] of templateTextRanges(source, fileName)) out += source.slice(start, end);
    return out;
  }

  /**
   * THE INSIDE HALF, and the one the boundary check above cannot see. "Nothing
   * outside a template literal moved" is satisfied by a transform that eats
   * the whole stylesheet, so this states what is left of the CSS: exactly the
   * CSS, with the comments and the space they occupied gone and not one
   * declaration with them.
   *
   * Whitespace is collapsed on both sides because removing a comment removes
   * the blank line it sat on, which is most of the point.
   */
  it("removes comments from inside the literals and nothing else that is in them", () => {
    const changed: string[] = [];
    const withoutComments = (text: string): string => text.replace(/\/\*(?!!)[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();

    for (const file of files) {
      const before = readFileSync(file, "utf8");
      const after = stripCssComments(before, file);
      if (after === before) continue;
      if (withoutComments(templateText(after, file)) !== withoutComments(templateText(before, file))) changed.push(file.slice(REPO_ROOT.length));
    }

    expect(changed, "the strip removed more than comments from the CSS in these files").toEqual([]);
  });

  it("still parses every file it changed, with the same template literals in it", () => {
    const broken: string[] = [];
    for (const file of files) {
      const before = readFileSync(file, "utf8");
      const after = stripCssComments(before, file);
      if (after === before) continue;
      // A strip that ate a backtick would change how many chunks the parser
      // finds — usually by making the rest of the file one enormous string.
      if (templateTextRanges(after, file).length !== templateTextRanges(before, file).length) broken.push(file.slice(REPO_ROOT.length));
    }

    expect(broken, "the strip changed the template-literal structure of these files").toEqual([]);
  });
});

describe("cssCommentBytes, which is what the bundle ceiling is measured with", () => {
  it("counts the comments and nothing else", () => {
    expect(cssCommentBytes("a/* 12345 */b")).toBe("/* 12345 */".length);
    expect(cssCommentBytes("no comments here")).toBe(0);
  });

  it("counts bytes, not characters — the prose in this repository is accented", () => {
    expect(cssCommentBytes("/*ñ*/")).toBe(6);
  });

  it("does not count a legal comment, because the strip does not remove one", () => {
    expect(cssCommentBytes("/*! (c) somebody */")).toBe(0);
  });
});
