import { describe, expect, it } from "vitest";
import { buildAuditQueryParams, formatAuditChanges, formatAuditTarget, formatAuditTimestamp, EMPTY_AUDIT_FILTER_INPUTS, type AuditFilterInputs } from "./audit-view.js";

/**
 * `audit-view.ts` (task 16b.2) — pure functions, the same shape/purpose
 * `tenant-detail.ts`'s own `buildTenantDetailView`/`argentineDateToIso`
 * already establish: no fetch, no rendering, no DOM.
 */
describe("buildAuditQueryParams", () => {
  it("all-empty inputs produce all-undefined params — a bare GET /audit, task 16b.2's own 'no filter' shape", () => {
    expect(buildAuditQueryParams(EMPTY_AUDIT_FILTER_INPUTS)).toEqual({ actor: undefined, tenant: undefined, action: undefined, from: undefined, to: undefined });
  });

  it("trims actor/tenant, passes action through as typed", () => {
    const inputs: AuditFilterInputs = { actor: "  ana  ", tenant: " acme ", action: "permission.granted", from: "", to: "" };
    expect(buildAuditQueryParams(inputs)).toMatchObject({ actor: "ana", tenant: "acme", action: "permission.granted" });
  });

  it("converts 'from' into the start of that day, UTC midnight", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, from: "2026-08-01" };
    expect(buildAuditQueryParams(inputs).from).toBe("2026-08-01T00:00:00.000Z");
  });

  it("converts 'to' into the START OF THE NEXT DAY — the operator picks an INCLUSIVE end date, but the server's own bound is EXCLUSIVE (audit-query.ts's occurredTo, occurred_at < $n); without this conversion, entries on the picked end day would be silently excluded", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, to: "2026-08-31" };
    expect(buildAuditQueryParams(inputs).to).toBe("2026-09-01T00:00:00.000Z");
  });

  it("a 'to' date at a month/year boundary rolls over correctly", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, to: "2026-12-31" };
    expect(buildAuditQueryParams(inputs).to).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("formatAuditTimestamp", () => {
  it("formats an epoch-ms instant in Buenos Aires time, DD/MM/AAAA HH:mm", () => {
    // 2026-08-15T14:30:00Z is 2026-08-15 11:30 in America/Argentina/Buenos_Aires (UTC-3).
    const formatted = formatAuditTimestamp(Date.UTC(2026, 7, 15, 14, 30, 0));
    expect(formatted).toBe("15/08/2026 11:30");
  });
});

describe("formatAuditTarget", () => {
  it("shows the tenant id when the entry targets a tenant", () => {
    expect(formatAuditTarget({ targetTenantId: "acme" })).toBe("Inquilino: acme");
  });

  it("shows the operator id when the entry targets an operator", () => {
    expect(formatAuditTarget({ targetOperatorId: "op-1" })).toBe("Operador: op-1");
  });

  it("shows a dash when the entry targets neither (e.g. session.login/logout)", () => {
    expect(formatAuditTarget({})).toBe("—");
  });
});

describe("formatAuditChanges", () => {
  it("returns a dash when changes is absent (session.login/logout)", () => {
    expect(formatAuditChanges(undefined)).toBe("—");
  });

  it("formats one changed field as 'field: before → after'", () => {
    expect(formatAuditChanges({ validUntil: { before: null, after: "2026-08-31" } })).toBe("validUntil: null → \"2026-08-31\"");
  });

  it("formats multiple changed fields, comma-separated", () => {
    expect(formatAuditChanges({ allowedOrigins: { before: [], after: ["https://a.example"] }, entitledGames: { before: [], after: ["mahjong-solitaire"] } })).toBe(
      'allowedOrigins: [] → ["https://a.example"], entitledGames: [] → ["mahjong-solitaire"]',
    );
  });
});
