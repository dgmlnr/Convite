import { describe, expect, it } from "vitest";
import { describeTenantStatus, instantToPaidThrough, isTenantActive, isWindowOrdered, paidThroughToInstant } from "./tenant-validity.js";
import type { TenantId } from "./tenant-auth.js";

const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;

/**
 * Unit tests for the pure validity module (tenant-administration slice 5,
 * design §2.4). No `Clock` object is threaded through here — `now` arrives
 * as a plain epoch-ms argument, exactly as `isTenantActive`'s own signature
 * demands, so a test "travels in time" simply by passing a different number,
 * with no fake timers and no mutable clock stub anywhere in this file.
 */
describe("isTenantActive", () => {
  it("treats a tenant whose validUntil was never set as inactive (design §1.3: zero window configured = inactive)", () => {
    const tenant = { validFrom: undefined, validUntil: undefined };
    expect(isTenantActive(tenant, Date.now())).toBe(false);
  });

  it("treats a tenant with a future validUntil and no validFrom as active (validFrom absent fails OPEN, not closed)", () => {
    const now = 1_700_000_000_000;
    const tenant = { validFrom: undefined, validUntil: now + 1_000 };
    expect(isTenantActive(tenant, now)).toBe(true);
  });

  it("refuses a tenant before its validFrom, even with a validUntil far in the future", () => {
    const now = 1_700_000_000_000;
    const tenant = { validFrom: now + 1_000, validUntil: now + 100_000 };
    expect(isTenantActive(tenant, now)).toBe(false);
  });

  it("accepts a tenant strictly between validFrom and validUntil", () => {
    const now = 1_700_000_000_000;
    const tenant = { validFrom: now - 1_000, validUntil: now + 1_000 };
    expect(isTenantActive(tenant, now)).toBe(true);
  });

  it("refuses a tenant exactly at validUntil — the upper bound is EXCLUSIVE (half-open window)", () => {
    const validUntil = 1_700_000_000_000;
    const tenant = { validFrom: undefined, validUntil };
    expect(isTenantActive(tenant, validUntil)).toBe(false);
  });
});

/**
 * `paidThroughToInstant` interprets an operator-typed "paid until" calendar
 * date as the EXCLUSIVE start of the next Buenos Aires day (design §1.2/§2.4)
 * — never as `23:59:59` of the given date, which leaves a 999ms dead zone
 * where neither `<=` nor `<` reads correctly. These two tests pin the exact
 * scenario decisions #3684 item 1 and design §2.4 both name explicitly: the
 * last paid day still works late in the evening, and the very first minute
 * of the following day does not.
 */
describe("paidThroughToInstant + isTenantActive — the Buenos Aires day boundary", () => {
  it("keeps a tenant valid at 22:00 Buenos Aires time on its last paid day", () => {
    const validUntil = paidThroughToInstant("2026-08-30");
    const tenant = { validFrom: undefined, validUntil };
    // 22:00 on the 30th is 2 hours before the exclusive boundary (midnight
    // BA on the 31st), regardless of what that boundary's own UTC offset is.
    const twentyTwoHundredOnThe30th = validUntil - 2 * HOUR_MS;
    expect(isTenantActive(tenant, twentyTwoHundredOnThe30th)).toBe(true);
  });

  it("refuses the same tenant at 00:01 Buenos Aires time on the following day", () => {
    const validUntil = paidThroughToInstant("2026-08-30");
    const tenant = { validFrom: undefined, validUntil };
    const zeroZeroOneOnThe31st = validUntil + MINUTE_MS;
    expect(isTenantActive(tenant, zeroZeroOneOnThe31st)).toBe(false);
  });
});

describe("instantToPaidThrough — the inverse of paidThroughToInstant", () => {
  it("round-trips an ordinary date", () => {
    expect(instantToPaidThrough(paidThroughToInstant("2026-08-30"))).toBe("2026-08-30");
  });

  it("round-trips a date that rolls the calendar into the next month, proving the day arithmetic is not hardcoded to 30/31", () => {
    expect(instantToPaidThrough(paidThroughToInstant("2026-08-31"))).toBe("2026-08-31");
  });
});

/**
 * `describeTenantStatus` is the operator-facing read of a tenant's window
 * (design §1.9): the panel derives a status from the record through `Clock`
 * rather than reading any persisted refusal telemetry (Domain D's boundary —
 * mint/match never write here). Each branch mirrors `isTenantActive`'s own
 * three checks exactly, so the two functions can never quietly disagree
 * about whether a tenant is currently active.
 */
describe("describeTenantStatus", () => {
  const baseTenant = {
    id: "tenant-status" as TenantId,
    embedKey: "pk_live_status",
    allowedOrigins: [],
    entitledGames: [],
  };

  it('renders "no-window" for a freshly created tenant with no validUntil ever set', () => {
    const tenant = { ...baseTenant, validFrom: undefined, validUntil: undefined };
    expect(describeTenantStatus(tenant, Date.now())).toEqual({ kind: "no-window" });
  });

  it('renders "expired" with the last paid Buenos Aires day once validUntil has passed', () => {
    const validUntil = paidThroughToInstant("2026-08-30");
    const tenant = { ...baseTenant, validFrom: undefined, validUntil };
    const oneMinuteAfterExpiry = validUntil + MINUTE_MS;
    expect(describeTenantStatus(tenant, oneMinuteAfterExpiry)).toEqual({ kind: "expired", expiredOn: "2026-08-30" });
  });

  it('renders "not-yet-active" with the Buenos Aires start date for a pre-sold tenant', () => {
    // `validFrom` is INCLUSIVE (unlike `validUntil`), so this fixture reuses
    // `paidThroughToInstant` purely to obtain an exact Buenos-Aires-midnight
    // instant — "2026-08-30" yields midnight BA starting 2026-08-31 — and the
    // expected rendered date is that same calendar day, straight, with no
    // exclusive-boundary adjustment.
    const validFrom = paidThroughToInstant("2026-08-30");
    const tenant = { ...baseTenant, validFrom, validUntil: validFrom + 30 * 24 * HOUR_MS };
    const oneHourBeforeStart = validFrom - HOUR_MS;
    expect(describeTenantStatus(tenant, oneHourBeforeStart)).toEqual({ kind: "not-yet-active", startsOn: "2026-08-31" });
  });

  it('renders "active" for a tenant currently inside its window', () => {
    const now = 1_700_000_000_000;
    const tenant = { ...baseTenant, validFrom: now - HOUR_MS, validUntil: now + HOUR_MS };
    expect(describeTenantStatus(tenant, now)).toEqual({ kind: "active" });
  });
});

describe("isWindowOrdered — the pure predicate behind migration 002's tenants_window_ordered CHECK", () => {
  it("accepts a window with either bound unset — nothing to compare", () => {
    expect(isWindowOrdered({})).toBe(true);
    expect(isWindowOrdered({ validFrom: 1_700_000_000_000 })).toBe(true);
    expect(isWindowOrdered({ validUntil: 1_700_000_000_000 })).toBe(true);
  });

  it("rejects a validFrom that is not strictly before validUntil", () => {
    expect(isWindowOrdered({ validFrom: 1_700_100_000_000, validUntil: 1_700_000_000_000 })).toBe(false);
    expect(isWindowOrdered({ validFrom: 1_700_000_000_000, validUntil: 1_700_000_000_000 })).toBe(false);
    expect(isWindowOrdered({ validFrom: 1_700_000_000_000, validUntil: 1_700_100_000_000 })).toBe(true);
  });
});
