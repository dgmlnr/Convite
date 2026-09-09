import { describe, expect, it } from "vitest";

import { PINNED_PLAYWRIGHT_VERSION, buildWorkspace, hostSpawnNeedsShell, imageRefFor, isEntryPoint, posixUserFor, resolveContainerRun, workspaceBuildCommand, writesBaseline } from "./visual-container.mjs";

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
  const base = { repoRoot: "/home/dev/Convite", uid: 1000, gid: 1000, image: "mcr.microsoft.com/playwright:v1.62.1-noble", args: [] };

  it("runs docker, never the host browser", () => {
    expect(resolveContainerRun(base).command).toBe("docker");
  });

  it("mounts the repo at its own absolute path and works there", () => {
    const { args } = resolveContainerRun(base);

    expect(args).toContain("--volume");
    expect(args).toContain("/home/dev/Convite:/home/dev/Convite");
    expect(args[args.indexOf("--workdir") + 1]).toBe("/home/dev/Convite");
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

  /**
   * The regression this pins is a real one this script shipped with: the
   * entry point called `process.getuid()` unconditionally, and that API does
   * not exist on Windows — so the command meant to make rendering
   * OS-independent was the one command that could not start there.
   */
  describe("on a platform without POSIX user ids", () => {
    it("omits --user rather than passing undefined into docker", () => {
      const { args } = resolveContainerRun({ ...base, uid: undefined, gid: undefined });

      expect(args).not.toContain("--user");
      expect(args.join(" ")).not.toContain("undefined");
    });

    it("still mounts, still runs the suite", () => {
      const { args } = resolveContainerRun({ ...base, uid: undefined, gid: undefined });

      expect(args).toContain(`${base.repoRoot}:${base.repoRoot}`);
      expect(args.slice(args.indexOf(base.image) + 1)).toEqual(["node_modules/.bin/vitest", "run", "--config", "vitest.visual.config.ts"]);
    });

    /** A half-known identity is not an identity: docker needs both halves. */
    it("omits --user when only one half is known", () => {
      expect(resolveContainerRun({ ...base, gid: undefined }).args).not.toContain("--user");
      expect(resolveContainerRun({ ...base, uid: undefined }).args).not.toContain("--user");
    });
  });
});

/**
 * `visual/README.md` tells developers never to write a baseline from the
 * host runner, because it would bake their own machine's rasterizer into the
 * repo — the exact problem the container exists to remove. A rule with no
 * enforcement is a suggestion, and this is the enforcement.
 */
describe("writesBaseline", () => {
  it("recognises the long flag", () => {
    expect(writesBaseline(["--update"])).toBe(true);
  });

  it("recognises it among other arguments", () => {
    expect(writesBaseline(["table.visual.test.ts", "--update", "--reporter", "dot"])).toBe(true);
  });

  it("recognises the `=` form", () => {
    expect(writesBaseline(["--update=true"])).toBe(true);
  });

  it("recognises the short flag", () => {
    expect(writesBaseline(["-u"])).toBe(true);
  });

  it("leaves an ordinary verification run alone", () => {
    expect(writesBaseline([])).toBe(false);
    expect(writesBaseline(["table.visual.test.ts"])).toBe(false);
  });

  /** A file whose NAME contains the word must not trip the guard. */
  it("does not match a filename that merely mentions update", () => {
    expect(writesBaseline(["update-notice.visual.test.ts"])).toBe(false);
  });
});

/**
 * `scripts/vitest-runner.mjs` already documents why this matters, and the
 * host runner shipped without it: a pnpm-installed CLI is a `vitest.cmd` /
 * `vitest.ps1` shim on Windows, and Node's spawn without a shell goes to
 * `CreateProcess`, which can execute neither.
 */
/**
 * The regression this pins shipped, and it is the nastier kind of bug: the
 * runner guarded its entry point with ``import.meta.url === `file://${argv[1]}` ``,
 * which is only ACCIDENTALLY right. On POSIX `argv[1]` is `/repo/scripts/x.mjs`
 * and the concatenation happens to match. On Windows `argv[1]` is a native
 * backslash path (`C:\repo\scripts\x.mjs`) while `import.meta.url` is
 * `file:///C:/repo/scripts/x.mjs`, so the comparison is ALWAYS false — the
 * runner body never executes and `pnpm test:visual` exits 0 having tested
 * nothing. A silently green test command is worse than the crash it replaced.
 *
 * The Windows case cannot be asserted from here and is deliberately not
 * faked: `pathToFileURL` is platform-DEPENDENT, so on a Linux runner a
 * `C:\...` string is just a relative filename with odd characters in it.
 * Windows correctness comes from Node's own implementation, which is exactly
 * why the fix delegates to it instead of building the URL by hand.
 */
describe("isEntryPoint", () => {
  it("recognises the script it was invoked as", () => {
    expect(isEntryPoint("file:///repo/scripts/visual-container.mjs", "/repo/scripts/visual-container.mjs")).toBe(true);
  });

  /**
   * The discriminating case, and the one that DOES run on any platform: the
   * naive concatenation yields a literal space here, while the real answer
   * percent-encodes it. The shipped bug fails this test.
   */
  it("survives a path with characters a URL percent-encodes", () => {
    expect(isEntryPoint("file:///repo/my%20scripts/visual-container.mjs", "/repo/my scripts/visual-container.mjs")).toBe(true);
    expect(`file:///repo/my scripts/visual-container.mjs`).not.toBe("file:///repo/my%20scripts/visual-container.mjs");
  });

  it("says no when the module is merely imported by another entry point", () => {
    expect(isEntryPoint("file:///repo/scripts/visual-container.mjs", "/repo/scripts/run-vitest.mjs")).toBe(false);
  });

  /** No argv[1] at all — e.g. `node --eval`. Not an entry point. */
  it("says no when there is no invoked script", () => {
    expect(isEntryPoint("file:///repo/scripts/visual-container.mjs", undefined)).toBe(false);
  });
});

describe("hostSpawnNeedsShell", () => {
  it("asks for a shell on windows, where the CLI is a .cmd shim", () => {
    expect(hostSpawnNeedsShell("win32")).toBe(true);
  });

  it("does not on platforms where the binary is directly executable", () => {
    expect(hostSpawnNeedsShell("linux")).toBe(false);
    expect(hostSpawnNeedsShell("darwin")).toBe(false);
  });
});

describe("posixUserFor", () => {
  it("reads the ids when the platform provides them", () => {
    expect(posixUserFor({ getuid: () => 1000, getgid: () => 1000 })).toEqual({ uid: 1000, gid: 1000 });
  });

  /** Windows: the functions are simply absent, not throwing. */
  it("reports both ids as unknown when the APIs are absent", () => {
    expect(posixUserFor({})).toEqual({ uid: undefined, gid: undefined });
  });

  it("never invents an id from a half-present API", () => {
    expect(posixUserFor({ getuid: () => 1000 })).toEqual({ uid: 1000, gid: undefined });
  });
});

/**
 * THE REBUILD, WHICH IS WHAT MAKES THE PHOTOGRAPH OF THIS TREE.
 *
 * Every `@hexdev/*` import resolves through the importee's `exports`, which
 * point at its `dist/` — so without this the container renders whatever
 * `tsc -b` last emitted, which after a branch change is another branch's
 * code. It cost twice already: five scenes exploding inside
 * `generala-ui/dist/tray.js`, a file nobody had edited, and three review runs
 * hashing images of code that was not in the tree.
 */
describe("workspaceBuildCommand", () => {
  it("builds with the repo's own typescript through the running node, never a shim", () => {
    // `node_modules/.bin/tsc` and `pnpm exec tsc` are both `.cmd`/`.ps1` shims
    // on Windows, which Node's spawn cannot execute without a shell — the
    // identical trap `hostSpawnNeedsShell` exists for. The launcher script
    // handed to the Node already running needs neither.
    expect(workspaceBuildCommand("/usr/bin/node")).toEqual({ command: "/usr/bin/node", args: ["node_modules/typescript/bin/tsc", "-b"] });
  });

  it("builds the whole project graph, not one package", () => {
    // `-b` and nothing else: a `-p <package>` here would leave every OTHER
    // package's dist/ exactly as stale as it was.
    expect(workspaceBuildCommand("node").args).toEqual(["node_modules/typescript/bin/tsc", "-b"]);
  });
});

describe("buildWorkspace", () => {
  it("runs the build in the repository root, with its output on the terminal", () => {
    const calls: unknown[][] = [];
    buildWorkspace((...args: unknown[]) => { calls.push(args); return { status: 0 }; }, "node", "/repo");

    expect(calls).toEqual([["node", ["node_modules/typescript/bin/tsc", "-b"], { cwd: "/repo", stdio: "inherit" }]]);
  });

  it("lets the render proceed when the build succeeded", () => {
    expect(buildWorkspace(() => ({ status: 0 }), "node", "/repo")).toBe(true);
  });

  /**
   * THE ONE THAT MATTERS. A failed `tsc -b` leaves every dist/ exactly as it
   * was, so proceeding would render the previous build and call it this one —
   * the stale photograph, only now with a compile error scrolled off the top
   * of the log to explain it away.
   */
  it("refuses the render when the build failed", () => {
    expect(buildWorkspace(() => ({ status: 1 }), "node", "/repo")).toBe(false);
    expect(buildWorkspace(() => ({ status: 2 }), "node", "/repo")).toBe(false);
    expect(buildWorkspace(() => ({ status: null }), "node", "/repo")).toBe(false);
  });

  /** A compiler that could not be spawned at all is not a build that failed:
   * it is a broken checkout, and it says so instead of being reported as a
   * type error nobody can find. */
  it("rethrows when the compiler could not be started", () => {
    const missing = new Error("spawn node ENOENT");
    expect(() => buildWorkspace(() => ({ error: missing }), "node", "/repo")).toThrow(missing);
  });
});
