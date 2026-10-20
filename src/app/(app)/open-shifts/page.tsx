import { db } from "@/lib/db";
import { requireUser, isManager } from "@/lib/auth";
import { fmtDate, fmtHours, fmtRange } from "@/lib/time";
import { paidHours } from "@/lib/pay";
import { claimShift, decideClaim, withdrawClaim } from "@/actions/shifts";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function OpenShiftsPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const manager = isManager(user.role);

  const shifts = await db.shift.findMany({
    where: { status: "OPEN", start: { gt: new Date() } },
    include: { site: true, claims: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { start: "asc" },
  });

  return (
    <div>
      <h1 className="h1">Open shifts</h1>
      <p className="mb-6 text-sm text-muted">
        {manager ? "Approve who gets each open shift. Add open shifts from the roster by leaving the employee blank." : "Request a shift and a manager will confirm it."}
      </p>
      <Flash params={params} />
      <div className="space-y-3">
        {shifts.length === 0 && <div className="card text-sm text-muted">No open shifts right now.</div>}
        {shifts.map((s) => {
          const myClaim = s.claims.find((c) => c.employeeId === user.id);
          const pending = s.claims.filter((c) => c.status === "PENDING");
          return (
            <div key={s.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{fmtDate(s.start)} · {fmtRange(s.start, s.end)}</p>
                  <p className="text-sm text-muted">{s.site.name}{s.role ? ` · ${s.role}` : ""} · {fmtHours(paidHours(s.start, s.end, s.breakMinutes))}</p>
                  {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                </div>
                {!manager && (
                  myClaim && myClaim.status === "PENDING" ? (
                    <form action={withdrawClaim} className="flex items-center gap-2">
                      <StatusBadge status="PENDING" label="Requested" />
                      <input type="hidden" name="id" value={myClaim.id} />
                      <button className="btn-secondary btn-sm">Withdraw</button>
                    </form>
                  ) : myClaim?.status === "REJECTED" ? (
                    <StatusBadge status="REJECTED" label="Not approved" />
                  ) : (
                    <form action={claimShift}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="btn btn-sm">Request shift</button>
                    </form>
                  )
                )}
              </div>
              {manager && (
                <div className="mt-3 border-t border-border pt-3">
                  {pending.length === 0 ? (
                    <p className="text-sm text-muted">No requests yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {pending.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm">{c.employee.firstName} {c.employee.lastName}</span>
                          <span className="flex gap-2">
                            <form action={decideClaim}>
                              <input type="hidden" name="id" value={c.id} />
                              <button name="decision" value="approve" className="btn btn-sm">Approve</button>
                            </form>
                            <form action={decideClaim}>
                              <input type="hidden" name="id" value={c.id} />
                              <button name="decision" value="reject" className="btn-secondary btn-sm">Decline</button>
                            </form>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
