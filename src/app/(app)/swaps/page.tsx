import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtRange } from "@/lib/time";
import { cancelSwap, decideSwap, requestSwap, respondSwap } from "@/actions/shifts";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function SwapsPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);

  const swaps = await db.swapRequest.findMany({
    where: manager ? {} : { OR: [{ fromId: user.id }, { toId: user.id }] },
    include: { from: true, to: true, shift: { include: { site: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const [myShifts, colleagues] = await Promise.all([
    db.shift.findMany({
      where: { employeeId: user.id, status: "PUBLISHED", start: { gt: new Date() } },
      include: { site: true },
      orderBy: { start: "asc" },
    }),
    db.user.findMany({ where: { active: true, id: { not: user.id }, role: { not: "ADMIN" } }, orderBy: { firstName: "asc" } }),
  ]);

  const needsMe = swaps.filter((s) =>
    s.status === "PENDING" && (manager ? s.acceptedByTo : s.toId === user.id && !s.acceptedByTo),
  );
  const others = swaps.filter((s) => !needsMe.includes(s));

  const describe = (s: (typeof swaps)[number]) =>
    `${fmtDate(s.shift.start)} ${fmtRange(s.shift.start, s.shift.end)} · ${s.shift.site.name}`;

  const stage = (s: (typeof swaps)[number]) =>
    s.status !== "PENDING" ? <StatusBadge status={s.status} /> :
    s.acceptedByTo ? <StatusBadge status="PENDING" label="Awaiting manager" /> :
    <StatusBadge status="PENDING" label={`Awaiting ${s.to.firstName}`} />;

  return (
    <div>
      <h1 className="h1">Shift swaps</h1>
      <p className="mb-6 text-sm text-muted">The colleague accepts first, then a manager approves.</p>
      <Flash params={params} />

      {myShifts.length > 0 && (
        <form action={requestSwap} className="card mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label">My shift</label>
            <select name="shiftId" className="input" defaultValue={params.shift ?? ""} required>
              <option value="" disabled>Choose a shift</option>
              {myShifts.map((s) => (
                <option key={s.id} value={s.id}>{fmtDate(s.start)} {fmtRange(s.start, s.end)} · {s.site.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Give it to</label>
            <select name="toId" className="input" defaultValue="" required>
              <option value="" disabled>Choose a colleague</option>
              {colleagues.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <button className="btn">Send request</button>
        </form>
      )}

      {needsMe.length > 0 && (
        <section className="mb-8">
          <h2 className="h2 mb-3">Needs your answer</h2>
          <div className="space-y-3">
            {needsMe.map((s) => (
              <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{describe(s)}</p>
                  <p className="text-sm text-muted">{s.from.firstName} {s.from.lastName} → {s.to.firstName} {s.to.lastName}</p>
                </div>
                <div className="flex gap-2">
                  <form action={manager ? decideSwap : respondSwap}>
                    <input type="hidden" name="id" value={s.id} />
                    <button name="decision" value={manager ? "approve" : "accept"} className="btn btn-sm">{manager ? "Approve" : "Accept"}</button>
                  </form>
                  <form action={manager ? decideSwap : respondSwap}>
                    <input type="hidden" name="id" value={s.id} />
                    <button name="decision" value="reject" className="btn-secondary btn-sm">Decline</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="h2 mb-3">History</h2>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th>Shift</th><th>From → To</th><th>Requested</th><th>Status</th><th /></tr></thead>
          <tbody>
            {others.length === 0 && <tr><td colSpan={5} className="text-muted">No swap requests.</td></tr>}
            {others.map((s) => (
              <tr key={s.id}>
                <td>{describe(s)}</td>
                <td>{s.from.firstName} → {s.to.firstName}</td>
                <td className="text-muted">{fmtDateTime(s.createdAt)}</td>
                <td>{stage(s)}</td>
                <td className="text-right">
                  {s.status === "PENDING" && s.fromId === user.id && (
                    <form action={cancelSwap}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="btn-secondary btn-sm">Cancel</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
