import { describe, expect, it } from "vitest";
import { describeTenantStatus, type TenantId, type TenantRecord } from "@hexdev/platform-core";

import { buildTenantListRows, type TenantListApiRow } from "./tenant-list.js";

/** 2026-08-15 12:00 UTC — same fixed-clock discipline every choke point in
 * this codebase already uses, never a real timer. */
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

function tenant(overrides: Partial<TenantRecord> & Pick<TenantRecord, "id">): TenantRecord {
  return { embedKey: `pk_live_${overrides.id}`, allowedOrigins: [], entitledGames: [], ...overrides };
}

/**
 * Task 14.3 — "each row's status label matches `describeTenantStatus` for
 * all 4 cases." Built by calling the REAL `describeTenantStatus` (imported
 * from `@hexdev/platform-core`, the exact function `tenant-handlers.ts` also
 * calls server-side) against four tenant records covering the four real
 * states the domain has, then feeding its own output into
 * `buildTenantListRows` — so this test is tied to that function's actual
 * behavior, never a hand-typed guess of what it would produce.
 *
 * Genuine RED, confirmed before `tenant-list.ts` existed: `Cannot find
 * module './tenant-list.js'`. A second genuine RED followed once the module
 * existed but `formatTenantStatusLabel`'s `expired`/`not-yet-active`
 * branches read the raw ISO date instead of converting it: this test's own
 * assertion (`"Venció el 30/08/2026"`) failed for real against
 * `"Venció el 2026-08-30"` before the `DD/MM/YYYY` conversion was added.
 */
describe("buildTenantListRows", () => {
  it("labels each of the 4 real states an operator can see, using describeTenantStatus's own output", () => {
    const records: readonly TenantRecord[] = [
      tenant({ id: "acme" as TenantId }), // validUntil never set -> no-window
      tenant({ id: "beta" as TenantId, validUntil: Date.UTC(2026, 7, 10, 3, 0, 0) }), // exclusive boundary (Aug 10, BA) already past NOW -> expired, paid through 09/08
      tenant({ id: "gamma" as TenantId, validFrom: Date.UTC(2026, 8, 1, 3, 0, 0), validUntil: Date.UTC(2027, 0, 1, 3, 0, 0) }), // starts in the future -> not-yet-active
      tenant({ id: "delta" as TenantId, validUntil: Date.UTC(2027, 0, 1, 3, 0, 0) }), // covers NOW -> active
    ];
    const apiRows: readonly TenantListApiRow[] = records.map((record) => ({ id: record.id, embedKey: record.embedKey, status: describeTenantStatus(record, NOW) }));

    const rows = buildTenantListRows(apiRows);

    expect(rows.map((row) => row.statusLabel)).toEqual([
      "Sin período configurado",
      "Venció el 09/08/2026",
      "Comienza el 01/09/2026",
      "Activo",
    ]);
    expect(rows.map((row) => row.id)).toEqual(["acme", "beta", "gamma", "delta"]);
  });
});
