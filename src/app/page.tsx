'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BottomNav, type MemberRole } from '../components/bottom-nav.tsx';
import { useToast } from '../components/toast.tsx';
import { Banner } from '../components/banner.tsx';
import { LanguageSwitch } from '../components/language-switch.tsx';
import { CardSkeleton, RowSkeleton } from '../components/skeleton.tsx';
import { db, type LocalBooking } from '../lib/db.ts';
import { subscribeToBookings } from '../lib/realtime.ts';
import { queueStatusChange } from '../lib/outbox.ts';
import { t } from '../i18n/index.ts';
import { formatTimeWithPartOfDay } from '../domain/time.ts';

export default function TodayPage() {
  const router = useRouter();
  const [role, setRole] = useState<MemberRole>('owner');
  const [loading, setLoading] = useState(true);
  const [todayBookings, setTodayBookings] = useState<LocalBooking[]>([]);
  const { showToast } = useToast();

  const catalog = t().common;
  const navCatalog = t().nav;
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    async function loadData() {
      try {
        let all = await db.bookings.toArray();
        if (all.length === 0) {
          // Seed sample bookings for Today if empty
          const sample1: LocalBooking = {
            id: 'sample-1',
            shopId: 'shop-1',
            providerId: 'p1',
            serviceId: 's1',
            startsAt: `${todayStr}T09:30:00+03:00`,
            endsAt: `${todayStr}T10:00:00+03:00`,
            blockedUntil: `${todayStr}T10:05:00+03:00`,
            status: 'confirmed',
            source: 'staff',
            price: 250,
            note: 'Regular customer',
            customerName: 'Abel Tesfaye',
            customerPhone: '+251911223344',
            syncStatus: 'synced',
            version: 1,
            updatedAt: new Date().toISOString(),
          };
          const sample2: LocalBooking = {
            id: 'sample-2',
            shopId: 'shop-1',
            providerId: 'p2',
            serviceId: 's2',
            startsAt: `${todayStr}T11:00:00+03:00`,
            endsAt: `${todayStr}T11:20:00+03:00`,
            blockedUntil: `${todayStr}T11:25:00+03:00`,
            status: 'confirmed',
            source: 'public',
            price: 150,
            note: null,
            customerName: 'Dawit Mengistu',
            customerPhone: '+251922334455',
            syncStatus: 'synced',
            version: 1,
            updatedAt: new Date().toISOString(),
          };
          await db.bookings.bulkPut([sample1, sample2]);
          all = [sample1, sample2];
        }

        const filtered = all
          .filter((b) => b.startsAt.startsWith(todayStr) && b.status !== 'cancelled')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

        setTodayBookings(filtered);
      } finally {
        setLoading(false);
      }
    }
    void loadData();

    const unsubscribe = subscribeToBookings('shop-1', async () => {
      const all = await db.bookings.toArray();
      const filtered = all
        .filter((b) => b.startsAt.startsWith(todayStr) && b.status !== 'cancelled')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      setTodayBookings(filtered);
    });

    return () => unsubscribe();
  }, [todayStr]);

  const nextBooking = todayBookings.find(
    (b) => b.status === 'confirmed' || b.status === 'arrived' || b.status === 'in_service'
  );

  const handleAdvanceStatus = async (b: LocalBooking) => {
    let nextSt: LocalBooking['status'] = 'arrived';
    if (b.status === 'arrived') nextSt = 'in_service';
    else if (b.status === 'in_service') nextSt = 'completed';

    try {
      await queueStatusChange({
        shopId: b.shopId,
        bookingId: b.id,
        toStatus: nextSt,
        expectedFrom: b.status,
      });
      setTodayBookings((prev) =>
        prev.map((item) => (item.id === b.id ? { ...item, status: nextSt, syncStatus: 'pending' } : item))
      );
      showToast({ message: `Updated to ${nextSt}` });
    } catch {
      showToast({ message: catalog.error });
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Book Desk</h1>
          <p className="text-xs text-slate">Addis Barber Shop</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="text-xs border border-line rounded px-2 py-1 bg-surface text-slate"
            aria-label="Role Switcher"
          >
            <option value="owner">Role: Owner</option>
            <option value="reception">Role: Reception</option>
            <option value="provider">Role: Provider</option>
          </select>
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-4 flex-1">
        {/* Next Up card */}
        {loading ? (
          <CardSkeleton />
        ) : nextBooking ? (
          <section className="bg-surface border border-line rounded-card p-4 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate uppercase tracking-wider">
                Next Appointment
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  nextBooking.status === 'confirmed'
                    ? 'bg-st-confirmed/15 text-st-confirmed'
                    : 'bg-st-active/15 text-st-active'
                }`}
              >
                {nextBooking.status}
              </span>
            </div>
            <Link href={`/booking?id=${nextBooking.id}`} className="block group">
              <h2 className="font-heading text-lg font-semibold group-hover:text-plum transition-colors">
                {nextBooking.customerName}
              </h2>
              <p className="text-xs text-slate">
                {formatTimeWithPartOfDay(new Date(nextBooking.startsAt), 'Africa/Addis_Ababa')}
              </p>
            </Link>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-line text-xs">
              <span className="font-semibold text-ink">
                {nextBooking.price ? `${nextBooking.price} ETB` : ''}
              </span>
              {nextBooking.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => handleAdvanceStatus(nextBooking)}
                  className="px-3 py-1.5 bg-plum text-on-plum rounded-control font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  {nextBooking.status === 'confirmed'
                    ? 'Mark Arrived'
                    : nextBooking.status === 'arrived'
                    ? 'Start Service'
                    : 'Complete'}
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="p-6 text-center border border-dashed border-line rounded-card bg-surface/50 space-y-2">
            <p className="text-sm text-slate">No appointments scheduled for today.</p>
            <Link
              href="/new"
              className="inline-block px-4 py-2 bg-plum text-on-plum text-xs font-semibold rounded-control"
            >
              + {navCatalog.newBooking}
            </Link>
          </div>
        )}

        {/* Today's Schedule */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-heading text-base font-semibold">Today's Schedule</h3>
            <Link href="/calendar" className="text-xs text-plum font-semibold hover:underline">
              View Calendar →
            </Link>
          </div>

          {loading ? (
            <RowSkeleton count={3} />
          ) : (
            <div className="space-y-2">
              {todayBookings.map((b) => (
                <Link
                  key={b.id}
                  href={`/booking?id=${b.id}`}
                  className="block bg-surface border border-line rounded-card p-3 hover:border-slate/40 transition-all"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-sm">{b.customerName}</span>
                      <p className="text-xs text-slate font-mono">
                        {formatTimeWithPartOfDay(new Date(b.startsAt), 'Africa/Addis_Ababa')}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        b.status === 'confirmed'
                          ? 'bg-st-confirmed/15 text-st-confirmed'
                          : b.status === 'arrived'
                          ? 'bg-st-active/15 text-st-active'
                          : b.status === 'completed'
                          ? 'bg-st-done/15 text-st-done'
                          : 'bg-line text-slate'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                </Link>
              ))}

              {/* Free slot quick add */}
              <Link
                href="/new"
                className="block p-3 border border-dashed border-line rounded-card text-center text-xs text-slate hover:text-ink hover:border-slate/40 transition-all"
              >
                + Tap a free time to book
              </Link>
            </div>
          )}
        </section>
      </main>

      <BottomNav role={role} />
    </div>
  );
}
