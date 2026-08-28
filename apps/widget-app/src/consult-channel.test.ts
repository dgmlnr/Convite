import { describe, expect, it } from "vitest";
import type { ConsultAskMessage } from "@hexdev/transport-colyseus-client";
import { CONSULT_IDLE, askOnView, consultOnAdvice, consultOnAsk, consultOnView, routeAction } from "./consult-channel.js";

/* The consult's client-side state, which lived unfenced inside `main.ts` until
 * the change's own verification called that out. Everything here is pure, so
 * none of it needs a socket, an iframe, or a live connection — which is most
 * of the argument for extracting it in the first place. */

describe("routeAction — which channel a press travels on", () => {
  it("sends a consult down the consult channel, an answer down the answer channel, and everything else as a move", () => {
    expect(routeAction({ type: "consult-partner", about: "pending-call" })).toBe("consult");
    expect(routeAction({ type: "consult-answer", about: "envido", answer: "quiero" })).toBe("consult-answer");
    expect(routeAction({ type: "play-card", card: { suit: "espada", rank: 1 } })).toBe("action");
  });

  /* THE TWO QUESTIONS MUST NOT COLLAPSE INTO EACH OTHER. They are opposite
   * directions on the same subject and their payloads look alike, so a router
   * that confused them would send a partner's answer out as a fresh question —
   * which spends the answerer's quota on a consult nobody asked for. */
  it("never routes an answer as a question, or a question as an answer", () => {
    expect(routeAction({ type: "consult-answer", answer: "quiero" })).not.toBe("consult");
    expect(routeAction({ type: "consult-partner" })).not.toBe("consult-answer");
  });

  /* A MOVE IS THE SAFE DEFAULT, and that is a decision worth pinning. An
   * unroutable value going out as an action reaches the engine, which rejects
   * what it does not recognise. Swallowing it here instead would lose a real
   * press silently, which is the failure nobody reports. */
  it("treats anything unrecognisable as a move rather than dropping it", () => {
    for (const odd of [null, undefined, {}, { type: "consult" }, { type: "" }, "consult-partner", 7, []]) {
      expect(routeAction(odd), `${JSON.stringify(odd) ?? "undefined"} should route as a move`).toBe("action");
    }
  });
});

describe("the consult's own little state machine", () => {
  it("asking puts the question in flight with no opinion attached", () => {
    expect(consultOnAsk()).toEqual({ advice: null, asking: true, from: null });
  });

  it("an answer lands the opinion, ends the flight, and keeps its provenance", () => {
    expect(consultOnAdvice("quiero", "partner")).toEqual({ advice: "quiero", asking: false, from: "partner" });
    expect(consultOnAdvice("no-quiero", "fallback")).toEqual({ advice: "no-quiero", asking: false, from: "fallback" });
  });

  /* VALIDATED, NOT TRUSTED. `advice` arrives off the wire. Anything that is
   * not one of the two legal words becomes an ABSENT opinion — the alternative
   * is rendering a word nobody can act on, beside a real provenance label that
   * makes it look authoritative. */
  it("a wire value that is not one of the two legal words becomes no opinion at all", () => {
    for (const junk of ["Dale", "Quiere", "quiero ", "QUIERO", "", null, undefined, 1, {}]) {
      const state = consultOnAdvice(junk, "partner");
      expect(state.advice, `${JSON.stringify(junk) ?? "undefined"} is not an opinion`).toBeNull();
      expect(state.asking, "the flight still ends — an unusable answer is still an answer arriving").toBe(false);
      expect(state.from, "and its provenance is still recorded").toBe("partner");
    }
  });

  /* THE ONE THAT IS EASY TO GET BACKWARDS, and the reason it has its own
   * fence. Opening a consult SPENDS A SEÑA, so it broadcasts a view — and that
   * view arrives while the question is still in flight. Clearing on it would
   * drop the answer before it ever landed. */
  it("a view arriving while the question is in flight does NOT clear it", () => {
    const inFlight = consultOnAsk();
    expect(consultOnView(inFlight), "the consult's own broadcast must not cancel the consult").toBe(inFlight);
  });

  it("a view arriving once nothing is in flight ends the conversation", () => {
    expect(consultOnView({ advice: "quiero", asking: false, from: "partner" })).toEqual(CONSULT_IDLE);
    expect(consultOnView(CONSULT_IDLE)).toEqual(CONSULT_IDLE);
  });
});

describe("askOnView — the partner's outstanding question, cleared on the server's word", () => {
  const ask = { about: "pending-call", options: ["quiero", "no-quiero"] } as unknown as ConsultAskMessage;

  it("keeps the ask while the server still reports a consult open", () => {
    expect(askOnView(ask, { askerSeat: 0, deadline: 1_000 })).toBe(ask);
  });

  /* KEYED OFF THE SERVER, NOT OFF A LOCAL FLAG. `pendingConsult` going away is
   * the one authoritative fact that no consult is open for ANY seat — so the
   * answer buttons vanish when the question really died, not when this client
   * happens to think it did. Loose `== null` covers both absent and null,
   * which is the difference between a redacted field and a cleared one. */
  it("drops the ask the moment the server stops reporting one, absent or null alike", () => {
    expect(askOnView(ask, null)).toBeNull();
    expect(askOnView(ask, undefined)).toBeNull();
  });

  it("stays null when there was never an ask", () => {
    expect(askOnView(null, { askerSeat: 2, deadline: 1_000 })).toBeNull();
  });
});
