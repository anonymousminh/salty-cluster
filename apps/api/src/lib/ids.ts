import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Player ids are secrets held by the browser. Elasticsearch only ever sees this hash. */
export function hashPlayerId(playerId: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${playerId}`).digest("hex").slice(0, 32);
}

export const newPlayerId = () => randomUUID();

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * QR check-in code for a booth. Deterministic (HMAC of the booth id), so printed
 * QR codes stay valid when the booths are re-seeded. Rotate BOOTH_CODE_SECRET to invalidate them.
 */
export function boothCode(boothId: string, secret: string): string {
  return createHmac("sha256", secret).update(boothId).digest("base64url").slice(0, 12);
}
