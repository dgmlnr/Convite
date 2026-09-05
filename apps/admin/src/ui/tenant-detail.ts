import type { TenantStatus } from "@hexdev/platform-core";

import { formatTenantStatusLabel, toArgentineDate } from "./tenant-status.js";

/** The exact shape `tenant-handlers.ts`'s own `TenantDetailRow` serializes to
 * JSON (`GET /tenants/:id`) — origins/games arrive as the tenant's REAL
 * current lists (which MAY be empty — design §1.3/decisions #3684, "created,
 * no origin configured yet" is a legitimate state, never forced non-empty
 * here or anywhere downstream of this type), and `validUntilDisplay` is the
 * CURRENT paid-through date whenever a window's upper bound is set at all,
 * independent of `status.kind` (see `tenant-handlers.ts`'s own docstring on
 * why this cannot be recovered from `status` alone).
 *
 * Declared here (not inline in `api.ts`) even before this module grows any
 * pure mapping function of its own — mirrors `tenant-list.ts`'s own
 * established convention, where the API-row TYPE and its later
 * presentational mapping share one module, so a follow-up PR extending this
 * file with `buildTenantDetailView` (the pure view-model mapping this type
 * feeds) never has to relocate this declaration.
 */
export interface TenantDetailApiRow {
  readonly id: string;
  readonly embedKey: string;
  readonly allowedOrigins: readonly string[];
  readonly entitledGames: readonly string[];
  readonly status: TenantStatus;
  readonly validUntilDisplay?: string;
}

export interface TenantDetailView {
  readonly id: string;
  readonly embedKey: string;
  readonly statusLabel: string;
  readonly statusKind: TenantStatus["kind"];
  /** Newline-joined, for a plain `<textarea>` editor — never a forced
   * non-empty placeholder; an empty list renders as an empty field. */
  readonly originsText: string;
  readonly gamesText: string;
  /** `DD/MM/AAAA`, the SAME representation the tenant list (slice 14) already
   * renders (launch prompt §1: "the date the operator types is the date the
   * operator reads") — empty string, never `undefined`, when no window's
   * upper bound has ever been set, so a controlled `<input>` always has a
   * defined value to bind to. */
  readonly validUntilInput: string;
}

/**
 * Pure presentational mapping (same shape/purpose as `tenant-list.ts`'s own
 * `buildTenantListRows`, task 14.3's established precedent) — no fetch, no
 * rendering, no DOM: `TenantDetailScreen.tsx` only ever renders the view this
 * function already built, so the "form pre-fills with what the server
 * actually holds" property lives here, testable directly without a browser.
 */
export function buildTenantDetailView(row: TenantDetailApiRow): TenantDetailView {
  return {
    id: row.id,
    embedKey: row.embedKey,
    statusLabel: formatTenantStatusLabel(row.status),
    statusKind: row.status.kind,
    originsText: row.allowedOrigins.join("\n"),
    gamesText: row.entitledGames.join("\n"),
    validUntilInput: row.validUntilDisplay === undefined ? "" : toArgentineDate(row.validUntilDisplay),
  };
}

/**
 * The inverse of `toArgentineDate` (`tenant-status.ts`), for the window
 * editor's own submit path — `"DD/MM/AAAA"` back to the ISO `"YYYY-MM-DD"`
 * the write route accepts (`tenant-handlers.ts`'s window handler then calls
 * the REAL `paidThroughToInstant` server-side; this module never computes an
 * instant itself, only the ADMIN-LEVEL string reshaping around it — the
 * Buenos Aires timezone math stays the platform-core module's own single
 * implementation, task 15a.5's own "not a raw instant" requirement).
 * `undefined` for anything not shaped like a calendar date, so a caller can
 * refuse to submit rather than send a value the server would have to
 * itself refuse.
 */
export function argentineDateToIso(display: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (match === null) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * The origin/game editors' own shared submit-side parsing (task 15a.1-15a.4):
 * splits on newline OR comma, trims each entry, drops empties. Empty input
 * maps to an empty array — NEVER forced non-empty (design §1.3, carried
 * forward from `tenant-record-shape.ts`'s own retired docstring, PR4c): "created,
 * no origin configured yet" is a legitimate record state this function must
 * not reject.
 */
export function parseListInput(text: string): readonly string[] {
  return text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * "Ready-to-use widget consumption" (task 15b.2, design Domain F) — the
 * exact `<script>` shape `packages/widget-sdk/src/loader.ts` expects:
 * `data-embed-key` is the loader's own REQUIRED attribute
 * (`widget-config.ts:33`, `scriptTag.getAttribute("data-embed-key")`), not a
 * convention this module invents. `apps/admin` has no wired knowledge of
 * `apps/mint-server`'s own public origin (design §19's own disclosed
 * out-of-scope item — a fourth composition root, deliberately not exposed
 * to this one), so the `src` domain is an explicit, honestly-labelled
 * placeholder the operator replaces, never a fabricated real-looking URL.
 */
export function buildEmbedSnippet(embedKey: string): string {
  return `<script src="https://TU-DOMINIO-DE-CONVITE/loader.js" data-embed-key="${embedKey}"></script>`;
}
