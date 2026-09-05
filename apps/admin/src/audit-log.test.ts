import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OperatorId, TenantId } from "@hexdev/platform-core";
import { appendAuditEntry, type AuditEntryInput, type AuditExec } from "./audit-log.js";

/**
 * Task 10.4/10.5, design §9/§10 layer 2's own placement argument: the audit
 * port and its adapter live in `apps/admin`, not `platform-core`, precisely
 * so a mechanical scan CAN assert "no `audit_entries` INSERT exists outside
 * this one file" — the layering fence (task 10.7/10.8/10.9) only works if
 * the module sits somewhere it can enumerate. This file proves both halves:
 * the scan itself, and `appendAuditEntry`'s own row-building behavior.
 */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const OFFENDING_INSERT_PATTERN = /INSERT\s+INTO\s+audit_entries/i;

function sourceFilesUnder(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

function filesContainingAuditInsert(root: string): readonly string[] {
  return [...sourceFilesUnder(path.join(root, "packages")), ...sourceFilesUnder(path.join(root, "apps"))]
    .filter((file) => OFFENDING_INSERT_PATTERN.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));
}

describe("audit-log.ts is the ONLY module issuing an audit_entries INSERT (task 10.4, design §10 layer 2)", () => {
  it("no production .ts file outside apps/admin/src/audit-log.ts contains an audit_entries INSERT", () => {
    expect(filesContainingAuditInsert(repoRoot)).toEqual(["apps/admin/src/audit-log.ts"]);
  });
});

function capturingExec(): { readonly exec: AuditExec; readonly calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> } {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const exec: AuditExec = async (sql, values) => {
    calls.push({ sql, values });
  };
  return { exec, calls };
}

describe("appendAuditEntry", () => {
  it("issues exactly one parameterized INSERT, values in migration 004's own column order", async () => {
    const { exec, calls } = capturingExec();
    const entry: AuditEntryInput = {
      occurredAt: 1_700_000_000_000,
      actorOperatorId: "op-1" as OperatorId,
      actorUsername: "ana",
      action: "tenant.origins.updated",
      targetTenantId: "tenant-a" as TenantId,
      changes: { allowedOrigins: { before: [], after: ["https://a.example"] } },
    };

    await appendAuditEntry(exec, entry);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/INSERT INTO audit_entries/);
    expect(calls[0]!.values).toEqual([
      new Date(1_700_000_000_000),
      "op-1",
      "ana",
      "tenant.origins.updated",
      "tenant-a",
      null,
      JSON.stringify({ allowedOrigins: { before: [], after: ["https://a.example"] } }),
    ]);
  });

  it("nulls target_tenant_id/target_operator_id/changes when absent — never `undefined` (pg rejects an undefined query parameter outright)", async () => {
    const { exec, calls } = capturingExec();

    await appendAuditEntry(exec, { occurredAt: 1, actorOperatorId: "op-1" as OperatorId, actorUsername: "ana", action: "session.login" });

    expect(calls[0]!.values.slice(4)).toEqual([null, null, null]);
  });

  it("never calls Date.now() or lets the caller omit occurredAt — the timestamp is exactly the epoch-ms instant handed in, never re-derived here", async () => {
    const { exec, calls } = capturingExec();
    const fixedInstant = 1_650_000_000_000;

    await appendAuditEntry(exec, { occurredAt: fixedInstant, actorOperatorId: "op-1" as OperatorId, actorUsername: "ana", action: "session.logout" });

    expect(calls[0]!.values[0]).toEqual(new Date(fixedInstant));
  });
});
