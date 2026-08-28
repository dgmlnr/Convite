import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

import { resolveDisplayRedirect, socketPathFor } from "./scripts/virtual-display.mjs";

/**
 * Config-level display redirect — the one that covers EVERYONE.
 *
 * `scripts/run-vitest.mjs` hides the browser project's headed Chromium, but
 * only for invocations that go through it; a direct `vitest run --project
 * browser` — typed by a tool, a hook, an agent, a fresh clone — bypasses the
 * wrapper and opens a window on the developer's screen. This file executes on
 * every invocation no matter how Vitest was started, so the redirect lives
 * here and the wrapper is belt-and-braces on top.
 *
 * The Wayland lesson, learned the hard way and worth repeating: `DISPLAY`
 * alone is NOT enough. Chromium prefers the compositor when
 * `WAYLAND_DISPLAY` names one, however `DISPLAY` is set — so the redirect
 * must also unname the socket and declare the session X11, which is exactly
 * what the resolver's sanitized env does.
 *
 * All decisions live in `scripts/virtual-display.mjs` (tested); what remains
 * here is only what must touch the machine: one detached, persistent
 * `Xvfb :99` spawned on demand and left running, a bounded wait for its
 * socket, and the `process.env` mutation. If the spawn fails or the socket
 * never appears, one loud warning and the run proceeds untouched — a visible
 * window is the fallback, never a broken run.
 */
const redirect = resolveDisplayRedirect({
  platform: process.platform,
  env: process.env,
  socketExists: (display) => existsSync(socketPathFor(display)),
});
if (redirect.action !== "none" && (redirect.action === "use" || spawnPersistentXvfb(redirect.display))) {
  for (const key of Object.keys(process.env)) {
    if (!(key in redirect.env)) delete process.env[key];
  }
  Object.assign(process.env, redirect.env);
}

function spawnPersistentXvfb(display: string): boolean {
  const socket = socketPathFor(display);
  try {
    const xvfb = spawn("Xvfb", [display, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"], {
      detached: true,
      stdio: "ignore",
    });
    // A missing `Xvfb` binary surfaces as an async `error` event; without a
    // listener that becomes an uncaught exception — the one thing this shim
    // must never cause. Failure is detected below instead, as a missing
    // socket (immediately, via the undefined pid, so nobody waits 2s for it).
    xvfb.on("error", () => {});
    xvfb.unref();
    if (xvfb.pid !== undefined) {
      // Config evaluation is synchronous anyway, so wait synchronously:
      // bounded at 2s, in 50ms steps. `Atomics.wait` is the dependency-free
      // sleep that burns no CPU doing it.
      const lock = new Int32Array(new SharedArrayBuffer(4));
      const deadline = Date.now() + 2_000;
      while (!existsSync(socket) && Date.now() < deadline) {
        Atomics.wait(lock, 0, 0, 50);
      }
      if (existsSync(socket)) return true;
    }
  } catch {
    // Fall through to the warning — same contract as the wrapper: this file
    // must never be the reason a run fails.
  }
  console.warn(
    `vitest.config: could not start Xvfb on ${display} (spawn failed or its socket never appeared) — ` +
      "running with the real display instead. The suite is unaffected; the browser window will just be visible.",
  );
  return false;
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          // `scripts/` is in here for one file: `scripts/vitest-runner.test.ts`.
          // The wrapper that decides how `pnpm test` launches Vitest lives
          // outside `packages/`/`apps/`, and it now gates every run in the
          // repo — including this one. Left out of `include` its test would
          // never execute, which is worse than not having written it.
          // `e2e/support/` is in here for the same reason and with the same
          // narrowness: the harness's own pure helpers gate every e2e run,
          // and a helper whose test never executes is worse than one with no
          // test at all. Scoped to `support/` deliberately — the specs
          // themselves are `*.e2e.test.ts` at the `e2e/` root and belong to
          // the separate, opt-in `pnpm test:e2e` project, which spawns real
          // servers and a real browser.
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts", "e2e/support/**/*.test.ts"],
          // `.redis.test.ts` files require a real Redis (Docker container)
          // and run only via the separate `pnpm test:redis` project
          // (`vitest.redis.config.ts`) — the default unit suite stays
          // genuinely Redis-free, matching the in-memory default deployment.
          // `.visual.test.ts` files require the separate, opt-in
          // `pnpm test:visual` project (`vitest.visual.config.ts`) — same
          // "not part of `pnpm test`" discipline as `.redis.test.ts` below,
          // for the reason documented in that config's own header comment.
          exclude: ["**/*.browser.test.ts", "**/*.redis.test.ts", "**/*.visual.test.ts", "**/*.scene.test.ts", "**/dist/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "browser",
          include: [
            "packages/games/truco-engine/**/*.browser.test.ts",
            "packages/games/truco-ui/**/*.browser.test.ts",
            "packages/widget-sdk/**/*.browser.test.ts",
            "apps/widget-app/**/*.browser.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          browser: {
            enabled: true,
            // `headless` is deliberately LEFT UNSET, which means Vitest's own
            // default: follow `process.env.CI`. Headless in CI, headed on a
            // developer's machine.
            //
            // That is not an oversight, and setting `headless: true` here is
            // a trap worth naming, because it looks like an obvious tidy-up.
            // This project measures REAL LAYOUT — `table-height-stability`
            // asserts window heights to the hundredth of a pixel — and the two
            // modes did not always agree on them. The disagreement was never
            // about the browser: headed Chromium resolves `system-ui` to one
            // installed face and headless resolves it to another, and every
            // table box whose height was `line-height: normal` reported that
            // font's opinion instead of a layout constant. Chased to zero one
            // element at a time, each with a fence that pins the PROPERTY
            // rather than a number — `trick-feedback-line-box`,
            // `banner-lane-line-box`, `scoreboard-panel-line-box`,
            // `relation-label-line-box`. The last of those closed the final
            // symptom (the four 2v2 rows of `table-height-stability`, which
            // headless read 2.000000px taller than headed), so both modes now
            // measure identically and the whole suite is green either way.
            //
            // Headed stays the default anyway, for a reason that outlives that
            // history: it is the mode a player actually runs, and it is the
            // mode a layout fence should be calibrated against. A future
            // divergence between the two is a real signal, and it should be
            // read the way these four were — as a box whose height a font is
            // still deciding — never buried under recalibrated constants.
            //
            // Nobody has to look at that window, though: the shim at the top
            // of this file redirects EVERY invocation — wrapper or not — to a
            // persistent virtual display, and `scripts/run-vitest.mjs` adds
            // its own `xvfb-run` redirect on top for the runs that go through
            // it. The window still exists and still renders identically —
            // verified, the same totals under `pnpm test` and `CI=1 pnpm
            // test` — it is simply not on anyone's screen.
            // `vitest.visual.config.ts` is a separate project and pins
            // `headless: true` for its own reason; see its comment.
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
