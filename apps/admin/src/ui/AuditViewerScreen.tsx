import { useCallback, useEffect, useState, type JSX } from "react";

import { AUDIT_ACTIONS } from "../audit-log.js";
import { getAuditEntries, type AuditEntryApiRow } from "./api.js";
import { AppNav, type AppScreen } from "./AppNav.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";
import { buildAuditQueryParams, formatAuditChanges, formatAuditTarget, formatAuditTimestamp, EMPTY_AUDIT_FILTER_INPUTS, type AuditFilterInputs } from "./audit-view.js";

export interface AuditViewerScreenProps {
  readonly onNavigate: (screen: AppScreen) => void;
  readonly onLogout: () => void;
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "missing-permission" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly entries: readonly AuditEntryApiRow[] };

/**
 * The audit viewer (phase 16b, tasks 16b.2/16b.3/16b.5) — who did what,
 * when, against which tenant, restrained on purpose (launch prompt §4: "an
 * audit log is where UIs usually go to die — dense, unreadable,
 * unfiltered"). Owns its own fetch/filter/loading/error state entirely, the
 * same split `OperatorsScreen.tsx`'s own docstring already establishes.
 *
 * FOUR FILTERS, THE EXACT FOUR SPEC DOMAIN L NAMES — actor, tenant, action,
 * date range — never a fifth invented for convenience. The action dropdown
 * is sourced DIRECTLY from `AUDIT_ACTIONS` (`../audit-log.ts`), never a
 * hand-typed option list: this is what makes the launch prompt's own
 * boundary demand structural rather than a reviewing habit — the filter's
 * own vocabulary CANNOT drift from the sixteen real, closed action kinds,
 * so it can never imply a tenant-runtime-refusal event class this system
 * never collects (design §10's own boundary).
 *
 * READ-ONLY BY CONSTRUCTION: no edit affordance, no delete affordance,
 * anywhere on this screen — the database itself refuses both at two
 * independent layers (design §9's own `GRANT`-without-`UPDATE`/`DELETE`
 * plus the immutability trigger), so this screen offers nothing the
 * database would have to refuse.
 */
export function AuditViewerScreen({ onNavigate, onLogout }: AuditViewerScreenProps): JSX.Element {
  const [filters, setFilters] = useState<AuditFilterInputs>(EMPTY_AUDIT_FILTER_INPUTS);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async (nextFilters: AuditFilterInputs): Promise<void> => {
    setState({ kind: "loading" });
    const outcome = await getAuditEntries(buildAuditQueryParams(nextFilters));
    if (!outcome.ok) {
      setState(outcome.reason === "missing-permission" ? { kind: "missing-permission" } : { kind: "error" });
      return;
    }
    setState({ kind: "loaded", entries: outcome.entries });
  }, []);

  // Intentionally empty deps — this fetch runs ONCE, on mount, with no
  // filters applied yet. Every subsequent fetch is triggered explicitly by
  // "Filtrar"/"Limpiar filtros" below, never implicitly on every keystroke,
  // so an operator typing a tenant id is never interrupted by a request
  // for the id they have not finished typing yet. `load` itself is stable
  // (`useCallback` with empty deps), so this is not an incomplete
  // dependency list — there is nothing else this effect could depend on.
  useEffect(() => {
    void load(EMPTY_AUDIT_FILTER_INPUTS);
  }, [load]);

  function updateFilter<K extends keyof AuditFilterInputs>(key: K, value: AuditFilterInputs[K]): void {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function handleClear(): void {
    setFilters(EMPTY_AUDIT_FILTER_INPUTS);
    void load(EMPTY_AUDIT_FILTER_INPUTS);
  }

  return (
    <div className="min-h-screen bg-background text-primary-foreground">
      <AppNav current="audit" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="flex flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold">{COPY.auditTitle}</h2>

        <section className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
          <label className="flex flex-col gap-1 text-sm">
            {COPY.auditFilterActorLabel}
            <Input value={filters.actor} onChange={(event) => updateFilter("actor", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.auditFilterTenantLabel}
            <Input value={filters.tenant} onChange={(event) => updateFilter("tenant", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.auditFilterActionLabel}
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filters.action}
              onChange={(event) => updateFilter("action", event.target.value)}
            >
              <option value="">{COPY.auditFilterActionAll}</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {COPY.auditActionLabels[action]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.auditFilterFromLabel}
            <Input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {COPY.auditFilterToLabel}
            <Input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} />
          </label>
          <Button size="sm" onClick={() => void load(filters)}>
            {COPY.auditFilterApply}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            {COPY.auditFilterClear}
          </Button>
        </section>

        {state.kind === "loading" ? <p className="text-sm text-primary-foreground/70">{COPY.auditLoading}</p> : null}

        {state.kind === "missing-permission" || state.kind === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-primary-foreground/70">{state.kind === "missing-permission" ? COPY.auditMissingPermission : COPY.auditGenericError}</p>
            <Button variant="outline" size="sm" onClick={() => void load(filters)}>
              {COPY.retry}
            </Button>
          </div>
        ) : null}

        {state.kind === "loaded" ? (
          state.entries.length === 0 ? (
            <p className="text-sm text-primary-foreground/70">{COPY.auditEmpty}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium">{COPY.auditColumnWhen}</th>
                    <th className="px-3 py-2 font-medium">{COPY.auditColumnWho}</th>
                    <th className="px-3 py-2 font-medium">{COPY.auditColumnAction}</th>
                    <th className="px-3 py-2 font-medium">{COPY.auditColumnTarget}</th>
                    <th className="px-3 py-2 font-medium">{COPY.auditColumnChanges}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{formatAuditTimestamp(entry.occurredAt)}</td>
                      <td className="px-3 py-2">{entry.actorUsername}</td>
                      <td className="px-3 py-2">{COPY.auditActionLabels[entry.action as keyof typeof COPY.auditActionLabels] ?? entry.action}</td>
                      <td className="px-3 py-2">{formatAuditTarget(entry)}</td>
                      <td className="max-w-md px-3 py-2 text-xs text-primary-foreground/70">{formatAuditChanges(entry.changes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </main>
    </div>
  );
}
