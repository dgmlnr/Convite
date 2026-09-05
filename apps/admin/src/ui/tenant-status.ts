import type { TenantStatus } from "@hexdev/platform-core";

/**
 * Maps the closed `TenantStatus` `describeTenantStatus` already computed
 * SERVER-SIDE (`tenant-handlers.ts`, task 14.4) onto the one Spanish
 * sentence an operator reads for it. This function NEVER re-derives the
 * status itself from a raw `validFrom`/`validUntil` instant — those never
 * even reach the browser (`tenant-handlers.ts`'s own JSON shape carries only
 * the already-derived `TenantStatus`), so there is exactly one place in the
 * whole system, `describeTenantStatus`, that decides what "active" means.
 *
 * `expiredOn`/`startsOn` ARE ALREADY "the last paid day" (launch prompt §2):
 * `describeTenantStatus` computes them via `instantToPaidThrough`/
 * `formatBuenosAiresDate`, which already convert the stored EXCLUSIVE
 * `validUntil` boundary back to the calendar date an operator would
 * recognize — an operator who typed "30" reads "30" here, never "31" or a
 * raw instant. This function's only remaining job is turning the ISO
 * `"YYYY-MM-DD"` string into the `DD/MM/YYYY` shape Argentine dates read in.
 */
/**
 * Exported (slice 15, task 15a.5) — the tenant DETAIL window editor needs
 * the identical `"YYYY-MM-DD"` -> `"DD/MM/YYYY"` conversion this function
 * already performs for the LIST's own `expired`/`not-yet-active` labels, so
 * `tenant-detail.ts` reuses this one implementation rather than growing a
 * second copy of the exact same three-way string split.
 */
export function toArgentineDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatTenantStatusLabel(status: TenantStatus): string {
  switch (status.kind) {
    case "active":
      return "Activo";
    case "expired":
      return `Venció el ${toArgentineDate(status.expiredOn)}`;
    case "not-yet-active":
      return `Comienza el ${toArgentineDate(status.startsOn)}`;
    case "no-window":
      return "Sin período configurado";
  }
}
