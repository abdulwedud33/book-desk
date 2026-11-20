import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardSummary,
  computePopularServices,
  computeUtilization,
  computePeakHours,
} from './reports.ts';
import type { LocalBooking } from '../lib/db.ts';

test('computeDashboardSummary reconciles 100% with raw booking records', () => {
  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-11-30T23:59:59Z');

  const rawBookings: LocalBooking[] = [
    {
      id: 'b1',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-11-10T09:00:00Z',
      endsAt: '2026-11-10T09:30:00Z',
      blockedUntil: '2026-11-10T09:35:00Z',
      status: 'completed',
      source: 'public',
      price: 250,
      note: null,
      customerName: 'Abebe',
      customerPhone: '+251911111111',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'b2',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-11-11T10:00:00Z',
      endsAt: '2026-11-11T10:30:00Z',
      blockedUntil: '2026-11-11T10:35:00Z',
      status: 'completed',
      source: 'staff',
      price: 250,
      note: null,
      customerName: 'Dawit',
      customerPhone: '+251922222222',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-11T11:00:00Z',
    },
    {
      id: 'b3',
      shopId: 's1',
      providerId: 'p2',
      serviceId: 'srv2',
      startsAt: '2026-11-12T11:00:00Z',
      endsAt: '2026-11-12T11:45:00Z',
      blockedUntil: '2026-11-12T11:50:00Z',
      status: 'no_show',
      source: 'public',
      price: 350,
      note: null,
      customerName: 'Chala',
      customerPhone: '+251933333333',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-12T12:00:00Z',
    },
    {
      id: 'b4',
      shopId: 's1',
      providerId: 'p2',
      serviceId: 'srv2',
      startsAt: '2026-11-13T14:00:00Z',
      endsAt: '2026-11-13T14:45:00Z',
      blockedUntil: '2026-11-13T14:50:00Z',
      status: 'cancelled',
      source: 'public',
      price: 350,
      note: null,
      customerName: 'Fatuma',
      customerPhone: '+251944444444',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-13T13:00:00Z',
    },
    {
      id: 'b5',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-11-14T15:00:00Z',
      endsAt: '2026-11-14T15:30:00Z',
      blockedUntil: '2026-11-14T15:35:00Z',
      status: 'confirmed',
      source: 'public',
      price: 250,
      note: null,
      customerName: 'Sara',
      customerPhone: '+251955555555',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-14T09:00:00Z',
    },
    {
      // Out of range booking (should not be counted)
      id: 'b6',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-12-01T10:00:00Z',
      endsAt: '2026-12-01T10:30:00Z',
      blockedUntil: '2026-12-01T10:35:00Z',
      status: 'confirmed',
      source: 'public',
      price: 250,
      note: null,
      customerName: 'Future',
      customerPhone: '+251966666666',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-14T09:00:00Z',
    },
  ];

  const summary = computeDashboardSummary(rawBookings, from, to);

  // Reconcile total bookings
  assert.equal(summary.totalBookings, 5);
  assert.equal(summary.completedBookings, 2);
  assert.equal(summary.confirmedBookings, 1);
  assert.equal(summary.noShowBookings, 1);
  assert.equal(summary.cancelledBookings, 1);

  // Sum of components must equal total
  assert.equal(
    summary.completedBookings +
      summary.confirmedBookings +
      summary.noShowBookings +
      summary.cancelledBookings,
    summary.totalBookings
  );

  // Revenue must equal completed prices: 250 + 250 = 500
  assert.equal(summary.totalRevenue, 500);

  // No-show rate: 1 / (2 + 1) = 33.3%
  assert.equal(summary.noShowRate, 33.3);

  // Cancellation rate: 1 / 5 = 20.0%
  assert.equal(summary.cancellationRate, 20.0);
});

test('computePopularServices ranks correctly by count and completed revenue', () => {
  const rawBookings: LocalBooking[] = [
    {
      id: 'b1',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-11-10T09:00:00Z',
      endsAt: '2026-11-10T09:30:00Z',
      blockedUntil: '2026-11-10T09:35:00Z',
      status: 'completed',
      source: 'public',
      price: 200,
      note: null,
      customerName: 'Abebe',
      customerPhone: '+251911111111',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'b2',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      startsAt: '2026-11-11T10:00:00Z',
      endsAt: '2026-11-11T10:30:00Z',
      blockedUntil: '2026-11-11T10:35:00Z',
      status: 'completed',
      source: 'staff',
      price: 200,
      note: null,
      customerName: 'Dawit',
      customerPhone: '+251922222222',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-11T11:00:00Z',
    },
    {
      id: 'b3',
      shopId: 's1',
      providerId: 'p2',
      serviceId: 'srv2',
      startsAt: '2026-11-12T11:00:00Z',
      endsAt: '2026-11-12T11:45:00Z',
      blockedUntil: '2026-11-12T11:50:00Z',
      status: 'completed',
      source: 'public',
      price: 500,
      note: null,
      customerName: 'Chala',
      customerPhone: '+251933333333',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-12T12:00:00Z',
    },
  ];

  const serviceNames = {
    srv1: 'Haircut',
    srv2: 'Special Styling',
  };

  const popular = computePopularServices(rawBookings, serviceNames);
  assert.equal(popular.length, 2);
  assert.equal(popular[0].serviceName, 'Haircut');
  assert.equal(popular[0].bookingCount, 2);
  assert.equal(popular[0].revenue, 400);

  assert.equal(popular[1].serviceName, 'Special Styling');
  assert.equal(popular[1].bookingCount, 1);
  assert.equal(popular[1].revenue, 500);
});

test('computePeakHours groups appointments by business hour in timezone', () => {
  const rawBookings: LocalBooking[] = [
    {
      id: 'b1',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      // 06:30 UTC -> 09:30 Africa/Addis_Ababa (+03:00)
      startsAt: '2026-11-10T06:30:00Z',
      endsAt: '2026-11-10T07:00:00Z',
      blockedUntil: '2026-11-10T07:05:00Z',
      status: 'confirmed',
      source: 'public',
      price: 200,
      note: null,
      customerName: 'Abebe',
      customerPhone: '+251911111111',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'b2',
      shopId: 's1',
      providerId: 'p1',
      serviceId: 'srv1',
      // 06:45 UTC -> 09:45 Africa/Addis_Ababa
      startsAt: '2026-11-11T06:45:00Z',
      endsAt: '2026-11-11T07:15:00Z',
      blockedUntil: '2026-11-11T07:20:00Z',
      status: 'completed',
      source: 'staff',
      price: 200,
      note: null,
      customerName: 'Dawit',
      customerPhone: '+251922222222',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-11T11:00:00Z',
    },
    {
      id: 'b3',
      shopId: 's1',
      providerId: 'p2',
      serviceId: 'srv2',
      // 11:00 UTC -> 14:00 Africa/Addis_Ababa
      startsAt: '2026-11-12T11:00:00Z',
      endsAt: '2026-11-12T11:45:00Z',
      blockedUntil: '2026-11-12T11:50:00Z',
      status: 'completed',
      source: 'public',
      price: 500,
      note: null,
      customerName: 'Chala',
      customerPhone: '+251933333333',
      syncStatus: 'synced',
      version: 1,
      updatedAt: '2026-11-12T12:00:00Z',
    },
  ];

  const peak = computePeakHours(rawBookings, 'Africa/Addis_Ababa');
  assert.equal(peak.length, 2);

  const h9 = peak.find((p) => p.hourOfDay === 9);
  assert.ok(h9);
  assert.equal(h9.bookingCount, 2);

  const h14 = peak.find((p) => p.hourOfDay === 14);
  assert.ok(h14);
  assert.equal(h14.bookingCount, 1);
});
