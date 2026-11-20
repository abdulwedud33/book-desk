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

