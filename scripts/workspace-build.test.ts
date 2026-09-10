import { describe, expect, it } from "vitest";
import { buildWorkspace, workspaceBuildCommand } from "./workspace-build.mjs";

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
