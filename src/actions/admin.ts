"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { requireAdmin, requireManager, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { back, num, optStr, str } from "@/lib/forms";
import { parseLocalDate } from "@/lib/time";

const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];

function tempPassword() {
  return randomBytes(9).toString("base64url");
}

// Show a temporary password once to the admin without putting it in the URL
async function showSecretOnce(message: string) {
  (await cookies()).set("plover_secret", message, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin/employees",
    maxAge: 60,
  });
}

// ---- Employees ----

export async function saveEmployee(form: FormData) {
  const admin = await requireAdmin();
  const id = optStr(form, "id");
  const returnTo = id ? `/admin/employees?edit=${id}` : "/admin/employees?new=1";
  const email = str(form, "email").toLowerCase();
  const role = str(form, "role");
  if (!email.includes("@")) back(returnTo, { error: "Enter a valid email." });
  if (!ROLES.includes(role)) back(returnTo, { error: "Choose a role." });
  if (id === admin.id && role !== "ADMIN") back(returnTo, { error: "You can't remove your own admin access." });

  const data = {
    email,
    role,
    firstName: str(form, "firstName"),
    lastName: str(form, "lastName"),
    phone: optStr(form, "phone"),
    xeroEmployeeId: optStr(form, "xeroEmployeeId"),
    rateWeekday: num(form, "rateWeekday"),
    rateSaturday: num(form, "rateSaturday"),
    rateSunday: num(form, "rateSunday"),
    ratePublicHoliday: num(form, "ratePublicHoliday"),
    active: id ? form.get("active") === "on" : true,
  };
  if (!data.firstName || !data.lastName) back(returnTo, { error: "Enter a first and last name." });
  const dupe = await db.user.findFirst({ where: { email, id: id ? { not: id } : undefined } });
  if (dupe) back(returnTo, { error: "Someone already uses that email." });

  if (id) {
    await db.user.update({ where: { id }, data });
    revalidatePath("/", "layout");
    back("/admin/employees", { ok: `${data.firstName}'s details saved.` });
  }

  const password = tempPassword();
  const user = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  await notify(
    [user],
    "Welcome to Plover Time",
    `Your account is ready. Sign in with ${email} and the temporary password ${password}, then change it under My account.`,
  );
  revalidatePath("/", "layout");
  await showSecretOnce(`${data.firstName}'s temporary password is ${password}`);
  back("/admin/employees", { ok: `${data.firstName} added and emailed their sign-in details.` });
}

export async function resetPassword(form: FormData) {
  await requireAdmin();
  const user = await db.user.findUniqueOrThrow({ where: { id: str(form, "id") } });
  const password = tempPassword();
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await notify([user], "Password reset", `Your Plover Time password was reset. Your temporary password is ${password}. Change it under My account.`);
  await showSecretOnce(`${user.firstName}'s temporary password is ${password}`);
  back("/admin/employees", { ok: `${user.firstName}'s password was reset and emailed to them.` });
}

// ---- Sites ----

export async function saveSite(form: FormData) {
  await requireManager();
  const id = optStr(form, "id");
  const data = {
    name: str(form, "name"),
    client: optStr(form, "client"),
    address: optStr(form, "address"),
    notes: optStr(form, "notes"),
    active: id ? form.get("active") === "on" : true,
  };
  if (!data.name) back("/sites", { error: "Enter a site name." });
  if (id) await db.site.update({ where: { id }, data });
  else await db.site.create({ data });
  revalidatePath("/sites");
  back("/sites", { ok: "Site saved." });
}

// ---- Public holidays ----

export async function addHoliday(form: FormData) {
  await requireAdmin();
  let date: Date;
  try {
    date = parseLocalDate(str(form, "date"));
  } catch {
    back("/admin/holidays", { error: "Choose a date." });
  }
  const name = str(form, "name");
  if (!name) back("/admin/holidays", { error: "Enter a name." });
  await db.publicHoliday.upsert({ where: { date }, update: { name }, create: { date, name } });
  revalidatePath("/", "layout");
  back("/admin/holidays", { ok: "Public holiday saved." });
}

export async function deleteHoliday(form: FormData) {
  await requireAdmin();
  await db.publicHoliday.delete({ where: { id: str(form, "id") } });
  revalidatePath("/", "layout");
  back("/admin/holidays", { ok: "Public holiday removed." });
}

// ---- Notifications ----

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}
