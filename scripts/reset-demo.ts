// Rebuilds the demo roster, timesheets, requests and notifications around the current week.
// Keeps users, sites and public holidays. Run with: npm run demo:reset
//
// Safety: refuses to run if the database has any users other than the seeded demo accounts,
// so it can't wipe real staff data once Plover goes live.
import { PrismaClient } from "@prisma/client";
import { expandRules } from "../src/lib/availability";
import { addLocalDays, startOfLocalDay, startOfWeek, zonedParts, zonedToUtc } from "../src/lib/time";

const db = new PrismaClient();
const DEMO_EMAILS = ["admin", "manager", "sam", "jordan", "alex", "riley", "casey"].map((n) => `${n}@ploversecurity.com.au`);

async function main() {
  const users = await db.user.findMany();
  const strangers = users.filter((u) => !DEMO_EMAILS.includes(u.email));
  if (strangers.length) {
    console.error(`Refusing to reset: found non-demo users (${strangers.map((u) => u.email).join(", ")}).`);
    process.exit(1);
  }

  await db.notification.deleteMany();
  await db.shiftClaim.deleteMany();
  await db.swapRequest.deleteMany();
  await db.availabilityRule.deleteMany();
  await db.timesheet.deleteMany();
  await db.shift.deleteMany();

  const u = Object.fromEntries(users.map((x) => [x.email.split("@")[0], x]));
  const sites = await db.site.findMany({ where: { active: true } });
  const s = Object.fromEntries(sites.map((x) => [x.name, x]));
  const hospital = s["Ballarat Base Hospital"] ?? sites[0];
  const build = s["Lake Wendouree Construction"] ?? sites[1] ?? hospital;
  const hotel = s["Sturt St Hotel"] ?? sites[2] ?? hospital;
  const volta = s["Volta Nightclub"];
  const guards = [u.sam, u.jordan, u.alex, u.riley, u.casey];
  const manager = u.manager;

  const now = new Date();
  const weekStart = startOfWeek(now);
  const wk = zonedParts(weekStart);
  const at = (day: number, hour: number) => zonedToUtc(wk.year, wk.month, wk.day + day, hour);
  const todayIdx = Math.round((startOfLocalDay(now).getTime() - weekStart.getTime()) / 86_400_000);

  // Last week, this week and next week
  type Plan = { day: number; site: typeof hospital; guard: (typeof guards)[number] | null; start: number; end: number; role: string };
  const plans: Plan[] = [];
  for (let day = -7; day < 14; day++) {
    const g = (k: number) => guards[(day + 21 + k) % 5];
    const wd = (day + 21) % 7; // 0 = Monday
    plans.push({ day, site: hospital, guard: g(0), start: 6, end: 14, role: "Healthcare security" });
    plans.push({ day, site: hospital, guard: g(1), start: 14, end: 22, role: "Healthcare security" });
    if (wd < 5) plans.push({ day, site: build, guard: g(2), start: 7, end: 15, role: "Construction site" });
    if (wd === 4 || wd === 5) {
      plans.push({ day, site: hotel, guard: g(3), start: 20, end: 26, role: "Crowd control" });
      if (volta) plans.push({ day, site: volta, guard: g(4), start: 21, end: 27, role: "Crowd control" });
    }
  }
  // Give Sam something to clock in to this evening and tomorrow afternoon
  plans.push({ day: todayIdx, site: volta ?? hotel, guard: u.sam, start: 18, end: 23, role: "Crowd control" });
  plans.push({ day: todayIdx + 1, site: build, guard: u.sam, start: 15, end: 21, role: "Construction site" });

  let n = 0;
  for (const p of plans) {
    const start = at(p.day, p.start), end = at(p.day, p.end);
    const free = p.guard && !(await db.shift.findFirst({ where: { employeeId: p.guard.id, start: { lt: end }, end: { gt: start } } }));
    const guardId = free ? p.guard!.id : null;
    const shift = await db.shift.create({
      data: { siteId: p.site.id, employeeId: guardId, start, end, breakMinutes: p.end - p.start >= 8 ? 30 : 0, role: p.role, status: guardId ? "PUBLISHED" : "OPEN" },
    });
    if (!guardId || start > now) continue;
    // Worked or in-progress shifts get timesheets: last Mon-Thu approved, the rest pending.
    n++;
    const late = n % 7 === 0 ? 25 : 0;
    const early = n % 11 === 0 ? 40 : 0;
    const approved = p.day < -3;
    await db.timesheet.create({
      data: {
        shiftId: shift.id, employeeId: guardId,
        clockIn: new Date(start.getTime() + late * 60_000),
        clockOut: end < now ? new Date(end.getTime() - early * 60_000) : null,
        breakMinutes: shift.breakMinutes,
        status: approved ? "APPROVED" : "PENDING",
        approverId: approved ? manager.id : null, approvedAt: approved ? now : null,
        notes: late ? "Traffic on the highway" : early ? "Left early, site closed" : null,
      },
    });
  }

  // Open shifts, one with a request from Riley
  const open = await db.shift.create({
    data: { siteId: (volta ?? hotel).id, start: at(todayIdx + 3, 21), end: at(todayIdx + 4, 3), role: "Crowd control", status: "OPEN", notes: "Extra cover for a band night" },
  });
  await db.shiftClaim.create({ data: { shiftId: open.id, employeeId: u.riley.id } });
  await db.shift.create({ data: { siteId: hospital.id, start: at(todayIdx + 5, 22), end: at(todayIdx + 6, 6), role: "Healthcare security", status: "OPEN", breakMinutes: 30 } });

  // A swap agreed by two guards, waiting on the manager
  let swapText = "";
  const future = await db.shift.findMany({ where: { status: "PUBLISHED", start: { gt: addLocalDays(now, 1) }, employeeId: { not: u.sam.id } }, orderBy: { start: "asc" }, include: { employee: true } });
  outer: for (const sh of future) {
    for (const to of guards) {
      if (to.id === sh.employeeId || to.id === u.sam.id) continue;
      if (await db.shift.findFirst({ where: { employeeId: to.id, start: { lt: sh.end }, end: { gt: sh.start } } })) continue;
      await db.swapRequest.create({ data: { shiftId: sh.id, fromId: sh.employeeId!, toId: to.id, acceptedByTo: true } });
      swapText = `${sh.employee!.firstName} and ${to.firstName} have agreed a shift swap. Approve it under Shift swaps.`;
      break outer;
    }
  }

  // One weekly availability rule that doesn't clash with anyone's rostered shifts
  const from = weekStart, to = addLocalDays(weekStart, 14);
  outer2: for (const g of guards.filter((x) => x.id !== u.sam.id)) {
    const shifts = await db.shift.findMany({ where: { employeeId: g.id, start: { gte: from, lt: to } } });
    for (const wd of ["3", "2", "4", "1", "5", "6", "0"]) {
      const rule = { id: "x", userId: g.id, repeat: "WEEKLY", weekdays: wd, startDate: from, endDate: null, allDay: false, startMinute: 540, endMinute: 900, note: null };
      const blocks = expandRules([rule], from, to);
      if (shifts.some((sh) => blocks.some((b) => b.start < sh.end && b.end > sh.start))) continue;
      await db.availabilityRule.create({
        data: { userId: g.id, repeat: "WEEKLY", weekdays: wd, startDate: from, allDay: false, startMinute: 540, endMinute: 900, note: wd === "0" || wd === "6" ? "Family commitment" : "Uni classes", createdById: g.id },
      });
      break outer2;
    }
  }

  await db.notification.createMany({
    data: [
      ...guards.map((g) => ({ userId: g.id, title: "Roster published", body: "Your shifts for this week and next have been published." })),
      { userId: manager.id, title: "Open shift requested", body: "Riley Murphy has asked for an open shift. Approve it under Open shifts." },
      ...(swapText ? [{ userId: manager.id, title: "Swap needs approval", body: swapText }] : []),
    ],
  });

  const ts = await db.timesheet.groupBy({ by: ["status"], _count: true });
  console.log(`Demo reset for the week of ${weekStart.toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" })}.`);
  console.log(`Shifts: ${await db.shift.count()} | timesheets: ${ts.map((t) => `${t._count} ${t.status.toLowerCase()}`).join(", ")} | swaps: ${await db.swapRequest.count()} | availability rules: ${await db.availabilityRule.count()}`);
}

main().finally(() => db.$disconnect());
