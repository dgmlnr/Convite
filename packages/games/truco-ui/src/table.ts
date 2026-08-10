import type { Action, PlayerView, TeamId } from "@hexdev/truco-engine";
import { renderCalls } from "./calls.js";
import { deriveHandOutcomeEvent, renderHandOutcomeBanner } from "./hand-outcome.js";
import type { HandOutcomeEvent } from "./hand-outcome.js";
import { renderHand } from "./hand.js";
import type { MatchOutcomeInfo } from "./match-outcome.js";
import { renderMatchOverOverlay } from "./match-outcome.js";
import { renderOpponentHand } from "./opponent-hand.js";
import { renderPlayedCards } from "./played-cards.js";
import { derivePendingCall, isMyTurnToAnswer, renderPendingCallBanner, respondingTeamId } from "./pending-call.js";
import { renderScoreboardPanel } from "./scoreboard-panel.js";
import { ensureMatchstickDefs } from "./scoreboard.js";
import { ANCHOR_ORDER, resolveSeatPositions } from "./seat-position.js";
import type { TableAnchor } from "./seat-position.js";
import { renderPartnerSena, renderSenaPicker } from "./senas.js";
import { TABLE_STRINGS } from "./strings.js";
import { ensureTableStyles } from "./table-styles.js";
import { describeTrickOutcome } from "./trick-feedback.js";
import { describeTurn } from "./turn.js";

/** "Long enough to register, short enough not to be in the way" (spec) —
 * tunable via `createMatchTableRenderer`'s own options, the same
 * clock/duration-injection discipline `truco-bot`'s `withThinkingDelay`
 * already established in this codebase, so this module's own tests never
 * need to wait multiple seconds in real time. */
const DEFAULT_HAND_OUTCOME_BANNER_MS = 2600;

export interface MatchTableRendererOptions {
  readonly handOutcomeBannerMs?: number;
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
function appendTurnBadge(anchor: HTMLElement, text: string): void {
  const badge = document.createElement("span");
  badge.className = "hexdev-truco-turn-badge";
  badge.textContent = text;
  anchor.appendChild(badge);
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
): (container: HTMLElement, view: PlayerView, legalActions: readonly Action[], dispatch: (action: Action) => void, matchEnd?: MatchEndInfo) => void {
  let previousTrickCount = 0;
  let trickFeedback = "";
  let previousView: PlayerView | null = null;
  let handOutcomeEvent: HandOutcomeEvent | null = null;
  let handOutcomeTimer: ReturnType<typeof setTimeout> | undefined;
  // The DOM node currently showing the banner — read by the timer AT FIRE
  // TIME, not captured at schedule time, so whichever render is CURRENTLY
  // mounted gets cleared, however many intervening renders happened first.
  let mountedHandOutcomeEl: HTMLElement | null = null;
  const handOutcomeBannerMs = options?.handOutcomeBannerMs ?? DEFAULT_HAND_OUTCOME_BANNER_MS;

  return function render(
    container: HTMLElement,
    view: PlayerView,
    legalActions: readonly Action[],
    dispatch: (action: Action) => void,
    matchEnd?: MatchEndInfo,
  ): void {
    ensureMatchstickDefs(container.ownerDocument);
    ensureTableStyles(container.ownerDocument);

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
        if (mountedHandOutcomeEl !== null) renderHandOutcomeBanner(mountedHandOutcomeEl, null);
      }, handOutcomeBannerMs);
    }
    previousView = view;

    // `relation` — obs 33's own engine work is what makes this reachable at
    // all (a 1v1 match's `view.teammates` is always empty, so this array is
    // structurally identical to before outside 2v2). Carried explicitly so
    // "partner vs opponent obvious at a glance" (spec) never has to be
    // re-derived from teamId at render time in more than one place.
    const others = [
      ...view.teammates.map((teammate) => ({ ...teammate, teamId: view.self.teamId, relation: "partner" as const })),
      ...view.opponents.map((opponent) => ({ ...opponent, relation: "opponent" as const, lastSena: null })),
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

    const turnBadgeText = (forSelf: boolean): string => {
      if (pendingCall !== null) return forSelf ? TABLE_STRINGS.yourTurnToAnswer : TABLE_STRINGS.waitingOnOpponent;
      return forSelf ? TABLE_STRINGS.yourTurn : TABLE_STRINGS.opponentTurn;
    };

    container.replaceChildren();
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
      if (other.relation === "partner") {
        renderPartnerSena(anchor.appendChild(document.createElement("div")), other.lastSena);
      }
      if (isAnchorActive(other.seat, other.teamId)) {
        anchor.classList.add("hexdev-truco-anchor--active");
        appendTurnBadge(anchor, turnBadgeText(false));
      }
    }

    const bottom = anchors.get("bottom")!;
    if (isAnchorActive(view.self.seat, view.self.teamId)) {
      bottom.classList.add("hexdev-truco-anchor--active");
      appendTurnBadge(bottom, turnBadgeText(true));
    }
    // Stable window height (apply prompt, round 3): reserving layout space
    // for the call buttons and the señas picker made the whole table
    // permanently taller than a real phone's visible viewport (739px/859px
    // measured against a ~530-601px iPhone SE viewport) — a constant height
    // that no longer fits the screen is not "linda y cómoda" either. This
    // tray takes both OUT of flow entirely (position: absolute, table-styles
    // .hexdev-truco-action-tray) so neither can affect the felt's height at
    // all, at zero permanent cost — the same technique the turn badge and
    // the match-over overlay already use. It floats directly above THIS
    // anchor's own box (`bottom: 100%` off `.hexdev-truco-anchor`'s own
    // `position: relative`), which — because the anchor now contains only
    // the still-in-flow hand row below — guarantees it never covers the
    // player's own (tappable) cards. It can still visually sit over the
    // lower edge of the trick area above it when a card has already been
    // played into the current trick; that trick card is not interactive, so
    // no tap is ever swallowed by this tray — a disclosed, accepted
    // tradeoff, not a hidden one.
    const actionTray = bottom.appendChild(document.createElement("div"));
    actionTray.className = "hexdev-truco-action-tray";

    const callsRow = actionTray.appendChild(document.createElement("div"));
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
    if (view.teammates.length > 0) {
      renderSenaPicker(actionTray.appendChild(document.createElement("div")), legalActions, dispatch);
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
    const bannerSlot = center.appendChild(document.createElement("div"));
    bannerSlot.className = "hexdev-truco-banner-slot";

    const banner = bannerSlot.appendChild(document.createElement("div"));
    renderPendingCallBanner(
      banner,
      pendingCall === null
        ? null
        : {
            call: pendingCall,
            callerLabel: pendingCall.callingTeamId === view.self.teamId ? TABLE_STRINGS.us : TABLE_STRINGS.them,
            waitingOnMe: isMyTurnToAnswer(legalActions),
          },
    );

    const handOutcomeBanner = bannerSlot.appendChild(document.createElement("div"));
    mountedHandOutcomeEl = handOutcomeBanner;
    renderHandOutcomeBanner(
      handOutcomeBanner,
      handOutcomeEvent === null ? null : { event: handOutcomeEvent, wonBySelf: handOutcomeEvent.winnerTeamId === view.self.teamId },
    );

    const trickArea = center.appendChild(document.createElement("div"));
    renderPlayedCards(trickArea, view.hand?.currentTrickPlays ?? [], positions);

    const feedback = document.createElement("p");
    feedback.className = "hexdev-truco-trick-feedback";
    feedback.textContent = trickFeedback;
    center.appendChild(feedback);

    // Whose turn it is, once, in the middle of the table. NOT alongside the
    // per-anchor badge: the badge already names the state AND points at the
    // seat, so a second line saying the same thing two centimetres below is
    // noise — it read as duplicated on a 320px screen, where vertical space
    // is the scarcest thing there is.
    //
    // The badge wins because it carries strictly more information (which
    // seat), and it is the piece that keeps working once a fourth anchor
    // exists and "whose turn" stops being a two-way question. This line
    // survives only as the accessible announcement, off-screen but read out.
    const turnIndicator = document.createElement("p");
    turnIndicator.className = "hexdev-truco-turn-indicator";
    turnIndicator.setAttribute("aria-live", "polite");
    turnIndicator.textContent = pendingCall === null ? describeTurn(view.self.seat, turnSeat) : "";
    center.appendChild(turnIndicator);

    for (const anchor of ANCHOR_ORDER) felt.appendChild(anchors.get(anchor)!);
    felt.appendChild(center);

    // The scoreboard is chrome, mounted as a SIBLING of the felt, never a
    // child of it (design §10, obs 2955: "the scoreboard is chrome, so it
    // may take the tenant's brand; the cloth keeps truco's identity") — a
    // real, separate home for the tanteador, not loose text floating on
    // green (spec: Change 2).
    const panel = document.createElement("div");
    renderScoreboardPanel(panel, { teams: view.teams, selfTeamId: view.self.teamId, target: view.config.pointsToWin });

    layout.appendChild(felt);
    layout.appendChild(panel);
    container.appendChild(layout);

    // A real ending, mounted as a sibling of `layout` so it overlays the
    // whole shell (design: "losing should feel like a loss, not like an
    // error message") — the final trick and score stay visible underneath,
    // never a blank replace. `outcome` is the one authoritative signal a
    // match has ended; absent/null here just means the overlay stays empty.
    const matchOver = document.createElement("div");
    renderMatchOverOverlay(
      matchOver,
      matchEnd?.outcome == null
        ? null
        : {
            outcome: matchEnd.outcome,
            selfPlayerId: view.self.playerId,
            teams: view.teams,
            selfTeamId: view.self.teamId,
            onPlayAgain: matchEnd.onPlayAgain ?? ((): void => undefined),
          },
    );
    container.appendChild(matchOver);
  };
}
