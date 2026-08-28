#!/usr/bin/env node
/**
 * Runs the visual regression suite against a PINNED rendering stack.
 *
 * WHY THIS EXISTS. `visual/README.md`'s Portability section states the gap
 * honestly: pinning the font FILE fixes which glyphs are drawn, but not how
 * they are rasterized. FreeType, CoreText and DirectWrite each place
 * sub-pixels differently, so a committed baseline silently encodes the
 * machine that produced it, and the 1% pixelmatch tolerance was only ever
 * tuned on one of them. The suite could therefore fail on a colleague's
 * laptop or a CI runner for no reason anyone could act on.
 *
 * This script closes that by moving the ONE variable that matters — the
 * renderer — into a pinned container, while leaving everything else exactly
 * where it already is.
 *
 * WHY A BIND MOUNT RATHER THAN A HERMETIC IMAGE. A `Dockerfile` that copies
 * the repo and runs its own `pnpm install` was written first and deliberately
 * abandoned, and the reason is worth keeping: colyseus pulls `uWebSockets.js`
 * as a git tarball from codeload.github.com, which repeatedly timed out here
 * even at a ten-minute budget, and a `--filter` install does not help because
 * pnpm resolves every git dependency in the lockfile regardless of filter. An
 * image that only builds on a fast link is not hermetic, it is lucky.
 *
 * It is also the wrong tool for this job. Dependency resolution does not
 * rasterize anything; Chromium does. Bind-mounting the working tree and
 * letting the image supply only the OS and the browser pins precisely the
 * variable under test and nothing else — and it has the property a hermetic
 * image would not: what runs in the container is the code in the working
 * tree right now, not a snapshot of it.
 *
 * The image sets `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, so the
 * bind-mounted host `playwright` package resolves to the image's pinned
 * Chromium rather than the host's own download. That is the whole mechanism.
 *
 * MEASURED, not assumed: run against baselines generated on Arch Linux, 19
 * of the 20 reproduced inside `v1.62.1-noble` within tolerance. The single
 * exception was rebased onto this image, which is now the canonical
 * generator — see `visual/README.md`.
 *
 * Both distributions are FreeType, so this proves reproducibility across
 * machines, NOT the full cross-OS story. macOS and Windows will still drift
 * further; the answer for them is to run this script, not to re-tune the
 * tolerance.
 */
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Whether this module is being RUN rather than imported.
 *
 * The obvious spelling, ``import.meta.url === `file://${process.argv[1]}` ``,
 * is what this file shipped with, and it is only ACCIDENTALLY right. On
 * POSIX `argv[1]` is `/repo/scripts/x.mjs` and the concatenation happens to
 * match. On Windows `argv[1]` is a native backslash path
 * (`C:\repo\scripts\x.mjs`) while `import.meta.url` is
 * `file:///C:/repo/scripts/x.mjs`, so the comparison is ALWAYS false: the
 * runner body never executes and `pnpm test:visual` exits 0 having tested
 * nothing. A silently green test command is worse than a crash, which is why
 * this is a named, tested function rather than an inline expression.
 *
 * `pathToFileURL` is Node's own answer to exactly this question, and it also
 * percent-encodes characters a hand-built URL would leave raw — a repository
 * checked out under a path containing a space hit the same bug on Linux.
 */
export function isEntryPoint(importMetaUrl, invokedScriptPath) {
  if (invokedScriptPath === undefined) {
    return false;
  }
  return importMetaUrl === pathToFileURL(invokedScriptPath).href;
}

/**
 * The playwright version this repo depends on, mirrored from `package.json`.
 * Kept as a constant rather than read at runtime so the mismatch below is a
 * loud, one-line failure instead of a silent drift: bumping `playwright`
 * without bumping this is the exact regression that would have the suite
 * comparing against a Chromium nobody runs.
 */
export const PINNED_PLAYWRIGHT_VERSION = "1.62.1";

/**
 * Microsoft publishes one image per playwright release, and the browser
 * build inside it is what makes a baseline reproducible. `noble` is the
 * Ubuntu 24.04 LTS base — pinned rather than `latest` for the same reason
 * the version is.
 */
export function imageRefFor(playwrightVersion) {
  const exact = /^\D*(\d+\.\d+\.\d+)$/.exec(playwrightVersion);
  if (exact === null) {
    throw new Error(`Could not derive a container tag from playwright version "${playwrightVersion}" — expected an exact x.y.z, optionally range-prefixed.`);
  }
  return `mcr.microsoft.com/playwright:v${exact[1]}-noble`;
}

/**
 * Builds the full `docker run` argv. Pure, so `visual-container.test.ts` can
 * pin every flag whose absence causes a real, already-observed failure —
 * root-owned baselines, an unwritable vite cache, a floating image tag.
 *
 * The repo is mounted at its OWN absolute path rather than a fixed `/app`:
 * vitest reports failures with absolute paths, and a path that also exists
 * on the host is one a developer can click.
 */
export function resolveContainerRun({ repoRoot, uid, gid, image, args, config = "vitest.visual.config.ts" }) {
  // BOTH halves or neither. On Linux and macOS this maps the container's
  // writes back to the caller, so a regenerated baseline is not root-owned
  // in their own working tree. On Windows the ids do not exist, and Docker
  // Desktop does not need them — passing a literal "undefined:undefined"
  // there would fail the run for no reason.
  const user = uid !== undefined && gid !== undefined ? ["--user", `${uid}:${gid}`] : [];

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      ...user,
      "--volume",
      `${repoRoot}:${repoRoot}`,
      "--workdir",
      repoRoot,
      // The image's HOME is root's, which this run cannot write to; vite
      // re-optimizes its dependency cache on first use and needs one.
      "--env",
      "HOME=/tmp",
      "--env",
      "CI=1",
      image,
      "node_modules/.bin/vitest",
      "run",
      // Overridable ONLY so `pnpm visual:review` can render the render-only
      // scenes through the same pinned container. Everything else -- the
      // check gate, the host runner's refusal, the baseline discipline --
      // keeps the default, which is the one config that owns committed
      // baselines.
      "--config",
      config,
      ...args,
    ],
  };
}

/**
 * Whether an argv would make vitest WRITE baselines rather than verify them.
 *
 * `visual/README.md` tells developers never to do that from the host runner,
 * because the baseline would carry their own machine's rasterizer into the
 * repo — precisely the problem the container removes. That was documentation
 * only, and a rule with no enforcement is a suggestion; `scripts/visual-host.mjs`
 * uses this to make it real.
 *
 * Matched exactly, never by substring: a test file named
 * `update-notice.visual.test.ts` is not a request to rewrite anything.
 */
export function writesBaseline(args) {
  return args.some((arg) => arg === "-u" || arg === "--update" || arg.startsWith("--update="));
}

/**
 * Whether spawning a workspace CLI needs a shell on this platform.
 *
 * Windows is the only one that does, and it genuinely does — the same
 * decision `scripts/vitest-runner.mjs` already carries for `pnpm test`. A
 * pnpm-installed CLI is a `vitest.cmd` / `vitest.ps1` shim there, and Node's
 * spawn goes straight to `CreateProcess`, which can execute neither; it
 * wants a real `.exe`.
 *
 * It lives HERE rather than beside the host runner that uses it so that
 * `visual-container.test.ts` can pin it without importing the host runner —
 * importing a module whose body spawns vitest would start a second vitest
 * inside the first.
 */
export function hostSpawnNeedsShell(platform) {
  return platform === "win32";
}

/**
 * `process.getuid`/`getgid` are POSIX-only: on Windows they are ABSENT, not
 * throwing, so calling them unconditionally crashed this script before it
 * could do anything — which is a poor showing for the one command whose
 * entire purpose is making rendering independent of the operating system.
 *
 * Takes the process-like object as an argument rather than reading the
 * global so the Windows shape is reachable from a test on any platform.
 */
export function posixUserFor(processLike) {
  return {
    uid: typeof processLike.getuid === "function" ? processLike.getuid() : undefined,
    gid: typeof processLike.getgid === "function" ? processLike.getgid() : undefined,
  };
}

/* c8 ignore start — the spawn, deliberately thin; the decisions above are what is tested. */
if (isEntryPoint(import.meta.url, process.argv[1])) {
  const { uid, gid } = posixUserFor(process);
  // `--config <file>` is consumed HERE rather than forwarded, so vitest never
  // sees it twice: the container run always supplies exactly one.
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--config");
  const config = at === -1 ? undefined : argv[at + 1];
  const { command, args } = resolveContainerRun({
    repoRoot: process.cwd(),
    uid,
    gid,
    image: imageRefFor(PINNED_PLAYWRIGHT_VERSION),
    args: at === -1 ? argv : [...argv.slice(0, at), ...argv.slice(at + 2)],
    ...(config === undefined ? {} : { config }),
  });

  const child = spawn(command, args, { stdio: "inherit" });

  // Docker missing is the one failure worth translating: the raw ENOENT
  // says "spawn docker ENOENT", which reads as a broken script rather than
  // a missing tool, and the useful next step is not obvious from it.
  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      process.stderr.write(
        "Could not run docker, which this suite needs: baselines are generated by a pinned container so they do not encode the machine that made them (visual/README.md).\n" +
          "Install docker, or run `pnpm test:visual:host` to compare against your own renderer — expect disagreement on text-dense captures.\n",
      );
      process.exit(1);
    }
    throw error;
  });

  child.on("exit", (code, signal) => {
    process.exit(signal !== null ? 1 : (code ?? 1));
  });
}
/* c8 ignore stop */
