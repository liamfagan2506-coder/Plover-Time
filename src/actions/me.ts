"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { notifyManagers } from "@/lib/notify";
import { back, optStr, str } from "@/lib/forms";
import { addLocalDays, fmtDate, fmtRange, parseLocalDate, startOfLocalDay } from "@/lib/time";
import { describeRule, expandRules } from "@/lib/availability";

function toMinutes(v: string): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Create or update an availability rule. Managers can do this for anyone; staff only for themselves.
export async function saveRule(form: FormData) {
  const me = await requireUser();
  const userId = isManager(me.role) && str(form, "userId") ? str(form, "userId") : me.id;
  const id = optStr(form, "id");
  const page = `/availability${userId !== me.id ? `?user=${userId}` : ""}`;
  const fail: (error: string) => never = (error) => back(id ? `${page}${page.includes("?") ? "&" : "?"}edit=${id}` : page, { error });

  const repeat = ["NONE", "WEEKLY", "FORTNIGHTLY"].includes(str(form, "repeat")) ? str(form, "repeat") : "NONE";
  const weekdays = form.getAll("weekdays").map(String).filter((d) => /^[0-6]$/.test(d));
  const allDay = form.get("allDay") === "on";
  const startMinute = allDay ? null : toMinutes(str(form, "startTime"));
  const endMinute = allDay ? null : toMinutes(str(form, "endTime"));

  let startDate: Date;
  let endDate: Date | null = null;
  try {
    startDate = parseLocalDate(str(form, "startDate"));
    if (str(form, "endDate")) endDate = parseLocalDate(str(form, "endDate"));
  } catch {
    fail("Choose valid dates.");
  }
  if (repeat === "NONE" && !endDate) endDate = startDate;
  if (endDate && endDate < startDate) fail("The end date is before the start date.");
  if (endDate && endDate < startOfLocalDay(new Date())) fail("Those dates have already passed.");
  if (repeat !== "NONE" && weekdays.length === 0) fail("Pick at least one day of the week.");
  if (!allDay && (startMinute == null || endMinute == null)) fail("Enter a start and end time, or tick All day.");
  if (!allDay && startMinute === endMinute) fail("The start and end times are the same.");

  const data = {
    userId,
    repeat,
    weekdays: repeat === "NONE" ? "" : weekdays.join(","),
    startDate,
    endDate,
    allDay,
    startMinute,
    endMinute,
    note: optStr(form, "note"),
  };

  if (id) {
    const existing = await db.availabilityRule.findUnique({ where: { id } });
    if (!existing || (existing.userId !== me.id && !isManager(me.role))) fail("That rule no longer exists.");
    await db.availabilityRule.update({ where: { id }, data });
  } else {
    await db.availabilityRule.create({ data: { ...data, createdById: me.id } });
  }

  // Tell managers if this clashes with shifts the person is already rostered on
  const rule = { id: id ?? "new", ...data };
  const horizon = endDate ? addLocalDays(endDate, 1) : addLocalDays(startDate, 120);
  const shifts = await db.shift.findMany({
    where: { employeeId: userId, status: { in: ["DRAFT", "PUBLISHED"] }, start: { gte: new Date(), lt: horizon } },
    include: { site: true },
    orderBy: { start: "asc" },
  });
  const blocks = expandRules([rule], new Date(), horizon);
  const clashes = shifts.filter((s) => blocks.some((b) => b.start < s.end && b.end > s.start));
  const owner = userId === me.id ? me : await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (clashes.length) {
    await notifyManagers(
      "Availability clash",
      `${owner.firstName} ${owner.lastName} is now unavailable (${describeRule(rule)}) but is rostered on:\n` +
        clashes.slice(0, 10).map((s) => `${fmtDate(s.start)} ${fmtRange(s.start, s.end)} at ${s.site.name}`).join("\n"),
    );
  }

  revalidatePath("/", "layout");
  back(page, {
    ok: clashes.length
      ? `Saved. ${clashes.length} rostered shift(s) clash with this, so managers have been told${userId === me.id ? ". You may also want to request a swap" : ""}.`
      : "Saved.",
  });
}

export async function deleteRule(form: FormData) {
  const me = await requireUser();
  const rule = await db.availabilityRule.findUnique({ where: { id: str(form, "id") } });
  const page = `/availability${rule && rule.userId !== me.id ? `?user=${rule.userId}` : ""}`;
  if (rule && (rule.userId === me.id || isManager(me.role))) await db.availabilityRule.delete({ where: { id: rule.id } });
  revalidatePath("/", "layout");
  back(page, { ok: "Removed." });
}

// Creates (or replaces) the secret link used to subscribe to shifts in a calendar app
export async function resetCalendarLink() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: randomBytes(24).toString("base64url") } });
  revalidatePath("/account");
  back("/account", { ok: "Calendar link ready. Add it to your calendar app below." });
}
