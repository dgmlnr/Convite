import type { GameId } from "@hexdev/platform-contract";
import type { ThemeContrastViolation, ThemeOverride } from "@hexdev/widget-protocol";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import { sanitizeTenantTheme } from "./tenant-theme.js";

/**
 * Everything a `create` needs to hand in — the same five fields `TenantRecord`
 * carries today, none of which is `validFrom`/`validUntil`: those land on
 * `TenantRecord` in slice 5 (design §2.2/task 5.8), once migration 002 gives
 * them a column to round-trip through. See this file's own closing note for
 * why `setValidityWindow` itself is deferred whole, not merely its fields.
 */
export type TenantDraft = Pick<TenantRecord, "id" | "embedKey" | "allowedOrigins" | "entitledGames" | "theme">;

/**
 * Discriminated result (design §2.3 point 1), mirroring `EmbedMintResult`'s
 * own shape on purpose — continuity over invention, same discipline
 * `tenant-repository.contract.ts`'s docstring already names. A duplicate key
 * is expected FORM INPUT, not a server fault: the panel this eventually
 * serves (slice 14+) must render "that is taken," never a 500. Boot failures
 * (an unreachable database) still throw — this type only covers the shape of
 * a well-formed request the datastore itself refuses.
 *
 * `themeViolations` rides back on the SUCCESS branch (design §2.3 point 3):
 * `validateThemeContrast` already computes them and
 * `describeThemeContrastViolation` already renders a sentence for one, but
 * today (`createStaticTenantRepository`) they only ever reach a server log an
 * operator's browser never sees. The write port hands them back on the same
 * response the caller already has to read, so a future admin panel can show
 * "saved, but this colour was too dark and was dropped" in one round trip
 * instead of a second polling read.
 */
export type TenantWriteResult =
  | { readonly ok: true; readonly tenant: TenantRecord; readonly themeViolations: readonly ThemeContrastViolation[] }
  | { readonly ok: false; readonly reason: "tenant-id-taken" | "embed-key-taken" | "unknown-tenant" };

/**
 * A unit of work meant to run ATOMICALLY alongside the write it accompanies
 * (design §2.3 point 4) — declared here so a mutation and its audit record
 * can never be pulled apart by a caller that forgets to pass one, but
 * DEFINED elsewhere (`apps/admin`, slice 10) so `platform-core` never learns
 * the `audit_entries` schema and neither `mint-server` nor `server` ever
 * links the writer that produces it (design §10's boundary). `exec` is
 * deliberately pg-free — a narrow structural callback type, not `PoolClient`
 * — so this file's own `no-pg-outside-platform-core` exemption never has to
 * widen to cover a caller-supplied audit implementation living in a
 * different app entirely.
 *
 * NOT WIRED TO A REAL TRANSACTION YET. Both adapters below call `w` with a
 * NO-OP `exec` (`NOOP_EXEC`) — see each adapter's own comment. The tasks
 * artifact's own §0.5 states this explicitly: task 4.2 lands this type as
 * NON-OPTIONAL on every mutating method so nothing can be written without a
 * witness in hand, and task 4.11 wires the CALL against a no-op stand-in;
 * the REAL transactional coupling — the audit INSERT running inside the
 * mutation's own transaction, so a throwing witness rolls the mutation back
 * — lands in PR12 (task 10.6), six PRs later, once `apps/admin` exists to
 * define what `exec` actually runs. Finishing that wiring here would pull
 * the `audit_entries` schema and its Postgres privilege grants into the
 * tenant-WRITE PR, which is the wrong PR to review either in.
 */
export type WriteWitness = (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>;

/** The no-op `exec` both adapters (this file's static one, and
 * `postgres-tenant-admin-repository.ts`'s Postgres one) pass to `w` in this
 * slice — see `WriteWitness`'s own docstring for why a real one waits for
 * PR12. Exported so both adapters share the identical stand-in rather than
 * each re-declaring their own `async () => {}`. */
export const NOOP_EXEC: (sql: string, values: readonly unknown[]) => Promise<void> = async () => {};

/**
 * Write port (design §2.3, decision 4): every tenant MUTATION lives here,
 * `TenantRepository` stays read-only, and only `apps/admin`'s composition
 * root may hold credentials that construct an implementation of this
 * interface — enforced today by `scripts/composition-root-least-privilege.test.ts`
 * (tasks 4.12/4.13), which proves neither `mint-server` nor `server` can
 * reach one through their own dependency graph.
 *
 * SEVEN METHODS, not eight. Design §2.3's own interface sketch also lists
 * `setValidityWindow`; it is deliberately ABSENT here. Task 4.2's own count
 * ("7 methods") only reconciles with task 4.7's four-method list ("land
 * rotateEmbedKey, updateAllowedOrigins, updateEntitledGames,
 * setValidityWindow") if exactly one of those four does not actually land as
 * a real, adapter-backed method in THIS slice — and `setValidityWindow` is
 * the one task 4.7 itself flags with "(window field completion in slice
 * 5)". `TenantRecord` has no `validFrom`/`validUntil` until task 5.8, and
 * `migrations/002_*.sql` (the columns themselves) is task 5.7 — landing a
 * `setValidityWindow` body today would mean either running `UPDATE tenants
 * SET valid_from = ...` against columns that do not exist yet (a guaranteed
 * `42703 undefined_column` the moment anything ever called it, since nothing
 * calls it before `apps/admin` exists in slice 7 anyway) or returning
 * `ok:true` without persisting anything — silently lying to a future caller
 * about what "saved" means. Both are worse than deferring the whole method,
 * interface member included, to slice 5's own task 5.9/5.10, alongside the
 * `TenantRecord` field and migration it depends on — the same "land the
 * type, wire the real thing later" shape this file's own `WriteWitness`
 * already uses for the audit back-edge, just one slice sooner.
 */
export interface TenantAdminRepository {
  list(): Promise<readonly TenantRecord[]>;
  findById(id: TenantId): Promise<TenantRecord | undefined>;
  create(draft: TenantDraft, w: WriteWitness): Promise<TenantWriteResult>;
  updateAllowedOrigins(id: TenantId, origins: readonly string[], w: WriteWitness): Promise<TenantWriteResult>;
  updateEntitledGames(id: TenantId, games: readonly GameId[], w: WriteWitness): Promise<TenantWriteResult>;
  updateTheme(id: TenantId, theme: ThemeOverride | undefined, w: WriteWitness): Promise<TenantWriteResult>;
  rotateEmbedKey(id: TenantId, embedKey: string, w: WriteWitness): Promise<TenantWriteResult>;
}

/**
 * In-memory `TenantAdminRepository`, the write-side sibling of
 * `createStaticTenantRepository`. Used by the shared contract
 * (`tenant-admin.contract.ts`) as the fast, Docker-free adapter under
 * `pnpm test`, exactly the role the static read adapter already plays for
 * `TenantRepository`'s own contract. `allowedOrigins`/`entitledGames` are
 * accepted AS GIVEN, including empty — a created-but-unconfigured tenant and
 * one whose entitlements lapsed are both legitimate record states (design
 * §1.3, carried forward from `tenant-record-shape.ts`'s own retired
 * docstring, PR4c), never forced non-empty here.
 */
export function createStaticTenantAdminRepository(initial: readonly TenantRecord[]): TenantAdminRepository {
  const byId = new Map(initial.map((tenant) => [tenant.id, tenant]));
  const byEmbedKey = new Map(initial.map((tenant) => [tenant.embedKey, tenant]));

  function store(tenant: TenantRecord): void {
    byId.set(tenant.id, tenant);
    byEmbedKey.set(tenant.embedKey, tenant);
  }

  return {
    async list() {
      return [...byId.values()];
    },
    async findById(id) {
      return byId.get(id);
    },
    async create(draft, w) {
      if (byId.has(draft.id)) return { ok: false, reason: "tenant-id-taken" };
      if (byEmbedKey.has(draft.embedKey)) return { ok: false, reason: "embed-key-taken" };
      const { theme, violations } = sanitizeTenantTheme(draft.theme);
      const tenant: TenantRecord = { ...draft, theme };
      store(tenant);
      await w(NOOP_EXEC);
      return { ok: true, tenant, themeViolations: violations };
    },
    async updateAllowedOrigins(id, allowedOrigins, w) {
      const existing = byId.get(id);
      if (existing === undefined) return { ok: false, reason: "unknown-tenant" };
      const tenant: TenantRecord = { ...existing, allowedOrigins };
      store(tenant);
      await w(NOOP_EXEC);
      return { ok: true, tenant, themeViolations: [] };
    },
    async updateEntitledGames(id, entitledGames, w) {
      const existing = byId.get(id);
      if (existing === undefined) return { ok: false, reason: "unknown-tenant" };
      const tenant: TenantRecord = { ...existing, entitledGames };
      store(tenant);
      await w(NOOP_EXEC);
      return { ok: true, tenant, themeViolations: [] };
    },
    async updateTheme(id, theme, w) {
      const existing = byId.get(id);
      if (existing === undefined) return { ok: false, reason: "unknown-tenant" };
      const { theme: sanitized, violations } = sanitizeTenantTheme(theme);
      const tenant: TenantRecord = { ...existing, theme: sanitized };
      store(tenant);
      await w(NOOP_EXEC);
      return { ok: true, tenant, themeViolations: violations };
    },
    async rotateEmbedKey(id, embedKey, w) {
      const existing = byId.get(id);
      if (existing === undefined) return { ok: false, reason: "unknown-tenant" };
      if (byEmbedKey.has(embedKey) && byEmbedKey.get(embedKey) !== existing) return { ok: false, reason: "embed-key-taken" };
      byEmbedKey.delete(existing.embedKey);
      const tenant: TenantRecord = { ...existing, embedKey };
      store(tenant);
      await w(NOOP_EXEC);
      return { ok: true, tenant, themeViolations: [] };
    },
  };
}
