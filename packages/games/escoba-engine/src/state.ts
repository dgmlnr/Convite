import type { Card } from "./card.js";
import type { HandOutcome } from "./hand-outcome.js";
import type { PlayerId, TeamId } from "./ids.js";

export type { HandOutcome } from "./hand-outcome.js";

export interface Team {
  readonly id: TeamId;
  readonly playerIds: readonly PlayerId[];
  readonly score: number;
}

export interface Player {
  readonly id: PlayerId;
  readonly teamId: TeamId;
  readonly seat: number;
  readonly hand: readonly Card[];
}

/**
 * design §D2. `stock` is the SECRET remainder kept "para los repartos
 * sucesivos" (art. 6.1) after the opening deal — `getViewFor` (view.ts)
 * must never let a stock card reach a `PlayerView`; see that file's own
 * redaction discipline. `piles`/`escobas` are keyed by `TeamId`, never
 * `PlayerId`, so end-of-hand scoring (a later slice) is ONE code path for
 * both the 2-seat and 4-seat modality (art. 5.1: the regulation is written
 * for the pairs game; a 1v1 team is simply a team of one — see
 * `escoba/reglas-verificadas`).
 */
export interface HandState {
  readonly table: readonly Card[];
  readonly stock: readonly Card[];
  readonly piles: Readonly<Record<TeamId, readonly Card[]>>;
  readonly escobas: Readonly<Record<TeamId, number>>;
  readonly turn: PlayerId;
  readonly lastCapturer: TeamId | null;
  readonly outcome: HandOutcome | null;
}

export interface MatchState {
  readonly teams: readonly [Team, Team];
  readonly players: readonly Player[];
  readonly dealerSeat: number;
  readonly hand: HandState | null;
  readonly pointsToWin: 30; // art. 8.1 — a literal here, not a ConfigOption (design §D5)
}
