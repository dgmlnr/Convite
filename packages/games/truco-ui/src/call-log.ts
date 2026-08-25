import type { CallEvent, EnvidoDeclaration, EnvidoState } from "@hexdev/truco-engine";
import type { TableAnchor } from "./seat-position.js";
import { CALL_LABELS, TABLE_STRINGS } from "./strings.js";

/**
 * Everything `renderCallLog` needs to build one panel (design §5.2). `events`
 * and `envido` are read straight off `HandView` — no re-derivation of any
 * game rule happens here, only Spanish labeling of already-decided facts.
 * `positions` is the SAME `ReadonlyMap<number, TableAnchor>` `table.ts`
 * already computes for the piles (`resolveSeatPositions`), so a speaker's
 * label always points at the seat's own screen anchor.
 */
export interface CallLogInput {
  readonly events: readonly CallEvent[];
  /** Read only in its `revealed` variant (spec: "Mano-Ordered Envido Row"),
   * which the type makes natural: `declarations` exists only there. Its
   * numbers reach the log through the reveal EVENT's own entry — the event
   * itself carries none, and must not (D-1/D-5). */
  readonly envido: EnvidoState;
  readonly manoSeat: number;
  readonly selfSeat: number;
  readonly positions: ReadonlyMap<number, TableAnchor>;
}

/**
 * Attributes a seat to a Spanish speaker label from TABLE geometry, never a
 * player id or name (`PlayerView` carries no display names at all): the
 * viewer's own seat is "Vos"; the seat at the `top` anchor is the partner in
 * 2v2 ("Compañero") or the lone opponent in 1v1 ("Rival") — `positions.size`
 * (the seat count) is what tells the two apart; the two side anchors are
 * always opponents (`resolveSeatPositions`'s own geometry: the partner sits
 * opposite, at `top`), so `left`/`right` map directly to "Rival izq."/"Rival
 * der." regardless of seat count.
 */
export function speakerLabel(seat: number, input: CallLogInput): string {
  if (seat === input.selfSeat) return TABLE_STRINGS.speakerSelf;
  const anchor = input.positions.get(seat) ?? "top";
  if (anchor === "left") return TABLE_STRINGS.speakerOpponentLeft;
  if (anchor === "right") return TABLE_STRINGS.speakerOpponentRight;
  return input.positions.size > 2 ? TABLE_STRINGS.partner : TABLE_STRINGS.opponent;
}

/**
 * The Spanish copy for one `CallEvent`, reusing `CALL_LABELS` for every call
 * level and the quiero/no-quiero responses (never a second copy of the same
 * strings) — `calls.ts`'s own `labelFor` is this function's sibling for
 * legal-action buttons; this one covers the PAST-TENSE log instead. A reveal
 * carries no points/winner (design §2.1: "marker only"), so it gets its own
 * past-tense phrase, `TABLE_STRINGS.showedEnvido`.
 *
 * Exported for `seat-call-notice.ts`, which shows the SAME words over the
 * caller's own cards at the moment they are said. That notice is the moment
 * and this panel is the record, but the two must never disagree about what
 * was called -- so they share one function rather than keeping a second copy
 * of the same Spanish in sync by hand.
 */
export function callEventText(event: CallEvent, envido?: EnvidoState): string {
  switch (event.kind) {
    case "truco-call":
      return CALL_LABELS[event.level];
    case "truco-response":
      return event.response === "quiero" ? CALL_LABELS.quiero : CALL_LABELS.noQuiero;
    case "envido-call":
      return CALL_LABELS[event.level];
    case "envido-response":
      return event.response === "quiero" ? CALL_LABELS.quiero : CALL_LABELS.noQuiero;
    case "envido-declaration":
      // THE NUMBER COMES FROM `envido`, NEVER FROM THE EVENT. The event is
      // marker-only by design (D-1/D-5) so the tantos have exactly one home:
      // the structurally-redacted declarations list. A concession has no
      // number to find, and must not — that is what keeps "son buenas"
      // genuinely unknowable rather than merely unrendered.
      return event.declaration === "sonBuenas" ? TABLE_STRINGS.sonBuenas : declaredPointsAt(event.seat, envido);
  }
}

/** The number this seat said, from whichever variant currently holds the
 * round: `accepted` while it is in progress, `revealed` once it is over. */
function declaredPointsAt(seat: number, envido: EnvidoState | undefined): string {
  const declarations = envido === undefined ? [] : envido.status === "accepted" || envido.status === "revealed" ? envido.declarations : [];
  const said = declarations.find(
    (entry): entry is Extract<EnvidoDeclaration, { declaration: "points" }> => entry.seat === seat && entry.declaration === "points",
  );
  return said === undefined ? "" : String(said.points);
}

function buildEntry(event: CallEvent, input: CallLogInput): HTMLElement {
  const entry = document.createElement("li");
  entry.className = "hexdev-truco-call-log-entry";
  // dataset.seat + dataset.position, together: CSS reads both for a
  // per-speaker tint, matching the project's "text alone is not enough /
  // color alone is not enough" convention (already established by
  // table.ts's own data-relation attribute) — the speaker span below carries
  // the real text half.
  entry.dataset.seat = String(event.seat);
  entry.dataset.position = input.positions.get(event.seat) ?? "top";

  const speaker = entry.appendChild(document.createElement("span"));
  speaker.className = "hexdev-truco-call-log-speaker";
  speaker.textContent = speakerLabel(event.seat, input);

  const text = entry.appendChild(document.createElement("span"));
  text.className = "hexdev-truco-call-log-text";
  text.textContent = callEventText(event, input.envido);

  // The numbers belong to THIS event, so they hang off it. Read from
  // `input.envido` and never from the event: the event carries no points and
  // must not (envido-chain.ts keeps the reveal marker-only, D-1/D-5 — the
  // declarations list is the one structurally-redacted home for them).

  return entry;
}

/**
 * Renders the whole call-log panel into `host` (design §5.2/D-10: ONE panel,
 * never two independent floating boxes — and now literally one list, with
 * the reveal's own declarations hanging off the reveal's own entry rather
 * than pinned above the scroller). `host`
 * itself is the panel element — `table.ts` mounts it as a child of
 * `.hexdev-truco-center`; this function never creates or positions that
 * mount point, only fills it.
 *
 * Renders NOTHING (zero children) when there are no events yet: the caller's
 * own `.hexdev-truco-call-log:empty { display: none }` rule (table-styles.ts,
 * §5.3) is what actually hides it — mirrors `renderPendingCallBanner`'s and
 * `renderHandOutcomeBanner`'s established `:empty` convention in this
 * package, rather than inventing a third way to hide a transient panel.
 *
 * MUST be followed by `scrollCallLogToNewest(host)` once `host` is in the
 * document (D-9: auto-scroll to newest on every render) — see that
 * function's own doc comment for why the two are separate exports.
 */
export function renderCallLog(host: HTMLElement, input: CallLogInput): void {
  host.replaceChildren();
  host.className = "hexdev-truco-call-log";
  if (input.events.length === 0) return;

  // A real heading (WCAG 1.3.1), not a paragraph styled to look like one: this
  // line labels everything in the panel, which is what a heading is for, and
  // it is the only way a reader navigating by heading can find this panel at
  // all. H2 because nothing else on the felt is persistently a heading — the
  // match-over overlay's own H2 is transient and exclusive with play. Paint is
  // unchanged: table-styles.ts's shared title rule already declares margin,
  // font-size and font-weight, leaving a heading's UA defaults nothing to say.
  const title = host.appendChild(document.createElement("h2"));
  title.className = "hexdev-truco-call-log-title";
  title.textContent = TABLE_STRINGS.callLogTitle;

  const list = host.appendChild(document.createElement("ol"));
  list.className = "hexdev-truco-call-log-list";
  // WCAG 2.1.1: this list is the panel's ONE real scroller (table-styles.ts's
  // own overflow-y: auto rule), and a scroll region only a pointer can reach
  // is history a keyboard user can never read back. tabindex="0" puts it on
  // the tab order so arrow keys scroll it; role="log" says WHAT it is, and
  // the aria-label reuses the panel's own visible Spanish title so the two
  // can never say different things. The role's implicit live semantics never
  // double-announce: this node is rebuilt per render, and a live region only
  // announces from a node that PERSISTS (announcer.ts's own rule).
  list.tabIndex = 0;
  list.setAttribute("role", "log");
  list.setAttribute("aria-label", TABLE_STRINGS.callLogTitle);
  for (const event of input.events) {
    list.appendChild(buildEntry(event, input));
  }
}

/**
 * Scrolls the panel's own event list to its newest entry (D-9: auto-scroll on
 * every render; manual scroll survives only between renders, deferred).
 *
 * Deliberately a SEPARATE export from `renderCallLog`, not a step inside it:
 * `scrollTop` is a no-op on a node that is not yet in the document (there is
 * no layout to scroll), so the ordering requirement — call this only AFTER
 * `host` is attached — is part of the API's own shape, not a comment a
 * future caller could miss (design §5.2).
 */
export function scrollCallLogToNewest(host: HTMLElement): void {
  const list = host.querySelector<HTMLElement>(".hexdev-truco-call-log-list");
  if (list === null) return;
  list.scrollTop = list.scrollHeight;
}
