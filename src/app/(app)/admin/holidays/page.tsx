import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateLong, startOfLocalDay, addLocalDays } from "@/lib/time";
import { addHoliday, deleteHoliday } from "@/actions/admin";
import { Flash, type PageParams } from "@/components/Flash";

export default async function HolidaysPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  await requireAdmin();
  const holidays = await db.publicHoliday.findMany({
    where: { date: { gte: addLocalDays(startOfLocalDay(new Date()), -90) } },
    orderBy: { date: "asc" },
  });

  return (
    <div>
      <h1 className="h1">Public holidays</h1>
      <p className="mb-6 text-sm text-muted">
        Hours worked on these days are paid at the public holiday rate. Victorian holidays are preloaded. Check them against
        business.vic.gov.au each year, and add AFL Grand Final Friday once it&apos;s announced.
      </p>
      <Flash params={params} />
      <form action={addHoliday} className="card mb-6 grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" className="input" required />
        </div>
        <div>
          <label className="label">Name</label>
          <input name="name" className="input" placeholder="e.g. Friday before the AFL Grand Final" required />
        </div>
        <button className="btn">Add</button>
      </form>
      <div className="card p-0 sm:p-0">
        <table className="table">
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id}>
                <td>{fmtDateLong(h.date)}</td>
                <td>{h.name}</td>
                <td className="text-right">
                  <form action={deleteHoliday}>
                    <input type="hidden" name="id" value={h.id} />
                    <button className="text-xs text-bad underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
