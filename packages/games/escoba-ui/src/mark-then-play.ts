import { getCardArt } from "@hexdev/spanish-deck-ui";
import { cardId, cardValue } from "@hexdev/escoba-engine";
import type { Card, PlayCardAction } from "@hexdev/escoba-engine";
import { renderEscobaTable } from "./table.js";

/**
 * Decision 4 (`escoba/decisiones-de-producto`): the player MARKS the table
 * cards they want, then plays their own card, and the move commits in that
 * one gesture — no intermediate list, no confirmation dialog. Rejected:
 * "play first, pick from a list" (an extra step every turn) and "let the
 * engine choose" (choosing WHAT you take IS the game) — both would have
 * produced the same `{ playerId, card, captured }` action; a CONTRACT
 * decision, not a UI one (design §D4).
 *
 * `getLegalActions` is read ONLY to decide which table cards get a marking
 * affordance at all ("the UI never renders the action list", design §D4) —
 * worst case 942 entries (design §M4). Nothing below ever iterates that
 * list into a rendered row per action.
 */
export interface MarkThenPlayElements {
  readonly tableEl: HTMLElement;
  readonly handEl: HTMLElement;
  readonly sumEl: HTMLElement;
}

export type MarkThenPlayRender = (
  elements: MarkThenPlayElements,
  table: readonly Card[],
  hand: readonly Card[],
  legalActions: readonly PlayCardAction[],
  onPlayCard: (card: Card, captured: readonly Card[]) => void,
) => void;

/** Every table card in SOME legal action's captured subset — markable at
 * all, independent of which hand card ends up being played. */
function markableCardIds(legalActions: readonly PlayCardAction[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const action of legalActions) for (const captured of action.captured) ids.add(cardId(captured));
  return ids;
}

/** The one legal action, if any, that plays `card` with EXACTLY `marked` as
 * its captured subset — the only shape a click may commit. A partial or
 * wrong-sum marking matches nothing, so a click can never dispatch an
 * illegal `not-fifteen`/`capture-declined` action (design §D4). */
function matchingAction(card: Card, marked: ReadonlySet<string>, legalActions: readonly PlayCardAction[]): PlayCardAction | undefined {
  return legalActions.find(
    (action) => cardId(action.card) === cardId(card) && action.captured.length === marked.size && action.captured.every((c) => marked.has(cardId(c))),
  );
}

/**
 * WCAG: the running selection is announced in words on an `aria-live`
 * region the caller mounts once and never rebuilds (announcing needs a
 * CHANGE to a region already in the tree, `truco-ui/src/table.ts`'s own
 * announcers make the same argument). A marked subset can never itself sum
 * to 15 — the played card always supplies the rest — so `ready` is instead
 * "some hand card would now complete it" (`matchingAction` below).
 */
function describeSum(markedCards: readonly Card[], ready: boolean): string {
  if (markedCards.length === 0) return "Sin cartas marcadas.";
  const total = markedCards.reduce((sum, card) => sum + cardValue(card), 0);
  return ready ? `Suma ${total}: lista para completar quince.` : `Suma ${total}.`;
}

function renderHandCard(card: Card, action: PlayCardAction | undefined, onPlay: (captured: readonly Card[]) => void): HTMLElement {
  const art = getCardArt(card);
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.card = cardId(card);
  el.className = "hexdev-escoba-card hexdev-escoba-card--playable";
  // Every hand card has SOME legal action (design §D4), but one whose only
  // moves are captures stays disabled until the marks resolve to one.
  if (action === undefined) el.disabled = true;
  else el.addEventListener("click", () => onPlay(action.captured));

  const img = document.createElement("img");
  img.src = art.src;
  img.width = art.width;
  img.height = art.height;
  img.alt = art.alt;
  el.appendChild(img);
  return el;
}

/** One instance per match mount: `marked` must survive re-renders driven by
 * the next server broadcast, or every mark would be wiped before the
 * player could play against it (mirrors `createMatchTableRenderer`'s own
 * per-match closure state). */
export function createMarkThenPlay(): MarkThenPlayRender {
  const marked = new Set<string>();

  const render: MarkThenPlayRender = (elements, table, hand, legalActions, onPlayCard) => {
    const markableIds = markableCardIds(legalActions);
    const tableIds = new Set(table.map(cardId));
    // Drop marks the server no longer shows or that stopped being
    // markable — a stale mark must never silently carry into a new attempt.
    for (const id of [...marked]) if (!markableIds.has(id) || !tableIds.has(id)) marked.delete(id);

    renderEscobaTable(elements.tableEl, table, {
      markableIds,
      markedIds: marked,
      onToggle: (id) => {
        if (marked.has(id)) marked.delete(id);
        else marked.add(id);
        render(elements, table, hand, legalActions, onPlayCard);
      },
    });

    elements.handEl.replaceChildren();
    elements.handEl.className = "hexdev-escoba-hand";
    let ready = false;
    for (const card of hand) {
      const action = matchingAction(card, marked, legalActions);
      if (action !== undefined && action.captured.length > 0) ready = true;
      elements.handEl.appendChild(
        renderHandCard(card, action, (captured) => {
          // Unmark immediately, before the next server broadcast arrives —
          // otherwise the just-played cards' marked/disabled state would
          // stay stale on screen for however long the round-trip takes.
          marked.clear();
          render(elements, table, hand, legalActions, onPlayCard);
          onPlayCard(card, captured);
        }),
      );
    }

    elements.sumEl.textContent = describeSum(
      table.filter((card) => marked.has(cardId(card))),
      ready,
    );
  };

  return render;
}
