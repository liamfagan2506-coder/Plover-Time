"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { back, optStr, str } from "@/lib/forms";
import { parseLocalDate, startOfLocalDay } from "@/lib/time";

export async function setUnavailable(form: FormData) {
  const user = await requireUser();
  let date: Date;
  try {
    date = parseLocalDate(str(form, "date"));
  } catch {
    back("/availability", { error: "Choose a date." });
  }
  if (date < startOfLocalDay(new Date())) back("/availability", { error: "That date has already passed." });
  const note = optStr(form, "note");
  await db.unavailability.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { note },
    create: { userId: user.id, date, note },
  });
  const rostered = await db.shift.count({
    where: { employeeId: user.id, status: { in: ["DRAFT", "PUBLISHED"] }, start: { gte: date, lt: new Date(date.getTime() + 86_400_000) } },
  });
  revalidatePath("/", "layout");
  back("/availability", {
    ok: rostered
      ? "Saved. You're already rostered that day, so please also tell your manager or request a swap."
      : "Saved. Managers will see you're unavailable.",
  });
}

export async function clearUnavailable(form: FormData) {
  const user = await requireUser();
  await db.unavailability.deleteMany({ where: { id: str(form, "id"), userId: user.id } });
  revalidatePath("/", "layout");
  back("/availability", { ok: "Removed." });
}

// Creates (or replaces) the secret link used to subscribe to shifts in a calendar app
export async function resetCalendarLink() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: randomBytes(24).toString("base64url") } });
  revalidatePath("/account");
  back("/account", { ok: "Calendar link ready. Add it to your calendar app below." });
}
