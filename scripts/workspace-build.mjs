/**
 * THE BUILD THAT HAS TO HAPPEN BEFORE ANY CROSS-PACKAGE CODE RUNS.
 *
 * Every `@hexdev/*` import resolves through the importee's `exports`, which
 * point at its `dist/`. So anything reaching across a package boundary — a
 * render, a test, a script — sees whatever `tsc -b` last emitted, which after
 * a branch change or a source edit is NOT the code in the working tree.
 *
 * IT HAS COST THREE TIMES, and never once looked like staleness:
 *
 *  1. Five scenes blew up inside `generala-ui/dist/tray.js`, a file nobody had
 *     edited.
 *  2. Three review runs hashed images of code that was not in the tree.
 *     `.gitignore:70` keeps scene captures out of git, so `git diff` could not
 *     contradict a stale render either.
 *  3. THE MUTATION LADDER — every negative control in this repo — was
 *     measuring `dist/`. Demonstrated rather than argued: with `mayWrite`
 *     mutated to `return true` in `generala-engine`, `generala-module`'s own
 *     tests reported **34 passed, exit 0**. One `tsc -b` later, the identical
 *     mutation and the identical command gave two failed files and exit 1.
 *     A negative control that cannot go red is not a control, and this one
 *     could not go red for a reason that had nothing to do with the assertion.
 *
 * The first two were fixed by moving the build into the visual scripts;
 * `AGENTS.md` carried it as a rule — "run `tsc -b` first" — and a rule that
 * depends on everyone remembering is not a fix. The third stayed open because
 * the unit-test path never got the same treatment, which is why this now lives
 * in its own module instead of inside a visual one: THREE callers need it
 * (`visual-container`, `visual-host`, `run-vitest`), and the third is the one
 * every mutation goes through. `visual-review` names it in prose only.
 */

/**
 * `node <typescript>/bin/tsc` rather than `pnpm exec tsc` or
 * `node_modules/.bin/tsc`: on Windows those two are `.cmd`/`.ps1` shims that
 * Node's spawn cannot execute at all without a shell — the identical trap
 * `hostSpawnNeedsShell` exists for. Handing the launcher script to the Node
 * already running needs no shim and no shell anywhere.
 *
 * Pure, so a test can pin the argv without compiling anything.
 */
export function workspaceBuildCommand(nodeExecPath) {
  return { command: nodeExecPath, args: ["node_modules/typescript/bin/tsc", "-b"] };
}

/**
 * Runs it and answers ONE question: may the run proceed? A false here has to
 * stop the caller — running against a `dist/` that failed to compile is the
 * very stale-code case this exists to close, only louder.
 *
 * Takes `spawnSync` as an argument so a test can prove the verdict for a
 * failing build without a failing build.
 */
export function buildWorkspace(spawnSyncImpl, nodeExecPath, repoRoot) {
  const { command, args } = workspaceBuildCommand(nodeExecPath);
  const result = spawnSyncImpl(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error !== undefined && result.error !== null) throw result.error;
  return result.status === 0;
}
