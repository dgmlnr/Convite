import { describe, expect, it } from "vitest";
import type { Action, PlayerId } from "@hexdev/truco-engine";
import { consultLabelFor } from "./consult-control.js";
import { TABLE_STRINGS } from "./strings.js";

const ME = "yo" as PlayerId;
const consult: Action = { type: "consult-partner", playerId: ME, about: "pending-call" };
const respondTruco: Action = { type: "respond-truco", playerId: ME, response: "quiero" };
const respondEnvido: Action = { type: "respond-envido", playerId: ME, response: "quiero" };
const callEnvido: Action = { type: "call-envido", playerId: ME, level: "envido" };
const playCard: Action = { type: "play-card", playerId: ME, card: { suit: "espada", rank: 1 } };

/**
 * WHAT the question is about, read off the same list that makes it legal.
 *
 * Reported from real play: "soy pie de ronda pongo consultar al compañero
 * pero no se si le estoy consultando para cantar el envido o el truco". The
 * button is legal in two unrelated situations -- owing an answer to a pending
 * call, or being the pie who may open an envido -- and said the same thing in
 * both.
 *
 * Derived from `legalActions` rather than plumbed through as a prop, because
 * that list is what the engine already decided: a label built from it cannot
 * drift from what is actually pending.
 */
describe("consultLabelFor", () => {
  it("names the truco when a truco is the thing awaiting an answer", () => {
    expect(consultLabelFor([consult, respondTruco])).toBe(TABLE_STRINGS.consultAboutTruco);
  });

  it("names the envido when an envido is the thing awaiting an answer", () => {
    expect(consultLabelFor([consult, respondEnvido])).toBe(TABLE_STRINGS.consultAboutEnvido);
  });

  it("asks about CALLING one when the pie could open it — a different question with the same button", () => {
    expect(consultLabelFor([consult, callEnvido, playCard])).toBe(TABLE_STRINGS.consultAboutOpeningEnvido);
  });

  it("answers first when both are on the table: an unanswered call is the pressing one", () => {
    // The engine keeps envido legal over an unanswered truco, so a pie can be
    // offered both at once. What the partner is being asked is the decision
    // that is actually owed.
    expect(consultLabelFor([consult, respondTruco, callEnvido])).toBe(TABLE_STRINGS.consultAboutTruco);
  });

  it("falls back to the plain label rather than inventing a subject", () => {
    expect(consultLabelFor([consult, playCard])).toBe(TABLE_STRINGS.consultToggle);
  });
});
