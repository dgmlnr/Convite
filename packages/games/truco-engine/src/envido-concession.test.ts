import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index.js";
import { createTeamMatch, startHand } from "./match.js";
import type { Action, DealInput, MatchState, PlayerId } from "./index.js";

/**
 * SON BUENAS IS GIVING UP, so it is only offered to somebody who has
 * something to give up.
 *
 * Reported from real play: "mi compañero canto el tanto 29, el rival canto 25
 * y por mas que mi compañero va ganando, me sale el boton de son buenas".
 * The button was not merely useless there. Conceding hands the envido to the
 * OTHER team -- the engine's own note says winner-by-concession and
 * winner-by-highest "part company only if somebody concedes while their own
 * side is ahead" -- so pressing it threw away a round the partner had already
 * won.
 *
 * The decision was to stop offering the move rather than to change what it
 * means: it stays exactly as final as it was, and stays available in the one
 * situation where it says something, which is when the best number on the
 * table belongs to the rivals.
 */
const [N, E, S, W] = ["norte", "este", "sur", "oeste"].map((x) => x as PlayerId);

/** Seats 0/2 (N/S) are partners; 1/3 (E/W) are the other pair. The hands are
 * chosen for their ENVIDO points, which is the whole subject here: N holds
 * two cards of one suit for a high count, E a middling one, and the rest are
 * kept low so the running best is never in doubt. */
const DEAL: DealInput = [
  [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "basto", rank: 4 }], // norte: 33
  [{ suit: "oro", rank: 5 }, { suit: "oro", rank: 4 }, { suit: "copa", rank: 3 }], // este: 29
  [{ suit: "copa", rank: 4 }, { suit: "basto", rank: 5 }, { suit: "oro", rank: 6 }], // sur: bajo
  [{ suit: "basto", rank: 7 }, { suit: "copa", rank: 6 }, { suit: "espada", rank: 5 }], // oeste: bajo
];

function dispatch(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`fixture: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}

function declarations(state: MatchState, playerId: PlayerId): readonly string[] {
  return getLegalActions(state, playerId)
    .filter((action) => action.type === "declare-envido")
    .map((action) => (action as { readonly declaration: string }).declaration)
    .sort();
}

/** An accepted envido, ready for the declaration round. Dealer on seat 3
 * makes seat 0 the mano, so the round runs N, E, S, W — partners alternate
 * with rivals, which is what puts a player behind their own partner. */
function acceptedRound(): MatchState {
  let state = startHand(createTeamMatch({ seatOrder: [N, E, S, W], pointsToWin: 30, dealerSeat: 3 }), DEAL);
  // Seats 0, 1 and 2 play so the floor reaches seat 3, the pie who may open
  // it: opening a call follows the turn of speech, which starts at the mano.
  for (const seat of [0, 1, 2]) {
    const player = state.players[seat]!;
    state = dispatch(state, getLegalActions(state, player.id).find((action) => action.type === "play-card")!);
  }
  state = dispatch(state, { type: "call-envido", playerId: W, level: "envido" });
  return dispatch(state, { type: "respond-envido", playerId: N, response: "quiero" });
}

describe("son buenas is offered only to a player who has something to concede", () => {
  it("offers both to the first declarer — conceding before anyone has spoken really is giving up", () => {
    const state = acceptedRound();
    const mano = state.players[state.hand!.manoSeat]!;

    expect(declarations(state, mano.id)).toEqual(["points", "sonBuenas"]);
  });

  it("withholds it once the player's OWN side holds the best number on the table", () => {
    // The reported shape: the partner has said the high number, a rival has
    // said a lower one, and it comes round to a player who cannot beat their
    // own partner. Nothing here is theirs to give up.
    let state = acceptedRound();
    const order = [state.hand!.manoSeat, (state.hand!.manoSeat + 1) % 4, (state.hand!.manoSeat + 2) % 4];
    state = dispatch(state, { type: "declare-envido", playerId: state.players[order[0]!]!.id, declaration: "points" });
    state = dispatch(state, { type: "declare-envido", playerId: state.players[order[1]!]!.id, declaration: "points" });

    const behindTheirPartner = state.players[order[2]!]!;
    const best = state.hand!.envido as { readonly declarations: readonly { readonly teamId: string; readonly declaration: string; readonly points?: number }[] };
    const running = best.declarations.filter((d) => d.declaration === "points").reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a));
    expect(running.teamId, "fence setup: the running best must belong to this player's own side").toBe(behindTheirPartner.teamId);

    expect(declarations(state, behindTheirPartner.id), "the button that throws away a won envido is still there").toEqual(["points"]);
  });

  it("still offers it while the best number belongs to the rivals", () => {
    // The only situation where conceding says anything, and it stays exactly
    // as final as it was.
    let state = acceptedRound();
    const manoSeat = state.hand!.manoSeat;
    state = dispatch(state, { type: "declare-envido", playerId: state.players[manoSeat]!.id, declaration: "points" });

    const nextUp = state.players[(manoSeat + 1) % 4]!;
    const best = state.hand!.envido as { readonly declarations: readonly { readonly teamId: string }[] };
    expect(best.declarations[0]!.teamId, "fence setup: the only number said must be a rival's").not.toBe(nextUp.teamId);

    expect(declarations(state, nextUp.id)).toEqual(["points", "sonBuenas"]);
  });
});
