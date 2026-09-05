import crypto from "node:crypto";

/**
 * Operator password hashing, comparison, and the timing-oracle fix — the
 * single most security-sensitive module `apps/admin` ships (design §11.1,
 * spec Domain E, tasks §0.2/8a). This repository has never before
 * authenticated a human being: every existing player enters with no
 * account at all (`apps/widget-app/src/i18n.ts`'s `selectionTagline`,
 * "Sentate a jugar: sin instalar nada, sin crear cuenta.", is a live tested
 * promise). There is no in-repo precedent to copy here, so every claim below
 * is checked against a real Node run, not carried forward from elsewhere —
 * see `operator-password.test.ts`'s own first suite for the empirical proof.
 *
 * Lives in `apps/admin`, not `packages/platform-core` (design §11.1): nothing
 * else in this fleet needs credential hashing, and placing it in
 * `platform-core` would put operator-authentication logic on a module path
 * reachable, in principle, from the READ-ONLY roles (`convite_readonly`) —
 * the exact class of boundary this whole change is built to keep closed.
 */

/** scrypt cost parameters (design §11.1): CPU/memory-hard, in the standard
 * library, no native addon — a node-gyp dependency is a different cost class
 * from a UI library and would break CI on any platform mismatch, which is
 * why argon2id (the theoretically stronger choice) and bcrypt (72-byte
 * truncation, no memory hardness) are both rejected here. */
const SCRYPT_N = 2 ** 15; // 32768 — CPU/memory cost
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const SCRYPT_KEYLEN = 32; // derived key length, bytes
const SALT_LEN = 16; // bytes, crypto.randomBytes

/**
 * `operator-password.test.ts`'s own first suite settles this empirically,
 * not merely by formula: `crypto.scryptSync` at `N=2^15, r=8` genuinely
 * exceeds Node's default `maxmem` (32 MiB) and throws
 * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` with no explicit `maxmem` — confirmed by
 * a real run, on this repo's own Node 24. The design's disclosed
 * inclusive/exclusive boundary uncertainty is also settled there: an
 * explicit `maxmem` of EXACTLY `128 * N * r` bytes (the naive formula's own
 * 32 MiB figure) STILL throws, because scrypt's real working set is
 * marginally larger than that naive product (OpenSSL's own implementation
 * needs `128 * r * (N + p)` bytes, not `128 * N * r` — `p=1` here adds
 * exactly `128 * r` = 1,024 more bytes than the naive figure accounts for).
 * `64 * 1024 * 1024` (64 MiB) clears both figures with comfortable headroom
 * and costs nothing at single-digit-operator, per-login-attempt scale.
 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const SCRYPT_FORMAT_PREFIX = "scrypt";
/** `prefix, N, r, p, salt, key` — six `$`-separated fields. */
const STORED_FORMAT_FIELD_COUNT = 6;

function scryptDerive(password: string, salt: Buffer, keylen: number, n: number, r: number, p: number): Buffer {
  return crypto.scryptSync(password, salt, keylen, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
}

/**
 * Hashes a password into a SELF-DESCRIBING stored string:
 * `scrypt$N$r$p$<salt-base64>$<key-base64>`. Encoding the cost parameters
 * INSIDE the stored value — not only in this module's own constants — is
 * what lets a future parameter bump (or algorithm swap) ship without a
 * migration that rewrites every existing hash: `verifyPassword` always
 * re-derives using the parameters a given stored value names, never today's
 * constants (`operator-password.test.ts` proves this directly, with a
 * hand-built hash under deliberately different parameters).
 *
 * The returned string never equals and never decodes back to `password` —
 * scrypt is a one-way KDF by construction, and `operator-password.test.ts`'s
 * own dedicated suite asserts this concretely rather than assuming it
 * (tasks 8a.3/8a.4).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = scryptDerive(password, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [SCRYPT_FORMAT_PREFIX, String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P), salt.toString("base64"), derived.toString("base64")].join("$");
}

interface ParsedStoredHash {
  readonly n: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function parseStoredHash(stored: string): ParsedStoredHash {
  const parts = stored.split("$");
  if (parts.length !== STORED_FORMAT_FIELD_COUNT || parts[0] !== SCRYPT_FORMAT_PREFIX) {
    throw new Error(
      `operator-password: malformed stored hash — expected "${SCRYPT_FORMAT_PREFIX}$N$r$p$salt$key" (${String(STORED_FORMAT_FIELD_COUNT)} fields), got ${String(parts.length)} field(s) starting with "${parts[0] ?? ""}"`,
    );
  }
  const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts;
  return { n: Number(nRaw), r: Number(rRaw), p: Number(pRaw), salt: Buffer.from(saltB64!, "base64"), key: Buffer.from(keyB64!, "base64") };
}

/**
 * Compares `password` against a self-describing `stored` hash, re-deriving
 * with the STORED parameters (never today's constants) and comparing with
 * `crypto.timingSafeEqual` (design §11.1) — never `===`/`Buffer.equals`,
 * which short-circuit on the first differing byte and leak a length- and
 * prefix-dependent timing signal. `timingSafeEqual` REQUIRES equal-length
 * buffers or it throws, so the length check runs first: a corrupted or
 * foreign stored value must fail the comparison, never crash the caller.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseStoredHash(stored);
  const candidate = scryptDerive(password, parsed.salt, parsed.key.length, parsed.n, parsed.r, parsed.p);
  return candidate.length === parsed.key.length && crypto.timingSafeEqual(candidate, parsed.key);
}

/** Injectable so `operator-password.test.ts` can prove exactly how many
 * times, and against exactly which stored value, a comparison ran — the
 * production default (`verifyPassword`) needs no caller to ever pass this. */
export type PasswordComparator = (password: string, stored: string) => boolean;

export interface AuthenticateOperatorDeps {
  readonly compare: PasswordComparator;
}

const DEFAULT_DEPS: AuthenticateOperatorDeps = { compare: verifyPassword };

/**
 * A fixed, never-real credential, hashed ONCE at module load with the exact
 * same cost parameters every real operator hash uses. This is the losing
 * side of the timing-oracle fix below — see `authenticateOperator`'s own
 * docstring for why it exists.
 */
const DUMMY_STORED_HASH = hashPassword("this-password-never-authenticates-any-real-operator-account");

/**
 * THE TIMING ORACLE FIX (design §11.1, spec Domain E, tasks 8a.5/8a.6).
 *
 * An unknown username and a disabled account both fail WITHOUT hashing
 * anything, in roughly 0 ms, if this function did the obvious thing: look up
 * the operator, and short-circuit to `false` when it is absent or disabled.
 * A wrong password on a real, enabled account fails AFTER a real scrypt
 * comparison, in roughly 100 ms. That two-order-of-magnitude gap is a free
 * account-enumeration oracle — spec Domain E requires a disabled account to
 * fail "identically to a wrong password from the caller's perspective," and
 * a nominal identical RESPONSE with a measurably different COST does not
 * satisfy that.
 *
 * The fix: both losing paths (`operator` absent, `operator.enabled` false)
 * still run a full comparison against `DUMMY_STORED_HASH` before returning
 * `false` — its own result is discarded, since this path always fails
 * regardless of what it returns. The ONLY purpose is spending the identical
 * scrypt cost a real comparison would spend, so wall-clock timing cannot
 * distinguish "no such user" or "disabled" from "wrong password."
 *
 * `deps.compare` defaults to the real `verifyPassword` — no production
 * caller (the login handler, slice 8b) ever needs to pass `deps` at all.
 * The seam exists so `operator-password.test.ts` can inject a counting
 * comparator and assert, precisely, that the dummy comparison runs EXACTLY
 * ONCE on both losing paths, against the SAME fixed dummy value — not merely
 * that the two responses look alike.
 */
export function authenticateOperator(
  operator: { readonly passwordHash: string; readonly enabled: boolean } | undefined,
  candidatePassword: string,
  deps: AuthenticateOperatorDeps = DEFAULT_DEPS,
): boolean {
  if (operator === undefined || !operator.enabled) {
    deps.compare(candidatePassword, DUMMY_STORED_HASH);
    return false;
  }
  return deps.compare(candidatePassword, operator.passwordHash);
}
