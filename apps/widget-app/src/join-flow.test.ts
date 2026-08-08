import { describe, expect, it, vi } from "vitest";
import { createDepartureGate, tryResumeSession, withFreshToken } from "./join-flow.js";

describe("withFreshToken (obs 2968: renew right before a join — the whole fix for a token minted at page-load but only used at play time)", () => {
  it("renews a token first, then performs the action WITH that fresh token", async () => {
    const renewToken = vi.fn(async () => "fresh-token-123");
    const action = vi.fn(async (token: string) => `joined-with-${token}`);

    const result = await withFreshToken(renewToken, action);

    expect(renewToken).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith("fresh-token-123");
    expect(result).toBe("joined-with-fresh-token-123");
  });

  it("never performs the action when renewal itself fails — never joins with a stale or absent token", async () => {
    const renewToken = vi.fn(async () => {
      throw new Error("renewal rejected");
    });
    const action = vi.fn(async (token: string) => `joined-with-${token}`);

    await expect(withFreshToken(renewToken, action)).rejects.toThrow("renewal rejected");
    expect(action).not.toHaveBeenCalled();
  });
});

describe("createDepartureGate (bug, found live: a presence 'counts' broadcast kept re-rendering the plain selection screen over whatever the player had already moved on to — a connected match view, or the new error+retry view — wiping it within about a second)", () => {
  it("starts un-departed, so a live presence update is still allowed to redraw the selection screen", () => {
    const gate = createDepartureGate();
    expect(gate.hasDeparted()).toBe(false);
  });

  it("once the player commits to a join attempt, marks departed — no live presence update should redraw the selection screen again", () => {
    const gate = createDepartureGate();
    gate.markDeparted();
    expect(gate.hasDeparted()).toBe(true);
  });

  it("reset() returns to un-departed — the play-again path returns to the selection screen and live presence updates should resume redrawing it", () => {
    const gate = createDepartureGate();
    gate.markDeparted();

    gate.reset();

    expect(gate.hasDeparted()).toBe(false);
  });
});

describe("tryResumeSession (identity survives a reload: attempt the reconnection-window's own re-authentication, never trust a client-remembered id)", () => {
  it("returns undefined without attempting anything when there is no persisted session to resume", async () => {
    const resume = vi.fn(async () => "connected");

    const result = await tryResumeSession(undefined, resume);

    expect(result).toBeUndefined();
    expect(resume).not.toHaveBeenCalled();
  });

  it("calls resume with the persisted session and returns its result on success", async () => {
    const session = { gameId: "truco-argentino", reconnectionToken: "room-1:secret-token" };
    const resume = vi.fn(async (s: typeof session) => `resumed-${s.reconnectionToken}`);

    const result = await tryResumeSession(session, resume);

    expect(resume).toHaveBeenCalledWith(session);
    expect(result).toBe("resumed-room-1:secret-token");
  });

  it("swallows a rejected resume (window expired, seat already taken over) and returns undefined — never throws into the caller", async () => {
    const session = { gameId: "truco-argentino", reconnectionToken: "room-1:secret-token" };
    const resume = vi.fn(async () => {
      throw new Error("MatchRoom: join rejected, invalid or expired session token");
    });

    await expect(tryResumeSession(session, resume)).resolves.toBeUndefined();
  });
});
