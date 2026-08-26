import type { BotTier, GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry, ModalityConfig } from "@hexdev/platform-core";
import { ensureChromeStyles } from "./chrome-styles.js";
import { captureFocus, restoreFocus } from "./focus-continuity.js";
import { STRINGS, translateConfigLabel, translateGameName } from "./i18n.js";
import type { CatalogEntry } from "./bootstrap-data.js";
import { GAME_UI_CREDITS, GAME_UI_HERO } from "./game-ui-registry.js";

export interface GameSelectionCallbacks {
  onPlayVsPerson(gameId: GameId, modality: ModalityConfig): void;
  onPlayVsBot(gameId: GameId, modality: ModalityConfig, tier: BotTier): void;
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

function renderGame(entry: CatalogEntry, presence: readonly LobbyDisplayEntry[] | undefined, callbacks: GameSelectionCallbacks): HTMLElement {
  const card = document.createElement("section");
  card.className = "hexdev-game-card";
  // Focus-continuity ancestor context: two games can offer the SAME modality
  // config, so the modality wrapper's own identity is only unique per game.
  card.dataset.game = entry.id;

  const gameName = translateGameName(entry.displayNameKey);
  const title = document.createElement("h2");
  title.textContent = gameName;
  card.appendChild(title);

  if (presence === undefined || presence.length === 0) {
    const loading = document.createElement("p");
    loading.className = "hexdev-chrome-loading";
    loading.textContent = STRINGS.loadingCatalog;
    card.appendChild(loading);
    return card;
  }

  for (const modalityEntry of presence) {
    card.appendChild(renderModality(entry.id, gameName, modalityEntry, entry.configOptions, callbacks));
  }
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
function renderAbout(open: boolean): HTMLElement | undefined {
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
    fan.className = "hexdev-chrome-fan";
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

  const title = document.createElement("h1");
  title.className = "hexdev-chrome-title";
  title.textContent = STRINGS.selectionTitle;
  header.appendChild(title);

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
    games.appendChild(renderGame(entry, presenceByGame.get(entry.id), callbacks));
  }
  appendIfPresent(content, renderAbout(aboutWasOpen));
  restoreFocus(container, focusSnapshot);
}
