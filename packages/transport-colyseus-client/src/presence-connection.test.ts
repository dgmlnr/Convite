import { describe, expect, it } from "vitest";
import type { GameId, PlayerId } from "@hexdev/platform-contract";
import { createFakeClient } from "./test-fakes.js";
import { joinMatchmakingQueue, watchPresence } from "./presence-connection.js";

const GAME_ID = "fixture-lobby" as GameId;

describe("watchPresence — joins the presence room WITHOUT a modality (watch-only, never enqueued)", () => {
  it("joins the 'presence' room with no modality field, so PresenceRoom.onJoin takes the watch-only branch", async () => {
    const client = createFakeClient();
    await watchPresence(client, { gameId: GAME_ID, playerId: "p0" });
    expect(client.joinOrCreateCalls).toEqual([{ roomName: "presence", options: { gameId: GAME_ID, playerId: "p0", token: undefined } }]);
  });

  it("maps a raw 'counts' broadcast to the zero-counter-derived display shape via the single-source-of-truth helper", async () => {
    const client = createFakeClient();
    const connection = await watchPresence(client, { gameId: GAME_ID, playerId: "p0" });
    const seen: unknown[] = [];
    connection.onCounts((display) => seen.push(display));

    client.room.emit("counts", [
      { modality: { pointsToWin: 15 }, waitingCount: 3 },
      { modality: { pointsToWin: 30 }, waitingCount: 0 },
    ]);

    expect(seen).toEqual([
      [
        { modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false },
        { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
      ],
    ]);
  });

  it("leave() calls the underlying room's leave with consented:false — real teardown not a no-op, and the fast-close default (see match-connection.ts's leave for why)", async () => {
    const client = createFakeClient();
    const connection = await watchPresence(client, { gameId: GAME_ID, playerId: "p0" });
    await connection.leave();
    expect(client.room.left).toEqual([false]);
  });
});

describe("joinMatchmakingQueue — joins WITH a modality (real queue commitment)", () => {
  it("joins the same 'presence' room name but WITH modality and forwards the caller's unvalidated token", async () => {
    const client = createFakeClient();
    await joinMatchmakingQueue(client, { gameId: GAME_ID, playerId: "p0", modality: { pointsToWin: 15 }, token: "tok-123" });
    expect(client.joinOrCreateCalls).toEqual([
      { roomName: "presence", options: { gameId: GAME_ID, playerId: "p0", modality: { pointsToWin: 15 }, token: "tok-123" } },
    ]);
  });

  it("maps a 'paired' broadcast into a typed PairedMatch, exposing the opaque seat reservation untouched", async () => {
    const client = createFakeClient();
    const connection = await joinMatchmakingQueue(client, { gameId: GAME_ID, playerId: "p0", modality: { pointsToWin: 15 } });
    const seen: unknown[] = [];
    connection.onPaired((pairing) => seen.push(pairing));

    const reservation = { roomId: "match-1", sessionId: "sess-1" };
    client.room.emit("paired", { players: ["p0" as PlayerId, "p1" as PlayerId], modality: { pointsToWin: 15 }, matchReservation: reservation });

    expect(seen).toEqual([{ players: ["p0", "p1"], modality: { pointsToWin: 15 }, reservation }]);
  });

  it("maps a 'pairing-failed' broadcast to just its message", async () => {
    const client = createFakeClient();
    const connection = await joinMatchmakingQueue(client, { gameId: GAME_ID, playerId: "p0", modality: { pointsToWin: 15 } });
    const seen: string[] = [];
    connection.onPairingFailed((message) => seen.push(message));

    client.room.emit("pairing-failed", { message: "handoff failed" });

    expect(seen).toEqual(["handoff failed"]);
  });
});
