import type { Action, PlayerView, TeamId } from "@hexdev/truco-engine";
import { announce, createAnnouncer } from "./announcer.js";
import { renderCallLog, scrollCallLogToNewest, speakerLabel } from "./call-log.js";
import { renderCalls } from "./calls.js";
import { deriveEnvidoRevealEvent, describeEnvidoRevealNotice } from "./envido-reveal-notice.js";
import type { EnvidoRevealEvent } from "./envido-reveal-notice.js";
import { captureFocus, restoreFocus } from "./focus-continuity.js";
import { deriveHandOutcomeEvent, describeHandOutcome, renderHandOutcomeBanner } from "./hand-outcome.js";
import type { HandOutcomeEvent } from "./hand-outcome.js";
import { renderHand } from "./hand.js";
import { renderLeaveControl } from "./leave-control.js";
import type { MatchOutcomeInfo } from "./match-outcome.js";
import { describeMatchOutcome, renderMatchOverOverlay } from "./match-outcome.js";
import { renderOpponentHand } from "./opponent-hand.js";
import { renderPlayedCards } from "./played-cards.js";
import { derivePendingCall, describePendingCall, isMyTurnToAnswer, respondingTeamId } from "./pending-call.js";
import { renderScoreboardPanel } from "./scoreboard-panel.js";

/** Same one-per-mount id counter as senas.ts's own `senasRowSequence`: the
 * rail's tab needs an aria-controls target that is unique on a page that may
 * embed more than one table. */
let railBodySequence = 0;
import { derivePendingCallMarks, deriveSeatCallEvent, renderSeatCallNotice } from "./seat-call-notice.js";
import type { SeatCallEvent } from "./seat-call-notice.js";
import { ensureMatchstickDefs } from "./scoreboard.js";
import { ANCHOR_ORDER, resolveSeatPositions } from "./seat-position.js";
import type { TableAnchor } from "./seat-position.js";
import { derivePartnerSenaEvent, describeSenaNotice, renderSenaNotice } from "./sena-notice.js";
import type { PartnerSenaEvent } from "./sena-notice.js";
import { renderSenaPicker } from "./senas.js";
import { TABLE_STRINGS } from "./strings.js";
import { ensureTableStyles } from "./table-styles.js";
import { describeTrickOutcome } from "./trick-feedback.js";
import { describeTurnClockStart, describeTurnClockWarning, formatCountdown, remainingWholeSeconds, TURN_CLOCK_WARNING_SECONDS } from "./turn-clock.js";
import { describeTurn } from "./turn.js";

/** "Long enough to register, short enough not to be in the way" (spec) —
 * tunable via `createMatchTableRenderer`'s own options, the same
 * clock/duration-injection discipline `truco-bot`'s `withThinkingDelay`
 * already established in this codebase, so this module's own tests never
 * need to wait multiple seconds in real time. */
const DEFAULT_HAND_OUTCOME_BANNER_MS = 2600;

/** A seña is TRANSIENT, exactly like the real table: "si no la viste, la
 * perdiste". Deliberately shorter than the hand-outcome banner above — that
 * one acknowledges something already settled and can afford to linger, while
 * this one interrupts live play and must clear out of the way fast. Same
 * duration-injection discipline, for the same reason: these tests never wait
 * seconds in real time. */
const DEFAULT_SENA_NOTICE_MS = 2000;

/** How often the turn countdown redraws itself between broadcasts. One second
 * is the whole point (the pill shows whole seconds), and it is injectable for
 * exactly the reason `senaNoticeMs` above is: so a test — and a visual
 * baseline — never has to wait real seconds to observe it. */
const DEFAULT_TURN_CLOCK_TICK_MS = 1000;

/** Longer than the seña notice (2000ms) and than the hand-outcome banner
 * (2600ms), on purpose. Those two acknowledge something the player already
 * WATCHED happen; this one delivers NUMBERS a player has to read, compare
 * against their own hand, and work out who took the envido with — reported
 * from real play as "no se muestran el tiempo suficiente". Reading two or
 * four declarations is simply slower than recognising an outcome. */
const DEFAULT_ENVIDO_REVEAL_NOTICE_MS = 4200;

/** Two seconds, and that number came from the report rather than from taste:
 * "se debe mostrar por 2 segundos para dar tiempo a leerlo". It is the beat
 * the table is meant to keep -- long enough that a call can be read on the
 * seat that made it before the next one lands, which is what turns three
 * bots calling into a sequence instead of a pile.
 *
 * PAIRED WITH THE BOT'S OWN PAUSE, which is 2400ms
 * (truco-bot's DEFAULT_THINKING_DELAY_MS) precisely so a bot cannot act again
 * while a chip is still up: this 2000 plus a visible beat. The two constants
 * live in packages that do not depend on each other — a bot has no business
 * importing a renderer — so each carries the other's number and this reason.
 * If either moves, the other has to be looked at.
 *
 * Injectable for the same reason every duration in this file is: so a test
 * never waits real seconds, and a visual baseline can freeze it. */
const DEFAULT_SEAT_CALL_NOTICE_MS = 2000;

export interface MatchTableRendererOptions {
  readonly handOutcomeBannerMs?: number;
  readonly senaNoticeMs?: number;
  /** How long the envido-reveal notice stays up. Injected for exactly the
   * reason `senaNoticeMs` is: so a test never waits real seconds, and a
   * visual baseline can freeze it. */
  readonly envidoRevealNoticeMs?: number;
  /** The clock the turn countdown measures the server's absolute deadline
   * against. Injected rather than calling `Date.now()` inline so a test can
   * assert an exact number, and so a visual baseline can freeze one — a live
   * countdown is otherwise the single most nondeterministic thing that could
   * possibly land in a screenshot. */
  readonly now?: () => number;
  readonly turnClockTickMs?: number;
  /** How long a call stays marked on the seat that made it. Injected exactly
   * like the notices above. */
  readonly seatCallNoticeMs?: number;
}

/** `outcome === null` while the match is still in progress — the ONLY
 * authoritative signal that a match has ended (from the module's own
 * `getOutcome`, carried over the wire alongside the view — see
 * `transport-colyseus`'s `viewMessageFor`). Never re-derived from
 * `view.teams`/`view.config.pointsToWin` here: that would silently
 * reimplement `getMatchWinner`'s own rule client-side. */
export interface MatchEndInfo {
  readonly outcome: MatchOutcomeInfo | null;
  readonly onPlayAgain?: () => void;
}

function anchorShell(position: TableAnchor): HTMLElement {
  const el = document.createElement("div");
  el.className = "hexdev-truco-anchor";
  el.dataset.position = position;
  return el;
}

/** A real DOM badge, not just CSS on the anchor — "text alone is not enough"
 * (spec: whose turn it is must be unmistakable). Placed on the exact anchor
 * that owes the next move, so it points at a specific seat rather than a
 * generic "it's someone's turn" signal — the piece that keeps working once a
 * fourth seat exists. */
function appendTurnBadge(anchor: HTMLElement, text: string, remainingMs: number | null): HTMLElement | null {
  const badge = document.createElement("span");
  badge.className = "hexdev-truco-turn-badge";
  badge.textContent = text;
  anchor.appendChild(badge);
  if (remainingMs === null) return null;
  const clock = badge.appendChild(document.createElement("span"));
  clock.className = "hexdev-truco-turn-clock";
  // THE ACCESSIBILITY DECISION, and the reason this element is a separate
  // node rather than more text in the badge. A countdown changes ONCE A
  // SECOND. This table carries seven ARIA live regions (announcer.ts), and a
  // reader speaks a live region every time its content changes — so a
  // per-second number reaching one would be read out sixty times a turn.
  //
  // Two independent things keep that from happening, and the fences in
  // `turn-clock.browser.test.ts` hold both: the badge lives in the felt, a
  // completely separate subtree from the announcers (which are direct
  // children of the shell), so no live region CONTAINS this node; and
  // `aria-hidden` means the number never joins the badge's accessible name
  // either, so navigating onto the badge reads "Tu turno" rather than a
  // second that is already stale by the time it is spoken.
  //
  // What a screen-reader user loses is the seconds themselves. What they get
  // instead is the clock's own throttled, coarse region — the "turn-clock"
  // announcer in `render` below: the total once when the LOCAL player's turn
  // starts, one warning near the end, and nothing at all in between or for
  // anybody else's turn.
  clock.setAttribute("aria-hidden", "true");
  clock.textContent = formatCountdown(remainingMs);
  return clock;
}

/**
 * Builds a fresh renderer with its own ephemeral, per-mount state — closed
 * over rather than stored on the DOM, the same shape `join-flow.ts`'s
 * `createDepartureGate` already established in this codebase. The one thing
 * this state tracks that a single view snapshot cannot: whether the LATEST
 * `trickOutcomes` entry is new since the previous render, which is what
 * makes "obvious who won the trick" (spec) possible even though a resolved
 * trick's `currentTrickPlays` is already empty by the time its view arrives
 * (the engine resolves a trick's second card and clears the trick in the
 * same atomic transition — there is no in-between snapshot to observe).
 */
export function createMatchTableRenderer(
  options?: MatchTableRendererOptions,
): (
  container: HTMLElement,
  view: PlayerView,
  legalActions: readonly Action[],
  dispatch: (action: Action) => void,
  matchEnd?: MatchEndInfo,
  turnDeadline?: number | null,
  /** Where "leave this match" goes. Optional: a caller with nowhere to send
   * the player (the fallback "connection is live" path) renders no control
   * at all rather than a button that dispatches into nothing. */
  onLeaveMatch?: () => void,
  /** The partner's private answer to a consult, and whether one is in flight.
   * Declared HERE as well as on the implementation below, and that is not
   * duplication for its own sake: this annotation is what the package
   * EXPORTS, so a parameter added only to the implementation is invisible to
   * every caller — the declaration emit simply drops it, and the call site
   * fails with "expected 4-7 arguments" while the source plainly shows 8. */
  consult?: { readonly advice: "quiero" | "no-quiero" | null; readonly asking: boolean },
) => void {
  let previousTrickCount = 0;
  let trickFeedback = "";
  let previousView: PlayerView | null = null;
  let handOutcomeEvent: HandOutcomeEvent | null = null;
  let handOutcomeTimer: ReturnType<typeof setTimeout> | undefined;
  const handOutcomeBannerMs = options?.handOutcomeBannerMs ?? DEFAULT_HAND_OUTCOME_BANNER_MS;
  let senaNoticeEvent: PartnerSenaEvent | null = null;
  let senaNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  const senaNoticeMs = options?.senaNoticeMs ?? DEFAULT_SENA_NOTICE_MS;
  // Same timer/re-arm shape as the two notices above it.
  let envidoRevealEvent: EnvidoRevealEvent | null = null;
  let envidoRevealTimer: ReturnType<typeof setTimeout> | undefined;
  const envidoRevealNoticeMs = options?.envidoRevealNoticeMs ?? DEFAULT_ENVIDO_REVEAL_NOTICE_MS;
  // Same timer/re-arm shape again, with one difference in the mounted node:
  // this notice can land on ANY of the four anchors, so the timer has a list
  // to clear rather than a single element. Read at fire time like the others.
  let seatCallEvent: SeatCallEvent | null = null;
  let seatCallTimer: ReturnType<typeof setTimeout> | undefined;
  let mountedSeatCallEls: HTMLElement[] = [];
  // Same closure shape, and for the same reason, as the banner lane below:
  // what expires is a timer, not a view. When the two-second moment is up,
  // the seat mark may still have something to show (a call that is STILL
  // waiting for an answer), so the timer repaints rather than erases.
  let repaintSeatCall: (() => void) | null = null;
  // ONE OCCUPANT AT A TIME. The banner lane has four tenants and each used to
  // paint itself independently, so any two that were live at once simply sat
  // side by side -- reported from real 2v2 play with an unanswered ENVIDO and
  // a partner's seña sharing the lane, which is two things to read at the
  // moment a player has a call to answer.
  //
  // A closure rather than a re-render, because the thing that expires is a
  // TIMER, not a view: when a notice's two seconds are up, nothing about the
  // match has changed and no new view is coming. Without this the lane would
  // simply stay empty until the server next said something -- the pending
  // call, which is still pending, would have vanished with the notice that
  // covered it. Reassigned on every render so it always closes over the
  // newest props.
  let repaintBannerLane: (() => void) | null = null;
  const seatCallNoticeMs = options?.seatCallNoticeMs ?? DEFAULT_SEAT_CALL_NOTICE_MS;

  // The live regions (announcer.ts). Unlike EVERY other node this renderer
  // touches, these are built ONCE per mount and then left alone: an
  // announcement is a CHANGE to a region already sitting in the accessibility
  // tree, so a region rebuilt each render — the shape every other node here
  // has — could never announce anything. They are created lazily on the first
  // render because that is when a `Document` is first in hand, and they are
  // exempted from the wipe below rather than re-appended, so they are never
  // even momentarily detached.
  let announcers: {
    readonly handOutcome: HTMLElement;
    readonly sena: HTMLElement;
    readonly envidoReveal: HTMLElement;
    readonly turn: HTMLElement;
    readonly turnClock: HTMLElement;
    readonly pendingCall: HTMLElement;
    readonly trick: HTMLElement;
    readonly matchOver: HTMLElement;
  } | null = null;

  const now = options?.now ?? Date.now;
  const turnClockTickMs = options?.turnClockTickMs ?? DEFAULT_TURN_CLOCK_TICK_MS;
  // The countdown's own repeating timer, plus the two things it reads AT FIRE
  // TIME rather than capturing at schedule time: whichever render is
  // CURRENTLY mounted is the one the tick must redraw, however many renders
  // happened in between. (The three banner-lane notices used to keep their
  // own mounted-node fields for the same reason; they no longer need them,
  // because the lane closure they now call holds those elements itself.)
  let turnClockTimer: ReturnType<typeof setInterval> | undefined;
  let mountedTurnClockEl: HTMLElement | null = null;
  let mountedTurnDeadline: number | null = null;
  // The coarse screen-reader half of that clock, keyed on the DEADLINE — the
  // one value that is per-turn, absolute and server-issued, so a re-broadcast
  // of the same turn can never re-announce and a new turn always does. Two
  // keys because the feature makes exactly two statements per timed turn of
  // the local player: which deadline has had its total announced, and which
  // its one low-time warning.
  let announcedClockDeadline: number | null = null;
  let warnedClockDeadline: number | null = null;
  // Whether the leave control is mid-question. Lives HERE, in the per-match
  // closure, for the same reason `previousTrickCount` does: every server view
  // re-renders the whole table, and a confirmation owned by the DOM would be
  // wiped by the next opponent move — precisely when a player is most likely
  // to be looking at it.
  let leaveAsking = false;

  return function render(
    container: HTMLElement,
    view: PlayerView,
    legalActions: readonly Action[],
    dispatch: (action: Action) => void,
    matchEnd?: MatchEndInfo,
    turnDeadline?: number | null,
    onLeaveMatch?: () => void,
    /** The partner's private answer to a consult, and whether one is in
     * flight. Passed in rather than read off the view because it never
     * travels in a view: `MatchRoom` sends it to the asking client alone, and
     * a redacted view that could carry it would carry it to everyone. */
    consult?: { readonly advice: "quiero" | "no-quiero" | null; readonly asking: boolean },
  ): void {
    ensureMatchstickDefs(container.ownerDocument);
    ensureTableStyles(container.ownerDocument);

    // WCAG 2.1.1/2.4.3 (focus-continuity.ts): every server broadcast rebuilds
    // every interactive node below, and the wipe used to dump keyboard focus
    // on <body> mid-hand — focus a call button, the opponent plays a card,
    // and your place at the table is gone. Captured HERE, before anything is
    // removed; restored as this render's very last act, once the equivalent
    // node exists again.
    const focusSnapshot = captureFocus(container);

    // Built on the first render, and re-built only if this renderer is ever
    // remounted into a different container/document (in which case the old
    // pair belongs to a tree nobody is reading any more).
    if (announcers === null || announcers.handOutcome.ownerDocument !== container.ownerDocument) {
      announcers = {
        handOutcome: createAnnouncer(container.ownerDocument, "hand-outcome"),
        sena: createAnnouncer(container.ownerDocument, "partner-sena"),
        envidoReveal: createAnnouncer(container.ownerDocument, "envido-reveal"),
        turn: createAnnouncer(container.ownerDocument, "turn"),
        turnClock: createAnnouncer(container.ownerDocument, "turn-clock"),
        pendingCall: createAnnouncer(container.ownerDocument, "pending-call"),
        trick: createAnnouncer(container.ownerDocument, "trick"),
        matchOver: createAnnouncer(container.ownerDocument, "match-over"),
      };
    }
    if (announcers.handOutcome.parentElement !== container) {
      // Appended from the OBJECT, never a hand-written list — same reason the
      // wipe below tests membership that way: an announcer added to the type
      // but forgotten here would be a region that never even mounts.
      container.append(...Object.values(announcers));
    }
    const {
      handOutcome: handOutcomeAnnouncer,
      sena: senaAnnouncer,
      envidoReveal: envidoRevealAnnouncer,
      turn: turnAnnouncer,
      turnClock: turnClockAnnouncer,
      pendingCall: pendingCallAnnouncer,
      trick: trickAnnouncer,
      matchOver: matchOverAnnouncer,
    } = announcers;

    // A hand ending is a POINT-IN-TIME event, not an ongoing view field — it
    // must survive past the very next broadcast (usually the freshly-dealt
    // next hand) for a minimum duration (spec: "before play moves on ...
    // short enough not to be in the way"), so its own timer — not the next
    // render — is what eventually clears it.
    const newHandOutcomeEvent = deriveHandOutcomeEvent(previousView, view);
    if (newHandOutcomeEvent !== null) {
      handOutcomeEvent = newHandOutcomeEvent;
      if (handOutcomeTimer !== undefined) clearTimeout(handOutcomeTimer);
      handOutcomeTimer = setTimeout(() => {
        handOutcomeEvent = null;
        repaintBannerLane?.();
        // The region empties with the chip, not on the next broadcast. Silent:
        // emptying is a REMOVAL, and `aria-relevant` stays at its default
        // ("additions text"), which excludes removals (announcer.ts).
        announce(handOutcomeAnnouncer, null);
      }, handOutcomeBannerMs);
    }

    // A partner's seña is the other POINT-IN-TIME event on this table, and the
    // only one PUSHED by someone else rather than opened by the person seeing
    // it — which is why it gets the banner lane rather than a centre overlay
    // that would cover the trick area while a player is deciding. Same
    // timer/re-arm shape as the hand-outcome banner immediately above; both
    // derive from `previousView`, so BOTH must be derived before the
    // assignment below replaces it.
    const newSenaEvent = derivePartnerSenaEvent(previousView, view);
    if (newSenaEvent !== null) {
      senaNoticeEvent = newSenaEvent;
      if (senaNoticeTimer !== undefined) clearTimeout(senaNoticeTimer);
      senaNoticeTimer = setTimeout(() => {
        senaNoticeEvent = null;
        repaintBannerLane?.();
        announce(senaAnnouncer, null);
      }, senaNoticeMs);
    }

    // The envido reveal — the third point-in-time moment, and the one this
    // lane was missing. Before it, the single most consequential thing the
    // envido produces announced itself by quietly adding a row to a side
    // panel: measured against the engine, those numbers survive the whole
    // hand, so the defect was never how LONG they lasted (the report's own
    // words, "no se muestran el tiempo suficiente") but that nothing ever
    // put them where the player was looking.
    //
    // Derived from `previousView` like the two above, so it must also be
    // derived BEFORE the assignment below replaces it.
    // WHO just spoke. Derived from the call-event list rather than from the
    // view as a whole, because that list is the only append-only record of
    // what was SAID -- the truco/envido state fields describe where the chain
    // stands now, which cannot tell a fresh call from a re-render of the same
    // one. Derived before `previousView` is replaced, exactly like the three
    // above it.
    const newSeatCallEvent = deriveSeatCallEvent(previousView?.hand?.callEvents ?? null, view.hand?.callEvents ?? [], view.hand?.envido);
    if (newSeatCallEvent !== null) {
      seatCallEvent = newSeatCallEvent;
      if (seatCallTimer !== undefined) clearTimeout(seatCallTimer);
      seatCallTimer = setTimeout(() => {
        seatCallEvent = null;
        repaintSeatCall?.();
      }, seatCallNoticeMs);
    }

    const newEnvidoRevealEvent = deriveEnvidoRevealEvent(previousView, view);
    if (newEnvidoRevealEvent !== null) {
      envidoRevealEvent = newEnvidoRevealEvent;
      if (envidoRevealTimer !== undefined) clearTimeout(envidoRevealTimer);
      envidoRevealTimer = setTimeout(() => {
        envidoRevealEvent = null;
        repaintBannerLane?.();
        announce(envidoRevealAnnouncer, null);
      }, envidoRevealNoticeMs);
    }
    previousView = view;

    // `relation` — obs 33's own engine work is what makes this reachable at
    // all (a 1v1 match's `view.teammates` is always empty, so this array is
    // structurally identical to before outside 2v2). Carried explicitly so
    // "partner vs opponent obvious at a glance" (spec) never has to be
    // re-derived from teamId at render time in more than one place.
    const others = [
      ...view.teammates.map((teammate) => ({ ...teammate, teamId: view.self.teamId, relation: "partner" as const })),
      // No `lastSena: null` filler on this side any more: it only ever existed
      // to give both branches the uniform shape the anchor's seña chip read
      // from, and that chip is gone. Nothing on an anchor reads a seña now, so
      // the opponent branch goes back to carrying strictly public seat facts.
      ...view.opponents.map((opponent) => ({ ...opponent, relation: "opponent" as const })),
    ];
    const seatCount = 1 + others.length;
    const positions = resolveSeatPositions({ mySeat: view.self.seat, seatCount });
    const turnSeat = view.hand?.turnSeat ?? null;

    const trickCount = view.hand?.trickOutcomes.length ?? 0;
    if (trickCount > previousTrickCount) {
      const latest = view.hand!.trickOutcomes[trickCount - 1]!;
      trickFeedback = describeTrickOutcome(view.self.teamId, latest.winnerTeamId);
    } else if ((view.hand?.currentTrickPlays.length ?? 0) > 0) {
      trickFeedback = ""; // a new trick started — the previous banner is stale
    }
    previousTrickCount = trickCount;

    // Play stops for a pending call (spec: "a call must stay on the table
    // until it is answered"). While one is open, `turnSeat` is frozen at
    // whatever it was before the call — it is NOT who owes the next input,
    // so both the anchor highlight and the badge redirect to whichever team
    // must actually answer, never to `turnSeat`.
    const pendingCall = derivePendingCall(view.hand);
    const respondingTeam = pendingCall === null ? null : respondingTeamId(pendingCall, view.teams);

    const isAnchorActive = (seat: number, teamId: TeamId): boolean =>
      pendingCall !== null ? teamId === respondingTeam : turnSeat !== null && turnSeat === seat;

    /**
     * EXACTLY ONE SEAT WEARS THE CLOCK.
     *
     * `isAnchorActive` answers "may this seat act", and with a call open that
     * is the whole answering TEAM — which is one player in 1v1 and two in
     * 2v2. Marking both was written when only the first could happen, and in
     * 2v2 it produced two rings and two badges at once. Worse, the badge
     * carries the countdown and the renderer tracks a single mounted clock
     * node, so only the last one appended ever ticked: reported from real
     * play as a partner's badge frozen at 0:50 while the player's own counted
     * down, and reading "Esperando al rival" on a TEAMMATE's seat while it
     * was in fact the player's own turn to answer.
     *
     * The local player comes first, and that is not arbitrary: the server
     * now stands its bots down from any decision a human teammate is being
     * offered (platform-core's own HumanPriorityActionClassifier), so when
     * the viewer is on the answering side the answer really is theirs. When
     * they are not, the first other active seat wears it.
     */
    // Every chain that is still open, each on the seat that opened it. Reads
    // the hand directly rather than going through `pendingCall`, because that
    // helper answers "is SOMETHING pending" with one call, and a truco frozen
    // behind an envido is a second one that is just as open.
    const pendingCallMarks = derivePendingCallMarks(view.hand ?? null);

    const seatOnTheClock: number | null = isAnchorActive(view.self.seat, view.self.teamId)
      ? view.self.seat
      : (others.find((other) => isAnchorActive(other.seat, other.teamId))?.seat ?? null);

    // THE BADGE NAMES WHO, and until this it only ever knew self from
    // not-self — so on a 2v2 table the one player on your side wore a badge
    // that called them a rival. Reported from a screenshot of live play, on
    // the seat directly opposite. A screen whose whole job is making the
    // pairing obvious at a glance cannot call the partner the other thing.
    const turnBadgeText = (relation: "self" | "partner" | "opponent"): string => {
      if (pendingCall !== null) {
        if (relation === "self") return TABLE_STRINGS.yourTurnToAnswer;
        return relation === "partner" ? TABLE_STRINGS.waitingOnPartner : TABLE_STRINGS.waitingOnOpponent;
      }
      if (relation === "self") return TABLE_STRINGS.yourTurn;
      return relation === "partner" ? TABLE_STRINGS.partnerTurn : TABLE_STRINGS.opponentTurn;
    };

    // ONE clock for the whole table, on the one badge that already names the
    // seat owing the move — only one seat is ever on the clock, so "visible to
    // everyone" is the ACTIVE seat's countdown, which all four players read
    // off the same badge. The deadline is absolute and server-issued, so every
    // client shows the same number without any per-second traffic.
    //
    // `null` (or an omitted argument) means this table is untimed: no clock
    // node is created at all, which is what keeps every pre-existing render —
    // and every visual baseline — byte-identical.
    mountedTurnDeadline = turnDeadline ?? null;
    const remainingMs = mountedTurnDeadline === null ? null : mountedTurnDeadline - now();

    // READ BEFORE THE WIPE BELOW, which is the whole point: this subtree is
    // rebuilt on every broadcast, so a drawer a player had opened would slam
    // shut every few seconds while they were reading it — and take the focus
    // they had inside it with it. Same discipline the lobby uses for its
    // credit panel's own `open`.
    //
    // The body's id is carried across for a second reason:
    // focus-continuity.ts rebuilds the path to the focused element out of its
    // ANCESTORS, and an aria-controls target that changed every render would
    // leave the tab pointing at nothing. Minted once per mount.
    const previousRail = container.querySelector(".hexdev-truco-side-rail");
    const railWasOpen = previousRail?.getAttribute("data-open") === "true";
    const railBodyId = previousRail?.querySelector(".hexdev-truco-rail-body")?.id ?? `hexdev-truco-rail-body-${String(++railBodySequence)}`;

    // Was `container.replaceChildren()`. The announcers are the ONE thing on
    // this table that must not be rebuilt, and `replaceChildren` removes every
    // child before re-inserting — even a child handed straight back to it — so
    // it cannot express "wipe all but these". Removing the others individually
    // leaves every live region continuously attached, never detached for even
    // a single render, which is what makes an announcement register at all.
    //
    // Membership is tested against the announcers OBJECT rather than against
    // named locals: adding a fourth announcer and forgetting to add it to a
    // hand-written list here would silently delete it on the very first
    // re-render and leave a live region that announces nothing — which is the
    // exact bug class this whole helper exists to kill, and which a list of
    // named comparisons had already reintroduced once.
    const liveRegions = new Set<Element>(Object.values(announcers));
    for (const child of [...container.children]) {
      if (!liveRegions.has(child)) child.remove();
    }
    container.className = "hexdev-truco-table-shell";
    // Own container-query note: a size container (declared on `container`
    // via table-styles.ts) cannot be styled by its own `@container` rules —
    // only descendants can. `layout` is the actual flex row/column that the
    // narrow/wide breakpoint switches; `container` stays a plain box.
    const layout = document.createElement("div");
    layout.className = "hexdev-truco-shell-layout";

    const felt = document.createElement("div");
    felt.className = "hexdev-truco-table";
    felt.dataset.seatCount = String(seatCount);

    const anchors = new Map<TableAnchor, HTMLElement>();
    for (const anchor of ANCHOR_ORDER) anchors.set(anchor, anchorShell(anchor));

    for (const other of others) {
      const anchor = anchors.get(positions.get(other.seat) ?? "top")!;
      // 2v2 only (obs 2970/the apply prompt's own "must never work out who
      // they are helping"): a real, queryable attribute an opponent's
      // anchor never gets — CSS reads it for the visual accent, and this is
      // also what senas.test.ts/table.test.ts assert against directly.
      anchor.dataset.relation = other.relation;
      // A real TEXT label, not color alone (seatCount>2 guard: in a 1v1
      // match there is nothing to distinguish — one opponent only, and the
      // label would be pure noise on the table this unit is contractually
      // forbidden from changing the appearance of).
      if (others.length > 1) {
        const label = anchor.appendChild(document.createElement("span"));
        label.className = "hexdev-truco-relation-label";
        label.textContent = other.relation === "partner" ? TABLE_STRINGS.partner : TABLE_STRINGS.opponent;
      }
      renderOpponentHand(anchor.appendChild(document.createElement("div")), other.cardsRemaining);
      // No seña chip here, deliberately. A partner's claim used to hang on
      // this anchor for the rest of the hand; it is a MOMENT now, announced
      // once in the banner lane and gone (see `renderSenaNotice` above). The
      // anchor carries only what is permanently true of a seat: who they are,
      // how many cards they hold, and whether they owe the next move.
      if (other.seat === seatOnTheClock) {
        anchor.classList.add("hexdev-truco-anchor--active");
        mountedTurnClockEl = appendTurnBadge(anchor, turnBadgeText(other.relation), remainingMs) ?? mountedTurnClockEl;
      }
    }

    const bottom = anchors.get("bottom")!;
    if (view.self.seat === seatOnTheClock) {
      bottom.classList.add("hexdev-truco-anchor--active");
      mountedTurnClockEl = appendTurnBadge(bottom, turnBadgeText("self"), remainingMs) ?? mountedTurnClockEl;
    }
    // Re-armed on every render, because the node it drives is rebuilt on every
    // render like everything else on this table. Cleared outright when there
    // is no deadline (a finished match, an untimed table), so no interval is
    // ever left running against a table that has stopped counting.
    if (turnClockTimer !== undefined) {
      clearInterval(turnClockTimer);
      turnClockTimer = undefined;
    }
    if (remainingMs === null) {
      mountedTurnClockEl = null;
    } else if (mountedTurnClockEl !== null) {
      turnClockTimer = setInterval(() => {
        const clock = mountedTurnClockEl;
        const deadline = mountedTurnDeadline;
        // Self-healing: this renderer has no unmount hook, so the one way an
        // interval could outlive its table is the widget tearing the container
        // down between broadcasts (`main.ts`'s own `replaceChildren` on
        // leaving a match). A detached node is that signal, and stopping here
        // is what keeps a left match from ticking forever in the background.
        if (clock === null || deadline === null || !clock.isConnected) {
          if (turnClockTimer !== undefined) clearInterval(turnClockTimer);
          turnClockTimer = undefined;
          return;
        }
        const remaining = deadline - now();
        clock.textContent = formatCountdown(remaining);
        // The ONE low-time warning (turn-clock.ts), fired by the same tick
        // that redraws the pill. Three guards, each load-bearing: the deadline
        // must be the one whose start THIS table announced (so a rival's
        // clock, which never announces, never warns either); it must not have
        // warned already (the key is what makes a second firing impossible,
        // however many ticks cross the threshold); and the turn must still be
        // live — once the deadline has passed, the server's timeout is already
        // in flight and "Quedan 10 segundos" would be a lie about time the
        // player no longer has.
        if (deadline === announcedClockDeadline && warnedClockDeadline !== deadline && remaining <= TURN_CLOCK_WARNING_SECONDS * 1000 && remaining > 0) {
          warnedClockDeadline = deadline;
          announce(turnClockAnnouncer, describeTurnClockWarning());
        }
      }, turnClockTickMs);
    }

    // The coarse screen-reader half of the countdown — what a reader gets
    // instead of the aria-hidden pill above (appendTurnBadge argues why the
    // pill itself must stay silent). Gated on the SAME predicate that just
    // decided whether the clock landed on the local player's own badge:
    // only the seat that owes the move is ever told its time, because a
    // rival's countdown announced every single turn is spam, not access.
    if (remainingMs === null || !isAnchorActive(view.self.seat, view.self.teamId)) {
      announcedClockDeadline = null;
      warnedClockDeadline = null;
      // Falls silent rather than saying anything: emptying a region is a
      // REMOVAL, which `aria-relevant`'s default excludes (announcer.ts).
      announce(turnClockAnnouncer, null);
    } else if (announcedClockDeadline !== mountedTurnDeadline) {
      announcedClockDeadline = mountedTurnDeadline;
      announce(turnClockAnnouncer, describeTurnClockStart(remainingMs));
      // A turn that STARTS at or under the warning threshold has already had
      // its low total said in the sentence above — a later "Quedan 10
      // segundos" would warn about MORE time than the turn ever had.
      if (remainingWholeSeconds(remainingMs) <= TURN_CLOCK_WARNING_SECONDS) {
        warnedClockDeadline = mountedTurnDeadline;
      }
    }
    // PR5 (D-3/blessed refinement 1, tasks §1 item 1/§2.2, §9): the action
    // bar is now a RESERVED GRID ROW below the hand, in flow, at every tier —
    // not a floating tray. Built here as a standalone local (NOT appended to
    // `bottom` — appended to `felt` below, after `center`, matching the
    // felt's own "actions" grid area/--hx-band-action-total track in
    // table-styles.ts), for the same reason the call log became a standalone
    // local in PR4: this is what lets CSS Grid place it purely by
    // `grid-area`, with no change to `renderCalls`/`renderSenaPicker`'s own
    // argument lists. This retires the turn-badge/tray axis conflict by
    // CONSTRUCTION: the badge lives at `top: -11px` of THIS anchor
    // (`bottom`), unmoved; the bar is a sibling grid row below that same
    // anchor — different edges, no shared axis, at any tier (tasks §2.2: no
    // badge-repositioning CSS exists anywhere in this codebase).
    const actionBar = document.createElement("div");
    actionBar.className = "hexdev-truco-action-bar";

    const callsRow = actionBar.appendChild(document.createElement("div"));
    callsRow.className = "hexdev-truco-calls-row";
    renderCalls(callsRow, legalActions, dispatch);
    // 1v1 must stay BYTE-IDENTICAL (visual regression safety property): no
    // extra DOM node is even created in `bottom` for a 1v1 view —
    // `view.teammates` is structurally always empty outside a 2v2 match, so
    // this condition is false for every 1v1 view, same discipline as
    // `renderCalls`'s own null groups.
    //
    // Gated on `view.teammates.length > 0` (a static fact about the MATCH),
    // not on "is send-sena legal RIGHT NOW" (stable window height, apply
    // prompt): `getLegalSenaActions` goes empty once the hand is decided
    // (truco-engine's `senas.ts`), which used to remove this whole node —
    // toggle and all — right at the very last render of a played hand.
    // Keeping the node mounted for the whole 2v2 match means
    // `renderSenaPicker` can still legitimately render nothing inside it
    // once send-sena stops being legal, without a visible element vanishing.
    //
    // The quota comes off `view.self` and nowhere else — it is the one place
    // the engine projects it (truco-engine's `view.ts`), and reading it here
    // rather than deriving anything locally is what keeps the UI's notion of
    // "spent" identical to the engine's own legality rule.
    //
    // `layout` is handed over as the picker's DISMISS SURFACE, and the choice
    // of node is the load-bearing part (see `senas.ts`'s own block comment on
    // those listeners). It is the widest thing on this table that is still
    // built fresh by THIS render and dropped by the next one — the whole
    // visible table hangs off it, so every click a player could mean as "not
    // the picker" bubbles through it, and it is discarded both on the next
    // broadcast and when `main.ts` empties the widget root. `container` would
    // have looked like the more natural choice and is exactly wrong: it is
    // `main.ts`'s own `app` element, which SURVIVES that teardown
    // (`replaceChildren` empties it, it does not remove it), so a listener
    // there would outlive the match with nothing left to remove it, no better
    // than `document`.
    // Beside the señas picker, and that is the point rather than a layout
    // convenience: the two spend ONE budget (truco-engine's `consult.ts`
    // charges a seña for a question), so they count down together where a
    // player can see it happen. Gated on the same static fact the picker
    // uses — a match with teammates — so a 1v1 felt gains no node at all.
    if (view.teammates.length > 0) {
      // ONE CONTROL, and its own toggle IS the allowance. Two buttons
      // counting the same budget were tried twice — a "(3)" on each, then a
      // lone chip between them — and both read as two budgets. So the picker
      // hosts both ways to spend it, and the number goes back on the single
      // button where it can only mean one thing.
      renderSenaPicker(
        actionBar.appendChild(document.createElement("div")),
        legalActions,
        dispatch,
        { remaining: view.self.senasRemaining },
        layout,
        { advice: consult?.advice ?? null, asking: consult?.asking ?? false },
      );
    }
    const handRow = bottom.appendChild(document.createElement("div"));
    renderHand(handRow, view.self.hand, legalActions, { onPlayCard: (card) => dispatch({ type: "play-card", playerId: view.self.playerId, card }) });

    const center = document.createElement("div");
    center.className = "hexdev-truco-center";

    // Stable window height (apply prompt: "un cartel aparece... la ventana
    // crece"): pending-call and hand-outcome are mutually exclusive in time
    // (a pending call always clears — see pending-call.ts's own doc comment —
    // before a hand-outcome event can be derived; see hand-outcome.ts) but
    // each independently appears/disappears via its own `:empty { display:
    // none }` rule. Round 3: this slot floats over the felt (table-styles'
    // own `position: absolute`, out of flow entirely) rather than reserving
    // layout space — a reserved worst case made the whole table taller than
    // a real phone's visible viewport (see the apply report). Docked at the
    // TOP of the centre column, matching where it already sat in flow, and
    // non-interactive (`pointer-events: none`), so it never swallows a tap
    // meant for anything beneath it.
    // Hoisted above the banner lane because TWO things read it now: the call
    // log itself, further down, and the reveal notice's speaker labels. One
    // object rather than two literals with the same fields — the seat a
    // player is called by must not depend on which of the two is asking.
    const callLogInput = {
      events: view.hand?.callEvents ?? [],
      envido: view.hand?.envido ?? ({ status: "none" } as const),
      manoSeat: view.hand?.manoSeat ?? 0,
      selfSeat: view.self.seat,
      positions,
    };

    const bannerSlot = center.appendChild(document.createElement("div"));
    bannerSlot.className = "hexdev-truco-banner-slot";

    /**
     * THE PENDING CALL HAS NO BANNER IN THE MIDDLE OF THE TABLE ANY MORE.
     *
     * It used to sit here naming the LEVEL and the calling TEAM ("Cantó:
     * Ellos") — which was all it could ever say, because the truco/envido
     * state fields carry a team and never a seat. Now the call is marked on
     * the seat that made it, for as long as it stands, so the middle of the
     * felt was repeating a worse version of something already on screen:
     * "ahora salen las 2 cards... debemos dejar solo la del jugador".
     *
     * Nothing about the call was lost with it. WHO called is the seat mark;
     * WHOSE turn it is, is the turn badge on that seat; WHAT can be done
     * about it is the row of buttons under the hand. The announcement below
     * stays for the same reason the envido reveal's did: a screen-reader user
     * has no seat to glance at, so the live region is not a duplicate of
     * anything for them.
     */
    const pendingCallProps =
      pendingCall === null
        ? null
        : {
            call: pendingCall,
            callerLabel: pendingCall.callingTeamId === view.self.teamId ? TABLE_STRINGS.us : TABLE_STRINGS.them,
            waitingOnMe: isMyTurnToAnswer(legalActions),
          };
    // Painted below, once, by the lane closure — see repaintBannerLane.
    // The FIFTH announcer, closing the one silent gap the turn announcer's
    // own yield created: while a call is open the turn line deliberately says
    // nothing because "the banner is the thing to read" — and the banner,
    // rebuilt every render, reads as nothing. Spoken from the SAME props the
    // banner draws, so the two can never describe different things; the
    // dedup story lives on `describePendingCall` itself. On resolution this
    // empties (a silent removal) in the same render the turn announcer
    // resumes — one region falls quiet, exactly one speaks.
    announce(pendingCallAnnouncer, pendingCallProps === null ? null : describePendingCall(pendingCallProps));

    const handOutcomeBanner = bannerSlot.appendChild(document.createElement("div"));
    const handOutcomeProps =
      handOutcomeEvent === null ? null : { event: handOutcomeEvent, wonBySelf: handOutcomeEvent.winnerTeamId === view.self.teamId };
    // Painted by the lane closure below.
    // Spoken from the SAME props the banner draws, so the two can never
    // describe different things; `announce` itself no-ops when the sentence
    // has not changed, which is what keeps a re-render silent.
    announce(handOutcomeAnnouncer, handOutcomeProps === null ? null : describeHandOutcome(handOutcomeProps));

    // Third occupant of the SAME reserved lane, on the same `:empty { display:
    // none }` terms as the two above. Unlike those two it is not mutually
    // exclusive with them in time — señas stay legal while a call is open
    // (truco-engine's `getLegalSenaActions`) — so the lane genuinely holds two
    // chips at once here, side by side in its flex row rather than stacked on
    // top of each other. Neither chip is ever hidden to make room for the
    // other: the pending call is the most important thing on screen while it
    // is open, and a seña the player never sees is a seña lost.
    const senaNotice = bannerSlot.appendChild(document.createElement("div"));
    const senaNoticeProps = senaNoticeEvent === null ? null : { signal: senaNoticeEvent.signal };
    // Painted by the lane closure below.
    announce(senaAnnouncer, senaNoticeProps === null ? null : describeSenaNotice(senaNoticeProps));

    // THE REVEAL HAS NO VISUAL BANNER ANY MORE, and keeping the announcement
    // is not an oversight. It used to paint a card in the middle of the felt
    // listing every declaration; reported from real play as the thing to
    // remove, on the grounds that the record panel plus a chip on each seat
    // already cover it: "esa card yo la sacaría, teniendo el log y los cantos
    // bien marcados sobre cada jugador en mini cards ya es suficiente".
    //
    // A screen-reader user has no side panel to glance at, so for them this
    // announcement is not a duplicate of anything — it is the only real-time
    // channel the reveal has. Dropping it because a sighted player found the
    // visual redundant would be trading one audience's clutter for another
    // audience's silence. `describeEnvidoRevealNotice` and the props below
    // therefore survive; only the painted node is gone.
    //
    // `speakerLabel` is IMPORTED from call-log.ts rather than reimplemented:
    // that module owns how a seat becomes "Vos"/"Rival"/"Compañero" from
    // table geometry, and a second copy is how the two would drift into
    // naming the same seat differently in two places on one screen.
    const envidoRevealProps =
      envidoRevealEvent === null
        ? null
        : {
            declarations: envidoRevealEvent.declarations,
            labelForSeat: (seat: number): string => speakerLabel(seat, callLogInput),
          };
    /**
     * WHO GETS THE LANE. A MOMENT outranks a STANDING STATE, because a moment
     * is the only one of the two that can be missed: the pending call is
     * still there after the notice clears, and this closure is what puts it
     * back. Among the moments, the order is how much a player loses by not
     * reading it — a hand outcome carries a result, a seña carries a hint.
     * (The envido reveal used to lead this order; it no longer paints
     * anything, so it no longer competes for the lane.)
     *
     * Reads the renderer's own event fields rather than the captured props,
     * so a timer that nulls its event and calls this gets the next occupant
     * rather than the one that just expired.
     */
    const paintBannerLane = (): void => {
      const occupant = handOutcomeEvent !== null ? "outcome" : senaNoticeEvent !== null ? "sena" : "none";
      renderHandOutcomeBanner(handOutcomeBanner, occupant === "outcome" ? handOutcomeProps : null);
      renderSenaNotice(senaNotice, occupant === "sena" ? senaNoticeProps : null);
    };
    repaintBannerLane = paintBannerLane;
    paintBannerLane();
    announce(envidoRevealAnnouncer, envidoRevealProps === null ? null : describeEnvidoRevealNotice(envidoRevealProps));

    const trickArea = center.appendChild(document.createElement("div"));
    // Every card played THIS HAND, not only the trick in progress (spec:
    // "Persistent Per-Seat Card Piles") — resolved tricks first (oldest
    // first, per `HandView.resolvedTrickPlays`'s own alignment with
    // `trickOutcomes`), then whatever is still in flight. `renderPlayedCards`
    // itself has no opinion on trick boundaries; it just lays out a flat,
    // chronological list per seat.
    const allPlaysThisHand = [...(view.hand?.resolvedTrickPlays.flat() ?? []), ...(view.hand?.currentTrickPlays ?? [])];
    renderPlayedCards(trickArea, allPlaysThisHand, positions);

    const feedback = document.createElement("p");
    feedback.className = "hexdev-truco-trick-feedback";
    feedback.textContent = trickFeedback;
    center.appendChild(feedback);
    // The visible line above is rebuilt every render and therefore announces
    // nothing; this region is its voice. It mirrors `trickFeedback` EXACTLY —
    // set when a trick resolves, emptied when the next trick's first card
    // lands — so what a reader hears is always what the line shows, and the
    // states dedup for free: a standing outcome re-rendered is the same
    // sentence (skipped by `announce`'s guard), and two same-team tricks in a
    // row always pass through the emptied between-tricks state, so the second
    // is a change again and speaks. Its OWN region, not the hand-outcome one:
    // the third trick and the hand's end land in the SAME broadcast, and two
    // rapid writes to one polite region let the second clobber the first.
    announce(trickAnnouncer, trickFeedback === "" ? null : trickFeedback);

    // Whose turn it is, once, in the middle of the table. NOT alongside the
    // per-anchor badge: the badge already names the state AND points at the
    // seat, so a second line saying the same thing two centimetres below is
    // noise — it read as duplicated on a 320px screen, where vertical space
    // is the scarcest thing there is.
    //
    // The badge wins because it carries strictly more information (which
    // seat), and it is the piece that keeps working once a fourth anchor
    // exists and "whose turn" stops being a two-way question. Whose turn it
    // is survives only as the accessible announcement, off-screen but read
    // out.
    //
    // It goes through the SAME announcer the other two point-in-time
    // announcements use, and that is a bug fix, not tidying. This used to be
    // a <p class="hexdev-truco-turn-indicator"> built right here, inside the
    // render path, carrying its own aria-live -- which means it was a fresh
    // node on every broadcast, and a live region only announces when the node
    // PERSISTS across content changes. It had therefore never announced
    // anything, while its own comment claimed it was "read out". The
    // announcer is created once per mount and stays continuously attached,
    // so the announcement is real; `announce` also skips rewriting unchanged
    // text, which matters here because this line is recomputed on every
    // single broadcast and would otherwise re-announce the same sentence.
    //
    // Silent while a call is pending, exactly as before: the pending-call
    // banner is the thing to read then, and emptying a region is a REMOVAL,
    // which `aria-relevant`'s default excludes.
    announce(turnAnnouncer, pendingCall === null ? describeTurn(view.self.seat, turnSeat) : null);

    // Call-log panel (spec: "Call-Log Panel With Bounded Footprint", "History
    // Persists Through the Outcome Banner"). Reads the SAME `positions` map
    // the piles above already use (design §5.2), so a speaker's label always
    // points at the seat's own screen anchor. No new UI state (Q5/D-9):
    // `view.hand` already carries the whole hand's history until the next
    // `startHand` resets `resolvedTrickPlays`/`callEvents` to `[]`, which is
    // exactly what clears both the piles and this panel for free.
    //
    // PR4 (D-4/blessed refinement 2, tasks §8): `callLog` is a FELT grid
    // child now, not a child of `.hexdev-truco-center` — created standalone
    // here (not appended to `center`) and appended to `felt` below, after
    // `center`, so table-styles.ts's own `.hexdev-truco-call-log` rule
    // (`grid-area: center; position: absolute; left: 0; bottom: 0` at
    // compact/medium, `grid-area: log; position: static` at wide/ultra) can
    // place it purely via CSS Grid's own "an absolutely-positioned grid item
    // with a definite grid-area is contained by that area" rule, with no
    // change to `renderCallLog`'s own argument list.
    const callLog = document.createElement("div");
    renderCallLog(callLog, callLogInput);

    // ONLY on the anchor that spoke, and never speculatively on the other
    // three. A host on every anchor reads as the tidier shape, and it is
    // wrong here: `.hexdev-truco-anchor:empty` is what hides the two side
    // anchors in a 1v1 match, so giving them a child — even an empty,
    // display:none one — makes them real boxes again. Measured, after
    // exactly that mistake: the felt grew 16px at 375, 24px at 700 and 32px
    // at 960, one seat gutter per tier, and four pinned height baselines went
    // red at once.
    //
    // The seat that just spoke always has cards, so this can never resurrect
    // an empty anchor. The timer empties the host it created; the next render
    // does not create one at all.
    /**
     * A STANDING CALL OUTRANKS A PASSING ONE. While a call is still waiting
     * for its answer, the mark belongs to whoever made it, for as long as it
     * stands — that is the state of the table, not a moment, and it is
     * exactly when a player needs to know which of three other seats spoke.
     * The two-second moment covers everything else (a response, an
     * escalation) once nothing is left open.
     *
     * Hosts are REMOVED rather than emptied. An empty child is not nothing:
     * `.hexdev-truco-anchor:empty` is what hides the two side anchors in a
     * 1v1, and leaving a spent host behind would bring them back as real
     * boxes — measured once already, at 16 to 32px of felt growth per tier.
     */
    const paintSeatCall = (): void => {
      for (const host of mountedSeatCallEls) host.remove();
      mountedSeatCallEls = [];

      // STANDING CLAIMS AND THE LATEST MOMENT, TOGETHER -- not one instead of
      // the other.
      //
      // The first cut let the standing marks REPLACE the passing one whenever
      // anything was open, and that quietly swallowed the case it mattered
      // most in. A quiero or a no-quiero is only ever a moment; it never
      // becomes a standing mark of its own. So whenever a call SURVIVED the
      // answer -- an envido declined while a truco is still waiting, an
      // ordinary sequence rather than a corner -- the answer was never drawn
      // at all. Reported as losing track of who replied and what they said,
      // and the honest reading is that it was never on screen to lose.
      //
      // The de-duplication is what makes showing both safe: a fresh CALL is
      // the newest moment AND the standing mark, so it would otherwise draw
      // twice on one seat. Matched on seat and text rather than by identity,
      // because the two reach here from different derivations of one event.
      //
      // Grouped BY SEAT rather than one host per mark: the hosts are
      // absolutely centred on the anchor, so two of them would land exactly
      // on top of each other.
      // Read into a local FIRST: `seatCallEvent` is a mutable field of the
      // renderer that a timer clears, so it cannot be narrowed inside this
      // closure — and a re-read halfway through would be a real race, not
      // just a type complaint.
      const moment = seatCallEvent;
      const alreadyStanding = moment !== null && pendingCallMarks.some((mark) => mark.seat === moment.seat && mark.text === moment.text);
      const shown = moment === null || alreadyStanding ? pendingCallMarks : [...pendingCallMarks, moment];
      const bySeat = new Map<number, string[]>();
      for (const mark of shown) {
        const texts = bySeat.get(mark.seat) ?? [];
        texts.push(mark.text);
        bySeat.set(mark.seat, texts);
      }

      for (const [seat, texts] of bySeat) {
        const anchorEl = anchors.get(positions.get(seat) ?? "top");
        if (anchorEl === undefined) continue;
        const host = anchorEl.appendChild(document.createElement("div"));
        mountedSeatCallEls.push(host);
        renderSeatCallNotice(host, texts);
      }
    };
    repaintSeatCall = paintSeatCall;
    paintSeatCall();

    for (const anchor of ANCHOR_ORDER) felt.appendChild(anchors.get(anchor)!);
    felt.appendChild(center);
    // PR5 (tasks §9): `actionBar` joins `callLog` as a standalone felt child,
    // placed purely by table-styles.ts's own `grid-area: actions` rule — no
    // ordering constraint here (unlike `callLog` below): the action bar has
    // no scroll-restoration call that depends on being attached to a live
    // document, so its append order relative to `callLog` is not
    // load-bearing.
    felt.appendChild(actionBar);

    // ONE RAIL, NOT TWO. Desktop used to flank the play with a vertical
    // column on each side: the call-log rail on the left and the scoreboard
    // rail on the right. Measured on a 1580px shell, that was 520px of chrome
    // around 979px of table, and both columns were mostly empty — the
    // scoreboard held about 300px of content in a 693px column. The cards,
    // which are the thing anyone is actually looking at, got what was left.
    //
    // They share one rail now, calls above and score below, and the column
    // that frees goes to the felt. Which is also why the call log stopped
    // being a felt child: it is chrome, it always was, and it was only living
    // on the cloth because that is where its grid area happened to be.
    //
    // The scoreboard is chrome for the same reason (design §10, obs 2955:
    // "the scoreboard is chrome, so it may take the tenant's brand; the cloth
    // keeps truco's identity") — a real, separate home for the tanteador, not
    // loose text floating on green (spec: Change 2).
    const panel = document.createElement("div");
    renderScoreboardPanel(panel, { teams: view.teams, selfTeamId: view.self.teamId, target: view.config.pointsToWin });

    // ON A PHONE THE RAIL IS A DRAWER, and that is not decoration. A rail
    // fixed in flow at 375px grows as the calls accumulate, and the felt
    // above it shrinks to match — which breaks the stable-window-height
    // contract table-height-stability.browser.test.ts exists to hold, and
    // costs card space on the screen that has the least of it. Out of flow
    // behind a tab, it costs the felt nothing and is one tap away.
    //
    // The open state is read back off the DOM before this rebuild rather than
    // held in a closure, for the same reason the lobby reads its credit
    // panel's `open` before wiping: this whole subtree is rebuilt on every
    // broadcast, so a drawer a player had opened would slam shut every few
    // seconds while they were reading it.

    const rail = document.createElement("div");
    rail.className = "hexdev-truco-side-rail";
    rail.dataset.open = String(railWasOpen);

    const railBody = document.createElement("div");
    railBody.className = "hexdev-truco-rail-body";
    railBody.id = railBodyId;

    // WCAG 4.1.2: aria-expanded promises a revealable region and aria-controls
    // names it, so the two are set together here and can never dangle.
    const railTab = document.createElement("button");
    railTab.type = "button";
    railTab.className = "hexdev-truco-rail-tab";
    railTab.setAttribute("aria-expanded", String(railWasOpen));
    railTab.setAttribute("aria-controls", railBody.id);
    railTab.textContent = TABLE_STRINGS.railTab;
    railTab.addEventListener("click", () => {
      const open = rail.dataset.open !== "true";
      rail.dataset.open = String(open);
      railTab.setAttribute("aria-expanded", String(open));
      railTab.textContent = open ? TABLE_STRINGS.railTabClose : TABLE_STRINGS.railTab;
    });
    if (railWasOpen) railTab.textContent = TABLE_STRINGS.railTabClose;

    // Order is the layout: calls on top, tantos underneath. MUST attach the
    // log here rather than later — see the construction-order comment further
    // below on `scrollCallLogToNewest`: that call is only safe once `callLog`
    // is attached all the way up to `container`, and this append is the first
    // link in that chain.
    railBody.appendChild(callLog);
    railBody.appendChild(panel);
    rail.appendChild(railTab);
    rail.appendChild(railBody);

    layout.appendChild(felt);
    layout.appendChild(rail);
    container.appendChild(layout);

    // The way out, mounted as a SIBLING of `layout` and positioned absolutely
    // over it (table-styles.ts). Deliberately not a row in the felt's grid:
    // the felt's height is the scarcest thing this widget has — it is already
    // capped against the viewport in fullscreen — so a permanent control
    // earns its place only by costing none of it. Absent entirely when the
    // caller offers nowhere to go, so the fallback "connection is live" path
    // never grows a button that dispatches into nothing.
    if (onLeaveMatch !== undefined) {
      const leaveHost = document.createElement("div");
      // `focusOnOpen` is false HERE — this call is a re-render, which happens
      // on every server view. Only the one below, from the player's own tap,
      // moves focus. Getting this wrong would drag focus back to cancel every
      // time the opponent moved.
      const paintLeave = (focusOnOpen = false): void => {
        renderLeaveControl(leaveHost, {
          asking: leaveAsking,
          focusOnOpen,
          onAsk: () => {
            leaveAsking = true;
            paintLeave(true);
          },
          onCancel: () => {
            leaveAsking = false;
            paintLeave();
          },
          onConfirm: () => {
            // Reset before handing off: the callback tears this match down,
            // and a renderer reused for a NEXT match must not open on a
            // question nobody asked.
            leaveAsking = false;
            onLeaveMatch();
          },
        });
      };
      paintLeave();
      container.appendChild(leaveHost);
    }

    // LOAD-BEARING ORDERING (PR4-T3, tasks §8, design §9.3): this call is only
    // safe once `callLog` is attached all the way up to `container` —
    // `felt.appendChild(callLog)` -> `layout.appendChild(felt)` ->
    // `layout.appendChild(panel)` -> `container.appendChild(layout)` -> ONLY
    // THEN this call. `scrollTop` is a no-op on a node with no layout yet
    // (call-log.ts's own doc comment on `scrollCallLogToNewest`;
    // `call-log.browser.test.ts:236` proves the detached case directly). A
    // regression here (e.g. reordering these appends, or calling this before
    // `container.appendChild(layout)`) produces no error and no visible
    // symptom in this function — the auto-scroll-to-newest just silently
    // stops working, which is exactly why this comment exists.
    scrollCallLogToNewest(callLog);

    // A real ending, mounted as a sibling of `layout` so it overlays the
    // whole shell (design: "losing should feel like a loss, not like an
    // error message") — the final trick and score stay visible underneath,
    // never a blank replace. `outcome` is the one authoritative signal a
    // match has ended; absent/null here just means the overlay stays empty.
    const matchOver = document.createElement("div");
    const matchOverProps =
      matchEnd?.outcome == null
        ? null
        : {
            outcome: matchEnd.outcome,
            selfPlayerId: view.self.playerId,
            teams: view.teams,
            selfTeamId: view.self.teamId,
            onPlayAgain: matchEnd.onPlayAgain ?? ((): void => undefined),
          };
    renderMatchOverOverlay(matchOver, matchOverProps);
    // The biggest moment on the table, finally said out loud — the overlay is
    // a rebuilt node and renders silently. Spoken from the SAME props the
    // overlay draws; `announce`'s guard keeps every later broadcast of the
    // same ended match silent.
    announce(matchOverAnnouncer, matchOverProps === null ? null : describeMatchOutcome(matchOverProps));
    container.appendChild(matchOver);
    restoreFocus(container, focusSnapshot);
  };
}
