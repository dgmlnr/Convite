import { describe, expect, it } from "vitest";
import { buildOperatorRows, type OperatorListApiRow } from "./operator-directory.js";

/**
 * `buildOperatorRows` (task 16a.6's own client-side hint half, design §8) —
 * pure presentational mapping, the SAME shape `tenant-detail.ts`'s own
 * `buildTenantDetailView` already establishes: no fetch, no rendering, no
 * DOM, so the "who is the sole account manager" property is testable
 * directly without a browser.
 *
 * `isSoleAccountManager` is a CLIENT-SIDE HINT ONLY (launch prompt §2): it
 * exists so `OperatorsScreen.tsx` can show the constraint BEFORE an operator
 * even attempts to trip it, never to replace the server's own
 * `withLastAccountManagerGuard` (`packages/platform-core`), which stays the
 * real gate and can still refuse a request this hint showed as safe, under
 * a genuine race between two operators.
 */
describe("buildOperatorRows", () => {
  it("maps every api row into a view row, permissions as a Set", () => {
    const rows = buildOperatorRows([{ id: "op-a", username: "ana", enabled: true, permissions: ["tenant.create"] }]);

    expect(rows).toEqual([{ id: "op-a", username: "ana", enabled: true, permissions: new Set(["tenant.create"]), isSoleAccountManager: false }]);
  });

  it("marks the SOLE enabled operators.manage holder, when exactly one exists", () => {
    const apiRows: readonly OperatorListApiRow[] = [
      { id: "op-a", username: "ana", enabled: true, permissions: ["operators.manage"] },
      { id: "op-b", username: "beto", enabled: true, permissions: ["tenant.create"] },
    ];

    const rows = buildOperatorRows(apiRows);

    expect(rows.find((row) => row.id === "op-a")?.isSoleAccountManager).toBe(true);
    expect(rows.find((row) => row.id === "op-b")?.isSoleAccountManager).toBe(false);
  });

  it("marks NEITHER row when two enabled operators both hold operators.manage", () => {
    const apiRows: readonly OperatorListApiRow[] = [
      { id: "op-a", username: "ana", enabled: true, permissions: ["operators.manage"] },
      { id: "op-b", username: "beto", enabled: true, permissions: ["operators.manage"] },
    ];

    const rows = buildOperatorRows(apiRows);

    expect(rows.every((row) => !row.isSoleAccountManager)).toBe(true);
  });

  it("never counts a DISABLED holder toward the sole-manager count — a disabled account cannot act as one regardless of what operator_permissions still holds for it", () => {
    const apiRows: readonly OperatorListApiRow[] = [
      { id: "op-disabled", username: "carla", enabled: false, permissions: ["operators.manage"] },
      { id: "op-b", username: "beto", enabled: true, permissions: ["tenant.create"] },
    ];

    const rows = buildOperatorRows(apiRows);

    expect(rows.every((row) => !row.isSoleAccountManager)).toBe(true);
  });

  it("never crashes and marks nothing when zero operators.manage holders exist", () => {
    const rows = buildOperatorRows([{ id: "op-a", username: "ana", enabled: true, permissions: [] }]);

    expect(rows[0]?.isSoleAccountManager).toBe(false);
  });
});
