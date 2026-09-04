import type { TenantRecord } from "./tenant-auth.js";

/**
 * Pure validity-window module (tenant-administration slice 5, design §2.4).
 * Every choke point that will consume this (slice 6: `mintSessionForEmbed`,
 * `renewSessionForWidget`, `MatchRoom.onAuth`) already receives "now" the
 * same way `rate-limiter.ts`/`presence.ts` inject `Clock` — as a plain
 * `() => number` — so this module keeps that same shape but one level more
 * direct: `now: number` is the ALREADY-CALLED clock value, not the port
 * itself, because every function here is pure and a caller holding a
 * `Clock` calls it once per invocation rather than threading the whole port
 * through domain logic that has no other use for it. A test therefore
 * "travels in time" by passing a different `now`, with no fake timers.
 */

/**
 * Whether a tenant is inside its paid validity window `[validFrom, validUntil)`
 * at the given instant.
 *
 * The two bounds are DELIBERATELY ASYMMETRIC (decisions #3684 item 1, design
 * §1.1): an unset `validUntil` fails CLOSED — the tenant is inactive — while
 * an unset `validFrom` fails OPEN — no lower bound at all. This is not an
 * oversight to "fix" into symmetry: an absent lower bound cannot grant unpaid
 * access, because `validUntil` still gates it on its own; an absent upper
 * bound would grant exactly that. `validFrom` stays optional because
 * pre-selling (configuring a tenant before its paid period starts) is a real
 * operator workflow, and `validUntil` is what makes "zero window configured =
 * inactive" (design §1.3) hold for a freshly created tenant regardless of
 * `validFrom`.
 *
 * The upper bound is checked with `>=`, not `>`: `validUntil` is stored as
 * the EXCLUSIVE start of the next Buenos Aires day (`paidThroughToInstant`
 * below), so the half-open interval `[validFrom, validUntil)` requires the
 * comparison to exclude the boundary itself, or the tenant would gain one
 * extra millisecond of access past its own stored boundary.
 */
export function isTenantActive(tenant: Pick<TenantRecord, "validFrom" | "validUntil">, now: number): boolean {
  if (tenant.validUntil === undefined) return false;
  if (now >= tenant.validUntil) return false;
  if (tenant.validFrom !== undefined && now < tenant.validFrom) return false;
  return true;
}

const BUENOS_AIRES_TIME_ZONE = "America/Argentina/Buenos_Aires";

const ZONED_INSTANT_PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BUENOS_AIRES_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function readZonedParts(instant: number): ZonedParts {
  const parts = ZONED_INSTANT_PARTS_FORMAT.formatToParts(instant);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    second: Number(byType.get("second")),
  };
}

/**
 * Converts a wall-clock date/time meant to be read IN `BUENOS_AIRES_TIME_ZONE`
 * into the UTC epoch-ms instant it denotes — WITHOUT ever hardcoding that
 * zone's offset (decisions #3684 item 1, design §2.4: "DO NOT hardcode
 * UTC−03:00 even though Argentina has had no DST since 2009 — that is
 * precisely the assumption that rots"). Standard two-pass technique for
 * `Intl.DateTimeFormat`-only environments (no `Temporal` yet in this repo's
 * Node baseline): first treat the wall-clock fields AS IF they were UTC to
 * get an approximate instant, then ask `Intl.DateTimeFormat` what that
 * approximate instant reads as IN the target zone — the difference between
 * the two is the zone's actual offset at that moment, whatever a future
 * rule change makes it, applied back to correct the approximation.
 */
function zonedWallClockToInstant(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const zonedReadingOfThatInstant = readZonedParts(asIfUtc);
  const zonedReadingAsIfUtc = Date.UTC(
    zonedReadingOfThatInstant.year,
    zonedReadingOfThatInstant.month - 1,
    zonedReadingOfThatInstant.day,
    zonedReadingOfThatInstant.hour,
    zonedReadingOfThatInstant.minute,
    zonedReadingOfThatInstant.second,
  );
  const zoneOffsetMs = zonedReadingAsIfUtc - asIfUtc;
  return asIfUtc - zoneOffsetMs;
}

function parseIsoDate(isoDate: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) throw new Error(`paidThroughToInstant expects "YYYY-MM-DD", got: ${isoDate}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * "Paid through 2026-08-30" MUST be stored as the EXCLUSIVE start of the next
 * Buenos Aires calendar day (decisions #3684 item 1, design §1.2) — a
 * `23:59:59` encoding leaves a 999ms dead zone where a tenant is neither in
 * nor out, and invites an ongoing `<=`-vs-`<` bikeshed at every comparison
 * site. Half-open is exact and needs exactly one comparison operator
 * (`isTenantActive`'s `>=`), everywhere.
 */
export function paidThroughToInstant(isoDate: string): number {
  const { year, month, day } = parseIsoDate(isoDate);
  // Adding a day to a plain Y/M/D triple via `Date.UTC` is ordinary calendar
  // arithmetic (JS normalizes day-31-of-a-30-day-month into the next month
  // automatically) — no timezone is involved in this step at all, only in
  // `zonedWallClockToInstant` below.
  const nextDayUtcMs = Date.UTC(year, month - 1, day + 1);
  const nextDay = readUtcCalendarParts(nextDayUtcMs);
  return zonedWallClockToInstant(nextDay.year, nextDay.month, nextDay.day, 0, 0, 0);
}

function readUtcCalendarParts(utcMs: number): { readonly year: number; readonly month: number; readonly day: number } {
  const date = new Date(utcMs);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * The inverse of `paidThroughToInstant`: given the exclusive-boundary instant
 * it produced, recover the calendar date an operator would recognize as
 * "paid through". Formats `instant - 1` (one millisecond BEFORE the
 * boundary) rather than the boundary itself, since formatting the boundary
 * directly always yields the FOLLOWING day's date, not the paid-through day.
 */
export function instantToPaidThrough(instant: number): string {
  const { year, month, day } = readZonedParts(instant - 1);
  return formatZonedDateParts(year, month, day);
}

function formatZonedDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formats an instant as its OWN Buenos Aires calendar date, straight — unlike
 * `instantToPaidThrough`, which formats `instant - 1` because `validUntil` is
 * an EXCLUSIVE boundary. `validFrom` is INCLUSIVE (design §1.1/decisions item
 * 1): the instant it stores already IS the first valid moment, so rendering
 * it needs no such adjustment.
 */
function formatBuenosAiresDate(instant: number): string {
  const { year, month, day } = readZonedParts(instant);
  return formatZonedDateParts(year, month, day);
}

/**
 * Operator-facing read of a tenant's window (design §1.9), derived on read
 * through `Clock` — never a stored refusal event (Domain D's boundary: the
 * audit log must never see tenant runtime traffic). Each branch mirrors
 * `isTenantActive`'s own checks, in the same order, so this description and
 * the enforcement decision can never quietly diverge about the same tenant.
 */
export type TenantStatus =
  | { readonly kind: "active" }
  | { readonly kind: "expired"; readonly expiredOn: string }
  | { readonly kind: "not-yet-active"; readonly startsOn: string }
  | { readonly kind: "no-window" };

/**
 * Whether a window's own two bounds are internally consistent — mirrors
 * migration 002's `tenants_window_ordered` CHECK constraint exactly, and is
 * the PRIMARY enforcer `TenantAdminRepository.setValidityWindow` (both
 * adapters) calls before ever reaching the datastore, per that migration's
 * own docstring on why this needs no TOCTOU-safe constraint-catch dance the
 * way `embedKey` uniqueness does: both values arrive in the SAME call, so
 * there is no concurrent writer to race against.
 */
export function isWindowOrdered(window: { readonly validFrom?: number; readonly validUntil?: number }): boolean {
  if (window.validFrom === undefined || window.validUntil === undefined) return true;
  return window.validFrom < window.validUntil;
}

export function describeTenantStatus(tenant: TenantRecord, now: number): TenantStatus {
  if (tenant.validUntil === undefined) return { kind: "no-window" };
  if (now >= tenant.validUntil) return { kind: "expired", expiredOn: instantToPaidThrough(tenant.validUntil) };
  if (tenant.validFrom !== undefined && now < tenant.validFrom) {
    return { kind: "not-yet-active", startsOn: formatBuenosAiresDate(tenant.validFrom) };
  }
  return { kind: "active" };
}
