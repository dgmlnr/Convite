import type { CatalogSectionId, Clock, GameFamilyId, GameId } from "@hexdev/platform-contract";
import type { Card } from "@hexdev/spanish-deck-ui";
import { getCardFrontUrl } from "@hexdev/spanish-deck-ui";
import type { ConsultAskMessage } from "@hexdev/transport-colyseus-client";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import { CARD_ART, DECK_ATTRIBUTION, HERO_CARDS, HERO_TITLE, createMatchTableRenderer } from "@hexdev/truco-ui";
import type { HandOutcome as EscobaHandOutcome, PlayCardAction as EscobaPlayCardAction, PlayerId as EscobaPlayerId, PlayerView as EscobaPlayerView } from "@hexdev/escoba-engine";
import {
  createEscobaRail,
  createMarkThenPlay,
  describeHandBreakdown,
  ensureMatchOverStyles,
  ensureMatchStyles,
  ensurePilesStyles,
  ensureRailStyles,
  ensureScoreboardStyles,
  ensureStatusStyles,
  ensureTableStyles,
  renderEscobaHandBreakdown,
  renderEscobaPiles,
  renderEscobaScoreboard,
  renderEscobaStatus,
  renderMatchOverOverlay,
} from "@hexdev/escoba-ui";
import type { BoardTiles, MahjongOutcomeInfo, MahjongPair } from "@hexdev/mahjong-solitaire-ui";
import {
  createChronometer,
  createMahjongBoardRenderer,
  ensureElapsedReadoutStyles,
  ensureMatchOverStyles as ensureMahjongMatchOverStyles,
  renderMahjongMatchOver,
  resolvePress,
  startElapsedReadout,
  windowTicker,
} from "@hexdev/mahjong-solitaire-ui";
import { TILE_ATTRIBUTION } from "@hexdev/mahjong-tile-ui";
import { STRINGS } from "./i18n.js";

/** The wire shape `MatchRoom.viewMessageFor` now sends alongside every
 * "view" message (transport-colyseus) — opaque here on purpose, the same
 * erasure boundary `platform-core/registry.ts` already documents server-side
 * ("the one spot for the pairing"). Only a specific game's own registry
 * entry, below, knows what these really are. `outcome` is optional/nullable
 * on this generic shape: a fallback game (no registry entry) never reaches
 * for it, and truco's own entry treats an absent field the same as `null`
 * (match still in progress) — never a crash on an older/partial payload. */
export interface GameUiPayload {
  readonly view: unknown;
  readonly legalActions: readonly unknown[];
  readonly outcome?: unknown;
  /** The absolute instant the seat on the clock runs out of turn time, or
   * `null` when nothing is being timed (`MatchRoom.viewMessageFor`). Optional
   * and nullable on the same terms as `outcome` above: a fallback game never
   * reaches for it, and an older or partial payload that simply lacks the
   * field renders an untimed table rather than crashing. */
  readonly turnDeadline?: number | null;
  /** The partner's private answer to a consult, and whether one is in flight.
   * Rides on the payload rather than on the view because it never travels IN
   * a view: `MatchRoom` sends it to the asking client alone, and a redacted
   * view able to carry it would carry it to everyone. Optional for the same
   * reason `turnDeadline` is — an older payload simply has no answer to
   * report, which renders a table with no question outstanding. `from` is
   * `null` while `asking` (no answer yet) and mirrors `MatchConnection`'s own
   * widened `onConsultAdvice` payload otherwise — spec: "Provenance Is
   * Disclosed to the Asker". */
  readonly consult?: {
    readonly advice: "quiero" | "no-quiero" | null;
    readonly asking: boolean;
    readonly from: "partner" | "fallback" | null;
  };
  /** The public per-seat consult signal every seat's own view carries while a
   * consult is open (design D5/D8) — only `askerSeat` and `deadline`, enough
   * for the turn badge to replace its text. Sourced directly from the "view"
   * message's own sibling field, the same as `turnDeadline` above; no local
   * state involved. `null`/absent means no consult is open for any seat. */
  readonly pendingConsult?: { readonly askerSeat: number; readonly deadline: number } | null;
  /** This seat's OWN incoming question, when it is the one being asked
   * (design D5: "the PARTNER's client alone"). Never part of the view for
   * the same reason `consult` above is not — it travels on its own private
   * channel (`MatchConnection.onConsultAsk`) and is threaded onto the
   * payload the same way `consult` already is for the asker's side. */
  readonly consultAsk?: ConsultAskMessage | null;
}

/**
 * Something this widget must credit in order to ship it.
 *
 * GAME-AGNOSTIC ON PURPOSE, even though today every entry is the same deck.
 * The shell has no business knowing that truco draws Spanish cards — that is
 * exactly the knowledge `GameUiEntry` exists to keep on the game's side — so
 * a game DECLARES what its rendering owes and the shell only knows how to
 * display a credit. Structurally identical to spanish-deck-ui's
 * `DeckAttribution` because CC BY-SA is what shapes both: author, a link to
 * the license, and a statement that changes were made.
 */
export interface AssetCredit {
  readonly author: string;
  readonly sourceUrl: string;
  readonly licenseName: string;
  readonly licenseUrl: string;
  readonly changes: readonly string[];
  /**
   * WHAT THIS IS ART OF, in the widget's own language — "las cartas", "las
   * fichas". Optional, and the whole point of it living HERE rather than in
   * the copy: `STRINGS.aboutCredit` used to name the medium itself, which
   * was true for exactly as long as every credit in this widget was the
   * Spanish deck. A second artwork made that sentence say "Arte de las
   * cartas" over a set of mahjong tiles.
   *
   * The game supplies it, in the same record where it supplies its own
   * hero title, because a game is the only thing that knows what its
   * rendering draws — the same reason `credits` itself lives on a family
   * rather than in the shell. `undefined` falls back to a sentence with no
   * noun at all, which is still true of anything.
   *
   * NOT PART OF THE DEDUPE KEY (`author|licenseUrl`, below): two games
   * crediting one artist for one artwork owe one obligation, whatever each
   * of them calls it.
   */
  readonly subject?: string;
}

/**
 * HOW THIS PLAYER GOT INTO THIS MATCH — two values, because the two mean
 * genuinely different things to anything that measures time.
 *
 * `"joined"` is a match this page session started, by pairing with a person
 * or by asking for a bot. `"resumed"` is a match that was already running
 * when this page loaded: the widget persists a match session
 * (`identity-storage.ts`) and gets ONE attempt to rejoin it before the
 * catalog is ever shown, so a returning player mid-match never sees the lobby
 * flash by.
 *
 * A CLOSED TWO-VALUE UNION AND NOT A BOOLEAN, so the call site reads as
 * itself: `enterMatch(..., "resumed")` says what happened, where
 * `enterMatch(..., true)` says nothing at all without going and reading the
 * signature.
 */
export type MatchEntry = "joined" | "resumed";

/**
 * What a renderer is built with, once per match.
 *
 * WHY THIS RIDES ON `createRenderer` AND NOT ON THE VIEW PAYLOAD. `render(...)`
 * runs on every message a match produces; `createRenderer` runs exactly once,
 * when the match is entered, which is exactly where anything per-match and
 * client-side gets created. Putting these on the payload would make every game
 * pay, on the hot path, for something one game needs.
 *
 * WHY THE PROVENANCE IS CARRIED RATHER THAN LOOKED UP, and it is worth
 * writing down because the obvious derivation is wrong for a verified reason:
 * `main.ts`'s three `enterMatch` call sites — two fresh joins and one resume
 * — all call `persistMatchSession` IMMEDIATELY BEFORE entering. Storage
 * therefore reports "a session exists" in all three cases, so reading
 * `readPersistedMatchSession` from inside cannot tell a resume from a fresh
 * join. The distinguishing fact exists only at the call site, so the call
 * site is what states it.
 *
 * `Clock` is `platform-contract`'s existing `() => number`, reused rather
 * than re-declared. This is the one tier that holds both the platform and a
 * game's presentation, which is why the mirroring `escoba-ui` and
 * `mahjong-solitaire-ui` have to do stops here.
 */
export interface MatchRenderContext {
  /** True only for a match this page session did not start. Anything that
   * reports elapsed time as a RESULT has to refuse to when this is true: a
   * closure started at first render on that path measures time since the
   * reload, which is a shorter number than the truth wearing the truth's
   * clothes. */
  readonly resumed: boolean;
  /** The real clock, injected. Every consumer measures against this rather
   * than calling `Date.now()` inline, so a test can assert an exact number
   * and a visual baseline can freeze one. */
  readonly now: Clock;
}

/**
 * A provenance and a clock, as the thing a renderer is built with.
 *
 * IT LIVES HERE RATHER THAN INLINE IN `main.ts` because of that file's own
 * rule: composition stays, decisions leave. Deciding that `"resumed"` is the
 * one entry whose renderer may not report a time is a decision, and the one
 * time decisions were left in that file they sat unfenced for a whole change.
 *
 * THE CLOCK IS CARRIED, NEVER READ. Capturing `now()` as a number here would
 * freeze it at the instant the match was entered, and every chronometer built
 * from the context would then measure zero — while every test injecting a
 * scripted clock still passed, because the scripted clock would have been read
 * too.
 */
export function matchRenderContextFor(entry: MatchEntry, now: Clock): MatchRenderContext {
  return { resumed: entry === "resumed", now };
}

export interface GameUiEntry {
  readonly id: GameId;
  /** Which game this is a way of playing — the key into `GameFamilyUi`.
   * Identity (art, name, credits) lives THERE and not here, so two entries of
   * one game have no field to disagree in. */
  readonly gameFamily: GameFamilyId;
  /** A fresh renderer per match: `createMatchTableRenderer` closes over
   * small per-mount state (the trick-outcome banner) that must not leak
   * between two different matches sharing one widget session. `onPlayAgain`
   * is optional: the fallback "connection is live" path has nowhere to
   * return to and never renders a match-over overlay in the first place.
   *
   * THE CONTEXT IS REQUIRED, AND THE FOUR SHIPPED ENTRIES IGNORE IT BY NOT
   * DECLARING IT. TypeScript assigns a zero-argument `() => Renderer` to a
   * one-argument parameter, so truco's and escoba's factories below are
   * untouched by this and pay nothing for it. Required rather than optional
   * on purpose: an optional parameter is exactly how a fourth call site
   * silently gets `undefined` and quietly decides for itself what a missing
   * provenance means. */
  createRenderer(context: MatchRenderContext): (
    container: HTMLElement,
    payload: GameUiPayload,
    dispatch: (action: unknown) => void,
    onPlayAgain?: () => void,
    onLeaveMatch?: () => void,
  ) => void;
}

/**
 * `apps/widget-app`'s own `GameUiRegistry` (design §5: "rendering is
 * deliberately OUTSIDE the contract"), the UI-side mirror of
 * `platform-core/registry.ts`'s `GameModuleRegistry` — an L3 composition
 * root is exactly where knowing a specific game's id is allowed. Truco is
 * the only entry today; a second game adds one more entry here, never a
 * change to `main.ts`'s own composition logic.
 */
/** Shared factory: `createMatchTableRenderer` is already seat-count generic
 * (it derives `seatCount` from `view.teammates.length + view.opponents.length
 * + 1`, per `truco-ui/table.ts`) — the 1v1 and 2v2 entries below reuse the
 * EXACT same rendering function, never a second, 2v2-specific renderer. */
function createTrucoRenderer(): GameUiEntry["createRenderer"] {
  return () => {
    const render = createMatchTableRenderer();
    return (container, payload, dispatch, onPlayAgain, onLeaveMatch) => {
      render(
        container,
        payload.view as PlayerView,
        payload.legalActions as readonly Action[],
        (action) => dispatch(action),
        {
          outcome: (payload.outcome ?? null) as { readonly winnerIds: readonly PlayerId[] } | null,
          onPlayAgain,
        },
        payload.turnDeadline ?? null,
        // Two different departures, deliberately NOT the same callback:
        // `onPlayAgain` fires on a match that is already over, while this one
        // abandons a match still in progress and has to tell the server so
        // (MatchConnection.quit) — otherwise the table sits out the full
        // reconnection window waiting for someone who chose to leave.
        onLeaveMatch,
        payload.consult,
        // Slice 4a wired the badge takeover into the renderer's own
        // signature but never threaded THIS payload field into the call —
        // found in Slice 4b, since nothing forwarding it meant the badge
        // could never reach a real match even though every browser test that
        // calls the renderer directly kept passing.
        payload.pendingConsult,
        payload.consultAsk == null ? null : { about: payload.consultAsk.about, options: payload.consultAsk.options as readonly ("quiero" | "no-quiero")[] },
        // The mirror of `(action) => dispatch(action)` above, on the
        // PARTNER's side: routed through the SAME widget-level `dispatch`
        // (which already special-cases "consult-answer", Slice 3), but
        // through a genuinely DIFFERENT function reference than the one the
        // real action bar's own buttons call — the package-level half of
        // `truco-ui`'s own structural isolation (design D10, belt and
        // braces).
        (answer, about) => dispatch({ type: "consult-answer", about, answer }),
      );
    };
  };
}

/**
 * WHAT A SHELF IS CALLED, one tier above a game's own name.
 *
 * The server declares WHICH shelf each entry sits on (`GameMetadata.section`,
 * normalized onto every `CatalogEntry`); the widget decides what that shelf is
 * called. No `displayNameKey` for sections crosses the wire, on the same
 * grounds `GameFamilyUi` already keeps `heroTitle` here: naming is a
 * presentation decision, and a game module has no business writing Spanish.
 *
 * Only `id` and `title`, deliberately. A shelf is a label over a row of cards,
 * not a thing with art of its own — the games below it already carry that.
 */
export interface SectionUi {
  readonly id: CatalogSectionId;
  readonly title: string;
}

/** The shelf the four card modules declare. */
const CARTAS_SECTION: SectionUi = { id: "cartas", title: STRINGS.sectionCartas };

/**
 * THE SECOND SHELF, and it arrives with its referent rather than ahead of it.
 *
 * The paragraph that stood here said "Fichas" was deliberately NOT declared,
 * because a row nothing points at is an enumerating-config entry with no
 * referent and belongs to the change that ships the game needing it. This is
 * that change: `mahjongSolitaireModule.metadata.section` is `"fichas"`, so
 * the row has a game under it the day it lands.
 *
 * What made the absence matter is what a missing row DOES: `game-list.ts`
 * falls back to the raw section id, so before this line the shelf on screen
 * one was literally headed `fichas` — visible, ugly, and a bug report
 * somebody files, which is the failure mode that file chose on purpose over
 * silently filing those cards under "Cartas".
 */
const FICHAS_SECTION: SectionUi = { id: "fichas", title: STRINGS.sectionFichas };

const SECTIONS: readonly SectionUi[] = [CARTAS_SECTION, FICHAS_SECTION];

/**
 * A shelf's own name, by section id — the exact mirror of `familyUiFor`
 * below, and a module function for the same reason: screen one renders
 * before any game is chosen and receives no registry.
 *
 * THIS IS THE FOURTH HAND-WRITTEN LIST IN THIS FILE, so what happens when it
 * falls behind the catalog is load-bearing rather than incidental. It returns
 * `undefined`, and the caller renders the raw section id — visible, ugly, and
 * a bug report somebody files. The alternative, rendering no heading at all,
 * would silently file those cards under the PREVIOUS shelf's label and
 * mis-attribute them: a missing entry must not fail green, and it must not
 * fail by lying about its neighbour.
 */
export function sectionUiFor(sectionId: CatalogSectionId): SectionUi | undefined {
  return SECTIONS.find((section) => section.id === sectionId);
}

/**
 * WHAT A GAME IS, once, however many ways there are to play it.
 *
 * This exists because the thing it replaces did not. Art, name and credits
 * used to sit on each `GameUiEntry`, which meant `truco-argentino` and
 * `truco-argentino-2v2` each carried their own copy — the same constants,
 * pasted twice — and the front door picked between them with a `.find()`.
 * That was invisible precisely because the copies were identical.
 *
 * Moving identity here does not FIX that bug so much as make it
 * unrepresentable: there is no longer a second place to put a game's art, so
 * two ways of playing it cannot drift apart.
 */
export interface GameFamilyUi {
  readonly id: GameFamilyId;
  /** What this game calls itself on the front door. */
  readonly heroTitle?: string;
  /** Image urls it offers the front door, in the order to lay them out. The
   * shell is game-agnostic: a game says what represents it, the shell only
   * knows how to show it. */
  readonly hero?: readonly string[];
  /**
   * The two or three cards that name this game on its CARD in the list — a
   * different job from `hero`, and deliberately its own field.
   *
   * NOT a slice of `hero`. `hero-cards.ts` says ORDER IS THE LAYOUT, with the
   * best card at the fan's centre because that is the position nothing
   * overlaps; taking the first three would put it at the edge, half hidden.
   * And the shell must not be the one deciding which of a game's cards
   * represent it.
   *
   * No `cardArt ?? hero` fallback either: a five-card fan shrunk into a list
   * card is a texture, not a hand. A game with nothing declared renders a
   * title-only card, still full size and still a full activation target.
   */
  readonly cardArt?: readonly string[];
  /** What rendering this game owes. Optional: a game that draws nothing
   * licensed owes nothing, and an empty list must not become a ceremony. */
  readonly credits?: readonly AssetCredit[];
}

/**
 * ONE RECORD, SHARED BY BOTH CARD GAMES — the same object, not two equal
 * ones, so there is nowhere for truco's and escoba's copies of an obligation
 * to drift apart. `GAME_UI_CREDITS` would dedupe them anyway; this is the
 * half that also keeps the SUBJECT from disagreeing, which the dedupe key
 * does not cover.
 */
const DECK_CREDIT: AssetCredit = { ...DECK_ATTRIBUTION, subject: STRINGS.creditSubjectCards };

const TRUCO_FAMILY: GameFamilyUi = { id: "truco", heroTitle: HERO_TITLE, hero: HERO_CARDS, cardArt: CARD_ART, credits: [DECK_CREDIT] };

/**
 * The three cards that name escoba, not just any three faces (see
 * `escoba/cartas-insignia-del-lobby`): art must say the MECHANIC, and escoba
 * is named by a number, so it shows three cards that sum to fifteen. Order is
 * the layout, same rule as truco's own `hero-cards.ts` — the middle entry is
 * the one fully visible, so el 7 de oro (the capture's own badge card, worth
 * a point of its own at hand end) holds the centre.
 *
 * ONE ARRAY, TWO JOBS. `escoba/decisiones-de-ui-del-lobby` settled that
 * screen one's card and screen two's hero show the SAME three cards, unlike
 * truco (whose `hero`/`cardArt` come from two distinct arrays in
 * `truco-ui`): recognition across the trip matters more than a second art
 * set nobody asked for. So `hero` and `cardArt` below read the identical
 * array — not two calls that happen to agree today.
 */
const ESCOBA_HERO_FACES: readonly Card[] = [
  { suit: "copa", rank: 3 },
  { suit: "oro", rank: 7 },
  { suit: "espada", rank: 5 },
];

const ESCOBA_FACES: readonly string[] = ESCOBA_HERO_FACES.map((card) => getCardFrontUrl(card).href);

/**
 * Lobby-second-family, completed (spec: `lobby-second-family`). `heroTitle`
 * and `hero` landed with Slice A, solely to prove and fix the screen-two
 * regression a second family triggers; Unit M added `cardArt` — screen
 * one's own card, the spec's "Escoba's hero art matches its lobby card art"
 * requirement — and the modality row's content (`MODALITY_SUMMARY`, i18n.ts).
 *
 * NO `GameUiEntry` HERE, DELIBERATELY. `createGameUiRegistry`'s `byId` map
 * below is the MATCH renderer, reachable only once a game is actually
 * joined — no lobby screen reads it: every card here still renders entirely
 * from `familyUiFor` plus the server's own catalog. The `GameUiEntry`
 * records this identity feeds are declared separately, next to `trucoEntry`
 * below (`escobaEntry`/`escobaEntry2v2`), the same split truco's own
 * `TRUCO_FAMILY`/`trucoEntry` already keep.
 */
const ESCOBA_FAMILY: GameFamilyUi = {
  id: "escoba",
  heroTitle: "Escoba de 15",
  hero: ESCOBA_FACES,
  cardArt: ESCOBA_FACES,
  credits: [DECK_CREDIT],
};

/**
 * THE THIRD FAMILY, AND THE FIRST THAT IS NOT A DECK OF CARDS.
 *
 * `heroTitle` and `credits`, and deliberately nothing else — the two fields
 * this game genuinely has something to put in.
 *
 * NO `hero`, NO `cardArt`, AND THAT IS A DECISION ABOUT THE ARTWORK ITSELF.
 * The 42 shipped faces are TRANSPARENT: each file is the symbol alone, with
 * no tile body behind it, and `mahjong-tile-ui`'s own license record says so
 * in as many words ("This artwork's transparency is deliberate — each file is
 * the face symbol with no tile body behind it"). The bone under the symbol is
 * drawn separately by `tileBodySvg()`, as markup, while `hero`/`cardArt` take
 * image URLs. A face pointed at from here would therefore render as a glyph
 * floating on the felt with nothing under it — a rendering bug that looks
 * deliberate, which is the worst way for one to look. `game-list.ts` already
 * answers the empty case honestly: a title-only card, still full size and
 * still a full activation target.
 *
 * THE CREDIT IS NOT OPTIONAL EVEN THOUGH THE ART IS ABSENT FROM THE LOBBY.
 * CC BY-SA 4.0 is owed because the widget DRAWS the artwork — on the board,
 * 144 tiles at a time — not because a lobby card shows it. `GAME_UI_CREDITS`
 * below unions this list for exactly that reason, in its own words: "an
 * obligation is owed whether or not that game's art won a place on the front
 * page".
 */
const MAHJONG_FAMILY: GameFamilyUi = {
  id: "mahjong-solitario",
  heroTitle: "Mahjong Solitario",
  credits: [{ ...TILE_ATTRIBUTION, subject: STRINGS.creditSubjectTiles }],
};

const FAMILIES: readonly GameFamilyUi[] = [TRUCO_FAMILY, ESCOBA_FAMILY, MAHJONG_FAMILY];

/**
 * The family whose face the front door wears — or none.
 *
 * NOT "the first with art". Two games are a catalogue, and a catalogue is
 * what the cards below the header already are; the hero's job is to say what
 * KIND of place this is, once, before anybody reads a word. With two games
 * there is no right answer to pick, so this picks nothing and the door
 * degrades to no hero. A wrong game's art on the door would look deliberate,
 * which is the worst way for a bug to look.
 */
/**
 * A family's own identity, by family id.
 *
 * A MODULE FUNCTION rather than a registry method, for the same reason
 * `GAME_UI_CREDITS` is a constant: the screen that reads this renders BEFORE
 * any game is chosen and receives no registry. `registry.family()` takes a
 * `GameId` because screen two starts from the game it is already showing;
 * screen one starts from the family it is about to offer.
 */
export function familyUiFor(familyId: GameFamilyId): GameFamilyUi | undefined {
  return FAMILIES.find((family) => family.id === familyId);
}

const trucoEntry: GameUiEntry = { id: "truco-argentino" as GameId, gameFamily: TRUCO_FAMILY.id, createRenderer: createTrucoRenderer() };

/** The 2v2 game-ui entry — additive, registered under its own distinct
 * `gameId` (matching `truco-module`'s own `trucoModule2v2.id`), never a
 * branch inside `trucoEntry`. Without this entry, a 2v2 match would connect
 * successfully over the wire but fall back to the generic "connection is
 * live" placeholder (`main.ts`'s own `enterMatch` fallback) instead of the
 * real table — found running an actual 2v2 match end to end, not assumed. */
const trucoEntry2v2: GameUiEntry = { id: "truco-argentino-2v2" as GameId, gameFamily: TRUCO_FAMILY.id, createRenderer: createTrucoRenderer() };

/**
 * Unit P — mark-then-play (decision 4). Every persistent element below is
 * built ONCE and reused — an `aria-live` announcement is a CHANGE to a node
 * already in the tree (`truco-ui/src/table.ts`'s own announcers).
 *
 * R2a mounted the scoreboard and hand-end breakdown; R2b closes the other
 * half of Slice Q's own gap: `payload.outcome`/`onPlayAgain`/`onLeaveMatch`
 * now reach a real match-over overlay — same departure `createTrucoRenderer`
 * above documents (a rematch and a return to the lobby are not one callback).
 */
function createEscobaRenderer(): GameUiEntry["createRenderer"] {
  return () => {
    const markThenPlay = createMarkThenPlay();
    let mounted: {
      layoutEl: HTMLElement;
      scoreboardEl: HTMLElement;
      turnEl: HTMLElement;
      stockEl: HTMLElement;
      seatsEl: HTMLElement;
      tableEl: HTMLElement;
      handEl: HTMLElement;
      pilesEl: HTMLElement;
      sumEl: HTMLElement;
      breakdownEl: HTMLElement;
      breakdownAnnouncer: HTMLElement;
      matchOverEl: HTMLElement;
    } | null = null;
    // Whether the LATEST hand outcome is a transition worth announcing, and
    // whether the overlay already claimed focus once this mount — mirrors
    // createMatchTableRenderer's own previousView/timer fields.
    let previousHandDecided = false;
    let matchOverShown = false;

    return (container, payload, dispatch, onPlayAgain, onLeaveMatch) => {
      ensureMatchStyles(document);
      ensureTableStyles(document);
      ensurePilesStyles(document);
      ensureScoreboardStyles(document);
      ensureStatusStyles(document);
      ensureRailStyles(document);
      ensureMatchOverStyles(document);

      if (mounted === null || mounted.layoutEl.parentElement !== container) {
        container.replaceChildren();
        container.className = "hexdev-escoba-match";
        const scoreboardEl = document.createElement("div");
        // THE TURN IS THE ONE FACT THAT STAYS ON THE FELT. Everything else
        // this screen reports between decisions — both scores, this hand's
        // escobas, the stock, every seat's count — went into the rail below,
        // but whether it is YOUR move has to be answerable without opening a
        // drawer. Still the aria-live half, mounted once and mutated after.
        const statusEl = document.createElement("div");
        statusEl.className = "hexdev-escoba-status";
        const turnEl = document.createElement("p");
        turnEl.setAttribute("aria-live", "polite");
        const stockEl = document.createElement("p");
        statusEl.append(turnEl);
        // A real list, so each seat's aria-label is actually exposed: on a
        // bare div it would be dropped for want of a role.
        const seatsEl = document.createElement("ul");
        const tableEl = document.createElement("div");
        const handEl = document.createElement("div");
        const pilesEl = document.createElement("div");
        const sumEl = document.createElement("div");
        sumEl.className = "hexdev-escoba-sum";
        sumEl.setAttribute("aria-live", "polite");
        const breakdownEl = document.createElement("div");
        // Mounted once, mutated after — same reason as sumEl above.
        const breakdownAnnouncer = document.createElement("p");
        breakdownAnnouncer.className = "hexdev-escoba-breakdown-announcer";
        breakdownAnnouncer.setAttribute("aria-live", "polite");
        breakdownAnnouncer.setAttribute("aria-atomic", "true");
        const matchOverEl = document.createElement("div");

        // THE FELT AND THE RAIL, side by side — the shape `truco-ui`'s table
        // already uses, built from `escoba-ui`'s own pieces because that
        // package is L1. Narrow, the rail is a drawer behind a handle; from
        // 640 container-px up a real column (rail-styles.ts). Either way the
        // cards get back the vertical space four status rows used to spend.
        const layoutEl = document.createElement("div");
        layoutEl.className = "hexdev-escoba-layout";
        const feltEl = document.createElement("div");
        feltEl.className = "hexdev-escoba-felt";
        const rail = createEscobaRail();
        feltEl.append(statusEl, tableEl, handEl, pilesEl, sumEl, breakdownEl);
        rail.bodyEl.append(scoreboardEl, stockEl, seatsEl);
        layoutEl.append(feltEl, rail.railEl);
        // Announcer and overlay stay OUT of the layout: one has no geometry
        // at all, the other covers the whole match box (match-over-styles.ts
        // anchors it to `.hexdev-escoba-match`).
        container.append(layoutEl, breakdownAnnouncer, matchOverEl);
        mounted = { layoutEl, scoreboardEl, turnEl, stockEl, seatsEl, tableEl, handEl, pilesEl, sumEl, breakdownEl, breakdownAnnouncer, matchOverEl };
      }

      const view = payload.view as EscobaPlayerView;
      const legalActions = payload.legalActions as readonly EscobaPlayCardAction[];

      renderEscobaScoreboard(mounted.scoreboardEl, view.teams, view.self.teamId, view.hand?.escobas);
      renderEscobaStatus({ turnEl: mounted.turnEl, stockEl: mounted.stockEl, seatsEl: mounted.seatsEl }, view);
      markThenPlay({ tableEl: mounted.tableEl, handEl: mounted.handEl, sumEl: mounted.sumEl }, view.hand?.table ?? [], view.self.hand, legalActions, (card, captured) =>
        dispatch({ type: "play-card", playerId: view.self.playerId, card, captured } satisfies EscobaPlayCardAction),
      );
      renderEscobaPiles(mounted.pilesEl, view.teams, view.hand?.piles ?? {});

      const handOutcome: EscobaHandOutcome | null = view.hand?.outcome ?? null;
      renderEscobaHandBreakdown(mounted.breakdownEl, handOutcome, view.self.teamId);
      if (handOutcome !== null && handOutcome.decided && !previousHandDecided) {
        mounted.breakdownAnnouncer.textContent = describeHandBreakdown(handOutcome, view.self.teamId);
      } else if (handOutcome === null || !handOutcome.decided) {
        mounted.breakdownAnnouncer.textContent = "";
      }
      previousHandDecided = handOutcome !== null && handOutcome.decided;

      const outcome = (payload.outcome ?? null) as { readonly winnerIds: readonly EscobaPlayerId[] } | null;
      const focusOnOpen = outcome !== null && !matchOverShown;
      matchOverShown = outcome !== null;
      renderMatchOverOverlay(
        mounted.matchOverEl,
        outcome === null
          ? null
          : { outcome, selfPlayerId: view.self.playerId, teams: view.teams, selfTeamId: view.self.teamId, onPlayAgain: onPlayAgain ?? ((): void => undefined), onLeaveMatch, focusOnOpen },
      );
    };
  };
}

const escobaEntry: GameUiEntry = { id: "escoba-de-15" as GameId, gameFamily: ESCOBA_FAMILY.id, createRenderer: createEscobaRenderer() };

/** The 4-seat entry — additive, its own `GameId`, matching `trucoEntry2v2`'s
 * own precedent: both escoba entries share ONE renderer factory because
 * `renderEscobaPiles` is already team-count generic (design §D2: a pair's
 * piles are one entry under the shared team id), the same way
 * `createMatchTableRenderer` is already seat-count generic for truco. */
const escobaEntry2v2: GameUiEntry = { id: "escoba-de-15-2v2" as GameId, gameFamily: ESCOBA_FAMILY.id, createRenderer: createEscobaRenderer() };

/** The view `mahjong-solitaire-module` sends every seat — and there is only
 * one seat, so it hides nothing. `tiles` is `null` until the deal lands,
 * which is NOT an empty board: an all-null board is one somebody finished. */
interface MahjongPlayerView {
  readonly playerId: string;
  readonly tiles: BoardTiles | null;
}

/**
 * THE FIRST RENDERER IN THIS FILE THAT READS ITS `MatchRenderContext`, and
 * the first that turns two presses into an action.
 *
 * WHAT IS COMPOSED HERE AND WHAT IS NOT. Everything with a rule in it lives
 * in `@hexdev/mahjong-solitaire-ui` and is fenced there: the board draws and
 * diffs in place, `resolvePress` decides what a press means, the chronometer
 * measures and refuses to report a resumed match, and the panel picks one of
 * three sentences. What is left here is wiring — which is exactly the split
 * `createEscobaRenderer` above already keeps with `createMarkThenPlay`.
 *
 * THE CHRONOMETER IS BUILT ONCE, HERE, AND NOT PER RENDER. `createRenderer`
 * runs exactly once per match, when the match is entered, which is the
 * instant the player sat down; `render` runs on every message the match
 * produces. Building it below would restart it on every view and report the
 * time since the last tile came off.
 *
 * IT IS `null` FOR A RESUMED MATCH, and that is the whole honesty mechanism
 * rather than a rule this file has to remember: `createChronometer` returns
 * nothing at all on that path, so there is no figure here to render by
 * mistake.
 *
 * THE SELECTION IS THIS CLOSURE'S, and it dies with the renderer — one match,
 * one half-made move. It is also cleared by the SERVER's answer rather than
 * by the press that sent it: when the next view no longer holds the tile the
 * mark was on, the mark goes, which covers both "the move was accepted" and
 * "a new board was dealt" with one rule and no bookkeeping.
 */
function createMahjongRenderer(): GameUiEntry["createRenderer"] {
  return (context) => {
    const chronometer = createChronometer({ resumed: context.resumed, now: context.now });
    let mounted: { readonly boardEl: HTMLElement; readonly matchOverEl: HTMLElement } | null = null;
    let selected: number | null = null;
    let tiles: BoardTiles | null = null;
    let legal: readonly MahjongPair[] = [];
    let play: (pair: MahjongPair) => void = () => undefined;
    // Whether the panel has already claimed focus once this match — the same
    // transition `createEscobaRenderer` above tracks, for the same reason.
    let matchOverShown = false;

    const drawBoard = createMahjongBoardRenderer({
      onPickTile: (position) => {
        const move = resolvePress(selected, position, legal);
        if (move.kind === "play") {
          // Cleared BEFORE the dispatch, not after the server answers: the
          // move is on its way and the two tiles it names are spoken for.
          selected = null;
          play(move.pair);
          return;
        }
        selected = move.kind === "select" ? move.position : null;
        if (mounted !== null) drawBoard(mounted.boardEl, tiles, selected);
      },
    });

    return (container, payload, dispatch, onPlayAgain, onLeaveMatch) => {
      ensureMahjongMatchOverStyles(document);
      ensureElapsedReadoutStyles(document);

      if (mounted === null || mounted.boardEl.parentElement !== container) {
        container.replaceChildren();
        // The positioned ancestor the panel hangs off (`match-over-view.ts`
        // declares the rule), and two children rather than one: the board
        // renderer owns its container outright and wipes it on a rebuild, so
        // a panel mounted inside it would be a panel the next deal deletes.
        container.className = "hexdev-mahjong-match";
        const boardEl = document.createElement("div");
        const matchOverEl = document.createElement("div");
        // THREE children now, and the clock is a SIBLING of the board for the
        // same reason the panel is: the board renderer owns its container
        // outright and wipes it on a rebuild, so a readout mounted inside it
        // would be a readout the next deal deletes — and with it, silently,
        // the only figure the player has been watching all game.
        const elapsedEl = document.createElement("div");
        container.append(boardEl, elapsedEl, matchOverEl);
        mounted = { boardEl, matchOverEl };
        // Started once per mount, never per render, exactly like the
        // chronometer it reads. It needs no counterpart here because it ends
        // itself when `elapsedEl` leaves the document — see
        // `startElapsedReadout`, and the renderer contract that has no
        // teardown hook to offer it.
        startElapsedReadout(elapsedEl, chronometer, windowTicker(window));
      }

      const view = payload.view as MahjongPlayerView;
      tiles = view.tiles;
      legal = payload.legalActions as readonly MahjongPair[];
      play = (pair) => {
        dispatch({ type: "remove-pair", playerId: view.playerId, a: pair.a, b: pair.b });
      };

      // A mark cannot outlive the tile it is on. `tiles[selected]` is `null`
      // once the pair came off, and a board that was re-dealt is a different
      // board the selection knows nothing about.
      if (selected !== null && (tiles === null || tiles[selected] == null)) selected = null;

      drawBoard(mounted.boardEl, tiles, selected);

      const outcome = (payload.outcome ?? null) as MahjongOutcomeInfo | null;
      const focusOnOpen = outcome !== null && !matchOverShown;
      matchOverShown = outcome !== null;
      renderMahjongMatchOver(mounted.matchOverEl, outcome === null ? null : { outcome, chronometer, onPlayAgain, onLeaveMatch, focusOnOpen });
    };
  };
}

/**
 * ONE SEAT, ONE ENTRY. Without this row `enterMatch` resolves nothing and
 * falls through to `renderUnsupportedGame` — "Este juego todavía no está
 * disponible en esta versión." — for a game both composition roots register,
 * both tenants are entitled to, and the lobby offers a button for.
 */
const mahjongEntry: GameUiEntry = { id: "mahjong-solitario" as GameId, gameFamily: MAHJONG_FAMILY.id, createRenderer: createMahjongRenderer() };

export interface GameUiRegistry {
  get(gameId: GameId): GameUiEntry | undefined;
  /** The identity behind a joinable id — see `GameFamilyUi`. Screen 2 asks
   * this about the game the player actually chose, which is why it needs no
   * lobby-wide winner. */
  family(gameId: GameId): GameFamilyUi | undefined;
}

export function createGameUiRegistry(): GameUiRegistry {
  const byId = new Map<GameId, GameUiEntry>([
    [trucoEntry.id, trucoEntry],
    [trucoEntry2v2.id, trucoEntry2v2],
    [escobaEntry.id, escobaEntry],
    [escobaEntry2v2.id, escobaEntry2v2],
    [mahjongEntry.id, mahjongEntry],
  ]);
  const byFamily = new Map<GameFamilyId, GameFamilyUi>(FAMILIES.map((entry) => [entry.id, entry]));
  return {
    get: (gameId) => byId.get(gameId),
    family: (gameId) => {
      const entry = byId.get(gameId);
      return entry === undefined ? undefined : byFamily.get(entry.gameFamily);
    },
  };
}

/**
 * Every credit this widget owes, once each.
 *
 * DEDUPED BY LICENSE URL AND AUTHOR, which is what actually identifies an
 * obligation: two identical credits stacked on one screen reads as a bug
 * rather than as diligence. Unioned across FAMILIES rather than taken from
 * the door's, because an obligation is owed whether or not that game's art
 * won a place on the front page.
 */
export const GAME_UI_CREDITS: readonly AssetCredit[] = (() => {
  const seen = new Map<string, AssetCredit>();
  for (const entry of FAMILIES) {
    for (const credit of entry.credits ?? []) seen.set(`${credit.author}|${credit.licenseUrl}`, credit);
  }
  return [...seen.values()];
})();
