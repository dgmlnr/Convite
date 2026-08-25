import { calculateEnvidoPoints } from "@hexdev/truco-engine";
import type { Action, PlayerView } from "@hexdev/truco-engine";

type Declare = Extract<Action, { type: "declare-envido" }>;

/**
 * WHETHER TO SAY YOUR TANTOS OR CONCEDE, for every tier.
 *
 * ONE HELPER, NOT THREE, and that is a judgement about what the tiers are
 * FOR. They differ in how they bet and how they play cards — that is where
 * "measurably different tiers" is earned. Whether to concede a declaration
 * round is arithmetic on numbers already said out loud, not a bluffing
 * surface, so three copies of it would be three places for the same rule to
 * rot rather than three difficulty levels.
 *
 * CONCEDING IS NOT PERSONAL. "Son buenas" gives the envido up for the WHOLE
 * TEAM (es.wikipedia.org's Truco article: "en caso de estar jugando en
 * parejas, al decir 'son buenas' se le da por perdido el envido a todo el
 * equipo"), so a bot that conceded whenever it could not beat the running
 * best would routinely hang its partner out — the round order alternates
 * teams, so the partner is frequently still waiting to speak.
 *
 * Hence the two conditions below. A bot concedes only when the concession
 * costs its side nothing it still had: the number in front belongs to the
 * OPPONENTS (conceding to your own partner's number would throw away a hand
 * your team is winning) AND the partner has already spoken (otherwise
 * conceding ends the round over their head). Anywhere else it says its
 * number — including a losing one, which is exactly how a real player keeps
 * the round alive for their partner.
 */
export function chooseEnvidoDeclaration(view: PlayerView, legalActions: readonly Action[]): Declare | undefined {
  const options = legalActions.filter((action): action is Declare => action.type === "declare-envido");
  if (options.length === 0) return undefined;

  const say = options.find((option) => option.declaration === "points");
  const concede = options.find((option) => option.declaration === "sonBuenas");
  if (say === undefined) return concede;
  if (concede === undefined) return say;

  const envido = view.hand?.envido;
  const declarations = envido !== undefined && envido.status === "accepted" ? envido.declarations : [];

  const mine = calculateEnvidoPoints(view.self.hand);
  const said = declarations.filter((entry) => entry.declaration === "points");
  const best = said.reduce<{ readonly points: number; readonly teamId: string } | null>(
    (leader, entry) => (leader === null || entry.points > leader.points ? { points: entry.points, teamId: entry.teamId } : leader),
    null,
  );

  if (best === null || mine > best.points) return say;
  if (best.teamId === view.self.teamId) return say; // my own side is ahead — never concede a hand we are winning
  const partnerSpoke = view.teammates.every((mate) => declarations.some((entry) => entry.playerId === mate.playerId));
  return partnerSpoke ? concede : say;
}
