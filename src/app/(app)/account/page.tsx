import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { resetCalendarLink } from "@/actions/me";
import { Flash } from "@/components/Flash";
import { smsEnabled } from "@/lib/notify";
import { updatePreferences } from "@/actions/auth";
import { PasswordForm } from "./PasswordForm";
import type { PageParams } from "@/components/Flash";

export default async function AccountPage({ searchParams }: { searchParams: PageParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const feed = user.calendarToken ? `${host}/calendar/${user.calendarToken}.ics` : null;

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

      <section id="calendar" className="card scroll-mt-20 space-y-4">
        <h2 className="h2">Shifts in my phone calendar</h2>
        <Flash params={params} />
        <p className="text-sm text-muted">
          Subscribe once and your published shifts appear in your calendar, updating by themselves when the roster changes
          (usually within a few hours).
        </p>
        {feed ? (
          <>
            <div className="flex flex-wrap gap-2">
              <a className="btn" href={`webcal://${feed}`}>Add to iPhone / Apple Calendar</a>
              <a className="btn-secondary" target="_blank" rel="noreferrer"
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${feed}`)}`}>
                Add to Google Calendar
              </a>
            </div>
            <div>
              <label className="label" htmlFor="feed">Or copy this link into Outlook or another calendar app</label>
              <input id="feed" readOnly className="input font-mono text-xs" value={`${proto}://${feed}`} />
            </div>
            <form action={resetCalendarLink} className="flex flex-wrap items-center gap-3">
              <button className="btn-secondary btn-sm">Reset link</button>
              <span className="text-xs text-muted">Keep this link private. Resetting it stops the old link working.</span>
            </form>
          </>
        ) : (
          <form action={resetCalendarLink}>
            <button className="btn">Set up calendar link</button>
          </form>
        )}
      </section>

      <PasswordForm />
    </div>
  );
}
