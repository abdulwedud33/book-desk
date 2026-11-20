/**
 * Time and Timezone domain utilities for Book Desk.
 * - All instants are represented as UTC Date / ISO strings.
 * - Working hours are local time strings (HH:MM:SS) interpreted in the business time zone.
 * - Supports arbitrary IANA time zones (including DST zones).
 */

/**
 * Converts a 24-hour international hour (0-23) to Ethiopian time hour (1-12).
 * Ethiopian hour = ((international hour - 6) mod 12), displayed as 12 when result is 0.
 */
export function toEthiopianHour(internationalHour: number): number {
  if (internationalHour < 0 || internationalHour > 23 || !Number.isInteger(internationalHour)) {
    throw new RangeError(`Invalid international hour: ${internationalHour}`);
  }
  const raw = (internationalHour - 6) % 12;
  const mod = raw < 0 ? raw + 12 : raw;
  return mod === 0 ? 12 : mod;
}

/**
 * Returns the part-of-day word for an hour:
 * - morning: 05:00 - 11:59
 * - afternoon: 12:00 - 17:59
 * - evening: 18:00 - 21:59
 * - night: 22:00 - 04:59
 */
export function getPartOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Parses "YYYY-MM-DD" date string and "HH:MM" or "HH:MM:SS" local time string
 * in a specified IANA timezone and returns the corresponding UTC Date.
 */
export function localToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const [hStr, mStr, sStr] = timeStr.split(':');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  const second = sStr ? parseInt(sStr, 10) : 0;

  // Compute timezone offset by comparing UTC representation
  const baseUtc = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(baseUtc);
  const pMap: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      pMap[p.type] = parseInt(p.value, 10);
    }
  }

  const targetMs = Date.UTC(pMap.year, pMap.month - 1, pMap.day, pMap.hour, pMap.minute, pMap.second);
  const offsetMs = targetMs - baseUtc.getTime();

  return new Date(baseUtc.getTime() - offsetMs);
}

/**
 * Returns ISO weekday (1 = Monday, 7 = Sunday) for a date string "YYYY-MM-DD".
 */
export function getIsoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Formats a Date into "YYYY-MM-DD" in the specified timezone.
 */
export function formatDateInTz(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Formats a Date with a part-of-day word (e.g. "3:30 in the afternoon", "9:00 in the morning")
 * per the standing non-negotiable rule.
 */
export function formatTimeWithPartOfDay(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  let hour = '';
  let minute = '';
  for (const p of parts) {
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
  }

  const formatter24 = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const hour24 = parseInt(formatter24.format(date), 10);
  const part = getPartOfDay(hour24);
  return `${hour}:${minute} in the ${part}`;
}
