import { describe, expect, it } from "vitest";
import { createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import { handleEmbedRequest } from "./embed-handler.js";

const TENANT_ID = "tenant-a" as TenantId;
const ALLOWED_ORIGIN = "https://tenant-a.example";

function deps() {
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_live_t_a", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["truco-argentino"] },
  ]);
  const issuer = createSessionTokenIssuer("test-secret");
  return { repository, issuer, ttlSeconds: 120 };
}

describe("handleEmbedRequest (spec: tenant-catalog — origin allowlist enforcement)", () => {
  it("mints a token for an allowed origin and a known embed key", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, deps());
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { token: string };
    expect(typeof body.token).toBe("string");
  });

  it("rejects a disallowed origin and issues no token", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, "https://evil.example", deps());
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("token");
  });

  it("rejects when the Origin header is missing entirely", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, undefined, deps());
    expect(result.status).toBe(400);
  });

  it("rejects an unknown embed key", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_does_not_exist");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, deps());
    expect(result.status).toBe(403);
  });
});
