// Signed session cookie. Kept free of database imports so middleware can use it.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "plover_session";
export const SESSION_DAYS = 14;

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type SessionPayload = { userId: string; role: Role };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to a long random string");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: payload.userId as string, role: payload.role as Role };
  } catch {
    return null;
  }
}
