import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { saveSite } from "@/actions/admin";
import { Flash, type PageParams } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";

export default async function SitesPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  await requireManager();
  const sites = await db.site.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { shifts: true } } } });
  const editing = params.edit ? sites.find((s) => s.id === params.edit) : undefined;

  return (
    <div>
      <h1 className="h1">Sites</h1>
      <p className="mb-6 text-sm text-muted">Client locations you roster guards to.</p>
      <Flash params={params} />

      <form action={saveSite} className="card mb-6 grid gap-4 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">{editing ? `Edit ${editing.name}` : "Add a site"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="label">Site name</label>
          <input name="name" className="input" required defaultValue={editing?.name ?? ""} />
        </div>
        <div>
          <label className="label">Client</label>
          <input name="client" className="input" defaultValue={editing?.client ?? ""} />
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" defaultValue={editing?.address ?? ""} />
        </div>
        <div>
          <label className="label">Site notes (shown to guards)</label>
          <input name="notes" className="input" placeholder="Parking, key safe, site contact" defaultValue={editing?.notes ?? ""} />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={editing.active} className="h-4 w-4 accent-black" /> Active
          </label>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn">{editing ? "Save" : "Add site"}</button>
          {editing && <Link href="/sites" className="btn-secondary">Cancel</Link>}
        </div>
      </form>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table min-w-[600px]">
          <thead><tr><th>Site</th><th>Client</th><th>Address</th><th className="text-right">Shifts</th><th /></tr></thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                <td className="font-medium">{s.name} {!s.active && <StatusBadge status="CANCELLED" label="Inactive" />}</td>
                <td>{s.client}</td>
                <td className="text-muted">{s.address}</td>
                <td className="text-right">{s._count.shifts}</td>
                <td className="text-right"><Link href={`/sites?edit=${s.id}`} className="text-xs underline">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
