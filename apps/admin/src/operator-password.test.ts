import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { authenticateOperator, hashPassword, verifyPassword, type PasswordComparator } from "./operator-password.js";

/**
 * The most security-sensitive test file in this repository's history to
 * date (apply prompt, tenant-administration PR9): this codebase has never
 * before authenticated a human being — players deliberately enter with no
 * account (`selectionTagline` in `apps/widget-app/src/i18n.ts`: "Sentate a
 * jugar: sin instalar nada, sin crear cuenta."). There is no in-repo pattern
 * to copy for operator credentials, so every assumption here is checked
 * against reality rather than carried forward from somewhere else.
 */

describe("scrypt maxmem assumption (tasks §0.2) — settled empirically, not merely reasoned from the 128*N*r formula", () => {
  const N = 2 ** 15; // 32768 — design §11.1's chosen cost parameter
  const R = 8;
  const P = 1;

  it("N=2^15,r=8,p=1 throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS with NO explicit maxmem — Node's default maxmem (32 MiB) equals the naive 128*N*r figure and is NOT sufficient", () => {
    expect(() => crypto.scryptSync("probe-password", crypto.randomBytes(16), 32, { N, r: R, p: P })).toThrowError(
      expect.objectContaining({ code: "ERR_CRYPTO_INVALID_SCRYPT_PARAMS" }),
    );
  });

  it("an explicit maxmem of EXACTLY 128*N*r bytes (32 MiB, the naive formula's own figure) STILL throws — settles the design's disclosed inclusive/exclusive uncertainty: the real memory requirement is slightly ABOVE that naive figure, so the check is a strict '<', never '<='", () => {
    const naiveBytes = 128 * N * R; // 33_554_432 = 32 MiB, exactly Node's own default maxmem
    expect(() => crypto.scryptSync("probe-password", crypto.randomBytes(16), 32, { N, r: R, p: P, maxmem: naiveBytes })).toThrowError(
      expect.objectContaining({ code: "ERR_CRYPTO_INVALID_SCRYPT_PARAMS" }),
    );
  });

  it("an explicit maxmem of 64 MiB (operator-password.ts's own SCRYPT_MAXMEM constant) comfortably fixes it", () => {
    expect(() => crypto.scryptSync("probe-password", crypto.randomBytes(16), 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })).not.toThrow();
  });
});

describe("hashPassword / verifyPassword — round trip", () => {
  it("a correct password verifies", () => {
    const stored = hashPassword("correcto-caballo-bateria-grapa");
    expect(verifyPassword("correcto-caballo-bateria-grapa", stored)).toBe(true);
  });

  it("an incorrect password does not verify", () => {
    const stored = hashPassword("correcto-caballo-bateria-grapa");
    expect(verifyPassword("una-contrasena-distinta", stored)).toBe(false);
  });

  it("two hashes of the SAME password differ — the per-operator salt is genuinely random, never reused across accounts", () => {
    const a = hashPassword("misma-contrasena");
    const b = hashPassword("misma-contrasena");
    expect(a).not.toBe(b);
    expect(verifyPassword("misma-contrasena", a)).toBe(true);
    expect(verifyPassword("misma-contrasena", b)).toBe(true);
  });

  it("the stored format is self-describing: scrypt$N$r$p$salt$key, so a future parameter bump needs no migration (design §11.1)", () => {
    const stored = hashPassword("cualquier-cosa");
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toBe("32768");
    expect(parts[2]).toBe("8");
    expect(parts[3]).toBe("1");
  });

  it("verifyPassword re-derives using the STORED parameters, not today's constants — a hash written under different cost parameters still verifies, proving the format is actually consulted rather than merely written", () => {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync("legacy-password", salt, 32, { N: 2 ** 10, r: 4, p: 1, maxmem: 64 * 1024 * 1024 });
    const stored = `scrypt$1024$4$1$${salt.toString("base64")}$${key.toString("base64")}`;
    expect(verifyPassword("legacy-password", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });
});

describe("the stored value never equals the password and does not decode to it (tasks 8a.3/8a.4)", () => {
  it("the whole stored string differs from the plaintext password and does not contain it verbatim", () => {
    const password = "una-contrasena-bastante-larga-y-especifica";
    const stored = hashPassword(password);
    expect(stored).not.toBe(password);
    expect(stored).not.toContain(password);
  });

  it("neither the stored salt nor the derived key component decodes (base64) back to the plaintext password", () => {
    const password = "otra-contrasena-especifica-para-decodificar";
    const stored = hashPassword(password);
    const [, , , , saltB64, keyB64] = stored.split("$");
    expect(Buffer.from(saltB64!, "base64").toString("utf8")).not.toBe(password);
    expect(Buffer.from(keyB64!, "base64").toString("utf8")).not.toBe(password);
  });
});

/** Records every call a comparator receives, so a test can assert the exact
 * COUNT and the exact `stored` argument — proof that a specific comparison
 * ran, not merely that two outcomes looked alike. */
function capturingComparator(): {
  readonly comparator: PasswordComparator;
  readonly calls: readonly { readonly password: string; readonly stored: string }[];
} {
  const calls: { password: string; stored: string }[] = [];
  const comparator: PasswordComparator = (password, stored) => {
    calls.push({ password, stored });
    return verifyPassword(password, stored);
  };
  return { comparator, calls };
}

describe("authenticateOperator — constant-time failure across all three refusal causes (design §11.1, spec Domain E, tasks 8a.5/8a.6)", () => {
  it("a correct password on an enabled account authenticates, comparing against the account's OWN real hash exactly once", () => {
    const passwordHash = hashPassword("la-contrasena-correcta");
    const { comparator, calls } = capturingComparator();
    const result = authenticateOperator({ passwordHash, enabled: true }, "la-contrasena-correcta", { compare: comparator });
    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.stored).toBe(passwordHash);
  });

  it("a wrong password on an enabled account is refused, still comparing against the account's own real hash exactly once", () => {
    const passwordHash = hashPassword("la-contrasena-correcta");
    const { comparator, calls } = capturingComparator();
    const result = authenticateOperator({ passwordHash, enabled: true }, "una-contrasena-incorrecta", { compare: comparator });
    expect(result).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.stored).toBe(passwordHash);
  });

  it("an unknown username (no operator record) still invokes the comparator exactly once, against a fixed dummy hash — never zero comparisons", () => {
    const { comparator, calls } = capturingComparator();
    const result = authenticateOperator(undefined, "cualquier-contrasena", { compare: comparator });
    expect(result).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("a disabled account still invokes the comparator exactly once, against the SAME fixed dummy hash the unknown-username path uses — NEVER the account's own real stored hash", () => {
    const realPasswordHash = hashPassword("la-contrasena-real-de-la-cuenta-deshabilitada");

    const unknownUsername = capturingComparator();
    authenticateOperator(undefined, "cualquier-contrasena", { compare: unknownUsername.comparator });

    const disabledAccount = capturingComparator();
    const result = authenticateOperator({ passwordHash: realPasswordHash, enabled: false }, "cualquier-contrasena", { compare: disabledAccount.comparator });

    expect(result).toBe(false);
    expect(disabledAccount.calls).toHaveLength(1);
    // THE assertion the task demands: not merely "both return false
    // identically," but that the SAME fixed dummy hash was compared against
    // on both losing paths, and the disabled account's own real hash was
    // NEVER touched — a disabled account must cost exactly what an unknown
    // username costs, never what checking its own real hash would cost.
    expect(disabledAccount.calls[0]!.stored).not.toBe(realPasswordHash);
    expect(disabledAccount.calls[0]!.stored).toBe(unknownUsername.calls[0]!.stored);
  });

  it("uses the real default comparator (verifyPassword) when no deps are injected — the injection seam is test-only plumbing, not a production requirement", () => {
    const passwordHash = hashPassword("produccion-sin-inyeccion");
    expect(authenticateOperator({ passwordHash, enabled: true }, "produccion-sin-inyeccion")).toBe(true);
    expect(authenticateOperator({ passwordHash, enabled: true }, "otra-cosa")).toBe(false);
    expect(authenticateOperator(undefined, "cualquier-cosa")).toBe(false);
  });
});
