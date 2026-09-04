import { describe, expect, it } from "vitest";
import { createStaticOperatorRepository, type OperatorId, type OperatorRecord } from "@hexdev/platform-core";
import type { AuthorizedOperator } from "./authorization.js";
import { hashPassword } from "./operator-password.js";
import { createOwnPasswordHandler } from "./own-password-handler.js";

/**
 * `own-password-handler.ts` (task 11a.10-11a.11, design §6.2/§11.1) — proven
 * against the REAL static in-memory `OperatorRepository` (no fake needed:
 * `updatePassword`/`findById` are ordinary port methods, unlike
 * `disable`/`enable`) and the REAL `hashPassword`/`verifyPassword` (never a
 * mocked comparator), the same "prove the real crypto, not a stand-in"
 * discipline `operator-password.test.ts` itself already establishes.
 */
const OLD_PASSWORD = "correct horse battery staple";
const ana: OperatorRecord = { id: "op-ana" as OperatorId, username: "ana", passwordHash: hashPassword(OLD_PASSWORD), enabled: true };
const ACTOR = { id: ana.id, username: ana.username, permissions: new Set() } as unknown as AuthorizedOperator;

describe("createOwnPasswordHandler — task 11a.10-11a.11", () => {
  it("a routine password change succeeds only with the correct current password, and the OLD password no longer authenticates afterward", async () => {
    const operators = createStaticOperatorRepository([ana]);
    const handler = createOwnPasswordHandler({ operators });

    const response = await handler({ body: { currentPassword: OLD_PASSWORD, newPassword: "a brand new passphrase" } }, ACTOR);

    expect(response.status).toBe(200);
    const updated = await operators.findById(ana.id);
    expect(updated?.passwordHash).not.toBe(ana.passwordHash);
    // The real proof, not merely "the hash changed": the OLD password no
    // longer verifies, the NEW one does — via the REAL `verifyPassword`.
    const { verifyPassword } = await import("./operator-password.js");
    expect(verifyPassword(OLD_PASSWORD, updated!.passwordHash)).toBe(false);
    expect(verifyPassword("a brand new passphrase", updated!.passwordHash)).toBe(true);
  });

  it("refuses with the WRONG current password, changing nothing", async () => {
    const operators = createStaticOperatorRepository([ana]);
    const handler = createOwnPasswordHandler({ operators });

    const response = await handler({ body: { currentPassword: "not the real password", newPassword: "anything at all" } }, ACTOR);

    expect(response.status).toBe(401);
    expect((await operators.findById(ana.id))?.passwordHash).toBe(ana.passwordHash);
  });

  it("refuses a request missing either field before touching the repository", async () => {
    const operators = createStaticOperatorRepository([ana]);
    const handler = createOwnPasswordHandler({ operators });

    expect((await handler({ body: { newPassword: "only-new" } }, ACTOR)).status).toBe(400);
    expect((await handler({ body: { currentPassword: OLD_PASSWORD } }, ACTOR)).status).toBe(400);
  });
});
