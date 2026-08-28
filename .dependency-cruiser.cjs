/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "l0-platform-contract-no-workspace-deps",
      severity: "error",
      comment: "platform-contract is pure L0 and must not depend on any other workspace package.",
      from: { path: "^packages/platform-contract/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/platform-contract/src" },
    },
    {
      name: "l0-widget-protocol-no-workspace-deps",
      severity: "error",
      comment: "widget-protocol is pure L0 and must not depend on any other workspace package.",
      from: { path: "^packages/widget-protocol/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/widget-protocol/src" },
    },
    {
      name: "l0-game-engine-no-workspace-deps",
      severity: "error",
      comment:
        "A game engine (packages/games/*-engine) is pure L0 and must not depend on any other workspace package, platform-contract included: the domain must not know the platform exists. Generalized from a per-package rule (was truco-engine-only) so a new engine is fenced the day it is scaffolded, per gotchas/cercados-no-se-heredan-a-juego-nuevo.",
      from: { path: "^packages/games/([^/]+-engine)/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/games/$1/src" },
    },
    {
      name: "l0-spanish-deck-ui-no-workspace-deps",
      severity: "error",
      comment:
        "spanish-deck-ui is pure L0 and must not depend on any other workspace package. The Spanish deck (oro/copa/espada/basto) is shared by every Spanish-deck game (truco today, escoba de 15 next per the roadmap) — it must not know truco exists, exactly like truco-engine must not know the platform exists.",
      from: { path: "^packages/spanish-deck-ui/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/spanish-deck-ui/src" },
    },
    {
      name: "l1-no-l2-l3",
      severity: "error",
      comment: "L1 packages (platform-core, truco-bot, truco-ui) must not depend on L2 adapters or L3 apps.",
      from: { path: "^packages/(platform-core|games/truco-bot|games/truco-ui)/src" },
      to: { path: "^(packages/(games/truco-module|transport-colyseus|widget-frontdoor|widget-sdk)|apps)/" },
    },
    {
      name: "l2-no-l3",
      severity: "error",
      comment: "L2 adapters (truco-module, transport-colyseus, widget-frontdoor, widget-sdk) must not depend on L3 composition-root apps.",
      from: { path: "^packages/(games/truco-module|transport-colyseus|widget-frontdoor|widget-sdk)/src" },
      to: { path: "^apps/" },
    },
    {
      name: "no-colyseus-outside-transport",
      severity: "error",
      comment:
        "Both the server SDK (colyseus) and the client SDK (@colyseus/sdk), plus every obsolete/internal @colyseus/* package (colyseus.js included — the frozen, misaligned browser client this workspace deliberately does NOT use), may only be imported from the two transport packages. FIXED (was inverted): the previous regex required `colyseus` to be followed immediately by `/` or end-of-string, which matches the bare `colyseus` package but NOT `colyseus.js` (an entirely different npm package name with a literal `.js` before the boundary) — so it silently let the obsolete client through while still correctly blocking the aligned one, since `@colyseus/sdk`'s resolved path already contained `node_modules/@colyseus/` and was blocked everywhere, transport packages included. `(\\.js)?` now covers both package names uniformly. pnpm's isolated node_modules already makes an undeclared import fail to resolve elsewhere; this is a second, orthogonal, non-overlapping mechanical check on the same invariant, per design §1.",
      from: { pathNot: "^packages/(transport-colyseus|transport-colyseus-client)/src" },
      to: { path: "(^colyseus(\\.js)?(/|$)|^@colyseus/|node_modules/(colyseus(\\.js)?|@colyseus)(/|$))" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.test\\.ts$|/dist/)" },
  },
};
