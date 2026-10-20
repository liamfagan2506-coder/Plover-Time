import Link from "next/link";
import { db } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { addLocalDays, fmtDate, localDateKey, startOfLocalDay } from "@/lib/time";
import { describeRule, expandRules } from "@/lib/availability";
import { deleteRule } from "@/actions/me";
import { Flash, type PageParams } from "@/components/Flash";
import { RuleForm, type RuleFormValues } from "@/components/availability/RuleForm";

const pad = (n: number) => String(n).padStart(2, "0");
const toTime = (m: number | null) => (m == null ? "" : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

export default async function AvailabilityPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const me = await requireUser();
  const manager = isManager(me.role);
  const today = startOfLocalDay(new Date());

  // Managers can view and edit anyone's availability
  const staff = manager ? await db.user.findMany({ where: { active: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }) : [];
  const person = manager && params.user ? (staff.find((s) => s.id === params.user) ?? me) : me;
  const self = person.id === me.id;
  const pageHref = self ? "/availability" : `/availability?user=${person.id}`;

  const rules = await db.availabilityRule.findMany({
    where: { userId: person.id, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    orderBy: { startDate: "asc" },
  });
  const editing = params.edit ? rules.find((r) => r.id === params.edit) : undefined;
  const initial: RuleFormValues | undefined = editing && {
    id: editing.id,
    repeat: editing.repeat,
    weekdays: editing.weekdays.split(",").filter(Boolean),
    startDate: localDateKey(editing.startDate),
    endDate: editing.endDate && (editing.repeat !== "NONE" || editing.endDate.getTime() !== editing.startDate.getTime()) ? localDateKey(editing.endDate) : "",
    allDay: editing.allDay,
    startTime: toTime(editing.startMinute),
    endTime: toTime(editing.endMinute),
    note: editing.note ?? "",
  };

  // Two-week preview
  const previewDays = Array.from({ length: 14 }, (_, i) => addLocalDays(today, i));
  const blocks = expandRules(rules, today, addLocalDays(today, 14));

  return (
    <div className="max-w-3xl">
      <h1 className="h1">Availability</h1>
      <p className="mb-4 text-sm text-muted">
        {self ? "Set the times you can't work." : `Times ${person.firstName} can't work.`} Managers see these on the roster and
        can&apos;t book {self ? "you" : "them"} then without overriding. Everything else counts as available.
      </p>

      {manager && (
        <form action="/availability" className="mb-6 flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted" htmlFor="user">Showing</label>
          <select id="user" name="user" defaultValue={person.id} className="input w-auto py-1.5">
            {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.id === me.id ? " (me)" : ""}</option>)}
          </select>
          <button className="btn-secondary btn-sm">View</button>
        </form>
      )}

      <Flash params={params} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <RuleForm key={editing?.id ?? "new"} userId={person.id} initial={initial} today={localDateKey(today)} cancelHref={pageHref} />

        <div className="space-y-6">
          <section>
            <h2 className="h2 mb-3">{self ? "Your" : `${person.firstName}'s`} rules</h2>
            <div className="card divide-y divide-border p-0 sm:p-0">
              {rules.length === 0 && <p className="p-4 text-sm text-muted">None yet. {self ? "You're" : `${person.firstName} is`} available any time.</p>}
              {rules.map((r) => (
                <div key={r.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${r.id === editing?.id ? "bg-neutral-50" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-medium">{describeRule(r)}</p>
                    {r.note && <p className="text-sm text-muted">{r.note}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Link href={`${pageHref}${self ? "?" : "&"}edit=${r.id}`} className="btn-secondary btn-sm">Edit</Link>
                    <form action={deleteRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn-danger btn-sm">Delete</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="h2 mb-3">Next two weeks</h2>
            <div className="card p-0 sm:p-0">
              <ul className="divide-y divide-border">
                {previewDays.map((d) => {
                  const key = localDateKey(d);
                  const day = blocks.filter((b) => b.day === key);
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className={day.length ? "font-medium" : "text-muted"}>{fmtDate(d)}</span>
                      <span className="text-right">
                        {day.length === 0 ? (
                          <span className="text-ok">Available</span>
                        ) : (
                          day.map((b) => (
                            <span key={b.ruleId} className="block text-bad">
                              {b.label === "All day" ? "Unavailable all day" : `Unavailable ${b.label}`}
                            </span>
                          ))
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
