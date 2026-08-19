/**
 * How `pnpm test` launches Vitest — the decision, with no side effects.
 *
 * Split out of `run-vitest.mjs` for one reason: this is the part that can go
 * quietly wrong. The spawn around it is three lines and cannot be tested
 * without launching a real browser; the choice of command, arguments,
 * environment and shell is pure, gates every run in the repo, and is fenced by
 * `vitest-runner.test.ts`. Importing this file must never start anything,
 * which is exactly why the entry point is a separate file.
 */

/**
 * Windows is the only platform that needs a shell, and it genuinely needs one.
 *
 * A pnpm-installed CLI is a `vitest.cmd` / `vitest.ps1` shim there, and Node's
 * spawn goes straight to `CreateProcess`, which cannot execute either — it
 * wants a real `.exe`. `pnpm test` used to be a plain script string that pnpm
 * handed to a shell, and the shell resolved the shim; routing it through
 * `spawn` without asking for one back is how that stops working.
 *
 * Everywhere else the shell is a liability, not a help: on Linux and macOS
 * `vitest` is an executable file with a shebang, which spawn runs directly,
 * and `shell: true` would only re-introduce word-splitting and quoting rules
 * for arguments that are currently passed through untouched.
 */
function needsShell(platform) {
  return platform === "win32";
}

/**
 * The virtual display is NOT enough on its own, and this is the part that
 * actually decides whether a window shows up.
 *
 * `xvfb-run` sets `DISPLAY`, and nothing else. On a Wayland session every
 * child still inherits `WAYLAND_DISPLAY` and can still reach the compositor's
 * socket, and Chromium prefers Wayland when it is offered one — so it ignores
 * the virtual X display entirely and opens a real window on the real screen.
 * The tests pass either way, which is exactly why this is easy to get wrong
 * and believe fixed.
 *
 * So the Wayland session is removed from the child's environment rather than
 * merely out-voted: with no socket named and the session declared X11, the
 * only display Chromium can find is the virtual one.
 *
 * Exported because `virtual-display.mjs` applies the exact same discipline at
 * config level. This shape is NOT how the two files recognize each other — a
 * plain X11 desktop login is byte-identical to it, which is why the wrapper
 * announces itself with `DISPLAY_REDIRECT_MARKER` below instead.
 */
export function x11OnlyEnv(env) {
  const x11 = { ...env, XDG_SESSION_TYPE: "x11" };
  delete x11.WAYLAND_DISPLAY;
  return x11;
}

/** How the wrapper tells the config shim "already handled". An explicit
 * marker, not an inference: the sanitized env's shape is indistinguishable
 * from a genuine X11 login, and reading that shape as proof the wrapper ran
 * would leave a direct vitest run on a real X11 session pointed at the real
 * screen. Only `resolveRunner`'s redirecting branch ever sets it. */
export const DISPLAY_REDIRECT_MARKER = "HEXDEV_DISPLAY_REDIRECTED";

/**
 * Answers one question: what should be spawned, and with what.
 *
 * Hiding the window is Linux-only, because `xvfb-run` is — and it is also
 * where it is needed, since macOS and Windows are not where this repo's headed
 * Chromium surprises anyone. `hasXvfb` is passed in rather than probed here so
 * the caller owns the one expensive, impure step and this stays a function you
 * can simply call with the case you want to check.
 *
 * @param {object} options
 * @param {NodeJS.Platform | string} options.platform - `process.platform`.
 * @param {boolean} options.hasXvfb - whether a virtual display was proven to start.
 * @param {Record<string, string | undefined>} options.env - the parent environment; never mutated.
 * @param {string[]} options.args - arguments to forward to Vitest.
 * @returns {{ command: string, args: string[], env: Record<string, string | undefined>, shell: boolean }}
 */
export function resolveRunner({ platform, hasXvfb, env, args }) {
  if (platform === "linux" && hasXvfb) {
    // `-a` picks a free display number instead of a fixed one, so two runs at
    // once (a watch in one terminal, a one-off in another) cannot collide.
    // The marker rides along so the config shim stands down (see its doc).
    return { command: "xvfb-run", args: ["-a", "vitest", ...args], env: { ...x11OnlyEnv(env), [DISPLAY_REDIRECT_MARKER]: "1" }, shell: false };
  }
  return { command: "vitest", args: [...args], env: { ...env }, shell: needsShell(platform) };
}

/**
 * What this process should exit with, given how the child ended.
 *
 * Node hands back exactly one of the two: a `code` for an ordinary exit, or a
 * `signal` for a killed one, with the other `null`. A killed run becomes
 * `128 + signum` — the shell's own convention, so 143 reads as SIGTERM
 * wherever it lands.
 *
 * Arithmetic rather than re-raising the signal on this process, which reads as
 * the more faithful option and is not: `process.kill(process.pid, signal)`
 * only QUEUES delivery, while `process.exit()` ends the process on the same
 * tick, so the exit wins and a killed run gets reported as a plain 1. Waiting
 * for the signal to land instead would hand the run's outcome to a race. This
 * is here, next to `resolveRunner`, for the same reason that one is: it is
 * pure, it is easy to get subtly wrong, and it is the sort of thing nobody
 * notices is broken until a CI job reports the wrong reason for dying.
 *
 * @param {number | null} code - the child's exit code, or null if it was signalled.
 * @param {string | null} signal - the signal that killed it, or null if it exited.
 * @param {Record<string, number>} signals - `os.constants.signals`.
 * @returns {number}
 */
export function exitCodeFor(code, signal, signals) {
  if (code !== null) return code;
  if (signal === null) return 1; // neither: nothing to report but failure
  // An unknown signal name still has to fail, and 128 alone says "killed"
  // without claiming a number this platform does not have.
  return 128 + (signals[signal] ?? 0);
}
