export const BOARD_STYLE_ID = "hexdev-generala-board-styles";

/** The class the board's own container wears, exported so the composition
 * root that builds that container and this sheet cannot disagree about its
 * name — the one string both halves have to say the same way. */
export const BOARD_CLASS = "hexdev-generala-board";

/**
 * THE TABLE THE FIVE PIECES SIT ON.
 *
 * This package shipped a tray, a planilla, an announcer, a servida callout
 * and a match-over overlay, and no table: its own barrel said what was left
 * was "a board that mounts them". This is the half of that board a stylesheet
 * can hold. The other half — which element goes where, and in what order — is
 * DOM, and lives with the composition root that mounts it.
 *
 * IT IS THE POSITIONING CONTEXT, AND THAT IS THE ONE RULE HERE THAT IS NOT A
 * PREFERENCE. `match-over-styles.ts` is `position: absolute; inset: 0` and
 * deliberately declines to declare `position: relative` on somebody else's
 * element, "because a board may want the overlay over the whole table or over
 * one panel of it and only the board knows which". This is the board and this
 * is the answer: over the whole table. Without this line the overlay's
 * containing block is whatever positioned ancestor happens to exist up the
 * page — in a widget embedded in somebody else's site, that is somebody
 * else's element — and a veil meant for one match covers a stranger's page.
 *
 * IT PAINTS ITS OWN GROUND, and the reason is written down rather than
 * guessed. `escoba-ui`'s `match-styles.ts` records the defect verbatim: the
 * widget's registry assigns the match container's className OUTRIGHT, so a
 * game surface does not inherit `.convite-chrome`'s felt, and escoba rendered
 * on the document's bare white while truco rendered on green. Found by
 * looking at a scene; no assertion saw it, because a background has no
 * geometry. Generala is the third game to reach this tier and the first that
 * could have read that note before shipping the defect.
 *
 * WHAT IT DOES NOT DO IS COPY THE FELT. `escoba-ui` mirrors truco's whole
 * `--hx-*` cloth vocabulary and pays for it with a parity guard
 * (`design-token-parity.test.ts`) that scans all three copies and fails when
 * one drifts. A FOURTH copy would either join that guard or — far worse — sit
 * outside it and drift in silence, which is the failure mode a guard over
 * three copies cannot see. So this surface is not a felt: it is the widget's
 * own `--gx-color-surface`, the token a tenant already sets and the exact
 * value `scorecard-styles.ts` measured its open-box dash against. One
 * declaration, no vocabulary, nothing to drift.
 *
 * THE INK IS NOT `--gx-color-on-surface`, and that is deliberate to the point
 * of being the reason this comment exists. `chrome-styles.ts` states it: that
 * token is what a tenant sets for THEIR background, not for ours, and its own
 * default is `#1a1a1a` — near-black, which on the dark surface above computes
 * to roughly 1.1:1 and is the exact shape of a defect this repository has
 * already shipped once and found by looking. The ink here is light, declared
 * literally, and the surface it is read on is declared one line above it.
 *
 * TWO RULES BELOW WERE ADDED BY LOOKING AT THE RENDERED BOARD, and both were
 * invisible to every assertion that had already passed.
 *
 * 1. IT SCROLLS, BUT ONLY WHERE SCROLLING IS THE ANSWER. A planilla of eleven
 *    categories plus a totals row plus a tray does not fit a 375×812 phone,
 *    and the overflow was simply CLIPPED: the last category and the totals row
 *    sat off the bottom of the screen, unreachable by any gesture. Every fence
 *    passed — the rows were in the DOM, the table measured correctly, and
 *    nothing in this repository asserts that a player can reach the bottom of
 *    a board.
 *
 *    THE FIX IS SCOPED TO `fullscreen`, which is the same scope truco, escoba
 *    and the solitaire all give their own height caps, and for the reason
 *    `mahjong-solitaire-ui/board-styles.ts` states: INLINE, the host sizes the
 *    iframe to the height the widget reports (`main.ts` posts
 *    `documentElement.scrollHeight`), so a board that capped itself there
 *    would cap the iframe too and manufacture a scrollbar inside a page that
 *    was about to grow. Fullscreen is the only mode where the box is fixed and
 *    the content has to move inside it.
 *
 *    AND THE COLUMN SCROLLS, NOT THE BOARD. The overlay is
 *    `position: absolute; inset: 0` against this element, and on a SCROLLING
 *    container that resolves against the whole scrollable content — so a veil
 *    over an 1800px card would centre its panel 900px down, off the screen the
 *    player is looking at. Keeping the scroll one level in leaves the board a
 *    fixed, viewport-sized positioning context and the overlay covers exactly
 *    what is on screen.
 *
 * 2. IT HAS A READING WIDTH. Measured at 1280: the planilla spanned the whole
 *    window, so "Generala doble" sat 1000px from the number that belonged to
 *    it and the card read as a spreadsheet rather than as a planilla. The cap
 *    is 680px and the number is not a taste: at 960px and up `dice-ui`'s
 *    ladder draws each die at its full 210px box, and five of those plus four
 *    gaps ask for 1066px — so any stack between 701 and 1065 wraps the tray
 *    into two rows for no gain. 680 keeps the tray inside its own 700px
 *    container tier, where five 126px boxes and four gaps measure 646px and
 *    sit on one line with room over.
 */
export function buildBoardStylesheet(): string {
  return `
.${BOARD_CLASS} {
  /* Declared, not only read: \`--generala-\` is a namespace this package owns
     (\`stylesheet-tokens.test.ts\`), and both are real knobs — a board is
     exactly the tier a host would want to repaint. */
  --generala-board-surface: var(--gx-color-surface, #14231d);
  --generala-board-ink: #f2f2f2;
  /* The widest a planilla is allowed to be read at, and the widest the tray
     may be laid out in — see the ladder arithmetic in this file's header.
     A knob, because a board embedded in a wide host may want a different
     answer to the same question. */
  --generala-board-width: 680px;
  box-sizing: border-box;
  /* Fills the widget when the host gives it a height and hugs its content
     when it does not — the same pair of cases \`escoba-ui\`'s own surface
     answers, and for the same reason: the widget document declares no height
     on html or body. */
  min-height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--generala-board-surface);
  /* Inherited by every child that sets no colour of its own — the planilla,
     the callout and the announcer all say \`color: inherit\`, which is what
     makes this one declaration the whole game's ink instead of three. */
  color: var(--generala-board-ink);
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

/* THE COLUMN THE TABLE IS ACTUALLY LAID OUT IN. The board fills the widget —
   the ground has to reach the edges or it is a panel floating on somebody
   else's page — and this is the part of it a player reads. Centred rather
   than left-aligned because a board is a table you sit at, not a document. */
.${BOARD_CLASS} > .${BOARD_CLASS}-column {
  width: 100%;
  max-width: var(--generala-board-width);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* THE CUBILETE AND THE CONTROL THAT COMMITS, UNDER THE DICE THEY THROW.
   Found by looking: the tray centres its own row and the planilla is a
   full-width block, so a roll button left in normal flow sat hard against the
   left edge with the five dice centred above it — the only element on the
   board that belonged to nothing. It is the primary action of the screen and
   it now sits under its own subject. The tray owns the BUTTON and the CUP
   (\`tray.ts\`); the board owns where they go, which is the same split the
   rest of this file keeps.

   \`align-items: center\` IS LOAD-BEARING NOW THAT THERE ARE TWO OF THEM. A
   flex row defaults to \`stretch\`, and the cubilete beside the button is
   nearly 150px tall — the button would have been stretched to match it,
   turning a control into a column of felt with a word in the middle.

   \`flex-wrap\` DELIBERATELY ABSENT. If the pair ever stops fitting, the right
   answer is a narrower cup and not a cup that jumps onto its own line: the
   whole point of putting it here is that the cubilete and the throw are one
   gesture, and a wrap would draw them as two unrelated rows the way the cup
   and the tray used to read before \`dice-styles.ts\` composed them.
   \`tray-fit.browser.test.ts\` measures the row against the narrowest phone
   this product supports rather than leaving that to hope. */
.${BOARD_CLASS}-roll {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

/* FULLSCREEN IS THE ONE MODE WITH A FIXED BOX, so it is the one mode with
   anything to scroll — see this file's header for why inline must not.
   \`100dvh\` and not \`100vh\`, the same unit the solitaire's own fullscreen cap
   uses: on a phone the two differ by the browser chrome's height, and the
   difference is exactly the strip a totals row hides under. */
:root[data-hexdev-layout="fullscreen"] .${BOARD_CLASS} {
  min-height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

:root[data-hexdev-layout="fullscreen"] .${BOARD_CLASS} > .${BOARD_CLASS}-column {
  /* \`min-height: 0\` is what actually makes this scroll: a flex item's default
     \`min-height: auto\` refuses to shrink below its content, so the column
     would grow past the board and be clipped by the rule above with no
     scrollbar to show for it — the original defect, moved one element in. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this package uses, so a board rendered on
 * every message never duplicates the `<style>` tag. */
export function ensureBoardStyles(doc: Document): void {
  if (doc.getElementById(BOARD_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = BOARD_STYLE_ID;
  style.textContent = buildBoardStylesheet();
  doc.head.appendChild(style);
}
