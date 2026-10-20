import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildExport } from "@/lib/export";
import { fmtMoney, round2 } from "@/lib/pay";
import { addLocalDays, fmtDateLong, localDateKey, parseLocalDate, startOfWeek } from "@/lib/time";
import type { PageParams } from "@/components/Flash";

export default async function ExportPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  await requireManager();

  // Default: the last full fortnight (Monday to Sunday)
  const thisMonday = startOfWeek(new Date());
  let fromKey = params.from ?? localDateKey(addLocalDays(thisMonday, -14));
  let toKey = params.to ?? localDateKey(addLocalDays(thisMonday, -1));
  let from: Date, to: Date;
  try {
    from = parseLocalDate(fromKey);
    to = addLocalDays(parseLocalDate(toKey), 1);
  } catch {
    fromKey = localDateKey(addLocalDays(thisMonday, -14));
    toKey = localDateKey(addLocalDays(thisMonday, -1));
    from = parseLocalDate(fromKey);
    to = addLocalDays(parseLocalDate(toKey), 1);
  }
  const includeExported = params.includeExported === "on";

  const [{ summary, sheetIds }, pendingInRange] = await Promise.all([
    buildExport(from, to, includeExported),
    db.timesheet.count({ where: { clockIn: { gte: from, lt: to }, status: "PENDING" } }),
  ]);
  const totals = summary.reduce((t, e) => ({ hours: round2(t.hours + e.total), pay: round2(t.pay + e.pay) }), { hours: 0, pay: 0 });

  return (
    <div>
      <h1 className="h1">Xero export</h1>
      <p className="mb-6 text-sm text-muted">
        Approved hours for a pay period, split into weekday, Saturday, Sunday and public holiday earnings rates. Xero calculates tax and super and lodges STP.
      </p>

      <form className="card mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label">From</label>
          <input type="date" name="from" className="input" defaultValue={fromKey} />
        </div>
        <div>
          <label className="label">To (inclusive)</label>
          <input type="date" name="to" className="input" defaultValue={toKey} />
        </div>
        <button className="btn-secondary">Preview</button>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="includeExported" defaultChecked={includeExported} className="h-4 w-4 accent-black" />
          Include timesheets already exported (to re-download a period)
        </label>
      </form>

      {pendingInRange > 0 && (
        <p className="mb-4 rounded-lg border border-warn/30 bg-amber-50 px-4 py-2.5 text-sm text-warn">
          {pendingInRange} timesheet(s) in this period still need approval and won&apos;t be included.{" "}
          <Link href="/timesheets" className="underline">Review them</Link>
        </p>
      )}

      <div className="card mb-6 overflow-x-auto p-0 sm:p-0">
        <div className="px-4 pt-4 text-sm text-muted">{fmtDateLong(from)} to {fmtDateLong(addLocalDays(to, -1))}</div>
        <table className="table min-w-[640px]">
          <thead>
            <tr><th>Employee</th><th className="text-right">Weekday</th><th className="text-right">Saturday</th><th className="text-right">Sunday</th><th className="text-right">Public hol.</th><th className="text-right">Total hours</th><th className="text-right">Gross (est.)</th></tr>
          </thead>
          <tbody>
            {summary.length === 0 && <tr><td colSpan={7} className="text-muted">No approved timesheets in this period.</td></tr>}
            {summary.map((e) => (
              <tr key={e.name}>
                <td className="font-medium">{e.name}</td>
                <td className="text-right">{e.hours.WEEKDAY || "—"}</td>
                <td className="text-right">{e.hours.SATURDAY || "—"}</td>
                <td className="text-right">{e.hours.SUNDAY || "—"}</td>
                <td className="text-right">{e.hours.PUBLIC_HOLIDAY || "—"}</td>
                <td className="text-right">{e.total}</td>
                <td className="text-right">{fmtMoney(e.pay)}</td>
              </tr>
            ))}
          </tbody>
          {summary.length > 0 && (
            <tfoot>
              <tr><td className="font-medium" colSpan={5}>Total ({sheetIds.length} timesheets)</td><td className="text-right font-medium">{totals.hours}</td><td className="text-right font-medium">{fmtMoney(totals.pay)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>

      {summary.length > 0 && (
        <form method="post" action="/export/download" className="card space-y-4">
          <input type="hidden" name="from" value={fromKey} />
          <input type="hidden" name="to" value={toKey} />
          {includeExported && <input type="hidden" name="includeExported" value="on" />}
          <h2 className="h2">Download</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="markExported" defaultChecked className="h-4 w-4 accent-black" />
            Mark these timesheets as exported so they aren&apos;t paid twice
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="format" value="xero" className="btn">Download Xero timesheet CSV</button>
            <button name="format" value="summary" className="btn-secondary">Download pay summary CSV</button>
          </div>
          <p className="text-xs text-muted">
            The earnings rate names in the file (Ordinary Hours, Saturday Hours, Sunday Hours, Public Holiday Hours) must match the pay items set up in your Xero
            Payroll. Change them in <code>src/lib/pay.ts</code> if yours differ.
          </p>
        </form>
      )}
    </div>
  );
}
