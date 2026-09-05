import type { Permission } from "../permissions.js";
import type { OperatorRow } from "./operator-directory.js";

/**
 * Task 16a.5/design §8: whether a specific permission-matrix cell toggle
 * should be short-circuited CLIENT-SIDE before even attempting the real
 * `POST /operators/:id/permissions/grant|revoke` call — ONLY for the exact
 * case the server's own `withLastAccountManagerGuard`
 * (`@hexdev/platform-core`) would refuse anyway: un-ticking `operators.manage`
 * on the row that is the SOLE enabled holder (`operator-directory.ts`'s own
 * `isSoleAccountManager`, computed from the SAME `GET /operators` response
 * this screen already holds).
 *
 * THIS IS A HINT, NOT THE GATE (launch prompt §2). Every OTHER cell always
 * attempts the real call and lets the server's own 409/404 decide, because
 * only the guard's own post-mutation count query — run inside its
 * transaction, under its advisory lock — knows the true state under
 * concurrency: two operators could each fetch a `false` hint and still race
 * into the exact case this function names, which is why
 * `OperatorsScreen.tsx` still handles a `last-account-manager` 409 from the
 * real call regardless of what this function returned beforehand.
 */
export function wouldTripLastAccountManagerGuard(row: Pick<OperatorRow, "isSoleAccountManager">, permission: Permission, nextChecked: boolean): boolean {
  return permission === "operators.manage" && row.isSoleAccountManager && !nextChecked;
}
