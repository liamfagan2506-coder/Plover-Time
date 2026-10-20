import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { addLocalDays, fmtDate, fmtDateLong, fmtHours, fmtRange, fmtTime, localDateKey, startOfLocalDay } from "@/lib/time";
import { costOf, fmtMoney, paidHours, payPeriodFor, round2, splitByDay } from "@/lib/pay";
import { clockIn, clockOut } from "@/actions/timesheets";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function HomePage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);
  const now = new Date();

  const [active, upcoming, notifications] = await Promise.all([
    db.timesheet.findFirst({ where: { employeeId: user.id, clockOut: null }, include: { shift: { include: { site: true } } } }),
    db.shift.findMany({
      where: { employeeId: user.id, status: "PUBLISHED", end: { gt: now }, timesheet: null },
      include: { site: true },
      orderBy: { start: "asc" },
      take: 5,
    }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const next = upcoming[0];
  const canClockIn = next && next.start.getTime() - now.getTime() <= 60 * 60_000;
  // While on shift the clock-out card replaces "next shift", so list every upcoming shift
  const comingUp = active ? upcoming : upcoming.slice(1);

  return (
    <div>
      <p className="text-sm text-muted">{fmtDateLong(now)}</p>
      <h1 className="h1 mb-6">G&apos;day, {user.firstName}</h1>
      <Flash params={params} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Clock in / out */}
          <section className="card">
            {active ? (
              <form action={clockOut} className="space-y-4">
                <input type="hidden" name="id" value={active.id} />
                <div className="flex items-center gap-2">
                  <StatusBadge status="ACTIVE" label="On shift" />
                  <span className="text-sm text-muted">since {fmtTime(active.clockIn)}{active.shift ? ` at ${active.shift.site.name}` : ""}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Unpaid break taken (minutes)</label>
                    <input type="number" name="breakMinutes" min={0} step={5} className="input" defaultValue={active.breakMinutes} />
                  </div>
                  <div>
                    <label className="label">Note (optional)</label>
                    <input name="notes" className="input" placeholder="Anything your manager should know" />
                  </div>
                </div>
                <button className="btn w-full py-3 text-base sm:w-auto">Clock out</button>
              </form>
            ) : next ? (
              <form action={clockIn} className="flex flex-wrap items-center justify-between gap-4">
                <input type="hidden" name="shiftId" value={next.id} />
                <div>
                  <p className="label">Next shift</p>
                  <p className="text-lg font-semibold">{fmtDate(next.start)} · {fmtRange(next.start, next.end)}</p>
                  <p className="text-sm text-muted">{next.site.name}{next.role ? ` · ${next.role}` : ""}</p>
                  {next.notes && <p className="mt-1 text-sm">{next.notes}</p>}
                </div>
                <button className="btn py-3 text-base" disabled={!canClockIn}>
                  {canClockIn ? "Clock in" : `Clock in opens ${fmtTime(new Date(next.start.getTime() - 60 * 60_000))}`}
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted">You have no upcoming shifts. Check <Link className="underline" href="/open-shifts">open shifts</Link> to pick one up.</p>
            )}
          </section>

          <MyPay userId={user.id} />

          {comingUp.length > 0 && (
            <section className="card">
              <h2 className="h2 mb-3">Coming up</h2>
              <ul className="divide-y divide-border">
                {comingUp.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{fmtDate(s.start)} · {fmtRange(s.start, s.end)}</span>
                    <span className="text-muted">{s.site.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {manager && <ManagerToday />}
        </div>

        <section className="card h-fit">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Notifications</h2>
            <Link href="/notifications" className="text-xs underline">View all</Link>
          </div>
          {notifications.length === 0 && <p className="text-sm text-muted">Nothing new.</p>}
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id} className="text-sm">
                <p className={n.read ? "" : "font-semibold"}>{n.title}</p>
                <p className="line-clamp-2 whitespace-pre-line text-muted">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

async function ManagerToday() {
  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const dayEnd = addLocalDays(dayStart, 1);
  const [today, pendingTs, pendingClaims, pendingSwaps, openShifts] = await Promise.all([
    db.shift.findMany({
      where: { start: { lt: dayEnd }, end: { gt: dayStart }, status: { in: ["PUBLISHED", "OPEN"] } },
      include: { site: true, employee: true, timesheet: true },
      orderBy: { start: "asc" },
    }),
    db.timesheet.count({ where: { status: "PENDING", clockOut: { not: null } } }),
    db.shiftClaim.count({ where: { status: "PENDING" } }),
    db.swapRequest.count({ where: { status: "PENDING", acceptedByTo: true } }),
    db.shift.count({ where: { status: "OPEN", start: { gt: now } } }),
  ]);

  const stats = [
    { label: "Timesheets to approve", value: pendingTs, href: "/timesheets" },
    { label: "Open shift requests", value: pendingClaims, href: "/open-shifts" },
    { label: "Swaps to approve", value: pendingSwaps, href: "/swaps" },
    { label: "Unfilled open shifts", value: openShifts, href: "/open-shifts" },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card block hover:border-ink">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <h2 className="h2 mb-3">On duty today</h2>
        {today.length === 0 && <p className="text-sm text-muted">No shifts today.</p>}
        <ul className="divide-y divide-border">
          {today.map((s) => {
            const late = !s.timesheet && s.employeeId && s.start < now && s.end > now;
            const state = s.status === "OPEN" ? <StatusBadge status="OPEN" label="Unfilled" />
              : s.timesheet?.clockOut ? <StatusBadge status="PUBLISHED" label="Finished" />
              : s.timesheet ? <StatusBadge status="ACTIVE" label={`In ${fmtTime(s.timesheet.clockIn)}`} />
              : late ? <StatusBadge status="REJECTED" label="Not clocked in" />
              : <StatusBadge status="PUBLISHED" label="Upcoming" />;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Open shift"}</span>
                  <span className="text-muted"> · {fmtRange(s.start, s.end)} · {s.site.name}</span>
                </span>
                {state}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

// Hours and estimated gross pay for the current pay fortnight
async function MyPay({ userId }: { userId: string }) {
  const now = new Date();
  const { start, end } = payPeriodFor(now);
  const [user, sheets, rostered, holidays] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.timesheet.findMany({ where: { employeeId: userId, clockIn: { gte: start, lt: end }, clockOut: { not: null }, status: { not: "REJECTED" } } }),
    db.shift.findMany({ where: { employeeId: userId, status: "PUBLISHED", start: { gte: now, lt: end }, timesheet: null } }),
    db.publicHoliday.findMany({ where: { date: { gte: start, lt: end } } }),
  ]);
  const hol = new Set(holidays.map((h) => localDateKey(h.date)));
  const worked = round2(sheets.reduce((h, t) => h + paidHours(t.clockIn, t.clockOut!, t.breakMinutes), 0));
  const approved = round2(sheets.filter((t) => t.status !== "PENDING").reduce((h, t) => h + paidHours(t.clockIn, t.clockOut!, t.breakMinutes), 0));
  const pay = round2(sheets.reduce((p, t) => p + costOf(splitByDay(t.clockIn, t.clockOut!, t.breakMinutes, hol), user), 0));
  const ahead = round2(rostered.reduce((h, s) => h + paidHours(s.start, s.end, s.breakMinutes), 0));
  const aheadPay = round2(rostered.reduce((p, s) => p + costOf(splitByDay(s.start, s.end, s.breakMinutes, hol), user), 0));

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h2">This pay fortnight</h2>
        <p className="text-xs text-muted">{fmtDate(start)} – {fmtDate(addLocalDays(end, -1))}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-semibold">{fmtHours(worked)}</p>
          <p className="text-xs text-muted">worked ({fmtHours(approved)} approved)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{fmtMoney(pay)}</p>
          <p className="text-xs text-muted">earned so far</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{fmtHours(ahead)}</p>
          <p className="text-xs text-muted">still rostered (≈ {fmtMoney(aheadPay)})</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Estimates before tax and super. Your payslip is the final figure.</p>
    </section>
  );
}
