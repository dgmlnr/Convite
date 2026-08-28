import { ensureChromeStyles } from "./chrome-styles.js";
import type { GameFamily } from "./game-families.js";
import { renderAbout } from "./game-screen.js";
import { STRINGS, translateGameName } from "./i18n.js";

/**
 * SCREEN ONE: the place, and the games in it.
 *
 * The screen a player lands on when this tenant is entitled to more than one
 * game. It lists GAMES, not the entries the matchmaker joins: `truco-argentino`
 * and `truco-argentino-2v2` are two ways of playing one thing, and choosing
 * between them belongs on the game's own screen, not here.
 *
 * DELIBERATELY UNREACHABLE TODAY. The only configured tenant is entitled to
 * both truco entries, which is a single family, and a single-family tenant
 * opens straight onto its game (`lobby-screen.ts`). So this renders for
 * nobody until a second game ships — which is exactly why its correctness
 * rests on tests and a rendered scene rather than on somebody using it.
 *
 * WHAT IS NOT HERE YET, and is not an oversight: each family's own cards, the
 * "Convite" mark at the foot, and this screen's own scene. Those are the next
 * unit; this one is the screen existing and working. Nothing plain reaches a
 * player in between, because of the paragraph above.
 */
export interface GameListCallbacks {
  readonly onOpenGame: (family: GameFamily) => void;
}

export function renderGameList(container: HTMLElement, families: readonly GameFamily[], callbacks: GameListCallbacks): void {
  ensureChromeStyles(container.ownerDocument);
  container.replaceChildren();

  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);

  const header = document.createElement("header");
  header.className = "hexdev-chrome-header";
  content.appendChild(header);

  const title = document.createElement("h1");
  title.className = "hexdev-chrome-title";
  title.textContent = STRINGS.selectionTitle;
  header.appendChild(title);

  const tagline = document.createElement("p");
  tagline.className = "hexdev-chrome-tagline";
  tagline.textContent = STRINGS.selectionTagline;
  header.appendChild(tagline);

  // An empty catalog is a lobby with nothing in it, never a blank screen.
  if (families.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hexdev-chrome-empty";
    empty.textContent = STRINGS.emptyCatalog;
    content.appendChild(empty);
    return;
  }

  // THE SAME ROW AS SCREEN TWO, on purpose: `.hexdev-chrome-games` carries
  // the band contract both screens live in — the header's own max-width and
  // centre, with bounded tracks so one card cannot run the full width. Two
  // screens sharing one layout rule is why the fix made for one holds here.
  const list = document.createElement("div");
  list.className = "hexdev-chrome-games";
  content.appendChild(list);

  for (const family of families) {
    // A BUTTON, not a div with a handler: the whole card is the activation
    // target, and a button is the only element that gets keyboard activation,
    // focus and a role without being told to.
    const card = document.createElement("button");
    card.type = "button";
    card.className = "hexdev-game-card hexdev-game-card--choice";
    card.dataset.family = family.id;

    const name = document.createElement("h2");
    // The name comes from the family's FIRST entry, which is the catalog's
    // own first way of playing it. Both truco entries translate to names that
    // differ only by seat count, and the seat count belongs on the game's own
    // screen — never in the title of the card you press to get there.
    name.textContent = translateGameName(family.entries[0]!.displayNameKey);
    card.appendChild(name);

    card.addEventListener("click", () => callbacks.onOpenGame(family));
    list.appendChild(card);
  }

  // THE CREDITS RENDER ON BOTH SCREENS, and that is a licensing obligation
  // rather than a nicety. Screen two's own copy assumed it was the one
  // always-reachable screen; that stopped being true the moment a
  // multi-family tenant could sit here instead. An obligation is owed on
  // whichever screen a player is actually looking at.
  const about = renderAbout(false);
  if (about !== undefined) content.appendChild(about);
}
