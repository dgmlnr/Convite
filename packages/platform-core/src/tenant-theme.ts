import { sanitizeThemeOverride, validateThemeContrast, type ThemeContrastViolation, type ThemeOverride } from "@hexdev/widget-protocol";

/**
 * Shared theme-sanitization primitive (tenant-administration slice 4, design
 * §2.3 point 3), extracted from what used to be `tenant-auth.ts`'s own
 * PRIVATE `sanitizeTenantTheme` — that version returned only the sanitized
 * theme and logged violations itself via `console.warn`, which was correct
 * for its ONE caller (`createStaticTenantRepository`, warning at
 * construction) but wrong for a write port: `TenantAdminRepository.create`/
 * `updateTheme` (this slice) must hand `themeViolations` BACK to the caller
 * on `TenantWriteResult.ok:true` so the operator's own panel can render them
 * (design §2.3 point 3), not bury them in a server log an operator's browser
 * never sees. Pulling the pure computation out from under the logging
 * decision lets each caller decide what to do with `violations` — the static
 * read adapter still warns at construction time (unchanged behavior, see
 * `tenant-auth.ts`), the write port surfaces them to the caller, and the
 * Postgres read adapter (`postgres-tenant-repository.ts`) uses the result
 * without either, per its own docstring's read-time defense-in-depth
 * decision.
 *
 * Still exactly the same two `@hexdev/widget-protocol` primitives
 * (`sanitizeThemeOverride` + `validateThemeContrast`) every prior version of
 * this logic called — never reimplemented, per this repo's own precedent.
 */
export interface TenantThemeSanitizeResult {
  readonly theme: ThemeOverride | undefined;
  readonly violations: readonly ThemeContrastViolation[];
}

export function sanitizeTenantTheme(theme: unknown): TenantThemeSanitizeResult {
  if (theme === null || typeof theme !== "object") return { theme: undefined, violations: [] };
  const validated = validateThemeContrast(sanitizeThemeOverride(theme as Readonly<Record<string, unknown>>));
  return { theme: validated.theme, violations: validated.violations };
}
