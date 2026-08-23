/**
 * What a `TenantRecord` must look like, checked once, next to the type.
 *
 * WHY THIS EXISTS. Both composition roots parsed `HEXDEV_TENANTS_JSON` with
 * `Array.isArray(parsed)` and then `parsed as readonly TenantRecord[]`. The
 * cast is the problem: a list of numbers, or of objects missing every field,
 * started the process happily and surfaced much later as tenants that simply
 * never match — an empty catalog on `/embed`, or origin checks comparing
 * against single characters. Both files' own docstrings claimed "the shape is
 * checked too", which it was not.
 *
 * WHY IT LIVES HERE and not in either app: the shape belongs to the type, and
 * the type lives in `tenant-auth.ts`. Two roles validating the same document
 * from two copies of the rules is how the two drift apart.
 *
 * WHY IT RETURNS A PROBLEM INSTEAD OF THROWING: each role frames the refusal
 * in its own words ("refusing to start" vs "refusing to start the minting
 * role") and names its own variable. This function owns WHAT is wrong; the
 * caller owns what it means for them.
 *
 * DELIBERATELY NOT CHECKED HERE: the contents of `theme`.
 * `createStaticTenantRepository` re-runs `sanitizeThemeOverride` on every
 * record on its way into a repository, whatever its origin, and a second
 * opinion here would only give the two something to disagree about. This
 * checks that a PRESENT `theme` is an object, and stops.
 */

/** Every field a record must carry as a non-empty string. */
const REQUIRED_STRING_FIELDS = ["id", "embedKey"] as const;

/** Every field a record must carry as a list of strings. */
const REQUIRED_STRING_LIST_FIELDS = ["allowedOrigins", "entitledGames"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads back into an operator-facing refusal, so the article has to agree:
 * "got a object" reads like the tool itself is broken. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  const noun = typeof value;
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
}

/**
 * Returns the FIRST problem with a parsed tenants document, or `null` when it
 * is usable.
 *
 * First, not all of them, on purpose: an operator fixes the top of the file
 * and re-runs, rather than reading a wall of consequences of one mistake.
 */
export function findTenantRecordListProblem(parsed: unknown): string | null {
  if (!Array.isArray(parsed)) {
    return `must be a JSON array of tenant records, got ${describeType(parsed)}`;
  }

  for (const [index, record] of parsed.entries()) {
    if (!isPlainObject(record)) {
      return `has a tenant at index ${String(index)} that is ${describeType(record)}, not an object`;
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      const value = record[field];
      if (typeof value !== "string" || value === "") {
        return `has a tenant at index ${String(index)} whose "${field}" is not a non-empty string`;
      }
    }

    for (const field of REQUIRED_STRING_LIST_FIELDS) {
      const value = record[field];
      // A bare string is the dangerous shape here, not an obviously wrong
      // one: it is iterable, so an origin check would compare against single
      // CHARACTERS and reject every real origin without ever looking wrong.
      //
      // Entries are checked for emptiness too, exactly as the fields above
      // are: an empty ORIGIN can never match a real `Origin` header and an
      // empty game id can never match a real one, so either produces the same
      // silently-never-matching tenant this whole module exists to refuse.
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
        return `has a tenant at index ${String(index)} whose "${field}" is not an array of non-empty strings`;
      }
      // An EMPTY list is DELIBERATELY allowed, and this is the one rule here
      // that is a product decision rather than a structural one.
      //
      // A tenant with no origins authenticates nobody and one with no games is
      // entitled to nothing, so both look like the "silently never matches"
      // failure this module refuses. They are not. Tenant administration is
      // moving to a management UI that owns access, paid date windows and
      // per-game entitlement, and there "created, no origin configured yet" and
      // "not entitled because the quota lapsed" are legitimate states of a
      // living record — not unfinished edits.
      //
      // An empty ENTRY stays refused above, because that is unambiguous: it
      // claims an origin is configured while matching nothing. An empty LIST
      // claims nothing. Structure is this function's business; whether a tenant
      // is currently enabled is the product's.
    }

    if (record.theme !== undefined && !isPlainObject(record.theme)) {
      return `has a tenant at index ${String(index)} whose "theme" is ${describeType(record.theme)}, not an object`;
    }
  }

  return null;
}
