import { describe, expect, it } from "vitest";

import { exitCodeFor, resolveRunner } from "./vitest-runner.mjs";

/**
 * `resolveRunner` is a pure function precisely so this file can exist. The
 * spawn around it is three lines and untestable without launching a real
 * browser; the DECISION is the part that can silently regress, and it gates
 * every `pnpm test` in the repo, so it is the part that gets pinned here.
 */
describe("resolveRunner", () => {
  const waylandEnv = { WAYLAND_DISPLAY: "wayland-0", XDG_SESSION_TYPE: "wayland", PATH: "/usr/bin" };

  describe("linux with a working xvfb-run", () => {
    it("routes vitest through a virtual display", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run"] });

      expect(runner.command).toBe("xvfb-run");
      expect(runner.args).toEqual(["-a", "vitest", "run"]);
    });

    it("strips WAYLAND_DISPLAY so chromium cannot reach the real compositor", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run"] });

      expect(runner.env).not.toHaveProperty("WAYLAND_DISPLAY");
      expect(runner.env.XDG_SESSION_TYPE).toBe("x11");
    });

    it("leaves the caller's env object untouched", () => {
      resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run"] });

      expect(waylandEnv.WAYLAND_DISPLAY).toBe("wayland-0");
      expect(waylandEnv.XDG_SESSION_TYPE).toBe("wayland");
    });

    it("forwards every argument after the xvfb-run prelude", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run", "--reporter", "dot"] });

      expect(runner.args).toEqual(["-a", "vitest", "run", "--reporter", "dot"]);
    });
  });

  describe("linux without a working xvfb-run", () => {
    it("runs vitest directly rather than failing", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: false, env: waylandEnv, args: ["run"] });

      expect(runner.command).toBe("vitest");
      expect(runner.args).toEqual(["run"]);
    });

    it("leaves the environment alone, because there is no virtual display to protect", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: false, env: waylandEnv, args: ["run"] });

      expect(runner.env.WAYLAND_DISPLAY).toBe("wayland-0");
      expect(runner.env.XDG_SESSION_TYPE).toBe("wayland");
    });
  });

  describe("win32", () => {
    // THE FENCE. A pnpm-installed `vitest` on Windows is a `.cmd` shim, and
    // Node's CreateProcess-based spawn cannot execute one without a shell.
    // Before this wrapper existed, `pnpm test` was a plain script string and
    // the shell resolved the shim; drop `shell` here and every Windows clone
    // gets EINVAL instead of a test run. This test is what must go red if
    // anyone "tidies" it back to `shell: false`.
    it("uses a shell, because vitest is a .cmd shim there", () => {
      const runner = resolveRunner({ platform: "win32", hasXvfb: false, env: { PATH: "C:\\bin" }, args: ["run"] });

      expect(runner.shell).toBe(true);
      expect(runner.command).toBe("vitest");
      expect(runner.args).toEqual(["run"]);
    });

    it("never routes through xvfb-run, whatever the probe claims", () => {
      const runner = resolveRunner({ platform: "win32", hasXvfb: true, env: { PATH: "C:\\bin" }, args: ["run"] });

      expect(runner.command).toBe("vitest");
    });
  });

  describe("darwin", () => {
    it("runs vitest directly, with no shell needed", () => {
      // `vitest` is a symlink to a JS file with a shebang there, which spawn
      // executes on its own. A shell would only add quoting rules to get wrong.
      const runner = resolveRunner({ platform: "darwin", hasXvfb: false, env: { PATH: "/usr/bin" }, args: ["run"] });

      expect(runner.command).toBe("vitest");
      expect(runner.args).toEqual(["run"]);
      expect(runner.shell).toBe(false);
    });
  });

  describe("everywhere the window is hidden", () => {
    it("keeps the shell off, so arguments reach vitest exactly as written", () => {
      const runner = resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run"] });

      expect(runner.shell).toBe(false);
    });
  });
});

/**
 * The other half of the wrapper's contract: what it reports when the run ends.
 * Untested, this is the sort of thing nobody notices is wrong until a CI job
 * blames the wrong culprit for a killed process.
 */
describe("exitCodeFor", () => {
  // Real values, not invented ones — the same table `os.constants.signals`
  // gives the wrapper at runtime.
  const signals = { SIGTERM: 15, SIGINT: 2, SIGKILL: 9 };

  it("passes an ordinary exit code straight through, success included", () => {
    expect(exitCodeFor(0, null, signals)).toBe(0);
    expect(exitCodeFor(1, null, signals)).toBe(1);
    expect(exitCodeFor(127, null, signals)).toBe(127);
  });

  it("reports a killed run as 128 + signum, the way every shell already reads it", () => {
    // THE FENCE against re-raising the signal on this process instead: that
    // only queues delivery, `process.exit()` ends the tick first, and a killed
    // run gets reported as a plain 1 — losing exactly the information this
    // function exists to carry.
    expect(exitCodeFor(null, "SIGTERM", signals)).toBe(143);
    expect(exitCodeFor(null, "SIGINT", signals)).toBe(130);
    expect(exitCodeFor(null, "SIGKILL", signals)).toBe(137);
  });

  it("never reports success for a signal, even one this platform does not name", () => {
    // 128 alone still says "killed" without claiming a number that would be a
    // lie. What must never happen is 0.
    expect(exitCodeFor(null, "SIGNOTREAL", signals)).toBe(128);
  });

  it("fails rather than guessing when the child reports neither", () => {
    expect(exitCodeFor(null, null, signals)).toBe(1);
  });
});
