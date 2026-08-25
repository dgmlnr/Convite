import { afterEach, describe, expect, it } from "vitest";
import type { CallEvent, EnvidoState, PlayerId, TeamId } from "@hexdev/truco-engine";
import { renderCallLog, scrollCallLogToNewest } from "./call-log.js";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";
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
      { kind: "envido-declaration", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, declaration: "points" },
      { kind: "truco-response", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, response: "no-quiero" },
    ];

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    const entries = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("Envido"),
      expect.stringContaining("Truco"),
      expect.stringContaining("Quiero"),
      // A declaration reads as the NUMBER, not as a phrase: by the time it
      // reaches the log the player has said it out loud. The fixture's
      // `envido` here is `none`, so there is no declarations list to read the
      // figure from and the entry carries only its speaker — which is the
      // honest rendering of "we were not told".
      expect.stringContaining("Vos"),
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

  it("each declaration is its own entry, in the order it was said, with the number inline and none on a concession", () => {
    // THE SHAPE CHANGED WITH THE RULES. Declarations used to arrive as one
    // reveal event carrying a block of rows; the round is played one player
    // at a time now, so each declaration is an ordinary entry in the same
    // chronology as everything else — which is what the panel was always for.
    const el = freshHost();
    const events: readonly CallEvent[] = [
      { kind: "envido-call", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, level: "envido" },
      { kind: "envido-response", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, response: "quiero" },
      { kind: "envido-declaration", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, declaration: "points" },
      { kind: "envido-declaration", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, declaration: "sonBuenas" },
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

    const list = el.querySelector<HTMLElement>(".hexdev-truco-call-log-list")!;
    const entries = [...list.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    const declarations = entries.filter((entry) => (entry.textContent ?? "").match(/31|Son buenas/));
    expect(declarations, "one entry per player who spoke").toHaveLength(2);

    // Mano (seat 1) said 31 and said it FIRST — the events' own order.
    expect(declarations[0]!.dataset.seat).toBe("1");
    expect(declarations[0]!.textContent).toContain("31");

    // The concession carries no number, and that is structural rather than
    // cosmetic: a withheld declaration never materialises a `points` key
    // (D-1), so there is nothing here to leak even by accident.
    expect(declarations[1]!.dataset.seat).toBe("0");
    expect(declarations[1]!.textContent).toContain("Son buenas");
    expect(declarations[1]!.textContent).not.toMatch(/\d/);

    // ONE scroller over everything: nothing is left outside the list.
    expect(el.querySelector(".hexdev-truco-call-log-tantos"), "the pinned block is gone").toBeNull();
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
  it("a second render on the SAME host fully replaces the first — no stale or duplicated nodes, and the declarations go with the hand that produced them", () => {
    const el = freshHost();
    // The reveal EVENT is in this list on purpose. The declarations now hang
    // off that entry, so a `revealed` envido with no matching event would
    // render no numbers at all — a shape the engine cannot actually produce
    // (envido-chain.ts appends the event and sets the state in one
    // transition), and therefore not one worth fixturing.
    const firstEvents: readonly CallEvent[] = [
      { kind: "truco-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "truco" },
      { kind: "envido-declaration", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, declaration: "points" },
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
    // A declaration is an ordinary entry now — no special class, because it
    // no longer carries a block of other people's numbers. Its own number is
    // read from `envido.declarations` by seat, so the check is on the text.
    expect([...el.querySelectorAll(".hexdev-truco-call-log-entry")].some((entry) => (entry.textContent ?? "").includes("28"))).toBe(true);

    // Second render: fewer events, envido no longer revealed for THIS hand
    // (design §2.3: the field is only present on the `revealed` variant —
    // representative of the very next hand, which starts back at "none").
    const secondEvents: readonly CallEvent[] = [{ kind: "envido-call", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, level: "envido" }];
    renderCallLog(el, { events: secondEvents, envido: ENVIDO_NONE, manoSeat: 1, selfSeat: 0, positions: POSITIONS_1V1 });

    const entries = [...el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-entry")];
    expect(entries).toHaveLength(1); // never 3 (2 stale + 1 new) or 2 (1 stale + 1 new)
    expect(entries[0]!.textContent).toContain("Envido");
    expect(entries[0]!.textContent, "a fresh hand carries none of the last one's numbers").not.toMatch(/28/);
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

describe("the call-log scroller is keyboard-operable (WCAG 2.1.1: a scroll region a keyboard can never reach is content a keyboard user can never read)", () => {
  it("makes the one real scroller tab-focusable and names it as a log", () => {
    const el = freshHost();
    const events: readonly CallEvent[] = [{ kind: "truco-call", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0, level: "truco" }];

    renderCallLog(el, { events, envido: ENVIDO_NONE, manoSeat: 0, selfSeat: 0, positions: POSITIONS_1V1 });

    const list = el.querySelector<HTMLElement>(".hexdev-truco-call-log-list")!;
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(list.getAttribute("role")).toBe("log");
    expect(list.getAttribute("aria-label")).toBe("Cantos");
  });
});

/**
 * WCAG 1.3.1 (B14). "Cantos" and "Tantos" are the titles of the two things
 * this panel contains — they label the content below them, which is what a
 * heading IS. As `<p>` elements they were styled to look like headings
 * (uppercase, bold, tracked) and exposed as ordinary prose, so the one
 * navigation aid that reaches a panel buried in a game table did not exist.
 *
 * The levels are H2 then H3, and both parts matter: H2 because nothing else on
 * the felt is persistently a heading (the match-over overlay's own H2 is
 * transient and mutually exclusive with play), H3 because the tantos row is a
 * section INSIDE this panel, not a sibling of it.
 *
 * ZERO PAINT CHANGE by construction: the shared
 * .hexdev-truco-call-log-title/-tantos-title rule already declares margin,
 * font-size and font-weight explicitly, so a heading's UA defaults have
 * nothing left to contribute — asserted below rather than assumed.
 */
describe("the call-log panel has a real heading outline (WCAG 1.3.1)", () => {
  const REVEALED: EnvidoState = {
    status: "revealed",
    calls: ["envido"],
    winningTeamId: TEAM_B,
    awardedValue: 31,
    declarations: [
      { declaration: "points", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, points: 31 },
      { declaration: "sonBuenas", playerId: "p0" as PlayerId, teamId: TEAM_A, seat: 0 },
    ],
  };
  const EVENTS: readonly CallEvent[] = [{ kind: "envido-declaration", playerId: "p1" as PlayerId, teamId: TEAM_B, seat: 1, declaration: "points" }];

  function renderRevealed(): HTMLElement {
    const el = freshHost();
    renderCallLog(el, { events: EVENTS, envido: REVEALED, manoSeat: 1, selfSeat: 0, positions: POSITIONS_1V1 });
    return el;
  }

  it("titles the panel with ONE H2 — the declarations need no heading of their own now that they sit under the entry that produced them", () => {
    const el = renderRevealed();

    const panelTitle = el.querySelector<HTMLElement>(".hexdev-truco-call-log-title")!;
    expect([panelTitle.tagName, panelTitle.textContent]).toEqual(["H2", "Cantos"]);
    // The old H3 labelled a pinned section that no longer exists. A heading
    // announcing a sub-list INSIDE one log entry would be structure that
    // says more than the content does.
    expect(el.querySelector(".hexdev-truco-call-log-tantos-title")).toBeNull();
    expect(el.querySelectorAll("h2, h3")).toHaveLength(1);
  });

  it("paints both titles exactly as before — the shared rule owns every property a heading's UA default would otherwise supply", () => {
    ensureTableStyles(document);
    const el = renderRevealed();

    for (const title of el.querySelectorAll<HTMLElement>(".hexdev-truco-call-log-title")) {
      const style = getComputedStyle(title);
      expect([style.marginTop, style.marginBottom], `${title.tagName} margins`).toEqual(["0px", "0px"]);
      expect(style.fontWeight, `${title.tagName} weight`).toBe("700");
      // --hx-text-label is 0.7rem against a 16px root.
      expect(style.fontSize, `${title.tagName} size`).toBe("11.2px");
    }
    document.getElementById(TABLE_STYLE_ID)?.remove();
  });
});

/**
 * The log's scrollbar is felt furniture too.
 *
 * This list is the ONE scroller a player looks at for minutes at a time, and
 * it sat inside a dark, tenant-themed panel wearing whatever the operating
 * system paints by default — a light grey bar with a light track, on a panel
 * that is nearly black. Reported as "podría estar personalizado y acorde al
 * estilo de la UI", and it is: everything else on this felt reads a token.
 *
 * Asserted through the STANDARD properties (`scrollbar-width` /
 * `scrollbar-color`) rather than `::-webkit-scrollbar`. Chromium honours the
 * standard ones and, once `scrollbar-color` is set, ignores the webkit
 * pseudo-elements entirely — so declaring both would ship a rule that can
 * never apply anywhere and would quietly rot. One mechanism, asserted.
 */
describe("the log's own scrollbar is styled, not the platform default", () => {
  function mountedList(): HTMLElement {
    const el = freshHost();
    ensureTableStyles(document);
    renderCallLog(el, {
      events: [
        { kind: "envido-call", playerId: "p" as PlayerId, teamId: TEAM_A, seat: 0, level: "envido" },
        { kind: "envido-response", playerId: "q" as PlayerId, teamId: TEAM_B, seat: 1, response: "quiero" },
      ],
      envido: ENVIDO_NONE,
      manoSeat: 0,
      selfSeat: 0,
      positions: POSITIONS_1V1,
    });
    const list = el.querySelector<HTMLElement>(".hexdev-truco-call-log-list");
    if (list === null) throw new Error("fence setup: the log list did not render");
    return list;
  }

  afterEach(() => {
    document.getElementById(TABLE_STYLE_ID)?.remove();
  });

  it("asks for the thin variant rather than the platform's full-width bar", () => {
    expect(getComputedStyle(mountedList()).scrollbarWidth).toBe("thin");
  });

  it("paints the thumb from a token and leaves the track to the panel underneath", () => {
    const scrollbarColor = getComputedStyle(mountedList()).scrollbarColor;

    expect(scrollbarColor, "the default is the one thing this must not be").not.toBe("auto");
    // Two colours, thumb then track. Compared against the computed
    // serialisation rather than the authored keyword: Chromium resolves
    // `transparent` to `rgba(0, 0, 0, 0)`, so asserting the word would fail
    // against a stylesheet that is perfectly correct.
    const [thumb, track] = scrollbarColor.split(") ").map((part, index, parts) => (index < parts.length - 1 ? `${part})` : part));
    expect(thumb, "the thumb is the felt's own green, not the platform's grey").toBe("rgba(101, 176, 138, 0.55)");
    // Transparent on purpose: the panel it sits on already carries the
    // surface, and a second opaque strip over it reads as a seam down the
    // side of the log.
    expect(track, "the track lets the panel underneath show through").toBe("rgba(0, 0, 0, 0)");
  });
});
