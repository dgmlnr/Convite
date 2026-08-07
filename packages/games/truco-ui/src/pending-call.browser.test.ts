import { afterEach, describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { renderPendingCallBanner } from "./pending-call.js";

let container: HTMLElement;

afterEach(() => {
  container.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

const CALL = { kind: "truco" as const, levelLabel: "Truco", callingTeamId: "team-a" as TeamId };

describe("renderPendingCallBanner — the single most important thing on screen while a call is open", () => {
  it("renders nothing when there is no pending call — an empty element collapses via CSS :empty", () => {
    const el = freshContainer();

    renderPendingCallBanner(el, null);

    expect(el.children).toHaveLength(0);
    expect(el.dataset.turn).toBeUndefined();
  });

  it("shows what was called and who called it", () => {
    const el = freshContainer();

    renderPendingCallBanner(el, { call: CALL, callerLabel: "Ellos", waitingOnMe: true });

    expect(el.textContent).toContain("Truco");
    expect(el.textContent).toContain("Ellos");
  });

  it("marks 'waiting on me' distinctly from 'waiting on the opponent' via a data attribute the stylesheet keys off", () => {
    const mine = freshContainer();
    renderPendingCallBanner(mine, { call: CALL, callerLabel: "Ellos", waitingOnMe: true });
    expect(mine.dataset.turn).toBe("mine");
    expect(mine.textContent).toContain("Tu turno de responder");

    const theirs = freshContainer();
    renderPendingCallBanner(theirs, { call: CALL, callerLabel: "Nosotros", waitingOnMe: false });
    expect(theirs.dataset.turn).toBe("theirs");
    expect(theirs.textContent).toContain("Esperando al rival");
  });

  it("clears back to empty (and drops the data attribute) once the call resolves", () => {
    const el = freshContainer();
    renderPendingCallBanner(el, { call: CALL, callerLabel: "Ellos", waitingOnMe: true });

    renderPendingCallBanner(el, null);

    expect(el.children).toHaveLength(0);
    expect(el.dataset.turn).toBeUndefined();
  });

  it("is idempotent — repeated renders of the same pending call never accumulate duplicate nodes", () => {
    const el = freshContainer();

    renderPendingCallBanner(el, { call: CALL, callerLabel: "Ellos", waitingOnMe: true });
    renderPendingCallBanner(el, { call: CALL, callerLabel: "Ellos", waitingOnMe: true });

    expect(el.children).toHaveLength(3); // level, caller, turn — never duplicated
  });
});
