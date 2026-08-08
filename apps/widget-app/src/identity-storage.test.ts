import { describe, expect, it } from "vitest";
import {
  clearPersistedMatchSession,
  getBrowserStorage,
  persistMatchSession,
  persistPlayerId,
  readPersistedMatchSession,
  readPersistedPlayerId,
  type StorageLike,
} from "./identity-storage.js";

/** A plain `Map`-backed double — the same convention `test-fakes.ts` in
 * `transport-colyseus-client` already uses for `RoomLike`/`ClientLike`: a
 * real `window.localStorage` satisfies `StorageLike` structurally, but a
 * unit test never needs a real DOM to exercise this module's own logic. */
function createFakeStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

/** Simulates a browser that DENIES storage entirely — some real browsers
 * throw synchronously just touching `window.localStorage`, others throw on
 * the first `getItem`/`setItem` call. Both shapes must degrade the same way:
 * silently, never breaking the widget (design's own storage-partitioning
 * promise: "must degrade gracefully when storage is unavailable"). */
function createThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new DOMException("storage denied", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("storage denied", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("storage denied", "SecurityError");
    },
  };
}

describe("getBrowserStorage", () => {
  it("returns the storage when it is present and a probe read succeeds", () => {
    const storage = createFakeStorage();
    expect(getBrowserStorage({ localStorage: storage })).toBe(storage);
  });

  it("returns undefined when window has no localStorage at all", () => {
    expect(getBrowserStorage({})).toBeUndefined();
  });

  it("returns undefined, never throws, when touching localStorage itself throws (a browser denying storage outright)", () => {
    const windowLike = {
      get localStorage(): StorageLike {
        throw new DOMException("storage denied", "SecurityError");
      },
    };
    expect(() => getBrowserStorage(windowLike)).not.toThrow();
    expect(getBrowserStorage(windowLike)).toBeUndefined();
  });

  it("returns undefined, never throws, when localStorage exists but the first read throws (denied at access time, not at property lookup)", () => {
    expect(getBrowserStorage({ localStorage: createThrowingStorage() })).toBeUndefined();
  });
});

describe("player id persistence (identity survives a reload within this browser's own storage partition)", () => {
  it("reads back exactly what was persisted", () => {
    const storage = createFakeStorage();
    persistPlayerId(storage, "player-abc-123");
    expect(readPersistedPlayerId(storage)).toBe("player-abc-123");
  });

  it("returns undefined when nothing has been persisted yet (first-ever visit)", () => {
    expect(readPersistedPlayerId(createFakeStorage())).toBeUndefined();
  });

  it("returns undefined when storage itself is undefined (unavailable/denied) — never throws", () => {
    expect(() => readPersistedPlayerId(undefined)).not.toThrow();
    expect(readPersistedPlayerId(undefined)).toBeUndefined();
    expect(() => persistPlayerId(undefined, "player-abc-123")).not.toThrow();
  });

  it("degrades silently when a read throws mid-session — never surfaces the error", () => {
    expect(() => readPersistedPlayerId(createThrowingStorage())).not.toThrow();
    expect(readPersistedPlayerId(createThrowingStorage())).toBeUndefined();
  });

  it("degrades silently when a write throws mid-session — never surfaces the error", () => {
    expect(() => persistPlayerId(createThrowingStorage(), "player-abc-123")).not.toThrow();
  });
});

describe("match session persistence (the reconnection-window bearer secret, not the anonymous player id)", () => {
  it("reads back exactly what was persisted", () => {
    const storage = createFakeStorage();
    persistMatchSession(storage, { gameId: "truco-argentino", reconnectionToken: "room-1:secret-token" });
    expect(readPersistedMatchSession(storage)).toEqual({ gameId: "truco-argentino", reconnectionToken: "room-1:secret-token" });
  });

  it("returns undefined when nothing has been persisted yet", () => {
    expect(readPersistedMatchSession(createFakeStorage())).toBeUndefined();
  });

  it("returns undefined when storage is undefined — never throws", () => {
    expect(() => readPersistedMatchSession(undefined)).not.toThrow();
    expect(readPersistedMatchSession(undefined)).toBeUndefined();
  });

  it("returns undefined for malformed/tampered JSON — fails closed, never throws into the caller", () => {
    const storage = createFakeStorage();
    storage.setItem("hexdev-gamify:active-match", "{not valid json");
    expect(() => readPersistedMatchSession(storage)).not.toThrow();
    expect(readPersistedMatchSession(storage)).toBeUndefined();
  });

  it("returns undefined for well-formed JSON missing the fields this shape requires", () => {
    const storage = createFakeStorage();
    storage.setItem("hexdev-gamify:active-match", JSON.stringify({ gameId: "truco-argentino" }));
    expect(readPersistedMatchSession(storage)).toBeUndefined();
  });

  it("clearPersistedMatchSession removes a persisted session — a later read finds nothing", () => {
    const storage = createFakeStorage();
    persistMatchSession(storage, { gameId: "truco-argentino", reconnectionToken: "room-1:secret-token" });

    clearPersistedMatchSession(storage);

    expect(readPersistedMatchSession(storage)).toBeUndefined();
  });

  it("clearPersistedMatchSession on undefined/throwing storage never throws", () => {
    expect(() => clearPersistedMatchSession(undefined)).not.toThrow();
    expect(() => clearPersistedMatchSession(createThrowingStorage())).not.toThrow();
  });
});
