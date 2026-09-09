/**
 * THE ONE CONTROL THIS PRODUCT HAS FOR SOUND, because it is the only thing in
 * it that makes any.
 *
 * IT SITS BESIDE THE CUBILETE RATHER THAN IN A SETTINGS PANEL, and there are
 * two reasons, one of them structural. The structural one: there is no
 * settings panel. This widget has a lobby, a game screen and four boards, and
 * nothing that persists across them — inventing a preferences surface for one
 * toggle would be a far larger change than the sound it configures. The other
 * one is better anyway: the place a person looks for the control that stops a
 * noise is next to the thing making it.
 *
 * A REAL TOGGLE BUTTON, which is a stable NAME plus `aria-pressed` and never
 * a label that swaps between "Silenciar" and "Activar". Both spellings get
 * announced, and the swapping one is the one that lies: a screen reader
 * reading the new label after a press says the OPPOSITE of what just
 * happened. `die-button.ts` next door uses the same pattern for a held die
 * and for the same reason.
 *
 * THE GLYPH IS INLINE SVG, not an emoji and not an icon font. An emoji
 * renders as a different picture on every platform and as a coloured one on
 * most, which is a decision about this board's palette made by whoever's
 * phone it is; an icon font is a network request for two shapes. Both paths
 * below are `currentColor`, so the control inherits the board's own ink like
 * every other mark on it.
 */

/** The speaker body, shared by both states — drawn once so the two glyphs are
 * the same object with and without its waves, rather than two drawings that
 * nearly agree. */
const SPEAKER_BODY = "M4 9.5v5h3.2L11.5 18V6L7.2 9.5H4z";
/** Two arcs for "sounding", a cross for "silent". Deliberately NOT one arc
 * versus none: at this size a single small difference is not legible at a
 * glance, and the cross reads as OFF in a way that absence never does. */
const SPEAKER_WAVES = "M14.2 8.6a4.6 4.6 0 0 1 0 6.8M16.6 6.2a8 8 0 0 1 0 11.6";
const SPEAKER_CROSS = "M14.5 9.5l5 5M19.5 9.5l-5 5";

export interface MuteButton {
  readonly element: HTMLButtonElement;
  /** Redraws the control for a state somebody else owns. This element holds
   * no opinion about whether the dice are muted — `tray.ts` does, because
   * `tray.ts` is what persists it. */
  readonly render: (muted: boolean) => void;
}

export function createMuteButton(doc: Document, onToggle: () => void): MuteButton {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "hexdev-generala-mute";
  // The stable name. What CHANGES is `aria-pressed`, below.
  button.setAttribute("aria-label", "Silenciar los dados");
  button.addEventListener("click", onToggle);

  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const body = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  body.setAttribute("d", SPEAKER_BODY);
  body.setAttribute("fill", "currentColor");
  const mark = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  mark.setAttribute("fill", "none");
  mark.setAttribute("stroke", "currentColor");
  mark.setAttribute("stroke-width", "1.8");
  mark.setAttribute("stroke-linecap", "round");
  svg.append(body, mark);
  button.appendChild(svg);

  return {
    element: button,
    render: (muted: boolean): void => {
      button.setAttribute("aria-pressed", String(muted));
      mark.setAttribute("d", muted ? SPEAKER_CROSS : SPEAKER_WAVES);
      // A `title` as well as the accessible name: this is an icon-only
      // control, so a sighted player who cannot guess the glyph has nothing
      // else to read. It says what pressing it will DO, which is the one
      // place that phrasing is right — a tooltip is read before the press,
      // where `aria-pressed` is read as state.
      button.title = muted ? "Activar el sonido de los dados" : "Silenciar los dados";
    },
  };
}
