import { describe, expect, it, vi } from "vitest";
import { createDepartureGate, withFreshToken } from "./join-flow.js";

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
});
