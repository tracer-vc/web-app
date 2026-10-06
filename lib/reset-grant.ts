import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Marks a session as opened by a password-reset link. Supabase records such a
// sign-in as a plain "otp" (the same as an email confirmation), so
// /auth/confirm sets this signed, httpOnly cookie after verifying a reset link,
// and /reset-password accepts only a session that carries it for its own user.
const COOKIE = "tracer-reset-grant";
const TTL_SECONDS = 15 * 60;

function sign(payload: string) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(`reset-grant:${payload}`).digest("base64url");
}

export async function grantPasswordReset(userId: string) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + TTL_SECONDS}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function hasPasswordResetGrant(userId: string) {
  const value = (await cookies()).get(COOKIE)?.value;
  const [id, exp, mac] = value?.split(".") ?? [];
  if (!id || !exp || !mac || id !== userId || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function clearPasswordResetGrant() {
  (await cookies()).delete(COOKIE);
}
