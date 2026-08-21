#!/usr/bin/env node
/**
 * Runs the visual suite against YOUR OWN browser — the non-canonical, fast
 * local check behind `pnpm test:visual:host`.
 *
 * It exists for one honest reason: pulling a rendering container to glance at
 * a change is heavy, and a developer iterating on a stylesheet wants an
 * answer now. What it must never become is a way to WRITE a baseline, because
 * a baseline written here carries this machine's font rasterizer into the
 * repo, and every other machine — and the canonical container — then
 * disagrees with it forever. `visual/README.md` said so already; this refuses
 * it, which is the difference between a rule and a wish.
 *
 * Verification runs pass straight through, `--update` does not.
 */
import { spawn } from "node:child_process";

import { hostSpawnNeedsShell, writesBaseline } from "./visual-container.mjs";

/* c8 ignore start — the spawn, deliberately thin; `writesBaseline` is what is tested. */
const args = process.argv.slice(2);

if (writesBaseline(args)) {
  process.stderr.write(
    "Refusing to write a baseline from the host runner: it would bake this machine's font rasterizer into the repo, which is exactly what the pinned container exists to prevent (visual/README.md).\n" +
      "Run `pnpm test:visual <file> --update` instead — same arguments, canonical renderer.\n",
  );
  process.exit(1);
}

const child = spawn("node_modules/.bin/vitest", ["run", "--config", "vitest.visual.config.ts", ...args], {
  stdio: "inherit",
  shell: hostSpawnNeedsShell(process.platform),
});

// Without this listener a spawn failure is an unhandled 'error' event, which
// Node throws — an uncaught exception instead of the clean exit the handler
// below implies. Same translation the container runner already does.
child.on("error", (error) => {
  process.stderr.write(
    `Could not start vitest for the host visual run: ${error.message}\n` + "Run `pnpm install` if node_modules is incomplete, or use `pnpm test:visual` for the canonical container run.\n",
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 1));
});
/* c8 ignore stop */
