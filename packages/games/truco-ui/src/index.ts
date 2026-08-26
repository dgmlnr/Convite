// The cards this game offers the shell as a front-door image, in the order
// they should be laid out. Declared HERE rather than chosen by the lobby for
// the same reason the deck credit is: the shell is game-agnostic and has no
// business knowing that truco is played with a Spanish deck, let alone which
// four cards of it are worth showing. A game says what represents it.
//
// These four are the three matas plus the seven of gold — the cards a player
// recognises before they read anything, which is the entire job of a hero.
export { HERO_CARDS } from "./hero-cards.js";
// The credit for the artwork this UI draws with, re-exported so the widget
// shell can show it without depending on the deck package itself. Not a
// convenience: the card art is CC BY-SA 3.0, so crediting it is a license
// term, and the surface that must satisfy that term is the shell — which is
// game-agnostic and has no business knowing which deck a given game uses.
// Declaring it here is how a game says what its own rendering owes.
export { DECK_ATTRIBUTION } from "@hexdev/spanish-deck-ui";
export type { DeckAttribution } from "@hexdev/spanish-deck-ui";
export { renderCalls } from "./calls.js";
export { deriveHandOutcomeEvent, renderHandOutcomeBanner } from "./hand-outcome.js";
export type { HandOutcomeBannerProps, HandOutcomeEvent } from "./hand-outcome.js";
export { renderHand } from "./hand.js";
export type { HandCallbacks } from "./hand.js";
export { renderMatchOverOverlay } from "./match-outcome.js";
export type { MatchOutcomeInfo, MatchOverProps } from "./match-outcome.js";
export { renderOpponentHand } from "./opponent-hand.js";
export { derivePendingCall, isMyTurnToAnswer, respondingTeamId } from "./pending-call.js";
export type { PendingCallBannerProps, PendingCallInfo } from "./pending-call.js";
export { renderPlayedCards } from "./played-cards.js";
export { ensureMatchstickDefs, MATCHSTICK_THEME_DEFAULTS, renderCasita, renderGhostCasita, renderScoreboard, splitMalasBuenas } from "./scoreboard.js";
export type { ScoreboardOptions } from "./scoreboard.js";
export { renderScoreboardPanel } from "./scoreboard-panel.js";
export type { ScoreboardPanelOptions } from "./scoreboard-panel.js";
export { ANCHOR_ORDER, resolveSeatPositions } from "./seat-position.js";
export type { SeatPositionInput, TableAnchor } from "./seat-position.js";
export { CALL_LABELS, TABLE_STRINGS } from "./strings.js";
export { createMatchTableRenderer } from "./table.js";
export type { MatchEndInfo, MatchTableRendererOptions } from "./table.js";
export { buildTableStylesheet, ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";
export { describeTrickOutcome } from "./trick-feedback.js";
export { describeTurn, isMyTurn } from "./turn.js";
