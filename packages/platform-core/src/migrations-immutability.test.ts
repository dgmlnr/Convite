import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * The rule this fence enforces, found the hard way by a closure batch
 * (sdd-verify obs #3763, WARNING 2): a numbered migration that has been
 * applied ANYWHERE is immutable. `postgres-migrations.ts`'s own
 * `runMigrations` keys purely on VERSION MEMBERSHIP in `schema_migrations`
 * (`if (already.has(version)) continue`), never on file content — so
 * editing an already-numbered file's body reaches a fresh database (which
 * reapplies every file from zero) but is silently invisible to any database
 * that already applied that version. New behaviour, however small, ALWAYS
 * belongs in a NEW file with the next version number, never a patch to an
 * old one — exactly the mistake migration 001 made when it grew a GRANT
 * statement after already shipping, and exactly what `005_grant_schema_
 * migrations_read.sql` exists to correct.
 *
 * This is a SNAPSHOT fence, the same class `widget-app.js`'s own byte-size
 * check already is for this repo (design's own established idiom: pin an
 * exact value, fail loudly on ANY drift, force a conscious decision rather
 * than a silent one). It cannot prove an edit is wrong — only that one
 * happened — but a diff that changes an EXISTING key's own pinned hash is a
 * loud, mechanical, unmissable signal in code review, which a doc comment
 * alone is not. Update this map ONLY by adding a brand-new key for a
 * brand-new file; never by changing an existing key's value to match an
 * edited file — that is precisely the mistake this test exists to catch.
 */
const PINNED_CHECKSUMS: Readonly<Record<string, string>> = {
  "001_create_tenants_and_roles.sql": "f1c07065c136de6c42828e8e9d0a1fc393847825450e7dfe0f071e60138a19b0",
  "002_add_validity_window.sql": "a10ebc9bc22371d1d2bf6b0475379bc5eb4d5a2977fcb1b6b739673532bcb2e4",
  "003_create_operators.sql": "b67639b597a262d6eeaf1891a31ae0c7ef582098d60732570f588bf4567b39f7",
  "004_create_audit_entries.sql": "2dd850dfe1c656765aa7ad10af2d22b68edc658c6a52023914e47f2bcddc31e7",
  "005_grant_schema_migrations_read.sql": "2cf475342920eea7266c38fdec617c31b2b5c5f1f3cadbd91508d3da5bb499d5",
};

describe("a numbered migration, once bundled, must never change", () => {
  it("every file under migrations/ is exactly the pinned set, byte for byte", () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // Closed on BOTH sides: a new file with no pinned entry fails here
    // (forcing the author to add one), and a removed file fails too.
    expect(files).toEqual(Object.keys(PINNED_CHECKSUMS));

    for (const file of files) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const actual = createHash("sha256").update(content).digest("hex");
      expect(actual, `${file} changed after being numbered — never edit an applied migration; add a new one instead`).toBe(PINNED_CHECKSUMS[file]);
    }
  });
});
