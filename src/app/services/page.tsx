'use client';

import React, { useState, useEffect } from 'react';
import { BottomNav } from '../../components/bottom-nav.tsx';
import { ToastProvider, useToast } from '../../components/toast.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton, Skeleton } from '../../components/skeleton.tsx';
import { t } from '../../i18n/index.ts';

// 8 accessible provider colors matching DESIGN.md
const PROVIDER_COLORS = [
  '#0F7B5F', // Green
  '#1D5FD1', // Blue
  '#6A3FA0', // Plum
  '#B3402F', // Rust
  '#8A5600', // Amber
  '#166534', // Forest
  '#4338CA', // Indigo
  '#0E7490', // Cyan
];

interface ServiceItem {
  id: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  price: number | null;
  active: boolean;
}

interface ProviderItem {
  id: string;
  name: string;
  color: number;
  active: boolean;
  serviceIds: string[];
}

interface Shift {
  start: string;
  end: string;
}

interface DaySchedule {
  weekday: number; // 1 = Monday
  dayName: string;
  isOpen: boolean;
  shifts: Shift[];
}

interface TimeOffItem {
  id: string;
  providerName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
}

function ServicesContent() {
  const [tab, setTab] = useState<'services' | 'providers' | 'hours' | 'timeoff' | 'rules'>('services');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // Initial mock state pre-populated with Salon template
  const [services, setServices] = useState<ServiceItem[]>([
    { id: '1', name: 'Haircut & Styling', durationMin: 30, bufferMin: 5, price: 250, active: true },
    { id: '2', name: 'Beard Trim & Care', durationMin: 15, bufferMin: 0, price: 100, active: true },
    { id: '3', name: 'Haircut & Beard Package', durationMin: 45, bufferMin: 5, price: 320, active: true },
  ]);

  const [providers, setProviders] = useState<ProviderItem[]>([
    { id: 'p1', name: 'Samson T.', color: 0, active: true, serviceIds: ['1', '2', '3'] },
    { id: 'p2', name: 'Dawit M.', color: 1, active: true, serviceIds: ['1'] },
  ]);

  const [schedule, setSchedule] = useState<DaySchedule[]>([
    { weekday: 1, dayName: 'Monday', isOpen: true, shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }] },
    { weekday: 2, dayName: 'Tuesday', isOpen: true, shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }] },
    { weekday: 3, dayName: 'Wednesday', isOpen: true, shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }] },
    { weekday: 4, dayName: 'Thursday', isOpen: true, shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }] },
    { weekday: 5, dayName: 'Friday', isOpen: true, shifts: [{ start: '08:30', end: '13:00' }, { start: '14:00', end: '18:30' }] },
    { weekday: 6, dayName: 'Saturday', isOpen: true, shifts: [{ start: '09:00', end: '17:00' }] },
    { weekday: 7, dayName: 'Sunday', isOpen: false, shifts: [] },
  ]);

  const [timeOffList, setTimeOffList] = useState<TimeOffItem[]>([
    { id: 'to1', providerName: null, startsAt: '2026-12-25', endsAt: '2026-12-26', reason: 'Christmas Holiday' },
  ]);

  // Business Rules state
  const [rules, setRules] = useState({
    slotIntervalMin: 15,
    leadTimeMin: 60,
    horizonDays: 30,
    cancelCutoffHours: 2,
    confirmMode: 'instant' as 'instant' | 'approval',
    maxActivePerPhone: 3,
    timeDisplay: 'gregorian' as 'gregorian' | 'both',
  });

  // Quick Add Service state
  const [quickServiceName, setQuickServiceName] = useState('');
  const [quickDuration, setQuickDuration] = useState(30);
  const [quickPrice, setQuickPrice] = useState('');
  const [showAddService, setShowAddService] = useState(false);

  // New Provider state
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderColor, setNewProviderColor] = useState(0);
  const [showAddProvider, setShowAddProvider] = useState(false);

  // New Time Off state
  const [timeOffStarts, setTimeOffStarts] = useState('');
  const [timeOffEnds, setTimeOffEnds] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');
  const [timeOffProvider, setTimeOffProvider] = useState<string>('all');
  const [showAddTimeOff, setShowAddTimeOff] = useState(false);

  const handleQuickAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickServiceName.trim()) return;

    const newService: ServiceItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: quickServiceName.trim(),
      durationMin: quickDuration,
      bufferMin: 0,
      price: quickPrice ? parseFloat(quickPrice) : null,
      active: true,
    };

    setServices((prev) => [...prev, newService]);
    setQuickServiceName('');
    setQuickPrice('');
    setShowAddService(false);
    showToast({ message: `Service "${newService.name}" created` });
  };

  const handleAddProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName.trim()) return;

    const newProv: ProviderItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: newProviderName.trim(),
      color: newProviderColor,
      active: true,
      serviceIds: services.map((s) => s.id),
    };

    setProviders((prev) => [...prev, newProv]);
    setNewProviderName('');
    setShowAddProvider(false);
    showToast({ message: `Provider "${newProv.name}" added` });
  };

  const handleCopyMondayToWeekdays = () => {
    const monday = schedule.find((s) => s.weekday === 1);
    if (!monday) return;

    setSchedule((prev) =>
      prev.map((day) => {
        if (day.weekday >= 1 && day.weekday <= 5) {
          return {
            ...day,
            isOpen: monday.isOpen,
            shifts: JSON.parse(JSON.stringify(monday.shifts)),
          };
        }
        return day;
      })
    );
    showToast({ message: 'Copied Monday schedule to Mon-Fri weekdays' });
  };

  const handleAddTimeOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOffStarts || !timeOffEnds) return;

    const newTimeOff: TimeOffItem = {
      id: Math.random().toString(36).substring(2, 9),
      providerName: timeOffProvider === 'all' ? null : providers.find((p) => p.id === timeOffProvider)?.name || null,
      startsAt: timeOffStarts,
      endsAt: timeOffEnds,
      reason: timeOffReason || 'Time Off',
    };

    setTimeOffList((prev) => [...prev, newTimeOff]);
    setTimeOffStarts('');
    setTimeOffEnds('');
    setTimeOffReason('');
    setShowAddTimeOff(false);
    showToast({ message: 'Time off recorded (0 conflicting bookings)' });
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      {/* Header */}
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Services & Setup</h1>
          <p className="text-xs text-slate">Configure your business catalog & rules</p>
        </div>
        <LanguageSwitch />
      </header>

      {/* Segmented Tab Navigation */}
      <div className="px-4 pt-3 pb-2 bg-surface border-b border-line overflow-x-auto no-scrollbar flex gap-1.5 shrink-0">
        {[
          { key: 'services', label: 'Services' },
          { key: 'providers', label: 'Providers' },
          { key: 'hours', label: 'Hours' },
          { key: 'timeoff', label: 'Time Off' },
          { key: 'rules', label: 'Rules' },
        ].map((tItem) => (
          <button
            key={tItem.key}
            type="button"
            onClick={() => setTab(tItem.key as any)}
            className={`px-3 py-1.5 rounded-control text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === tItem.key
                ? 'bg-plum text-on-plum'
                : 'text-slate hover:text-ink bg-paper border border-line'
            }`}
          >
            {tItem.label}
          </button>
        ))}
      </div>

      <main className="p-4 space-y-4 flex-1">
        {/* TAB 1: SERVICES */}
        {tab === 'services' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-heading text-lg font-semibold">Active Services</h2>
                <p className="text-xs text-slate">{services.length} services offered</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddService(!showAddService)}
                className="px-3 py-1.5 bg-plum text-on-plum rounded-control text-xs font-semibold"
              >
                {showAddService ? 'Cancel' : '+ Quick Add'}
              </button>
            </div>

            {/* Quick Add Form: requires only Name & Duration */}
            {showAddService && (
              <form onSubmit={handleQuickAddService} className="bg-surface border border-line rounded-card p-4 space-y-3 shadow-sm">
                <h3 className="font-heading text-sm font-semibold">Quick Add Service</h3>
                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Service Name *</label>
                  <input
                    type="text"
                    required
                    value={quickServiceName}
                    onChange={(e) => setQuickServiceName(e.target.value)}
                    placeholder="e.g. Buzz Cut"
                    className="w-full h-10 px-3 rounded-control border border-line bg-paper text-sm focus:outline-none focus:border-plum"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Duration (minutes) *</label>
                  <div className="flex gap-2">
                    {[15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setQuickDuration(mins)}
                        className={`flex-1 h-9 rounded-control border text-xs font-semibold ${
                          quickDuration === mins
                            ? 'border-plum bg-plum text-on-plum'
                            : 'border-line bg-paper text-slate'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Price (ETB, optional)</label>
                  <input
                    type="number"
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    placeholder="e.g. 200"
                    className="w-full h-10 px-3 rounded-control border border-line bg-paper text-sm focus:outline-none focus:border-plum"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-11 bg-plum text-on-plum rounded-control text-sm font-semibold active:opacity-90"
                >
                  Save Service
                </button>
              </form>
            )}

            {/* Services List */}
            <div className="space-y-2">
              {services.map((srv) => (
                <div key={srv.id} className="bg-surface border border-line rounded-card p-3 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-sm">{srv.name}</h3>
                    <p className="text-xs text-slate">
                      {srv.durationMin} mins {srv.bufferMin > 0 && `(+${srv.bufferMin}m buffer)`} • {srv.price ? `${srv.price} ETB` : 'No price'}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-st-confirmed/15 text-st-confirmed font-semibold">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 2: PROVIDERS */}
        {tab === 'providers' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-heading text-lg font-semibold">Team Providers</h2>
                <p className="text-xs text-slate">Bookable staff members</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProvider(!showAddProvider)}
                className="px-3 py-1.5 bg-plum text-on-plum rounded-control text-xs font-semibold"
              >
                {showAddProvider ? 'Cancel' : '+ Add Provider'}
              </button>
            </div>

            {showAddProvider && (
              <form onSubmit={handleAddProvider} className="bg-surface border border-line rounded-card p-4 space-y-3 shadow-sm">
                <h3 className="font-heading text-sm font-semibold">New Provider</h3>
                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Provider Name *</label>
                  <input
                    type="text"
                    required
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="e.g. Almaz T."
                    className="w-full h-10 px-3 rounded-control border border-line bg-paper text-sm focus:outline-none focus:border-plum"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Calendar Color *</label>
                  <div className="flex gap-2">
                    {PROVIDER_COLORS.map((colorHex, idx) => (
                      <button
                        key={colorHex}
                        type="button"
                        onClick={() => setNewProviderColor(idx)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          newProviderColor === idx ? 'scale-110 border-ink' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: colorHex }}
                        aria-label={`Color ${idx}`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-11 bg-plum text-on-plum rounded-control text-sm font-semibold"
                >
                  Save Provider
                </button>
              </form>
            )}

            <div className="space-y-2">
              {providers.map((p) => (
                <div key={p.id} className="bg-surface border border-line rounded-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs"
                        style={{ backgroundColor: PROVIDER_COLORS[p.color] }}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        <p className="text-xs text-slate">{p.serviceIds.length} services assigned</p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-st-confirmed/15 text-st-confirmed font-semibold">
                      Active
                    </span>
                  </div>

                  {/* Service mapping tags */}
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-line">
                    {services.map((srv) => {
                      const isAssigned = p.serviceIds.includes(srv.id);
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => {
                            setProviders((prev) =>
                              prev.map((pr) => {
                                if (pr.id !== p.id) return pr;
                                const updated = isAssigned
                                  ? pr.serviceIds.filter((id) => id !== srv.id)
                                  : [...pr.serviceIds, srv.id];
                                return { ...pr, serviceIds: updated };
                              })
                            );
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            isAssigned
                              ? 'bg-plum/15 text-plum font-semibold'
                              : 'bg-paper text-slate border border-line'
                          }`}
                        >
                          {isAssigned ? 'Active: ' : '+ '}{srv.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: WORKING HOURS */}
        {tab === 'hours' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-heading text-lg font-semibold">Weekly Schedule</h2>
                <p className="text-xs text-slate">Split shifts & working windows</p>
              </div>
              <button
                type="button"
                onClick={handleCopyMondayToWeekdays}
                className="px-2.5 py-1 bg-surface border border-line text-plum rounded-control text-xs font-semibold hover:border-plum"
              >
                Copy Mon → Weekdays
              </button>
            </div>

            <div className="space-y-2">
              {schedule.map((day) => (
                <div key={day.weekday} className="bg-surface border border-line rounded-card p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">{day.dayName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSchedule((prev) =>
                          prev.map((d) => (d.weekday === day.weekday ? { ...d, isOpen: !d.isOpen } : d))
                        );
                      }}
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        day.isOpen
                          ? 'bg-st-confirmed/15 text-st-confirmed'
                          : 'bg-slate/15 text-slate'
                      }`}
                    >
                      {day.isOpen ? 'Open' : 'Closed'}
                    </button>
                  </div>

                  {day.isOpen && (
                    <div className="space-y-1.5 text-xs text-slate">
                      {day.shifts.map((sh, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-paper p-1.5 rounded-control border border-line">
                          <span>Shift {idx + 1}:</span>
                          <span className="font-mono font-semibold text-ink">{sh.start} – {sh.end}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 4: TIME OFF */}
        {tab === 'timeoff' && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-heading text-lg font-semibold">Time Off & Holidays</h2>
                <p className="text-xs text-slate">Closures & staff leave</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTimeOff(!showAddTimeOff)}
                className="px-3 py-1.5 bg-plum text-on-plum rounded-control text-xs font-semibold"
              >
                {showAddTimeOff ? 'Cancel' : '+ Add Time Off'}
              </button>
            </div>

            {showAddTimeOff && (
              <form onSubmit={handleAddTimeOff} className="bg-surface border border-line rounded-card p-4 space-y-3 shadow-sm">
                <h3 className="font-heading text-sm font-semibold">Record Closure / Time Off</h3>
                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Target</label>
                  <select
                    value={timeOffProvider}
                    onChange={(e) => setTimeOffProvider(e.target.value)}
                    className="w-full h-10 px-3 rounded-control border border-line bg-paper text-sm"
                  >
                    <option value="all">Whole Business (Holiday Closure)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate block mb-1">Start Date *</label>
                    <input
                      type="date"
                      required
                      value={timeOffStarts}
                      onChange={(e) => setTimeOffStarts(e.target.value)}
                      className="w-full h-10 px-2 rounded-control border border-line bg-paper text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate block mb-1">End Date *</label>
                    <input
                      type="date"
                      required
                      value={timeOffEnds}
                      onChange={(e) => setTimeOffEnds(e.target.value)}
                      className="w-full h-10 px-2 rounded-control border border-line bg-paper text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    value={timeOffReason}
                    onChange={(e) => setTimeOffReason(e.target.value)}
                    placeholder="e.g. National Holiday"
                    className="w-full h-10 px-3 rounded-control border border-line bg-paper text-sm focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-11 bg-plum text-on-plum rounded-control text-sm font-semibold"
                >
                  Save Time Off
                </button>
              </form>
            )}

            <div className="space-y-2">
              {timeOffList.map((item) => (
                <div key={item.id} className="bg-surface border border-line rounded-card p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm">{item.reason}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate/15 text-slate">
                      {item.providerName || 'All Business'}
                    </span>
                  </div>
                  <p className="text-xs text-slate">
                    {item.startsAt} to {item.endsAt} • 0 conflicting bookings
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 5: BUSINESS RULES */}
        {tab === 'rules' && (
          <section className="space-y-4">
            <div>
              <h2 className="font-heading text-lg font-semibold">Booking Rules</h2>
              <p className="text-xs text-slate">Availability thresholds & customer limits</p>
            </div>

            <div className="bg-surface border border-line rounded-card p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate block mb-1">Slot Interval</label>
                <div className="flex gap-1.5">
                  {[10, 15, 20, 30, 60].map((intv) => (
                    <button
                      key={intv}
                      type="button"
                      onClick={() => setRules({ ...rules, slotIntervalMin: intv })}
                      className={`flex-1 h-9 rounded-control border text-xs font-semibold ${
                        rules.slotIntervalMin === intv
                          ? 'border-plum bg-plum text-on-plum'
                          : 'border-line bg-paper text-slate'
                      }`}
                    >
                      {intv}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate block mb-1">Confirmation Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRules({ ...rules, confirmMode: 'instant' })}
                    className={`flex-1 h-10 rounded-control border text-xs font-semibold ${
                      rules.confirmMode === 'instant'
                        ? 'border-plum bg-plum text-on-plum'
                        : 'border-line bg-paper text-slate'
                    }`}
                  >
                    Instant Confirmation
                  </button>
                  <button
                    type="button"
                    onClick={() => setRules({ ...rules, confirmMode: 'approval' })}
                    className={`flex-1 h-10 rounded-control border text-xs font-semibold ${
                      rules.confirmMode === 'approval'
                        ? 'border-plum bg-plum text-on-plum'
                        : 'border-line bg-paper text-slate'
                    }`}
                  >
                    Requires Approval
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Min Lead Time</label>
                  <select
                    value={rules.leadTimeMin}
                    onChange={(e) => setRules({ ...rules, leadTimeMin: parseInt(e.target.value) })}
                    className="w-full h-10 px-2 rounded-control border border-line bg-paper text-xs"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate block mb-1">Cancellation Cutoff</label>
                  <select
                    value={rules.cancelCutoffHours}
                    onChange={(e) => setRules({ ...rules, cancelCutoffHours: parseInt(e.target.value) })}
                    className="w-full h-10 px-2 rounded-control border border-line bg-paper text-xs"
                  >
                    <option value={1}>1 hour before</option>
                    <option value={2}>2 hours before</option>
                    <option value={4}>4 hours before</option>
                    <option value={24}>24 hours before</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate block mb-1">Time Display Style</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRules({ ...rules, timeDisplay: 'gregorian' })}
                    className={`flex-1 h-9 rounded-control border text-xs font-semibold ${
                      rules.timeDisplay === 'gregorian'
                        ? 'border-plum bg-plum text-on-plum'
                        : 'border-line bg-paper text-slate'
                    }`}
                  >
                    Standard (12-hour)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRules({ ...rules, timeDisplay: 'both' })}
                    className={`flex-1 h-9 rounded-control border text-xs font-semibold ${
                      rules.timeDisplay === 'both'
                        ? 'border-plum bg-plum text-on-plum'
                        : 'border-line bg-paper text-slate'
                    }`}
                  >
                    + Ethiopian Time
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast({ message: 'Business rules saved' })}
                className="w-full h-11 bg-plum text-on-plum rounded-control text-sm font-semibold mt-2"
              >
                Save Settings
              </button>
            </div>
          </section>
        )}
      </main>

      <BottomNav currentPath="/services" role="owner" />
    </div>
  );
}

export default function ServicesPage() {
  return (
    <ToastProvider>
      <ServicesContent />
    </ToastProvider>
  );
}
