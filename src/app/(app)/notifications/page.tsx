import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { markAllRead } from "@/actions/admin";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = notifications.some((n) => !n.read);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="h1">Notifications</h1>
        {unread && (
          <form action={markAllRead}><button className="btn-secondary btn-sm">Mark all as read</button></form>
        )}
      </div>
      <div className="card divide-y divide-border p-0 sm:p-0">
        {notifications.length === 0 && <p className="p-4 text-sm text-muted">No notifications yet.</p>}
        {notifications.map((n) => (
          <div key={n.id} className={`p-4 ${n.read ? "" : "bg-neutral-50"}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</p>
              <p className="text-xs text-muted">{fmtDateTime(n.createdAt)}</p>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
