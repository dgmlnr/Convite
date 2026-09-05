import { describe, expect, it } from "vitest";
import { createStaticOperatorRepository } from "./operator-repository.js";
import type { OperatorId, OperatorRecord } from "./operator-repository.js";
import { describeOperatorRepositoryContract } from "./operator-repository.contract.js";

describeOperatorRepositoryContract("static in-memory", async (seed) => createStaticOperatorRepository(seed));

describe("createStaticOperatorRepository — construction", () => {
  it("seeds every given record, findable independently by username", async () => {
    const ana: OperatorRecord = { id: "op-ana" as OperatorId, username: "ana", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", enabled: true };
    const beto: OperatorRecord = { id: "op-beto" as OperatorId, username: "beto", passwordHash: "scrypt$32768$8$1$c2FsdDI=$a2V5Mg==", enabled: false };
    const repo = createStaticOperatorRepository([ana, beto]);
    expect(await repo.findByUsername("ana")).toEqual(ana);
    expect(await repo.findByUsername("beto")).toEqual(beto);
  });
});
