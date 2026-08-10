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

  it("omits humanSeatsNeeded from the room-creation options entirely when the caller does not pass it — the server-side default (1) applies, unchanged for every existing 1v1 caller", async () => {
    const client = createFakeClient();
    await startBotMatch(client, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", playerId: "p0", token: "tok" });
    expect(client.createCalls[0]?.options).not.toHaveProperty("humanSeatsNeeded");
  });

  it("forwards an explicit humanSeatsNeeded — the 2v2 'N real players vs bot-filled remaining seats' entry point", async () => {
    const client = createFakeClient();
    await startBotMatch(client, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", playerId: "p0", token: "tok", humanSeatsNeeded: 2 });
    expect(client.createCalls).toEqual([
      { roomName: "match", options: { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", token: "tok", humanSeatsNeeded: 2 } },
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

  // Apply prompt (round 4, lower priority): a real session found a stored
  // reconnection token pointing at a match the server no longer has (the
  // server restarted) logging FOUR console errors before the app correctly
  // fell back to the catalogue — one per retry attempt, all doomed, since
  // `@colyseus/sdk`'s own `reconnect()` throws a `MatchMakeError` whose
  // `.code` is `522` (`ErrorCode.MATCHMAKE_INVALID_ROOM_ID`, verified by
  // reading `@colyseus/core`'s own `MatchMaker.ts`/`@colyseus/shared-types`'
  // `Protocol.ts` source, not assumed) when the room has been disposed, and
  // `524` (`MATCHMAKE_EXPIRED`) when the reconnection token itself is stale
  // — both are PERMANENT: retrying can never turn a disposed room or an
  // already-expired token into a live one, so every retry is pure noise.
  it("does NOT retry a permanently-disposed room (colyseus code 522) — one attempt, not four", async () => {
    const client = createFakeClient();
    const permanentError = Object.assign(new Error(`room "abc" has been disposed.`), { code: 522 });
    client.reconnect = vi.fn(async () => {
      throw permanentError;
    });

    await expect(reconnectMatch(client, "reconnection-token-4", { retries: 3, retryDelayMs: 0 })).rejects.toBe(permanentError);
    expect(client.reconnect).toHaveBeenCalledTimes(1); // never retried — the room is gone for good
  });

  it("does NOT retry an expired reconnection token (colyseus code 524) either — same permanent-failure reasoning", async () => {
    const client = createFakeClient();
    const expiredError = Object.assign(new Error("reconnection token invalid or expired."), { code: 524 });
    client.reconnect = vi.fn(async () => {
      throw expiredError;
    });

    await expect(reconnectMatch(client, "reconnection-token-5", { retries: 3, retryDelayMs: 0 })).rejects.toBe(expiredError);
    expect(client.reconnect).toHaveBeenCalledTimes(1);
  });

  it("still retries a transient failure that merely happens to carry an unrelated numeric code — only 522/524 short-circuit", async () => {
    const client = createFakeClient();
    let attempt = 0;
    const originalReconnect = client.reconnect.bind(client);
    client.reconnect = async (token: string) => {
      attempt += 1;
      if (attempt < 2) throw Object.assign(new Error("rate limited"), { code: 429 });
      return originalReconnect(token);
    };

    const connection = await reconnectMatch(client, "reconnection-token-6", { retries: 3, retryDelayMs: 0 });
    expect(attempt).toBe(2);
    expect(connection.reconnectionToken).toBe(client.room.reconnectionToken);
  });
});
