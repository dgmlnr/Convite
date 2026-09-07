import { describe, expect, it } from "vitest";

import { prefersHtml, resolveRoute } from "./routing.js";

/**
 * The one real DECISION inside the request handler, lifted out so it can be
 * pinned. `/embed` answers two audiences on one path: a browser navigating
 * the iframe's src gets the shell with the mint result inlined, because a
 * same-origin fetch from inside that iframe back here would carry no origin
 * evidence at all; a programmatic caller gets the plain JSON API.
 *
 * Getting it backwards does not error — it silently serves JSON to a browser
 * that renders it as text, or HTML to a caller that fails to parse it. That
 * is exactly the class of failure this repo keeps paying for.
 */
describe("prefersHtml", () => {
  it("says yes to what a navigating browser actually sends", () => {
    expect(prefersHtml("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(true);
  });

  it("says no to an explicit JSON caller", () => {
    expect(prefersHtml("application/json")).toBe(false);
  });

  /** No header at all is a programmatic caller, not a browser. */
  it("says no when the header is absent", () => {
    expect(prefersHtml(undefined)).toBe(false);
    expect(prefersHtml("")).toBe(false);
  });

  it("is not fooled by a header that merely mentions html elsewhere", () => {
    expect(prefersHtml("application/vnd.my-html-tool+json")).toBe(false);
  });
});

/**
 * `resolveRoute` is pure precisely so this file can exist. The `node:http`
 * server around it is a handful of lines and untestable without binding a
 * port; the ROUTING is what silently breaks — a path this role should serve
 * quietly falling through to 404 would look, from the browser, exactly like
 * the widget failing to mount with no error at all. That failure shape has
 * already cost this project a full day once (handoff §1's baked-origin trap).
 */
describe("resolveRoute", () => {
  it("serves the embed page", () => {
    expect(resolveRoute("GET", "/embed")).toEqual({ kind: "embed" });
  });

  it("serves session renewal, which is a POST and only a POST", () => {
    expect(resolveRoute("POST", "/session/renew")).toEqual({ kind: "session-renew" });
    expect(resolveRoute("GET", "/session/renew")).toEqual({ kind: "not-found" });
  });

  /**
   * The literal URL a tenant's `<script src>` fetches, so it must be served
   * from the SAME origin as `/embed` — which is precisely why it belongs to
   * this role and not to the match replicas.
   */
  it("serves the loader", () => {
    expect(resolveRoute("GET", "/loader.js")).toEqual({ kind: "loader" });
  });

  it("serves the widget app bundle", () => {
    expect(resolveRoute("GET", "/assets/widget-app.js")).toEqual({ kind: "widget-app" });
  });

  it("serves a card front, carrying the file name through", () => {
    expect(resolveRoute("GET", "/assets/fronts/1-espada.webp")).toEqual({ kind: "card-front", file: "1-espada.webp" });
  });

  /**
   * Path traversal is rejected HERE rather than left to the asset reader:
   * a route that cannot express `..` is a stronger guarantee than a reader
   * that has to remember to check for it.
   */
  it("refuses a card-front path that tries to escape its directory", () => {
    expect(resolveRoute("GET", "/assets/fronts/../../../etc/passwd")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/fronts/..%2Fsecret")).toEqual({ kind: "not-found" });
  });

  it("refuses a card-front request with no file at all", () => {
    expect(resolveRoute("GET", "/assets/fronts/")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/fronts")).toEqual({ kind: "not-found" });
  });

  /**
   * A SECOND PREFIX RATHER THAN A GENERALISED ONE, and the reason is recorded
   * in `.dependency-cruiser.cjs:38`: do not invent a convention ahead of its
   * second consumer. There are two artworks now and no third, so
   * `/assets/fronts/` and `/assets/tiles/` stay two literal prefixes with the
   * same refusals rather than one parameterised route that would have to
   * decide which directory a caller meant.
   */
  it("serves a tile face, carrying the file name through", () => {
    expect(resolveRoute("GET", "/assets/tiles/5-circles.webp")).toEqual({ kind: "tile-front", file: "5-circles.webp" });
    expect(resolveRoute("GET", "/assets/tiles/flower-bamboo.webp")).toEqual({ kind: "tile-front", file: "flower-bamboo.webp" });
  });

  it("refuses a tile-front path that tries to escape its directory", () => {
    expect(resolveRoute("GET", "/assets/tiles/../../../etc/passwd")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/tiles/..%2Fsecret")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/tiles/nested/5-circles.webp")).toEqual({ kind: "not-found" });
  });

  it("refuses a tile-front request with no file at all", () => {
    expect(resolveRoute("GET", "/assets/tiles/")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/tiles")).toEqual({ kind: "not-found" });
  });

  /**
   * A THIRD LITERAL PREFIX, and the argument the second one recorded is the
   * argument for writing this one out too: a parameterised `/assets/<kind>/`
   * would have to decide which directory a caller meant and would answer for
   * kinds nobody ships. Three prefixes with identical refusals cost less than
   * one route that has to be reasoned about.
   *
   * The six die faces AND the cup live in ONE directory, so this prefix has
   * no exact-path companion to keep in sync — which is the whole reason the
   * cup moved out of `packages/dice-ui/assets/` in the previous slice. An
   * exact-path `/assets/cup.webp` case would have sat outside `assetFileName`
   * entirely.
   */
  it("serves a die face and the cup, carrying the file name through", () => {
    expect(resolveRoute("GET", "/assets/dice/1.webp")).toEqual({ kind: "dice-asset", file: "1.webp" });
    expect(resolveRoute("GET", "/assets/dice/6.webp")).toEqual({ kind: "dice-asset", file: "6.webp" });
    expect(resolveRoute("GET", "/assets/dice/cup.webp")).toEqual({ kind: "dice-asset", file: "cup.webp" });
  });

  it("refuses a dice path that tries to escape its directory", () => {
    expect(resolveRoute("GET", "/assets/dice/../../etc/passwd")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/dice/..%2fcup.webp")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/dice/nested/1.webp")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/dice/nested\\1.webp")).toEqual({ kind: "not-found" });
  });

  /**
   * THE `..` CLAUSE, ISOLATED — and it took a mutation to notice nothing was
   * isolating it. Every other traversal case in this file, on all three
   * prefixes, carries a SEPARATOR as well as the dots (`../../etc/passwd` has
   * a `/`, `..%2Fsecret` has an encoded one), so deleting `assetFileName`'s
   * `includes("..")` check left the entire suite green: measured, ZERO reds.
   * The clause was real code that no test could tell from its absence.
   *
   * This name has dots and no separator of either kind, so that clause alone
   * refuses it. It also names the one thing a bare `..` can actually reach —
   * the parent DIRECTORY — and the refusal has to happen here: one layer down
   * `readFile` on a directory throws, so the 404 would read as a missing
   * asset rather than as a refused escape.
   */
  it("refuses the bare parent-directory name, which no other traversal case reaches", () => {
    expect(resolveRoute("GET", "/assets/dice/..")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/tiles/..")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/fronts/..")).toEqual({ kind: "not-found" });
  });

  /**
   * The `%2f` half of the guard, asserted WITHOUT a `..` anywhere in the
   * name. Every traversal case above also contains `..`, so each of them
   * stays refused with the `%2f` check deleted and none of them measures it.
   * This one does: it is a bare encoded separator, the shape a caller reaches
   * for when the raw `/` was rejected.
   */
  it("refuses an encoded separator even with no dots in the name", () => {
    expect(resolveRoute("GET", "/assets/dice/nested%2f1.webp")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/dice/nested%2F1.webp")).toEqual({ kind: "not-found" });
  });

  it("refuses a dice request with no file at all", () => {
    expect(resolveRoute("GET", "/assets/dice/")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/assets/dice")).toEqual({ kind: "not-found" });
  });

  /**
   * `7.webp` IS CARRIED THROUGH HERE, AND THAT IS THE LAYER SPLIT RATHER
   * THAN A GAP. `assetFileName` refuses SHAPES — a name that is not a bare
   * name — and holds no vocabulary at all: it does not know a die has six
   * faces, exactly as it does not know the deck has forty cards or the wall
   * forty-two drawings. A name that is well-shaped and not part of the
   * artwork is refused one layer down, by `serveDiceAsset`'s membership in
   * `DICE_ASSET_FILENAMES`, checked before the filesystem is touched;
   * `static-dice-assets.test.ts` is where that refusal is asserted.
   *
   * Teaching this route the seven names would put one fence in two places
   * and hand `apps/mint-server` an import of an L0 art package it has no
   * other reason to hold.
   */
  it("carries a well-shaped name the artwork does not have through to the membership check", () => {
    expect(resolveRoute("GET", "/assets/dice/7.webp")).toEqual({ kind: "dice-asset", file: "7.webp" });
  });

  /**
   * The three artworks must not be reachable through each other's prefix: a
   * route that answered `card-front` for a tile path would hand the tile
   * name to the deck's own regex, which rejects it — a 404 that looks like a
   * missing file rather than like a routing mistake. Each prefix is asserted
   * against a name that genuinely belongs to another one, so a branch tested
   * against its own vocabulary only cannot pass by accident.
   */
  it("keeps the three artworks on their own prefixes", () => {
    expect(resolveRoute("GET", "/assets/fronts/5-circles.webp")).toEqual({ kind: "card-front", file: "5-circles.webp" });
    expect(resolveRoute("GET", "/assets/tiles/1-espada.webp")).toEqual({ kind: "tile-front", file: "1-espada.webp" });
    expect(resolveRoute("GET", "/assets/dice/1-espada.webp")).toEqual({ kind: "dice-asset", file: "1-espada.webp" });
    expect(resolveRoute("GET", "/assets/fronts/cup.webp")).toEqual({ kind: "card-front", file: "cup.webp" });
    expect(resolveRoute("GET", "/assets/tiles/cup.webp")).toEqual({ kind: "tile-front", file: "cup.webp" });
  });

  /**
   * The match role owns the colyseus matchmaking surface. This role must not
   * answer for it — a 404 here is the correct, honest answer, and the
   * deployment's path routing is what sends those elsewhere.
   */
  it("does not answer for the match role's matchmaking paths", () => {
    expect(resolveRoute("POST", "/matchmake/joinOrCreate/presence")).toEqual({ kind: "not-found" });
  });

  it("404s anything else", () => {
    expect(resolveRoute("GET", "/")).toEqual({ kind: "not-found" });
    expect(resolveRoute("GET", "/embed/extra")).toEqual({ kind: "not-found" });
    expect(resolveRoute("DELETE", "/embed")).toEqual({ kind: "not-found" });
  });
});
