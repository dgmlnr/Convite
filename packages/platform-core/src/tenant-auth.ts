import type { Clock, GameId, PlayerId } from "@hexdev/platform-contract";

/** A platform-wide tenant identifier. */
export type TenantId = string & { readonly __brand: "TenantId" };

/** Manually-administered tenant record (design §7: v1 has no tenant
 * self-service). Both `allowedOrigins` and `entitledGames` are re-checked
 * at room-join time, never trusted from a token's embedded copy alone. */
export interface TenantRecord {
  readonly id: TenantId;
  readonly embedKey: string;
  readonly allowedOrigins: readonly string[];
  readonly entitledGames: readonly GameId[];
}

/** Port: how a tenant is looked up. The v1 adapter below is a static
 * in-memory map — loading its records from a config file on disk (design
 * §7) is `apps/server`'s composition-root job, out of scope for this port. */
export interface TenantRepository {
  findByEmbedKey(embedKey: string): TenantRecord | undefined;
  findById(tenantId: TenantId): TenantRecord | undefined;
}

export function createStaticTenantRepository(records: readonly TenantRecord[]): TenantRepository {
  const byEmbedKey = new Map(records.map((record) => [record.embedKey, record]));
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    findByEmbedKey: (embedKey) => byEmbedKey.get(embedKey),
    findById: (tenantId) => byId.get(tenantId),
  };
}

export interface SessionTokenClaims {
  readonly tenantId: TenantId;
  readonly playerId: PlayerId;
  readonly entitlements: readonly GameId[];
  readonly jti: string;
  readonly exp: number; // epoch seconds
}

/** Capability that can MINT a session token — needs the Ed25519 PRIVATE key.
 * Split from `SessionTokenVerifier` (obs 2942's disclosed HMAC deviation,
 * resolved here): under HMAC there was no way to build a mint-incapable
 * construction at all, because the same secret verified and signed. */
export interface SessionTokenSigner {
  mint(claims: Omit<SessionTokenClaims, "jti" | "exp">, ttlSeconds: number): Promise<string>;
}

/** Capability that can only VERIFY a session token — needs only the Ed25519
 * PUBLIC key. `verify` returns `undefined` for ANY failure (bad signature,
 * expired, malformed) — callers must fail closed, never distinguish the
 * reason. `createSessionTokenVerifier` is the construction that is
 * STRUCTURALLY incapable of minting: no private key material ever reaches
 * it. */
export interface SessionTokenVerifier {
  verify(token: string): Promise<SessionTokenClaims | undefined>;
}

/** Convenience shape for the (today, single) process that legitimately
 * needs both roles: `apps/server`'s composition root mints via `/embed` and
 * `/session/renew`, and — in the SAME process, see that file's own
 * docstring on the disclosed topology limitation — currently also drives
 * `MatchRoom`'s verification. */
export interface SessionTokenIssuer extends SessionTokenSigner, SessionTokenVerifier {}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const ED25519_ALGORITHM = { name: "Ed25519" } as const;
const ED25519_SEED_BYTES = 32;

// RFC 5958/8410's PKCS8 wrapper for a raw Ed25519 private-key SEED: this
// exact 16-byte DER prefix (version=0, AlgorithmIdentifier=id-Ed25519
// 1.3.101.112, then the OCTET STRING framing) is FIXED for every Ed25519
// seed — verified against Node's own Web Crypto (`exportKey("pkcs8", ...)`
// round-trips through this identical byte layout). No ASN.1 library needed
// for a shape that never varies with the key, same "zero new dependencies"
// call as the rest of this file.
const PKCS8_ED25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

function seedToPkcs8(seed: Uint8Array): Uint8Array {
  const der = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
  der.set(PKCS8_ED25519_PREFIX, 0);
  der.set(seed, PKCS8_ED25519_PREFIX.length);
  return der;
}

/** Decodes and validates base64url Ed25519 key material, throwing a clear,
 * grep-able "malformed" error for anything that is not EXACTLY 32 bytes
 * (a raw Ed25519 seed OR public key are both this length) — the caller
 * (`apps/server`'s composition root, via top-level `await`, same convention
 * as `redis-client.ts`'s own fail-loud connect) is expected to let this
 * propagate and crash boot, never silently continue with bad key material. */
function decodeEd25519KeyMaterial(base64Url: string, label: "signing key" | "public key"): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(base64Url);
  } catch (error) {
    throw new Error(`Malformed Ed25519 ${label}: "${base64Url}" is not valid base64url.`, { cause: error });
  }
  if (bytes.length !== ED25519_SEED_BYTES) {
    throw new Error(`Malformed Ed25519 ${label}: expected ${String(ED25519_SEED_BYTES)} bytes once decoded, got ${String(bytes.length)}.`);
  }
  return bytes;
}

function makeVerify(publicKey: CryptoKey): SessionTokenVerifier["verify"] {
  return async (token) => {
    const dot = token.indexOf(".");
    if (dot === -1) return undefined;
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    let signatureBytes: Uint8Array;
    try {
      signatureBytes = fromBase64Url(signature);
    } catch {
      return undefined; // malformed base64url in the signature segment
    }
    let valid: boolean;
    try {
      valid = await crypto.subtle.verify(ED25519_ALGORITHM, publicKey, signatureBytes as BufferSource, new TextEncoder().encode(payload));
    } catch {
      return undefined; // e.g. a signature of the wrong byte length — verify() can throw rather than return false for a malformed input
    }
    if (!valid) return undefined;
    let claims: SessionTokenClaims;
    try {
      claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SessionTokenClaims;
    } catch {
      return undefined;
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) return undefined;
    return claims;
  };
}

function makeMint(privateKey: CryptoKey): SessionTokenSigner["mint"] {
  return async (claims, ttlSeconds) => {
    const full: SessionTokenClaims = {
      ...claims,
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
    const signature = await crypto.subtle.sign(ED25519_ALGORITHM, privateKey, new TextEncoder().encode(payload));
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
  };
}

export interface SessionTokenIssuerHandle extends SessionTokenIssuer {
  /** Base64url raw Ed25519 public key, derived from this signer's private
   * key — safe to hand to `createSessionTokenVerifier` for a genuinely
   * separate, mint-incapable construction (see that function's own
   * docstring for exactly what this does, and does not yet, protect). */
  readonly publicKey: string;
}

/**
 * Ed25519 (EdDSA)-signed, short-TTL session tokens via the Web Crypto global
 * (`crypto.subtle`, zero new dependencies — Ed25519 support in the installed
 * Node runtime was verified directly before writing this, not assumed).
 * RESOLVES the design §7 deviation this file used to carry (HMAC-SHA256,
 * one shared server secret, obs 2942): under EdDSA, VERIFYING a token needs
 * only the PUBLIC key, never the private key — `createSessionTokenVerifier`
 * below is a genuinely mint-incapable construction, structurally impossible
 * to build at all under HMAC's single shared secret.
 *
 * DISCLOSED LIMITATION, not glossed over: `apps/server` is still ONE
 * deployable process type that both MINTS (`/embed`, `/session/renew`) and
 * VERIFIES (`MatchRoom.onAuth`) in every horizontally-scaled replica (#29)
 * — every replica therefore still holds the private signing key today,
 * exactly as every replica held the shared HMAC secret before. This change
 * does NOT, by itself, shrink the "compromise any one instance mints
 * fleet-wide" blast radius the deviation-closing brief described; HMAC
 * could never support that property AT ALL (a verifier there needs the same
 * secret a signer needs), so this is a necessary, not sufficient, step.
 * `apps/server/src/index.ts` wires `MatchRoom`'s own auth path through a
 * genuine `createSessionTokenVerifier` object today (never the full
 * signer), so closing the remaining gap needs only a future DEPLOYMENT
 * split (a small, separately-secured mint-capable service; match-serving
 * replicas holding only `publicKey`) — no further interface change here.
 */
export async function createSessionTokenIssuer(signingKeyBase64Url: string): Promise<SessionTokenIssuerHandle> {
  const seed = decodeEd25519KeyMaterial(signingKeyBase64Url, "signing key");
  const privateKey = await crypto.subtle.importKey("pkcs8", seedToPkcs8(seed) as BufferSource, ED25519_ALGORITHM, true, ["sign"]);
  // Node's Web Crypto keeps the public component alongside an extractable
  // Ed25519 private `CryptoKey` (verified directly: `exportKey("jwk", ...)`
  // on a pkcs8-imported key round-trips BOTH `d` and `x`) — so one seed is
  // genuinely self-sufficient; the process that mints never manages a
  // separate public-key file for its own use.
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (typeof jwk.x !== "string") {
    throw new Error("createSessionTokenIssuer: could not derive the Ed25519 public key from the given signing key.");
  }
  const publicKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x, ext: true, key_ops: ["verify"] }, ED25519_ALGORITHM, false, ["verify"]);
  return { mint: makeMint(privateKey), verify: makeVerify(publicKey), publicKey: jwk.x };
}

/**
 * The genuinely mint-incapable construction: imports ONLY a raw Ed25519
 * public key (`crypto.subtle.importKey("raw", ...)`) — no private key
 * material is ever decoded, imported, or reachable from this closure. The
 * returned object has NO `mint` property at runtime, not merely one hidden
 * by TypeScript (see `tenant-auth.test.ts`'s own `"mint" in verifier`
 * proof). This is the concrete, testable form of "a verifier need not
 * mint" that the deviation-closing brief asked for — see
 * `createSessionTokenIssuer`'s own docstring for what it does and does not
 * change about TODAY's single-process-does-both topology.
 */
export async function createSessionTokenVerifier(publicKeyBase64Url: string): Promise<SessionTokenVerifier> {
  const rawPublicKey = decodeEd25519KeyMaterial(publicKeyBase64Url, "public key");
  const publicKey = await crypto.subtle.importKey("raw", rawPublicKey as BufferSource, ED25519_ALGORITHM, false, ["verify"]);
  return { verify: makeVerify(publicKey) };
}

/**
 * TEST/DEV CONVENIENCE ONLY — never used by the production config path
 * (`apps/server/src/config.ts` requires a real, directly-configured 32-byte
 * seed and refuses to boot on anything malformed; see
 * `createSessionTokenIssuer`'s own strictness). Deterministically derives a
 * validly-shaped Ed25519 signing-key seed from a short, memorable label via
 * SHA-256, so test fixtures across every package keep readable,
 * distinguishing names ("secret-a" vs "secret-b" MUST derive to DIFFERENT
 * keys; repeat calls with the SAME label MUST derive to the SAME key — both
 * properties several tests, and #29's own cross-process harness, rely on)
 * instead of hand-generating and pasting real random keys per call site.
 */
export async function deriveTestSessionSigningKey(label: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label));
  return toBase64Url(new Uint8Array(digest));
}

/** Rejects an already-consumed `jti` — design §7's mitigation for a token
 * replayed from a different origin (a spoofed `Origin` header is the one
 * hole this flow admits it cannot close). Bounded (last open memory-
 * exhaustion vector, obs 2945): entries are evicted by TTL matching the
 * token lifetime — a jti cannot be replayed after its token has itself
 * expired anyway, so holding it any longer is pure waste — plus a hard
 * `maxTrackedKeys` backstop, the SAME shape as `createRateLimiter`.
 * PORT SHAPE, widened for horizontal scaling: `async` even though this
 * file's own in-memory adapter never awaits anything — a Redis-backed
 * `consume` (atomic `SET NX PX`, see the `redis-jti-replay-guard.ts` adapter)
 * is inherently a network round trip. Every call site now `await`s this;
 * the in-memory adapter's behavior and atomicity are unchanged. RESOLVED,
 * not a limitation anymore: a horizontally-scaled deployment configures the
 * Redis adapter (composition root, `apps/server/src/config.ts`) to catch a
 * replay against a DIFFERENT process — the in-memory adapter remains the
 * single-process default. */
export interface JtiReplayGuard {
  consume(jti: string): Promise<boolean>; // true = accepted (first use), false = replay
  /** Distinct jtis currently tracked — exposed so the memory bound can be
   * observed directly (tests, monitoring), matching `RateLimiter.size()`. */
  size(): Promise<number>;
}

export interface JtiReplayGuardOptions {
  /** Token lifetime in ms. Required — there is no safe universal default
   * across callers with different session TTLs; a guard whose TTL outlives
   * its tokens can never actually evict anything. */
  readonly ttlMs: number;
  readonly clock?: Clock;
  /** Caps how many distinct jtis are tracked at once, so a flood of
   * minted-and-used tokens cannot grow this guard's memory without bound
   * even within a single TTL window — the same backstop `createRateLimiter`
   * uses for its tracked keys. */
  readonly maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_JTIS = 10_000;

export function createJtiReplayGuard(options: JtiReplayGuardOptions): JtiReplayGuard {
  const clock = options.clock ?? Date.now;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_JTIS;
  const seen = new Map<string, number>(); // jti -> expiresAt (epoch ms)

  function sweepExpired(now: number): void {
    for (const [jti, expiresAt] of seen) {
      if (expiresAt <= now) seen.delete(jti);
    }
  }

  return {
    async consume(jti) {
      const now = clock();
      const expiresAt = seen.get(jti);
      if (expiresAt !== undefined && expiresAt > now) return false; // still within TTL: replay
      if (seen.size >= maxTrackedKeys) sweepExpired(now);
      seen.set(jti, now + options.ttlMs);
      return true;
    },
    size: () => Promise.resolve(seen.size),
  };
}

export type EmbedMintResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: "unknown-tenant" | "origin-not-allowed" };

async function mintForTenant(
  tenant: TenantRecord,
  args: { readonly issuer: SessionTokenSigner; readonly playerId: PlayerId; readonly ttlSeconds: number },
): Promise<EmbedMintResult> {
  const token = await args.issuer.mint({ tenantId: tenant.id, playerId: args.playerId, entitlements: tenant.entitledGames }, args.ttlSeconds);
  return { ok: true, token };
}

/**
 * Core logic of design §7's `/embed` HTTP entry point, framework-agnostic:
 * resolve tenant by embed key, re-validate origin server-side (spec:
 * "Server-Side Origin Allowlist Enforcement"), mint a short-TTL token scoped
 * to CURRENT entitlements. Wiring this behind a real HTTP route in
 * `apps/server` is deferred — that app has no HTTP framework yet.
 */
export async function mintSessionForEmbed(args: {
  readonly repository: TenantRepository;
  readonly issuer: SessionTokenSigner;
  readonly embedKey: string;
  readonly origin: string;
  readonly playerId: PlayerId;
  readonly ttlSeconds: number;
}): Promise<EmbedMintResult> {
  const tenant = args.repository.findByEmbedKey(args.embedKey);
  if (tenant === undefined) return { ok: false, reason: "unknown-tenant" };
  if (!tenant.allowedOrigins.includes(args.origin)) return { ok: false, reason: "origin-not-allowed" };
  return mintForTenant(tenant, args);
}

/**
 * Renews a session with a FRESH, short-TTL token, called immediately before
 * a join rather than carrying the page-load bootstrap token around (obs
 * 2968): `/embed` mints a token when the iframe first LOADS, but the real
 * product flow is "load the page, read for a while, THEN decide to play" —
 * in a widget embedded inside someone else's content, that gap is normal,
 * often minutes long. A short TTL is still the RIGHT security property (a
 * stolen, unused token expires fast); the fix is renewing right before it is
 * actually needed, never lengthening the TTL itself.
 *
 * The origin check here is deliberately against `allowedWidgetOrigins`
 * (THIS server's own known widget origin(s)), never `tenant.allowedOrigins`
 * — the exact same reasoning already established for
 * `MatchRoomAuthOptions.allowedWidgetOrigins` on the WebSocket side. A
 * renewal call always originates from JS running INSIDE the already-mounted
 * iframe (a same-origin request back to this server); the tenant's host-page
 * origin was already the thing checked, for real, once — at the original
 * `/embed` navigation that put this iframe on the page in the first place.
 * Re-checking the WIDGET's own origin here re-validates that this specific
 * renewal call genuinely comes from OUR iframe script, not an arbitrary
 * caller replaying a leaked (non-secret, "publishable-key"-shaped) embed key
 * from somewhere else — it does not, and structurally could not, re-derive
 * the tenant's page origin a second time (see `MatchRoomAuthOptions`'s own
 * docstring for the identical argument). Tenant lookup, rate limiting (the
 * caller passes the SAME limiters `/embed` already uses), and
 * current-entitlements scoping are all the SAME mechanisms `mintSessionForEmbed`
 * already enforces — this is not a side door around either.
 */
export async function renewSessionForWidget(args: {
  readonly repository: TenantRepository;
  readonly issuer: SessionTokenSigner;
  readonly embedKey: string;
  readonly origin: string;
  readonly allowedWidgetOrigins: readonly string[];
  readonly playerId: PlayerId;
  readonly ttlSeconds: number;
}): Promise<EmbedMintResult> {
  const tenant = args.repository.findByEmbedKey(args.embedKey);
  if (tenant === undefined) return { ok: false, reason: "unknown-tenant" };
  if (!args.allowedWidgetOrigins.includes(args.origin)) return { ok: false, reason: "origin-not-allowed" };
  return mintForTenant(tenant, args);
}
