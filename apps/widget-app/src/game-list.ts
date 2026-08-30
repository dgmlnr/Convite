import { ensureChromeStyles } from "./chrome-styles.js";
import type { GameFamily } from "./game-families.js";
import { renderAbout } from "./game-screen.js";
import { familyUiFor } from "./game-ui-registry.js";
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
  // THE SAME SHELL CLASS SCREEN TWO SETS, and it is not decoration: it
  // carries the felt, the type scale, and the @container context every
  // responsive rule below it is written against. Without it this rendered as
  // black text on white with no panels -- which is exactly how the first
  // scene of this screen came out, and why the scene exists.
  container.className = "convite-chrome";
  // Gates chrome-styles.ts's container-type declaration and keeps this screen
  // top-anchored: the status/error views centre themselves vertically, and a
  // list of games is not a message.
  container.dataset.chromeView = "lobby";
  container.replaceChildren();

  const content = document.createElement("div");
  content.className = "hexdev-chrome-content";
  container.appendChild(content);

  const header = document.createElement("header");
  header.className = "hexdev-chrome-header";
  content.appendChild(header);

  // THIS SCREEN'S OWN QUESTION, never screen two's. What is being chosen here
  // is WHICH GAME; how to play it is the next screen's job and has its own
  // string (`STRINGS.selectionTitle`, i18n.ts). This heading read that one
  // for a while, so the front door asked "Elegí cómo jugar" over a row of
  // games it was not offering a way to play yet.
  const title = document.createElement("h1");
  title.className = "hexdev-chrome-title";
  title.textContent = STRINGS.gameListTitle;
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

    // ITS OWN CARDS, ahead of its name: somebody who plays reads the faces
    // before they read a word, and somebody who does not still sees a hand.
    // Hidden from the accessibility tree because the heading below already
    // says which game this is — three alt texts would be read out first and
    // name nothing a player must act on.
    //
    // A family that declares none renders a title-only card, still full size
    // and still a full activation target: a game with no art yet is a game,
    // not a hole in the list.
    const art = familyUiFor(family.id)?.cardArt ?? [];
    if (art.length > 0) {
      const fan = document.createElement("div");
      fan.className = "hexdev-game-card-art";
      fan.setAttribute("aria-hidden", "true");
      fan.style.setProperty("--n", String(art.length));
      for (const [index, src] of art.entries()) {
        const face = document.createElement("img");
        face.className = "hexdev-game-card-face";
        face.src = src;
        face.alt = "";
        face.decoding = "async";
        face.style.setProperty("--i", String(index));
        fan.appendChild(face);
      }
      card.appendChild(fan);
    }

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
  const foot = document.createElement("footer");
  foot.className = "hexdev-chrome-foot";

  // THE MARK, and it is deliberately the quietest thing on the screen. The
  // games are the content; this only says where you are. It sits beside the
  // credits rather than above the list because a front door that names itself
  // louder than what it offers is an advertisement.
  const brand = document.createElement("p");
  brand.className = "hexdev-chrome-brand";
  brand.textContent = STRINGS.brand;
  foot.appendChild(brand);

  const about = renderAbout(false);
  if (about !== undefined) foot.appendChild(about);
  content.appendChild(foot);
}
