import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import type { PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { PlayCardAction as EscobaPlayCardAction, PlayerId as EscobaPlayerId, PlayerView as EscobaPlayerView, TeamId as EscobaTeamId } from "@hexdev/escoba-engine";
import type { GameUiEntry } from "./game-ui-registry.js";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById("hexdev-truco-matchstick-defs")?.remove();
  document.getElementById("hexdev-truco-table-styles")?.remove();
  document.getElementById("hexdev-escoba-match-styles")?.remove();
  document.getElementById("hexdev-escoba-status-styles")?.remove();
});

const SELF = "player-a" as PlayerId;
const view: PlayerView = {
  self: { playerId: SELF, teamId: "player-a:team" as TeamId, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
  teammates: [],
  opponents: [],
  teams: [{ id: "player-a:team" as TeamId, score: 0 }],
  hand: null,
  config: { pointsToWin: 15 },
  dealerSeat: 0,
};

describe("truco's registered renderer — the real wiring boundary from a generic { view, legalActions } payload to the typed table", () => {
  it("renders the real game table into the container from an opaque payload", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer(matchRenderContextFor("joined", Date.now));

    render(container, { view, legalActions: [] }, () => {});

    expect(container.className).toBe("hexdev-truco-table-shell");
    expect(container.querySelector('[data-position="bottom"]')).not.toBeNull();
  });

  it("forwards a dispatched action to the given dispatch callback unchanged", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer(matchRenderContextFor("joined", Date.now));
    const dispatch = vi.fn();
    const legalActions = [{ type: "call-truco" as const, playerId: SELF, level: "truco" as const }];

    render(container, { view, legalActions }, dispatch);
    container.querySelector<HTMLButtonElement>(".hexdev-truco-call")!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(legalActions[0]);
  });

  it("forwards the payload's outcome and the given onPlayAgain callback into the real match-over overlay", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer(matchRenderContextFor("joined", Date.now));
    const onPlayAgain = vi.fn();

    render(container, { view, legalActions: [], outcome: { winnerIds: [SELF] } }, () => {}, onPlayAgain);
    container.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();

    expect(container.querySelector(".hexdev-truco-match-over")?.textContent).toContain("¡Ganaste la partida!");
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  /**
   * Slice 4b — closing a gap Slice 4a left open: the renderer's own
   * signature grew `pendingConsult`/`consultAsk` params, but nothing in
   * THIS wiring forwarded the payload's own fields into them — so the badge
   * takeover and the ask block could never reach a real match, even though
   * every browser test that called the renderer directly kept passing. This
   * fences the WIRING itself, not the renderer's own handling of a value
   * it was handed directly.
   */
  it("forwards the payload's pendingConsult into the renderer — the badge takeover reaches a real match", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer(matchRenderContextFor("joined", Date.now));

    render(container, { view, legalActions: [], pendingConsult: { askerSeat: 0, deadline: Date.now() + 30_000 } }, () => {});

    const badge = container.querySelector(".hexdev-truco-turn-badge");
    expect(badge, "the badge takeover reaches a real match, not just a directly-handed fixture").not.toBeNull();
    expect(badge!.textContent).toContain("Consultando");
  });

  it("forwards the payload's consultAsk into the renderer, and routes an answer back through dispatch as a consult-answer message", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("truco-argentino" as never)!.createRenderer(matchRenderContextFor("joined", Date.now));
    const dispatch = vi.fn();

    render(container, { view, legalActions: [], consultAsk: { about: "pending-call", options: ["quiero", "no-quiero"], deadline: Date.now() + 30_000 } }, dispatch);

    expect(container.querySelector('[data-role="consult-ask"]'), "the ask reaches the real table, not just a directly-handed fixture").not.toBeNull();
    container.querySelector<HTMLButtonElement>('[data-answer="quiero"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "consult-answer", about: "pending-call", answer: "quiero" });
  });
});

/**
 * THE SOLITAIRE'S REGISTERED RENDERER — the wiring boundary, and the first
 * time anything in this repository turns two presses into a move.
 *
 * Everything this composes was built and fenced in its own package: the
 * board draws and diffs (slice 7), the chronometer measures and refuses to
 * lie about a resumed match (slice 8), the panel says one of three
 * sentences (slice 8), and `resolvePress` decides what a press means. NONE
 * of that proves any of it is CONNECTED — which is the exact gap slice 4b
 * found on truco's own consult wiring, where a renderer signature grew two
 * parameters and nothing forwarded the payload's fields into them while
 * every test that called the renderer directly kept passing.
 *
 * So every test below drives the REGISTRY: `registry.get(id).createRenderer(
 * context)`, the same two calls `main.ts`'s `enterMatch` makes, and then a
 * real `pointerdown` at a real tile's real centre.
 */
describe("the solitaire's registered renderer — two presses become a move (slice 9)", () => {
  const SOLO = "mahjong-solitario" as GameId;
  const SOLO_PLAYER = "mahjong-player";

  /** A two-tile board. The layout's positions 0 and 1 both sit on the base
   * layer with nothing above them, so both are free — and the payload's own
   * `legalActions` is what says they may be taken anyway, which is the only
   * thing this tier reads. Two of the SAME face, so the offer below is one a
   * real engine could have produced. */
  const twoTileView = { playerId: SOLO_PLAYER, tiles: ["5-circles", "5-circles"] };
  const onePair = [{ type: "remove-pair", playerId: SOLO_PLAYER, a: 0, b: 1 }];

  /** A clock that answers 1 000 ms and then 273 000 ms — 4:32 of board, to
   * the millisecond, and the same two numbers on every run. A wall clock
   * here would make every assertion about the completion sentence a
   * different string each time. */
  const scriptedClock = (): (() => number) => {
    const readings = [1_000, 273_000];
    let index = 0;
    return () => readings[Math.min(index++, readings.length - 1)]!;
  };

  function mount(): HTMLElement {
    container = document.createElement("div");
    container.style.width = "600px";
    document.body.appendChild(container);
    return container;
  }

  function renderFor(entry: "joined" | "resumed", clock: () => number = Date.now): GameUiEntry["createRenderer"] extends (c: never) => infer R ? R : never {
    const registry = createGameUiRegistry();
    const uiEntry = registry.get(SOLO);
    // The whole point of this block: an unregistered id falls through to
    // `renderUnsupportedGame` — "todavía no disponible" — for a game a
    // player can genuinely join.
    expect(uiEntry, "the solitaire resolves to its own renderer, never the unsupported-game view").toBeDefined();
    return uiEntry!.createRenderer(matchRenderContextFor(entry, clock));
  }

  function pressTile(el: HTMLElement, position: number): void {
    const tile = el.querySelector<HTMLElement>(`[data-position="${String(position)}"]`);
    expect(tile, `no tile is drawn at position ${String(position)}`).not.toBeNull();
    const box = tile!.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // R20's sibling, learned in slice 7: `elementFromPoint` answers `null`
    // outside the viewport, so a press fence has to prove its probe point is
    // on screen or it passes for the wrong reason.
    expect(x, "the probe point is off screen, so this press could only ever resolve to null").toBeGreaterThan(0);
    expect(x).toBeLessThan(window.innerWidth);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(window.innerHeight);
    tile!.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  }

  it("draws a real board out of an opaque payload", () => {
    const el = mount();
    renderFor("joined")(el, { view: twoTileView, legalActions: onePair }, () => {});

    expect(el.className).toBe("hexdev-mahjong-match");
    expect(el.querySelectorAll("[data-position]"), "one element per tile still on the board").toHaveLength(2);
  });

  it("draws nothing, and does not fall over, before a board has been dealt", () => {
    // `createMatch` runs before any entropy exists, so the very first view a
    // player receives carries `tiles: null` — a state that is NOT an empty
    // board, and reaches this renderer on every single match.
    const el = mount();
    renderFor("joined")(el, { view: { playerId: SOLO_PLAYER, tiles: null }, legalActions: [] }, () => {});

    expect(el.querySelectorAll("[data-position]")).toHaveLength(0);
  });

  it("marks the first press and dispatches nothing yet", () => {
    const el = mount();
    const dispatch = vi.fn();
    renderFor("joined")(el, { view: twoTileView, legalActions: onePair }, dispatch);

    pressTile(el, 0);

    expect(el.querySelector<HTMLElement>('[data-position="0"]')?.dataset.selected, "half a move is on the board and nothing says so").toBe("true");
    expect(dispatch, "a single press is not a move").not.toHaveBeenCalled();
  });

  it("dispatches a remove-pair on the second press, in the offer's own ordering", () => {
    const el = mount();
    const dispatch = vi.fn();
    renderFor("joined")(el, { view: twoTileView, legalActions: onePair }, dispatch);

    pressTile(el, 1);
    pressTile(el, 0);

    // Pressed high-then-low; the engine promises `a < b` on every action it
    // emits and refuses anything that matches no offer exactly.
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "remove-pair", playerId: SOLO_PLAYER, a: 0, b: 1 });
  });

  it("forgets a selection whose tile the next view no longer holds", () => {
    // The server accepted the move: the two tiles are gone and the mark has
    // nothing left to sit on.
    const el = mount();
    const render = renderFor("joined");
    const dispatch = vi.fn();
    render(el, { view: twoTileView, legalActions: onePair }, dispatch);
    pressTile(el, 0);
    render(el, { view: { playerId: SOLO_PLAYER, tiles: [null, null] }, legalActions: [] }, dispatch);

    expect(el.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  /**
   * THE SAME GUARD, PROVEN WHERE IT IS ACTUALLY OBSERVABLE — and this test
   * exists because the assertion above cannot fail (mutation M9y, ZERO reds
   * repository-wide).
   *
   * The board renderer un-marks a tile it has just removed on its own, so a
   * stale selection is INVISIBLE in the DOM: the mark is gone whether or not
   * the composition root cleared its own record of it. What is stale is the
   * NUMBER this closure is still holding, and the only way that becomes an
   * observable is a press that pairs with it.
   *
   * The payload below is one a correct server never sends — a board that no
   * longer holds a tile, beside an offer list that still names it. That is
   * deliberate and it is R18: a fence against distrusting an input is vacuous
   * unless the input exists. The guard's whole job is to stop believing that
   * a remembered position still describes the board, so the fence has to hand
   * it a board where it does not.
   */
  it("does not pair with a tile it is only still REMEMBERING, even when the offer list still names it", () => {
    const el = mount();
    const render = renderFor("joined");
    const dispatch = vi.fn();
    render(el, { view: twoTileView, legalActions: onePair }, dispatch);
    pressTile(el, 0);
    render(el, { view: { playerId: SOLO_PLAYER, tiles: [null, "5-circles"] }, legalActions: onePair }, dispatch);

    pressTile(el, 1);

    expect(dispatch, "a move was sent naming a tile that is no longer on the board").not.toHaveBeenCalled();
    expect(el.querySelector<HTMLElement>('[data-position="1"]')?.dataset.selected, "the press should have started a fresh selection").toBe("true");
  });

  it("says how long the board took, from the injected clock and not from the wall", () => {
    const el = mount();
    renderFor("joined", scriptedClock())(el, { view: twoTileView, legalActions: [], outcome: { winnerIds: [SOLO_PLAYER] } }, () => {});

    expect(el.querySelector('[data-result="cleared"]')?.textContent).toContain("Lo resolviste en 4:32.");
  });

  /**
   * THE CHRONOMETER IS BUILT WHEN THE PLAYER SITS DOWN, NOT WHEN THE VIEW
   * ARRIVES — and this fence exists because building it in the wrong place
   * came back with ZERO REDS (mutation M9x).
   *
   * Every other test in this block renders ONCE, with the outcome already on
   * the payload, so a chronometer constructed per render starts and finishes
   * inside the same call and prints the same right answer for the wrong
   * reason. In a real match the view carrying the outcome is the LAST of
   * seventy-odd, so the figure would have been the time since the previous
   * tile came off: `Lo resolviste en 0:00.`
   *
   * The clock is a variable this test moves by hand rather than a scripted
   * list, because what is being measured is WHEN the two reads happen, and a
   * list of readings would answer in the order it was consumed no matter
   * where from.
   */
  it("measures the whole match, not the last thing that happened on the table", () => {
    const el = mount();
    let now = 1_000;
    const render = renderFor("joined", () => now);

    render(el, { view: twoTileView, legalActions: onePair }, () => {});
    now = 100_000;
    render(el, { view: twoTileView, legalActions: onePair }, () => {});
    now = 273_000;
    render(el, { view: { playerId: SOLO_PLAYER, tiles: [null, null] }, legalActions: [], outcome: { winnerIds: [SOLO_PLAYER] } }, () => {});

    expect(el.querySelector('[data-result="cleared"]')?.textContent).toContain("Lo resolviste en 4:32.");
  });

  it("keeps showing the same figure while the panel sits on screen", () => {
    // The panel is repainted by any later view, and it stays up while the
    // player reads it. A reading taken on each repaint would report how long
    // the MESSAGE has been open.
    const el = mount();
    let now = 1_000;
    const render = renderFor("joined", () => now);
    const ended = { view: { playerId: SOLO_PLAYER, tiles: [null, null] }, legalActions: [], outcome: { winnerIds: [SOLO_PLAYER] } };

    now = 273_000;
    render(el, ended, () => {});
    now = 900_000;
    render(el, ended, () => {});

    expect(el.querySelector('[data-result="cleared"]')?.textContent).toContain("Lo resolviste en 4:32.");
  });

  it("says nothing about time on a match this page session did not start", () => {
    const el = mount();
    renderFor("resumed", scriptedClock())(el, { view: twoTileView, legalActions: [], outcome: { winnerIds: [SOLO_PLAYER] } }, () => {});
    const panel = el.querySelector('[data-result="cleared"]');

    expect(panel?.textContent).toBe("Lo resolviste.");
    // R12: the two sentences differ by exactly the figure, and vitest elides
    // a long value inside a failure message — so the property is asserted
    // beside the equality rather than instead of it.
    expect(panel?.textContent, "a resumed match must not report a time as a result").not.toMatch(/[0-9]/);
  });

  it("offers another board on a deadlock, and no figure at all", () => {
    const el = mount();
    renderFor("joined", scriptedClock())(el, { view: twoTileView, legalActions: [], outcome: { winnerIds: [] } }, () => {});
    const panel = el.querySelector('[data-result="deadlocked"]');

    expect(panel?.textContent).toContain("Te quedaste sin pares. Siempre hay una salida — probá otro.");
    expect(panel?.textContent, "getting stuck is not an achievement to timestamp").not.toMatch(/[0-9]/);
  });

  it("shows no panel at all while the match is still being played", () => {
    const el = mount();
    renderFor("joined")(el, { view: twoTileView, legalActions: onePair }, () => {});

    expect(el.querySelector("[data-result]"), "a live match is not over").toBeNull();
  });

  it("wires both departures, and they are not the same callback", () => {
    const el = mount();
    const onPlayAgain = vi.fn();
    const onLeaveMatch = vi.fn();
    renderFor("joined")(el, { view: twoTileView, legalActions: [], outcome: { winnerIds: [SOLO_PLAYER] } }, () => {}, onPlayAgain, onLeaveMatch);

    el.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();
    expect(onPlayAgain).toHaveBeenCalledOnce();
    expect(onLeaveMatch, "a rematch and a return to the lobby are deliberately different callbacks").not.toHaveBeenCalled();

    el.querySelector<HTMLButtonElement>('button[data-action="leave-match"]')!.click();
    expect(onLeaveMatch).toHaveBeenCalledOnce();
  });
});

/** Unit O — closes the deviation note Slice M left on ESCOBA_FAMILY: escoba
 * now has a real GameUiEntry, and enterMatch resolves it instead of
 * falling back to renderUnsupportedGame. Proves the wiring boundary Unit
 * N's static table and this unit's own piles component are reachable from
 * the exact registry path enterMatch calls. Unit P's own interaction fence
 * follows immediately below, inside this same describe block. */
describe("escoba's registered renderer — the real wiring boundary from a generic { view } payload to the table and piles (Unit O)", () => {
  const ESCOBA_SELF = "player-a" as EscobaPlayerId;
  const ESCOBA_TEAM_A = "team-a" as EscobaTeamId;
  const ESCOBA_TEAM_B = "team-b" as EscobaTeamId;
  const escobaView: EscobaPlayerView = {
    self: { playerId: ESCOBA_SELF, teamId: ESCOBA_TEAM_A, seat: 0, hand: [] },
    others: [],
    teams: [
      { id: ESCOBA_TEAM_A, score: 0 },
      { id: ESCOBA_TEAM_B, score: 0 },
    ],
    hand: {
      table: [{ suit: "oro", rank: 5 }],
      piles: { [ESCOBA_TEAM_A]: [{ suit: "espada", rank: 3 }], [ESCOBA_TEAM_B]: [] },
      escobas: { [ESCOBA_TEAM_A]: 0, [ESCOBA_TEAM_B]: 0 },
      turn: ESCOBA_SELF,
      stockCount: 20,
      outcome: { decided: false },
    },
    dealerSeat: 0,
  };

  it("has entries for BOTH escoba GameIds, sharing the one family", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("escoba-de-15" as GameId)).not.toBeUndefined();
    expect(registry.get("escoba-de-15-2v2" as GameId)).not.toBeUndefined();
    expect(registry.family("escoba-de-15" as GameId)).toBe(registry.family("escoba-de-15-2v2" as GameId));
  });

  it("renders the real table and piles into the container from an opaque payload", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("escoba-de-15" as GameId)!.createRenderer(matchRenderContextFor("joined", Date.now));

    render(container, { view: escobaView, legalActions: [] }, () => {});

    expect(container.className).toBe("hexdev-escoba-match");
    expect(container.querySelector('.hexdev-escoba-table [data-card="5-oro"]'), "the table renders the payload's own view").not.toBeNull();
    const pile = container.querySelector<HTMLElement>('.hexdev-escoba-pile[data-team="team-a"]');
    expect(pile?.dataset.count, "the piles render the payload's own view too, not a placeholder").toBe("1");
  });

  /**
   * The threading fence for all four facts. `createEscobaRenderer` is the
   * ONLY place these view fields become elements, and this repo has already
   * shipped a component wired into a signature that no caller ever fed
   * (truco's consult badge, slice 4a): every unit test kept passing because
   * they all called the component directly. So this asserts the REGISTRY
   * path.
   */
  it("threads the turn, the stock, every other seat's count and this hand's escobas out of the same payload", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const rival = "player-b" as EscobaPlayerId;
    const view: EscobaPlayerView = {
      ...escobaView,
      others: [{ playerId: rival, teamId: ESCOBA_TEAM_B, seat: 1, cardsRemaining: 2 }],
      hand: { ...escobaView.hand!, turn: rival, escobas: { [ESCOBA_TEAM_A]: 1, [ESCOBA_TEAM_B]: 0 } },
    };
    const render = createGameUiRegistry().get("escoba-de-15" as GameId)!.createRenderer(matchRenderContextFor("joined", Date.now));

    render(container, { view, legalActions: [] }, () => {});

    expect(container.querySelector(".hexdev-escoba-turn")?.textContent).toBe("Turno del rival");
    expect(container.querySelector(".hexdev-escoba-turn")?.getAttribute("aria-live"), "the turn has to be announced, not only painted").toBe("polite");
    expect(container.querySelector(".hexdev-escoba-stock")?.textContent).toBe("Mazo: 20 cartas");
    expect(container.querySelector('.hexdev-escoba-seat[data-seat="1"]')?.getAttribute("aria-label")).toBe("El rival: 2 cartas");
    expect(container.querySelector<HTMLElement>('[data-team="team-a"] .hexdev-escoba-scoreboard-escobas')?.dataset.escobas).toBe("1");
  });

  /**
   * THE FELT, and this is the assertion whose absence was the whole defect.
   *
   * The renderer assigns the container's className outright, so the match
   * surface never inherits the shell's `.convite-chrome` ground — truco
   * survives that because it paints its own cloth, and escoba painted
   * nothing, so a live escoba match rendered on the widget document's bare
   * white while truco's rendered on green. Switching games inside one widget
   * changed the entire background, and every existing assertion here passed
   * throughout: it was only ever visible by looking at a rendered screen.
   *
   * Rendered through the REGISTRY on purpose — `escoba-ui`'s own stylesheet
   * can be perfectly correct while nothing injects it. What broke was the
   * wiring, so the wiring is what this measures.
   */
  it("paints the match surface with the felt, rather than leaving it on the document's bare background", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("escoba-de-15" as GameId)!.createRenderer(matchRenderContextFor("joined", Date.now));

    render(container, { view: escobaView, legalActions: [] }, () => {});

    const painted = getComputedStyle(container);
    // --hx-cloth-lit, the same green the chrome and truco's own felt resolve
    // to — a THIRD, nearly-matching green would be the failure this suite's
    // sibling (design-token-parity.test.ts) exists to prevent.
    expect(painted.backgroundColor, "the flat fallback under the gradient layers").toBe("rgb(29, 106, 77)");
    expect(painted.backgroundImage, "a table under a light, never a flat fill").toContain("radial-gradient");
    // Light on the cloth. Every child inherits this; none of them declares a
    // colour of its own, so before the felt they were all UA-default black.
    expect(painted.color).toBe("rgb(242, 242, 242)");
  });

  /** Unit P — the real wiring boundary `enterMatch` now exercises: mark the
   * table's own 5-oro, then play a hand card, in ONE gesture, through the
   * EXACT `createRenderer(context)` entry-point live matches use. */
  it("marking the table's forming card then playing the hand card dispatches ONE real PlayCardAction, no intermediate dialog", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const registry = createGameUiRegistry();
    const render = registry.get("escoba-de-15" as GameId)!.createRenderer(matchRenderContextFor("joined", Date.now));
    const dispatch = vi.fn();
    const REY_ESPADA = { suit: "espada", rank: 12 } as const; // value 10, target 15-10=5 -> the table's own 5-oro
    const view: EscobaPlayerView = { ...escobaView, self: { ...escobaView.self, hand: [REY_ESPADA] } };
    const legalActions: readonly EscobaPlayCardAction[] = [{ type: "play-card", playerId: ESCOBA_SELF, card: REY_ESPADA, captured: [{ suit: "oro", rank: 5 }] }];

    render(container, { view, legalActions }, dispatch);
    container.querySelector<HTMLButtonElement>('.hexdev-escoba-table [data-card="5-oro"]')!.click();
    container.querySelector<HTMLButtonElement>('.hexdev-escoba-hand [data-card="12-espada"]')!.click();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "play-card", playerId: ESCOBA_SELF, card: REY_ESPADA, captured: [{ suit: "oro", rank: 5 }] });
  });
});
