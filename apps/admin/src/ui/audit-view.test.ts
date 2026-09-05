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

  /**
   * sdd-verify finding 5, closed here: this filter USED TO emit UTC-day
   * boundaries (`${from}T00:00:00.000Z`) while `formatAuditTimestamp` below
   * renders in Buenos Aires time — a 3-hour skew between what the operator
   * READS and what the filter actually MATCHES. Buenos Aires has been UTC-3
   * with no DST since 2009 (`formatAuditTimestamp`'s own test below), so
   * "start of 2026-08-01 in Buenos Aires" is `2026-08-01T03:00:00.000Z`, not
   * UTC midnight. `paidThroughToInstant` (`@hexdev/platform-core`, already
   * exported from tenant-administration slice 5) is the ONE place this
   * repo does a Buenos-Aires-day-boundary conversion — this filter now uses
   * it directly for `to`, and for `precedingIsoDate(from)` to get the SAME
   * boundary one calendar day earlier, rather than writing a second
   * timezone conversion of its own.
   */
  it("converts 'from' into the start of that day IN BUENOS AIRES, not UTC midnight", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, from: "2026-08-01" };
    expect(buildAuditQueryParams(inputs).from).toBe("2026-08-01T03:00:00.000Z");
  });

  it("converts 'to' into the START OF THE NEXT DAY IN BUENOS AIRES — the operator picks an INCLUSIVE end date, but the server's own bound is EXCLUSIVE (audit-query.ts's occurredTo, occurred_at < $n); without this conversion, entries on the picked end day would be silently excluded", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, to: "2026-08-31" };
    expect(buildAuditQueryParams(inputs).to).toBe("2026-09-01T03:00:00.000Z");
  });

  it("a 'to' date at a month/year boundary rolls over correctly, still in Buenos Aires time", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, to: "2026-12-31" };
    expect(buildAuditQueryParams(inputs).to).toBe("2027-01-01T03:00:00.000Z");
  });

  it("a 'from' date at a month/year boundary rolls BACKWARD correctly (precedingIsoDate crossing into the prior year)", () => {
    const inputs: AuditFilterInputs = { ...EMPTY_AUDIT_FILTER_INPUTS, from: "2027-01-01" };
    expect(buildAuditQueryParams(inputs).from).toBe("2027-01-01T03:00:00.000Z");
  });

  /** THE EXACT SCENARIO the finding names: an entry at 22:00 Buenos Aires
   * time on the 3rd renders as the 3rd (`formatAuditTimestamp`) and must
   * ALSO be matched by a filter for the 3rd, not silently pushed into a
   * "4th" UTC-day bucket it never visually belongs to. */
  it("an entry at 22:00 Buenos Aires time on the 3rd is both rendered AND filtered as the 3rd, closing the 3-hour skew", () => {
    const occurredAt = Date.UTC(2026, 7, 4, 1, 0, 0); // 2026-08-03 22:00 in America/Argentina/Buenos_Aires
    expect(formatAuditTimestamp(occurredAt)).toBe("03/08/2026 22:00");

    const filterForThe3rd = buildAuditQueryParams({ ...EMPTY_AUDIT_FILTER_INPUTS, from: "2026-08-03", to: "2026-08-03" });
    expect(occurredAt).toBeGreaterThanOrEqual(new Date(filterForThe3rd.from!).getTime());
    expect(occurredAt).toBeLessThan(new Date(filterForThe3rd.to!).getTime());
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
