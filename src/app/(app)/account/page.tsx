import { requireUser } from "@/lib/auth";
import { smsEnabled } from "@/lib/notify";
import { updatePreferences } from "@/actions/auth";
import { PasswordForm } from "./PasswordForm";
import type { PageParams } from "@/components/Flash";

export default async function AccountPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="h1">My account</h1>
        <p className="text-sm text-muted">{user.firstName} {user.lastName} · {user.email}</p>
      </div>

      <form action={updatePreferences} className="card space-y-4">
        <h2 className="h2">Notifications</h2>
        {params.saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-ok">Saved.</p>}
        <div>
          <label className="label">Mobile number</label>
          <input name="phone" className="input" defaultValue={user.phone ?? ""} placeholder="+61412345678" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} className="h-4 w-4 accent-black" />
          Email me about roster changes, swaps and approvals
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifySms" defaultChecked={user.notifySms} className="h-4 w-4 accent-black" />
          Text me as well {!smsEnabled() && <span className="text-muted">(SMS isn&apos;t switched on yet)</span>}
        </label>
        <button className="btn">Save</button>
      </form>

      <PasswordForm />
    </div>
  );
}
