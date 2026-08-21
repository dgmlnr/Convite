/**
 * The widget's front door: the HTTP surface a browser touches before any
 * game room exists.
 *
 * WHY IT IS A PACKAGE. These modules used to live in `apps/server/src`, and
 * that was fine while exactly one process served everything. It stops being
 * fine the moment a SECOND composition root needs them:
 * `.dependency-cruiser.cjs` forbids an app depending on another app, so an
 * adapter shared by two composition roots has to be a package. Extracting
 * them is the enabling step for the mint/verify deployment split (handoff
 * §P4.3) — the role that holds the Ed25519 seed serves this front door, and
 * the match-serving replicas do not.
 *
 * WHAT BELONGS HERE. Everything is transport-agnostic: it takes a URL, an
 * origin, an address and its collaborators, and answers with a status and a
 * body. Nothing here knows about Express, colyseus, or a socket, which is
 * what makes it reusable by a second root and testable without one.
 * `config.ts`, `redis-client.ts` and `index.ts` deliberately stayed behind in
 * `apps/server` — they are composition-root concerns, not adapters.
 *
 * This is an L2 adapter in the layering `.dependency-cruiser.cjs` enforces:
 * it may use L0/L1 (platform-contract, widget-protocol, platform-core) and
 * must never reach into an app. The pre-existing
 * `no-colyseus-outside-transport` rule already guarantees the other half for
 * free — the front door serves plain HTTP and never runs a room.
 *
 * The extraction arrived in two commits, because the provider-owned reviewer
 * context accepts at most 32 evidence paths and moving all seven modules at
 * once came to 37. The first carried the leaf modules; this one completes the
 * package with the two request handlers, the shell they render and the
 * catalog they share — which had to travel together, since they depend on
 * each other.
 */
export { buildCatalog } from "./catalog.js";
export type { CatalogEntry } from "./catalog.js";
export { handleEmbedRequest } from "./embed-handler.js";
export type { EmbedRequestDeps, EmbedRequestResult } from "./embed-handler.js";
export { renderEmbedShell } from "./embed-shell.js";
export type { EmbedBootstrap } from "./embed-shell.js";
export { refererOrigin } from "./referer-origin.js";
export { handleSessionRenewRequest } from "./session-renew-handler.js";
export type { SessionRenewDeps, SessionRenewResult } from "./session-renew-handler.js";
export { serveCardFrontAsset } from "./static-deck-assets.js";
export { serveLoaderAsset, serveWidgetAppAsset } from "./static-widget-app.js";
export type { StaticAssetResult } from "./static-widget-app.js";
