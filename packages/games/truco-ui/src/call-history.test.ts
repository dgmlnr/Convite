import { describe, expect, it } from "vitest";
import type { CallEvent, EnvidoState, PlayerId, TeamId } from "@hexdev/truco-engine";
import { advanceHistory } from "./call-history.js";
import type { CallHistory } from "./call-history.js";

const A = "player-a" as PlayerId;
const B = "player-b" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;
const NO_ENVIDO: EnvidoState = { status: "none" };

const truco = (seat: number): CallEvent => ({ kind: "truco-call", playerId: seat === 0 ? A : B, teamId: seat === 0 ? TEAM_A : TEAM_B, seat, level: "truco" });
const quiero = (seat: number): CallEvent => ({ kind: "truco-response", playerId: seat === 0 ? A : B, teamId: seat === 0 ? TEAM_A : TEAM_B, seat, response: "quiero" });
const envido = (seat: number): CallEvent => ({ kind: "envido-call", playerId: seat === 0 ? A : B, teamId: seat === 0 ? TEAM_A : TEAM_B, seat, level: "envido" });

const round = (events: readonly CallEvent[], manoSeat = 0): { events: readonly CallEvent[]; manoSeat: number; envido: EnvidoState } => ({ events, manoSeat, envido: NO_ENVIDO });

describe("advanceHistory — where one hand stops, with no hand number to read", () => {
  it("opens no round at all until somebody calls", () => {
    // Otherwise the panel would grow an empty divider before a word is said,
    // which is the opposite of the point: it exists so the rail stops moving.
    const empty = advanceHistory(undefined, round([]));
    expect(empty.closed).toEqual([]);
    expect(empty.open).toBeUndefined();
  });

  it("keeps one round while the same hand keeps growing", () => {
    let history: CallHistory | undefined;
    history = advanceHistory(history, round([truco(0)]));
    history = advanceHistory(history, round([truco(0), quiero(1)]));

    expect(history.closed, "a hand that is still going got closed off").toHaveLength(0);
    expect(history.open?.events).toHaveLength(2);
  });

  it("survives the identical view arriving again, which every broadcast does", () => {
    // The view is rebuilt server-side on every broadcast, so the same call
    // comes back as a brand-new object. Compared by reference this would open
    // a new round on every heartbeat.
    let history: CallHistory | undefined;
    history = advanceHistory(history, round([truco(0)]));
    history = advanceHistory(history, round([truco(0)]));

    expect(history.closed, "an unchanged broadcast closed the hand being played").toHaveLength(0);
    expect(history.open?.events).toHaveLength(1);
  });

  it("opens a new round when the list starts over", () => {
    let history: CallHistory | undefined;
    history = advanceHistory(history, round([truco(0), quiero(1)]));
    history = advanceHistory(history, round([envido(1)], 1));

    expect(history.closed, "the finished hand was not closed off").toHaveLength(1);
    expect(history.closed[0]!.events, "the finished hand lost its calls").toHaveLength(2);
    expect(history.open?.manoSeat, "the new round kept the old hand's mano").toBe(1);
  });

  it("holds a finished hand's calls through the deal that follows it", () => {
    // THE CASE THE WHOLE THING EXISTS FOR. Between hands the live list is
    // empty, and the old behaviour made the panel vanish — `:empty` hid it,
    // the rail jumped, and the history was reported as never showing up.
    let history: CallHistory | undefined;
    history = advanceHistory(history, round([truco(0), quiero(1)]));
    history = advanceHistory(history, round([]));

    expect(history.closed, "the record was thrown away between hands").toHaveLength(1);
    expect(history.closed[0]!.events).toHaveLength(2);
    expect(history.open, "an empty deal left a phantom round open").toBeUndefined();
  });

  it("tracks the live hand's own envido state, which arrives after its events", () => {
    // The declaration events are markers; the NUMBERS live on the envido
    // state and land later. A round frozen at its first event would show a
    // reveal with nothing revealed.
    const withPoints: EnvidoState = { status: "resolved", declarations: [] } as unknown as EnvidoState;
    let history: CallHistory | undefined;
    history = advanceHistory(history, round([envido(0)]));
    history = advanceHistory(history, { events: [envido(0)], manoSeat: 0, envido: withPoints });

    expect(history.open?.envido).toBe(withPoints);
  });
});
