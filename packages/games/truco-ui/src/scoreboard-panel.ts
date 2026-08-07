import type { TeamId } from "@hexdev/truco-engine";
import { renderScoreboard } from "./scoreboard.js";
import { TABLE_STRINGS } from "./strings.js";

export interface ScoreboardPanelOptions {
  readonly teams: readonly { readonly id: TeamId; readonly score: number }[];
  readonly selfTeamId: TeamId;
  readonly target: 15 | 30;
}

/**
 * The tanteador's own home — a piece of chrome, not felt. At a real table
 * the scoreboard sits BESIDE the play, not inside it; this is the single
 * place that composition happens, so `table.ts` mounts it as a sibling of
 * the felt `.hexdev-truco-table`, never a child. Hybrid theming by zone
 * (design §10, obs 2955): this panel is chrome, so its own background/label
 * colour may take the tenant's brand tokens — only the matchstick
 * wood/head/ghost tones (drawn inside `renderScoreboard`) keep truco's own
 * fixed identity.
 */
export function renderScoreboardPanel(container: HTMLElement, options: ScoreboardPanelOptions): void {
  container.replaceChildren();
  container.className = "hexdev-truco-scoreboard-panel";

  for (const team of options.teams) {
    const board = container.appendChild(document.createElement("div"));
    board.className = "hexdev-truco-scoreboard-group";

    const label = document.createElement("span");
    label.className = "hexdev-truco-team-label";
    label.textContent = team.id === options.selfTeamId ? TABLE_STRINGS.us : TABLE_STRINGS.them;
    board.appendChild(label);

    renderScoreboard(board.appendChild(document.createElement("div")), { score: team.score, target: options.target });
  }
}
