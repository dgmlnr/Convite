import { DIE_FACES } from "@hexdev/mentiroso-engine";
import type { DieFace, Phase, PlayerView } from "@hexdev/mentiroso-engine";

/**
 * The destape (SDD `mentiroso`, work unit E4/task 5.4, design D4/D6): the
 * dramatic moment mentiroso is played for, and the ONE `mentiroso-ui` file
 * that finally calls a rival's dice by name — every earlier unit either
 * withheld them (`bid-picker.ts`) or deferred to the engine's own redaction
 * before ever drawing them (`cups.ts`'s own `isRevealed` gate).
 *
 * D6'S PAUSE IS THE READING WINDOW, NOT THIS FILE'S JOB TO BUILD: the 1200ms
 * `MENTIROSO_SYSTEM_ACTION_PAUSE_MS` lives in `MatchRoom.runAdvanceOnce`
 * (design's own Data Flow), entirely server-side. This file owns none of
 * that timing — it only ever renders whatever `PlayerView` it is handed, and
 * the room simply does not advance past `showdown` until the pause elapses,
 * which is what gives a mounted render of this file its screen time. Adding
 * a countdown or a fade-out here would duplicate a clock this package has no
 * way to keep in sync with the server's own.
 *
 * WHAT A PLAYER MUST BE ABLE TO ANSWER, LOOKING (launch prompt, verbatim):
 * qué se apostó, cuántos había de verdad, quién ganó el desafío, y quién
 * entregó un dado. The four lines below are exactly those four facts, in
 * that order — never fused into one sentence per the same "one GIVEN/WHEN/
 * THEN per fact" discipline `sdd/mentiroso/spec` documents for its own
 * showdown scenarios.
 *
 * TWO FACTS THIS FILE DELIBERATELY KEEPS SEPARATE, never conflated
 * (`AGENTS.md`'s own named family of traps): surrendering a die and being
 * eliminated are NOT the same fact. `Phase.showdown` names exactly one
 * `loserSeat`, and that seat may or may not be down to zero dice afterward —
 * `loserEliminated` is its own derived boolean, read from the CURRENT view's
 * own dice counts, never assumed from having lost the challenge.
 *
 * THE FORCED-DOUBT NOTICE (design's own File Changes table names the
 * Spanish string for `apps/widget-app/src/i18n.ts`, task 6.1 — a LATER,
 * composition-root concern this file does not own). What this file DOES own
 * is the underlying FACT: whether the doubt that opened this showdown had no
 * other legal move (mentiroso-rules' own ceiling). `Phase.showdown` stores
 * no such flag — the no-stored-derivable-field convention this whole engine
 * follows (`state.ts`, `bids.ts`) — so `wasForcedDoubt` derives it instead,
 * exported and independently testable, matching `sena-notice.ts`'s own split
 * between a pure "what happened" function and the DOM that renders it.
 *
 * DERIVING "FORCED", not reading a stored flag: the ceiling forces exactly
 * one legal action (`bids.ts`'s own `raisesFrom` returns empty there) iff
 * the challenged bid's quantity equalled the table's ENTIRE dice count at
 * the moment of the challenge, at the highest face. `state.players` changes
 * exactly once between that moment and this view — `applyDoubt` (engine,
 * work unit B4) surrenders the loser's one die in the SAME transition that
 * produces this very `showdown` phase — so total dice AT the challenge is
 * always exactly one MORE than the total this view currently shows. This is
 * the identical "+1" `applyDoubt`'s own docblock argues for deriving the
 * bidder's seat BEFORE that same surrender, applied here to a count instead
 * of a seat.
 */

export type ShowdownPhase = Extract<Phase, { readonly kind: "showdown" }>;

/** "cuatro cincos" — the ruleset's own spoken form of a bid
 * (`convite/mentiroso/reglas-decididas`), the identical vocabulary
 * `bid-picker.ts`'s own `FACE_WORDS` already established for this package.
 * Duplicated here deliberately rather than imported: it is six words tied to
 * two DIFFERENT purposes (an accessible button name there, a narrative
 * sentence here), the same small, declared duplication `dice.ts` already
 * argues for between `mentiroso-engine` and `dice-ui`'s own `DieFace`. */
const FACE_WORDS: Readonly<Record<DieFace, string>> = {
  1: "unos",
  2: "doses",
  3: "treses",
  4: "cuatros",
  5: "cincos",
  6: "seises",
};

/** The highest face a die can show — read off `DIE_FACES`, never restated as
 * a literal `6`, the same discipline `mentiroso-engine/src/bids.ts`'s own
 * `HIGHEST_FACE` documents for the identical fact. */
const HIGHEST_FACE: DieFace = DIE_FACES[DIE_FACES.length - 1]!;

/** "vos" for the viewer's own seat, "el asiento N" (1-indexed, matching every
 * other player-facing count in this codebase — never the engine's own
 * 0-indexed `seat`) for anyone else. Every fact line below is phrased
 * "Hecho: {label}." precisely so this label can slot into either subject
 * position with no verb to conjugate — "vos" and "el asiento 3" agree with
 * neither the same verb form in Spanish, and a phrasing that needed one
 * would have to special-case "vos" everywhere this label is used. */
export function seatLabel(seat: number, selfSeat: number): string {
  return seat === selfSeat ? "vos" : `el asiento ${String(seat + 1)}`;
}

/**
 * True iff the doubt that opened this showdown had no other legal move —
 * see this file's own top docblock for the "+1" argument. `totalDiceNow` is
 * the caller's own count over the CURRENT view (`describeShowdown` below is
 * the only caller in this file), kept as a parameter rather than computed
 * again in here so this function stays a pure, independently testable
 * predicate over exactly the two facts that decide it.
 */
export function wasForcedDoubt(phase: ShowdownPhase, totalDiceNow: number): boolean {
  const totalDiceAtChallenge = totalDiceNow + 1;
  return phase.bid.quantity === totalDiceAtChallenge && phase.bid.face === HIGHEST_FACE;
}

/** Every fact this file renders, computed once and DOM-free — the same split
 * `truco-ui/src/sena-notice.ts` already draws between `describeSenaNotice`
 * (pure) and `renderSenaNotice` (DOM). `null` outside the showdown phase:
 * there is nothing to reveal, and no seat has anything named yet. */
export interface ShowdownFacts {
  readonly bidText: string;
  readonly bidderHeld: boolean;
  readonly winnerLabel: string;
  readonly loserLabel: string;
  readonly loserEliminated: boolean;
  readonly wasForced: boolean;
  readonly doubterLabel: string;
}

/** A seat's CURRENT dice count, read off this same view — the viewer's own
 * when it is their seat, a rival's public `diceCount` (mentiroso-hidden-dice
 * R-RIVAL-SHAPE) otherwise. Never assumed from `loserSeat` alone: a seat that
 * surrendered a die a moment ago may still hold more. */
function diceCountFor(seat: number, view: PlayerView): number {
  if (seat === view.self.seat) return view.self.dice.length;
  return view.rivals.find((rival) => rival.seat === seat)?.diceCount ?? 0;
}

export function describeShowdown(view: PlayerView): ShowdownFacts | null {
  if (view.phase.kind !== "showdown") return null;
  const { bid, matched, doubterSeat, loserSeat, winnerSeat } = view.phase;

  const totalDiceNow = view.self.dice.length + view.rivals.reduce((sum, rival) => sum + rival.diceCount, 0);

  return {
    // "se apostó cuatro cincos, hay tres" — the launch prompt's own worked
    // example, verbatim in shape: the bid and the real count in one sentence,
    // because the count is what closes the story a bare bid cannot.
    bidText: `Se apostó ${String(bid.quantity)} ${FACE_WORDS[bid.face]}, había ${String(matched)}.`,
    // "AL MENOS esa cantidad" (mentiroso-rules) — a tie goes to the bidder,
    // never a strict `>` that would flip an exact match.
    bidderHeld: matched >= bid.quantity,
    winnerLabel: seatLabel(winnerSeat, view.self.seat),
    loserLabel: seatLabel(loserSeat, view.self.seat),
    loserEliminated: diceCountFor(loserSeat, view) === 0,
    wasForced: wasForcedDoubt(view.phase, totalDiceNow),
    doubterLabel: seatLabel(doubterSeat, view.self.seat),
  };
}

export type MentirosoShowdownRender = (container: HTMLElement, view: PlayerView) => void;

/**
 * Renders the four required facts, in order, plus the two conditional lines
 * above — one `<p>` per fact, never fused, so a reviewer (or a screen
 * reader moving line by line) reads exactly one claim at a time. Outside the
 * showdown phase, clears the container: this file draws nothing else.
 */
export const renderMentirosoShowdown: MentirosoShowdownRender = (container, view) => {
  container.className = "hexdev-mentiroso-showdown";
  const facts = describeShowdown(view);
  if (facts === null) {
    container.replaceChildren();
    return;
  }

  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const line = (className: string, text: string): void => {
    const paragraph = doc.createElement("p");
    paragraph.className = className;
    paragraph.textContent = text;
    fragment.appendChild(paragraph);
  };

  line("hexdev-mentiroso-showdown-bid", facts.bidText);
  line("hexdev-mentiroso-showdown-result", facts.bidderHeld ? "Resultado: la apuesta se cumplió." : "Resultado: la apuesta no se cumplió.");
  line("hexdev-mentiroso-showdown-winner", `Ganó el desafío: ${facts.winnerLabel}.`);
  line("hexdev-mentiroso-showdown-loser", `Entregó un dado: ${facts.loserLabel}.`);
  if (facts.loserEliminated) line("hexdev-mentiroso-showdown-eliminated", `Quedó eliminado: ${facts.loserLabel}.`);
  if (facts.wasForced) line("hexdev-mentiroso-showdown-forced", `Dudó sin otra jugada legal: ${facts.doubterLabel}.`);

  container.replaceChildren(fragment);
};
