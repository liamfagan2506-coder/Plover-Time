import { addLocalDays, fmtDate, fmtTime, localDateKey, startOfLocalDay, startOfWeek, zonedParts, zonedToUtc } from "./time";

// Expands availability rules into concrete blocked time windows.
// See the AvailabilityRule model in prisma/schema.prisma for how rules are stored.

export type Rule = {
  id: string;
  userId: string;
  repeat: string; // NONE | WEEKLY | FORTNIGHTLY
  weekdays: string; // "1,3" = Mon, Wed
  startDate: Date;
  endDate: Date | null;
  allDay: boolean;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
};

export type Block = { ruleId: string; userId: string; start: Date; end: Date; day: string; label: string; note: string | null };

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

export function parseWeekdays(s: string): number[] {
  return s.split(",").filter(Boolean).map(Number).filter((n) => n >= 0 && n <= 6);
}

export function minutesLabel(m: number) {
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60));
  return new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(d);
}

function timeLabel(r: Pick<Rule, "allDay" | "startMinute" | "endMinute">) {
  if (r.allDay || r.startMinute == null || r.endMinute == null) return "All day";
  return `${minutesLabel(r.startMinute)} – ${minutesLabel(r.endMinute)}${r.endMinute <= r.startMinute ? " (next day)" : ""}`;
}

// Does the rule apply to this local day (local midnight)?
function appliesOn(rule: Rule, day: Date): boolean {
  if (day < rule.startDate) return false;
  if (rule.endDate && day > rule.endDate) return false;
  if (rule.repeat === "NONE") return true;
  if (!parseWeekdays(rule.weekdays).includes(zonedParts(day).weekday)) return false;
  if (rule.repeat === "FORTNIGHTLY") {
    const weeks = Math.round((startOfWeek(day).getTime() - startOfWeek(rule.startDate).getTime()) / (7 * DAY_MS));
    return weeks % 2 === 0;
  }
  return true;
}

// Blocked windows overlapping [from, to)
export function expandRules(rules: Rule[], from: Date, to: Date): Block[] {
  const blocks: Block[] = [];
  // Start a day early so an overnight window from the previous evening is included
  for (let day = addLocalDays(startOfLocalDay(from), -1); day < to; day = addLocalDays(day, 1)) {
    const p = zonedParts(day);
    for (const rule of rules) {
      if (!appliesOn(rule, day)) continue;
      let start: Date, end: Date;
      if (rule.allDay || rule.startMinute == null || rule.endMinute == null) {
        start = day;
        end = addLocalDays(day, 1);
      } else {
        start = zonedToUtc(p.year, p.month, p.day, 0, rule.startMinute);
        end = zonedToUtc(p.year, p.month, p.day + (rule.endMinute <= rule.startMinute ? 1 : 0), 0, rule.endMinute);
      }
      if (start < to && end > from) {
        blocks.push({ ruleId: rule.id, userId: rule.userId, start, end, day: localDateKey(day), label: timeLabel(rule), note: rule.note });
      }
    }
  }
  return blocks;
}

// First blocked window overlapping a shift, if any
export function findBlock(rules: Rule[], start: Date, end: Date): Block | undefined {
  return expandRules(rules, start, end).find((b) => b.start < end && b.end > start);
}

export function describeBlock(b: Block) {
  return `${fmtDate(b.start)} ${b.label === "All day" ? "(all day)" : `${fmtTime(b.start)} – ${fmtTime(b.end)}`}`;
}

// Plain-English summary of a rule, e.g. "Every Tue, Thu · 9:00 am – 3:00 pm · from 1 Nov until 20 Dec"
export function describeRule(r: Rule) {
  const days = parseWeekdays(r.weekdays).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_NAMES[d]).join(", ");
  const when =
    r.repeat === "WEEKLY" ? `Every ${days}` :
    r.repeat === "FORTNIGHTLY" ? `Every second ${days}` :
    r.endDate && r.endDate.getTime() !== r.startDate.getTime() ? `${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}` : fmtDate(r.startDate);
  const range =
    r.repeat === "NONE" ? "" :
    ` · from ${fmtDate(r.startDate)}${r.endDate ? ` until ${fmtDate(r.endDate)}` : ", ongoing"}`;
  return `${when} · ${timeLabel(r)}${range}`;
}
