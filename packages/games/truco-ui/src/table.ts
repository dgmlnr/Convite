import type { Action, PlayerView, TeamId } from "@hexdev/truco-engine";
import { announce, createAnnouncer } from "./announcer.js";
import { renderCallLog, scrollCallLogToNewest } from "./call-log.js";
import { renderCalls } from "./calls.js";
import { deriveHandOutcomeEvent, describeHandOutcome, renderHandOutcomeBanner } from "./hand-outcome.js";
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
import { derivePartnerSenaEvent, describeSenaNotice, renderSenaNotice } from "./sena-notice.js";
import type { PartnerSenaEvent } from "./sena-notice.js";
import { renderSenaPicker } from "./senas.js";
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

/** A seña is TRANSIENT, exactly like the real table: "si no la viste, la
 * perdiste". Deliberately shorter than the hand-outcome banner above — that
 * one acknowledges something already settled and can afford to linger, while
 * this one interrupts live play and must clear out of the way fast. Same
 * duration-injection discipline, for the same reason: these tests never wait
 * seconds in real time. */
const DEFAULT_SENA_NOTICE_MS = 2000;

export interface MatchTableRendererOptions {
  readonly handOutcomeBannerMs?: number;
  readonly senaNoticeMs?: number;
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
  let senaNoticeEvent: PartnerSenaEvent | null = null;
  let senaNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  // Read AT FIRE TIME, never captured at schedule time — same reason as
  // `mountedHandOutcomeEl` above: whichever render is CURRENTLY mounted is
  // the one the timer must clear, however many renders happened in between.
  let mountedSenaNoticeEl: HTMLElement | null = null;
  const senaNoticeMs = options?.senaNoticeMs ?? DEFAULT_SENA_NOTICE_MS;

  // The two live regions (announcer.ts). Unlike EVERY other node this renderer
  // touches, these are built ONCE per mount and then left alone: an
  // announcement is a CHANGE to a region already sitting in the accessibility
  // tree, so a region rebuilt each render — the shape every other node here
  // has — could never announce anything. They are created lazily on the first
  // render because that is when a `Document` is first in hand, and they are
  // exempted from the wipe below rather than re-appended, so they are never
  // even momentarily detached.
  let announcers: { readonly handOutcome: HTMLElement; readonly sena: HTMLElement; readonly turn: HTMLElement } | null = null;

  return function render(
    container: HTMLElement,
    view: PlayerView,
    legalActions: readonly Action[],
    dispatch: (action: Action) => void,
    matchEnd?: MatchEndInfo,
  ): void {
    ensureMatchstickDefs(container.ownerDocument);
    ensureTableStyles(container.ownerDocument);

    // Built on the first render, and re-built only if this renderer is ever
    // remounted into a different container/document (in which case the old
    // pair belongs to a tree nobody is reading any more).
    if (announcers === null || announcers.handOutcome.ownerDocument !== container.ownerDocument) {
      announcers = {
        handOutcome: createAnnouncer(container.ownerDocument, "hand-outcome"),
        sena: createAnnouncer(container.ownerDocument, "partner-sena"),
        turn: createAnnouncer(container.ownerDocument, "turn"),
      };
    }
    if (announcers.handOutcome.parentElement !== container) {
      container.append(announcers.handOutcome, announcers.sena, announcers.turn);
    }
    const { handOutcome: handOutcomeAnnouncer, sena: senaAnnouncer, turn: turnAnnouncer } = announcers;

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
        if (mountedSenaNoticeEl !== null) renderSenaNotice(mountedSenaNoticeEl, null);
        announce(senaAnnouncer, null);
      }, senaNoticeMs);
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

    const turnBadgeText = (forSelf: boolean): string => {
      if (pendingCall !== null) return forSelf ? TABLE_STRINGS.yourTurnToAnswer : TABLE_STRINGS.waitingOnOpponent;
      return forSelf ? TABLE_STRINGS.yourTurn : TABLE_STRINGS.opponentTurn;
    };

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
    if (view.teammates.length > 0) {
      renderSenaPicker(actionBar.appendChild(document.createElement("div")), legalActions, dispatch, {
        remaining: view.self.senasRemaining,
      });
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
    const handOutcomeProps =
      handOutcomeEvent === null ? null : { event: handOutcomeEvent, wonBySelf: handOutcomeEvent.winnerTeamId === view.self.teamId };
    renderHandOutcomeBanner(handOutcomeBanner, handOutcomeProps);
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
    mountedSenaNoticeEl = senaNotice;
    const senaNoticeProps = senaNoticeEvent === null ? null : { signal: senaNoticeEvent.signal };
    renderSenaNotice(senaNotice, senaNoticeProps);
    announce(senaAnnouncer, senaNoticeProps === null ? null : describeSenaNotice(senaNoticeProps));

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
    renderCallLog(callLog, {
      events: view.hand?.callEvents ?? [],
      envido: view.hand?.envido ?? { status: "none" },
      manoSeat: view.hand?.manoSeat ?? 0,
      selfSeat: view.self.seat,
      positions,
    });

    for (const anchor of ANCHOR_ORDER) felt.appendChild(anchors.get(anchor)!);
    felt.appendChild(center);
    // PR5 (tasks §9): `actionBar` joins `callLog` as a standalone felt child,
    // placed purely by table-styles.ts's own `grid-area: actions` rule — no
    // ordering constraint here (unlike `callLog` below): the action bar has
    // no scroll-restoration call that depends on being attached to a live
    // document, so its append order relative to `callLog` is not
    // load-bearing.
    felt.appendChild(actionBar);
    // MUST attach here, as a felt child (not inside `center`) — see the
    // construction-order comment further below on `scrollCallLogToNewest`:
    // that call is only safe once `callLog` is attached all the way up to
    // `container`, and this append is the first link in that chain.
    felt.appendChild(callLog);

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
