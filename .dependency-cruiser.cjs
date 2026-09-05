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
      name: "l0-mahjong-tile-ui-no-workspace-deps",
      severity: "error",
      comment:
        "mahjong-tile-ui is pure L0 and must not depend on any other workspace package. It is the mahjong tile SET as artwork — the 42 faces, their images, the body they sit on and the credit CC BY-SA 4.0 requires — and it must not know that a solitaire exists, exactly like spanish-deck-ui must not know truco exists. Its own rule rather than a `*-ui` glob on purpose: the existing glob is `packages/games/*-ui`, which is L1 game presentation and MAY import its engine; this package sits at packages/ root beside spanish-deck-ui and is one tier lower. Widening that glob to reach here would have quietly granted every game UI the same restriction it does not have, and granted this package the imports it must not have.",
      from: { path: "^packages/mahjong-tile-ui/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/mahjong-tile-ui/src" },
    },
    {
      name: "l1-no-l2-l3",
      severity: "error",
      comment:
        "L1 packages (platform-core, plus every packages/games/*-bot and *-ui) must not depend on L2 adapters or L3 apps. Generalized from a hand-written package list — `from` was truco-bot|truco-ui|escoba-bot|escoba-ui, `to` was truco-module|escoba-module — onto the same packages/games/<game>-<role> directory convention l0-game-engine-no-workspace-deps already stands on, per gotchas/cercados-no-se-heredan-a-juego-nuevo. The trailing `/src` (from) and `/` (to) are what pin the suffix to the end of the directory segment, so `*-uikit` is not a `*-ui`. Measured before generalizing, on a bundle-free tree whose baseline is 199 modules / 593 dependencies: a scratch packages/games/zz-probe-ui importing escoba-module by RELATIVE path was cruised (200/594) with its edge resolved to packages/games/escoba-module/src/index.ts, and produced ZERO violations — the same silent shape PR #98 found on transport-colyseus-client, where the dependency count rose and no rule judged the new edge. The `to` half is the one nothing else covers: scripts/dependency-cruiser-layer-coverage.test.ts reads `from.path` only, so a new package added to a rule's `from` but forgotten in this rule's `to` still passes it. The non-game L2 packages stay enumerated: they sit at packages/ root and share no suffix, so a glob there would invent a naming convention ahead of the packages it fences — the same objection that keeps l0-spanish-deck-ui-no-workspace-deps explicit. `transport-colyseus-client` in the `to` list: it was in NO layer rule at all — an omission, not a decision — while its sibling `transport-colyseus` already appeared in both this rule's `to` and `l2-no-l3`'s `from`.",
      from: { path: "^packages/(platform-core|games/[^/]+-(bot|ui))/src" },
      to: { path: "^(packages/(games/[^/]+-module|transport-colyseus|transport-colyseus-client|widget-frontdoor|widget-sdk)|apps)/" },
    },
    {
      name: "l2-no-l3",
      severity: "error",
      comment:
        "L2 adapters (every packages/games/*-module, plus transport-colyseus, transport-colyseus-client, widget-frontdoor, widget-sdk) must not depend on L3 composition-root apps. The game modules are matched by the same directory convention l1-no-l2-l3 records, and the non-game ones stay enumerated for the reason recorded there. Measured before generalizing: a scratch packages/games/zz-probe-module importing apps/server/src/registry.js by RELATIVE path was cruised (200 modules / 594 dependencies against a 199/593 baseline) with its edge resolved to apps/server/src/registry.ts, and produced ZERO violations. `transport-colyseus-client` depends only on platform-contract/platform-core and is consumed only by apps/widget-app (L3) — the same shape as its sibling `transport-colyseus`, which this rule already covered.",
      from: { path: "^packages/(games/[^/]+-module|transport-colyseus|transport-colyseus-client|widget-frontdoor|widget-sdk)/src" },
      to: { path: "^apps/" },
    },
    {
      name: "no-pg-outside-platform-core",
      severity: "error",
      comment:
        "Every Postgres adapter takes an already-constructed `pg` Pool behind `import type { Pool } from \"pg\"` (design decision 1.5, mirrors redis-rate-limiter.ts:1's `import type { Redis } from \"ioredis\"`); the ONE value import of `pg` (`new Pool(...)`) is confined to packages/platform-core/src/postgres-client.ts. `from.pathNot` on purpose, never `from.path`: scripts/dependency-cruiser-layer-coverage.test.ts counts only `from.path` rules as tier assignments, and a blanket `from.path` rule here would silently disarm that fence, the same class of gap PR #98 found on transport-colyseus-client. `browser-safety.test.ts`'s `NODE_ONLY_PACKAGES` catches a value import re-exported from the public barrel; this rule catches the same value import reached from ANY package or app, not just the barrel — depcruise's own `doNotFollow: node_modules` cannot see a workspace-package-to-workspace-package edge cross a barrel, but it resolves a plain npm specifier like `pg` directly, which is exactly what this rule needs.",
      from: { pathNot: "^packages/platform-core/src" },
      to: { path: "(^pg(/|$)|node_modules/pg(/|$))" },
    },
    {
      name: "no-admin-internals-outside-admin",
      severity: "error",
      comment:
        "Design §10 layer 2's residual case (tasks 10.8/10.9, threat matrix row 'Audit boundary violation'): l1-no-l2-l3/l2-no-l3 already forbid every PACKAGE from importing apps/** (design §1.6's own `to:` globs), but `apps/**` is ALSO globbed OUT of both rules' `from:` — `scripts/dependency-cruiser-layer-coverage.test.ts:34`'s own 'apps are the top composition-root tier' — so an APP importing another app's internals (e.g. apps/mint-server reaching directly into apps/admin/src/audit-log.ts) is a hole neither existing rule's `from` can close. Proven empirically before this rule existed: a temporary probe import of apps/admin/src/audit-log.js from apps/mint-server/src/index.ts produced `no dependency violations found`. `from.pathNot` on purpose, never `from.path`: scripts/dependency-cruiser-layer-coverage.test.ts counts only `from.path` rules as tier assignments, and a blanket `from.path` rule here would silently disarm that fence, the exact class of gap PR #98 found on transport-colyseus-client (Part A tasks §0.4's own recorded rule).",
      from: { pathNot: "^apps/admin/" },
      to: { path: "^apps/admin/" },
    },
    {
      name: "no-ui-framework-outside-admin",
      severity: "error",
      comment:
        "Design §13.1/§5.2, task 13b.7: apps/admin is the ONLY app that lifts the zero-new-framework convention (decision #3684 item 5a) — nobody embeds the panel, unlike apps/widget-app, which apps/widget-app's own browser-safety.test.ts already fences from the OTHER side (a value import reachable from its bundle). react/react-dom/@radix-ui/tailwindcss reaching anywhere outside apps/admin would spread that lifted convention silently. `from.pathNot` on purpose, never `from.path`: scripts/dependency-cruiser-layer-coverage.test.ts counts only `from.path` rules as tier assignments, and a blanket `from.path` rule here would silently disarm this fence, the exact class of gap PR #98 found on transport-colyseus-client (Part A tasks §0.4's own recorded rule) — proven empirically before this rule existed: a temporary `import \"react\"` probe in apps/mint-server/src/index.ts produced `no dependency violations found` (288 modules/834 dependencies cruised, nothing flagged). Fenced under React specifically rather than under a framework-neutral name because the design's own rejected-Vue comparison (§13.1) notes this rule is STRONGER under React than it would have been under a Vue SFC setup: dependency-cruiser parses `.tsx` natively but has no `.vue` parser, so a Vue single-file component's own `<script>` imports would have been invisible to it.",
      from: { pathNot: "^apps/admin/" },
      to: { path: "(^react(-dom)?(/|$)|^@radix-ui/|^tailwindcss(/|$)|node_modules/(react(-dom)?|@radix-ui/[^/]+|tailwindcss)(/|$))" },
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
    // Every rule above matches on `path: "^(packages|apps)/"`. Without this,
    // dependency-cruiser cannot resolve `@hexdev/*` at all (its `exportsFields: []`
    // default vs. these `exports`-only ESM packages), leaves 127 edges as raw
    // `@hexdev/...` specifiers that no `^(packages|apps)/` regex can ever match, and
    // reports a green run while enforcing nothing. `webpackConfig` is the only
    // config surface that accepts an enhanced-resolve `alias` — the schema for
    // `enhancedResolveOptions` rejects it. See the header of the file it points at.
    webpackConfig: { fileName: ".dependency-cruiser-resolve.mjs" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.test\\.ts$|/dist/)" },
  },
};
