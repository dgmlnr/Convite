import type { EnvidoDeclaration, PlayerView } from "@hexdev/truco-engine";
import { TABLE_STRINGS } from "./strings.js";

/**
 * The declarations shown at THIS reveal — the point-in-time moment, never an
 * ongoing view field.
 *
 * It carries the engine's own `declarations` list unchanged rather than a
 * flattened copy: the withheld variant has no `points` key AT ALL
 * (truco-engine's `EnvidoDeclaration`, D-1), and keeping that exact union is
 * what makes a leak here a compile error instead of a runtime check someone
 * has to remember.
 */
export interface EnvidoRevealEvent {
  readonly declarations: readonly EnvidoDeclaration[];
}

/**
 * Compares two consecutive `PlayerView` snapshots and derives whether the
 * envido was shown on THIS transition.
 *
 * `previous === null` returns null, the same rule `derivePartnerSenaEvent`
 * follows and for the same reason: a fresh mount into a hand already in
 * progress — a reconnect — has no transition to report, and announcing "the
 * envido was just shown" about something that happened minutes ago would be
 * a lie about WHEN. The tantos row is already there for the what.
 *
 * No dealer-rotation check is needed here, unlike the seña case: a new deal
 * resets the envido to `none`, so the only way to reach `revealed` is the
 * transition this function is looking for. There is no ordinal that could
 * restart and read as stale.
 */
export function deriveEnvidoRevealEvent(previous: PlayerView | null, current: PlayerView): EnvidoRevealEvent | null {
  if (previous === null) return null;
  const envido = current.hand?.envido;
  if (envido === undefined || envido.status !== "revealed") return null;
  if (previous.hand?.envido.status === "revealed") return null;
  return { declarations: envido.declarations };
}

export interface EnvidoRevealNoticeProps {
  readonly declarations: readonly EnvidoDeclaration[];
  /** Turns a seat into the same Spanish speaker label the call log uses
   * ("Vos", "Rival", "Compañero", ...). Injected rather than re-derived so
   * there is exactly one owner of that convention — `call-log.ts`'s own
   * `speakerLabel`, which reads table geometry and never a player name. */
  readonly labelForSeat: (seat: number) => string;
}


/**
 * The same notice as ONE spoken sentence, for the live region `table.ts`
 * keeps mounted. Comma-joined rather than concatenated from the rendered
 * spans, the same reason `describeSenaNotice` gives: read with no separator,
 * "Vos28Rival Son buenas" is not what a reader would say.
 */
export function describeEnvidoRevealNotice(props: EnvidoRevealNoticeProps): string {
  const said = props.declarations
    .map((declaration) => `${props.labelForSeat(declaration.seat)} ${declaration.declaration === "points" ? String(declaration.points) : TABLE_STRINGS.sonBuenas}`)
    .join(", ");
  return `${TABLE_STRINGS.envidoRevealTitle}: ${said}`;
}
