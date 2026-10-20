import "server-only";
import { db } from "./db";
import { localDateKey } from "./time";
import { CATEGORY_LABELS, XERO_EARNINGS_RATES, rateFor, round2, splitByDay, type RateCategory } from "./pay";

export type ExportLine = {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  xeroEmployeeId: string | null;
  date: string;
  category: RateCategory;
  hours: number;
  rate: number;
};

// Approved timesheets whose clock-in falls in [from, to), split into day/rate lines
export async function buildExport(from: Date, to: Date, includeExported: boolean) {
  const sheets = await db.timesheet.findMany({
    where: {
      clockIn: { gte: from, lt: to },
      clockOut: { not: null },
      status: includeExported ? { in: ["APPROVED", "EXPORTED"] } : "APPROVED",
    },
    include: { employee: true },
    orderBy: [{ employee: { lastName: "asc" } }, { clockIn: "asc" }],
  });
  const holidays = new Set((await db.publicHoliday.findMany()).map((h) => localDateKey(h.date)));

  // Merge lines for the same employee, date and rate
  const merged = new Map<string, ExportLine>();
  for (const t of sheets) {
    for (const split of splitByDay(t.clockIn, t.clockOut!, t.breakMinutes, holidays)) {
      const key = `${t.employeeId}|${split.date}|${split.category}`;
      const line = merged.get(key);
      if (line) line.hours = round2(line.hours + split.hours);
      else
        merged.set(key, {
          employeeId: t.employeeId,
          firstName: t.employee.firstName,
          lastName: t.employee.lastName,
          email: t.employee.email,
          xeroEmployeeId: t.employee.xeroEmployeeId,
          date: split.date,
          category: split.category,
          hours: split.hours,
          rate: rateFor(split.category, t.employee),
        });
    }
  }
  const lines = [...merged.values()];

  const byEmployee = new Map<string, { name: string; hours: Record<RateCategory, number>; total: number; pay: number }>();
  for (const l of lines) {
    const e = byEmployee.get(l.employeeId) ?? {
      name: `${l.firstName} ${l.lastName}`,
      hours: { WEEKDAY: 0, SATURDAY: 0, SUNDAY: 0, PUBLIC_HOLIDAY: 0 },
      total: 0,
      pay: 0,
    };
    e.hours[l.category] = round2(e.hours[l.category] + l.hours);
    e.total = round2(e.total + l.hours);
    e.pay = round2(e.pay + l.hours * l.rate);
    byEmployee.set(l.employeeId, e);
  }

  return { sheetIds: sheets.map((s) => s.id), lines, summary: [...byEmployee.values()] };
}

function csvCell(v: string | number) {
  const s = String(v);
  // Quote when needed, and stop spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// One row per employee, day and earnings rate, named to match Xero Payroll
export function xeroCsv(lines: ExportLine[]) {
  return toCsv([
    ["Employee First Name", "Employee Last Name", "Employee Email", "Xero Employee ID", "Earnings Rate", "Date", "Hours"],
    ...lines.map((l) => [l.firstName, l.lastName, l.email, l.xeroEmployeeId ?? "", XERO_EARNINGS_RATES[l.category], l.date, l.hours]),
  ]);
}

export function summaryCsv(lines: ExportLine[]) {
  return toCsv([
    ["Employee", "Date", "Rate type", "Hours", "Hourly rate", "Amount"],
    ...lines.map((l) => [`${l.firstName} ${l.lastName}`, l.date, CATEGORY_LABELS[l.category], l.hours, l.rate.toFixed(2), (l.hours * l.rate).toFixed(2)]),
  ]);
}
