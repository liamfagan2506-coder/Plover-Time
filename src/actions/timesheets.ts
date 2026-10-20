"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { back, num, optStr, str } from "@/lib/forms";
import { addLocalDays, fmtDate, fmtRange, parseLocalInput } from "@/lib/time";

const EARLY_CLOCK_IN_MINUTES = 60;

export async function clockIn(form: FormData) {
  const user = await requireUser();
  const now = new Date();
  const shift = await db.shift.findUnique({ where: { id: str(form, "shiftId") }, include: { timesheet: true } });
  if (!shift || shift.employeeId !== user.id || shift.status !== "PUBLISHED") back("/", { error: "That shift isn't yours." });
  if (shift.timesheet) back("/", { error: "You've already clocked in for this shift." });
  if (shift.start.getTime() - now.getTime() > EARLY_CLOCK_IN_MINUTES * 60_000) back("/", { error: "It's too early to clock in for this shift." });
  if (shift.end < now) back("/", { error: "This shift has already finished. Ask your manager to add your hours." });
  const open = await db.timesheet.findFirst({ where: { employeeId: user.id, clockOut: null } });
  if (open) back("/", { error: "Clock out of your current shift first." });

  await db.timesheet.create({ data: { shiftId: shift.id, employeeId: user.id, clockIn: now, breakMinutes: shift.breakMinutes } });
  revalidatePath("/", "layout");
  back("/", { ok: "Clocked in. Have a good shift." });
}

export async function clockOut(form: FormData) {
  const user = await requireUser();
  const ts = await db.timesheet.findUnique({ where: { id: str(form, "id") } });
  if (!ts || ts.employeeId !== user.id || ts.clockOut) back("/", { error: "You're not clocked in." });
  await db.timesheet.update({
    where: { id: ts.id },
    data: { clockOut: new Date(), breakMinutes: Math.max(0, Math.round(num(form, "breakMinutes"))), notes: optStr(form, "notes") },
  });
  revalidatePath("/", "layout");
  back("/", { ok: "Clocked out. Your timesheet has been sent for approval." });
}

export async function decideTimesheets(form: FormData) {
  const manager = await requireManager();
  const returnTo = str(form, "returnTo") || "/timesheets";
  const approve = str(form, "decision") === "approve";
  const ids = form.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) back(returnTo, { error: "Select at least one timesheet." });

  const sheets = await db.timesheet.findMany({
    where: { id: { in: ids }, status: "PENDING", clockOut: { not: null } },
    include: { employee: true },
  });
  await db.timesheet.updateMany({
    where: { id: { in: sheets.map((s) => s.id) } },
    data: approve
      ? { status: "APPROVED", approverId: manager.id, approvedAt: new Date() }
      : { status: "REJECTED", approverId: manager.id, approvedAt: null },
  });
  if (!approve) {
    for (const s of sheets) {
      await notify([s.employee], "Timesheet rejected", `Your timesheet for ${fmtDate(s.clockIn)} was rejected. Please speak to your manager.`);
    }
  }
  revalidatePath("/", "layout");
  back(returnTo, { ok: `${sheets.length} timesheet(s) ${approve ? "approved" : "rejected"}.` });
}

// Managers can correct times, or add hours for a shift the guard didn't clock in for
export async function saveTimesheet(form: FormData) {
  await requireManager();
  const returnTo = str(form, "returnTo") || "/timesheets";
  const id = optStr(form, "id");
  let clockIn: Date, clockOut: Date;
  try {
    clockIn = parseLocalInput(str(form, "clockIn"));
    clockOut = parseLocalInput(str(form, "clockOut"));
  } catch {
    back(returnTo, { error: "Enter valid start and finish times." });
  }
  if (clockOut <= clockIn) clockOut = addLocalDays(clockOut, 1);
  const data = {
    clockIn,
    clockOut,
    breakMinutes: Math.max(0, Math.round(num(form, "breakMinutes"))),
    notes: optStr(form, "notes"),
  };

  if (id) {
    const ts = await db.timesheet.findUniqueOrThrow({ where: { id } });
    if (ts.status === "EXPORTED") back(returnTo, { error: "This timesheet has already been exported to Xero." });
    await db.timesheet.update({ where: { id }, data: { ...data, status: "PENDING", approverId: null, approvedAt: null } });
  } else {
    const shift = await db.shift.findUniqueOrThrow({ where: { id: str(form, "shiftId") }, include: { timesheet: true } });
    if (!shift.employeeId) back(returnTo, { error: "That shift has no employee." });
    if (shift.timesheet) back(returnTo, { error: "That shift already has a timesheet." });
    await db.timesheet.create({ data: { ...data, shiftId: shift.id, employeeId: shift.employeeId } });
  }
  revalidatePath("/", "layout");
  back(returnTo, { ok: "Timesheet saved and ready to approve." });
}

export async function markNoShow(form: FormData) {
  await requireManager();
  const shift = await db.shift.findUniqueOrThrow({ where: { id: str(form, "shiftId") }, include: { site: true, employee: true } });
  await db.shift.update({ where: { id: shift.id }, data: { status: "CANCELLED", notes: [shift.notes, "No-show"].filter(Boolean).join(" · ") } });
  if (shift.employee) {
    await notify([shift.employee], "Missed shift recorded", `No timesheet was recorded for ${fmtDate(shift.start)} ${fmtRange(shift.start, shift.end)} at ${shift.site.name}.`);
  }
  revalidatePath("/", "layout");
  back(str(form, "returnTo") || "/timesheets", { ok: "Marked as a no-show." });
}
