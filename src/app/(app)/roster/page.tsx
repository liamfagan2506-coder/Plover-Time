import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { addLocalDays, fmtDate, fmtDateLong, fmtHours, fmtRange, localDateKey, parseLocalDate, startOfWeek, toLocalInput } from "@/lib/time";
import { costOf, fmtMoney, paidHours, splitByDay } from "@/lib/pay";
import { cancelShift, clearDrafts, copyPreviousWeek, publishWeek, saveShift } from "@/actions/shifts";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function RosterPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);

  let weekStart = startOfWeek(new Date());
  if (params.week) {
    try {
      weekStart = startOfWeek(parseLocalDate(params.week));
    } catch {}
  }
  const weekKey = localDateKey(weekStart);
  const weekEnd = addLocalDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart, i));
  const prevWeek = localDateKey(addLocalDays(weekStart, -7));
  const nextWeek = localDateKey(addLocalDays(weekStart, 7));

  const shifts = await db.shift.findMany({
    where: {
      start: { gte: weekStart, lt: weekEnd },
      status: manager ? { not: "CANCELLED" } : "PUBLISHED",
      employeeId: manager ? undefined : user.id,
    },
    include: { site: true, employee: true },
    orderBy: { start: "asc" },
  });

  const nav = (
    <div className="flex items-center gap-2">
      <Link className="btn-secondary btn-sm" href={`/roster?week=${prevWeek}`}>← Prev</Link>
      <Link className="btn-secondary btn-sm" href="/roster">This week</Link>
      <Link className="btn-secondary btn-sm" href={`/roster?week=${nextWeek}`}>Next →</Link>
    </div>
  );

  if (!manager) {
    return (
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="h1">My shifts</h1>
            <p className="text-sm text-muted">Week of {fmtDateLong(weekStart)}</p>
          </div>
          {nav}
        </div>
        <div className="space-y-3">
          {shifts.length === 0 && <div className="card text-sm text-muted">No shifts this week.</div>}
          {shifts.map((s) => (
            <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{fmtDate(s.start)} · {fmtRange(s.start, s.end)}</p>
                <p className="text-sm text-muted">
                  {s.site.name}{s.site.address ? ` — ${s.site.address}` : ""}{s.role ? ` · ${s.role}` : ""}
                </p>
                {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
              </div>
              <div className="text-right text-sm">
                <p>{fmtHours(paidHours(s.start, s.end, s.breakMinutes))} paid</p>
                {s.start > new Date() && <Link href={`/swaps?shift=${s.id}`} className="text-xs underline">Request swap</Link>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const [employees, sites, holidays] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    db.site.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.publicHoliday.findMany({ where: { date: { gte: weekStart, lt: weekEnd } } }),
  ]);
  const holidayKeys = new Set(holidays.map((h) => localDateKey(h.date)));
  const editing = params.shift && params.shift !== "new" ? shifts.find((s) => s.id === params.shift) : undefined;
  const showForm = params.shift === "new" || editing;
  const drafts = shifts.filter((s) => s.status === "DRAFT").length;

  // Rows: each employee who is rostered or active staff, plus unassigned shifts
  const rows = [
    { id: "", name: "Open / unassigned", user: null as (typeof employees)[number] | null },
    ...employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, user: e })),
  ];

  const defaultDate = params.date ?? localDateKey(new Date() > weekStart && new Date() < weekEnd ? new Date() : weekStart);
  const returnTo = `/roster?week=${weekKey}`;

  let weekHours = 0;
  let weekCost = 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Roster</h1>
          <p className="text-sm text-muted">Week of {fmtDateLong(weekStart)}</p>
        </div>
        {nav}
      </div>
      <Flash params={params} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="btn" href={`/roster?week=${weekKey}&shift=new`}>+ Add shift</Link>
        <form action={publishWeek}>
          <input type="hidden" name="week" value={weekKey} />
          <button className="btn-secondary" disabled={drafts === 0}>Publish {drafts} draft{drafts === 1 ? "" : "s"}</button>
        </form>
        <form action={copyPreviousWeek}>
          <input type="hidden" name="week" value={weekKey} />
          <ConfirmButton className="btn-secondary" message="Copy all of last week's shifts into this week as drafts?">Copy last week</ConfirmButton>
        </form>
        {drafts > 0 && (
          <form action={clearDrafts}>
            <input type="hidden" name="week" value={weekKey} />
            <ConfirmButton className="btn-danger" message={`Delete all ${drafts} draft shift(s) this week? Published shifts won't be affected.`}>
              Clear drafts
            </ConfirmButton>
          </form>
        )}
      </div>

      {showForm && (
        <form action={saveShift} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="h2 sm:col-span-2 lg:col-span-4">{editing ? "Edit shift" : "New shift"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <label className="label">Site</label>
            <select name="siteId" className="input" defaultValue={editing?.siteId ?? params.site ?? ""} required>
              <option value="" disabled>Choose a site</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Employee</label>
            <select name="employeeId" className="input" defaultValue={editing?.employeeId ?? params.emp ?? ""}>
              <option value="">Leave open for anyone to claim</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start</label>
            <input type="datetime-local" name="start" className="input" required
              defaultValue={editing ? toLocalInput(editing.start) : `${defaultDate}T07:00`} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="datetime-local" name="end" className="input" required
              defaultValue={editing ? toLocalInput(editing.end) : `${defaultDate}T15:00`} />
          </div>
          <div>
            <label className="label">Unpaid break (minutes)</label>
            <input type="number" name="breakMinutes" min={0} step={5} className="input" defaultValue={editing?.breakMinutes ?? 30} />
          </div>
          <div>
            <label className="label">Duty</label>
            <input name="role" className="input" list="duties" placeholder="e.g. Static guard" defaultValue={editing?.role ?? ""} />
            <datalist id="duties">
              <option value="Static guard" /><option value="Crowd control" /><option value="Mobile patrol" />
              <option value="Healthcare security" /><option value="Construction site" /><option value="Event security" />
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes for the guard</label>
            <input name="notes" className="input" placeholder="Uniform, access codes, contact on site…" defaultValue={editing?.notes ?? ""} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn">{editing ? "Save changes" : "Add shift"}</button>
            <Link href={returnTo} className="btn-secondary">Close</Link>
          </div>
        </form>
      )}
      {editing && (
        <form action={cancelShift} className="-mt-4 mb-6">
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="btn-danger btn-sm">{editing.status === "DRAFT" ? "Delete draft" : "Cancel this shift"}</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-40 border-b border-border p-2 text-left text-xs font-medium uppercase tracking-wide text-muted">Staff</th>
              {days.map((d) => (
                <th key={d.toISOString()} className={`border-b border-l border-border p-2 text-left text-xs font-medium ${holidayKeys.has(localDateKey(d)) ? "bg-amber-50" : ""}`}>
                  {fmtDate(d)}
                  {holidayKeys.has(localDateKey(d)) && <span className="block text-[10px] font-normal text-warn">Public holiday</span>}
                </th>
              ))}
              <th className="w-24 border-b border-l border-border p-2 text-right text-xs font-medium uppercase tracking-wide text-muted">Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mine = shifts.filter((s) => (s.employeeId ?? "") === row.id);
              // Hide the open row and admin-only accounts when they have nothing rostered
              if ((row.id === "" || row.user?.role === "ADMIN") && mine.length === 0) return null;
              const hours = mine.reduce((h, s) => h + paidHours(s.start, s.end, s.breakMinutes), 0);
              const cost = row.user
                ? mine.reduce((c, s) => c + costOf(splitByDay(s.start, s.end, s.breakMinutes, holidayKeys), row.user!), 0)
                : 0;
              weekHours += hours;
              weekCost += cost;
              return (
                <tr key={row.id || "open"} className="align-top">
                  <td className="border-b border-border p-2 font-medium">{row.name}</td>
                  {days.map((d) => {
                    const key = localDateKey(d);
                    const cell = mine.filter((s) => localDateKey(s.start) === key);
                    return (
                      <td key={key} className="group border-b border-l border-border p-1.5">
                        <div className="space-y-1">
                          {cell.map((s) => (
                            <Link key={s.id} href={`/roster?week=${weekKey}&shift=${s.id}`}
                              className={`block rounded-md border px-2 py-1 text-xs hover:border-ink ${
                                s.status === "DRAFT" ? "border-dashed border-neutral-400 bg-white" : s.status === "OPEN" ? "border-warn/40 bg-amber-50" : "border-neutral-200 bg-neutral-100"
                              }`}>
                              <span className="block font-medium">{fmtRange(s.start, s.end)}</span>
                              <span className="block truncate text-muted">{s.site.name}</span>
                              {s.status === "DRAFT" && <span className="text-[10px] uppercase text-neutral-500">Draft</span>}
                            </Link>
                          ))}
                          <Link href={`/roster?week=${weekKey}&shift=new&date=${key}${row.id ? `&emp=${row.id}` : ""}`}
                            className="block rounded-md py-0.5 text-center text-xs text-transparent hover:bg-neutral-100 hover:text-muted group-hover:text-neutral-400">
                            +
                          </Link>
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-border p-2 text-right">
                    {hours > 0 && <span className="block">{fmtHours(hours)}</span>}
                    {cost > 0 && <span className="block text-xs text-muted">{fmtMoney(cost)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="p-2 text-right text-xs uppercase tracking-wide text-muted">Week total</td>
              <td className="border-l border-border p-2 text-right font-medium">
                {fmtHours(weekHours)}<span className="block text-xs font-normal text-muted">{fmtMoney(weekCost)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <StatusBadge status="DRAFT" /> not visible to staff until published
        <StatusBadge status="OPEN" /> anyone can claim
        <span>Costs are estimates from each person&apos;s flat rates.</span>
      </p>
    </div>
  );
}
