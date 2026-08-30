import type { HandOutcome, TeamId } from "@hexdev/escoba-engine";

/** art. 8.1 — the match is fixed at THIRTY tantos, never a `configOptions`
 * knob (`escoba/decisiones-de-producto`). A literal here, exactly like
 * `i18n.ts`'s own "Partida a 30" string (Unit M) — the view carries only the
 * running score, never this fixed target, so there is nothing to re-derive. */
const POINTS_TO_WIN = 30;

export interface TeamScore {
  readonly id: TeamId;
  readonly score: number;
}

/** Us-or-rival label, the SAME convention `truco-ui`'s scoreboard panel uses
 * (`scoreboard-panel.ts`'s `selfTeamId` comparison) — no seat-count branch,
 * so a 1v1 team of one and a 2v2 pair render through this one function. */
function teamLabel(teamId: TeamId, selfTeamId: TeamId): string {
  return teamId === selfTeamId ? "Nosotros" : "Rival";
}

/**
 * The running scoreboard (slice R1, part 1) — each TEAM's score, visible
 * during play, against the fixed target of 30. Score is real TEXT content
 * (WCAG 1.1.1/1.4.1): readable by assistive tech and never conveyed by
 * position or colour alone. Reads straight off `PlayerView.teams` — the
 * engine already keeps that current, so this never re-derives a score.
 *
 * `escobas` is `HandView.escobas` — THIS hand's escobas, per team (slice R3).
 * Optional, and omitted between hands (`PlayerView.hand` is `null` then):
 * a "0" beside a score while the closing panel below still reads "Escobas
 * Nosotros: 1" would be two different true statements that look like a
 * contradiction. During the hand it is the only place an escoba is visible at
 * all — `score` does not move until the hand closes, so the most exciting
 * thing in this game used to leave no trace on screen until it was over.
 *
 * BESIDE THE SCORE, NEVER UNDER IT. The escobas count first shipped as a
 * third line in this column, and "Escobas: 0" — the value it holds for most
 * of most hands — bought a whole row of the screen to say nothing had
 * happened yet. Sharing one row with the score costs no line when the count
 * is zero and, just as importantly, makes the first escoba of a hand change
 * a digit instead of growing the scoreboard and pushing the cards down.
 */
export function renderEscobaScoreboard(
  container: HTMLElement,
  teams: readonly TeamScore[],
  selfTeamId: TeamId,
  escobas?: Readonly<Record<TeamId, number>>,
): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-scoreboard";

  for (const team of teams) {
    const group = document.createElement("div");
    group.className = "hexdev-escoba-scoreboard-team";
    group.dataset.team = team.id;

    const label = document.createElement("span");
    label.className = "hexdev-escoba-scoreboard-label";
    label.textContent = teamLabel(team.id, selfTeamId);
    group.appendChild(label);

    // The one row the two numbers share. It exists even when there are no
    // escobas to put in it, so the row's own height is the same during a hand
    // and between hands and nothing below it ever moves.
    const tally = document.createElement("span");
    tally.className = "hexdev-escoba-scoreboard-tally";
    group.appendChild(tally);

    const score = document.createElement("span");
    score.className = "hexdev-escoba-scoreboard-score";
    score.dataset.score = String(team.score);
    score.textContent = `${String(team.score)} / ${String(POINTS_TO_WIN)}`;
    tally.appendChild(score);

    if (escobas !== undefined) {
      const made = escobas[team.id] ?? 0;
      const line = document.createElement("span");
      line.className = "hexdev-escoba-scoreboard-escobas";
      line.dataset.escobas = String(made);

      // ART. 14.1, IN THE UI'S OWN HAND: "cada escoba se marcará colocando
      // una carta boca arriba en el momento de recoger la baza". At a real
      // table an escoba is not written down — it is a card turned FACE UP in
      // the pile, and you count them by looking. That is escoba's own
      // notation, the way matchstick squares are truco's, so this draws the
      // marks rather than the sentence.
      //
      // The sentence stays anyway, clipped to nothing: a row of marks is a
      // picture of a number, and a picture-only count reads as nothing at all
      // (WCAG 1.1.1) — the same bargain `status.ts` makes for the seat counts.
      const spoken = document.createElement("span");
      spoken.className = "hexdev-escoba-escoba-count";
      spoken.textContent = `Escobas: ${String(made)}`;
      line.appendChild(spoken);

      for (let index = 0; index < made; index += 1) {
        const mark = document.createElement("span");
        mark.className = "hexdev-escoba-escoba-mark";
        mark.dataset.escobaMark = String(index);
        // Decorative: `spoken` above already says how many, and a mark that
        // announced itself would say it a second time, once per escoba.
        mark.setAttribute("aria-hidden", "true");
        line.appendChild(mark);
      }

      tally.appendChild(line);
    }

    container.appendChild(group);
  }
}

const CATEGORY_LABELS = {
  cartas: "Cartas",
  oros: "Oros",
  setenta: "La setenta",
  sieteDeOro: "Siete de oro",
} as const;

type CategoryKey = keyof typeof CATEGORY_LABELS;

function describeCategory(label: string, winner: TeamId | null, selfTeamId: TeamId): string {
  return winner === null ? `${label}: nadie` : `${label}: ${teamLabel(winner, selfTeamId)}`;
}

/** The same breakdown as ONE spoken sentence, for the `aria-live` region the
 * caller mounts once and mutates (`escoba/el-turno-no-avanzaba`'s own
 * precedent for mount-once regions; mirrors `truco-ui`'s `describeHandOutcome`).
 * Built from the exact same category/escoba/point text the visible panel
 * renders, so the two can never diverge. */
export function describeHandBreakdown(outcome: Extract<HandOutcome, { readonly decided: true }>, selfTeamId: TeamId): string {
  const { breakdown } = outcome;
  const categories = (Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => describeCategory(CATEGORY_LABELS[key], breakdown[key].winner, selfTeamId));
  const escobaEntries = Object.entries(breakdown.escobas) as [TeamId, number][];
  const escobas = escobaEntries.map(([teamId, count]) => `Escobas ${teamLabel(teamId, selfTeamId)}: ${String(count)}`);
  const points = breakdown.points[selfTeamId] ?? 0;
  return [...categories, ...escobas, `La mano valió ${String(points)} ${points === 1 ? "tanto" : "tantos"} para nosotros.`].join(". ");
}

/**
 * The hand-end breakdown (slice R1, part 2): once a hand closes, WHICH side
 * took each of the five categories, honestly including the ones nobody won
 * (art. 17.1) — a category that ties must READ as tied, not be missing.
 * `outcome === null` (hand still in progress, or no hand at all) clears the
 * panel back to empty, the same convention `truco-ui`'s transient banners use.
 */
export function renderEscobaHandBreakdown(container: HTMLElement, outcome: HandOutcome | null, selfTeamId: TeamId): void {
  container.replaceChildren();
  container.className = "hexdev-escoba-hand-breakdown";
  if (outcome === null || !outcome.decided) {
    delete container.dataset.decided;
    return;
  }
  container.dataset.decided = "true";

  const { breakdown } = outcome;
  for (const key of Object.keys(CATEGORY_LABELS) as CategoryKey[]) {
    const row = document.createElement("p");
    row.className = "hexdev-escoba-hand-breakdown-row";
    row.dataset.category = key;
    row.textContent = describeCategory(CATEGORY_LABELS[key], breakdown[key].winner, selfTeamId);
    container.appendChild(row);
  }

  for (const [teamId, count] of Object.entries(breakdown.escobas) as [TeamId, number][]) {
    const row = document.createElement("p");
    row.className = "hexdev-escoba-hand-breakdown-row";
    row.dataset.category = "escobas";
    row.dataset.team = teamId;
    row.textContent = `Escobas ${teamLabel(teamId, selfTeamId)}: ${String(count)}`;
    container.appendChild(row);
  }

  const total = document.createElement("p");
  total.className = "hexdev-escoba-hand-breakdown-total";
  const points = breakdown.points[selfTeamId] ?? 0;
  total.textContent = `La mano valió ${String(points)} ${points === 1 ? "tanto" : "tantos"} para nosotros.`;
  container.appendChild(total);
}
