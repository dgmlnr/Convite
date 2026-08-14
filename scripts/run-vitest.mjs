#!/usr/bin/env node
/**
 * Runs Vitest, and keeps its browser window off the developer's screen.
 *
 * WHY THIS EXISTS AT ALL. The `browser` project in `vitest.config.ts` runs
 * Chromium HEADED on a developer's machine — deliberately, and that choice is
 * argued at the config itself: headed is what a player runs, and it is what
 * `table-height-stability`'s hundredth-of-a-pixel constants were calibrated
 * against. Headless is not a free tidy-up; it moves those numbers and hides a
 * real one. So the window is not the thing to remove — SEEING it is.
 *
 * A virtual display gives exactly that: the same headed Chromium, rendering
 * identically, on a screen nobody is looking at. Verified rather than assumed
 * — the height fence reports the same 28/28 and the full suite the same 1013,
 * with and without it.
 *
 * WHY A WRAPPER RATHER THAN A SECOND SCRIPT. It was a `test:hidden` script
 * first, and that was wrong: an opt-in only helps whoever remembers it, and
 * the runs that actually surprise you are the ones you did not type — a tool,
 * a hook, an agent, a fresh clone. Hiding the window has to be what happens by
 * DEFAULT or it does not really happen. Hence one entry point, and no second
 * way to run the suite that behaves differently.
 *
 * WHICH MEANS IT MUST NEVER BE THE REASON A RUN FAILS. Every `pnpm test` in
 * the repo now goes through here, so any way this file can break is a way the
 * suite can go red for a reason that has nothing to do with the code under
 * test. Two things follow, and both are load-bearing rather than defensive
 * habit: the probe below proves a virtual display can actually START before
 * anything is routed through one, and a machine that cannot provide one runs
 * Vitest directly — visibly, and out loud, but working. CI sets `CI`, which
 * Vitest already reads to run headless, so it has no window to hide anyway.
 *
 * Everything that can be decided rather than performed lives in
 * `vitest-runner.mjs` and is tested there — which command to run, and what to
 * exit with. What is left here is only the part that genuinely has to touch
 * the machine: the probe, the spawn, and the wiring between them.
 *
 * Invoked from a package script, never by hand — it resolves `vitest` off the
 * PATH, which is `node_modules/.bin` only while pnpm is running the script.
 * `node scripts/run-vitest.mjs` from a bare shell fails, and correctly so:
 * 127 from `xvfb-run`'s own shell where a virtual display was found, and 1
 * with a named `could not start vitest` where Vitest is spawned directly.
 */
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:os";

import { exitCodeFor, resolveRunner } from "./vitest-runner.mjs";

/** Long enough that a slow machine is never mistaken for a broken one, short
 * enough that a hung `Xvfb` cannot hold the suite hostage. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Starts a virtual display, runs `true` on it, and tears it down.
 *
 * Asking `xvfb-run --help` whether it exists was the earlier version of this
 * and it answered the wrong question. `xvfb-run` is a shell script; it can be
 * installed, executable and perfectly happy to print its help while the `Xvfb`
 * binary it actually needs is missing or broken. Route the suite through that
 * and the child's non-zero exit arrives as if the TESTS had failed — a red
 * suite whose real cause is an absent X server, introduced by the very file
 * that was supposed to be invisible.
 *
 * So the probe does the whole dance instead, because the whole dance is cheap:
 * `-w 0` drops `xvfb-run`'s fixed post-start sleep, which is pure padding here
 * — `-a` already blocks on `Xvfb` reporting its display number through
 * `-displayfd`, so a display that answers has genuinely come up. Measured at
 * 8ms against 3s for the padded form.
 */
function probeVirtualDisplay(xvfbArgs) {
  const probe = spawnSync("xvfb-run", [...xvfbArgs, "true"], { stdio: "ignore", timeout: PROBE_TIMEOUT_MS });
  if (probe.error !== undefined) {
    // `ENOENT` is "no xvfb-run here" — the ordinary, expected answer on macOS,
    // Windows and a bare Linux box. Anything else (a timeout, a permissions
    // problem) means it IS here and could not be used, which is worth saying.
    return { ok: false, installed: probe.error.code !== "ENOENT", answered: false };
  }
  return { ok: probe.status === 0, installed: true, answered: true };
}

function findVirtualDisplay() {
  if (process.platform !== "linux") return { ok: false, installed: false };

  const fast = probeVirtualDisplay(["-a", "-w", "0"]);
  // A clean answer either way is the end of it. Only a real non-zero EXIT is
  // ambiguous: it is what a broken `Xvfb` looks like, and also what an
  // `xvfb-run` too old to understand `-w` would look like. Paying 3s once to
  // tell those apart is worth it, because guessing wrong the second way puts a
  // browser window back on someone's screen for no reason.
  if (fast.ok || !fast.answered) return fast;
  return probeVirtualDisplay(["-a"]);
}

const display = findVirtualDisplay();
if (display.installed && !display.ok) {
  console.warn("run-vitest: `xvfb-run` is installed but could not start a virtual display — is `Xvfb` itself present?");
  console.warn("run-vitest: running Vitest directly instead. The suite is unaffected; the browser window will just be visible.");
}

const { command, args, env, shell } = resolveRunner({
  platform: process.platform,
  hasXvfb: display.ok,
  env: process.env,
  args: process.argv.slice(2),
});

const child = spawn(command, args, { stdio: "inherit", shell, env });
// The child's fate, reported unchanged — a test runner that softened either
// half would make every caller above it lie. The arithmetic, and why a signal
// is not re-raised, live with `exitCodeFor` so they can be tested.
child.on("exit", (code, signal) => {
  process.exit(exitCodeFor(code, signal, constants.signals));
});
child.on("error", (error) => {
  console.error(`run-vitest: could not start ${command}:`, error.message);
  process.exit(1);
});
