/**
 * The narrowest slice of `@colyseus/sdk`'s `Client`/`Room` API this
 * package's connection logic actually calls — never `@colyseus/sdk`'s own
 * `Client`/`Room` types directly. TypeScript compares object shapes
 * structurally, not by declared name: a real `Client`/`Room` instance from
 * `client.ts`'s `createTransportClient` satisfies these interfaces with zero
 * adapter glue, while a unit test hands in a plain object literal instead.
 * This narrow, consumer-defined seam is what makes "connection logic
 * testable against a fake transport" (the reason this package earns its
 * place at all, per the apply prompt) literal rather than aspirational.
 */
export interface RoomLike {
  readonly roomId: string;
  readonly sessionId: string;
  readonly reconnectionToken: string;
  onMessage<TPayload = unknown>(type: string, callback: (payload: TPayload) => void): () => void;
  send(type: string, payload?: unknown): void;
  onLeave(callback: (code: number, reason?: string) => void): void;
  onError(callback: (code: number, message?: string) => void): void;
  leave(consented?: boolean): Promise<number>;
}

/**
 * `options`/`reservation` stay `unknown` at this seam deliberately: this
 * package never inspects a seat reservation's shape (design's own division
 * of labor — the SERVER decides what a reservation contains via
 * `matchMaker.reserveSeatFor`), it only ever ROUTES the opaque value the
 * server already produced into `consumeSeatReservation`, exactly as
 * `@colyseus/sdk` itself types that parameter.
 */
export interface ClientLike {
  /** Joins an ALREADY-EXISTING room only — rejects if none exists. Kept in
   * the port for structural completeness/testability even though no
   * production call site in this package currently uses it (both
   * presence-side callers need `joinOrCreate`, see `presence-connection.ts`). */
  join(roomName: string, options?: unknown): Promise<RoomLike>;
  joinOrCreate(roomName: string, options?: unknown): Promise<RoomLike>;
  create(roomName: string, options?: unknown): Promise<RoomLike>;
  consumeSeatReservation(reservation: unknown): Promise<RoomLike>;
  reconnect(reconnectionToken: string): Promise<RoomLike>;
}

/** Every `RoomLike.onMessage`/`onLeave` registration returns (or accepts) an
 * unsubscribe function — named here once so every connection's public API
 * agrees on the same shape instead of repeating `() => void` everywhere. */
export type Unsubscribe = () => void;
