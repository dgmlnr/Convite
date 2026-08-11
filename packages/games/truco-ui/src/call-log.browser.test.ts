import { afterEach, describe, expect, it } from "vitest";
import type { CallEvent, EnvidoState, PlayerId, TeamId } from "@hexdev/truco-engine";
import { renderCallLog, scrollCallLogToNewest } from "./call-log.js";
import type { TableAnchor } from "./seat-position.js";

let host: HTMLElement;

afterEach(() => {
  host.remove();
});

function freshHost(): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

const TEAM_A = "player-a:team" as TeamId;
const TEAM_B = "player-b:team" as TeamId;

const POSITIONS_1V1: ReadonlyMap<number, TableAnchor> = new Map([
  [0, "bottom"],
  [1, "top"],
]);

// 2v2: mySeat 0 -> partner seat 2 lands 'top', opponents (seats 1/3) take the
// side anchors (seat-position.ts's own geometry).
const POSITIONS_2V2: ReadonlyMap<number, TableAnchor> = new Map([
  [0, "bottom"],
  [1, "right"],
  [2, "top"],
  [3, "left"],
]);

const ENVIDO_NONE: EnvidoState = { status: "none" };

describe("renderCallLog (spec: 'Call-Log Panel With Bounded Footprint')", () => {
  it("renders nothing when there are no events yet — the caller relies on :empty { display: none }", () => {
    const el = freshHost();

    renderCallLog(el, { events: [], envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    expect(el.children).toHaveLength(0);
  });

  it("lists events in EXACTLY the order given, each with the call's Spanish label (reusing CALL_LABELS)", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [
      { kind: "envido-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "envido" },
      { kind: "truco-call", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, level: "truco" },
      { kind: "envido-response", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, response: "quiero" },
      { kind: "envido-reveal", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0 },
      { kind: "truco-response", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, response: "no-quiero" },
    ];

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    const entries = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Envido"),
      expect.stringContaining("Truco"),
      expect.stringContaining("Quiero"),
      expect.stringContaining("Mostró el envido"),
      expect.stringContaining("No quiero"),
    ]);
  });

  it("labels the speaker from seat geometry, never a player id — 1v1: self is 'Vos', the lone opponent is 'Rival'; stamps data-seat/data-position for CSS tinting", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [
      { kind: "truco-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "truco" },
      { kind: "truco-response", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, response: "quiero" },
    ];

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    const entries = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    expect(entries.map((entry) => entry.querySelector(".hexdev-truco-call-log-speaker")?.textContent)).toEqual(["Vos", "Rival"]);
    // CSS tint reads both dataset attrs, never text alone (project convention).
    expect(entries[1]!.dataset.seat).toBe("1");
    expect(entries[1]!.dataset.position).toBe("top");
  });

  it("labels the speaker from seat geometry in 2v2: self 'Vos', partner (top) 'Compañero', sides 'Rival izq.'/'Rival der.'", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [
      { kind: "truco-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "truco" },
      { kind: "truco-response", playerId: "p2" as PlayerId, teamId: TEAM_A, seat: 2, response: "quiero" },
      { kind: "envido-call", playerId: "p3" as PlayerId, teamId: TEAM_B, seat: 3, level: "envido" },
      { kind: "envido-response", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, response: "no-quiero" },
    ];

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_2V2 });

    const speakers = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-speaker")].map((s) => s.textContent);
    expect(speakers).toEqual(["Vos", "Compañero", "Rival izq.", "Rival der."]);
  });

  it("renders no tantos row while envido has not been revealed this hand (called, pending, or never called)", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [{ kind: "envido-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "envido" }];
    const pending: EnvidoState = { status: "pending", calls: ["envido"], callingTeamId: TEAM_A };

    renderCallLog(el, { events, envido: pending, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    expect(el.querySelector(".hexdev-truco-call-log-tantos")).toBeNull();
  });

  it("renders the tantos row once envido is revealed: mano's entry first with a 'Mano' tag, a sonBuenas entry with NO number", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [
      { kind: "envido-call", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, level: "envido" },
      { kind: "envido-response", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, response: "quiero" },
      { kind: "envido-reveal", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1 },
    ];
    const revealed: EnvidoState = {
      status: "revealed",
      calls: ["envido"],
      winningTeamId: TEAM_B,
      awardedValue: 31,
      // Engine-authored order (design §2.3): mano-rotation order, mano first.
      declarations: [
        { declaration: "points", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, points: 31 },
        { declaration: "sonBuenas", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0 },
      ],
    };

    renderCallLog(el, { events, envido: revealed, manoSeat: 1, selfSeat: 0, positions: POSITIONS_1V1 });

    const tantos = el.querySelector<HTMLElement>(".hexdev-truco-call-log-tantos");
    expect(tantos).not.toBeNull();
    const rows = [...tantos!.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-tantos-entry")];
    expect(rows).toHaveLength(2);
    // mano (seat 1) is listed first, exactly the declarations array's own order.
    expect(rows[0]!.dataset.seat).toBe("1");
    expect(rows[0]!.textContent).toContain("31");
    expect(rows[0]!.querySelector(".hexdev-truco-call-log-mano-tag")?.textContent).toBe("Mano");
    // sonBuenas (seat 0) carries no number anywhere in its rendered text.
    expect(rows[1]!.dataset.seat).toBe("0");
    expect(rows[1]!.textContent).toContain("Son buenas");
    expect(rows[1]!.textContent).not.toMatch(/\d/);
    expect(rows[1]!.querySelector(".hexdev-truco-call-log-mano-tag")).toBeNull();
  });

  it("scrollCallLogToNewest leaves the inner list's scrollTop at its maximum once the host is attached to the document", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = Array.from({ length: 30 }, (_, index) => ({
      kind: "truco-call" as const,
      playerId: `p${index}` as PlayerId,
      teamId: TEAM_A,
      seat: 0,
      level: "truco" as const,
    }));

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });
    const list = el.querySelector<HTMLElement>(".hexdev-truco-call-log-list")!;
    // The panel's own fixed max-height (T-11) lands in a later task — this
    // test proves scrollCallLogToNewest's own contract on its own terms by
    // giving the rendered list a real, bounded height right here, so it does
    // not depend on table-styles.ts's CSS landing first.
    list.style.maxHeight = "80px";
    list.style.overflowY = "auto";

    scrollCallLogToNewest(el);

    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight); // sanity: this really overflows
    expect(list.scrollTop).toBe(list.scrollHeight - list.clientHeight);
  });

  // PR-4a review rider: the two `input.positions.get(seat) ?? "top"` fallback
  // sites (`speakerLabel`, `buildEntry`'s own `dataset.position`) were never
  // exercised by an existing test — every fixture's `positions` map covers
  // every seat that appears in an event. A seat absent from the map is
  // reachable in principle (a stale/rotated positions snapshot); this pins
  // BOTH the rendered label and the dataset attribute to the documented
  // fallback instead of leaving it an unverified assumption.
  it("falls back to the 'top' anchor when a seat is absent from positions — pins BOTH the speaker label and dataset.position", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: "p9" as PlayerId, teamId: TEAM_B, seat: 9, level: "truco" }];
    const sparsePositions: ReadonlyMap<number, TableAnchor> = new Map([[0, "bottom"]]); // seat 9 is deliberately absent

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: sparsePositions });

    const entry = el.querySelector<HTMLElement>(".hexdev-truco-call-log-entry")!;
    expect(entry.dataset.position).toBe("top");
    // "top" with more than 2 known seats would read "Compañero", but a
    // 1-entry positions map has size 1, so the 1v1 branch ("Rival") applies.
    expect(entry.querySelector(".hexdev-truco-call-log-speaker")?.textContent).toBe("Rival");
  });

  // PR-4a review rider: `renderCallLog` is called on every table re-render
  // (table.ts), never only once — a stale entry from a PREVIOUS render must
  // never survive a second call with different data.
  it("a second render on the SAME host fully replaces the first — no stale or duplicated nodes, and the tantos row disappears when no longer revealed", () => {
    const el = freshHost();
    const firstEvents: readonly CallEvent[] = [
      { kind: "truco-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "truco" },
      { kind: "truco-response", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, response: "quiero" },
    ];
    const firstRevealed: EnvidoState = {
      status: "revealed",
      calls: ["envido"],
      winningTeamId: TEAM_A,
      awardedValue: 28,
      declarations: [
        { declaration: "points", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, points: 28 },
        { declaration: "sonBuenas", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1 },
      ],
    };
    renderCallLog(el, { events: firstEvents, envido: firstRevealed, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });
    expect(el.querySelectorAll(".hexdev-truco-call-log-entry")).toHaveLength(2);
    expect(el.querySelector(".hexdev-truco-call-log-tantos")).not.toBeNull();

    // Second render: fewer events, envido no longer revealed for THIS hand
    // (design §2.3: the field is only present on the `revealed` variant —
    // representative of the very next hand, which starts back at "none").
    const secondEvents: readonly CallEvent[] = [{ kind: "envido-call", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, level: "envido" }];
    renderCallLog(el, { events: secondEvents, envido: ENVIDO_NONE, manoSeat: 1, selfSeat: 0, positions: POSITIONS_1V1 });

    const entries = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    expect(entries).toHaveLength(1); // never 3 (2 stale + 1 new) or 2 (1 stale + 1 new)
    expect(entries[0]!.textContent).toContain("Envido");
    expect(el.querySelector(".hexdev-truco-call-log-tantos")).toBeNull(); // no longer revealed -> the row is gone, not just empty
  });

  it("scrollCallLogToNewest is a no-op on a DETACHED node — exactly why it's a separate export from renderCallLog (design §5.2)", () => {
    const detached = document.createElement("div"); // never appended to the document
    const events: readonly CallEvent[] = Array.from({ length: 30 }, (_, index) => ({
      kind: "truco-call" as const,
      playerId: `p${index}` as PlayerId,
      teamId: TEAM_A,
      seat: 0,
      level: "truco" as const,
    }));
    renderCallLog(detached, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });
    const list = detached.querySelector<HTMLElement>(".hexdev-truco-call-log-list")!;
    list.style.maxHeight = "80px";
    list.style.overflowY = "auto";

    scrollCallLogToNewest(detached);

    expect(list.scrollTop).toBe(0); // a detached node never lays out
  });
});
