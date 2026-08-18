import { describe, expect, it } from "vitest";

import { resolveDisplayRedirect, socketPathFor } from "./virtual-display.mjs";
import { resolveRunner } from "./vitest-runner.mjs";

/**
 * `resolveDisplayRedirect` is a pure function for the same reason
 * `resolveRunner` is: the side effects around it (spawning `Xvfb`, mutating
 * `process.env` at config load) are a handful of lines in `vitest.config.ts`
 * and untestable without a real X server, while the DECISION — redirect or
 * not, reuse or spawn — is the part that can silently regress. And it gates
 * more than the wrapper ever did: the config shim runs on EVERY invocation of
 * Vitest, including the direct ones the wrapper never sees.
 */
describe("resolveDisplayRedirect", () => {
  // The exact shape of the session this exists for: a Wayland desktop whose
  // compositor socket Chromium will happily prefer over any X display.
  const waylandEnv = {
    WAYLAND_DISPLAY: "wayland-1",
    XDG_SESSION_TYPE: "wayland",
    DISPLAY: ":0",
    PATH: "/usr/bin",
  };
  const socketUp = () => true;
  const socketDown = () => false;

  describe("outside linux", () => {
    it("touches nothing on darwin", () => {
      const decision = resolveDisplayRedirect({ platform: "darwin", env: { PATH: "/usr/bin" }, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });

    it("touches nothing on win32, whatever the socket probe claims", () => {
      const decision = resolveDisplayRedirect({ platform: "win32", env: { PATH: "C:\\bin" }, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });
  });

  describe("under CI", () => {
    it("touches nothing, because the browser project runs headless there", () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: { ...waylandEnv, CI: "1" }, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });

    it("accepts any truthy CI value, the way vitest itself does", () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: { ...waylandEnv, CI: "true" }, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });

    // THE FENCE. Vitest reads `CI` through std-env, which treats "" and
    // "false" as NOT CI — so those runs are headed. Calling them CI here
    // would skip the redirect for a run that opens a real window.
    it('still redirects when CI is "", which std-env does not count as CI', () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: { ...waylandEnv, CI: "" }, socketExists: socketUp });

      expect(decision.action).toBe("use");
    });

    it('still redirects when CI is "false", which std-env does not count as CI either', () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: { ...waylandEnv, CI: "false" }, socketExists: socketUp });

      expect(decision.action).toBe("use");
    });
  });

  describe("already sanitized (the wrapper's signature)", () => {
    it("touches nothing when WAYLAND_DISPLAY is gone and the session says x11", () => {
      // No compositor socket named and the session declared X11 — this is
      // exactly what `x11OnlyEnv` produces, so this run is already inside
      // `run-vitest.mjs`'s redirect and a second one would fight the first.
      const sanitized = { XDG_SESSION_TYPE: "x11", DISPLAY: ":42", PATH: "/usr/bin" };

      const decision = resolveDisplayRedirect({ platform: "linux", env: sanitized, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });

    it("treats the wrapper's actual child environment as already handled", () => {
      // Cross-module fence: build the env the way `run-vitest.mjs` really
      // does, rather than imitating it. If the wrapper's sanitization ever
      // changes shape, this is the test that says the two files disagree.
      const { env } = resolveRunner({ platform: "linux", hasXvfb: true, env: waylandEnv, args: ["run"] });

      const decision = resolveDisplayRedirect({ platform: "linux", env, socketExists: socketUp });

      expect(decision).toEqual({ action: "none" });
    });

    it("does not accept a missing WAYLAND_DISPLAY alone as the signature", () => {
      // A session that merely lacks the socket but never declared itself X11
      // was not sanitized by the wrapper — nothing proves the redirect ran.
      const decision = resolveDisplayRedirect({
        platform: "linux",
        env: { XDG_SESSION_TYPE: "wayland", DISPLAY: ":0", PATH: "/usr/bin" },
        socketExists: socketUp,
      });

      expect(decision.action).toBe("use");
    });

    it("does not accept XDG_SESSION_TYPE=x11 alone while a compositor socket is still named", () => {
      // The case this whole file exists for: `DISPLAY` (or the session type)
      // says X11, but `WAYLAND_DISPLAY` still points at a live compositor and
      // Chromium prefers Wayland when offered one. Only BOTH halves together
      // mean the wrapper already ran.
      const decision = resolveDisplayRedirect({
        platform: "linux",
        env: { WAYLAND_DISPLAY: "wayland-1", XDG_SESSION_TYPE: "x11", DISPLAY: ":0", PATH: "/usr/bin" },
        socketExists: socketUp,
      });

      expect(decision.action).toBe("use");
    });
  });

  describe("linux, unsanitized session, persistent display already up", () => {
    it("reuses it rather than spawning a second server", () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: waylandEnv, socketExists: socketUp });

      expect(decision.action).toBe("use");
      expect(decision.display).toBe(":99");
    });

    it("asks the probe about the display it is about to use, not some other one", () => {
      const asked: string[] = [];
      resolveDisplayRedirect({
        platform: "linux",
        env: waylandEnv,
        socketExists: (display: string) => {
          asked.push(display);
          return true;
        },
      });

      expect(asked).toEqual([":99"]);
    });
  });

  describe("linux, unsanitized session, no persistent display yet", () => {
    it("asks for a spawn first, against the same display", () => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: waylandEnv, socketExists: socketDown });

      expect(decision.action).toBe("spawn");
      expect(decision.display).toBe(":99");
    });
  });

  describe("the sanitized environment, on both redirecting actions", () => {
    it.each([
      ["use", socketUp],
      ["spawn", socketDown],
    ] as const)("points DISPLAY at :99 and removes the compositor from reach (%s)", (action, socketExists) => {
      const decision = resolveDisplayRedirect({ platform: "linux", env: waylandEnv, socketExists });

      expect(decision.action).toBe(action);
      expect(decision.env.DISPLAY).toBe(":99");
      // The same x11OnlyEnv discipline the wrapper uses, for the same reason:
      // DISPLAY alone is out-voted, not obeyed — Chromium follows
      // WAYLAND_DISPLAY to the real compositor unless the socket is unnamed
      // and the session declared X11.
      expect(decision.env).not.toHaveProperty("WAYLAND_DISPLAY");
      expect(decision.env.XDG_SESSION_TYPE).toBe("x11");
      // Everything unrelated rides through untouched.
      expect(decision.env.PATH).toBe("/usr/bin");
    });

    it("leaves the caller's env object untouched", () => {
      resolveDisplayRedirect({ platform: "linux", env: waylandEnv, socketExists: socketUp });

      expect(waylandEnv.WAYLAND_DISPLAY).toBe("wayland-1");
      expect(waylandEnv.XDG_SESSION_TYPE).toBe("wayland");
      expect(waylandEnv.DISPLAY).toBe(":0");
    });
  });
});

/**
 * Where an X display's socket lives is a decision too — get it wrong and the
 * shim spawns a fresh `Xvfb` on every single run while the last one is still
 * perfectly alive, or worse, believes a display exists that does not.
 */
describe("socketPathFor", () => {
  it("maps a display number to its X11 socket", () => {
    expect(socketPathFor(":99")).toBe("/tmp/.X11-unix/X99");
  });

  it("does not hardcode the one display this repo happens to use", () => {
    expect(socketPathFor(":0")).toBe("/tmp/.X11-unix/X0");
  });
});
