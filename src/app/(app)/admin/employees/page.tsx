import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtMoney } from "@/lib/pay";
import { resetPassword, saveEmployee } from "@/actions/admin";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function EmployeesPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  await requireAdmin();
  const secret = (await cookies()).get("plover_secret")?.value;
  const employees = await db.user.findMany({ orderBy: [{ active: "desc" }, { firstName: "asc" }] });
  const editing = params.edit ? employees.find((e) => e.id === params.edit) : undefined;
  const showForm = params.new || editing;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Employees & pay rates</h1>
          <p className="text-sm text-muted">{employees.filter((e) => e.active).length} active staff. Rates are flat hourly amounts in AUD.</p>
        </div>
        <Link href="/admin/employees?new=1" className="btn">+ Add employee</Link>
      </div>
      <Flash params={params} />
      {secret && (
        <p className="mb-4 rounded-lg border border-ink bg-surface px-4 py-2.5 text-sm">
          <strong>{secret}</strong>. It was emailed to them too. This message disappears after a minute.
        </p>
      )}

      {showForm && (
        <form action={saveEmployee} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="h2 sm:col-span-2 lg:col-span-4">{editing ? `Edit ${editing.firstName} ${editing.lastName}` : "New employee"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="First name" name="firstName" value={editing?.firstName} required />
          <Field label="Last name" name="lastName" value={editing?.lastName} required />
          <Field label="Email" name="email" type="email" value={editing?.email} required />
          <Field label="Mobile (for SMS, e.g. +61412345678)" name="phone" value={editing?.phone} />
          <div>
            <label className="label">Access</label>
            <select name="role" className="input" defaultValue={editing?.role ?? "EMPLOYEE"}>
              <option value="EMPLOYEE">Employee: own shifts and timesheets</option>
              <option value="MANAGER">Manager: roster, approvals, export</option>
              <option value="ADMIN">Admin: everything, including pay rates</option>
            </select>
          </div>
          <Field label="Xero employee name/ID" name="xeroEmployeeId" value={editing?.xeroEmployeeId} placeholder="Optional" />
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="label">Hourly rates (AUD)</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Weekday" name="rateWeekday" type="number" value={editing?.rateWeekday} />
              <Field label="Saturday" name="rateSaturday" type="number" value={editing?.rateSaturday} />
              <Field label="Sunday" name="rateSunday" type="number" value={editing?.rateSunday} />
              <Field label="Public holiday" name="ratePublicHoliday" type="number" value={editing?.ratePublicHoliday} />
            </div>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input type="checkbox" name="active" defaultChecked={editing.active} className="h-4 w-4 accent-black" />
              Active (untick when someone leaves; they can no longer sign in)
            </label>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn">{editing ? "Save" : "Add and email login details"}</button>
            <Link href="/admin/employees" className="btn-secondary">Close</Link>
          </div>
        </form>
      )}
      {editing && (
        <form action={resetPassword} className="-mt-4 mb-6">
          <input type="hidden" name="id" value={editing.id} />
          <button className="btn-secondary btn-sm">Reset password</button>
        </form>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table min-w-[760px]">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Access</th><th className="text-right">Weekday</th><th className="text-right">Sat</th><th className="text-right">Sun</th><th className="text-right">Public hol.</th><th /></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                <td className="font-medium">{e.firstName} {e.lastName}{!e.active && <span className="ml-2"><StatusBadge status="CANCELLED" label="Inactive" /></span>}</td>
                <td className="text-muted">{e.email}</td>
                <td>{e.role.charAt(0) + e.role.slice(1).toLowerCase()}</td>
                <td className="text-right">{fmtMoney(e.rateWeekday)}</td>
                <td className="text-right">{fmtMoney(e.rateSaturday)}</td>
                <td className="text-right">{fmtMoney(e.rateSunday)}</td>
                <td className="text-right">{fmtMoney(e.ratePublicHoliday)}</td>
                <td className="text-right"><Link href={`/admin/employees?edit=${e.id}`} className="text-xs underline">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, name, value, type = "text", required, placeholder }: {
  label: string; name: string; value?: string | number | null; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={value ?? ""} required={required}
        placeholder={placeholder} step={type === "number" ? "0.01" : undefined} min={type === "number" ? 0 : undefined} />
    </div>
  );
}
