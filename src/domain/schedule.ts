export interface TimeInterval {
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
}

export function parseMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new RangeError(`Invalid time string: "${timeStr}"`);
  }
  return h * 60 + m;
}

/**
 * Checks if two half-open intervals [startA, endA) and [startB, endB) overlap.
 * Back-to-back intervals (e.g., 09:00-13:00 and 13:00-17:00) do NOT overlap.
 */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  const aStart = parseMinutes(a.start);
  const aEnd = parseMinutes(a.end);
  const bStart = parseMinutes(b.start);
  const bEnd = parseMinutes(b.end);

  if (aEnd <= aStart || bEnd <= bStart) {
    throw new RangeError('End time must be strictly after start time');
  }

  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validates a list of shifts for a single day:
 * Ensures all shifts have end > start and no two shifts overlap.
 */
export function validateDayShifts(shifts: TimeInterval[]): { valid: boolean; error?: string } {
  for (let i = 0; i < shifts.length; i++) {
    const s1 = shifts[i];
    const start1 = parseMinutes(s1.start);
    const end1 = parseMinutes(s1.end);
    if (end1 <= start1) {
      return { valid: false, error: `Shift ${i + 1} end time must be after start time` };
    }

    for (let j = i + 1; j < shifts.length; j++) {
      const s2 = shifts[j];
      if (intervalsOverlap(s1, s2)) {
        return { valid: false, error: `Shift ${i + 1} (${s1.start}-${s1.end}) overlaps with Shift ${j + 1} (${s2.start}-${s2.end})` };
      }
    }
  }

  return { valid: true };
}
