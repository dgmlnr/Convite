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
      name: "l0-truco-engine-no-workspace-deps",
      severity: "error",
      comment:
        "truco-engine is pure L0 and must not depend on any other workspace package, platform-contract included: the domain must not know the platform exists.",
      from: { path: "^packages/games/truco-engine/src" },
      to: { path: "^(packages|apps)/", pathNot: "^packages/games/truco-engine/src" },
    },
    {
      name: "l1-no-l2-l3",
      severity: "error",
      comment: "L1 packages (platform-core, truco-bot, truco-ui) must not depend on L2 adapters or L3 apps.",
      from: { path: "^packages/(platform-core|games/truco-bot|games/truco-ui)/src" },
      to: { path: "^(packages/(games/truco-module|transport-colyseus|widget-sdk)|apps)/" },
    },
    {
      name: "l2-no-l3",
      severity: "error",
      comment: "L2 adapters (truco-module, transport-colyseus, widget-sdk) must not depend on L3 composition-root apps.",
      from: { path: "^packages/(games/truco-module|transport-colyseus|widget-sdk)/src" },
      to: { path: "^apps/" },
    },
    {
      name: "no-colyseus-outside-transport",
      severity: "error",
      comment:
        "colyseus (and its @colyseus/* internals) may only be imported from transport-colyseus. pnpm's isolated node_modules already makes an undeclared import fail to resolve elsewhere; this is a second, orthogonal, non-overlapping mechanical check on the same invariant, per design §1.",
      from: { pathNot: "^packages/transport-colyseus/src" },
      to: { path: "(^colyseus(/|$)|^@colyseus/|node_modules/(colyseus|@colyseus)/)" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.test\\.ts$|/dist/)" },
  },
};
