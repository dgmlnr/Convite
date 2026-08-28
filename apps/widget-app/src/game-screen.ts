import type { BotTier, GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry, ModalityConfig } from "@hexdev/platform-core";
import { DEAL_DURATION_MS, DEAL_STAGGER_MS, ensureChromeStyles } from "./chrome-styles.js";
import { captureFocus, restoreFocus } from "./focus-continuity.js";
import { STRINGS, translateConfigLabel, translateGameName } from "./i18n.js";
import type { CatalogEntry } from "./bootstrap-data.js";
import { GAME_UI_CREDITS, GAME_UI_HERO, GAME_UI_HERO_TITLE } from "./game-ui-registry.js";

export interface GameSelectionCallbacks {
  onPlayVsPerson(gameId: GameId, modality: ModalityConfig): void;
  onPlayVsBot(gameId: GameId, modality: ModalityConfig, tier: BotTier): void;
  /**
   * Back to the list of games, when there IS a list to go back to.
   *
   * ABSENT, NEVER DISABLED, and the absence is how it is said: a tenant with
   * one game never saw a list, so a greyed-out control would tell that player
   * they are missing something that does not exist. `main.ts` passes this
   * only when `lobby-screen.ts` says there is somewhere to return to, which
   * keeps the decision out of this renderer and out of that file's own `if`s.
   *
   * A plain callback and not a route: the widget lives in an iframe and its
   * protocol carries no history concept — the same seam
   * `unsupported-game-view.ts` already uses for `onBackToLobby`.
   */
  onBack?: () => void;
}

const BOT_TIERS: readonly BotTier[] = ["easy", "normal", "hard"];
const BOT_TIER_LABELS: Readonly<Record<BotTier, string>> = { easy: STRINGS.botEasy, normal: STRINGS.botNormal, hard: STRINGS.botHard };

/** `{pointsToWin: 15}` + truco's own `configOptions` -> "Puntos para ganar: 15",
 * driven entirely by the platform-level `labelKey`, never a hardcoded
 * per-game phrase — the same genericity `deriveLobbyDisplay` already commits
 * to server-side. */
function describeModality(modality: ModalityConfig, configOptions: CatalogEntry["configOptions"]): string {
  const parts = Object.entries(modality).map(([key, value]) => {
    const option = configOptions.find((candidate) => candidate.key === key);
    const label = option !== undefined ? translateConfigLabel(option.labelKey) : key;
    return `${label}: ${String(value)}`;
  });
  return parts.join(", ");
}

function botButtonsRow(gameId: GameId, modality: ModalityConfig, callbacks: GameSelectionCallbacks): HTMLElement {
  const row = document.createElement("div");
  row.className = "hexdev-bot-row";
  for (const tier of BOT_TIERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "vs-bot";
    button.dataset.tier = tier;
    button.textContent = BOT_TIER_LABELS[tier];
    button.addEventListener("click", () => callbacks.onPlayVsBot(gameId, modality, tier));
    row.appendChild(button);
  }
  return row;
}

// `canQueueForPerson` — the seat-count gate that used to live here — died
// with the gap it guarded (PR-2b): `PresenceRoom` now forms groups of the
// game's own `metadata.seatCount` and degrades a long-waiting queue to
// bot-filled seats, so a 4-seat queue join is fulfilled, never a silent hang.
// Every modality gets the same queue affordance regardless of seat count.

function renderModality(
  gameId: GameId,
  gameName: string,
  entry: LobbyDisplayEntry,
  configOptions: CatalogEntry["configOptions"],
  callbacks: GameSelectionCallbacks,
): HTMLElement {
  const description = describeModality(entry.modality, configOptions);

  const wrapper = document.createElement("div");
  wrapper.className = "hexdev-modality";
  // WCAG 2.4.6 (B14): every modality offers the SAME three tier buttons, so a
  // lobby with two modalities per game repeats "Fácil" once per board with
  // nothing programmatic telling them apart. The buttons themselves cannot
  // carry the difference — "Fácil" is the correct visible label, and a
  // per-button aria-label that disagreed with it would break 2.5.3 to fix
  // 2.4.6 — so the disambiguation lives on a named GROUP around them.
  //
  // The GAME name is part of that name, not just the config: two games can
  // offer the identical modality, and the game card's own <h2> is not a
  // landmark, so nothing else would carry that context into the group's name.
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", STRINGS.modalityGroup(gameName, description));
  // Focus-continuity identity (focus-continuity.ts): the modality CONFIG is
  // what names this wrapper, because it is the one thing about it that is
  // stable across presence broadcasts — waitingCount/data-prominent are state
  // and change under the player's feet. Serialized without JSON quotes so the
  // value can sit inside a CSS attribute selector unescaped.
  wrapper.dataset.modality = Object.entries(entry.modality)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  // WCAG 1.3.1: this line titles everything below it, so it is a heading —
  // H3, one level under the game card's own H2. It carries a CLASS because
  // both rules that styled it (.hexdev-modality p, and the --hx-leading body-
  // copy list) select the `p` TAG, and a promoted heading would silently drop
  // out of both; chrome-styles.ts styles the class instead, so paint is
  // byte-identical (fenced in game-selection.browser.test.ts).
  const heading = document.createElement("h3");
  heading.className = "hexdev-modality-title";
  heading.textContent = description;
  wrapper.appendChild(heading);

  const botLabel = document.createElement("p");
  // A LABEL, not a line of prose (PR-EST). "Jugar contra la máquina" sits
  // directly above three buttons that already say Fácil/Normal/Difícil, so at
  // body size it was a sentence explaining the obvious — and it repeats once
  // per modality, three times on a two-game lobby. Styled as a marker it is
  // scanned instead of read. The words are untouched: they are the same
  // string the button path uses.
  botLabel.className = "hexdev-modality-cue";
  botLabel.textContent = STRINGS.playVsBot;

  const personSection = document.createElement("div");
  const countText = document.createElement("p");
  countText.className = "hexdev-modality-count";
  const personButton = document.createElement("button");
  personButton.type = "button";
  personButton.dataset.action = "vs-person";
  personButton.textContent = STRINGS.playVsPerson;
  personButton.addEventListener("click", () => callbacks.onPlayVsPerson(gameId, entry.modality));

  if (entry.waitingCount !== undefined) {
    // Non-zero: vs-person is the prominent path, real count shown.
    wrapper.dataset.prominent = "person";
    countText.textContent = STRINGS.waitingCount(entry.waitingCount);
    personSection.append(countText, personButton);
    wrapper.append(personSection, botLabel, botButtonsRow(gameId, entry.modality, callbacks));
  } else {
    // Zero-counter UX rule (spec): never render a "0 waiting" text — the bot
    // CTA becomes the prominent path instead, rendered FIRST, AND styled as
    // the prominent action (table-styles.ts's own precedent: presentation
    // reads the same value the derivation already computed, never re-decides
    // it — see deriveLobbyDisplayFromCounts's promoteBotFallback).
    wrapper.dataset.prominent = "bot";
    personSection.appendChild(personButton);
    wrapper.append(botLabel, botButtonsRow(gameId, entry.modality, callbacks), personSection);
  }

  return wrapper;
}

/** The modality signature this card is currently showing, in the same shape
 * `dataset.modality` already used — it is the one thing about a modality that
 * is stable across presence broadcasts. */
/**
 * Which modality each game is showing, per container.
 *
 * NOT IN THE DOM, unlike the credit panel's open state, and the difference is
 * the order of events: the panel is read BEFORE the wipe and re-applied
 * after, which works because nothing changes it in between. A selection is
 * changed by a click that then triggers the re-render — so reading it off the
 * DOM would read the value the click was replacing, and the choice would
 * never take.
 *
 * Keyed by container and weakly held: a page with two widgets on it keeps two
 * selections, and neither outlives its container.
 */
const SELECTION = new WeakMap<HTMLElement, Map<string, string>>();

/**
 * Containers whose hand has already been dealt.
 *
 * THE DEAL IS A GREETING, NOT A STATE. It says "you have arrived at a table",
 * once. But `renderGameSelection` wipes and rebuilds on every presence
 * broadcast, so a class applied unconditionally re-ran the whole animation
 * every few seconds — the cards kept being re-dealt under the player while
 * they were reading the screen.
 *
 * AND "ONCE" IS NOT "ON THE FIRST CALL", which is what the first fix said and
 * why the animation then never played at all. `main.ts` renders this screen
 * as soon as the catalog arrives — before any presence, so every game card
 * reads "Cargando…" — and again a moment later when the counts land. Spending
 * the greeting on the first of those spends it on a loading state: either the
 * player never sees it, or they see it before there is anything to greet them
 * with.
 *
 * So the greeting belongs to the first render the player can actually USE.
 * A WeakMap and not a flag on the element, for the same reason the selection
 * is one: it belongs to the container, survives the wipe that clears
 * the DOM, and dies with it.
 */
const DEALT_AT = new WeakMap<HTMLElement, number>();

function selectionFor(container: HTMLElement): Map<string, string> {
  const existing = SELECTION.get(container);
  if (existing !== undefined) return existing;
  const created = new Map<string, string>();
  SELECTION.set(container, created);
  return created;
}

function signatureOf(modality: ModalityConfig): string {
  return Object.entries(modality)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

/**
 * ONE CHOICE AT A TIME, which is what this screen stopped being.
 *
 * Every modality used to render its OWN opponent block, so a game with two
 * point totals showed two "play against a person" buttons and six difficulty
 * buttons — a matrix, laid out as a list, that the player had to read
 * entirely before understanding that most of it was the same offer twice.
 *
 * Now the modalities are a segmented selector and the opponent block belongs
 * to whichever one is selected. Two decisions in sequence — WHICH GAME, then
 * AGAINST WHOM — instead of one grid of every combination.
 *
 * IT ALSO FIXES AN ACCESSIBILITY PROBLEM RATHER THAN MOVING IT. The old
 * layout repeated "Fácil" once per modality with nothing but a group label to
 * tell the copies apart (WCAG 2.4.6, and the group naming below is what
 * remains of it). One row per game means there is nothing to disambiguate.
 */
function renderModalityPicker(
  gameId: GameId,
  entries: readonly LobbyDisplayEntry[],
  selected: string,
  configOptions: CatalogEntry["configOptions"],
  onSelect: (signature: string) => void,
): HTMLElement {
  const nav = document.createElement("div");
  nav.className = "hexdev-modality-picker";
  nav.setAttribute("role", "group");
  nav.setAttribute("aria-label", STRINGS.modalityLegend);

  for (const entry of entries) {
    const signature = signatureOf(entry.modality);
    const option = document.createElement("button");
    option.type = "button";
    option.className = "hexdev-modality-option";
    option.dataset.modality = signature;
    option.textContent = describeModality(entry.modality, configOptions);
    // aria-pressed and not a radio group: these are buttons that change what
    // the panel below shows, and a screen reader should hear the state
    // change rather than a form control that was never submitted.
    option.setAttribute("aria-pressed", String(signature === selected));
    option.addEventListener("click", () => {
      onSelect(signature);
    });
    nav.appendChild(option);
  }
  return nav;
}

function renderGame(
  entry: CatalogEntry,
  presence: readonly LobbyDisplayEntry[] | undefined,
  callbacks: GameSelectionCallbacks,
  selectedByGame: ReadonlyMap<string, string>,
  onSelect: (gameId: GameId, signature: string) => void,
): HTMLElement {
  const card = document.createElement("section");
  card.className = "hexdev-game-card";
  // Focus-continuity ancestor context: two games can offer the SAME modality
  // config, so the modality wrapper's own identity is only unique per game.
  card.dataset.game = entry.id;

  const gameName = translateGameName(entry.displayNameKey);
  const title = document.createElement("h2");
  /* THE HERO SAYS WHICH GAME; THIS SAYS WHICH FORMAT.
   *
   * Measured on the rendered lobby at every width: the hero read "Truco
   * Argentino" and this heading read "Truco Argentino", word for word. The
   * cards under a hero are formats of the game it names, so repeating that
   * name spends the one line a card has on something already on screen.
   *
   * ONLY under a hero. A platform whose games have no art gets no hero at all
   * (see renderGameSelection's own note on GAME_UI_HERO_TITLE), and there this
   * heading is the only thing naming the game -- so it keeps the name. And a
   * seat count with no format word written for it keeps it too. */
  title.textContent = GAME_UI_HERO_TITLE === undefined ? gameName : (STRINGS.formatName(entry.seatCount) ?? gameName);
  card.appendChild(title);

  // What this format IS, from the platform's own seat count — see
  // i18n.ts's formatDescription. Absent for a seat count nobody has written a
  // line for yet, and an absent line is simply not rendered.
  const explanation = STRINGS.formatDescription(entry.seatCount);
  if (explanation !== undefined) {
    const blurb = document.createElement("p");
    blurb.className = "hexdev-game-blurb";
    blurb.textContent = explanation;
    card.appendChild(blurb);
  }

  if (presence === undefined || presence.length === 0) {
    const loading = document.createElement("p");
    loading.className = "hexdev-chrome-loading";
    loading.textContent = STRINGS.loadingCatalog;
    card.appendChild(loading);
    return card;
  }

  // The selection, or the first modality when this card has never been
  // touched — and the fallback matters: a remembered signature can vanish
  // between broadcasts (a modality stops being offered), and a card that
  // then showed nothing would look broken rather than reset.
  const remembered = selectedByGame.get(entry.id);
  const current = presence.find((option) => signatureOf(option.modality) === remembered) ?? presence[0]!;

  // A single modality is not a choice, so it is not offered as one.
  if (presence.length > 1) {
    card.appendChild(
      renderModalityPicker(entry.id, presence, signatureOf(current.modality), entry.configOptions, (signature) => {
        onSelect(entry.id, signature);
      }),
    );
  }

  card.appendChild(renderModality(entry.id, gameName, current, entry.configOptions, callbacks));
  return card;
}

/**
 * The widget's opening view (spec: game-session domain). Purely
 * presentational — every side effect (matchmaking, bot selection) is
 * delegated to `callbacks`, never performed here; the caller (`main.ts`)
 * owns what actually happens once a player picks something.
 */
/**
 * The deck credit, reachable by whoever is actually looking at the cards.
 *
 * NOT A NICETY. The card artwork is CC BY-SA 3.0 (spanish-deck-ui's
 * `about.ts`), which requires crediting the author and linking the license.
 * A credit that lives only in a source file is not given to the people who
 * see the work — so it has to exist somewhere a player can reach, and this
 * is the widget's one screen that is always reachable.
 *
 * `<details>` RATHER THAN A BUTTON AND A FLAG. Disclosure is exactly what
 * this is, and the native element brings the keyboard behaviour, the
 * `aria-expanded` bookkeeping and the Escape handling that a hand-rolled
 * popover has to reimplement and usually half-implements. Its open state is
 * also a single DOM attribute, which is what makes it survivable across the
 * rebuild below — see `renderGameSelection`'s own note.
 *
 * THE LICENSE LINK IS ITS OWN ANCHOR, not a word inside the sentence: this
 * is the term easiest to lose to a copy edit, and `DECK_ATTRIBUTION` splits
 * the facts apart for the same reason.
 */
export function renderAbout(open: boolean): HTMLElement | undefined {
  if (GAME_UI_CREDITS.length === 0) return undefined;
  const details = document.createElement("details");
  details.className = "hexdev-about";
  if (open) details.open = true;

  const summary = document.createElement("summary");
  summary.className = "hexdev-about-toggle";
  // The visible glyph is an "i"; the accessible name is the real one. A
  // screen reader announcing the letter "i" tells nobody anything.
  summary.setAttribute("aria-label", STRINGS.aboutToggle);
  summary.title = STRINGS.aboutToggle;
  summary.textContent = "i";
  details.appendChild(summary);

  const panel = document.createElement("div");
  panel.className = "hexdev-about-panel";
  details.appendChild(panel);

  const heading = document.createElement("h2");
  heading.className = "hexdev-about-title";
  heading.textContent = STRINGS.aboutTitle;
  panel.appendChild(heading);

  for (const attribution of GAME_UI_CREDITS) {
    const credit = document.createElement("p");
    credit.className = "hexdev-about-credit";
    credit.textContent = STRINGS.aboutCredit(attribution.author);
    panel.appendChild(credit);

    const links = document.createElement("p");
    links.className = "hexdev-about-links";
    const source = document.createElement("a");
    source.href = attribution.sourceUrl;
    source.textContent = STRINGS.aboutSource;
    const license = document.createElement("a");
    license.href = attribution.licenseUrl;
    license.textContent = STRINGS.aboutLicense(attribution.licenseName);
    // The widget is embedded in somebody else's page; a credit link must
    // never navigate the host away from the game it is embedded in.
    for (const anchor of [source, license]) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      links.appendChild(anchor);
    }
    panel.appendChild(links);
  }

  return details;
}

function appendIfPresent(parent: HTMLElement, child: HTMLElement | undefined): void {
  if (child !== undefined) parent.appendChild(child);
}

export function renderGameSelection(
  container: HTMLElement,
  catalog: readonly CatalogEntry[],
  presenceByGame: ReadonlyMap<GameId, readonly LobbyDisplayEntry[]>,
  callbacks: GameSelectionCallbacks,
): void {
  ensureChromeStyles(container.ownerDocument);
  // WCAG 2.1.1/2.4.3 (focus-continuity.ts): every live presence broadcast
  // re-runs this whole function, and the wipe below used to dump keyboard
  // focus on <body> every few seconds. Capture-then-restore was chosen over
  // skip-identical-rebuild deliberately: one mechanism covers BOTH the
  // same-data broadcast (the common case) and a genuinely changed one, while
  // memoizing "would this render identically?" adds a second cache of the
  // presence state that can drift from what is actually on screen — and still
  // needs this restore path the moment the data really changes.
  const focusSnapshot = captureFocus(container);
  // Captured for the same reason focus is, and it is the same defect: every
  // live presence broadcast re-runs this whole function, so a credit panel
  // the player had opened would slam shut every few seconds while they were
  // reading it. One DOM attribute, read before the wipe and re-applied after.
  const aboutWasOpen = container.querySelector<HTMLDetailsElement>(".hexdev-about")?.open ?? false;
  const selectedByGame = selectionFor(container);
  const select = (gameId: GameId, signature: string): void => {
    selectedByGame.set(gameId, signature);
    renderGameSelection(container, catalog, presenceByGame, callbacks);
  };
  container.replaceChildren();
  container.className = "convite-chrome";
  // WCR-1: gates chrome-styles.ts's container-type declaration and the
  // status/error/unsupported centering rule — the lobby is the one screen
  // that does NOT want that centering (it stays top-anchored).
  container.dataset.chromeView = "lobby";

  // Two new wrapper elements (WCR-1/WCR-2, PR6-T1): .hexdev-chrome-content
  // is the inline-size container's actual @container target (a size
  // container cannot style itself); .hexdev-chrome-games is what switches
  // from a flex column to a real grid at the wide tier. Every existing
  // browser-test query below this point is a descendant selector
  // (`el.querySelector(...)`), so both nestings are transparent to them —
  // verified against game-selection.browser.test.ts, not assumed.
  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);

  // Title and tagline are ONE block, not two siblings of the grid: they are
  // centred together and the games are not, so they need a container of their
  // own to be centred within. Purely presentational — the heading order the
  // screen reader walks is unchanged.
  const header = document.createElement("div");
  header.className = "hexdev-chrome-header";
  content.appendChild(header);

  // The hand of cards above the title. PURELY DECORATIVE and marked as such:
  // it repeats nothing a screen reader needs and names nothing a player must
  // act on, so it is hidden from the accessibility tree rather than given
  // four alt texts that would be read out before the heading.
  //
  // Rendered only if a registered game offered one (game-ui-registry.ts's
  // GAME_UI_HERO). A platform with no art gets a lobby with no hero, which is
  // a lobby and not a hole.
  if (GAME_UI_HERO.length > 0) {
    const fan = document.createElement("div");
    // The greeting, which begins on the first render this container can be
    // PLAYED with — see DEALT_AT above. A lobby still waiting for its counts
    // is not an arrival, so it does not consume it.
    //
    // What is stored is the MOMENT it began, not the fact that it did, and
    // that is the whole fix: this function runs again on every presence
    // broadcast and rebuilds these cards from scratch, which cancels their
    // animations and would restart them at zero. Publishing how long ago the
    // hand started lets the rebuilt cards resume mid-flight instead.
    const playable = catalog.some((game) => (presenceByGame.get(game.id)?.length ?? 0) > 0);
    if (playable && !DEALT_AT.has(container)) DEALT_AT.set(container, Date.now());
    const startedAt = DEALT_AT.get(container);
    // The greeting is over when its LAST card has finished: that card waits
    // out the stagger for its index and then takes a full duration to land.
    const greeting = DEAL_STAGGER_MS * Math.max(0, GAME_UI_HERO.length - 1) + DEAL_DURATION_MS;
    const elapsed = startedAt === undefined ? undefined : Date.now() - startedAt;
    const dealing = elapsed !== undefined && elapsed < greeting;
    fan.className = dealing ? "hexdev-chrome-fan hexdev-chrome-fan--dealing" : "hexdev-chrome-fan";
    // What the stylesheet subtracts from each card's delay. Set only while
    // the greeting is running, so a finished hand carries no stale offset.
    if (dealing) fan.style.setProperty("--elapsed", `${String(elapsed)}ms`);
    fan.setAttribute("aria-hidden", "true");
    for (const [index, src] of GAME_UI_HERO.entries()) {
      const card = document.createElement("img");
      card.className = "hexdev-chrome-fan-card";
      card.src = src;
      card.alt = "";
      // NOT lazy, and that is the correction to an earlier version of this.
      // The hand is the first thing on the screen; deferring an image that is
      // already in the viewport buys nothing and costs a visible pop-in as it
      // arrives late. `decoding="async"` is the part that actually helps —
      // it keeps decode off the critical path without delaying the fetch.
      card.decoding = "async";
      card.style.setProperty("--i", String(index));
      fan.appendChild(card);
    }
    fan.style.setProperty("--n", String(GAME_UI_HERO.length));
    header.appendChild(fan);
  }

  // THE NAME IS THE TITLE, and the instruction moved under it. A front door
  // says where you are first and what to do second; this screen had it the
  // other way round, so the biggest thing on it was a verb.
  //
  // The name comes from the game (game-ui-registry.ts's GAME_UI_HERO_TITLE),
  // never from the catalog: the catalog has "Truco Argentino" and "Truco
  // Argentino 2v2" as separate entries because they are separate matches to
  // join, and printing one of those here would put a seat count in the title
  // of the screen. A platform whose games declare nothing falls back to the
  // instruction as the heading, which is what this always was.
  const title = document.createElement("h1");
  title.className = "hexdev-chrome-title";
  title.textContent = GAME_UI_HERO_TITLE ?? STRINGS.selectionTitle;
  // BEFORE the title, so a screen reader meets the way out before the
  // heading rather than after everything under it.
  if (callbacks.onBack !== undefined) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "hexdev-chrome-back";
    back.textContent = STRINGS.backToGames;
    back.addEventListener("click", callbacks.onBack);
    header.appendChild(back);
  }

  header.appendChild(title);

  if (GAME_UI_HERO_TITLE !== undefined) {
    const instruction = document.createElement("p");
    instruction.className = "hexdev-chrome-instruction";
    instruction.textContent = STRINGS.selectionTitle;
    header.appendChild(instruction);
  }

  const tagline = document.createElement("p");
  tagline.className = "hexdev-chrome-tagline";
  tagline.textContent = STRINGS.selectionTagline;
  header.appendChild(tagline);

  if (catalog.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hexdev-chrome-empty";
    empty.textContent = STRINGS.emptyCatalog;
    content.appendChild(empty);
    // The credit belongs on the empty screen too: a tenant with no games
    // enabled still ships the deck art in the bundle.
    appendIfPresent(content, renderAbout(aboutWasOpen));
    restoreFocus(container, focusSnapshot);
    return;
  }

  const games = document.createElement("div");
  games.className = "hexdev-chrome-games";
  content.appendChild(games);
  for (const entry of catalog) {
    games.appendChild(renderGame(entry, presenceByGame.get(entry.id), callbacks, selectedByGame, select));
  }
  appendIfPresent(content, renderAbout(aboutWasOpen));
  restoreFocus(container, focusSnapshot);
}
