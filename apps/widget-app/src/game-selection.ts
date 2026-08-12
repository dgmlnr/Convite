import type { BotTier, GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry, ModalityConfig } from "@hexdev/platform-core";
import { ensureChromeStyles } from "./chrome-styles.js";
import { STRINGS, translateConfigLabel, translateGameName } from "./i18n.js";
import type { CatalogEntry } from "./bootstrap-data.js";

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

/** `MatchmakingPool.tryPair` only ever pairs exactly TWO waiting players
 * (obs 2927/2925: "the matchmaking pool for four" is a NAMED, undone gap,
 * not silently glossed over) — a queue join for any game whose module needs
 * more than 2 seats would enqueue a player who can never be paired, a
 * silent, permanent hang, not a fast bot-fallback path. `canQueueForPerson`
 * is the single, honest gate that keeps a 4-seat (2v2) modality from ever
 * showing an affordance the platform cannot fulfil. */
function canQueueForPerson(seatCount: number): boolean {
  return seatCount === 2;
}

function renderModality(
  gameId: GameId,
  entry: LobbyDisplayEntry,
  configOptions: CatalogEntry["configOptions"],
  seatCount: number,
  callbacks: GameSelectionCallbacks,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "hexdev-modality";

  const heading = document.createElement("p");
  heading.textContent = describeModality(entry.modality, configOptions);
  wrapper.appendChild(heading);

  const botLabel = document.createElement("p");
  botLabel.textContent = STRINGS.playVsBot;

  if (!canQueueForPerson(seatCount)) {
    // No queue affordance at all for a seat count the pairing pool cannot
    // fulfil yet — bot tiers are the ONLY path (spec's "never blocked"
    // guarantee, honestly delivered via bot-filled seats, not a fake queue).
    wrapper.dataset.prominent = "bot";
    wrapper.append(botLabel, botButtonsRow(gameId, entry.modality, callbacks));
    return wrapper;
  }

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

  const title = document.createElement("h2");
  title.textContent = translateGameName(entry.displayNameKey);
  card.appendChild(title);

  if (presence === undefined || presence.length === 0) {
    const loading = document.createElement("p");
    loading.className = "hexdev-chrome-loading";
    loading.textContent = STRINGS.loadingCatalog;
    card.appendChild(loading);
    return card;
  }

  for (const modalityEntry of presence) {
    card.appendChild(renderModality(entry.id, modalityEntry, entry.configOptions, entry.seatCount, callbacks));
  }
  return card;
}

/**
 * The widget's opening view (spec: game-session domain). Purely
 * presentational — every side effect (matchmaking, bot selection) is
 * delegated to `callbacks`, never performed here; the caller (`main.ts`)
 * owns what actually happens once a player picks something.
 */
export function renderGameSelection(
  container: HTMLElement,
  catalog: readonly CatalogEntry[],
  presenceByGame: ReadonlyMap<GameId, readonly LobbyDisplayEntry[]>,
  callbacks: GameSelectionCallbacks,
): void {
  ensureChromeStyles(container.ownerDocument);
  container.replaceChildren();
  container.className = "hexdev-gamify-chrome";
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

  const title = document.createElement("h1");
  title.className = "hexdev-chrome-title";
  title.textContent = STRINGS.selectionTitle;
  content.appendChild(title);

  if (catalog.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hexdev-chrome-empty";
    empty.textContent = STRINGS.emptyCatalog;
    content.appendChild(empty);
    return;
  }

  const games = document.createElement("div");
  games.className = "hexdev-chrome-games";
  content.appendChild(games);
  for (const entry of catalog) {
    games.appendChild(renderGame(entry, presenceByGame.get(entry.id), callbacks));
  }
}
