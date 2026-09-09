#!/usr/bin/env node
/**
 * The widget bundle has a size budget, and CI enforces it.
 *
 * WHY THIS EXISTS, AND IT IS NOT A STYLE PREFERENCE. A careless import once
 * pulled `ioredis` into the browser bundle through a barrel file: 103 modules
 * and 285 kB became 170 and 441 kB, and the widget STOPPED MOUNTING
 * ENTIRELY. Nothing failed. No test went red. The bundle simply grew by half
 * and the product broke in a way only a person opening a page would notice.
 * `packages/platform-core/src/browser-safety.test.ts` fences that specific
 * import; this fences the shape of the failure.
 *
 * WHAT IS MEASURED, AND WHY ONLY THIS. `widget-app.js` is what a tenant's
 * page downloads and parses before anything renders — the one number that
 * costs a real visitor real time. The dice and card images are NOT in it:
 * they are served from their own routes and fetched lazily by the screens
 * that draw them, which `apps/mint-server/src/routing.ts` and
 * `packages/widget-frontdoor/src/static-dice-assets.ts` arrange. Measuring
 * them here would punish art that costs nothing until it is shown.
 *
 * HOW THE BUDGET WAS CHOSEN. Measured, not guessed: the bundle was 585 953
 * bytes when this file was written, immediately after Generala shipped. The
 * budget is 660 000, leaving about 74 kB of headroom, and it was chosen
 * against the two cases it has to tell apart: the careless import that
 * motivated this added 156 kB and trips it immediately, while Generala — a
 * whole game, engine, bot, board and all — added 61 kB and does not.
 *
 * WHEN IT FIRES LEGITIMATELY. A real feature can push past the budget. The
 * answer is to RAISE THIS NUMBER IN A COMMIT THAT SAYS WHY — which is the
 * whole point: the growth becomes a decision somebody made on purpose,
 * visible in the history, instead of a number nobody was watching.
 */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BUDGET_BYTES = 660_000;
const MEASURED_AT_WRITE = 585_953;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(repoRoot, "apps/widget-app/dist-app/widget-app.js");

let size;
try {
  size = statSync(bundle).size;
} catch {
  console.error(
    `bundle-budget: no encontré ${bundle}\n` +
      `  El bundle no está construido. Corré: pnpm --filter @hexdev/widget-app build`,
  );
  process.exit(2);
}

const pct = ((size / BUDGET_BYTES) * 100).toFixed(1);
const delta = size - MEASURED_AT_WRITE;
const sign = delta >= 0 ? "+" : "";

if (size > BUDGET_BYTES) {
  console.error(
    `bundle-budget: FUERA DE PRESUPUESTO\n` +
      `  widget-app.js: ${size.toLocaleString("es-AR")} bytes\n` +
      `  presupuesto:   ${BUDGET_BYTES.toLocaleString("es-AR")} bytes\n` +
      `  excedente:     ${(size - BUDGET_BYTES).toLocaleString("es-AR")} bytes\n\n` +
      `  Si el crecimiento es legítimo, subí BUDGET_BYTES en scripts/bundle-budget.mjs\n` +
      `  en un commit que diga por qué. Si no lo es, buscá qué entró de más:\n` +
      `    pnpm --filter @hexdev/widget-app build && rg -o 'node_modules/[^/\\"]+' apps/widget-app/dist-app/widget-app.js | sort | uniq -c | sort -rn | head`,
  );
  process.exit(1);
}

console.log(
  `bundle-budget: ${size.toLocaleString("es-AR")} bytes / ${BUDGET_BYTES.toLocaleString("es-AR")} (${pct}% del presupuesto, ${sign}${delta.toLocaleString("es-AR")} desde que se fijó)`,
);
