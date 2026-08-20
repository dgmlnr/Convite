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
export function resolveContainerRun({ repoRoot, uid, gid, image, args }) {
  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      // Written baselines belong to whoever ran the script, not to root.
      "--user",
      `${uid}:${gid}`,
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
      "--config",
      "vitest.visual.config.ts",
      ...args,
    ],
  };
}

/* c8 ignore start — the spawn, deliberately thin; the decisions above are what is tested. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { command, args } = resolveContainerRun({
    repoRoot: process.cwd(),
    uid: process.getuid(),
    gid: process.getgid(),
    image: imageRefFor(PINNED_PLAYWRIGHT_VERSION),
    args: process.argv.slice(2),
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
