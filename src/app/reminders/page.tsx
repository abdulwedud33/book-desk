'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { useToast } from '../../components/toast.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton, RowSkeleton } from '../../components/skeleton.tsx';
import { db, type LocalBooking, type LocalReminder } from '../../lib/db.ts';
import { queueStatusChange, queueCancelBooking, queueCompleteReminder } from '../../lib/outbox.ts';
import { subscribeToBookings, subscribeToReminders, playAlertChime } from '../../lib/realtime.ts';
import { useI18n } from '../../i18n/index.ts';
import {
  formatPreparedMessage,
  isReminderOverdue,
  getOverdueDuration,
  formatAppointmentTimeString,
  type ReminderKind,
} from '../../domain/reminders.ts';

export default function RemindersPage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | ReminderKind>('all');
  const [reminders, setReminders] = useState<LocalReminder[]>([]);
  const [pendingBookings, setPendingBookings] = useState<LocalBooking[]>([]);
  const { showToast } = useToast();
  const { t, locale } = useI18n();

  const currentLang = locale;
  const catalog = t.reminders;
  const common = t.common;

  useEffect(() => {
    async function loadData() {
      try {
        // Load pending bookings
        const allBookings = await db.bookings.toArray();
        const pending = allBookings
          .filter((b) => b.status === 'pending')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        setPendingBookings(pending);

        // Load reminders
        let rems = await db.reminders.where('state').equals('due').toArray();

        // Seed demo reminders if database has no reminders yet
        if (rems.length === 0 && allBookings.length > 0) {
          const now = new Date();
          const demoRems: LocalReminder[] = [
            {
              id: 'rem-1',
              bookingId: allBookings[0]?.id || 'b1',
              shopId: 'shop-1',
              kind: 'confirmation',
              dueAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(), // 45m overdue
              state: 'due',
              customerName: allBookings[0]?.customerName || 'Abebe Bikila',
              customerPhone: allBookings[0]?.customerPhone || '+251911223344',
              serviceName: 'Haircut & Styling',
              providerName: 'Samson',
              startsAt: allBookings[0]?.startsAt || new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
              syncStatus: 'synced',
            },
            {
              id: 'rem-2',
              bookingId: allBookings[1]?.id || 'b2',
              shopId: 'shop-1',
              kind: 'reminder_24h',
              dueAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10m overdue
              state: 'due',
              customerName: allBookings[1]?.customerName || 'Sara Tesfaye',
              customerPhone: allBookings[1]?.customerPhone || '+251922334455',
              serviceName: 'Beard Trim',
              providerName: 'Hana',
              startsAt: new Date(now.getTime() + 20 * 3600 * 1000).toISOString(),
              syncStatus: 'synced',
            },
          ];
          await db.reminders.bulkPut(demoRems);
          rems = demoRems;
        }

        setReminders(rems);
      } finally {
        setLoading(false);
      }
    }

    void loadData();

    const unsubBookings = subscribeToBookings('shop-1', async () => {
      const all = await db.bookings.toArray();
      const pending = all
        .filter((b) => b.status === 'pending')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      setPendingBookings(pending);
    });

    const unsubReminders = subscribeToReminders('shop-1', async () => {
      const rems = await db.reminders.where('state').equals('due').toArray();
      setReminders(rems);
    });

    return () => {
      unsubBookings();
      unsubReminders();
    };
  }, []);

  // Filter reminders
  const filteredReminders = reminders.filter((r) => {
    if (activeFilter === 'all') return true;
    return r.kind === activeFilter;
  });

  // Actions on Pending Bookings
  const handleAcceptPending = async (b: LocalBooking) => {
    try {
      await queueStatusChange({
        shopId: b.shopId,
        bookingId: b.id,
        toStatus: 'confirmed',
        expectedFrom: 'pending',
      });
      setPendingBookings((prev) => prev.filter((item) => item.id !== b.id));
      showToast({ message: 'Booking confirmed!' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleDeclinePending = async (b: LocalBooking) => {
    try {
      await queueCancelBooking({
        shopId: b.shopId,
        bookingId: b.id,
        reason: 'Declined by staff',
      });
      setPendingBookings((prev) => prev.filter((item) => item.id !== b.id));
      showToast({ message: 'Booking declined' });
    } catch {
      showToast({ message: common.error });
    }
  };

  // Actions on Reminders
  const handleCopyMessage = async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast({ message: catalog.copiedToast });
      }
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleShareMessage = async (title: string, text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title,
          text,
        });
      } else {
        await handleCopyMessage(text);
      }
    } catch {
      // User cancelled share sheet
    }
  };

  const handleMarkDone = async (r: LocalReminder) => {
    try {
      await queueCompleteReminder({
        shopId: r.shopId,
        reminderId: r.id,
      });
      setReminders((prev) => prev.filter((item) => item.id !== r.id));
      showToast({ message: 'Reminder marked done' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const totalBadge = pendingBookings.length + reminders.filter((r) => isReminderOverdue(r)).length;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.title}</h1>
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

      <main className="p-4 space-y-6 flex-1">
        {/* Pending Requests Queue (Approval Mode) */}
        {pendingBookings.length > 0 && (
          <section className="bg-amber-500/10 border-2 border-amber-500/40 rounded-card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <h2 className="font-heading text-sm font-bold text-amber-900">
                  {catalog.pendingTitle} ({pendingBookings.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => playAlertChime()}
                className="text-xs text-amber-800 hover:underline flex items-center gap-1.5"
                title="Test sound chime"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                Test Chime
              </button>
            </div>
            <p className="text-xs text-amber-900/80">{catalog.pendingSubtitle}</p>

            <div className="space-y-3 pt-1">
              {pendingBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-surface border border-line rounded-card p-3 shadow-sm space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-sm text-ink">{b.customerName}</span>
                      <p className="text-xs text-slate font-mono">{b.customerPhone}</p>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900">
                      Pending
                    </span>
                  </div>

                  <div className="text-xs text-slate">
                    <p className="font-medium text-ink">
                      {formatAppointmentTimeString(new Date(b.startsAt), 'Africa/Addis_Ababa', 'both')}
                    </p>
                    {b.note && <p className="italic text-slate mt-1">"{b.note}"</p>}
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-line">
                    <button
                      type="button"
                      onClick={() => handleAcceptPending(b)}
                      className="flex-1 py-1.5 bg-st-confirmed text-white text-xs font-semibold rounded-control hover:opacity-90 active:scale-95 transition-all"
                    >
                      {catalog.accept}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclinePending(b)}
                      className="flex-1 py-1.5 bg-line text-slate hover:text-ink text-xs font-semibold rounded-control active:scale-95 transition-all"
                    >
                      {catalog.decline}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Filter bar */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-slate uppercase tracking-wider">
              {catalog.title}
            </h2>
            <span className="text-xs text-slate">
              {reminders.length} task{reminders.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar" role="tablist">
            {[
              { id: 'all', label: catalog.filterAll },
              { id: 'confirmation', label: catalog.filterConfirmation },
              { id: 'reminder_24h', label: catalog.filter24h },
              { id: 'reminder_2h', label: catalog.filter2h },
              { id: 'reschedule', label: catalog.filterReschedule },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.id}
                onClick={() => setActiveFilter(tab.id as 'all' | ReminderKind)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  activeFilter === tab.id
                    ? 'bg-plum text-on-plum font-semibold shadow-xs'
                    : 'bg-surface border border-line text-slate hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Reminders List */}
          {loading ? (
            <RowSkeleton count={3} />
          ) : filteredReminders.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-line rounded-card bg-surface/50 space-y-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-paper border border-line flex items-center justify-center text-slate">
                <svg className="w-5 h-5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate">{catalog.empty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReminders.map((r) => {
                const overdue = isReminderOverdue(r);
                const overdueStr = overdue ? getOverdueDuration(r) : '';
                const startsDate = r.startsAt ? new Date(r.startsAt) : new Date();

                const preparedMessage = formatPreparedMessage({
                  kind: r.kind,
                  customerName: r.customerName || 'Customer',
                  serviceName: r.serviceName || 'Service',
                  shopName: 'Addis Barber Shop',
                  startsAt: startsDate,
                  timeZone: 'Africa/Addis_Ababa',
                  language: currentLang,
                  timeDisplay: 'both',
                });

                return (
                  <article
                    key={r.id}
                    className={`bg-surface border rounded-card p-4 shadow-sm space-y-3 transition-all ${
                      overdue ? 'border-st-noshow/60 shadow-xs' : 'border-line'
                    }`}
                  >
                    {/* Header with customer info and overdue badge */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-heading font-semibold text-sm text-ink">
                          {r.customerName || 'Customer'}
                        </h3>
                        <p className="text-xs text-slate font-mono">{r.customerPhone}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-line text-slate">
                          {r.kind === 'confirmation'
                            ? catalog.filterConfirmation
                            : r.kind === 'reminder_24h'
                            ? catalog.filter24h
                            : r.kind === 'reminder_2h'
                            ? catalog.filter2h
                            : catalog.filterReschedule}
                        </span>

                        {overdue ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-st-noshow/15 text-st-noshow">
                            {catalog.overdueBadge} {overdueStr}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate">{catalog.dueNow}</span>
                        )}
                      </div>
                    </div>

                    {/* Appointment context */}
                    <div className="text-xs text-slate">
                      <span className="font-medium text-ink">{r.serviceName}</span>
                      {r.providerName && <span> with {r.providerName}</span>}
                      <p className="mt-0.5">
                        {formatAppointmentTimeString(startsDate, 'Africa/Addis_Ababa', 'both')}
                      </p>
                    </div>

                    {/* Message Bubble Preview */}
                    <div className="bg-paper border border-line rounded-lg p-3 text-xs leading-relaxed text-ink select-all">
                      {preparedMessage}
                    </div>

                    {/* Action Buttons: One-tap Share, Copy, Mark Done */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleShareMessage('Appointment Reminder', preparedMessage)}
                        className="flex-1 py-1.5 px-2 bg-plum text-on-plum font-semibold text-xs rounded-control hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        {common.share}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(preparedMessage)}
                        className="py-1.5 px-3 bg-surface border border-line text-ink font-semibold text-xs rounded-control hover:bg-line active:scale-95 transition-all flex items-center gap-1.5"
                        title="Copy message to clipboard"
                      >
                        <svg className="w-3.5 h-3.5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        {common.copy}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMarkDone(r)}
                        className="py-1.5 px-3 bg-st-confirmed/15 text-st-confirmed font-semibold text-xs rounded-control hover:bg-st-confirmed/25 active:scale-95 transition-all"
                      >
                        {catalog.markDone}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <BottomNav currentPath="/reminders" role={role} remindersBadge={totalBadge} />
    </div>
  );
}
