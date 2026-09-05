import { describe, expect, it } from "vitest";

import { argentineDateToIso, buildTenantDetailView, parseListInput, type TenantDetailApiRow } from "./tenant-detail.js";

function row(overrides: Partial<TenantDetailApiRow>): TenantDetailApiRow {
  return { id: "acme", embedKey: "pk_live_acme", allowedOrigins: [], entitledGames: [], status: { kind: "no-window" }, ...overrides };
}

describe("buildTenantDetailView", () => {
  it("joins origins/games with newlines for the free-text editors, never forcing a placeholder for an empty list", () => {
    const view = buildTenantDetailView(row({ allowedOrigins: ["https://a.example", "https://b.example"], entitledGames: [] }));
    expect(view.originsText).toBe("https://a.example\nhttps://b.example");
    // Empty is a legitimate state (design §1.3/decisions #3684, "created, no
    // origin configured yet") — an empty joined string, never a placeholder
    // sentence standing in for real data.
    expect(view.gamesText).toBe("");
  });

  it("pre-fills validUntilInput with the CURRENT paid-through date, in DD/MM/AAAA, even for an active tenant", () => {
    const view = buildTenantDetailView(row({ status: { kind: "active" }, validUntilDisplay: "2026-12-31" }));
    expect(view.validUntilInput).toBe("31/12/2026");
  });

  it("leaves validUntilInput as an empty string — never undefined — when no window was ever configured", () => {
    const view = buildTenantDetailView(row({ status: { kind: "no-window" }, validUntilDisplay: undefined }));
    expect(view.validUntilInput).toBe("");
  });

  it("labels an expired tenant using describeTenantStatus's own already-derived date, via the shared formatter", () => {
    const view = buildTenantDetailView(row({ status: { kind: "expired", expiredOn: "2026-08-09" } }));
    expect(view.statusLabel).toBe("Venció el 09/08/2026");
    expect(view.statusKind).toBe("expired");
  });
});

/**
 * `argentineDateToIso` — the submit-side inverse of `toArgentineDate`
 * (`tenant-status.ts`). Task 15a.5's own requirement: "the form must accept
 * a day and echo that same day back" — tested here at BOTH ends of a
 * calendar boundary (launch prompt §1's own warning: an off-by-one string
 * bug is the classic failure, distinct from — and this suite's job, not
 * `tenant-validity.test.ts`'s — the TIMEZONE math `paidThroughToInstant`
 * itself already owns and already tests).
 */
describe("argentineDateToIso / toArgentineDate round trip — the boundary the launch prompt warns about", () => {
  it("round-trips the last day of a month without shifting to the 29th or the 1st of the next month", () => {
    expect(argentineDateToIso("30/08/2026")).toBe("2026-08-30");
    expect(argentineDateToIso("31/12/2026")).toBe("2026-12-31");
  });

  it("round-trips the first day of a month without sliding back into the previous month", () => {
    expect(argentineDateToIso("01/01/2027")).toBe("2027-01-01");
  });

  it("round-trips a leap-year boundary (2028-02-29) exactly, neither day 28 nor March 1", () => {
    expect(argentineDateToIso("29/02/2028")).toBe("2028-02-29");
  });

  it("refuses a malformed string rather than guessing a date", () => {
    expect(argentineDateToIso("2026-08-30")).toBeUndefined();
    expect(argentineDateToIso("30/8/2026")).toBeUndefined();
    expect(argentineDateToIso("not a date")).toBeUndefined();
  });
});

describe("parseListInput", () => {
  it("accepts newline- or comma-separated entries, trimmed, never a forced non-empty result", () => {
    expect(parseListInput("https://a.example\nhttps://b.example")).toEqual(["https://a.example", "https://b.example"]);
    expect(parseListInput("truco-argentino, escoba")).toEqual(["truco-argentino", "escoba"]);
    // Empty input is legitimate (design §1.3/decisions #3684) — an empty
    // array, never an error and never a single blank-string entry.
    expect(parseListInput("")).toEqual([]);
    expect(parseListInput("   \n  ")).toEqual([]);
  });
});
