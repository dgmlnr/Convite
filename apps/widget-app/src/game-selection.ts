import type { BotTier, GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry, ModalityConfig } from "@hexdev/platform-core";
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

function renderModality(gameId: GameId, entry: LobbyDisplayEntry, configOptions: CatalogEntry["configOptions"], callbacks: GameSelectionCallbacks): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "hexdev-modality";

  const heading = document.createElement("p");
  heading.textContent = describeModality(entry.modality, configOptions);
  wrapper.appendChild(heading);

  const botLabel = document.createElement("p");
  botLabel.textContent = STRINGS.playVsBot;

  const personSection = document.createElement("div");
  const countText = document.createElement("p");
  const personButton = document.createElement("button");
  personButton.type = "button";
  personButton.dataset.action = "vs-person";
  personButton.textContent = STRINGS.playVsPerson;
  personButton.addEventListener("click", () => callbacks.onPlayVsPerson(gameId, entry.modality));

  if (entry.waitingCount !== undefined) {
    // Non-zero: vs-person is the prominent path, real count shown.
    countText.textContent = STRINGS.waitingCount(entry.waitingCount);
    personSection.append(countText, personButton);
    wrapper.append(personSection, botLabel, botButtonsRow(gameId, entry.modality, callbacks));
  } else {
    // Zero-counter UX rule (spec): never render a "0 waiting" text — the bot
    // CTA becomes the prominent path instead, rendered FIRST.
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
    loading.textContent = STRINGS.loadingCatalog;
    card.appendChild(loading);
    return card;
  }

  for (const modalityEntry of presence) {
    card.appendChild(renderModality(entry.id, modalityEntry, entry.configOptions, callbacks));
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
  container.replaceChildren();

  const title = document.createElement("h1");
  title.textContent = STRINGS.selectionTitle;
  container.appendChild(title);

  if (catalog.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = STRINGS.emptyCatalog;
    container.appendChild(empty);
    return;
  }

  for (const entry of catalog) {
    container.appendChild(renderGame(entry, presenceByGame.get(entry.id), callbacks));
  }
}
