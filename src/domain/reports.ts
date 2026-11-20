/**
 * Reporting and Analytics domain utilities for Book Desk.
 * - Pure calculations for dashboard summary, utilization, popular services,
 *   peak hours, and cancellation metrics.
 * - Reconciles 100% with raw booking records.
 */

import type { LocalBooking } from '../lib/db.ts';

export interface ReportSummary {
  totalBookings: number;
  completedBookings: number;
  confirmedBookings: number;
  noShowBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  noShowRate: number;
  cancellationRate: number;
}

export interface PopularServiceMetric {
  serviceId: string;
  serviceName: string;
  bookingCount: number;
  revenue: number;
}

export interface UtilizationMetric {
  providerId: string;
  providerName: string;
  scheduledMinutes: number;
  totalBookings: number;
}

export interface PeakHourMetric {
  hourOfDay: number;
  bookingCount: number;
}

export interface CancellationMetric {
  totalCancelled: number;
  byCustomer: number;
  byStaff: number;
  bySystem: number;
  cancellationRate: number;
}

/**
 * Computes dashboard summary metrics from a collection of raw bookings in a time range.
 * Fully reconciles with raw records.
 */
export function computeDashboardSummary(
  bookings: LocalBooking[],
  fromDate: Date,
  toDate: Date,
  providerId?: string | null
): ReportSummary {
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();

  const filtered = bookings.filter((b) => {
    const startMs = new Date(b.startsAt).getTime();
    if (startMs < fromMs || startMs > toMs) return false;
    if (providerId && b.providerId !== providerId) return false;
    return true;
  });

  let completed = 0;
  let confirmed = 0;
  let noShow = 0;
  let cancelled = 0;
  let revenue = 0;

  for (const b of filtered) {
    if (b.status === 'completed') {
      completed++;
      revenue += b.price || 0;
    } else if (b.status === 'no_show') {
      noShow++;
    } else if (b.status === 'cancelled') {
      cancelled++;
    } else {
      // confirmed, arrived, in_service, pending
      confirmed++;
    }
  }

  const total = filtered.length;
  const noShowRate =
    completed + noShow > 0 ? Number(((noShow / (completed + noShow)) * 100).toFixed(1)) : 0;
  const cancellationRate = total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0;

  return {
    totalBookings: total,
    completedBookings: completed,
    confirmedBookings: confirmed,
    noShowBookings: noShow,
    cancelledBookings: cancelled,
    totalRevenue: Number(revenue.toFixed(2)),
    noShowRate,
    cancellationRate,
  };
}

/**
 * Computes breakdown of popular services by count and revenue.
 */
export function computePopularServices(
  bookings: LocalBooking[],
  serviceNames: Record<string, string>
): PopularServiceMetric[] {
  const map = new Map<string, { count: number; revenue: number }>();

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const existing = map.get(b.serviceId) || { count: 0, revenue: 0 };
    existing.count++;
    if (b.status === 'completed') {
      existing.revenue += b.price || 0;
    }
    map.set(b.serviceId, existing);
  }

  const result: PopularServiceMetric[] = [];
  for (const [id, data] of map.entries()) {
    result.push({
      serviceId: id,
      serviceName: serviceNames[id] || 'Unknown Service',
      bookingCount: data.count,
      revenue: Number(data.revenue.toFixed(2)),
    });
  }

  return result.sort((a, b) => b.bookingCount - a.bookingCount || b.revenue - a.revenue);
}

/**
 * Computes utilization minutes per provider.
 */
export function computeUtilization(
  bookings: LocalBooking[],
  providerNames: Record<string, string>
): UtilizationMetric[] {
  const map = new Map<string, { minutes: number; count: number }>();

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const startMs = new Date(b.startsAt).getTime();
    const endMs = new Date(b.endsAt).getTime();
    const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));

    const existing = map.get(b.providerId) || { minutes: 0, count: 0 };
    existing.minutes += minutes;
    existing.count++;
    map.set(b.providerId, existing);
  }

  const result: UtilizationMetric[] = [];
  for (const [id, data] of map.entries()) {
    result.push({
      providerId: id,
      providerName: providerNames[id] || 'Unknown Provider',
      scheduledMinutes: data.minutes,
      totalBookings: data.count,
    });
  }

  return result.sort((a, b) => b.scheduledMinutes - a.scheduledMinutes);
}

/**
 * Computes booking distribution across hours of the day (0-23) in the shop timezone.
 */
export function computePeakHours(bookings: LocalBooking[], timeZone: string): PeakHourMetric[] {
  const hourMap = new Map<number, number>();

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const date = new Date(b.startsAt);
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date),
      10
    );
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  }

  const result: PeakHourMetric[] = [];
  for (let h = 0; h < 24; h++) {
    if (hourMap.has(h)) {
      result.push({
        hourOfDay: h,
        bookingCount: hourMap.get(h) || 0,
      });
    }
  }

  return result.sort((a, b) => a.hourOfDay - b.hourOfDay);
}
