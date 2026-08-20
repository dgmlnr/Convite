import type { Action, HandView, TeamId } from "@hexdev/truco-engine";
import { CALL_LABELS, TABLE_STRINGS } from "./strings.js";

/**
 * A call that is currently hanging on the table, unanswered — at a real
 * table, play stops and the call stays visible until someone answers it
 * (spec: "a call must stay on the table until it is answered"). One field
 * short of a full render prop: `levelLabel` is already the exact escalation
 * label (Truco/Retruco/Vale cuatro, Envido/Envido envido/Real
 * envido/Falta envido) — an escalation REPLACES the pending call, it never
 * appends to it, so there is never a chain to render, only "what is pending
 * NOW".
 */
export interface PendingCallInfo {
  readonly kind: "truco" | "envido";
  readonly levelLabel: string;
  readonly callingTeamId: TeamId;
}

/**
 * Derives the call currently hanging on the table, straight from the
 * engine's own `HandView` — no legality or scoring is re-judged here, only
 * which of the two chains (if either) is `"pending"`.
 *
 * Envido takes precedence when BOTH chains are simultaneously `"pending"`:
 * real Truco lets envido interrupt an unanswered truco call, and while it
 * does, `getLegalTrucoActions` itself returns nothing for anyone — envido is
 * the one actually blocking the table, so it is the one shown.
 *
 * Deliberately returns `null` once envido reaches `"accepted"`: quiero
 * already answered that call (spec: "until someone answers quiero or no
 * quiero... then it clears") — the reveal step that follows is a
 * resolution action available to either player, not a call hanging on
 * anyone in particular.
 */
export function derivePendingCall(hand: HandView | null): PendingCallInfo | null {
  if (hand === null) return null;
  if (hand.envido.status === "pending") {
    const level = hand.envido.calls[hand.envido.calls.length - 1]!;
    return { kind: "envido", levelLabel: CALL_LABELS[level], callingTeamId: hand.envido.callingTeamId };
  }
  if (hand.truco.status === "pending") {
    return { kind: "truco", levelLabel: CALL_LABELS[hand.truco.level], callingTeamId: hand.truco.callingTeamId };
  }
  return null;
}

/** Whether the LOCAL player, not the opponent, owes the answer — read
 * straight from `legalActions` (never re-derived): a `respond-*` action is
 * only ever legal for the player whose team owes the response. */
export function isMyTurnToAnswer(legalActions: readonly Action[]): boolean {
  return legalActions.some((action) => action.type === "respond-truco" || action.type === "respond-envido");
}

/** The team that owes the answer is, by construction, never the caller's own
 * team (`getLegalTrucoActions`/`getLegalEnvidoActions` both exclude the
 * calling team from ever seeing a respond action). Used to redirect the
 * active-seat highlight away from `turnSeat` — frozen at whatever it was
 * before the call — toward whoever actually owes input right now. */
export function respondingTeamId(call: PendingCallInfo, teams: readonly { readonly id: TeamId }[]): TeamId {
  return teams.find((team) => team.id !== call.callingTeamId)!.id;
}

export interface PendingCallBannerProps {
  readonly call: PendingCallInfo;
  /** "Nosotros"/"Ellos" — the caller vs. local-player comparison already
   * lives in `table.ts` for the scoreboard's team labels; reused here rather
   * than re-derived. */
  readonly callerLabel: string;
  readonly waitingOnMe: boolean;
}

/**
 * Renders the pending-call banner: what was called, who called it, and
 * whether the LOCAL player or the opponent owes the answer — deliberately a
 * plain in-flow block, never a modal-style overlay over the cloth (that is
 * exactly where this project's opacity-over-cloth trap lies in wait; this
 * element sits in normal document flow and never covers a card).
 *
 * `null` clears it back to empty — `:empty { display: none }` in the
 * stylesheet is what makes the banner disappear the instant the call
 * resolves, without this function needing to touch layout at all.
 */
export function renderPendingCallBanner(container: HTMLElement, props: PendingCallBannerProps | null): void {
  container.replaceChildren();
  container.className = "hexdev-truco-pending-call";
  if (props === null) {
    delete container.dataset.turn;
    return;
  }
  container.dataset.turn = props.waitingOnMe ? "mine" : "theirs";

  const level = document.createElement("span");
  level.className = "hexdev-truco-pending-call-level";
  level.textContent = props.call.levelLabel;
  container.appendChild(level);

  const caller = document.createElement("span");
  caller.className = "hexdev-truco-pending-call-caller";
  caller.textContent = `${TABLE_STRINGS.calledBy} ${props.callerLabel}`;
  container.appendChild(caller);

  const turn = document.createElement("span");
  turn.className = "hexdev-truco-pending-call-turn";
  turn.textContent = props.waitingOnMe ? TABLE_STRINGS.yourTurnToAnswer : TABLE_STRINGS.waitingOnOpponent;
  container.appendChild(turn);
}

/**
 * The same banner as ONE spoken sentence, for the live region `table.ts`
 * keeps mounted (see `announcer.ts`). The turn announcer deliberately falls
 * silent while a call is open — its own comment says the banner is the thing
 * to read then — but the banner is a node rebuilt on every render, which
 * announces nothing; this sentence is what actually reads it. Comma-joined
 * from the exact strings the banner renders (same discipline as
 * `describeHandOutcome`/`describeSenaNotice`: one wording function per
 * feature, drawing from the same props as the visible node so the two can
 * never describe different things).
 *
 * No dedup key beyond the sentence itself, on purpose: `announce`'s equality
 * guard already keeps a re-broadcast of the same standing call silent, an
 * escalation REPLACES the pending call (the derivation's own contract) so its
 * changed level re-announces, and two successive identical calls can only
 * exist with a resolution — an emptied region — between them, so the second
 * one is a change again and speaks.
 */
export function describePendingCall(props: PendingCallBannerProps): string {
  const turn = props.waitingOnMe ? TABLE_STRINGS.yourTurnToAnswer : TABLE_STRINGS.waitingOnOpponent;
  return `${props.call.levelLabel}, ${TABLE_STRINGS.calledBy} ${props.callerLabel}, ${turn}`;
}
