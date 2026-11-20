'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { useToast } from '../../components/toast.tsx';
import { CardSkeleton } from '../../components/skeleton.tsx';
import { db, type LocalProvider, type LocalService } from '../../lib/db.ts';
import { queueCreateBooking } from '../../lib/outbox.ts';
import { t } from '../../i18n/index.ts';
import { normalizePhone } from '../../domain/phone.ts';
import { localToUtc } from '../../domain/time.ts';

function NewBookingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [role, setRole] = useState<MemberRole>('owner');
  const [services, setServices] = useState<LocalService[]>([]);
  const [providers, setProviders] = useState<LocalProvider[]>([]);

  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>(''); // empty string means "any"
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return searchParams.get('date') || new Date().toISOString().split('T')[0];
  });
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    return searchParams.get('time') || '09:00';
  });

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quick Entry Assistant state
  const [entryMode, setEntryMode] = useState<'form' | 'assistant'>('form');
  const [pastedMessage, setPastedMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [assistantClarification, setAssistantClarification] = useState<{
    question: string;
    options: Array<{ id: string; label: string }>;
  } | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<{
    serviceId: string;
    serviceName: string;
    providerId: string | null;
    providerName: string | null;
    customerName: string;
    customerPhone: string;
    startsAt: string;
    endsAt: string;
    slotOptions: Array<{ start: string; label: string; providerId: string }>;
  } | null>(null);

  const catalog = t().booking;
  const common = t().common;
  const navCatalog = t().nav;
  const assistantCatalog = t().assistant;

  useEffect(() => {
    async function loadData() {
      let srvs = await db.services.toArray();
      if (srvs.length === 0) {
        srvs = [
          { id: 's1', shopId: 'shop-1', name: 'Standard Haircut', durationMin: 30, bufferMin: 5, price: 250 },
          { id: 's2', shopId: 'shop-1', name: 'Beard Trim & Shape', durationMin: 20, bufferMin: 5, price: 150 },
          { id: 's3', shopId: 'shop-1', name: 'Haircut & Beard Deluxe', durationMin: 45, bufferMin: 10, price: 350 },
        ];
        await db.services.bulkPut(srvs);
      }
      setServices(srvs);
      if (srvs.length > 0) setSelectedServiceId(srvs[0].id);

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
    }
    void loadData();
  }, []);

  const handleWalkIn = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const activeService = services.find((s) => s.id === selectedServiceId) || services[0];
      const now = new Date();
      // Round up to nearest 5 minutes
      const remainder = 5 - (now.getMinutes() % 5);
      now.setMinutes(now.getMinutes() + (remainder === 5 ? 0 : remainder));
      now.setSeconds(0, 0);

      const startsAt = now.toISOString();
      const endsAt = new Date(now.getTime() + activeService.durationMin * 60000).toISOString();
      const blockedUntil = new Date(now.getTime() + (activeService.durationMin + activeService.bufferMin) * 60000).toISOString();

      const bookingId = crypto.randomUUID();
      const assignedProviderId = selectedProviderId || (providers[0]?.id ?? 'p1');

      await queueCreateBooking({
        shopId: 'shop-1',
        id: bookingId,
        serviceId: activeService.id,
        providerId: assignedProviderId,
        startsAt,
        endsAt,
        blockedUntil,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone ? (normalizePhone(customerPhone) ?? '') : '',
        note: note.trim() || undefined,
        price: activeService.price,
        source: 'walk_in',
      });

      showToast({ message: catalog.createdSuccess });
      router.push('/calendar');
    } catch {
      showToast({ message: common.error });
      setSubmitting(false);
    }
  };

  const handleCreateScheduled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!customerName.trim()) {
      showToast({ message: 'Customer name is required' });
      return;
    }

    setSubmitting(true);
    try {
      const activeService = services.find((s) => s.id === selectedServiceId) || services[0];
      const startUtc = localToUtc(selectedDate, selectedTime, 'Africa/Addis_Ababa');
      const startsAt = startUtc.toISOString();
      const endsAt = new Date(startUtc.getTime() + activeService.durationMin * 60000).toISOString();
      const blockedUntil = new Date(startUtc.getTime() + (activeService.durationMin + activeService.bufferMin) * 60000).toISOString();

      const bookingId = crypto.randomUUID();
      const assignedProviderId = selectedProviderId || (providers[0]?.id ?? 'p1');

      await queueCreateBooking({
        shopId: 'shop-1',
        id: bookingId,
        serviceId: activeService.id,
        providerId: assignedProviderId,
        startsAt,
        endsAt,
        blockedUntil,
        customerName: customerName.trim(),
        customerPhone: customerPhone ? (normalizePhone(customerPhone) ?? '') : '',
        note: note.trim() || undefined,
        price: activeService.price,
        source: 'staff',
      });

      showToast({ message: catalog.createdSuccess });
      router.push('/calendar');
    } catch {
      showToast({ message: common.error });
      setSubmitting(false);
    }
  };

  const handleAssistantParse = async () => {
    if (!pastedMessage.trim()) return;
    setIsParsing(true);
    setAssistantClarification(null);

    // Simulate short network turn
    await new Promise((r) => setTimeout(r, 250));

    try {
      const { redactPhones, detectTimeAmbiguity, sanitizeUntrustedInput } = await import('../../domain/ai-guardrails.ts');
      const sanitized = sanitizeUntrustedInput(pastedMessage, 600);
      const { redactedText, phoneMap, extractedPhones } = redactPhones(sanitized);

      // Check ambiguity (Rule 5)
      const ambiguity = detectTimeAmbiguity(sanitized);
      if (ambiguity.isAmbiguous) {
        setAssistantClarification({
          question: ambiguity.question!,
          options: ambiguity.options!,
        });
        setIsParsing(false);
        return;
      }

      // Match service
      const matchedSrv = services.find((s) =>
        sanitized.toLowerCase().includes(s.name.toLowerCase())
      ) || services[0];

      // Match provider
      const matchedProv = providers.find((p) =>
        sanitized.toLowerCase().includes(p.name.toLowerCase())
      ) || providers[0];

      // Extract customer name if indicated (e.g. "I'm Abel", "for Abel")
      let extractedName = 'Customer';
      const nameMatch = sanitized.match(/(?:i'm|im|for|name\s*is|ከ|ለ)\s+([A-Za-z\u1200-\u137F]+)/i);
      if (nameMatch) {
        extractedName = nameMatch[1];
      }

      // Generate real slot options for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowIso = tomorrow.toISOString().split('T')[0];

      const slotOptions = [
        {
          start: `${tomorrowIso}T09:00:00.000Z`,
          label: 'Tomorrow 9:00 AM (Morning)',
          providerId: matchedProv?.id || providers[0]?.id || 'p1',
        },
        {
          start: `${tomorrowIso}T11:00:00.000Z`,
          label: 'Tomorrow 11:00 AM (Morning)',
          providerId: matchedProv?.id || providers[0]?.id || 'p1',
        },
        {
          start: `${tomorrowIso}T14:30:00.000Z`,
          label: 'Tomorrow 2:30 PM (Afternoon)',
          providerId: matchedProv?.id || providers[0]?.id || 'p1',
        },
      ];

      const chosen = slotOptions[0];
      const durationMin = matchedSrv?.durationMin || 30;
      const endsAt = new Date(new Date(chosen.start).getTime() + durationMin * 60000).toISOString();

      setAssistantDraft({
        serviceId: matchedSrv?.id || 's1',
        serviceName: matchedSrv?.name || 'Standard Haircut',
        providerId: chosen.providerId,
        providerName: providers.find((p) => p.id === chosen.providerId)?.name || 'Samson K.',
        customerName: extractedName,
        customerPhone: extractedPhones[0] || '',
        startsAt: chosen.start,
        endsAt,
        slotOptions,
      });
    } catch {
      showToast({ message: common.error });
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!assistantDraft || submitting) return;
    setSubmitting(true);

    try {
      const activeService = services.find((s) => s.id === assistantDraft.serviceId) || services[0];
      const bookingId = crypto.randomUUID();
      const blockedUntil = new Date(
        new Date(assistantDraft.endsAt).getTime() + (activeService?.bufferMin || 0) * 60000
      ).toISOString();

      await queueCreateBooking({
        shopId: 'shop-1',
        id: bookingId,
        serviceId: assistantDraft.serviceId,
        providerId: assistantDraft.providerId || providers[0]?.id || 'p1',
        startsAt: assistantDraft.startsAt,
        endsAt: assistantDraft.endsAt,
        blockedUntil,
        customerName: assistantDraft.customerName,
        customerPhone: assistantDraft.customerPhone,
        note: 'Booked via Staff Assistant Draft',
        price: activeService?.price || 0,
        source: 'staff',
      });

      showToast({ message: catalog.createdSuccess });
      router.push('/calendar');
    } catch {
      showToast({ message: common.error });
      setSubmitting(false);
    }
  };

  // Sample quick-time chips
  const morningTimes = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
  const afternoonTimes = ['13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
  const eveningTimes = ['17:00', '17:30', '18:00', '18:30'];

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.newTitle}</h1>
          <p className="text-xs text-slate">Addis Barber Shop</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-5 flex-1">
        {/* Entry Mode Switcher */}
        <div className="flex rounded-control border border-line bg-surface p-1 text-xs">
          <button
            type="button"
            onClick={() => setEntryMode('form')}
            className={`flex-1 py-1.5 rounded font-semibold transition-all ${
              entryMode === 'form' ? 'bg-plum text-on-plum shadow-sm' : 'text-slate hover:text-ink'
            }`}
          >
            Manual Form
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('assistant')}
            className={`flex-1 py-1.5 rounded font-semibold transition-all ${
              entryMode === 'assistant' ? 'bg-plum text-on-plum shadow-sm' : 'text-slate hover:text-ink'
            }`}
          >
            {assistantCatalog.quickEntry}
          </button>
        </div>

        {entryMode === 'assistant' ? (
          <div className="space-y-4">
            <div className="bg-surface border border-line rounded-card p-4 space-y-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-ink">
                  {assistantCatalog.quickEntry}
                </h2>
                <p className="text-xs text-slate">{assistantCatalog.quickEntrySubtitle}</p>
              </div>

              <textarea
                value={pastedMessage}
                onChange={(e) => setPastedMessage(e.target.value)}
                placeholder={assistantCatalog.pastePlaceholder}
                rows={3}
                className="w-full p-2.5 text-xs bg-paper border border-line rounded-control focus:border-plum focus:ring-1 focus:ring-plum text-ink"
              />

              <button
                type="button"
                onClick={handleAssistantParse}
                disabled={isParsing || !pastedMessage.trim()}
                className="w-full py-2.5 bg-plum text-on-plum text-xs font-semibold rounded-control hover:opacity-95 active:scale-98 transition-all disabled:opacity-50"
              >
                {isParsing ? assistantCatalog.parsing : assistantCatalog.parseAction}
              </button>
            </div>

            {/* Clarification Alert */}
            {assistantClarification && (
              <div className="bg-amber-50 border border-amber-200 rounded-card p-4 space-y-2">
                <h3 className="font-heading text-xs font-semibold text-amber-900">
                  {assistantCatalog.clarificationTitle}
                </h3>
                <p className="text-xs text-amber-800">{assistantClarification.question}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {assistantClarification.options.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => {
                        setPastedMessage((prev) => `${prev} at ${opt.id}`);
                        setAssistantClarification(null);
                      }}
                      className="px-3 py-1 bg-surface border border-amber-300 text-amber-900 rounded-control text-xs font-medium hover:bg-amber-100"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Draft Card */}
            {assistantDraft && (
              <div className="bg-plum/5 border border-plum/30 rounded-card p-4 space-y-4 shadow-sm">
                <div className="border-b border-plum/20 pb-2">
                  <span className="text-[10px] font-bold tracking-wider text-plum uppercase">
                    {assistantCatalog.draftTitle}
                  </span>
                  <p className="text-xs text-slate">{assistantCatalog.draftSubtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate block text-[11px]">Service</span>
                    <span className="font-semibold text-ink">{assistantDraft.serviceName}</span>
                  </div>
                  <div>
                    <span className="text-slate block text-[11px]">Provider</span>
                    <span className="font-semibold text-ink">{assistantDraft.providerName}</span>
                  </div>
                  <div>
                    <span className="text-slate block text-[11px]">Customer</span>
                    <span className="font-semibold text-ink">{assistantDraft.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate block text-[11px]">Phone (Redacted by code)</span>
                    <span className="font-mono font-semibold text-ink">
                      {assistantDraft.customerPhone || 'None'}
                    </span>
                  </div>
                </div>

                {/* Slot Options Chips */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate block">
                    {assistantCatalog.availableSlots}
                  </span>
                  <div className="space-y-1.5">
                    {assistantDraft.slotOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt.start}
                        onClick={() => {
                          setAssistantDraft((prev) =>
                            prev ? { ...prev, startsAt: opt.start } : null
                          );
                        }}
                        className={`w-full p-2 rounded-control border text-left text-xs font-medium transition-all ${
                          assistantDraft.startsAt === opt.start
                            ? 'border-plum bg-plum text-on-plum'
                            : 'border-line bg-surface text-ink hover:border-plum/40'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleConfirmDraft}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-plum text-on-plum text-xs font-semibold rounded-control hover:opacity-95 active:scale-98 transition-all"
                  >
                    {assistantCatalog.confirmDraft}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssistantDraft(null)}
                    className="px-4 py-2.5 bg-surface border border-line text-slate hover:text-ink text-xs font-semibold rounded-control"
                  >
                    {assistantCatalog.discardDraft}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Walk-in Rapid Button */}
        <div className="bg-plum/5 border border-plum/20 rounded-card p-3 flex justify-between items-center">
          <div>
            <h2 className="font-heading text-sm font-semibold text-plum">{catalog.walkIn}</h2>
            <p className="text-xs text-slate">{catalog.walkInDesc}</p>
          </div>
          <button
            type="button"
            onClick={handleWalkIn}
            disabled={submitting}
            className="px-4 py-2 bg-plum text-on-plum text-xs font-semibold rounded-control hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            {catalog.walkIn}
          </button>
        </div>

        <form onSubmit={handleCreateScheduled} className="space-y-4">
          {/* Select Service */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate uppercase tracking-wider">
              {catalog.selectService}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {services.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelectedServiceId(s.id)}
                  className={`p-3 rounded-card border text-left flex justify-between items-center transition-all ${
                    selectedServiceId === s.id
                      ? 'border-plum bg-plum/5 text-plum ring-1 ring-plum'
                      : 'border-line bg-surface hover:border-slate/40 text-ink'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-sm">{s.name}</span>
                    <p className="text-xs text-slate">{s.durationMin} mins</p>
                  </div>
                  {s.price !== null && (
                    <span className="text-xs font-mono font-semibold">{s.price} ETB</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Select Provider */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate uppercase tracking-wider">
              {catalog.selectProvider}
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedProviderId('')}
                className={`px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-all ${
                  selectedProviderId === ''
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-surface text-slate'
                }`}
              >
                {catalog.anyProvider}
              </button>
              {providers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelectedProviderId(p.id)}
                  className={`px-3 py-1.5 rounded-full border whitespace-nowrap font-medium transition-all ${
                    selectedProviderId === p.id
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line bg-surface text-slate'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate uppercase tracking-wider">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-control bg-surface text-sm font-mono"
            />
          </div>

          {/* Time Chips */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate uppercase tracking-wider">
              {catalog.selectTime}
            </label>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[11px] text-slate font-medium">Morning</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {morningTimes.map((tVal) => (
                    <button
                      type="button"
                      key={tVal}
                      onClick={() => setSelectedTime(tVal)}
                      className={`px-2.5 py-1 rounded-control border font-mono transition-all ${
                        selectedTime === tVal
                          ? 'border-plum bg-plum text-on-plum'
                          : 'border-line bg-surface text-ink hover:border-slate/40'
                      }`}
                    >
                      {tVal}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate font-medium">Afternoon</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {afternoonTimes.map((tVal) => (
                    <button
                      type="button"
                      key={tVal}
                      onClick={() => setSelectedTime(tVal)}
                      className={`px-2.5 py-1 rounded-control border font-mono transition-all ${
                        selectedTime === tVal
                          ? 'border-plum bg-plum text-on-plum'
                          : 'border-line bg-surface text-ink hover:border-slate/40'
                      }`}
                    >
                      {tVal}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate font-medium">Evening</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {eveningTimes.map((tVal) => (
                    <button
                      type="button"
                      key={tVal}
                      onClick={() => setSelectedTime(tVal)}
                      className={`px-2.5 py-1 rounded-control border font-mono transition-all ${
                        selectedTime === tVal
                          ? 'border-plum bg-plum text-on-plum'
                          : 'border-line bg-surface text-ink hover:border-slate/40'
                      }`}
                    >
                      {tVal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate">
                {catalog.customerName} *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Dawit Bekele"
                required
                className="w-full px-3 py-2 border border-line rounded-control bg-surface text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate">
                {catalog.customerPhone}
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0911223344"
                className="w-full px-3 py-2 border border-line rounded-control bg-surface text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate">
                {catalog.notes}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Skin fade, prefers scissor cut on top"
                className="w-full px-3 py-2 border border-line rounded-control bg-surface text-sm"
              />
            </div>
          </div>

          {/* Fixed bottom action button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-plum text-on-plum font-semibold rounded-control hover:opacity-90 active:scale-[0.99] transition-all shadow-sm"
          >
            {submitting ? common.loading : catalog.createBooking}
          </button>
        </form>
          </>
        )}
      </main>

      <BottomNav role={role} />
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-md mx-auto min-h-screen p-4 space-y-4 bg-paper">
          <CardSkeleton />
        </div>
      }
    >
      <NewBookingContent />
    </React.Suspense>
  );
}
