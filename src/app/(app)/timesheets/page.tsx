import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { fmtDate, fmtHours, fmtRange, fmtTime, localDateKey, toLocalInput, addLocalDays, startOfLocalDay } from "@/lib/time";
import { costOf, fmtMoney, paidHours, splitByDay } from "@/lib/pay";
import { decideTimesheets, markNoShow, saveTimesheet } from "@/actions/timesheets";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { SelectAll } from "@/components/SelectAll";

const TABS = [
  { key: "PENDING", label: "To approve" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "EXPORTED", label: "Exported" },
];

export default async function TimesheetsPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);
  const status = TABS.some((t) => t.key === params.status) ? params.status! : "PENDING";
  const returnTo = `/timesheets?status=${status}`;

  const sheets = await db.timesheet.findMany({
    where: { status, employeeId: manager ? undefined : user.id, clockOut: manager ? { not: null } : undefined },
    include: { employee: true, approver: true, shift: { include: { site: true } } },
    orderBy: { clockIn: "desc" },
    take: 200,
  });
  const holidays = new Set((await db.publicHoliday.findMany()).map((h) => localDateKey(h.date)));

  // Shifts that finished with nobody clocked in (last 14 days)
  const missing = manager
    ? await db.shift.findMany({
        where: {
          status: "PUBLISHED",
          employeeId: { not: null },
          timesheet: null,
          end: { lt: new Date(), gt: addLocalDays(startOfLocalDay(new Date()), -14) },
        },
        include: { employee: true, site: true },
        orderBy: { start: "asc" },
      })
    : [];

  const editing = params.edit ? sheets.find((s) => s.id === params.edit) : undefined;
  const fromShift = params.fromShift ? missing.find((s) => s.id === params.fromShift) : undefined;

  return (
    <div>
      <h1 className="h1">Timesheets</h1>
      <p className="mb-6 text-sm text-muted">
        {manager ? "Check actual hours against the roster, then approve them for the Xero export." : "Your recorded hours and their approval status."}
      </p>
      <Flash params={params} />

      {(editing || fromShift) && (
        <form action={saveTimesheet} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="h2 sm:col-span-2 lg:col-span-4">
            {editing ? `Edit timesheet: ${editing.employee.firstName} ${editing.employee.lastName}` : `Add hours: ${fromShift!.employee!.firstName} ${fromShift!.employee!.lastName}`}
          </h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {fromShift && <input type="hidden" name="shiftId" value={fromShift.id} />}
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <label className="label">Started</label>
            <input type="datetime-local" name="clockIn" className="input" required
              defaultValue={toLocalInput(editing?.clockIn ?? fromShift!.start)} />
          </div>
          <div>
            <label className="label">Finished</label>
            <input type="datetime-local" name="clockOut" className="input" required
              defaultValue={toLocalInput(editing?.clockOut ?? fromShift?.end ?? new Date())} />
          </div>
          <div>
            <label className="label">Unpaid break (minutes)</label>
            <input type="number" name="breakMinutes" min={0} step={5} className="input" defaultValue={editing?.breakMinutes ?? fromShift?.breakMinutes ?? 0} />
          </div>
          <div>
            <label className="label">Note</label>
            <input name="notes" className="input" defaultValue={editing?.notes ?? "Added by manager"} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn">Save</button>
            <Link href={returnTo} className="btn-secondary">Close</Link>
          </div>
        </form>
      )}

      {missing.length > 0 && (
        <section className="card mb-6">
          <h2 className="h2">Shifts with no clock-in</h2>
          <p className="mb-3 text-sm text-muted">Add the hours if they worked, or record a no-show.</p>
          <ul className="divide-y divide-border">
            {missing.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  <span className="font-medium">{s.employee!.firstName} {s.employee!.lastName}</span>{" "}
                  · {fmtDate(s.start)} {fmtRange(s.start, s.end)} · {s.site.name}
                </span>
                <span className="flex gap-2">
                  <Link href={`${returnTo}&fromShift=${s.id}`} className="btn-secondary btn-sm">Add hours</Link>
                  <form action={markNoShow}>
                    <input type="hidden" name="shiftId" value={s.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button className="btn-danger btn-sm">No-show</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/timesheets?status=${t.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${t.key === status ? "bg-ink text-white" : "text-muted hover:bg-neutral-200"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <form action={decideTimesheets}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                {manager && status === "PENDING" && <th className="w-8"><SelectAll name="ids" /></th>}
                {manager && <th>Employee</th>}
                <th>Date</th>
                <th>Rostered</th>
                <th>Actual</th>
                <th>Break</th>
                <th className="text-right">Hours</th>
                <th className="text-right">Est. pay</th>
                <th>Status</th>
                {manager && <th />}
              </tr>
            </thead>
            <tbody>
              {sheets.length === 0 && <tr><td colSpan={10} className="text-muted">Nothing here.</td></tr>}
              {sheets.map((t) => {
                const end = t.clockOut;
                const hours = end ? paidHours(t.clockIn, end, t.breakMinutes) : 0;
                const pay = end ? costOf(splitByDay(t.clockIn, end, t.breakMinutes, holidays), t.employee) : 0;
                const rostered = t.shift ? paidHours(t.shift.start, t.shift.end, t.shift.breakMinutes) : null;
                const variance = rostered !== null && end ? Math.abs(hours - rostered) >= 0.25 : false;
                return (
                  <tr key={t.id}>
                    {manager && status === "PENDING" && (
                      <td><input type="checkbox" name="ids" value={t.id} defaultChecked={!variance} className="h-4 w-4 accent-black" /></td>
                    )}
                    {manager && <td className="font-medium">{t.employee.firstName} {t.employee.lastName}</td>}
                    <td>
                      {fmtDate(t.clockIn)}
                      {t.shift && <span className="block text-xs text-muted">{t.shift.site.name}</span>}
                    </td>
                    <td className="text-muted">{t.shift ? fmtRange(t.shift.start, t.shift.end) : "—"}</td>
                    <td>
                      {fmtTime(t.clockIn)} – {end ? fmtTime(end) : <StatusBadge status="ACTIVE" label="On shift" />}
                      {t.notes && <span className="block text-xs text-muted">{t.notes}</span>}
                    </td>
                    <td>{t.breakMinutes}m</td>
                    <td className={`text-right ${variance ? "font-medium text-warn" : ""}`}>
                      {end ? fmtHours(hours) : "—"}
                      {variance && <span className="block text-xs">rostered {fmtHours(rostered!)}</span>}
                    </td>
                    <td className="text-right">{end ? fmtMoney(pay) : "—"}</td>
                    <td><StatusBadge status={t.status} /></td>
                    {manager && (
                      <td className="text-right">
                        {t.status !== "EXPORTED" && <Link href={`${returnTo}&edit=${t.id}`} className="text-xs underline">Edit</Link>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {manager && status === "PENDING" && sheets.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button name="decision" value="approve" className="btn">Approve selected</button>
            <button name="decision" value="reject" className="btn-secondary">Reject selected</button>
            <span className="text-xs text-muted">Timesheets more than 15 minutes off the roster are highlighted and left unticked. Use the top checkbox to select all.</span>
          </div>
        )}
      </form>
    </div>
  );
}
