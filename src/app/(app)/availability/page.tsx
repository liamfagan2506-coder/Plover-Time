import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateLong, localDateKey, startOfLocalDay } from "@/lib/time";
import { clearUnavailable, setUnavailable } from "@/actions/me";
import { Flash, type PageParams } from "@/components/Flash";

export default async function AvailabilityPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const today = startOfLocalDay(new Date());
  const days = await db.unavailability.findMany({ where: { userId: user.id, date: { gte: today } }, orderBy: { date: "asc" } });

  return (
    <div className="max-w-2xl">
      <h1 className="h1">Availability</h1>
      <p className="mb-6 text-sm text-muted">
        Mark the days you can&apos;t work. Managers see them on the roster and won&apos;t be able to book you without overriding.
      </p>
      <Flash params={params} />

      <form action={setUnavailable} className="card mb-6 grid gap-4 sm:grid-cols-[170px_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input id="date" type="date" name="date" min={localDateKey(today)} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="note">Reason (optional)</label>
          <input id="note" name="note" className="input" placeholder="e.g. Uni exam, family event" maxLength={80} />
        </div>
        <button className="btn">Mark unavailable</button>
      </form>

      <h2 className="h2 mb-3">Days you&apos;re unavailable</h2>
      <div className="card divide-y divide-border p-0 sm:p-0">
        {days.length === 0 && <p className="p-4 text-sm text-muted">None. You&apos;re available every day.</p>}
        {days.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{fmtDateLong(d.date)}</p>
              {d.note && <p className="text-sm text-muted">{d.note}</p>}
            </div>
            <form action={clearUnavailable}>
              <input type="hidden" name="id" value={d.id} />
              <button className="btn-secondary btn-sm">Remove</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
