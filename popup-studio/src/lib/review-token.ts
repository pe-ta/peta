import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { appSecret as secret } from "./secret";

/** Signed, unguessable path segment for the client approval portal. */
export function reviewToken(briefId: string) {
  const sig = createHmac("sha256", secret()).update(briefId).digest("hex").slice(0, 20);
  return `${briefId}.${sig}`;
}

export function verifyReviewToken(token: string): string | null {
  const [briefId, sig] = token.split(".");
  if (!briefId || !sig) return null;
  const expected = createHmac("sha256", secret()).update(briefId).digest("hex").slice(0, 20);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return briefId;
}

/** Signed path segment for the read-only client report. A different purpose than the review link, so one cannot be turned into the other. */
export function reportToken(briefId: string) {
  const sig = createHmac("sha256", secret()).update(`report:${briefId}`).digest("hex").slice(0, 20);
  return `${briefId}.${sig}`;
}

export function verifyReportToken(token: string): string | null {
  const [briefId, sig] = token.split(".");
  if (!briefId || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`report:${briefId}`).digest("hex").slice(0, 20);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return briefId;
}
