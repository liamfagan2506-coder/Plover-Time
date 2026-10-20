import { NextResponse } from "next/server";
import { currentUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildExport, summaryCsv, xeroCsv } from "@/lib/export";
import { addLocalDays, parseLocalDate } from "@/lib/time";

// POST only: downloading can mark timesheets as exported
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !isManager(user.role)) return new NextResponse("Not allowed", { status: 403 });

  const form = await req.formData();
  const fromKey = String(form.get("from") || "");
  const toKey = String(form.get("to") || "");
  let from: Date, to: Date;
  try {
    from = parseLocalDate(fromKey);
    to = addLocalDays(parseLocalDate(toKey), 1);
  } catch {
    return new NextResponse("Invalid dates", { status: 400 });
  }
  const format = form.get("format") === "summary" ? "summary" : "xero";
  const includeExported = form.get("includeExported") === "on";

  const { sheetIds, lines } = await buildExport(from, to, includeExported);
  if (form.get("markExported") === "on" && sheetIds.length) {
    await db.timesheet.updateMany({ where: { id: { in: sheetIds }, status: "APPROVED" }, data: { status: "EXPORTED", exportedAt: new Date() } });
  }

  const csv = format === "summary" ? summaryCsv(lines) : xeroCsv(lines);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plover-${format}-${fromKey}-to-${toKey}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
