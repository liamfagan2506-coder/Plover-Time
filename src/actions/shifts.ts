"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireUser } from "@/lib/auth";
import { notify, notifyManagers } from "@/lib/notify";
import { back, num, optStr, str } from "@/lib/forms";
import { addLocalDays, fmtDate, fmtRange, parseLocalDate, parseLocalInput } from "@/lib/time";

function describe(shift: { start: Date; end: Date; site: { name: string } }) {
  return `${fmtDate(shift.start)} ${fmtRange(shift.start, shift.end)} at ${shift.site.name}`;
}

async function findOverlap(employeeId: string, start: Date, end: Date, excludeId?: string) {
  return db.shift.findFirst({
    where: {
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { not: "CANCELLED" },
      start: { lt: end },
      end: { gt: start },
    },
    include: { site: true },
  });
}

function readShiftForm(form: FormData) {
  const start = parseLocalInput(str(form, "start"));
  let end = parseLocalInput(str(form, "end"));
  // An end time earlier than the start means the shift finishes the next day
  if (end <= start) end = addLocalDays(end, 1);
  return {
    siteId: str(form, "siteId"),
    employeeId: optStr(form, "employeeId"),
    start,
    end,
    breakMinutes: Math.max(0, Math.round(num(form, "breakMinutes"))),
    role: optStr(form, "role"),
    notes: optStr(form, "notes"),
  };
}

export async function saveShift(form: FormData) {
  await requireManager();
  const returnTo = str(form, "returnTo") || "/roster";
  const id = optStr(form, "id");
  let data;
  try {
    data = readShiftForm(form);
  } catch {
    back(returnTo, { error: "Enter a valid start and end time." });
  }
  if (!data.siteId) back(returnTo, { error: "Choose a site." });
  if (data.end.getTime() - data.start.getTime() > 16 * 3_600_000) back(returnTo, { error: "Shifts can't be longer than 16 hours." });

  if (data.employeeId) {
    const clash = await findOverlap(data.employeeId, data.start, data.end, id ?? undefined);
    if (clash) back(returnTo, { error: `That employee already has a shift ${describe(clash)}.` });
  }

  if (id) {
    const before = await db.shift.findUniqueOrThrow({ where: { id } });
    const wasLive = before.status === "PUBLISHED" || before.status === "OPEN";
    const status = wasLive ? (data.employeeId ? "PUBLISHED" : "OPEN") : before.status;
    const shift = await db.shift.update({ where: { id }, data: { ...data, status }, include: { site: true, employee: true } });
    if (wasLive && shift.employee) await notify([shift.employee], "Shift updated", `Your shift is now ${describe(shift)}.`);
    if (wasLive && before.employeeId && before.employeeId !== data.employeeId) {
      const prev = await db.user.findUnique({ where: { id: before.employeeId } });
      if (prev) await notify([prev], "Shift removed", `You're no longer rostered for ${describe(shift)}.`);
    }
  } else {
    await db.shift.create({ data: { ...data, status: "DRAFT" } });
  }
  revalidatePath("/", "layout");
  back(returnTo, { ok: id ? "Shift updated." : "Shift added as a draft. Publish the week to notify staff." });
}

export async function cancelShift(form: FormData) {
  await requireManager();
  const returnTo = str(form, "returnTo") || "/roster";
  const shift = await db.shift.findUniqueOrThrow({ where: { id: str(form, "id") }, include: { site: true, employee: true, timesheet: true } });
  if (shift.timesheet) back(returnTo, { error: "This shift has a timesheet, so it can't be removed." });
  if (shift.status === "DRAFT") {
    await db.shift.delete({ where: { id: shift.id } });
  } else {
    await db.shift.update({ where: { id: shift.id }, data: { status: "CANCELLED" } });
    if (shift.employee) await notify([shift.employee], "Shift cancelled", `Your shift ${describe(shift)} has been cancelled.`);
  }
  revalidatePath("/", "layout");
  back(returnTo, { ok: "Shift removed." });
}

export async function publishWeek(form: FormData) {
  await requireManager();
  const weekStart = parseLocalDate(str(form, "week"));
  const weekEnd = addLocalDays(weekStart, 7);
  const returnTo = `/roster?week=${str(form, "week")}`;
  const drafts = await db.shift.findMany({
    where: { status: "DRAFT", start: { gte: weekStart, lt: weekEnd } },
    include: { site: true, employee: true },
    orderBy: { start: "asc" },
  });
  if (drafts.length === 0) back(returnTo, { error: "There are no draft shifts to publish this week." });

  for (const s of drafts) {
    await db.shift.update({ where: { id: s.id }, data: { status: s.employeeId ? "PUBLISHED" : "OPEN" } });
  }

  const byEmployee = new Map<string, typeof drafts>();
  for (const s of drafts) if (s.employee) byEmployee.set(s.employee.id, [...(byEmployee.get(s.employee.id) ?? []), s]);
  for (const shifts of byEmployee.values()) {
    const lines = shifts.map(describe).join("\n");
    await notify([shifts[0].employee!], "New shifts published", `You've been rostered for:\n${lines}`);
  }

  const open = drafts.filter((s) => !s.employeeId);
  if (open.length) {
    const staff = await db.user.findMany({ where: { active: true, role: "EMPLOYEE" } });
    await notify(staff, "Open shifts available", `${open.length} open shift(s) are available to claim:\n${open.map(describe).join("\n")}`);
  }
  revalidatePath("/", "layout");
  back(returnTo, { ok: `Published ${drafts.length} shift(s) and notified staff.` });
}

export async function copyPreviousWeek(form: FormData) {
  await requireManager();
  const week = str(form, "week");
  const weekStart = parseLocalDate(week);
  const prevStart = addLocalDays(weekStart, -7);
  const returnTo = `/roster?week=${week}`;
  const prev = await db.shift.findMany({ where: { start: { gte: prevStart, lt: weekStart }, status: { not: "CANCELLED" } } });
  if (prev.length === 0) back(returnTo, { error: "Last week has no shifts to copy." });

  // Skip shifts this week already has (same site and times), so copying twice adds nothing
  const existing = await db.shift.findMany({
    where: { start: { gte: weekStart, lt: addLocalDays(weekStart, 7) }, status: { not: "CANCELLED" } },
    select: { siteId: true, start: true, end: true },
  });
  const have = new Set(existing.map((s) => `${s.siteId}|${s.start.getTime()}|${s.end.getTime()}`));

  let copied = 0;
  let skipped = 0;
  for (const s of prev) {
    const start = addLocalDays(s.start, 7);
    const end = addLocalDays(s.end, 7);
    const key = `${s.siteId}|${start.getTime()}|${end.getTime()}`;
    if (have.has(key)) continue;
    have.add(key);
    const employeeId = s.employeeId && !(await findOverlap(s.employeeId, start, end)) ? s.employeeId : null;
    if (s.employeeId && !employeeId) skipped++;
    await db.shift.create({
      data: { siteId: s.siteId, employeeId, start, end, breakMinutes: s.breakMinutes, role: s.role, notes: s.notes, status: "DRAFT" },
    });
    copied++;
  }
  if (copied === 0) back(returnTo, { error: "This week already has all of last week's shifts. Nothing was copied." });
  revalidatePath("/", "layout");
  back(returnTo, {
    ok: `Copied ${copied} shift(s) as drafts.${skipped ? ` ${skipped} were left unassigned because of clashes.` : ""} Not right? Use "Clear drafts" to undo.`,
  });
}

export async function clearDrafts(form: FormData) {
  await requireManager();
  const week = str(form, "week");
  const weekStart = parseLocalDate(week);
  const { count } = await db.shift.deleteMany({
    where: { status: "DRAFT", start: { gte: weekStart, lt: addLocalDays(weekStart, 7) }, timesheet: null },
  });
  revalidatePath("/", "layout");
  back(`/roster?week=${week}`, count ? { ok: `Removed ${count} draft shift(s). Published shifts were not touched.` } : { error: "There are no drafts this week." });
}

// ---- Open shifts ----

export async function claimShift(form: FormData) {
  const user = await requireUser();
  const shift = await db.shift.findUniqueOrThrow({ where: { id: str(form, "id") }, include: { site: true } });
  if (shift.status !== "OPEN" || shift.start < new Date()) back("/open-shifts", { error: "That shift is no longer available." });
  const clash = await findOverlap(user.id, shift.start, shift.end);
  if (clash) back("/open-shifts", { error: `You already have a shift ${describe(clash)}.` });
  await db.shiftClaim.upsert({
    where: { shiftId_employeeId: { shiftId: shift.id, employeeId: user.id } },
    update: { status: "PENDING" },
    create: { shiftId: shift.id, employeeId: user.id },
  });
  await notifyManagers("Open shift claimed", `${user.firstName} ${user.lastName} wants ${describe(shift)}.`);
  revalidatePath("/", "layout");
  back("/open-shifts", { ok: "Request sent. A manager will confirm." });
}

export async function withdrawClaim(form: FormData) {
  const user = await requireUser();
  await db.shiftClaim.deleteMany({ where: { id: str(form, "id"), employeeId: user.id, status: "PENDING" } });
  revalidatePath("/", "layout");
  back("/open-shifts", { ok: "Request withdrawn." });
}

export async function decideClaim(form: FormData) {
  await requireManager();
  const approve = str(form, "decision") === "approve";
  const claim = await db.shiftClaim.findUniqueOrThrow({
    where: { id: str(form, "id") },
    include: { employee: true, shift: { include: { site: true, claims: { include: { employee: true } } } } },
  });
  if (claim.status !== "PENDING") back("/open-shifts", { error: "That request has already been handled." });
  const { shift } = claim;

  if (!approve) {
    await db.shiftClaim.update({ where: { id: claim.id }, data: { status: "REJECTED" } });
    await notify([claim.employee], "Shift request declined", `Your request for ${describe(shift)} wasn't approved.`);
  } else {
    if (shift.status !== "OPEN") back("/open-shifts", { error: "That shift has already been filled." });
    const clash = await findOverlap(claim.employeeId, shift.start, shift.end);
    if (clash) back("/open-shifts", { error: `${claim.employee.firstName} now has a clashing shift ${describe(clash)}.` });
    await db.$transaction([
      db.shift.update({ where: { id: shift.id }, data: { employeeId: claim.employeeId, status: "PUBLISHED" } }),
      db.shiftClaim.update({ where: { id: claim.id }, data: { status: "APPROVED" } }),
      db.shiftClaim.updateMany({ where: { shiftId: shift.id, id: { not: claim.id } }, data: { status: "REJECTED" } }),
    ]);
    await notify([claim.employee], "Shift confirmed", `You've got ${describe(shift)}.`);
    const others = shift.claims.filter((c) => c.id !== claim.id && c.status === "PENDING").map((c) => c.employee);
    await notify(others, "Shift filled", `${describe(shift)} has been filled by someone else.`);
  }
  revalidatePath("/", "layout");
  back("/open-shifts", { ok: approve ? "Shift assigned." : "Request declined." });
}

// ---- Swaps ----

export async function requestSwap(form: FormData) {
  const user = await requireUser();
  const shift = await db.shift.findUniqueOrThrow({ where: { id: str(form, "shiftId") }, include: { site: true } });
  const toId = str(form, "toId");
  if (shift.employeeId !== user.id || shift.status !== "PUBLISHED" || shift.start < new Date())
    back("/swaps", { error: "You can only swap your own upcoming shifts." });
  if (!toId || toId === user.id) back("/swaps", { error: "Choose who to swap with." });
  const to = await db.user.findUniqueOrThrow({ where: { id: toId } });
  const clash = await findOverlap(toId, shift.start, shift.end);
  if (clash) back("/swaps", { error: `${to.firstName} already has a shift at that time.` });
  const existing = await db.swapRequest.findFirst({ where: { shiftId: shift.id, status: "PENDING" } });
  if (existing) back("/swaps", { error: "There's already a pending swap for this shift." });

  await db.swapRequest.create({ data: { shiftId: shift.id, fromId: user.id, toId } });
  await notify([to], "Shift swap request", `${user.firstName} ${user.lastName} has asked you to take ${describe(shift)}.`);
  revalidatePath("/", "layout");
  back("/swaps", { ok: `Request sent to ${to.firstName}.` });
}

export async function respondSwap(form: FormData) {
  const user = await requireUser();
  const accept = str(form, "decision") === "accept";
  const swap = await db.swapRequest.findUniqueOrThrow({ where: { id: str(form, "id") }, include: { from: true, to: true, shift: { include: { site: true } } } });
  if (swap.toId !== user.id || swap.status !== "PENDING" || swap.acceptedByTo) back("/swaps", { error: "That request has already been handled." });
  if (accept) {
    await db.swapRequest.update({ where: { id: swap.id }, data: { acceptedByTo: true } });
    await notifyManagers("Swap needs approval", `${swap.from.firstName} → ${swap.to.firstName}: ${describe(swap.shift)}.`);
    await notify([swap.from], "Swap accepted", `${swap.to.firstName} accepted. Waiting on manager approval.`);
  } else {
    await db.swapRequest.update({ where: { id: swap.id }, data: { status: "REJECTED" } });
    await notify([swap.from], "Swap declined", `${swap.to.firstName} declined to take ${describe(swap.shift)}.`);
  }
  revalidatePath("/", "layout");
  back("/swaps", { ok: accept ? "Accepted. A manager will confirm." : "Declined." });
}

export async function cancelSwap(form: FormData) {
  const user = await requireUser();
  await db.swapRequest.updateMany({ where: { id: str(form, "id"), fromId: user.id, status: "PENDING" }, data: { status: "REJECTED" } });
  revalidatePath("/", "layout");
  back("/swaps", { ok: "Swap request cancelled." });
}

export async function decideSwap(form: FormData) {
  await requireManager();
  const approve = str(form, "decision") === "approve";
  const swap = await db.swapRequest.findUniqueOrThrow({ where: { id: str(form, "id") }, include: { from: true, to: true, shift: { include: { site: true } } } });
  if (swap.status !== "PENDING" || !swap.acceptedByTo) back("/swaps", { error: "That request isn't waiting on approval." });
  if (approve) {
    if (swap.shift.employeeId !== swap.fromId) back("/swaps", { error: "The shift has been reassigned since this was requested." });
    const clash = await findOverlap(swap.toId, swap.shift.start, swap.shift.end, swap.shiftId);
    if (clash) back("/swaps", { error: `${swap.to.firstName} now has a clashing shift.` });
    await db.$transaction([
      db.shift.update({ where: { id: swap.shiftId }, data: { employeeId: swap.toId } }),
      db.swapRequest.update({ where: { id: swap.id }, data: { status: "APPROVED" } }),
    ]);
    await notify([swap.from, swap.to], "Swap approved", `${swap.to.firstName} is now working ${describe(swap.shift)}.`);
  } else {
    await db.swapRequest.update({ where: { id: swap.id }, data: { status: "REJECTED" } });
    await notify([swap.from, swap.to], "Swap not approved", `The swap for ${describe(swap.shift)} wasn't approved.`);
  }
  revalidatePath("/", "layout");
  back("/swaps", { ok: approve ? "Swap approved." : "Swap declined." });
}
