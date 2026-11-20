'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton } from '../../components/skeleton.tsx';
import { useToast } from '../../components/toast.tsx';
import { db, type LocalBooking, type LocalService, type LocalProvider } from '../../lib/db.ts';
import { queueStatusChange, queueRescheduleBooking, queueCancelBooking } from '../../lib/outbox.ts';
import { t } from '../../i18n/index.ts';
import { formatTimeWithPartOfDay, toEthiopianHour } from '../../domain/time.ts';
import { canRoleTransition, type BookingStatus } from '../../domain/status.ts';
import { getFallbackMessage, validateMessageDraftSafety } from '../../domain/ai-guardrails.ts';

function BookingDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');
  const { showToast } = useToast();

  const [role, setRole] = useState<MemberRole>('owner');
  const [booking, setBooking] = useState<LocalBooking | null>(null);
  const [service, setService] = useState<LocalService | null>(null);
  const [provider, setProvider] = useState<LocalProvider | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');

  // Message Writer state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTone, setMessageTone] = useState<'friendly' | 'neutral' | 'formal'>('friendly');
  const [messageKind, setMessageKind] = useState<'confirmation' | 'reminder' | 'reschedule' | 'no_show'>('reminder');
  const [draftedMessage, setDraftedMessage] = useState('');

  const catalog = t().booking;
  const common = t().common;
  const assistantCatalog = t().assistant;

  useEffect(() => {
    async function loadData() {
      if (!bookingId) {
        setLoading(false);
        return;
      }

      const b = await db.bookings.get(bookingId);
      if (b) {
        setBooking(b);
        const s = await db.services.get(b.serviceId);
        if (s) setService(s);
        const p = await db.providers.get(b.providerId);
        if (p) setProvider(p);
        setNewDate(b.startsAt.split('T')[0]);
      }
      setLoading(false);
    }
    void loadData();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto min-h-screen p-4 space-y-4 bg-paper">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-md mx-auto min-h-screen p-6 text-center space-y-4 bg-paper">
        <h1 className="font-heading text-lg font-semibold">Booking not found</h1>
        <p className="text-xs text-slate">The requested booking does not exist or was deleted.</p>
        <Link
          href="/calendar"
          className="inline-block px-4 py-2 bg-plum text-on-plum rounded-control text-xs font-semibold"
        >
          Back to Calendar
        </Link>
      </div>
    );
  }

  const startDate = new Date(booking.startsAt);
  const timeFormatted = formatTimeWithPartOfDay(startDate, 'Africa/Addis_Ababa');
  const ethHour = toEthiopianHour(startDate.getHours());

  const handleStatusUpdate = async (nextStatus: BookingStatus) => {
    if (!canRoleTransition(booking.status, nextStatus, role, true)) {
      showToast({ message: 'Action not allowed by current role or status.' });
      return;
    }

    try {
      await queueStatusChange({
        shopId: booking.shopId,
        bookingId: booking.id,
        toStatus: nextStatus,
        expectedFrom: booking.status,
      });

      setBooking({ ...booking, status: nextStatus, syncStatus: 'pending' });
      showToast({ message: `Status updated to ${nextStatus}` });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const [hStr, mStr] = newTime.split(':');
      const startObj = new Date(newDate);
      startObj.setHours(parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);
      const newStartsAt = startObj.toISOString();

      await queueRescheduleBooking({
        shopId: booking.shopId,
        bookingId: booking.id,
        newStart: newStartsAt,
        expectedVersion: booking.version,
      });

      setBooking({ ...booking, startsAt: newStartsAt, syncStatus: 'pending' });
      setShowReschedule(false);
      showToast({ message: 'Booking rescheduled' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await queueCancelBooking({
        shopId: booking.shopId,
        bookingId: booking.id,
        reason: cancelReason.trim() || undefined,
      });

      setBooking({ ...booking, status: 'cancelled', syncStatus: 'pending' });
      setShowCancel(false);
      showToast({ message: 'Booking cancelled' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const openMessageModal = (kind: 'confirmation' | 'reminder' | 'reschedule' | 'no_show' = 'reminder') => {
    setMessageKind(kind);
    const firstName = (booking?.customerName || 'Customer').split(' ')[0];
    const draft = getFallbackMessage(
      kind,
      {
        firstName,
        businessName: 'Addis Barber Shop',
        serviceName: service?.name || 'Haircut',
        dateTimeWords: timeFormatted,
      },
      'en'
    );
    setDraftedMessage(draft);
    setShowMessageModal(true);
  };

  const handleToneChange = (tone: 'friendly' | 'neutral' | 'formal') => {
    setMessageTone(tone);
    const firstName = (booking?.customerName || 'Customer').split(' ')[0];
    const draft = getFallbackMessage(
      messageKind,
      {
        firstName,
        businessName: 'Addis Barber Shop',
        serviceName: service?.name || 'Haircut',
        dateTimeWords: timeFormatted,
      },
      'en'
    );
    setDraftedMessage(draft);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <Link href="/calendar" className="text-xs text-slate hover:text-ink">
            ← Calendar
          </Link>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.details}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-4 flex-1">
        {/* Outbox Status Badges */}
        {booking.syncStatus === 'pending' && (
          <div className="p-2.5 rounded-card bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 flex justify-between items-center">
            <span>Not confirmed yet (syncing to server...)</span>
            <span className="font-mono text-[10px]">Pending</span>
          </div>
        )}

        {booking.syncStatus === 'conflict' && (
          <div className="p-2.5 rounded-card bg-rose-500/10 border border-rose-500/30 text-xs text-rose-800 space-y-1">
            <span className="font-semibold">Needs attention:</span>
            <p>{booking.conflictReason || 'Slot conflict with another booking.'}</p>
          </div>
        )}

        {/* Appointment Card */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate uppercase tracking-wider">
                Appointment Time
              </span>
              <h2 className="font-heading text-lg font-semibold">{timeFormatted}</h2>
              <p className="text-xs text-slate">({ethHour}:00 Ethiopian time)</p>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                booking.status === 'confirmed'
                  ? 'bg-st-confirmed/15 text-st-confirmed'
                  : booking.status === 'arrived'
                  ? 'bg-st-active/15 text-st-active'
                  : booking.status === 'completed'
                  ? 'bg-st-done/15 text-st-done'
                  : booking.status === 'cancelled'
                  ? 'bg-st-danger/15 text-st-danger'
                  : 'bg-line text-slate'
              }`}
            >
              {booking.status}
            </span>
          </div>

          <div className="pt-2 border-t border-line grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate">Service</span>
              <p className="font-semibold text-ink">{service?.name || 'Haircut'}</p>
            </div>
            <div>
              <span className="text-slate">Provider</span>
              <p className="font-semibold text-ink">{provider?.name || 'Samson'}</p>
            </div>
            {booking.price !== null && (
              <div>
                <span className="text-slate">Price</span>
                <p className="font-semibold text-ink font-mono">{booking.price} ETB</p>
              </div>
            )}
            <div>
              <span className="text-slate">Source</span>
              <p className="font-semibold text-ink capitalize">{booking.source}</p>
            </div>
          </div>
        </section>

        {/* Customer Card */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate uppercase tracking-wider">Customer</span>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-heading text-base font-semibold">{booking.customerName}</h3>
              {booking.customerPhone ? (
                <a
                  href={`tel:${booking.customerPhone}`}
                  className="text-xs font-mono text-plum hover:underline flex items-center gap-1 mt-0.5"
                >
                  📞 {booking.customerPhone}
                </a>
              ) : (
                <p className="text-xs text-slate">No phone number</p>
              )}
            </div>
          </div>
          {booking.note && (
            <p className="text-xs bg-paper p-2 rounded-control border border-line text-slate mt-2">
              Note: {booking.note}
            </p>
          )}

          <div className="pt-2 border-t border-line flex justify-end">
            <button
              type="button"
              onClick={() => openMessageModal('reminder')}
              className="px-3 py-1.5 bg-plum/10 text-plum border border-plum/20 hover:bg-plum/20 rounded-control text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              💬 {assistantCatalog.writeMessage}
            </button>
          </div>
        </section>

        {/* Status Actions */}
        {booking.status !== 'completed' && booking.status !== 'cancelled' && (
          <section className="bg-surface border border-line rounded-card p-4 space-y-3">
            <span className="text-xs font-semibold text-slate uppercase tracking-wider">
              Update Status
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {booking.status === 'confirmed' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate('arrived')}
                    className="p-2.5 bg-plum text-on-plum rounded-control font-semibold hover:opacity-90 active:scale-95 transition-all"
                  >
                    {catalog.markArrived}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate('no_show')}
                    className="p-2.5 border border-line bg-surface rounded-control text-slate hover:text-ink active:scale-95 transition-all"
                  >
                    {catalog.markNoShow}
                  </button>
                </>
              )}

              {booking.status === 'arrived' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate('in_service')}
                    className="p-2.5 bg-plum text-on-plum rounded-control font-semibold hover:opacity-90 active:scale-95 transition-all"
                  >
                    {catalog.startService}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate('completed')}
                    className="p-2.5 border border-line bg-surface rounded-control text-slate hover:text-ink active:scale-95 transition-all"
                  >
                    {catalog.completeService}
                  </button>
                </>
              )}

              {booking.status === 'in_service' && (
                <button
                  type="button"
                  onClick={() => handleStatusUpdate('completed')}
                  className="col-span-2 p-2.5 bg-plum text-on-plum rounded-control font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  {catalog.completeService}
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-line flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => setShowReschedule(true)}
                className="text-plum font-semibold hover:underline"
              >
                Reschedule...
              </button>
              <button
                type="button"
                onClick={() => setShowCancel(true)}
                className="text-rose-600 font-semibold hover:underline"
              >
                Cancel booking...
              </button>
            </div>
          </section>
        )}

        {/* Reschedule Modal */}
        {showReschedule && (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-line rounded-card max-w-sm w-full p-4 space-y-3 shadow-xl">
              <h3 className="font-heading text-base font-semibold">Reschedule Appointment</h3>
              <form onSubmit={handleRescheduleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate font-semibold">New Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full mt-1 p-2 border border-line rounded-control bg-surface"
                  />
                </div>
                <div>
                  <label className="text-slate font-semibold">New Time</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                    className="w-full mt-1 p-2 border border-line rounded-control bg-surface"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReschedule(false)}
                    className="px-3 py-1.5 border border-line rounded-control text-slate"
                  >
                    {common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-plum text-on-plum font-semibold rounded-control"
                  >
                    Save New Time
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancel && (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-line rounded-card max-w-sm w-full p-4 space-y-3 shadow-xl">
              <h3 className="font-heading text-base font-semibold text-rose-600">Cancel Appointment</h3>
              <form onSubmit={handleCancelSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate font-semibold">{catalog.cancelReasonPrompt}</label>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Customer called to cancel"
                    className="w-full mt-1 p-2 border border-line rounded-control bg-surface"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCancel(false)}
                    className="px-3 py-1.5 border border-line rounded-control text-slate"
                  >
                    {common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-rose-600 text-white font-semibold rounded-control"
                  >
                    Confirm Cancellation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Message Writer Modal */}
        {showMessageModal && (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-line rounded-card max-w-sm w-full p-4 space-y-3 shadow-xl">
              <div className="border-b border-line pb-2 flex justify-between items-center">
                <div>
                  <h3 className="font-heading text-sm font-semibold text-ink">
                    {assistantCatalog.writeMessage}
                  </h3>
                  <p className="text-[11px] text-slate">{assistantCatalog.writeMessageSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="text-slate hover:text-ink text-sm p-1"
                >
                  ✕
                </button>
              </div>

              {/* Message Kind Selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate">
                  {assistantCatalog.messageType}
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { id: 'reminder', label: 'Reminder' },
                    { id: 'confirmation', label: 'Confirmation' },
                    { id: 'reschedule', label: 'Reschedule' },
                    { id: 'no_show', label: 'No-Show Follow-up' },
                  ].map((k) => (
                    <button
                      type="button"
                      key={k.id}
                      onClick={() => openMessageModal(k.id as any)}
                      className={`p-1.5 rounded-control border text-center font-medium transition-all ${
                        messageKind === k.id
                          ? 'border-plum bg-plum/10 text-plum font-semibold'
                          : 'border-line bg-paper text-slate hover:text-ink'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone Selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate">Tone</label>
                <div className="flex gap-1.5 text-xs">
                  {[
                    { id: 'friendly', label: assistantCatalog.toneFriendly },
                    { id: 'neutral', label: assistantCatalog.toneNeutral },
                    { id: 'formal', label: assistantCatalog.toneFormal },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => handleToneChange(t.id as any)}
                      className={`flex-1 py-1 rounded-control border text-center transition-all ${
                        messageTone === t.id
                          ? 'border-ink bg-ink text-paper font-semibold'
                          : 'border-line bg-paper text-slate'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Draft Area */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate">
                  {assistantCatalog.draftPreview}
                </label>
                <textarea
                  value={draftedMessage}
                  onChange={(e) => setDraftedMessage(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 text-xs bg-paper border border-line rounded-control focus:border-plum text-ink"
                />
                <span className="text-[10px] text-slate block text-right">
                  {draftedMessage.trim().split(/\s+/).length} / 60 words
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(draftedMessage);
                    showToast({ message: 'Message copied to clipboard' });
                  }}
                  className="flex-1 py-2 bg-plum text-on-plum font-semibold text-xs rounded-control hover:opacity-95"
                >
                  {assistantCatalog.copyMessage}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.share({ text: draftedMessage }).catch(() => {});
                    }}
                    className="px-3 py-2 bg-surface border border-line text-slate hover:text-ink font-semibold text-xs rounded-control"
                  >
                    {assistantCatalog.shareMessage}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav role={role} />
    </div>
  );
}

export default function BookingDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-md mx-auto min-h-screen p-4 space-y-4 bg-paper">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      }
    >
      <BookingDetailContent />
    </React.Suspense>
  );
}
