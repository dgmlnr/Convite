import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * Composition-root least-privilege fence (tasks 4.12/4.13, threat matrix row
 * "Secret placement", PART 1 OF 2 — spec Domain C: "no `TenantAdminRepository`
 * instance is reachable from `mint-server`'s or `server`'s composition
 * root"). PART 2 lands in PR12 (task 10.12), which extends this EXACT test to
 * also assert no audit writer is reachable, once one exists (design §10).
 *
 * WHY A SOURCE-TEXT SCAN, NOT A `.dependency-cruiser.cjs` RULE OR A
 * `dependency-cruiser` MODULE-GRAPH CRUISE — measured, not assumed. Every
 * existing layer rule fences packages BELOW apps; `apps/**` is deliberately
 * globbed OUT of `l1-no-l2-l3`/`l2-no-l3`'s `to:` targets (design §1.6,
 * `scripts/dependency-cruiser-layer-coverage.test.ts:34`). A first attempt
 * cruised each app's own `index.ts` (the real `depcruise` CLI, the exact
 * binary `pnpm check:boundaries` runs, given a single entry file rather than
 * a whole directory so only what is ACTUALLY reachable from that entry
 * counts) and asserted no module named `tenant-admin`/
 * `postgres-tenant-admin-repository` appeared in the result. It reported a
 * FALSE POSITIVE for both apps, proven by direct inspection of the returned
 * graph: `node.ts` (design decision 1.4's shared Postgres-adapter barrel) is
 * a SINGLE file that re-exports `connectPostgres`, `createPostgresTenantRepository`
 * AND `createPostgresTenantAdminRepository` together, and dependency-cruiser's
 * reachability is FILE-level, not per-named-export — the moment `node.ts`
 * re-exports the write adapter, EVERY consumer of that barrel becomes
 * "reachable" to it whether or not it ever imports that specific name, purely
 * because ES module static analysis creates one edge per imported FILE, not
 * one per imported BINDING. This is `browser-safety.test.ts`'s own lesson
 * ("a workspace import ... resolves to the bare specifier ... so no
 * `reachable` rule can cross a package boundary here at all. A rule that
 * cannot fire is decoration.") in the OPPOSITE direction: there, a
 * dependency-cruiser rule could never fire; here, a module-graph reachability
 * check ALWAYS fires, for both a real violation and an innocent import of the
 * read adapter sitting in the same barrel — making it decoration of a
 * different kind, one that would need a permanent false-positive carve-out
 * the day a real violation needed distinguishing from the barrel's other
 * exports. What the spec's own wording actually needs checked ("no
 * `TenantAdminRepository` instance is reachable") is SYMBOL usage, not FILE
 * reachability — the identical precision `browser-safety.test.ts` already
 * reaches for with a regex over re-exported module SOURCE, rather than a
 * `reachable` dependency-cruiser rule, for its own analogous reason.
 *
 * So: scan every non-test `.ts` file under each app's own `src/` for a
 * VALUE reference to the symbols that can actually PRODUCE a
 * `TenantAdminRepository` instance — `createPostgresTenantAdminRepository`
 * (the Postgres adapter) and `createStaticTenantAdminRepository` (the
 * in-memory one used only by this port's own contract tests). A type-only
 * reference to the `TenantAdminRepository` interface itself is harmless (it
 * erases at build and constructs nothing) and is deliberately NOT matched —
 * matching it would make this fence unable to distinguish "this file can
 * build a write repository" from "this file merely names the port's type",
 * the same kind of over-firing the module-graph attempt above already
 * demonstrated in a different shape.
 *
 * PART 2 OF 2 (task 10.12, threat matrix row "Secret placement", completing
 * what this file's own header comment promised once an audit writer
 * existed): `appendAuditEntry` (`apps/admin/src/audit-log.ts`, task 10.5)
 * joins the pattern for the identical reason — it is the ONLY symbol that
 * can actually PRODUCE an `audit_entries` INSERT (`audit-log.test.ts`'s own
 * "only module issuing an INSERT" fence proves that side; this fence proves
 * mint/match's own composition roots never reach for it). Confirmed the gap
 * this extension closes, empirically, before adding it here: a temporary
 * probe `import { appendAuditEntry } ...` in `apps/server/src/index.ts`
 * passed this suite under the PRE-task-10.12 regex — the fence would have
 * stayed silently green while `check:boundaries`'s own
 * `no-admin-internals-outside-admin` rule (task 10.9) caught the identical
 * probe, meaning THIS fence alone would have been decoration for that case
 * until now.
 */
const OFFENDING_SYMBOL_PATTERN = /\b(createPostgresTenantAdminRepository|createStaticTenantAdminRepository|appendAuditEntry)\b/;

function sourceFilesUnder(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

function offendingFiles(appSrcDir: string): readonly string[] {
  return sourceFilesUnder(appSrcDir)
    .filter((file) => OFFENDING_SYMBOL_PATTERN.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(repoRoot, file));
}

describe("composition-root least privilege: the write port never reaches a read-only role's own source", () => {
  it("apps/mint-server never references a TenantAdminRepository-constructing symbol", () => {
    expect(offendingFiles(path.join(repoRoot, "apps/mint-server/src"))).toEqual([]);
  });

  it("apps/server never references a TenantAdminRepository-constructing symbol", () => {
    expect(offendingFiles(path.join(repoRoot, "apps/server/src"))).toEqual([]);
  });

  it("the fence itself can fire — a value reference to the write adapter's factory is caught (guards against a silently-vacuous regex)", () => {
    expect(OFFENDING_SYMBOL_PATTERN.test('import { createPostgresTenantAdminRepository } from "@hexdev/platform-core/node";')).toBe(true);
    expect(OFFENDING_SYMBOL_PATTERN.test('import type { TenantAdminRepository } from "@hexdev/platform-core/node";')).toBe(false);
  });

  it("apps/mint-server never references the audit writer's own producing symbol (task 10.12, part 2 of 2)", () => {
    expect(offendingFiles(path.join(repoRoot, "apps/mint-server/src"))).toEqual([]);
  });

  it("apps/server never references the audit writer's own producing symbol (task 10.12, part 2 of 2)", () => {
    expect(offendingFiles(path.join(repoRoot, "apps/server/src"))).toEqual([]);
  });

  it("the fence itself can fire for the audit writer too — a value reference to appendAuditEntry is caught", () => {
    expect(OFFENDING_SYMBOL_PATTERN.test('import { appendAuditEntry } from "../../admin/src/audit-log.js";')).toBe(true);
  });
});
