import { describe, expect, it } from "vitest";
import { createStaticOperatorSessionRepository } from "./operator-session-repository.js";
import type { OperatorId } from "./operator-repository.js";
import type { OperatorSessionRecord } from "./operator-session-repository.js";
import { describeOperatorSessionRepositoryContract } from "./operator-session-repository.contract.js";

describeOperatorSessionRepositoryContract("static in-memory", async (seed) => createStaticOperatorSessionRepository(seed));

describe("createStaticOperatorSessionRepository — construction", () => {
  it("seeds every given record, findable independently by token hash", async () => {
    const a: OperatorSessionRecord = { tokenHash: "a".repeat(64), operatorId: "op-a" as OperatorId, createdAt: 0, expiresAt: 28_800_000 };
    const b: OperatorSessionRecord = { tokenHash: "b".repeat(64), operatorId: "op-b" as OperatorId, createdAt: 0, expiresAt: 28_800_000 };
    const repo = createStaticOperatorSessionRepository([a, b]);
    expect(await repo.findByTokenHash(a.tokenHash)).toEqual(a);
    expect(await repo.findByTokenHash(b.tokenHash)).toEqual(b);
  });

  it("defaults to empty when no seed is given", async () => {
    const repo = createStaticOperatorSessionRepository();
    expect(await repo.findByTokenHash("anything")).toBeUndefined();
  });
});
