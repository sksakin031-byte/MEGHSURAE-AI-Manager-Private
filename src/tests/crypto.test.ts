import { describe, expect, it } from "vitest";
import { decrypt, encrypt, pkceChallenge, randomToken, safeEqual, sha256Hex } from "@/lib/crypto";

const SECRET = "x".repeat(40);

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("refresh-token-123", SECRET);
    const b = encrypt("refresh-token-123", SECRET);
    expect(a).not.toBe(b);
    expect(a.includes("refresh-token-123")).toBe(false);
    expect(decrypt(a, SECRET)).toBe("refresh-token-123");
  });
  it("rejects wrong key, tampering and malformed input", () => {
    const enc = encrypt("secret", SECRET);
    expect(() => decrypt(enc, "y".repeat(40))).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), SECRET)).toThrow();
    expect(() => decrypt("garbage", SECRET)).toThrow();
  });
  it("refuses short secrets", () => {
    expect(() => encrypt("a", "short")).toThrow();
  });
});

describe("helpers", () => {
  it("random tokens are unique and url-safe", () => {
    const a = randomToken(32);
    expect(a).not.toBe(randomToken(32));
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("PKCE challenge matches the RFC 7636 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("safeEqual and sha256Hex", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
