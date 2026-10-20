import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { addLocalDays, fmtDate, fmtDateLong, fmtRange, fmtTime, startOfLocalDay } from "@/lib/time";
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
