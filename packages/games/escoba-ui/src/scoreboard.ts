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
 */
export function renderEscobaScoreboard(container: HTMLElement, teams: readonly TeamScore[], selfTeamId: TeamId): void {
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

    const score = document.createElement("span");
    score.className = "hexdev-escoba-scoreboard-score";
    score.dataset.score = String(team.score);
    score.textContent = `${String(team.score)} / ${String(POINTS_TO_WIN)}`;
    group.appendChild(score);

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
