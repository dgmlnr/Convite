import { describe, expect, it, vi } from "vitest";
import type { GameId, PlayerId } from "@hexdev/platform-contract";
import { createFakeClient } from "./test-fakes.js";
import { joinMatchFromReservation, reconnectMatch, startBotMatch } from "./match-connection.js";

const GAME_ID = "fixture-game" as GameId;

describe("joinMatchFromReservation — the client's half of the lobby hand-off (obs 2952: the token stays unvalidated here, only MatchRoom.onAuth ever verifies it)", () => {
  it("consumes the exact opaque reservation object PresenceRoom's 'paired' message carried, no reinterpretation", async () => {
    const client = createFakeClient();
    const reservation = { roomId: "match-1", sessionId: "sess-1" };
    await joinMatchFromReservation(client, reservation);
    expect(client.consumeSeatReservationCalls).toEqual([reservation]);
  });

  it("maps 'view' broadcasts to onView and 'action-rejected' broadcasts to onActionRejected, sendAction forwards to the room", async () => {
    const client = createFakeClient();
    const connection = await joinMatchFromReservation(client, { roomId: "match-1" });

    const views: unknown[] = [];
    connection.onView((view) => views.push(view));
    const violations: unknown[] = [];
    connection.onActionRejected((violation) => violations.push(violation));

    client.room.emit("view", { cardsRemaining: 3 });
    client.room.emit("action-rejected", { code: "actor-mismatch", message: "not your seat" });
    connection.sendAction({ playerId: "p0" as PlayerId, type: "play-card" });

    expect(views).toEqual([{ cardsRemaining: 3 }]);
    expect(violations).toEqual([{ code: "actor-mismatch", message: "not your seat" }]);
    expect(client.room.sent).toEqual([{ type: "action", payload: { playerId: "p0", type: "play-card" } }]);
  });

  it("leave() defaults to consented:false — real @colyseus/sdk Room.leave defaults an omitted arg to true, which sends LEAVE_ROOM and waits for the SERVER to close; MatchRoom.onLeave always awaits the ~30s reconnection window first (no 'quit' affordance, by design), so a consented leave hangs for the full window. Found running this live, not assumed", async () => {
    const client = createFakeClient();
    const connection = await joinMatchFromReservation(client, { roomId: "match-1" });
    await connection.leave();
    expect(client.room.left).toEqual([false]);
  });

  it("leave(true) still honors an EXPLICIT caller override — never silently forces the fast path when the caller specifically wants the graceful notify-server leave", async () => {
    const client = createFakeClient();
    const connection = await joinMatchFromReservation(client, { roomId: "match-1" });
    await connection.leave(true);
    expect(client.room.left).toEqual([true]);
  });
});

describe("startBotMatch — single-player vs bot, no lobby wait (spec: 'Single-Player vs Bot Mode')", () => {
  it("creates a FRESH 'match' room (never joinOrCreate, which could hand a client an unrelated existing room) with gameId/config/botTier/token as room-creation options", async () => {
    const client = createFakeClient();
    await startBotMatch(client, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "hard", playerId: "p0", token: "tok" });
    expect(client.createCalls).toEqual([
      { roomName: "match", options: { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "hard", token: "tok" } },
    ]);
  });
});

describe("reconnectMatch — the client's half of the reconnection window (design §9, MatchRoom.onLeave's allowReconnection)", () => {
  it("succeeds on the first attempt without retrying", async () => {
    const client = createFakeClient();
    const connection = await reconnectMatch(client, "reconnection-token-1");
    expect(client.reconnectCalls).toEqual(["reconnection-token-1"]);
    expect(connection.reconnectionToken).toBe(client.room.reconnectionToken);
  });

  it("retries a bounded number of times on transient failure, then succeeds — real retry logic, not a single blind attempt", async () => {
    const client = createFakeClient();
    let attempt = 0;
    const originalReconnect = client.reconnect.bind(client);
    client.reconnect = async (token: string) => {
      attempt += 1;
      if (attempt < 3) throw new Error("transient network drop");
      return originalReconnect(token);
    };

    const connection = await reconnectMatch(client, "reconnection-token-2", { retries: 5, retryDelayMs: 0 });
    expect(attempt).toBe(3);
    expect(connection.reconnectionToken).toBe(client.room.reconnectionToken);
  });

  it("gives up and rejects after exhausting the retry budget — never retries forever", async () => {
    const client = createFakeClient();
    client.reconnect = vi.fn(async () => {
      throw new Error("server unreachable");
    });

    await expect(reconnectMatch(client, "reconnection-token-3", { retries: 2, retryDelayMs: 0 })).rejects.toThrow("server unreachable");
    expect(client.reconnect).toHaveBeenCalledTimes(3); // 1 initial + 2 retries, then give up
  });
});
