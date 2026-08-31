import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { THEME_TOKEN_NAMES } from "@hexdev/widget-protocol";

/**
 * NO STYLESHEET READS A TOKEN THIS PRODUCT DOES NOT HAVE.
 *
 * THE DEFECT THIS EXISTS FOR, and it is not hypothetical: the match-over
 * panel shipped reading `--hexdev-color-primary` and `--hexdev-color-on-primary`.
 * Neither string existed anywhere else in the repository. The accepted tenant
 * vocabulary is the CLOSED seven-name set this file imports from
 * `widget-protocol`, so the panel could never take a tenant's theme — on a
 * tenant with a themed felt it would have painted a hardcoded green over a
 * board of another colour.
 *
 * IT PASSED EVERY TEST. `var(--nonexistent, #1e5c43)` renders the fallback,
 * silently and forever, so there is no behaviour to observe and no assertion
 * that could have seen it. It was found by a person looking at a screen that
 * had been unreachable until the slice that wired it, and it cost a whole
 * slice. Re-planting it with this file absent leaves the suite at 2677 green.
 *
 * SO IT IS A SOURCE SCAN, deliberately. This is R20's family — a rule about
 * what code may CONSULT cannot be checked by running it, because a forbidden
 * read in an environment with nothing to read produces no consequence.
 * `no-measurement.test.ts` is the same shape for the same reason, and this
 * file borrows its comment stripper and its anti-vacuity discipline whole.
 *
 * AND IT IS DERIVED, never a list. Both halves — which modules to scan and
 * which properties are real — come from the repository itself: the modules
 * from a walk of the workspace roots `pnpm-workspace.yaml` declares, the
 * properties from every declaration those same modules make. A hand-typed
 * list of stylesheets is exactly the enumerating-config defect this repo has
 * hit repeatedly, and it is why the fence that existed before this one
 * (`stylesheet-source.test.ts`, a different rule about a different defect)
 * covered two files out of eleven.
 *
 * WHY IT LIVES IN `apps/widget-app`: this is the composition root that
 * assembles every game's UI, so it is the one place that may legitimately
 * know about all of them at once. The scan reads files as TEXT and imports
 * nothing from them, so it creates no dependency edge and needs no build.
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

/** Every production module under the workspace roots. Tests are excluded for
 * the reason `no-measurement.test.ts` gives: a test naming a token in a
 * fixture is how these fences prove themselves, and a scan that could not
 * tell the two apart would forbid its own counterexamples. */
function productionSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith("dist")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test-support.ts")) found.push(repoRelative(full));
    }
  };
  for (const root of WORKSPACE_ROOTS) walk(join(REPO_ROOT, root));
  return found.sort();
}

/** The workspace package a module belongs to, by nearest `package.json`. The
 * unit of "declared by that package" is a real published boundary, not a path
 * prefix somebody chose. */
function packageOf(file: string): string {
  let dir = dirname(join(REPO_ROOT, file));
  while (dir.length > REPO_ROOT.length) {
    if (existsSync(join(dir, "package.json"))) return repoRelative(dir);
    dir = dirname(dir);
  }
  return ".";
}

/**
 * COMMENTS COME OUT FIRST, and that is what makes the rule statable at all.
 * Every stylesheet in this repo names its tokens in prose — `theme-tokens.ts`
 * writes `var(--gx-*, <default>)` in a docblock, and `match-over-view.ts`
 * names the very defect this file exists for — so a scan that could not tell
 * a docblock from a declaration would force the documentation to stop naming
 * what it forbids. Copied from `no-measurement.test.ts`, including the reason
 * a line comment must be preceded by whitespace: it is what spares a URL.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

interface CustomPropertyRead {
  readonly name: string;
  /** `var(--x, y)` versus a bare `var(--x)`. The two are different defects
   * and get different rules: a fallback renders something, a bare read of an
   * undeclared property renders nothing at all — the browser drops the whole
   * declaration. */
  readonly hasFallback: boolean;
}

function readsIn(source: string): readonly CustomPropertyRead[] {
  return [...stripComments(source).matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g)].map((match) => ({ name: match[1]!, hasFallback: match[2] === "," }));
}

/**
 * The three ways this repository declares a custom property, all three of
 * which really occur: a CSS declaration inside a stylesheet literal
 * (`--mj-tile-width: …`), a quoted key in a token-defaults object
 * (`"--mj-tile-face": "#f4efe2"` in `mahjong-tile-ui`, `"--deck-back-bg"` in
 * `spanish-deck-ui`), and a renderer pushing a value in from TypeScript
 * (`setProperty("--mj-x", …)` in `board.ts`). Miss any one of them and the
 * fence reds on correct code.
 */
const DECLARATION_FORMS: readonly RegExp[] = [/(?:^|[\s;{(])(--[A-Za-z0-9_-]+)\s*:/g, /["'](--[A-Za-z0-9_-]+)["']\s*:/g, /setProperty\(\s*["'`](--[A-Za-z0-9_-]+)/g];

function declarationsIn(source: string): readonly string[] {
  const stripped = stripComments(source);
  return DECLARATION_FORMS.flatMap((form) => [...stripped.matchAll(form)].map((match) => match[1]!));
}

/** `--gx-color-primary` and `--mj-tile-face` belong to `--gx-` and `--mj-`;
 * a single-segment name like `--i` is its own namespace. */
function namespaceOf(property: string): string {
  const boundary = property.indexOf("-", 2);
  return boundary < 0 ? property : property.slice(0, boundary + 1);
}

/** DERIVED FROM THE VOCABULARY ITSELF, never typed: whatever prefix the
 * closed set shares is the tenant namespace, so renaming the set moves this
 * with it. */
const TENANT_NAMESPACE = namespaceOf(THEME_TOKEN_NAMES[0]);
const TENANT_TOKENS: ReadonlySet<string> = new Set(THEME_TOKEN_NAMES);

const SOURCES = productionSources();
const READS = new Map(SOURCES.map((file) => [file, readsIn(readFileSync(join(REPO_ROOT, file), "utf8"))] as const));
/** Only the modules that read a custom property at all — the rest have
 * nothing this file can say anything about. */
const READING_SOURCES = SOURCES.filter((file) => READS.get(file)!.length > 0);

const DECLARED = new Set<string>();
const DECLARED_NAMESPACES_BY_PACKAGE = new Map<string, Set<string>>();
for (const file of SOURCES) {
  const owner = packageOf(file);
  const namespaces = DECLARED_NAMESPACES_BY_PACKAGE.get(owner) ?? new Set<string>();
  DECLARED_NAMESPACES_BY_PACKAGE.set(owner, namespaces);
  for (const property of declarationsIn(readFileSync(join(REPO_ROOT, file), "utf8"))) {
    DECLARED.add(property);
    namespaces.add(namespaceOf(property));
  }
}

const namespacesDeclaredBy = (file: string): ReadonlySet<string> => DECLARED_NAMESPACES_BY_PACKAGE.get(packageOf(file)) ?? new Set<string>();

const distinct = (names: readonly string[]): readonly string[] => [...new Set(names)].sort();

/**
 * RULE 1 — THE TENANT VOCABULARY IS CLOSED.
 *
 * A tenant's brand arrives through `sanitizeThemeOverride`, which reads ONLY
 * the seven names and is structurally blind to everything else. So a name in
 * the tenant namespace that is not one of the seven can never be set by a
 * tenant, whatever else the product does with it — including declaring it
 * locally, which is the case this rule catches and the other two do not.
 */
function outsideTheClosedVocabulary(reads: readonly CustomPropertyRead[]): readonly string[] {
  return distinct(reads.filter((read) => namespaceOf(read.name) === TENANT_NAMESPACE && !TENANT_TOKENS.has(read.name)).map((read) => read.name));
}

/**
 * RULE 2 — A READ WITH A FALLBACK MUST NAME SOMETHING THAT EXISTS.
 *
 * This is the one that catches `--hexdev-color-primary`. A property with a
 * fallback always renders, so the only question is whether the `var()` is
 * telling the truth about being overridable. It is, if the property is a
 * tenant token, or if something in this product declares it, or if it belongs
 * to a namespace the READING PACKAGE itself declares — the last being the
 * local-knob case: `var(--escoba-rail-gap, 8px)` names a number at its use
 * site inside a namespace escoba-ui owns, and nineteen of those ship.
 *
 * KNOWN LIMIT, named rather than hidden: a typo INSIDE a namespace the
 * reading package already declares, carrying a fallback, is indistinguishable
 * from a knob and passes. `--hx-text-body-compact` in `chrome-styles.ts` is
 * exactly that and is the only instance in the repository. Closing it would
 * mean forbidding the knob idiom in two shipped games, which is a product
 * decision this fence has no business taking. What it does close is the whole
 * FOREIGN-namespace class, which is what actually shipped broken.
 */
function tokensThisProductDoesNotHave(reads: readonly CustomPropertyRead[], ownNamespaces: ReadonlySet<string>): readonly string[] {
  return distinct(
    reads.filter((read) => read.hasFallback && !TENANT_TOKENS.has(read.name) && !DECLARED.has(read.name) && !ownNamespaces.has(namespaceOf(read.name))).map((read) => read.name),
  );
}

/**
 * RULE 3 — A BARE READ HAS NO SECOND CHANCE.
 *
 * `var(--x)` where nothing declares `--x` resolves to the guaranteed-invalid
 * value and the browser DROPS THE WHOLE DECLARATION — not just the value, the
 * property. There is no knob exemption here because there is no default to be
 * the knob's value. Disjoint from rule 2 by construction: that one is about
 * reads that carry a fallback, this one about reads that do not.
 */
function bareReadsNothingDeclares(reads: readonly CustomPropertyRead[]): readonly string[] {
  return distinct(reads.filter((read) => !read.hasFallback && !TENANT_TOKENS.has(read.name) && !DECLARED.has(read.name)).map((read) => read.name));
}

describe("the token scan reaches what it is written to reach", () => {
  it("walks every workspace root pnpm-workspace.yaml declares", () => {
    // R6. The whole fence is vacuous if a tree is not walked, and the way a
    // tree stops being walked is somebody adding one to the workspace.
    const globs = workspaceGlobs();
    expect(globs.length, "fence setup: no packages: list was found in pnpm-workspace.yaml").toBeGreaterThan(0);
    expect(
      globs.filter((glob) => !WORKSPACE_ROOTS.some((root) => glob === root || glob.startsWith(`${root}/`))),
      "pnpm-workspace.yaml declares a root this scan does not walk — add it to WORKSPACE_ROOTS",
    ).toEqual([]);
  });

  it("finds every production stylesheet module in the repository", () => {
    // R6, sized against the collection it guards. A stylesheet is a file this
    // rule is written for by definition, so every one of them being in the
    // walk is what says the walk happened. The two named individually are the
    // ones the previous fence did NOT cover and the defect shipped in.
    const stylesheets = SOURCES.filter((file) => file.endsWith("-styles.ts"));
    expect(stylesheets.length, "fence setup: the walk found no stylesheet modules at all").toBeGreaterThan(WORKSPACE_ROOTS.length);
    expect(SOURCES).toContain("packages/games/mahjong-solitaire-ui/src/board-styles.ts");
    expect(SOURCES).toContain("packages/games/mahjong-solitaire-ui/src/match-over-view.ts");
  });

  it("actually reads custom properties out of them", () => {
    // R6 again, and this is the one slice 9's equivalent scan needed: its
    // first version read an empty body and reported perfect compliance.
    expect(READING_SOURCES.length, "fence setup: nothing in the repository appears to read a custom property").toBeGreaterThan(0);
    expect(READING_SOURCES).toContain("apps/widget-app/src/chrome-styles.ts");
    expect(READING_SOURCES).toContain("packages/games/truco-ui/src/table-styles.ts");
    expect(READING_SOURCES).toContain("packages/games/mahjong-solitaire-ui/src/board-styles.ts");
    expect(READING_SOURCES).toContain("packages/games/mahjong-solitaire-ui/src/match-over-view.ts");
  });

  it("finds every token of the closed vocabulary being read by something", () => {
    // Sized against the vocabulary rather than a literal (R14), and it says
    // something on its own: a tenant token nothing reads is a promise the
    // product does not keep.
    const everythingRead = new Set(READING_SOURCES.flatMap((file) => READS.get(file)!.map((read) => read.name)));
    expect([...THEME_TOKEN_NAMES].filter((token) => !everythingRead.has(token)), "a tenant token no stylesheet reads: the theme promises it and nothing paints with it").toEqual([]);
  });

  it("finds a declaration in each of the three forms it knows", () => {
    // R18. A declaration form the scan cannot see makes every read of that
    // property look undeclared, so the fence would red on correct code — the
    // failure mode that gets a fence deleted rather than fixed.
    const samples = ['.a { --gx-radius: 10px; }', 'const D = { "--mj-tile-face": "#f4efe2" } as const;', 'element.style.setProperty("--mj-x", String(x));'];
    expect(declarationsIn(samples[0]!)).toContain("--gx-radius");
    expect(declarationsIn(samples[1]!)).toContain("--mj-tile-face");
    expect(declarationsIn(samples[2]!)).toContain("--mj-x");
    // And a read is not a declaration, which is the distinction the whole
    // file rests on.
    expect(declarationsIn("background: var(--gx-color-primary, #1e5c43);")).toEqual([]);
  });

  it("strips the prose and keeps the code, proven on a line that is both", () => {
    // Without this the scan could be clean because `stripComments` ate the
    // file. `match-over-view.ts` really does name `--hexdev-color-primary` in
    // its own docblock, so this is not a hypothetical.
    const sample = ["/* it used to read --hexdev-color-primary, which does not exist */", "  background: var(--gx-color-primary, #1e5c43); // --gx-nonsense neither", "const doc = 'https://example.test/a//b';"].join("\n");
    const stripped = stripComments(sample);

    expect(readsIn(stripped).map((read) => read.name)).toEqual(["--gx-color-primary"]);
    expect(stripped).toContain("https://example.test/a//b");
  });
});

describe("each token rule can actually fail", () => {
  const MATCH_OVER_VIEW = "packages/games/mahjong-solitaire-ui/src/match-over-view.ts";
  const original = (): string => readFileSync(join(REPO_ROOT, MATCH_OVER_VIEW), "utf8");

  it("reds on the exact token the completion panel shipped with, and names it", () => {
    // R18, on the real file rather than a fixture: this is verify's own
    // reintroduction, and with this file absent it leaves 2677 tests green.
    const clean = original();
    const doctored = clean.replace("var(--gx-color-primary, #1e5c43)", "var(--hexdev-color-primary, #1e5c43)");
    expect(doctored, "the doctoring changed nothing — the token this test plants no longer appears in the file").not.toBe(clean);

    const own = namespacesDeclaredBy(MATCH_OVER_VIEW);
    expect(tokensThisProductDoesNotHave(readsIn(clean), own), "the shipped file is not supposed to trip this rule").toEqual([]);
    expect(tokensThisProductDoesNotHave(readsIn(doctored), own)).toEqual(["--hexdev-color-primary"]);
  });

  // THE OTHER TWO RULES PROVE THEMSELVES ON SYNTHETIC TEXT, DELIBERATELY, and
  // that is R14 acting on a measurement rather than on a hunch. A first
  // version anchored all three on the same literal out of `match-over-view.ts`,
  // and re-planting the shipped defect came back at RADIUS 4: the real red
  // plus three setup guards saying "the string I was going to doctor is gone".
  // A guard sized against a neighbouring fence's literal couples fences that
  // have nothing to do with each other. Only the rule the defect actually
  // belongs to keeps its anchor in the real file.

  it("reds on a name in a namespace the reading package does not own, even when other packages do", () => {
    // THE HALF OF RULE 2 A WEAKENING TAKES AWAY, and it was bought by a
    // ZERO-RED run: relaxing "a namespace the READING package declares" to
    // "a namespace ANY package declares" left all 2731 tests green, because
    // the only case that tells the two apart is this one. Without it the
    // local-knob exemption quietly becomes a repository-wide amnesty and the
    // rule stops being about the reading package at all.
    const read = readsIn("background: var(--hx-color-primary, #1e5c43);");
    const mahjong = namespacesDeclaredBy(MATCH_OVER_VIEW);
    const chrome = namespacesDeclaredBy("apps/widget-app/src/chrome-styles.ts");

    expect(DECLARED.has("--hx-color-primary"), "fence setup: this has to be a name the product really does not have").toBe(false);
    expect(mahjong.has("--hx-"), "fence setup: mahjong-solitaire-ui must not declare this namespace, or the case is not the foreign one").toBe(false);
    expect(chrome.has("--hx-"), "fence setup: widget-app must declare it, or the two halves of the rule cannot differ").toBe(true);

    expect(tokensThisProductDoesNotHave(read, mahjong)).toEqual(["--hx-color-primary"]);
    // …and the knob idiom survives inside the package that owns the namespace,
    // which is the whole reason the exemption exists.
    expect(tokensThisProductDoesNotHave(read, chrome)).toEqual([]);
  });

  it("reds on a name inside the tenant namespace that is not one of the closed seven", () => {
    expect(outsideTheClosedVocabulary(readsIn("background: var(--gx-colour-primary, #1e5c43);"))).toEqual(["--gx-colour-primary"]);
    // Not the same rule as rule 2: a name the product DECLARES is still
    // forbidden here, because no tenant can ever set it. Rule 2 would let
    // this one through, which is the whole reason the two are separate.
    const declaredButUnreachable = ".a { --gx-color-brand: red; } .b { color: var(--gx-color-brand); }";
    expect(outsideTheClosedVocabulary(readsIn(declaredButUnreachable))).toEqual(["--gx-color-brand"]);
    // And it is quiet on every real token, so it is not simply "any --gx- read".
    expect(outsideTheClosedVocabulary([...THEME_TOKEN_NAMES].map((name) => ({ name, hasFallback: true })))).toEqual([]);
  });

  it("reds on a bare read of a property nothing declares", () => {
    expect(bareReadsNothingDeclares(readsIn("width: var(--mj-nonexistent);"))).toEqual(["--mj-nonexistent"]);
    // Disjoint from rule 2 by construction: give the same name a fallback and
    // this rule goes quiet, because the declaration then renders something.
    expect(bareReadsNothingDeclares(readsIn("color: var(--mj-nonexistent, red);"))).toEqual([]);
    // And quiet on a bare read of something real, so it is not simply "any
    // bare read".
    expect(bareReadsNothingDeclares(readsIn("width: var(--mj-tile-width);"))).toEqual([]);
  });
});

describe("every custom property this product reads is one it has", () => {
  it.each(READING_SOURCES)("%s reads only names inside the closed tenant vocabulary", (file) => {
    const offenders = outsideTheClosedVocabulary(READS.get(file)!);
    expect(offenders, `${TENANT_NAMESPACE}* is a CLOSED vocabulary a tenant sets; these are not in it and no tenant can ever supply them: ${offenders.join(", ")}`).toEqual([]);
  });

  it.each(READING_SOURCES)("%s reads no token this product does not have", (file) => {
    const offenders = tokensThisProductDoesNotHave(READS.get(file)!, namespacesDeclaredBy(file));
    expect(offenders, `nothing in this product declares these, and they are not in this package's own namespaces — they will forever render their fallback: ${offenders.join(", ")}`).toEqual([]);
  });

  it.each(READING_SOURCES)("%s makes no bare read of a property nothing declares", (file) => {
    const offenders = bareReadsNothingDeclares(READS.get(file)!);
    expect(offenders, `read without a fallback and declared nowhere, so the browser drops the whole declaration: ${offenders.join(", ")}`).toEqual([]);
  });
});
