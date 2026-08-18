/**
 * Where a direct `vitest` invocation gets its display redirected — the
 * decision, with no side effects.
 *
 * `run-vitest.mjs` already hides the headed Chromium window, but only for
 * runs that go THROUGH it. A `vitest run --project browser` typed by a tool,
 * a hook, an agent or a fresh clone bypasses the wrapper entirely and opens a
 * real window on the real screen — which has happened, repeatedly. The one
 * file that executes on EVERY invocation, however it was started, is
 * `vitest.config.ts`; so that is where the redirect has to live to be a true
 * default. This module is the config shim's brain, split out for the same
 * reason `vitest-runner.mjs` is the wrapper's: the side effects (spawning
 * `Xvfb`, mutating `process.env`) are a few untestable lines, while the
 * decision is pure, gates every run, and is fenced by
 * `virtual-display.test.ts`. Importing this file must never start anything.
 *
 * Unlike the wrapper's per-run `xvfb-run` display, this one is PERSISTENT: a
 * single `Xvfb :99` spawned on demand and left running, so the socket check
 * is cheap and every later run — from any tool — lands on the same virtual
 * screen already up.
 */

import { x11OnlyEnv } from "./vitest-runner.mjs";

/** One fixed display, so every invocation shares one persistent server
 * instead of leaking a fresh `Xvfb` per run. Chosen high to stay clear of
 * real sessions (`:0`, `:1`) and of `xvfb-run -a`'s upward scan. */
const PERSISTENT_DISPLAY = ":99";

/**
 * The X11 socket a display answers on. A decision worth pinning: probe the
 * wrong path and the shim either spawns a duplicate server every run or
 * trusts a display that is not there.
 *
 * @param {string} display - an X display name, e.g. `":99"`.
 * @returns {string}
 */
export function socketPathFor(display) {
  return `/tmp/.X11-unix/X${display.slice(1)}`;
}

/**
 * Vitest's own notion of "running under CI", which is std-env's: `CI` set to
 * anything except `""` or `"false"`. Matching it exactly matters in one
 * direction — a value std-env rejects means Vitest runs HEADED, and calling
 * that CI here would skip the redirect for the very run that opens a window.
 */
function isCI(env) {
  const ci = env.CI;
  return ci !== undefined && ci !== "" && ci !== "false";
}

/**
 * Answers one question: does this run need its display redirected, and is
 * the persistent display already up?
 *
 * `none` — nothing to do: not Linux (the only place headed Chromium
 * surprises anyone, and the only place `Xvfb` exists); or CI (Vitest runs the
 * browser project headless there, no window to hide); or the environment
 * already carries the wrapper's sanitized signature — no `WAYLAND_DISPLAY`
 * AND `XDG_SESSION_TYPE === "x11"` — meaning `run-vitest.mjs` has redirected
 * this run and a second redirect would only fight the first. Both halves of
 * the signature are required: a missing socket alone proves nothing, and a
 * declared-x11 session with `WAYLAND_DISPLAY` still named is exactly the
 * Wayland trap (Chromium prefers the compositor socket over any `DISPLAY`).
 *
 * `use` — the persistent display's socket exists: point the run at it.
 *
 * `spawn` — no socket yet: the caller must start `Xvfb` first, then apply
 * the same environment.
 *
 * `socketExists` is passed in rather than probed here so the caller owns the
 * one impure step and this stays a function you can call with the case you
 * want to check — the same shape as `resolveRunner`'s `hasXvfb`.
 *
 * @param {object} options
 * @param {NodeJS.Platform | string} options.platform - `process.platform`.
 * @param {Record<string, string | undefined>} options.env - the process environment; never mutated.
 * @param {(display: string) => boolean} options.socketExists - whether a display's X11 socket is present.
 * @returns {{ action: "none" } | { action: "use" | "spawn", display: string, env: Record<string, string | undefined> }}
 */
export function resolveDisplayRedirect({ platform, env, socketExists }) {
  if (platform !== "linux") return { action: "none" };
  if (isCI(env)) return { action: "none" };
  if (env.WAYLAND_DISPLAY === undefined && env.XDG_SESSION_TYPE === "x11") return { action: "none" };

  const sanitized = { ...x11OnlyEnv(env), DISPLAY: PERSISTENT_DISPLAY };
  return {
    action: socketExists(PERSISTENT_DISPLAY) ? "use" : "spawn",
    display: PERSISTENT_DISPLAY,
    env: sanitized,
  };
}
