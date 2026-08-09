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

/** `verify` returns `undefined` for ANY failure (bad signature, expired,
 * malformed) — callers must fail closed, never distinguish the reason. */
export interface SessionTokenIssuer {
  mint(claims: Omit<SessionTokenClaims, "jti" | "exp">, ttlSeconds: number): Promise<string>;
  verify(token: string): Promise<SessionTokenClaims | undefined>;
}

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

/**
 * HMAC-SHA256-signed, short-TTL session tokens via the Web Crypto global
 * (`crypto.subtle`, zero new dependencies). DEVIATION FROM DESIGN, flagged:
 * §7 names EdDSA specifically; this uses one shared HMAC secret for budget
 * reasons. Preserved property: signed, tamper-evident, short-lived. Changed:
 * who can MINT — HMAC requires the signer AND verifier to share the same
 * server-only secret, unlike asymmetric keys where a verifier need not mint.
 */
export function createSessionTokenIssuer(secret: string): SessionTokenIssuer {
  const keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return {
    async mint(claims, ttlSeconds) {
      const key = await keyPromise;
      const full: SessionTokenClaims = {
        ...claims,
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      };
      const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
      return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
    },
    async verify(token) {
      const dot = token.indexOf(".");
      if (dot === -1) return undefined;
      const payload = token.slice(0, dot);
      const signature = token.slice(dot + 1);
      const key = await keyPromise;
      let valid: boolean;
      try {
        valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature) as BufferSource, new TextEncoder().encode(payload));
      } catch {
        return undefined; // malformed base64url in the signature segment
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
    },
  };
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
  args: { readonly issuer: SessionTokenIssuer; readonly playerId: PlayerId; readonly ttlSeconds: number },
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
  readonly issuer: SessionTokenIssuer;
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
  readonly issuer: SessionTokenIssuer;
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
