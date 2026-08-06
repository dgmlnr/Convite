import type { ClientLike, RoomLike } from "./ports.js";

/**
 * A fake `RoomLike`/`ClientLike` pair shared by every test file in this
 * package — the concrete "fake transport" `ports.ts`'s docstring promises.
 * `emit` lets a test simulate a server pushing a message; `sent`/`joinCalls`
 * let a test assert on what production code actually called, without a
 * single real WebSocket or `@colyseus/sdk` object involved. NOT a `.test.ts`
 * file itself — vitest's `include` glob only picks up `*.test.ts`.
 */
export interface FakeRoom extends RoomLike {
  emit(type: string, payload: unknown): void;
  readonly sent: Array<{ type: string; payload: unknown }>;
  /** The RAW `consented` argument each `leave()` call received, `undefined`
   * included — deliberately NOT defaulted here, so a test can prove exactly
   * what a caller passed (real @colyseus/sdk `Room.leave` defaults an
   * OMITTED argument to `true`, the slow path — see match-connection.ts's
   * `wrapMatchRoom` docstring for why this package overrides that default). */
  readonly left: Array<boolean | undefined>;
}

export function createFakeRoom(overrides: Partial<Pick<RoomLike, "roomId" | "sessionId" | "reconnectionToken">> = {}): FakeRoom {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const sent: Array<{ type: string; payload: unknown }> = [];
  const leftCalls: Array<boolean | undefined> = [];
  return {
    roomId: overrides.roomId ?? "fake-room-id",
    sessionId: overrides.sessionId ?? "fake-session-id",
    reconnectionToken: overrides.reconnectionToken ?? "fake-reconnection-token",
    sent,
    left: leftCalls,
    onMessage(type, callback) {
      const set = handlers.get(type) ?? new Set();
      set.add(callback as (payload: unknown) => void);
      handlers.set(type, set);
      return () => set.delete(callback as (payload: unknown) => void);
    },
    send(type, payload) {
      sent.push({ type, payload });
    },
    onLeave() {
      // No test in this package currently asserts on onLeave dispatch beyond
      // registration succeeding; kept for RoomLike structural completeness.
    },
    onError() {
      // Same as onLeave above.
    },
    async leave(consented) {
      leftCalls.push(consented);
      return 1000;
    },
    emit(type, payload) {
      for (const callback of handlers.get(type) ?? []) callback(payload);
    },
  };
}

export interface FakeClient extends ClientLike {
  readonly joinCalls: Array<{ roomName: string; options: unknown }>;
  readonly joinOrCreateCalls: Array<{ roomName: string; options: unknown }>;
  readonly createCalls: Array<{ roomName: string; options: unknown }>;
  readonly consumeSeatReservationCalls: unknown[];
  readonly reconnectCalls: string[];
  /** The room every `join`/`joinOrCreate`/`create`/`consumeSeatReservation`/
   * `reconnect` call resolves to. `reconnectMatch`'s retry tests override
   * `client.reconnect` directly (a plain function property) when a single
   * call site needs to fail then succeed — no separate queuing mechanism
   * needed for that. */
  room: FakeRoom;
}

export function createFakeClient(room: FakeRoom = createFakeRoom()): FakeClient {
  const client: FakeClient = {
    room,
    joinCalls: [],
    joinOrCreateCalls: [],
    createCalls: [],
    consumeSeatReservationCalls: [],
    reconnectCalls: [],
    async join(roomName, options) {
      client.joinCalls.push({ roomName, options });
      return client.room;
    },
    async joinOrCreate(roomName, options) {
      client.joinOrCreateCalls.push({ roomName, options });
      return client.room;
    },
    async create(roomName, options) {
      client.createCalls.push({ roomName, options });
      return client.room;
    },
    async consumeSeatReservation(reservation) {
      client.consumeSeatReservationCalls.push(reservation);
      return client.room;
    },
    async reconnect(reconnectionToken) {
      client.reconnectCalls.push(reconnectionToken);
      return client.room;
    },
  };
  return client;
}
