'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CalendarGridSkeleton } from '../../components/skeleton.tsx';
import { Banner } from '../../components/banner.tsx';
import { db, type LocalBooking, type LocalProvider } from '../../lib/db.ts';
import { subscribeToBookings } from '../../lib/realtime.ts';
import { t } from '../../i18n/index.ts';
import { formatTimeWithPartOfDay } from '../../domain/time.ts';

const PROVIDER_COLORS = [
  'bg-emerald-600 text-white',
  'bg-blue-600 text-white',
  'bg-purple-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-cyan-600 text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600 text-white',
];

export default function CalendarPage() {
  const router = useRouter();
  const [role, setRole] = useState<MemberRole>('owner');
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string>('all');
  const [providers, setProviders] = useState<LocalProvider[]>([]);
  const [bookings, setBookings] = useState<LocalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [conflictBooking, setConflictBooking] = useState<LocalBooking | null>(null);

  const catalog = t().calendar;
  const navCatalog = t().nav;

  // Load providers and seed sample if empty
  useEffect(() => {
    async function loadData() {
      try {
        let provs = await db.providers.toArray();
        if (provs.length === 0) {
          provs = [
            { id: 'p1', shopId: 'shop-1', name: 'Samson K.', color: 0, active: true, sort: 1 },
            { id: 'p2', shopId: 'shop-1', name: 'Almaz T.', color: 1, active: true, sort: 2 },
            { id: 'p3', shopId: 'shop-1', name: 'Dawit M.', color: 2, active: true, sort: 3 },
          ];
          await db.providers.bulkPut(provs);
        }
        setProviders(provs);

        // Load existing bookings for shop
        const allBookings = await db.bookings.toArray();
        setBookings(allBookings);

        const conflict = allBookings.find((b) => b.syncStatus === 'conflict');
        setConflictBooking(conflict || null);
      } finally {
        setLoading(false);
      }
    }
    void loadData();

    // Subscribe to realtime updates with polling fallback
    const unsubscribe = subscribeToBookings('shop-1', async () => {
      const updated = await db.bookings.toArray();
      setBookings(updated);
      const conflict = updated.find((b) => b.syncStatus === 'conflict');
      setConflictBooking(conflict || null);
    });

    return () => unsubscribe();
  }, []);

  // Filter bookings for current view
  const filteredBookings = bookings.filter((b) => {
    const isSameDate = b.startsAt.startsWith(selectedDate);
    const matchesProvider =
      role === 'provider'
        ? b.providerId === 'p1' // Provider sees own only
        : selectedProviderId === 'all' || b.providerId === selectedProviderId;

    return isSameDate && matchesProvider && b.status !== 'cancelled';
  });

  // Hours for day grid (08:00 to 19:00)
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-heading text-xl font-semibold text-ink">
              {role === 'provider' ? navCatalog.myCalendar : catalog.title}
            </h1>
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
        </div>

        {/* Date navigation and view mode controls */}
        <div className="flex justify-between items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevDay}
              className="p-1.5 border border-line rounded-control bg-surface hover:bg-line/40 active:scale-95 transition-all text-xs"
              aria-label="Previous Day"
            >
              ←
            </button>
            <button
              type="button"
              onClick={setToday}
              className="px-2.5 py-1 border border-line rounded-control bg-surface text-xs font-semibold hover:bg-line/40 active:scale-95 transition-all"
            >
              {selectedDate}
            </button>
            <button
              type="button"
              onClick={nextDay}
              className="p-1.5 border border-line rounded-control bg-surface hover:bg-line/40 active:scale-95 transition-all text-xs"
              aria-label="Next Day"
            >
              →
            </button>
          </div>

          <div className="flex rounded-control border border-line bg-surface p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                viewMode === 'day' ? 'bg-plum text-on-plum' : 'text-slate hover:text-ink'
              }`}
            >
              {catalog.day}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                viewMode === 'week' ? 'bg-plum text-on-plum' : 'text-slate hover:text-ink'
              }`}
            >
              {catalog.week}
            </button>
          </div>
        </div>

        {/* Provider chips (hidden for provider role) */}
        {role !== 'provider' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setSelectedProviderId('all')}
              className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition-all ${
                selectedProviderId === 'all'
                  ? 'bg-ink text-paper'
                  : 'bg-surface border border-line text-slate hover:text-ink'
              }`}
            >
              {catalog.allProviders}
            </button>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProviderId(p.id)}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium flex items-center gap-1.5 transition-all ${
                  selectedProviderId === p.id
                    ? 'bg-ink text-paper'
                    : 'bg-surface border border-line text-slate hover:text-ink'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    PROVIDER_COLORS[p.color % PROVIDER_COLORS.length].split(' ')[0]
                  }`}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="p-4 space-y-4 flex-1">
        {/* Conflict alert banner */}
        {conflictBooking && (
          <Banner
            type="conflict"
            message={`${catalog.needsAttention}: Appointment for ${conflictBooking.customerName} could not be confirmed (slot conflict).`}
            actionLabel="View"
            onAction={() => router.push(`/booking?id=${conflictBooking.id}`)}
          />
        )}

        {loading ? (
          <CalendarGridSkeleton hours={8} />
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-line rounded-card bg-surface/50 space-y-3">
            <p className="text-sm text-slate">{catalog.noBookings}</p>
            <p className="text-xs text-slate">{catalog.tapToBook}</p>
            <Link
              href={`/new?date=${selectedDate}`}
              className="inline-block px-4 py-2 bg-plum text-on-plum text-xs font-semibold rounded-control hover:opacity-90 active:scale-95 transition-all"
            >
              + {navCatalog.newBooking}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Hour grid view */}
            <div className="border border-line rounded-card divide-y divide-line bg-surface overflow-hidden">
              {hours.map((hour) => {
                const hourPrefix = `${String(hour).padStart(2, '0')}:`;
                const hourBookings = filteredBookings.filter((b) => {
                  const timePart = b.startsAt.substring(11, 16);
                  return timePart.startsWith(hourPrefix);
                });

                return (
                  <div key={hour} className="min-h-16 flex items-start p-2 gap-3 hover:bg-paper/40 transition-colors">
                    <span className="w-12 text-xs font-mono text-slate pt-1">
                      {String(hour).padStart(2, '0')}:00
                    </span>

                    <div className="flex-1 space-y-1.5">
                      {hourBookings.length === 0 ? (
                        <Link
                          href={`/new?date=${selectedDate}&time=${String(hour).padStart(2, '0')}:00`}
                          className="block h-8 border border-dashed border-transparent hover:border-line rounded-control text-xs text-slate/50 hover:text-slate px-2 py-1 transition-all"
                        >
                          +
                        </Link>
                      ) : (
                        hourBookings.map((b) => {
                          const prov = providers.find((p) => p.id === b.providerId);
                          const colorClass = prov
                            ? PROVIDER_COLORS[prov.color % PROVIDER_COLORS.length]
                            : 'bg-plum text-on-plum';

                          return (
                            <Link
                              key={b.id}
                              href={`/booking?id=${b.id}`}
                              className={`block p-2.5 rounded-control shadow-sm transition-all hover:opacity-95 active:scale-[0.99] ${colorClass}`}
                            >
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold">{b.customerName}</span>
                                <span className="opacity-90 font-mono">
                                  {formatTimeWithPartOfDay(new Date(b.startsAt), 'Africa/Addis_Ababa')}
                                </span>
                              </div>

                              <div className="flex justify-between items-center text-[11px] opacity-85 mt-1">
                                <span>{prov?.name || 'Staff'}</span>
                                {b.syncStatus === 'pending' && (
                                  <span className="bg-amber-400 text-ink px-1.5 py-0.2 rounded font-semibold text-[10px]">
                                    {catalog.notConfirmedYet}
                                  </span>
                                )}
                                {b.syncStatus === 'conflict' && (
                                  <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded font-semibold text-[10px]">
                                    {catalog.needsAttention}
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <BottomNav role={role} />
    </div>
  );
}
