import type { GameId, PlayerId } from "@hexdev/platform-contract";

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
 * hole this flow admits it cannot close). KNOWN LIMITATION: in-memory only,
 * unbounded growth — acceptable only because tokens are short-lived and v1
 * is single-process; a real deployment needs TTL eviction or a shared store. */
export interface JtiReplayGuard {
  consume(jti: string): boolean; // true = accepted (first use), false = replay
}

export function createJtiReplayGuard(): JtiReplayGuard {
  const seen = new Set<string>();
  return {
    consume(jti) {
      if (seen.has(jti)) return false;
      seen.add(jti);
      return true;
    },
  };
}

export type EmbedMintResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: "unknown-tenant" | "origin-not-allowed" };

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
  const token = await args.issuer.mint({ tenantId: tenant.id, playerId: args.playerId, entitlements: tenant.entitledGames }, args.ttlSeconds);
  return { ok: true, token };
}
