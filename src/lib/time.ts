// Timezone helpers. Dates are stored in UTC and shown in APP_TIMEZONE.

export const TZ = process.env.APP_TIMEZONE || "Australia/Melbourne";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date, tz = TZ): Parts {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

// Offset (ms) of tz from UTC at the given instant
function tzOffset(date: Date, tz = TZ): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

// Convert a local wall-clock time in tz to a UTC Date
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0, tz = TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - tzOffset(new Date(guess), tz);
  // Re-check once in case the guess crossed a daylight saving change
  return new Date(guess - tzOffset(new Date(first), tz));
}

// Parse a <input type="datetime-local"> value ("2026-10-20T18:00") as local time
export function parseLocalInput(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Invalid date/time: ${value}`);
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

// Parse a <input type="date"> value ("2026-10-20") as local midnight
export function parseLocalDate(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid date: ${value}`);
  return zonedToUtc(+m[1], +m[2], +m[3]);
}

const pad = (n: number) => String(n).padStart(2, "0");

// Value for <input type="datetime-local">
export function toLocalInput(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// "2026-10-20" in local time
export function localDateKey(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function startOfLocalDay(date: Date): Date {
  const p = zonedParts(date);
  return zonedToUtc(p.year, p.month, p.day);
}

export function addLocalDays(date: Date, days: number): Date {
  const p = zonedParts(date);
  return zonedToUtc(p.year, p.month, p.day + days, p.hour, p.minute);
}

// Monday 00:00 local of the week containing date
export function startOfWeek(date: Date): Date {
  const p = zonedParts(date);
  const back = (p.weekday + 6) % 7;
  return zonedToUtc(p.year, p.month, p.day - back);
}

export function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(date);
}

export function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(date);
}

export function fmtDateLong(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function fmtDateTime(date: Date): string {
  return `${fmtDate(date)} ${fmtTime(date)}`;
}

export function fmtRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtHours(hours: number): string {
  return `${Math.round(hours * 100) / 100}h`;
}
