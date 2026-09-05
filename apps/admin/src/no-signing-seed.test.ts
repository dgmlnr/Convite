import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Whole-app complement to `config.test.ts`'s own narrower, config-scoped
 * check. Task 7.3 asks to "confirm no Ed25519 seed variable exists anywhere
 * in this app's config"; this fence widens the claim to the whole app,
 * mirroring `scripts/composition-root-least-privilege.test.ts`'s existing
 * technique for the analogous, opposite-direction claim (mint-server/server
 * never reaching `TenantAdminRepository`) — a source-text scan for the
 * symbols that would actually PRODUCE or CARRY the seed, never a
 * dependency-graph reachability check, for the identical reason that fence's
 * own docstring records: `apps/**` sits outside every layer rule's `to:`
 * scope (design §1.6), and even where a layer rule DID apply, module-graph
 * reachability is FILE-level, not per-named-export, so it cannot distinguish
 * "this file imports the minting constructor" from "this file imports some
 * unrelated export from the same barrel".
 *
 * `createSessionTokenIssuer` (constructs an issuer FROM the seed) is the one
 * symbol that matters — `createSessionTokenVerifier` (the match role's
 * verify-only half) is deliberately NOT matched, since holding a public key
 * verifier is not "holding the seed" and this app has no reason to hold
 * either, but only the ISSUER constructor is the actual minting capability
 * design §6/decisions #3684 forbid. `HEXDEV_SESSION_SIGNING_KEY` is matched
 * too, independently of the constructor, in case a future edit read the raw
 * env var without going through the constructor at all.
 */
const SEED_SYMBOL_PATTERN = /\bcreateSessionTokenIssuer\b|HEXDEV_SESSION_SIGNING_KEY/;

function sourceFilesUnder(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

function offendingFiles(): readonly string[] {
  return sourceFilesUnder(srcDir)
    .filter((file) => SEED_SYMBOL_PATTERN.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(srcDir, file));
}

describe("apps/admin cannot mint (design §6, decisions #3684 — a fourth composition root, isolated from the signing seed)", () => {
  it("never references the Ed25519 issuer constructor or the seed's own env var, anywhere in its own source", () => {
    expect(offendingFiles()).toEqual([]);
  });

  it("the fence itself can fire — a value reference to the minting constructor is caught (guards against a silently-vacuous regex)", () => {
    expect(SEED_SYMBOL_PATTERN.test('import { createSessionTokenIssuer } from "@hexdev/platform-core";')).toBe(true);
    expect(SEED_SYMBOL_PATTERN.test("const key = env.HEXDEV_SESSION_SIGNING_KEY;")).toBe(true);
    expect(SEED_SYMBOL_PATTERN.test('import { createSessionTokenVerifier } from "@hexdev/platform-core";')).toBe(false);
  });
});
