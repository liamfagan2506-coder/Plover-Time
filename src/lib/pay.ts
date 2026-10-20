import { localDateKey, zonedParts, startOfLocalDay, addLocalDays } from "./time";

export type RateCategory = "WEEKDAY" | "SATURDAY" | "SUNDAY" | "PUBLIC_HOLIDAY";

export const CATEGORY_LABELS: Record<RateCategory, string> = {
  WEEKDAY: "Weekday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  PUBLIC_HOLIDAY: "Public holiday",
};

// Earnings rate names as set up in Xero Payroll. Change these to match your Xero account exactly.
export const XERO_EARNINGS_RATES: Record<RateCategory, string> = {
  WEEKDAY: "Ordinary Hours",
  SATURDAY: "Saturday Hours",
  SUNDAY: "Sunday Hours",
  PUBLIC_HOLIDAY: "Public Holiday Hours",
};

export type Rates = {
  rateWeekday: number;
  rateSaturday: number;
  rateSunday: number;
  ratePublicHoliday: number;
};

export type DaySplit = { date: string; category: RateCategory; hours: number };

export function rateFor(category: RateCategory, rates: Rates): number {
  switch (category) {
    case "WEEKDAY":
      return rates.rateWeekday;
    case "SATURDAY":
      return rates.rateSaturday;
    case "SUNDAY":
      return rates.rateSunday;
    case "PUBLIC_HOLIDAY":
      return rates.ratePublicHoliday;
  }
}

function categoryFor(date: Date, holidays: Set<string>): RateCategory {
  if (holidays.has(localDateKey(date))) return "PUBLIC_HOLIDAY";
  const wd = zonedParts(date).weekday;
  if (wd === 6) return "SATURDAY";
  if (wd === 0) return "SUNDAY";
  return "WEEKDAY";
}

// Split worked time into local calendar days so a shift crossing midnight
// (e.g. Saturday 10pm to Sunday 6am) is paid at each day's rate.
// Unpaid break minutes are deducted proportionally across the days.
export function splitByDay(start: Date, end: Date, breakMinutes: number, holidays: Set<string>): DaySplit[] {
  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return [];
  const segments: DaySplit[] = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnight = addLocalDays(startOfLocalDay(cursor), 1);
    const segEnd = nextMidnight < end ? nextMidnight : end;
    segments.push({
      date: localDateKey(cursor),
      category: categoryFor(cursor, holidays),
      hours: (segEnd.getTime() - cursor.getTime()) / 3_600_000,
    });
    cursor = segEnd;
  }
  const totalHours = totalMs / 3_600_000;
  const paidFraction = Math.max(0, totalHours - breakMinutes / 60) / totalHours;
  return segments.map((s) => ({ ...s, hours: round2(s.hours * paidFraction) }));
}

export function paidHours(start: Date, end: Date, breakMinutes: number): number {
  const h = (end.getTime() - start.getTime()) / 3_600_000 - breakMinutes / 60;
  return round2(Math.max(0, h));
}

export function costOf(splits: DaySplit[], rates: Rates): number {
  return round2(splits.reduce((sum, s) => sum + s.hours * rateFor(s.category, rates), 0));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}
