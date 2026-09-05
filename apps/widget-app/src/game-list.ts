import { ensureChromeStyles } from "./chrome-styles.js";
import type { GameFamily } from "./game-families.js";
import type { GameSection } from "./game-sections.js";
import { renderAbout } from "./game-screen.js";
import { familyUiFor, sectionUiFor } from "./game-ui-registry.js";
import { STRINGS, translateGameName } from "./i18n.js";

/**
 * SCREEN ONE: the place, the shelves, and the games on them.
 *
 * The screen a player lands on when this tenant is entitled to more than one
 * game. It lists GAMES, not the entries the matchmaker joins: `truco-argentino`
 * and `truco-argentino-2v2` are two ways of playing one thing, and choosing
 * between them belongs on the game's own screen, not here.
 *
 * REACHABLE TODAY, and the paragraph that stood here said the opposite for
 * two shipped releases. It read "deliberately unreachable — the only
 * configured tenant is entitled to both truco entries, which is a single
 * family". Escoba satisfied that condition and nobody came back to the
 * sentence: both composition roots now entitle four ids (`apps/server/src/
 * config.ts`, `apps/mint-server/src/config.ts`) which collapse into TWO
 * families, so `lobby-screen.ts`'s single-family shortcut is false and this
 * is the first thing a player sees. Its tests and its scene are still the
 * fastest way to look at it; they stopped being the only way.
 *
 * ONE SHELF IS NO SHELF. A tenant whose games all sit on one shelf has
 * nothing to tell apart, so no heading and no group wrapper are emitted and
 * the card names stay at `h2` — the same DOM this screen rendered before
 * shelves existed. Every module registered today declares `section:
 * "cartas"`, so that is the branch the running product takes.
 */
export interface GameListCallbacks {
  readonly onOpenGame: (family: GameFamily) => void;
}

/** The URL half of a `CardArtItem` — an `<img>`, exactly as every card face
 * rendered before that field's contract widened to also accept markup. */
function imageFace(src: string): HTMLImageElement {
  const face = document.createElement("img");
  face.src = src;
  face.alt = "";
  face.decoding = "async";
  return face;
}

export function renderGameList(container: HTMLElement, sections: readonly GameSection[], callbacks: GameListCallbacks): void {
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
  // Normalization is total (`catalogGroupingOf`), so a non-empty catalog
  // always yields at least one shelf — no shelf means no games.
  if (sections.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hexdev-chrome-empty";
    empty.textContent = STRINGS.emptyCatalog;
    content.appendChild(empty);
    return;
  }

  // ONE CONDITION, AND IT DECIDES BOTH HALVES OF THE CHANGE. A single shelf
  // gets no wrapper, no heading, and card names left at `h2`; more than one
  // gets all three. The heading level cannot be decided anywhere else: a
  // heading emitted without stepping the names under it puts a shelf and a
  // game at the same level, and a step with no heading above it skips a
  // level in the outline. Two `if`s here is how those drift apart.
  const headed = sections.length > 1;

  for (const section of sections) {
    // THE HEADING IS A SIBLING OF THE BAND, NEVER A CHILD OF IT, and that is
    // geometry rather than taste. `.hexdev-chrome-games` becomes an auto-fit
    // grid of 22rem tracks at ≥720px (chrome-styles.ts), so an `<h2>` placed
    // inside it is a grid ITEM standing beside a card instead of a label over
    // the row. Spanning it back would need `grid-column: 1 / -1`, meaningful
    // only in the grid tier and silently inert below it. Wrapping instead
    // leaves the band's own rules edited by zero lines, which is what makes
    // the one-shelf render identical rather than merely close.
    let band: HTMLElement = content;
    if (headed) {
      const shelf = document.createElement("section");
      shelf.className = "hexdev-chrome-section";
      const headingId = `hexdev-section-${section.id}`;
      // An unnamed <section> is not exposed as a region at all, so a grouping
      // that is obvious to somebody looking at it would not exist for anyone
      // who is not.
      shelf.setAttribute("aria-labelledby", headingId);

      const heading = document.createElement("h2");
      heading.className = "hexdev-chrome-section-title";
      heading.id = headingId;
      // THE RAW ID WHEN THE CLIENT HAS NO COPY FOR THE SHELF. `SECTIONS` is a
      // hand-written list and will fall behind the catalog eventually; the
      // alternative — emitting no heading — silently files these cards under
      // the shelf above and mis-attributes them. Visible and ugly is a bug
      // report somebody files; silent is a lie about a neighbour.
      heading.textContent = sectionUiFor(section.id)?.title ?? section.id;
      shelf.appendChild(heading);

      content.appendChild(shelf);
      band = shelf;
    }

    // THE SAME ROW AS SCREEN TWO, on purpose: `.hexdev-chrome-games` carries
    // the band contract both screens live in — the header's own max-width and
    // centre, with bounded tracks so one card cannot run the full width. Two
    // screens sharing one layout rule is why the fix made for one holds here.
    const list = document.createElement("div");
    list.className = "hexdev-chrome-games";
    band.appendChild(list);

    for (const family of section.families) {
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
        for (const [index, item] of art.entries()) {
          // A STRING IS STILL A URL, exactly as before this field's contract
          // widened: truco's and escoba's own arrays draw down this branch
          // unchanged. Anything else is a `MahjongCardArtTile` (or any future
          // game's own equivalent) — a factory this shell calls without ever
          // learning what it built, the same way it never learns what a URL
          // points at.
          const face = typeof item === "string" ? imageFace(item) : item.render(document);
          face.classList.add("hexdev-game-card-face");
          face.style.setProperty("--i", String(index));
          fan.appendChild(face);
        }
        card.appendChild(fan);
      }

      const name = document.createElement(headed ? "h3" : "h2");
      // The name comes from the family's FIRST entry, which is the catalog's
      // own first way of playing it. Both truco entries translate to names that
      // differ only by seat count, and the seat count belongs on the game's own
      // screen — never in the title of the card you press to get there.
      name.textContent = translateGameName(family.entries[0]!.displayNameKey);
      card.appendChild(name);

      card.addEventListener("click", () => callbacks.onOpenGame(family));
      list.appendChild(card);
    }
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
