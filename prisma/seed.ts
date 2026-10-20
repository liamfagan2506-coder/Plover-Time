// Seeds Victorian public holidays, an admin account and (unless SEED_DEMO=false) demo data.
// Run with: npx prisma db seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { zonedToUtc, startOfWeek, zonedParts } from "../src/lib/time";

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || "PloverDemo2026!";
const DEMO = process.env.SEED_DEMO !== "false";

// Victorian public holidays. Check against business.vic.gov.au each year and edit in
// Admin > Public holidays. AFL Grand Final Friday is announced each year, so add it there.
const HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"],
  ["2026-01-26", "Australia Day"],
  ["2026-03-09", "Labour Day"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-04", "Saturday before Easter Sunday"],
  ["2026-04-05", "Easter Sunday"],
  ["2026-04-06", "Easter Monday"],
  ["2026-04-25", "ANZAC Day"],
  ["2026-06-08", "King's Birthday"],
  ["2026-11-03", "Melbourne Cup"],
  ["2026-12-25", "Christmas Day"],
  ["2026-12-26", "Boxing Day"],
  ["2026-12-28", "Boxing Day (additional)"],
  ["2027-01-01", "New Year's Day"],
  ["2027-01-26", "Australia Day"],
  ["2027-03-08", "Labour Day"],
  ["2027-03-26", "Good Friday"],
  ["2027-03-27", "Saturday before Easter Sunday"],
  ["2027-03-28", "Easter Sunday"],
  ["2027-03-29", "Easter Monday"],
  ["2027-04-25", "ANZAC Day"],
  ["2027-06-14", "King's Birthday"],
  ["2027-11-02", "Melbourne Cup"],
  ["2027-12-25", "Christmas Day"],
  ["2027-12-26", "Boxing Day"],
  ["2027-12-27", "Christmas Day (additional)"],
  ["2027-12-28", "Boxing Day (additional)"],
];

async function main() {
  for (const [date, name] of HOLIDAYS) {
    const [y, m, d] = date.split("-").map(Number);
    const at = zonedToUtc(y, m, d);
    await db.publicHoliday.upsert({ where: { date: at }, update: { name }, create: { date: at, name } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const rates = { rateWeekday: 32.5, rateSaturday: 45, rateSunday: 55, ratePublicHoliday: 70 };

  await db.user.upsert({
    where: { email: "admin@ploversecurity.com.au" },
    update: {},
    create: { email: "admin@ploversecurity.com.au", passwordHash, firstName: "Admin", lastName: "User", role: "ADMIN" },
  });

  if (!DEMO) return;

  const manager = await db.user.upsert({
    where: { email: "manager@ploversecurity.com.au" },
    update: {},
    create: { email: "manager@ploversecurity.com.au", passwordHash, firstName: "Morgan", lastName: "Reid", role: "MANAGER", ...rates },
  });

  const guardNames = [
    ["Sam", "Taylor"],
    ["Jordan", "Nguyen"],
    ["Alex", "Kowalski"],
    ["Riley", "Murphy"],
    ["Casey", "Singh"],
  ];
  const guards = [];
  for (const [first, last] of guardNames) {
    const email = `${first.toLowerCase()}@ploversecurity.com.au`;
    guards.push(
      await db.user.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash, firstName: first, lastName: last, phone: "+61400000000", ...rates },
      }),
    );
  }

  if ((await db.site.count()) > 0) return;

  const sites = await Promise.all(
    [
      { name: "Ballarat Base Hospital", client: "Grampians Health", address: "1 Drummond St N, Ballarat VIC" },
      { name: "Lake Wendouree Construction", client: "Example Builders Pty Ltd", address: "Wendouree Pde, Ballarat VIC" },
      { name: "Sturt St Hotel", client: "Example Hospitality", address: "Sturt St, Ballarat VIC" },
    ].map((data) => db.site.create({ data })),
  );

  // Two weeks of shifts: last week (with timesheets) and this week
  const thisWeek = startOfWeek(new Date());
  const p = zonedParts(thisWeek);
  const at = (dayOffset: number, hour: number) => zonedToUtc(p.year, p.month, p.day + dayOffset, hour);

  for (let day = -7; day < 7; day++) {
    const plan = [
      { site: sites[0], guard: guards[(day + 14) % 5], start: 6, end: 14 },
      { site: sites[0], guard: guards[(day + 15) % 5], start: 14, end: 22 },
      { site: sites[1], guard: guards[(day + 16) % 5], start: 7, end: 15 },
    ];
    // Hotel crowd control Friday and Saturday nights, crossing midnight
    const wd = (day + 14) % 7;
    if (wd === 4 || wd === 5) plan.push({ site: sites[2], guard: guards[(day + 17) % 5], start: 20, end: 27 });

    for (const s of plan) {
      const shift = await db.shift.create({
        data: {
          siteId: s.site.id,
          employeeId: s.guard.id,
          start: at(day, s.start),
          end: at(day, s.end),
          breakMinutes: s.end - s.start >= 8 ? 30 : 0,
          role: s.site === sites[2] ? "Crowd control" : "Static guard",
          status: "PUBLISHED",
        },
      });
      if (day < 0) {
        await db.timesheet.create({
          data: {
            shiftId: shift.id,
            employeeId: s.guard.id,
            clockIn: shift.start,
            clockOut: shift.end,
            breakMinutes: shift.breakMinutes,
            status: day < -3 ? "APPROVED" : "PENDING",
            approverId: day < -3 ? manager.id : null,
            approvedAt: day < -3 ? new Date() : null,
          },
        });
      }
    }
  }

  // An open shift anyone can claim
  await db.shift.create({
    data: { siteId: sites[2].id, start: at(5, 21), end: at(6, 3), role: "Crowd control", status: "OPEN", notes: "Extra cover for a function" },
  });
}

main()
  .then(() => console.log(`Seeded. Demo data: ${DEMO}. Accounts use the SEED_PASSWORD (see README).`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
