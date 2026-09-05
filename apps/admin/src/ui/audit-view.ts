import type { AuditQueryParams } from "./api.js";

/**
 * The audit viewer's own filter FORM state (task 16b.2) — every field a
 * plain string, so a controlled `<input>` always has a defined value to
 * bind to (the same "empty string, never undefined" discipline
 * `tenant-detail.ts`'s own `TenantDetailView` already establishes). `from`/
 * `to` are native `<input type="date">` values (`"YYYY-MM-DD"` or `""`) —
 * deliberately NOT the Argentine `DD/MM/AAAA` display `tenant-detail.ts`
 * uses for a "paid through" calendar date: a native date input already
 * emits ISO, and the audit log's own dates are exact instants for
 * record-keeping, not a billing boundary that needs Buenos Aires timezone
 * precision to answer "is this tenant paid up."
 */
export interface AuditFilterInputs {
  readonly actor: string;
  readonly tenant: string;
  /** `""` means "every action" — never a sentinel string. */
  readonly action: string;
  readonly from: string;
  /** The INCLUSIVE end date as the operator picks it. */
  readonly to: string;
}

export const EMPTY_AUDIT_FILTER_INPUTS: AuditFilterInputs = { actor: "", tenant: "", action: "", from: "", to: "" };

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Rolls a `"YYYY-MM-DD"` date forward exactly one UTC calendar day —
 * `Date`'s own `setUTCDate` handles month/year rollover correctly (no
 * hand-rolled day-count arithmetic needed). */
function startOfNextUtcDay(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

/**
 * Converts the filter form's own inputs into `getAuditEntries`'s
 * `AuditQueryParams` (task 16b.2) — the ONE place the "to" date's
 * inclusive-as-picked semantics become the exclusive-upper-bound instant
 * the server actually compares against (`audit-query.ts`'s own
 * `occurredTo`, `occurred_at < $n`, design's own half-open convention
 * reused here). Without this conversion, picking "31/08" as the end date
 * would silently exclude every entry FROM the 31st itself — genuinely
 * confusing for an operator who typed the day they meant to include.
 */
export function buildAuditQueryParams(inputs: AuditFilterInputs): AuditQueryParams {
  return {
    actor: nonEmpty(inputs.actor),
    tenant: nonEmpty(inputs.tenant),
    action: inputs.action === "" ? undefined : inputs.action,
    from: inputs.from === "" ? undefined : `${inputs.from}T00:00:00.000Z`,
    to: inputs.to === "" ? undefined : startOfNextUtcDay(inputs.to),
  };
}

/**
 * `DD/MM/AAAA HH:mm`, Buenos Aires time — `Intl.DateTimeFormat` with an
 * explicit `timeZone`, never a hardcoded UTC-03:00 offset (the identical
 * "Argentina has had no DST since 2009, but do not bake that assumption in"
 * discipline `tenant-validity.ts`'s own choke points already establish for
 * a different date computation).
 */
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAuditTimestamp(occurredAt: number): string {
  const parts = TIMESTAMP_FORMATTER.formatToParts(new Date(occurredAt));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/**
 * The "target" column (task 16b.2) — a tenant-scoped action names the
 * tenant, an operator-scoped action names the operator, and `session.login`/
 * `session.logout` name neither (spec assumption 4's own "no field to diff"
 * shape extends here: those two entries have no target at all, an em dash,
 * never a fabricated one).
 */
export function formatAuditTarget(entry: { readonly targetTenantId?: string; readonly targetOperatorId?: string }): string {
  if (entry.targetTenantId !== undefined) return `Inquilino: ${entry.targetTenantId}`;
  if (entry.targetOperatorId !== undefined) return `Operador: ${entry.targetOperatorId}`;
  return "—";
}

/**
 * The "changes" column (task 16b.2, design §9) — each changed field as
 * `field: before → after`, comma-separated. `JSON.stringify` renders every
 * value shape `AuditEntryInput.changes` can actually carry (a string, an
 * array, `null`) legibly and unambiguously — `null` prints as the literal
 * `null`, an empty array as `[]`, never coerced to an empty string that
 * would look identical to "field cleared to nothing" and "field never
 * set." Entries with no `changes` at all (`session.login`/`session.logout`,
 * spec assumption 4) show a dash, never an empty string a reader could
 * mistake for a rendering bug.
 */
export function formatAuditChanges(changes: Readonly<Record<string, { readonly before: unknown; readonly after: unknown }>> | undefined): string {
  if (changes === undefined) return "—";
  return Object.entries(changes)
    .map(([field, change]) => `${field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`)
    .join(", ");
}
