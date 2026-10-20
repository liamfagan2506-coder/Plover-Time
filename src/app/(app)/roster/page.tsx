import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { addLocalDays, fmtDate, fmtDateLong, fmtHours, fmtRange, localDateKey, parseLocalDate, startOfLocalDay, startOfWeek, toLocalInput } from "@/lib/time";
import { costOf, fmtMoney, paidHours, splitByDay } from "@/lib/pay";
import { cancelShift, clearDrafts, copyPreviousWeek, publishWeek, saveShift } from "@/actions/shifts";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { RosterDnD } from "@/components/roster/RosterDnD";
import { AutoDayView, PrintButton } from "@/components/roster/RosterClient";

type Params = Record<string, string | undefined>;

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  try {
    return parseLocalDate(value);
  } catch {
    return null;
  }
}

export default async function RosterPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);

  // Week shown: from ?day (day view) or ?week, defaulting to this week
  const today = startOfLocalDay(new Date());
  const dayParam = parseDay(params.day);
  const weekStart = startOfWeek(dayParam ?? parseDay(params.week) ?? today);
  const weekKey = localDateKey(weekStart);
  const weekEnd = addLocalDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart, i));

  if (!manager) return <MyShifts userId={user.id} weekStart={weekStart} />;

  const view = params.view === "day" ? "day" : "week";
  const group = params.group === "site" ? "site" : "staff";
  const siteFilter = params.site || "";
  const day = dayParam ?? (today >= weekStart && today < weekEnd ? today : weekStart);
  const dayKey = localDateKey(day);

  // Builds roster links that keep the current view, grouping and filter
  const href = (o: Params = {}) => {
    const q = new URLSearchParams();
    const merged: Params = { week: weekKey, view, group, site: siteFilter, ...o };
    if (merged.view === "day") {
      merged.day = merged.day ?? dayKey;
      delete merged.week;
    }
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/roster?${q}`;
  };
  const returnTo = href();

  const [shifts, employees, sites, holidays, away] = await Promise.all([
    db.shift.findMany({
      where: { start: { gte: weekStart, lt: weekEnd }, status: { not: "CANCELLED" } },
      include: { site: true, employee: true },
      orderBy: { start: "asc" },
    }),
    db.user.findMany({ where: { active: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    db.site.findMany({ orderBy: { name: "asc" } }),
    db.publicHoliday.findMany({ where: { date: { gte: weekStart, lt: weekEnd } } }),
    db.unavailability.findMany({ where: { date: { gte: weekStart, lt: weekEnd } }, include: { user: true } }),
  ]);
  const holidayKeys = new Set(holidays.map((h) => localDateKey(h.date)));
  const awayMap = new Map(away.map((a) => [`${a.userId}|${localDateKey(a.date)}`, a.note ?? ""]));
  const visible = siteFilter ? shifts.filter((s) => s.siteId === siteFilter) : shifts;
  const drafts = shifts.filter((s) => s.status === "DRAFT").length;
  const editing = params.shift && params.shift !== "new" ? shifts.find((s) => s.id === params.shift) : undefined;
  const filteredSite = sites.find((s) => s.id === siteFilter);

  // Grid rows: people (plus open shifts) or sites
  type Row = { id: string; name: string; user?: (typeof employees)[number] };
  const rows: Row[] =
    group === "staff"
      ? [
          { id: "", name: "Open / unassigned" },
          ...employees
            .filter((e) => e.role !== "ADMIN" || visible.some((s) => s.employeeId === e.id))
            .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, user: e })),
        ]
      : sites
          .filter((s) => (siteFilter ? s.id === siteFilter : s.active || visible.some((v) => v.siteId === s.id)))
          .map((s) => ({ id: s.id, name: s.name }));
  const rowShifts = (row: Row) => visible.filter((s) => (group === "staff" ? (s.employeeId ?? "") === row.id : s.siteId === row.id));
  const showRow = (row: Row, list: typeof visible) => !(group === "staff" && row.id === "" && list.length === 0);
  const shiftCost = (s: (typeof visible)[number]) => (s.employee ? costOf(splitByDay(s.start, s.end, s.breakMinutes, holidayKeys), s.employee) : 0);

  const chip = (s: (typeof visible)[number]) => (
    <Link
      key={s.id}
      href={href({ shift: s.id })}
      draggable
      data-shift-id={s.id}
      className={`block cursor-grab rounded-md border px-2 py-1 text-xs hover:border-ink active:cursor-grabbing print:break-inside-avoid ${
        s.status === "DRAFT" ? "border-dashed border-neutral-400 bg-white" : s.status === "OPEN" ? "border-warn/40 bg-amber-50" : "border-neutral-200 bg-neutral-100"
      }`}
    >
      <span className="block font-medium">{fmtRange(s.start, s.end)}</span>
      <span className="block truncate text-muted">
        {group === "staff" ? s.site.name : s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Open shift"}
      </span>
      {s.status === "DRAFT" && <span className="text-[10px] uppercase text-neutral-500 print:hidden">Draft</span>}
    </Link>
  );

  const addLink = (date: string, row: Row) =>
    href({ shift: "new", date, ...(group === "staff" ? (row.id ? { emp: row.id } : {}) : { siteId: row.id }) });

  let totalHours = 0;
  let totalCost = 0;

  return (
    <div>
      <Suspense><AutoDayView /></Suspense>

      {/* Printed heading */}
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-semibold">Plover Security · Roster{filteredSite ? ` · ${filteredSite.name}` : ""}</p>
        <p className="text-sm">{view === "day" ? fmtDateLong(day) : `Week of ${fmtDateLong(weekStart)}`}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="h1">Roster</h1>
          <p className="text-sm text-muted">{view === "day" ? fmtDateLong(day) : `Week of ${fmtDateLong(weekStart)}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {view === "day" ? (
            <>
              <Link className="btn-secondary btn-sm" href={href({ day: localDateKey(addLocalDays(day, -1)) })}>← Prev</Link>
              <Link className="btn-secondary btn-sm" href={href({ day: localDateKey(today) })}>Today</Link>
              <Link className="btn-secondary btn-sm" href={href({ day: localDateKey(addLocalDays(day, 1)) })}>Next →</Link>
            </>
          ) : (
            <>
              <Link className="btn-secondary btn-sm" href={href({ week: localDateKey(addLocalDays(weekStart, -7)) })}>← Prev</Link>
              <Link className="btn-secondary btn-sm" href={href({ week: localDateKey(today) })}>This week</Link>
              <Link className="btn-secondary btn-sm" href={href({ week: localDateKey(addLocalDays(weekStart, 7)) })}>Next →</Link>
            </>
          )}
        </div>
      </div>
      <div className="print:hidden"><Flash params={params} /></div>

      {/* View controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Toggle options={[["week", "Week"], ["day", "Day"]]} value={view} link={(v) => href({ view: v, day: v === "day" ? dayKey : undefined })} />
        <Toggle options={[["staff", "By staff"], ["site", "By site"]]} value={group} link={(v) => href({ group: v })} />
        <form action="/roster" className="flex items-center gap-2">
          {view === "day" ? <input type="hidden" name="day" value={dayKey} /> : <input type="hidden" name="week" value={weekKey} />}
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="group" value={group} />
          <select name="site" defaultValue={siteFilter} className="input w-auto py-1.5" aria-label="Filter by site">
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link className="btn" href={href({ shift: "new" })}>+ Add shift</Link>
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
        <PrintButton />
      </div>

      {(params.shift === "new" || editing) && (
        <ShiftForm
          editing={editing}
          sites={sites.filter((s) => s.active || s.id === editing?.siteId)}
          employees={employees}
          params={params}
          defaultDate={params.date ?? dayKey}
          returnTo={returnTo}
        />
      )}

      {view === "week" ? (
        <RosterDnD>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface print:overflow-visible print:border-0">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-sm print:min-w-0 print:text-[10px]">
              <thead>
                <tr>
                  <th className="w-40 border-b border-border p-2 text-left text-xs font-medium uppercase tracking-wide text-muted print:w-28">
                    {group === "staff" ? "Staff" : "Site"}
                  </th>
                  {days.map((d) => {
                    const key = localDateKey(d);
                    return (
                      <th key={key} className={`border-b border-l border-border p-2 text-left text-xs font-medium ${holidayKeys.has(key) ? "bg-amber-50" : ""}`}>
                        <Link href={href({ view: "day", day: key })} className="hover:underline">{fmtDate(d)}</Link>
                        {holidayKeys.has(key) && <span className="block text-[10px] font-normal text-warn">Public holiday</span>}
                      </th>
                    );
                  })}
                  <th className="w-24 border-b border-l border-border p-2 text-right text-xs font-medium uppercase tracking-wide text-muted">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const list = rowShifts(row);
                  if (!showRow(row, list)) return null;
                  const hours = list.reduce((h, s) => h + paidHours(s.start, s.end, s.breakMinutes), 0);
                  const cost = list.reduce((c, s) => c + shiftCost(s), 0);
                  totalHours += hours;
                  totalCost += cost;
                  return (
                    <tr key={row.id || "open"} className="align-top print:break-inside-avoid">
                      <td className="border-b border-border p-2 font-medium">{row.name}</td>
                      {days.map((d) => {
                        const key = localDateKey(d);
                        const cell = list.filter((s) => localDateKey(s.start) === key);
                        const awayNote = group === "staff" && row.id ? awayMap.get(`${row.id}|${key}`) : undefined;
                        return (
                          <td
                            key={key}
                            data-day={key}
                            {...(group === "staff" ? { "data-emp": row.id } : { "data-site": row.id })}
                            className={`group border-b border-l border-border p-1.5 ${awayNote !== undefined ? "bg-neutral-100 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]" : ""}`}
                          >
                            <div className="space-y-1">
                              {awayNote !== undefined && (
                                <p className="rounded px-1 text-[10px] font-medium uppercase tracking-wide text-bad" title={awayNote || undefined}>
                                  Unavailable{awayNote ? `: ${awayNote}` : ""}
                                </p>
                              )}
                              {cell.map(chip)}
                              <Link
                                href={addLink(key, row)}
                                aria-label={`Add shift on ${fmtDate(d)} for ${row.name}`}
                                className="block rounded-md py-0.5 text-center text-xs text-transparent hover:bg-neutral-100 hover:text-muted group-hover:text-neutral-400 print:hidden [@media(hover:none)]:text-neutral-400"
                              >
                                +
                              </Link>
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-border p-2 text-right">
                        {hours > 0 && <span className="block">{fmtHours(hours)}</span>}
                        {cost > 0 && <span className="block text-xs text-muted print:hidden">{fmtMoney(cost)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8} className="p-2 text-right text-xs uppercase tracking-wide text-muted">Week total</td>
                  <td className="border-l border-border p-2 text-right font-medium">
                    {fmtHours(totalHours)}
                    <span className="block text-xs font-normal text-muted print:hidden">{fmtMoney(totalCost)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </RosterDnD>
      ) : (
        <DayView
          rows={rows}
          shifts={visible.filter((s) => localDateKey(s.start) === dayKey)}
          group={group}
          away={away.filter((a) => localDateKey(a.date) === dayKey)}
          isHoliday={holidayKeys.has(dayKey)}
          editHref={(id) => href({ shift: id })}
          addHref={(row) => addLink(dayKey, row)}
        />
      )}

      <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted print:hidden">
        <StatusBadge status="DRAFT" /> not visible to staff until published
        <StatusBadge status="OPEN" /> anyone can claim
        {view === "week" && <span>Drag a shift to move it to another day or {group === "staff" ? "person" : "site"}.</span>}
        <span>Costs are estimates from each person&apos;s flat rates and aren&apos;t printed.</span>
      </p>
    </div>
  );
}

function Toggle({ options, value, link }: { options: [string, string][]; value: string; link: (v: string) => string }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map(([v, label]) => (
        <Link key={v} href={link(v)}
          className={`rounded-md px-3 py-1 text-sm ${v === value ? "bg-ink text-white" : "text-muted hover:text-foreground"}`}>
          {label}
        </Link>
      ))}
    </div>
  );
}

type DayShift = {
  id: string; start: Date; end: Date; status: string; role: string | null; breakMinutes: number;
  site: { name: string }; employee: { firstName: string; lastName: string } | null; employeeId: string | null; siteId: string;
};

function DayView({ rows, shifts, group, away, isHoliday, editHref, addHref }: {
  rows: { id: string; name: string }[];
  shifts: DayShift[];
  group: "staff" | "site";
  away: { id: string; note: string | null; user: { firstName: string; lastName: string } }[];
  isHoliday: boolean;
  editHref: (id: string) => string;
  addHref: (row: { id: string; name: string }) => string;
}) {
  const used = rows
    .map((row) => ({ row, list: shifts.filter((s) => (group === "staff" ? (s.employeeId ?? "") === row.id : s.siteId === row.id)) }))
    .filter(({ row, list }) => list.length > 0 || group === "site" || row.id !== "");
  const working = group === "staff" ? used.filter((u) => u.list.length > 0) : used;

  return (
    <div className="space-y-4">
      {isHoliday && <p className="rounded-lg border border-warn/30 bg-amber-50 px-4 py-2 text-sm text-warn">Public holiday: public holiday rates apply.</p>}
      {shifts.length === 0 && <div className="card text-sm text-muted">No shifts on this day.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {working.map(({ row, list }) => (
          <section key={row.id || "open"} className="card print:break-inside-avoid">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{row.name}</h2>
              <Link href={addHref(row)} className="btn-secondary btn-sm print:hidden">+ Add</Link>
            </div>
            {list.length === 0 && <p className="text-sm text-bad">No cover rostered</p>}
            <ul className="space-y-2">
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={editHref(s.id)} className={`block rounded-lg border px-3 py-2 hover:border-ink ${
                    s.status === "DRAFT" ? "border-dashed border-neutral-400" : s.status === "OPEN" ? "border-warn/40 bg-amber-50" : "border-border bg-neutral-50"
                  }`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{fmtRange(s.start, s.end)}</span>
                      {s.status !== "PUBLISHED" && <StatusBadge status={s.status} />}
                    </span>
                    <span className="block text-sm text-muted">
                      {group === "staff" ? s.site.name : s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Open shift"}
                      {s.role ? ` · ${s.role}` : ""} · {fmtHours(paidHours(s.start, s.end, s.breakMinutes))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {away.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Unavailable</h2>
          <ul className="space-y-1 text-sm">
            {away.map((a) => (
              <li key={a.id}>{a.user.firstName} {a.user.lastName}{a.note ? <span className="text-muted"> · {a.note}</span> : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ShiftForm({ editing, sites, employees, params, defaultDate, returnTo }: {
  editing?: { id: string; siteId: string; employeeId: string | null; start: Date; end: Date; breakMinutes: number; role: string | null; notes: string | null; status: string };
  sites: { id: string; name: string }[];
  employees: { id: string; firstName: string; lastName: string }[];
  params: Params;
  defaultDate: string;
  returnTo: string;
}) {
  return (
    <div className="mb-6 print:hidden">
      <form action={saveShift} className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="h2 sm:col-span-2 lg:col-span-4">{editing ? "Edit shift" : "New shift"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label className="label">Site</label>
          <select name="siteId" className="input" defaultValue={editing?.siteId ?? params.siteId ?? params.site ?? ""} required>
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
        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" name="allowUnavailable" className="h-4 w-4 accent-black" />
          Book anyway if they&apos;ve marked themselves unavailable
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn">{editing ? "Save changes" : "Add shift"}</button>
          <Link href={returnTo} className="btn-secondary">Close</Link>
        </div>
      </form>
      {editing && (
        <form action={cancelShift} className="mt-2">
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="btn-danger btn-sm">{editing.status === "DRAFT" ? "Delete draft" : "Cancel this shift"}</button>
        </form>
      )}
    </div>
  );
}

async function MyShifts({ userId, weekStart }: { userId: string; weekStart: Date }) {
  const shifts = await db.shift.findMany({
    where: { employeeId: userId, status: "PUBLISHED", start: { gte: weekStart, lt: addLocalDays(weekStart, 7) } },
    include: { site: true },
    orderBy: { start: "asc" },
  });
  const now = new Date();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">My shifts</h1>
          <p className="text-sm text-muted">Week of {fmtDateLong(weekStart)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary btn-sm" href={`/roster?week=${localDateKey(addLocalDays(weekStart, -7))}`}>← Prev</Link>
          <Link className="btn-secondary btn-sm" href="/roster">This week</Link>
          <Link className="btn-secondary btn-sm" href={`/roster?week=${localDateKey(addLocalDays(weekStart, 7))}`}>Next →</Link>
        </div>
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
              {s.start > now && <Link href={`/swaps?shift=${s.id}`} className="text-xs underline">Request swap</Link>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        Can&apos;t work a day? <Link href="/availability" className="underline">Mark yourself unavailable</Link>. Want these in your phone
        calendar? <Link href="/account#calendar" className="underline">Add to calendar</Link>.
      </p>
    </div>
  );
}
