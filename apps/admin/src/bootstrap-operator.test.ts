import { describe, expect, it } from "vitest";
import type { OperatorId } from "@hexdev/platform-core";
import { PERMISSIONS } from "./permissions.js";
import { parseBootstrapArgs, runBootstrap, type BootstrapRunDeps } from "./bootstrap-operator.js";

/**
 * `bootstrap-operator.ts` (tasks 11b.1/11b.3-11b.8) — `parseBootstrapArgs` is
 * pure and tested directly; `runBootstrap`'s decision logic is tested with
 * INJECTED fakes for `bootstrapOperator`/`resetOperatorPassword` (the real
 * Postgres behavior of both is already proven in
 * `operator-bootstrap.postgres.test.ts`), the same layering
 * `operator-handlers.test.ts` already establishes for `disableOperator`/
 * `enableOperator`. Audit-witness construction is captured through the REAL
 * `appendAuditEntry` (never a mock of it), same capture technique
 * `operator-handlers.test.ts` uses.
 */
describe("parseBootstrapArgs — task 11b.1: the password is NEVER a command-line argument", () => {
  it("parses a bare username with no --force", () => {
    expect(parseBootstrapArgs(["ana"])).toEqual({ username: "ana", force: false });
  });

  it("parses --force in either position", () => {
    expect(parseBootstrapArgs(["ana", "--force"])).toEqual({ username: "ana", force: true });
    expect(parseBootstrapArgs(["--force", "ana"])).toEqual({ username: "ana", force: true });
  });

  it("refuses an unrecognised extra positional argument — the shape a password-on-argv mistake takes — naming stdin in the message", () => {
    expect(() => parseBootstrapArgs(["ana", "hunter2"])).toThrowError(/stdin/);
  });

  it("refuses when no username is given at all", () => {
    expect(() => parseBootstrapArgs([])).toThrowError(/usage/);
    expect(() => parseBootstrapArgs(["--force"])).toThrowError(/usage/);
  });
});

function auditCapturingBootstrap(result: { readonly ok: true; readonly operatorId: OperatorId } | { readonly ok: false; readonly reason: "operator-exists" }) {
  const captured: (readonly unknown[])[] = [];
  const bootstrapOperator: BootstrapRunDeps["bootstrapOperator"] = async (input, w) => {
    // Mirrors the REAL `bootstrapOperator`'s own contract, proven against
    // Postgres in `operator-bootstrap.postgres.test.ts`: the witness runs
    // ONLY on a successful write, never on a refusal.
    if (!result.ok) return result;
    await w(async (_sql, values) => {
      captured.push(values);
    });
    return { ok: true, operatorId: input.id as OperatorId };
  };
  return { bootstrapOperator, captured };
}

function auditCapturingReset(result: { readonly ok: true; readonly operatorId: OperatorId } | { readonly ok: false; readonly reason: "unknown-username" }) {
  const captured: (readonly unknown[])[] = [];
  const resetOperatorPassword: BootstrapRunDeps["resetOperatorPassword"] = async (_username, _passwordHash, buildWitness) => {
    if (!result.ok) return result;
    await buildWitness(result.operatorId)(async (_sql, values) => {
      captured.push(values);
    });
    return result;
  };
  return { resetOperatorPassword, captured };
}

describe("runBootstrap — first-run creation grants EVERY member of PERMISSIONS, iterated (task 11b.3-11b.4)", () => {
  it("on success, audits operator.bootstrapped with a SELF-REFERENTIAL actor (the account it just created)", async () => {
    const { bootstrapOperator, captured } = auditCapturingBootstrap({ ok: true, operatorId: "op-gen" as OperatorId });
    let capturedPermissions: readonly string[] | undefined;
    const wrapped: BootstrapRunDeps["bootstrapOperator"] = (input, w) => {
      capturedPermissions = input.permissions;
      return bootstrapOperator(input, w);
    };

    const outcome = await runBootstrap({ username: "ana", force: false }, "a real password", {
      bootstrapOperator: wrapped,
      resetOperatorPassword: async () => ({ ok: false, reason: "unknown-username" }),
      generateOperatorId: () => "op-gen",
    });

    expect(outcome.ok).toBe(true);
    expect(capturedPermissions).toEqual(PERMISSIONS); // every member, iterated — never a hardcoded subset
    expect(captured).toHaveLength(1);
    // column order: occurred_at, actor_operator_id, actor_username, action, target_tenant_id, target_operator_id, changes
    expect(captured[0]?.[1]).toBe("op-gen"); // actorOperatorId === the new account
    expect(captured[0]?.[3]).toBe("operator.bootstrapped");
    expect(captured[0]?.[5]).toBe("op-gen"); // targetOperatorId === itself
  });

  it("refuses when an operator already exists, surfacing --force as the escape hatch, never touching the audit witness", async () => {
    const { bootstrapOperator, captured } = auditCapturingBootstrap({ ok: false, reason: "operator-exists" });

    const outcome = await runBootstrap({ username: "ana", force: false }, "a real password", {
      bootstrapOperator,
      resetOperatorPassword: async () => ({ ok: false, reason: "unknown-username" }),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/--force/);
    expect(captured).toHaveLength(0);
  });
});

describe("runBootstrap — --force resets an EXISTING username's password only (task 11b.5-11b.8)", () => {
  it("on success, audits operator.password.reset-by-cli with a SELF-REFERENTIAL actor (the account whose password was just reset)", async () => {
    const { resetOperatorPassword, captured } = auditCapturingReset({ ok: true, operatorId: "op-existing" as OperatorId });

    const outcome = await runBootstrap({ username: "ana", force: true }, "a brand new password", {
      bootstrapOperator: async () => ({ ok: false, reason: "operator-exists" }),
      resetOperatorPassword,
    });

    expect(outcome.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.[1]).toBe("op-existing");
    expect(captured[0]?.[3]).toBe("operator.password.reset-by-cli");
    expect(captured[0]?.[5]).toBe("op-existing");
  });

  it("refuses --force against an unknown username, naming the no-force path as the alternative", async () => {
    const { resetOperatorPassword, captured } = auditCapturingReset({ ok: false, reason: "unknown-username" });

    const outcome = await runBootstrap({ username: "nobody", force: true }, "whatever", {
      bootstrapOperator: async () => ({ ok: false, reason: "operator-exists" }),
      resetOperatorPassword,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/no operator exists/);
    expect(captured).toHaveLength(0);
  });

  it("--force NEVER falls back to creating a second initial operator under a fresh username — a disclosed, deliberate boundary (task 11b.7's own scope)", async () => {
    let bootstrapCalled = false;
    const { resetOperatorPassword } = auditCapturingReset({ ok: false, reason: "unknown-username" });

    await runBootstrap({ username: "brand-new-name", force: true }, "whatever", {
      bootstrapOperator: async () => {
        bootstrapCalled = true;
        return { ok: true, operatorId: "op-should-not-happen" as OperatorId };
      },
      resetOperatorPassword,
    });

    expect(bootstrapCalled).toBe(false);
  });
});
