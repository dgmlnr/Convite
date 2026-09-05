import { describe, expect, it } from "vitest";
import { createStaticTenantAdminRepository } from "./tenant-admin.js";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import { describeTenantAdminRepositoryContract } from "./tenant-admin.contract.js";

describeTenantAdminRepositoryContract("static in-memory", async (seed) => createStaticTenantAdminRepository(seed));

describe("createStaticTenantAdminRepository — list()", () => {
  it("returns every seeded tenant, and reflects a later create", async () => {
    const tenantA: TenantRecord = { id: "tenant-a" as TenantId, embedKey: "pk_live_list_a", allowedOrigins: [], entitledGames: [] };
    const repo = createStaticTenantAdminRepository([tenantA]);
    expect(await repo.list()).toEqual([tenantA]);

    const draft = { id: "tenant-b" as TenantId, embedKey: "pk_live_list_b", allowedOrigins: [], entitledGames: [] };
    await repo.create(draft, async (exec) => exec("x", []));
    expect(await repo.list()).toEqual([tenantA, draft]);
  });
});
