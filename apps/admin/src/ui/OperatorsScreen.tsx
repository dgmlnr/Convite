import { useCallback, useEffect, useState, type JSX } from "react";

import { PERMISSIONS, type Permission } from "../permissions.js";
import { getOperators, postOperatorCreate, postOperatorDisable, postOperatorEnable, postPermissionGrant, postPermissionRevoke } from "./api.js";
import { AppNav, type AppScreen } from "./AppNav.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { COPY } from "./copy.js";
import { buildOperatorRows, type OperatorRow } from "./operator-directory.js";
import { wouldTripLastAccountManagerGuard } from "./permission-matrix.js";

export interface OperatorsScreenProps {
  readonly onNavigate: (screen: AppScreen) => void;
  readonly onLogout: () => void;
}

type LoadState = { readonly kind: "loading" } | { readonly kind: "missing-permission" } | { readonly kind: "error" } | { readonly kind: "loaded" };
type CreateState = { readonly kind: "idle" } | { readonly kind: "submitting" } | { readonly kind: "error"; readonly message: string };

/**
 * Operator list, creation, disable/enable, and the permission matrix (phase
 * 16a, tasks 16a.1-16a.6) — ONE screen, not four: they operate on the SAME
 * small dataset (`GET /operators`, design §7's own "single-digit operators"
 * scale), and the matrix needs exactly the per-operator permission set the
 * list's own row already carries, so splitting them would only mean two
 * fetches of the identical response. Owns its own fetch/loading/error state
 * entirely, the same split `TenantDetailScreen.tsx`'s own docstring already
 * establishes.
 *
 * SEVEN PERMISSIONS, NO EIGHTH, NO FAKE ROLE GROUPING (launch prompt §1):
 * the matrix's own columns are `PERMISSIONS` (`../permissions.ts`) verbatim,
 * iterated — never a hand-typed list that could silently drift from the
 * real closed taxonomy, and never grouped under an invented "role" header
 * this system does not actually have (decisions #3684 item 9: permissions
 * are assigned directly to accounts, there is no role layer).
 *
 * THE LAST-ACCOUNT-MANAGER GUARD IS MADE VISIBLE, NOT ENFORCED, HERE (launch
 * prompt §2): `row.isSoleAccountManager` (`operator-directory.ts`) renders a
 * persistent hint under that operator's own name, and
 * `wouldTripLastAccountManagerGuard` (`permission-matrix.ts`) marks the
 * SPECIFIC `operators.manage` checkbox that unchecking would trip. Neither
 * one BLOCKS a click: every toggle still calls the real grant/revoke/
 * disable route (task 16a.5's own "toggling a cell calls grant/revoke"),
 * and a genuine `last-account-manager` 409 — which two racing operators can
 * always produce even when this screen's own last fetch showed it as safe —
 * is handled gracefully below, exactly like any other server refusal.
 */
export function OperatorsScreen({ onNavigate, onLogout }: OperatorsScreenProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [rows, setRows] = useState<readonly OperatorRow[]>([]);
  const [rowError, setRowError] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: "loading" });
    const outcome = await getOperators();
    if (!outcome.ok) {
      setState(outcome.reason === "missing-permission" ? { kind: "missing-permission" } : { kind: "error" });
      return;
    }
    setRows(buildOperatorRows(outcome.operators));
    setState({ kind: "loaded" });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    if (username.trim() === "" || password === "") {
      setCreateState({ kind: "error", message: COPY.operatorsCreateMissingFields });
      return;
    }
    setCreateState({ kind: "submitting" });
    const outcome = await postOperatorCreate(username.trim(), password);
    if (!outcome.ok) {
      const message =
        outcome.reason === "username-taken"
          ? COPY.operatorsCreateUsernameTaken
          : outcome.reason === "missing-permission"
            ? COPY.operatorsCreateMissingPermission
            : outcome.reason === "invalid-payload"
              ? COPY.operatorsCreateMissingFields
              : COPY.operatorsCreateGenericError;
      setCreateState({ kind: "error", message });
      return;
    }
    setUsername("");
    setPassword("");
    setCreateState({ kind: "idle" });
    await load();
  }

  async function handleToggleEnabled(row: OperatorRow): Promise<void> {
    setRowError(undefined);
    const outcome = row.enabled ? await postOperatorDisable(row.id) : await postOperatorEnable(row.id);
    if (!outcome.ok) {
      setRowError(outcome.reason === "last-account-manager" ? COPY.operatorsLastAccountManagerRefused : COPY.operatorsGenericError);
      return;
    }
    await load();
  }

  async function handleTogglePermission(row: OperatorRow, permission: Permission, nextChecked: boolean): Promise<void> {
    setRowError(undefined);
    const outcome = nextChecked ? await postPermissionGrant(row.id, permission) : await postPermissionRevoke(row.id, permission);
    if (!outcome.ok) {
      setRowError(outcome.reason === "last-account-manager" ? COPY.operatorsLastAccountManagerRefused : COPY.operatorsGenericError);
      return;
    }
    await load();
  }

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-background text-primary-foreground">
        <AppNav current="operators" onNavigate={onNavigate} onLogout={onLogout} />
        <main className="p-6">{COPY.operatorsLoading}</main>
      </div>
    );
  }

  if (state.kind === "missing-permission" || state.kind === "error") {
    return (
      <div className="min-h-screen bg-background text-primary-foreground">
        <AppNav current="operators" onNavigate={onNavigate} onLogout={onLogout} />
        <main className="flex flex-col items-start gap-4 p-6">
          <p className="text-sm text-primary-foreground/70">{state.kind === "missing-permission" ? COPY.operatorsMissingPermission : COPY.operatorsGenericError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {COPY.retry}
          </Button>
        </main>
      </div>
    );
  }

  const creating = createState.kind === "submitting";

  return (
    <div className="min-h-screen bg-background text-primary-foreground">
      <AppNav current="operators" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="flex flex-col gap-6 p-6">
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">{COPY.operatorsCreateTitle}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {COPY.operatorsUsernameLabel}
              <Input value={username} onChange={(event) => setUsername(event.target.value)} disabled={creating} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {COPY.operatorsPasswordLabel}
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={creating} />
            </label>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? COPY.operatorsCreateSubmitting : COPY.operatorsCreateSubmit}
            </Button>
          </div>
          {createState.kind === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {createState.message}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{COPY.operatorsTitle}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-primary-foreground/70">{COPY.operatorsEmpty}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium">{COPY.operatorsColumnUsername}</th>
                    <th className="px-3 py-2 font-medium">{COPY.operatorsColumnStatus}</th>
                    {PERMISSIONS.map((permission) => (
                      <th key={permission} className="px-3 py-2 text-center font-medium">
                        {COPY.permissionLabels[permission]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 align-top font-medium">
                        <div>{row.username}</div>
                        {row.isSoleAccountManager ? <p className="max-w-xs text-xs font-normal text-primary-foreground/70">{COPY.operatorsSoleAccountManagerHint}</p> : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Button variant="outline" size="sm" onClick={() => void handleToggleEnabled(row)}>
                          {row.enabled ? COPY.operatorsDisableButton : COPY.operatorsEnableButton}
                        </Button>
                      </td>
                      {PERMISSIONS.map((permission) => {
                        const checked = row.permissions.has(permission);
                        const wouldTrip = wouldTripLastAccountManagerGuard(row, permission, !checked);
                        return (
                          <td key={permission} className="px-3 py-2 text-center align-top">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={checked}
                              title={wouldTrip ? COPY.operatorsSoleAccountManagerHint : undefined}
                              onChange={(event) => void handleTogglePermission(row, permission, event.target.checked)}
                              aria-label={`${COPY.permissionLabels[permission]} — ${row.username}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rowError !== undefined ? (
            <p className="text-sm text-destructive" role="alert">
              {rowError}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
