import { requireUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout } from "@/actions/auth";
import { Nav, type NavItem } from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const manager = isManager(user.role);

  const [unread, openShifts, pendingTimesheets, pendingSwaps, pendingClaims] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.shift.count({ where: { status: "OPEN", start: { gt: new Date() } } }),
    manager ? db.timesheet.count({ where: { status: "PENDING", clockOut: { not: null } } }) : 0,
    manager
      ? db.swapRequest.count({ where: { status: "PENDING", acceptedByTo: true } })
      : db.swapRequest.count({ where: { status: "PENDING", toId: user.id, acceptedByTo: false } }),
    manager ? db.shiftClaim.count({ where: { status: "PENDING" } }) : 0,
  ]);

  const items: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/roster", label: manager ? "Roster" : "My shifts" },
    { href: "/open-shifts", label: "Open shifts", count: manager ? pendingClaims : openShifts },
    { href: "/swaps", label: "Shift swaps", count: pendingSwaps },
    { href: "/timesheets", label: "Timesheets", count: pendingTimesheets },
    { href: "/notifications", label: "Notifications", count: unread },
  ];
  if (manager) {
    items.push(
      { href: "/sites", label: "Sites", section: "Manage" },
      { href: "/export", label: "Xero export", section: "Manage" },
    );
  }
  if (user.role === "ADMIN") {
    items.push(
      { href: "/admin/employees", label: "Employees & rates", section: "Admin" },
      { href: "/admin/holidays", label: "Public holidays", section: "Admin" },
    );
  }

  return (
    <div className="min-h-dvh lg:pl-60">
      <Nav items={items} userName={`${user.firstName} ${user.lastName}`} role={user.role} logoutAction={logout} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
