import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { createLobbyScreen } from "./lobby-screen.js";
import type { GameFamily } from "./game-families.js";

const entry = (id: string, gameFamily: string) => ({ id: id as GameId, gameFamily, section: "cartas", displayNameKey: "n", seatCount: 2, configOptions: [] });
const family = (id: string, ...ids: string[]): GameFamily => ({ id, entries: ids.map((i) => entry(i, id)) });

const TRUCO = family("truco", "truco-argentino", "truco-argentino-2v2");
const ESCOBA = family("escoba", "escoba-de-15");

describe("createLobbyScreen — which of the two screens is open", () => {
  /* THE SINGLE-GAME BYPASS, and it is today's live case: the only configured
   * tenant is entitled to both truco entries, which is ONE family. So this
   * branch is what every real player currently gets, and the list screen is
   * unreachable until a second game ships. */
  it("one family opens straight onto that game, never onto a list of one", () => {
    const screen = createLobbyScreen([TRUCO]);
    expect(screen.current()).toEqual({ kind: "game", family: TRUCO });
  });

  it("two families open on the list", () => {
    expect(createLobbyScreen([TRUCO, ESCOBA]).current().kind).toBe("families");
  });

  it("no families is still the list, not a crash and not a game", () => {
    expect(createLobbyScreen([]).current().kind).toBe("families");
  });

  /* ABSENT, NOT DISABLED. A control that cannot do anything should not be
   * drawn: a disabled back button on a screen with nowhere to go back to
   * tells a player they are missing something. */
  it("a single-family tenant renders no back control at all", () => {
    expect(createLobbyScreen([TRUCO]).canGoBack()).toBe(false);
  });

  it("back exists only once a game is open and there is a list to return to", () => {
    const screen = createLobbyScreen([TRUCO, ESCOBA]);
    expect(screen.canGoBack(), "on the list there is nowhere back to").toBe(false);
    screen.open("truco");
    expect(screen.canGoBack()).toBe(true);
    screen.back();
    expect(screen.current().kind).toBe("families");
  });

  /* `back` is inert rather than special-cased at the call site: the single
   * -family screen never renders the control, but nothing should break if
   * something else calls it. */
  it("back on a single-family tenant leaves the game open rather than showing an empty list", () => {
    const screen = createLobbyScreen([TRUCO]);
    screen.back();
    expect(screen.current()).toEqual({ kind: "game", family: TRUCO });
  });

  /* IGNORED MEANS THE OPEN GAME SURVIVES, which is the part worth fencing.
   *
   * Read from the list, an unknown id looks harmless either way: `current()`
   * resolves the stored id every time, so an unresolvable one already reads
   * as "no game open". My first version of this test asserted exactly that
   * and a mutation removing the guard passed it — the guard is invisible
   * unless something is ALREADY open.
   *
   * With a game open, the difference is the whole behaviour: the guard keeps
   * the player where they were, and without it a stale card id closes the
   * screen out from under them. */
  it("opening a family this tenant does not have leaves the open game exactly where it was", () => {
    const screen = createLobbyScreen([TRUCO, ESCOBA]);
    screen.open("truco");

    screen.open("generala");

    expect(screen.current(), "still on truco, not thrown back to the list").toEqual({ kind: "game", family: TRUCO });
  });

  it("and from the list, an unknown id simply leaves the list up", () => {
    const screen = createLobbyScreen([TRUCO, ESCOBA]);
    screen.open("generala");
    expect(screen.current().kind).toBe("families");
  });

  describe("affects — whether a presence broadcast has anything to repaint", () => {
    /* THE COUNT IS STILL STORED EITHER WAY; only the repaint is gated. That
     * distinction is the whole point: gating the STORE would make a player
     * open a game and see a stale number until the next broadcast. */
    it("no game open means nothing on screen to repaint", () => {
      const screen = createLobbyScreen([TRUCO, ESCOBA]);
      expect(screen.affects("truco-argentino" as GameId)).toBe(false);
    });

    it("a broadcast about the open game repaints; one about another game does not", () => {
      const screen = createLobbyScreen([TRUCO, ESCOBA]);
      screen.open("truco");

      expect(screen.affects("truco-argentino" as GameId)).toBe(true);
      expect(screen.affects("escoba-de-15" as GameId), "a different game's queue is not on this screen").toBe(false);
    });

    /* BOTH ways of playing one game count. The screen shows a card per
     * modality, so a 2v2 queue moving repaints the open truco screen even
     * though the player may be looking at the 1v1 card. */
    it("every entry of the open family counts, not just the one being looked at", () => {
      const screen = createLobbyScreen([TRUCO, ESCOBA]);
      screen.open("truco");
      expect(screen.affects("truco-argentino-2v2" as GameId)).toBe(true);
    });
  });
});
