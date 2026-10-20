"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser, type Role } from "@/lib/auth";

// Simple in-memory lockout: 5 failed attempts per email locks it for 15 minutes.
const failures = new Map<string, { count: number; until: number }>();

export type FormState = { error?: string; ok?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");

  const f = failures.get(email);
  if (f && f.until > Date.now()) return { error: "Too many attempts. Try again in 15 minutes." };

  const user = await db.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    const count = (f?.count || 0) + 1;
    failures.set(email, { count: count >= 5 ? 0 : count, until: count >= 5 ? Date.now() + 15 * 60_000 : 0 });
    return { error: "Incorrect email or password." };
  }
  failures.delete(email);
  await createSession(user.id, user.role as Role);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(form.get("current") || "");
  const next = String(form.get("next") || "");
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Current password is incorrect." };
  if (next.length < 10) return { error: "New password must be at least 10 characters." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  return { ok: "Password updated." };
}

export async function updatePreferences(form: FormData) {
  const user = await requireUser();
  await db.user.update({
    where: { id: user.id },
    data: {
      phone: String(form.get("phone") || "").trim() || null,
      notifyEmail: form.get("notifyEmail") === "on",
      notifySms: form.get("notifySms") === "on",
    },
  });
  redirect("/account?saved=1");
}
