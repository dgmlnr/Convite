import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { applyThemeToRoot } from "./theme.js";

let root: HTMLElement;

afterEach(() => {
  root.remove();
});

function freshRoot(): HTMLElement {
  root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

describe("applyThemeToRoot (design §10: hybrid theming by zone — chrome/lobby/selection take the tenant brand)", () => {
  it("sets every valid token from the closed vocabulary as a CSS custom property", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#336699", "--gx-radius": "8px" });

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#336699");
    expect(el.style.getPropertyValue("--gx-radius")).toBe("8px");
  });

  it("drops a value that fails its token's own regex, leaving the property unset (re-sanitized, never trusted blindly from postMessage)", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "javascript:alert(1)" });

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("");
  });

  it("no-ops without throwing when no theme was supplied at all", () => {
    const el = freshRoot();

    expect(() => applyThemeToRoot(el, undefined)).not.toThrow();
  });
});

describe("precedence rule (design §10, decided in this unit): the host page's own override wins per-token over the tenant's server-delivered theme", () => {
  // `main.ts` applies the tenant's server-delivered theme (`bootstrap.theme`)
  // FIRST, as soon as it is readable — before the `host-hello` handshake
  // even completes, honoring "zero loader involvement" for the primary path
  // — then applies the host page's own `data-theme-*` override (if any) on
  // TOP of it, exactly like this test does. `applyThemeToRoot` merges its
  // argument over the tokens already on the element, so calling it twice is
  // the whole merge mechanism and no separate "resolve precedence" function
  // is needed. A later call CAN now un-set a token an earlier one set, but
  // only by dropping it for failing contrast — never by simply omitting it,
  // which is the property these two tests pin.
  //
  // Justification for host-wins, not tenant-wins: the widget-protocol
  // header itself already names this "Host-supplied theme overrides" — the
  // word "override" already means "wins." More importantly, the host page
  // is not a third party here: it is the SAME tenant's own site (the
  // `<script>` tag lives in markup that tenant controls). Letting that page
  // customize a token per-embed (a seasonal campaign skin, a
  // section-specific accent) without waiting on a config change through us
  // is strictly MORE precise tenant intent than the coarser, centrally
  // configured server default — never a hostile third party overriding a
  // tenant's own brand.
  it("a host-page token set AFTER the tenant's server theme overrides it; a tenant token the host page never mentions survives untouched", () => {
    const el = freshRoot();

    // FIXTURE NOTE (Tanda 3): the accent was `#222222` until the contrast
    // guard landed, and that value now fails legitimately — 1.09:1 against
    // the fixed `--hx-ink` every accent surface paints on top of it, so the
    // guard drops it and there would be no "untouched tenant value" left to
    // assert. `#e8c877` is the widget's own `--hx-gold` (10.74:1) and is
    // simply an accent that passes. What this test is ABOUT — per-token
    // precedence between the two calls — is unchanged.
    applyThemeToRoot(el, { "--gx-color-primary": "#111111", "--gx-color-accent": "#e8c877" }); // tenant/server theme, applied first
    applyThemeToRoot(el, { "--gx-color-primary": "#ffffff" }); // host-page override, applied second

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#ffffff"); // host page wins
    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("#e8c877"); // untouched tenant value survives
  });

  it("a tenant theme alone (no host override at all) is exactly what renders — theming is optional per side, not all-or-nothing", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#111111" });
    applyThemeToRoot(el, {}); // host page offered no `data-theme-*` attributes at all

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#111111");
  });
});

describe("contrast validation at the point of use (Tanda 3: a tenant may pick its brand, never a pairing a player cannot read)", () => {
  let warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings = [];
    warn = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("never writes the audit's dark tenant accent onto the root, so every accent surface keeps painting the default a player can actually read", () => {
    const el = freshRoot();

    applyThemeToRoot(el, {
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-accent": "#123456",
    });

    // The ACTUAL applied custom properties, not the function's return value:
    // an unset property is what makes `var(--gx-color-accent, var(--hx-gold))`
    // resolve to the widget's own gold in all sixteen rules that read it.
    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("");
    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("#ffffff");
    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("#1a1a1a");
  });

  it("drops BOTH halves of a failing foreground/background pair, leaving the stylesheet's own measured default PAIRING to render", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#3a3a3a" });

    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("");
    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("");
  });

  it("warns rather than throws — the server may refuse to serve a bad colour, but a colour must never be able to end a player's session mid-match", () => {
    // The one place this differs from the server side, and deliberately. In
    // `platform-core`'s repository construction a warning is read by an
    // operator who can fix the config; here it is read by whoever opens a
    // browser console, and the player behind it just wants to keep playing.
    // The applied theme is already correct by the time this is logged, so the
    // warning costs the player nothing and still leaves a trace for the
    // integrator debugging why their brand did not appear.
    // The surface below is shape-valid but MALFORMED (`.` sits inside
    // COLOR_PATTERN's numeric class, so it parses to a NaN hue). Without a
    // finite guard it threw straight out of this synchronous call, reaching a
    // player mid-session. Paired with an on-surface so a rule actually
    // measures it; alone, no rule would look at it at all.
    const el = freshRoot();

    expect(() =>
      applyThemeToRoot(el, { "--gx-color-accent": "#123456", "--gx-color-surface": "hsl(.,50%,50%)", "--gx-color-on-surface": "#f2f2f2" }),
    ).not.toThrow();
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toContain("accent/ink");
    expect(warnings.join(" ")).toContain("1.37:1");
    expect(warnings.join(" ")).toContain("could not be measured");
  });

  it("leaves a theme that passes completely alone and says nothing about it", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#f2f2f2", "--gx-color-accent": "#e8c877" });

    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("#1c1c1c");
    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("#f2f2f2");
    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("#e8c877");
    expect(warnings).toEqual([]);
  });
});

describe("the two-call gap (Tanda 3 follow-up): a host override is validated against what is ALREADY on the element, not against itself alone", () => {
  let warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings = [];
    warn = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("catches a host page that supplies only the FOREGROUND half of a pair the tenant call already validated", () => {
    // The bypass, exactly as `main.ts` drives it. The tenant's own pair is
    // legible on its own terms (#f2f2f2 on #1c1c1c, 15.22:1) and applies
    // first. The host page then sends ONLY `--gx-color-on-surface`, so a
    // validator looking at that call's argument ALONE sees half a pair, has
    // nothing to measure it against, and passes it through — landing
    // near-black text on the tenant's near-black surface at 1.02:1.
    //
    // Both halves go, not just the host's. The surviving tenant surface was
    // only ever validated against a foreground that no longer exists; keeping
    // it would leave a tenant colour paired with a per-zone default nobody
    // measured, which is the same trap `validateThemeContrast` drops pairs to
    // avoid.
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#f2f2f2" }); // tenant theme
    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("#f2f2f2"); // the tenant pair really did apply

    applyThemeToRoot(el, { "--gx-color-on-surface": "#1a1a1a" }); // host override, only one half

    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("");
    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("on-surface/surface");
    expect(warnings[0]).toContain("1.02:1");
  });

  it("a shape-INVALID incoming value leaves the already-applied valid one alone — a host-page typo must not wipe a tenant's brand", () => {
    // The merge is over SANITIZED input, never raw: an invalid value that
    // entered the merge would be dropped by the sanitizer and then removed
    // from the element by the reconcile loop, erasing a good value nobody
    // asked to change. Removal stays load-bearing for the contrast case — the
    // first test in this block is what pins that half.
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#336699" });
    applyThemeToRoot(el, { "--gx-color-primary": "red; } body { display: none" });

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#336699");
  });

  it("still lets a host page override one half with a value that stays legible against what is already applied", () => {
    // The mirror case, and the reason this is a merge rather than a ban on
    // half-pair overrides: a host page narrowing its own text colour to
    // something that still reads on the tenant's surface is legitimate tenant
    // intent, and must survive.
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#f2f2f2" });
    applyThemeToRoot(el, { "--gx-color-on-surface": "#c8c8c8" });

    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("#c8c8c8");
    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("#1c1c1c");
    expect(warnings).toEqual([]);
  });

  it("catches the same bypass through the BACKGROUND half — a host page repainting the surface under text the tenant already validated", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#f2f2f2" });
    applyThemeToRoot(el, { "--gx-color-surface": "#ffffff" }); // white surface under near-white text

    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("");
    expect(el.style.getPropertyValue("--gx-color-on-surface")).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("on-surface/surface");
  });

  it("re-checks a token already on the element against a NEW partner arriving later — an accent that was unmeasurable alone becomes measurable once a surface lands", () => {
    // `accent/surface` is skipped entirely when no surface is present, so a
    // tenant accent can be applied un-cross-checked and only become a defect
    // when the host page supplies the surface it will be read on.
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-accent": "#e8c877" }); // passes accent/ink (10.74:1), no surface to check against yet
    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("#e8c877");

    applyThemeToRoot(el, { "--gx-color-surface": "#ffffff" }); // now accent-as-text sits at 1.62:1

    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("");
    expect(el.style.getPropertyValue("--gx-color-surface")).toBe("#ffffff");
    expect(warnings[0]).toContain("accent/surface");
  });
});
