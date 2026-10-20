import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Role } from "./session";

export type { Role };

export async function createSession(userId: string, role: Role) {
  const token = await signSession({ userId, role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Current user, re-read from the database so role changes and deactivation apply immediately
export const currentUser = cache(async () => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) return null;
  return user;
});

export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role as Role)) redirect("/");
  return user;
}

export const requireManager = () => requireUser(["ADMIN", "MANAGER"]);
export const requireAdmin = () => requireUser(["ADMIN"]);

export function isManager(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
