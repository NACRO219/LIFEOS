// Date helpers. Dates are stored as local calendar days "YYYY-MM-DD".
// "Today" honours the configured timezone ("device" = the phone's timezone).

let activeTz: string = "device";

export function setActiveTimezone(tz: string) {
  activeTz = tz || "device";
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function effectiveTimezone(): string {
  return activeTz === "device" ? deviceTimezone() : activeTz;
}

/** Wall-clock parts of `date` in the active timezone. */
export function zonedParts(date: Date = new Date(), tz = effectiveTimezone()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function todayISO(now: Date = new Date()): string {
  const p = zonedParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local calendar day (active timezone) of an ISO timestamp. Never slice ISO strings: they are UTC. */
export function localDay(iso: string): string {
  return todayISO(new Date(iso));
}

export function nowMinutes(now: Date = new Date()): number {
  const p = zonedParts(now);
  return p.hour * 60 + p.minute;
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Parse YYYY-MM-DD as a UTC-noon date (safe arithmetic, no DST issues). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDay(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function weekday(day: string): number {
  return parseDay(day).getUTCDay();
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const wd = weekday(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function isValidDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return formatDay(parseDay(s)) === s;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function prettyDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return parseDay(day).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

export function relativeDay(day: string, today = todayISO()): string {
  const n = diffDays(today, day);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1) return `${-n} days ago`;
  return prettyDay(day);
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function greeting(now: Date = new Date()): string {
  const h = zonedParts(now).hour;
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Convert a wall-clock time in the active timezone on a given day into an absolute Date.
 * Used to schedule notifications when the user picks a timezone different from the device.
 */
export function zonedTimeToDate(day: string, time: string, tz = effectiveTimezone()): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Start with the UTC guess, then correct by the zone offset (twice handles DST edges).
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const wanted = Date.UTC(y, m - 1, d, hh, mm, 0);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
