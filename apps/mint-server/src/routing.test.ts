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
