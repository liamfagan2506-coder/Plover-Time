import { db } from "@/lib/db";

// Calendar feed for one employee: /calendar/<token>.ics
// The long random token in the link is the only protection, so it's never shown to anyone else
// and can be reset from My account.

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/, "");
  if (token.length < 20) return new Response("Not found", { status: 404 });

  const user = await db.user.findUnique({ where: { calendarToken: token } });
  if (!user || !user.active) return new Response("Not found", { status: 404 });

  const now = Date.now();
  const shifts = await db.shift.findMany({
    where: {
      employeeId: user.id,
      status: "PUBLISHED",
      start: { gte: new Date(now - 30 * 86_400_000), lte: new Date(now + 120 * 86_400_000) },
    },
    include: { site: true },
    orderBy: { start: "asc" },
  });

  const stamp = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plover Security//Plover Time//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Plover shifts",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...shifts.flatMap((s) => [
      "BEGIN:VEVENT",
      `UID:${s.id}@plover-time`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(s.start)}`,
      `DTEND:${icsDate(s.end)}`,
      `SUMMARY:${icsText(`Plover: ${s.site.name}${s.role ? ` (${s.role})` : ""}`)}`,
      ...(s.site.address ? [`LOCATION:${icsText(s.site.address)}`] : []),
      `DESCRIPTION:${icsText([s.notes, s.site.notes, s.breakMinutes ? `${s.breakMinutes} min unpaid break` : ""].filter(Boolean).join("\n"))}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="plover-shifts.ics"',
      "Cache-Control": "no-store",
    },
  });
}
