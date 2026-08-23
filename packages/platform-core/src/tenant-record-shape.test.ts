import { describe, expect, it } from "vitest";

import { findTenantRecordListProblem } from "./tenant-record-shape.js";

const VALID = {
  id: "acme",
  embedKey: "key-acme",
  allowedOrigins: ["https://acme.example"],
  entitledGames: ["truco"],
};

describe("findTenantRecordListProblem", () => {
  it("accepts a list of well-formed records", () => {
    expect(findTenantRecordListProblem([VALID])).toBeNull();
  });

  /** An operator who deploys no tenants deserves an empty catalog, not a
   * refusal: it is a legitimate state, and the dev fallback already covers
   * the "unset" case separately. */
  it("accepts an empty list", () => {
    expect(findTenantRecordListProblem([])).toBeNull();
  });

  it("rejects a document that is not a list at all, and names what it got instead", () => {
    // The article matters: this string goes straight into an operator-facing
    // startup refusal, and "got a object" reads like the tool is broken.
    expect(findTenantRecordListProblem({ id: "solo" })).toMatch(/got an object/);
    expect(findTenantRecordListProblem("acme")).toMatch(/got a string/);
    expect(findTenantRecordListProblem(null)).toMatch(/got null/);
    expect(findTenantRecordListProblem(7)).toMatch(/got a number/);
  });

  /**
   * THE gap this module closes. `Array.isArray` was the only check, and
   * `parsed as readonly TenantRecord[]` did the rest — so a list of numbers,
   * or of objects missing every field, started the process and surfaced much
   * later as tenants that silently never match.
   */
  it("rejects an element that is not an object, and says which one", () => {
    expect(findTenantRecordListProblem([VALID, 42])).toMatch(/index 1/);
    expect(findTenantRecordListProblem([null])).toMatch(/index 0/);
    expect(findTenantRecordListProblem([[]])).toMatch(/index 0/);
  });

  it("names the missing string field and the record it belongs to", () => {
    expect(findTenantRecordListProblem([{ ...VALID, id: undefined }])).toMatch(/index 0.*\bid\b/s);
    expect(findTenantRecordListProblem([{ ...VALID, embedKey: 7 }])).toMatch(/index 0.*embedKey/s);
    expect(findTenantRecordListProblem([{ ...VALID, id: "" }])).toMatch(/index 0.*\bid\b/s);
  });

  /**
   * A string here is the dangerous shape, not an obviously wrong one:
   * `"https://acme.example"` is iterable, so downstream origin checks would
   * compare against single CHARACTERS and reject every real origin.
   */
  it("rejects a string where a list of strings belongs", () => {
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: "https://acme.example" }])).toMatch(/allowedOrigins/);
    expect(findTenantRecordListProblem([{ ...VALID, entitledGames: "truco" }])).toMatch(/entitledGames/);
  });

  it("rejects a list whose entries are not strings", () => {
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: ["https://acme.example", 3] }])).toMatch(/allowedOrigins/);
    expect(findTenantRecordListProblem([{ ...VALID, entitledGames: [null] }])).toMatch(/entitledGames/);
  });

  /**
   * The guard `id` and `embedKey` already had, carried into the list fields
   * where it was missing.
   *
   * An empty ORIGIN can never match a real `Origin` header and an empty game
   * id can never match a real one, so a record carrying either is precisely
   * the "tenant that silently never matches" this module exists to refuse. It
   * is worse than a wrong type, because nothing about it looks wrong.
   */
  it("rejects an empty string INSIDE a list, not just as a whole field", () => {
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: [""] }])).toMatch(/allowedOrigins/);
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: ["https://acme.example", ""] }])).toMatch(/allowedOrigins/);
    expect(findTenantRecordListProblem([{ ...VALID, entitledGames: [""] }])).toMatch(/entitledGames/);
  });

  /**
   * The one rule here that is a product decision, pinned so nobody "fixes" it.
   *
   * An empty list looks like the failure this module refuses — a tenant with no
   * origins authenticates nobody. It is allowed anyway: tenant administration
   * is moving to a management UI that owns access, paid date windows and
   * per-game entitlement, where "created, no origin configured yet" and "not
   * entitled because the quota lapsed" are legitimate states of a living
   * record.
   *
   * The empty ENTRY above stays refused, because it is unambiguous: it claims
   * an origin is configured while matching nothing. An empty list claims
   * nothing.
   */
  it("accepts an empty list, because whether a tenant is currently enabled is not this function's business", () => {
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: [] }])).toBeNull();
    expect(findTenantRecordListProblem([{ ...VALID, entitledGames: [] }])).toBeNull();
    // ...but an empty entry inside the list is still garbage.
    expect(findTenantRecordListProblem([{ ...VALID, allowedOrigins: [""] }])).toMatch(/allowedOrigins/);
  });

  /** `theme` is optional by design — a tenant with none configured renders
   * exactly as it did before the field existed. Absent must stay legal. */
  it("accepts a record with no theme", () => {
    expect(findTenantRecordListProblem([VALID])).toBeNull();
  });

  /**
   * But a present `theme` must at least BE an object. Its colours are
   * deliberately not checked here: `createStaticTenantRepository` re-runs
   * `sanitizeThemeOverride` on every record on its way into the repository,
   * and duplicating that judgement would let the two drift apart.
   */
  it("rejects a theme that is present but not an object, and defers its contents", () => {
    expect(findTenantRecordListProblem([{ ...VALID, theme: "dark" }])).toMatch(/theme/);
    // An array is an object to `typeof`, so this is the case that would slip
    // through a naive check — and the one place `describeType`'s array branch
    // composes with the theme check.
    expect(findTenantRecordListProblem([{ ...VALID, theme: [] }])).toMatch(/theme.*an array/s);
    expect(findTenantRecordListProblem([{ ...VALID, theme: { feltColor: "#0b3d2e" } }])).toBeNull();
    expect(findTenantRecordListProblem([{ ...VALID, theme: { feltColor: "not-a-colour" } }])).toBeNull();
  });

  /** One problem at a time, and always the FIRST one: an operator fixes the
   * top of the file and re-runs, rather than reading a wall of consequences
   * of a single mistake. */
  it("reports only the first problem", () => {
    const problem = findTenantRecordListProblem([{ ...VALID, id: 1 }, 42]);

    expect(problem).toMatch(/index 0/);
    expect(problem).not.toMatch(/index 1/);
  });
});
