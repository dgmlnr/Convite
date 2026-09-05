import { describe, expect, it } from "vitest";
import { wouldTripLastAccountManagerGuard } from "./permission-matrix.js";
import type { OperatorRow } from "./operator-directory.js";

function row(overrides: Partial<OperatorRow> = {}): OperatorRow {
  return { id: "op-a", username: "ana", enabled: true, permissions: new Set(), isSoleAccountManager: false, ...overrides };
}

/**
 * `wouldTripLastAccountManagerGuard` (task 16a.5, design §8) — the permission
 * matrix's own CLIENT-SIDE HINT half: toggling a cell always attempts the
 * real grant/revoke call (`OperatorsScreen.tsx`'s own docstring), so this
 * function only ever decides whether to short-circuit BEFORE that call for
 * the one case the server's own `withLastAccountManagerGuard` would refuse
 * anyway, letting the operator see the constraint before triggering the 409
 * rather than only after.
 */
describe("wouldTripLastAccountManagerGuard", () => {
  it("is true only for UNCHECKING operators.manage on the sole account manager's own row", () => {
    expect(wouldTripLastAccountManagerGuard(row({ isSoleAccountManager: true }), "operators.manage", false)).toBe(true);
  });

  it("is false for CHECKING operators.manage, even on the sole account manager's row — granting can only widen the holder set", () => {
    expect(wouldTripLastAccountManagerGuard(row({ isSoleAccountManager: true }), "operators.manage", true)).toBe(false);
  });

  it("is false for a DIFFERENT permission, even on the sole account manager's row — the guard only ever counts operators.manage holders", () => {
    expect(wouldTripLastAccountManagerGuard(row({ isSoleAccountManager: true }), "tenant.create", false)).toBe(false);
  });

  it("is false for unchecking operators.manage on a row that is NOT the sole account manager", () => {
    expect(wouldTripLastAccountManagerGuard(row({ isSoleAccountManager: false }), "operators.manage", false)).toBe(false);
  });
});
