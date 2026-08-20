import { describe, expect, it } from "vitest";

import { PINNED_PLAYWRIGHT_VERSION, imageRefFor, resolveContainerRun } from "./visual-container.mjs";

/**
 * Both functions here are pure precisely so this file can exist — the
 * `spawn` around them is three lines and untestable without pulling a
 * multi-gigabyte image. What CAN silently regress is the argv: a dropped
 * `--user` writes root-owned baselines into the developer's working tree, a
 * dropped `HOME` makes vite fail on an unwritable cache, and a stale image
 * tag would quietly measure a DIFFERENT Chromium than the one this repo
 * depends on — which is the single thing the whole container exists to pin.
 */
describe("imageRefFor", () => {
  it("pins the image to the playwright version the repo actually depends on", () => {
    expect(imageRefFor("1.62.1")).toBe("mcr.microsoft.com/playwright:v1.62.1-noble");
  });

  it("tolerates a caret range, because that is how package.json states it", () => {
    expect(imageRefFor("^1.62.1")).toBe("mcr.microsoft.com/playwright:v1.62.1-noble");
  });

  it("refuses a version it cannot parse rather than guessing a tag", () => {
    expect(() => imageRefFor("latest")).toThrow(/playwright version/i);
  });

  /**
   * The regression this pins is "bump playwright, forget the image": the
   * suite would keep passing against baselines rendered by a Chromium that
   * no longer matches the one developers run.
   */
  it("keeps the constant and the derived tag in agreement", () => {
    expect(imageRefFor(PINNED_PLAYWRIGHT_VERSION)).toContain(PINNED_PLAYWRIGHT_VERSION);
  });
});

describe("resolveContainerRun", () => {
  const base = { repoRoot: "/home/dev/HexDev-Gamify", uid: 1000, gid: 1000, image: "mcr.microsoft.com/playwright:v1.62.1-noble", args: [] };

  it("runs docker, never the host browser", () => {
    expect(resolveContainerRun(base).command).toBe("docker");
  });

  it("mounts the repo at its own absolute path and works there", () => {
    const { args } = resolveContainerRun(base);

    expect(args).toContain("--volume");
    expect(args).toContain("/home/dev/HexDev-Gamify:/home/dev/HexDev-Gamify");
    expect(args[args.indexOf("--workdir") + 1]).toBe("/home/dev/HexDev-Gamify");
  });

  /**
   * Without this the container writes as root, and a regenerated baseline
   * lands in the working tree owned by a user the developer is not — which
   * `git` then reports as a modification nobody can stage.
   */
  it("runs as the invoking user so written baselines stay owned by them", () => {
    const { args } = resolveContainerRun(base);

    expect(args[args.indexOf("--user") + 1]).toBe("1000:1000");
  });

  /**
   * The image's own HOME is root's. Vite re-optimizes its dependency cache
   * on first run inside the container and needs somewhere writable.
   */
  it("gives the run a writable HOME", () => {
    const { args } = resolveContainerRun(base);

    expect(args).toContain("HOME=/tmp");
  });

  it("removes the container rather than leaving one per run", () => {
    expect(resolveContainerRun(base).args).toContain("--rm");
  });

  /**
   * The visual project is headless unconditionally by config, but the unit
   * `browser` project keys off CI — setting it keeps any future shared
   * setup on the headless path inside the container too.
   */
  it("marks the run as CI", () => {
    expect(resolveContainerRun(base).args).toContain("CI=1");
  });

  it("invokes the workspace vitest against the visual config", () => {
    const { args } = resolveContainerRun(base);
    const tail = args.slice(args.indexOf(base.image) + 1);

    expect(tail).toEqual(["node_modules/.bin/vitest", "run", "--config", "vitest.visual.config.ts"]);
  });

  /**
   * `--update` is how a baseline is deliberately rebased onto the pinned
   * renderer; a file filter is how the README's "run the SPECIFIC file"
   * rule stays reachable from inside the container.
   */
  it("forwards caller arguments after the config, in order", () => {
    const { args } = resolveContainerRun({ ...base, args: ["game-selection.visual.test.ts", "--update"] });
    const tail = args.slice(args.indexOf(base.image) + 1);

    expect(tail).toEqual(["node_modules/.bin/vitest", "run", "--config", "vitest.visual.config.ts", "game-selection.visual.test.ts", "--update"]);
  });

  it("passes the pinned image, never a floating tag", () => {
    expect(resolveContainerRun(base).args).toContain("mcr.microsoft.com/playwright:v1.62.1-noble");
  });
});
