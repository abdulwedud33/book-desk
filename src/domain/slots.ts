import { localToUtc, getIsoWeekday, formatDateInTz } from './time.ts';

export interface ShopConfig {
  timezone: string;
  slotIntervalMin: number;
  leadTimeMin: number;
  horizonDays: number;
}

export interface ServiceConfig {
  id: string;
  durationMin: number;
  bufferMin: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  offersService: boolean;
}

export interface WorkingHourRule {
  providerId: string;
  weekday: number; // 1 = Mon, 7 = Sun
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export interface TimeOffRule {
  providerId: string | null; // null = entire shop closed
  startsAt: Date;
  endsAt: Date;
}

export interface BookingInterval {
  id: string;
  providerId: string;
  startsAt: Date;
  endsAt: Date;
  blockedUntil: Date; // endsAt + service buffer
  status: string;     // pending, confirmed, arrived, in_service
}

export interface DaySlotsResult {
  day: string;
  providerId: string;
  starts: Date[];
}

export interface ComputeSlotsInput {
  shop: ShopConfig;
  service: ServiceConfig;
  providers: ProviderConfig[];
  workingHours: WorkingHourRule[];
  timeOff: TimeOffRule[];
  existingBookings: BookingInterval[];
  fromDate: string; // "YYYY-MM-DD"
  toDate: string;   // "YYYY-MM-DD"
  selectedProviderId?: string | null;
  now?: Date;
}

export function computeSlots(input: ComputeSlotsInput): DaySlotsResult[] {
  const now = input.now || new Date();
  const shop = input.shop;
  const service = input.service;

  const durationMs = service.durationMin * 60 * 1000;
  const bufferMs = service.bufferMin * 60 * 1000;
  const intervalMs = shop.slotIntervalMin * 60 * 1000;

  const leadLimit = new Date(now.getTime() + shop.leadTimeMin * 60 * 1000);
  const horizonLimit = new Date(now.getTime() + shop.horizonDays * 24 * 60 * 60 * 1000);

  // Eligible providers
  const candidateProviders = input.providers.filter((p) => {
    if (!p.active || !p.offersService) return false;
    if (input.selectedProviderId && p.id !== input.selectedProviderId) return false;
    return true;
  });

  if (candidateProviders.length === 0) {
    return [];
  }

  // Generate date list between fromDate and toDate
  const days: string[] = [];
  const startDay = new Date(`${input.fromDate}T00:00:00Z`);
  const endDay = new Date(`${input.toDate}T00:00:00Z`);

  for (let d = new Date(startDay); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const activeStatuses = new Set(['pending', 'confirmed', 'arrived', 'in_service']);

  // Pre-filter bookings
  const relevantBookings = input.existingBookings.filter((b) => activeStatuses.has(b.status));

  // If specific provider selected: compute for that provider
  if (input.selectedProviderId) {
    const provider = candidateProviders[0];
    const results: DaySlotsResult[] = [];

    for (const dayStr of days) {
      const isoWeekday = getIsoWeekday(dayStr);
      const shifts = input.workingHours.filter(
        (wh) => wh.providerId === provider.id && wh.weekday === isoWeekday
      );

      const dayStarts: Date[] = [];

      for (const shift of shifts) {
        const windowStart = localToUtc(dayStr, shift.startTime, shop.timezone);
        const windowEnd = localToUtc(dayStr, shift.endTime, shop.timezone);

        for (
          let slotTime = windowStart.getTime();
          slotTime + durationMs <= windowEnd.getTime();
          slotTime += intervalMs
        ) {
          const slotStart = new Date(slotTime);
          const slotEnd = new Date(slotTime + durationMs);
          const slotBlockedUntil = new Date(slotTime + durationMs + bufferMs);

          // Check lead time and horizon
          if (slotStart < leadLimit || slotStart > horizonLimit) {
            continue;
          }

          // Check time-off (shop-wide or provider-specific)
          const overlapsTimeOff = input.timeOff.some((to) => {
            if (to.providerId && to.providerId !== provider.id) return false;
            // Overlaps if slotStart < to.endsAt and to.startsAt < slotBlockedUntil
            return slotStart < to.endsAt && to.startsAt < slotBlockedUntil;
          });

          if (overlapsTimeOff) {
            continue;
          }

          // Check existing bookings: slot and its buffer must not overlap existing booking during range
          const overlapsBooking = relevantBookings.some((b) => {
            if (b.providerId !== provider.id) return false;
            return slotStart < b.blockedUntil && b.startsAt < slotBlockedUntil;
          });

          if (overlapsBooking) {
            continue;
          }

          dayStarts.push(slotStart);
        }
      }

      if (dayStarts.length > 0) {
        dayStarts.sort((a, b) => a.getTime() - b.getTime());
        results.push({
          day: dayStr,
          providerId: provider.id,
          starts: dayStarts,
        });
      }
    }

    return results;
  }

  // "Any Available Provider" mode:
  // For each day and each candidate time slot, resolve the fairest provider
  const anyResults: DaySlotsResult[] = [];

  for (const dayStr of days) {
    const isoWeekday = getIsoWeekday(dayStr);
    const daySlotMap = new Map<number, ProviderConfig[]>();

    // Count provider active bookings on this specific day for fairness ranking
    const bookingsCountMap = new Map<string, number>();
    for (const p of candidateProviders) {
      const count = relevantBookings.filter(
        (b) => b.providerId === p.id && formatDateInTz(b.startsAt, shop.timezone) === dayStr
      ).length;
      bookingsCountMap.set(p.id, count);
    }

    // Evaluate each candidate provider for this day
    for (const provider of candidateProviders) {
      const shifts = input.workingHours.filter(
        (wh) => wh.providerId === provider.id && wh.weekday === isoWeekday
      );

      for (const shift of shifts) {
        const windowStart = localToUtc(dayStr, shift.startTime, shop.timezone);
        const windowEnd = localToUtc(dayStr, shift.endTime, shop.timezone);

        for (
          let slotTime = windowStart.getTime();
          slotTime + durationMs <= windowEnd.getTime();
          slotTime += intervalMs
        ) {
          const slotStart = new Date(slotTime);
          const slotBlockedUntil = new Date(slotTime + durationMs + bufferMs);

          if (slotStart < leadLimit || slotStart > horizonLimit) {
            continue;
          }

          const overlapsTimeOff = input.timeOff.some((to) => {
            if (to.providerId && to.providerId !== provider.id) return false;
            return slotStart < to.endsAt && to.startsAt < slotBlockedUntil;
          });
          if (overlapsTimeOff) continue;

          const overlapsBooking = relevantBookings.some((b) => {
            if (b.providerId !== provider.id) return false;
            return slotStart < b.blockedUntil && b.startsAt < slotBlockedUntil;
          });
          if (overlapsBooking) continue;

          if (!daySlotMap.has(slotTime)) {
            daySlotMap.set(slotTime, []);
          }
          daySlotMap.get(slotTime)!.push(provider);
        }
      }
    }

    if (daySlotMap.size > 0) {
      const sortedTimes = Array.from(daySlotMap.keys()).sort((a, b) => a - b);
      const chosenStarts: Date[] = [];

      for (const timeMs of sortedTimes) {
        const availableProviders = daySlotMap.get(timeMs)!;

        // Apply Fairness Algorithm:
        // 1. Fewest active bookings on that day
        // 2. Lowest sort order
        availableProviders.sort((p1, p2) => {
          const c1 = bookingsCountMap.get(p1.id) || 0;
          const c2 = bookingsCountMap.get(p2.id) || 0;
          if (c1 !== c2) return c1 - c2;
          return p1.sort - p2.sort;
        });

        chosenStarts.push(new Date(timeMs));
      }

      anyResults.push({
        day: dayStr,
        providerId: 'any',
        starts: chosenStarts,
      });
    }
  }

  return anyResults;
}
