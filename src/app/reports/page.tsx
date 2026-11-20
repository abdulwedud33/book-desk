'use client';

import React, { useState, useEffect } from 'react';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { useToast } from '../../components/toast.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton, RowSkeleton } from '../../components/skeleton.tsx';
import { db, type LocalBooking, type LocalProvider, type LocalService } from '../../lib/db.ts';
import { supabase } from '../../lib/supabase.ts';
import { useI18n } from '../../i18n/index.ts';
import { generateCsv } from '../../domain/csv.ts';
import {
  computeDashboardSummary,
  computePopularServices,
  computeUtilization,
  computePeakHours,
  type ReportSummary,
  type PopularServiceMetric,
  type UtilizationMetric,
  type PeakHourMetric,
} from '../../domain/reports.ts';

type PeriodRange = 'today' | 'last7' | 'last30' | 'thisMonth';

export default function ReportsPage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const [period, setPeriod] = useState<PeriodRange>('last7');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [isCached, setIsCached] = useState(false);

  const [summary, setSummary] = useState<ReportSummary>({
    totalBookings: 0,
    completedBookings: 0,
    confirmedBookings: 0,
    noShowBookings: 0,
    cancelledBookings: 0,
    totalRevenue: 0,
    noShowRate: 0,
    cancellationRate: 0,
  });

  const [popularServices, setPopularServices] = useState<PopularServiceMetric[]>([]);
  const [utilization, setUtilization] = useState<UtilizationMetric[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHourMetric[]>([]);
  const [providers, setProviders] = useState<LocalProvider[]>([]);

  const { showToast } = useToast();
  const { t } = useI18n();
  const catalog = t.reports;
  const common = t.common;
  const assistantCatalog = t.assistant;
  const [showAiInsights, setShowAiInsights] = useState(true);

  // Compute date boundaries based on selected period
  const getDateRange = (p: PeriodRange): { from: Date; to: Date } => {
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (p === 'today') {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { from, to };
    }
    if (p === 'last7') {
      const from = new Date(now.getTime() - 7 * 86400 * 1000);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    if (p === 'last30') {
      const from = new Date(now.getTime() - 30 * 86400 * 1000);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    // thisMonth
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to };
  };

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      try {
        const { from, to } = getDateRange(period);
        const provs = await db.providers.toArray();
        setProviders(provs);

        const servs = await db.services.toArray();
        const serviceMap: Record<string, string> = {};
        for (const s of servs) serviceMap[s.id] = s.name;

        const providerMap: Record<string, string> = {};
        for (const p of provs) providerMap[p.id] = p.name;

        // Force provider role to see only their own numbers
        const effectiveProvider =
          role === 'provider' ? (provs[0]?.id || null) : selectedProviderId === 'all' ? null : selectedProviderId;

        // Fetch bookings from local Dexie database
        const allBookings = await db.bookings.toArray();

        // Calculate metrics locally using pure domain engine
        const sum = computeDashboardSummary(allBookings, from, to, effectiveProvider);
        const pop = computePopularServices(
          allBookings.filter((b) => !effectiveProvider || b.providerId === effectiveProvider),
          serviceMap
        );
        const util = computeUtilization(
          allBookings.filter((b) => !effectiveProvider || b.providerId === effectiveProvider),
          providerMap
        );
        const peak = computePeakHours(
          allBookings.filter((b) => !effectiveProvider || b.providerId === effectiveProvider),
          'Africa/Addis_Ababa'
        );

        setSummary(sum);
        setPopularServices(pop);
        setUtilization(util);
        setPeakHours(peak);
        setIsCached(false);

        // Cache report in localStorage for offline access
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            `bookdesk_report_${period}_${effectiveProvider || 'all'}`,
            JSON.stringify({ sum, pop, util, peak, timestamp: Date.now() })
          );
        }
      } catch {
        // Fallback to offline cached report
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem(`bookdesk_report_${period}_${selectedProviderId}`);
          if (raw) {
            try {
              const cached = JSON.parse(raw);
              setSummary(cached.sum);
              setPopularServices(cached.pop);
              setUtilization(cached.util);
              setPeakHours(cached.peak);
              setIsCached(true);
            } catch {
              // ignore
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, [period, selectedProviderId, role]);

  const handleExportCsv = () => {
    try {
      const { from, to } = getDateRange(period);
      const csv = generateCsv(
        ['Metric / Dimension', 'Value', 'Unit'],
        [
          ['Period', `${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`, 'Date Range'],
          ['Total Bookings', summary.totalBookings, 'Count'],
          ['Completed Bookings', summary.completedBookings, 'Count'],
          ['Confirmed / In Service', summary.confirmedBookings, 'Count'],
          ['No-Show Bookings', summary.noShowBookings, 'Count'],
          ['Cancelled Bookings', summary.cancelledBookings, 'Count'],
          ['Total Revenue', summary.totalRevenue, 'ETB'],
          ['No-Show Rate', summary.noShowRate, '%'],
          ['Cancellation Rate', summary.cancellationRate, '%'],
          ['--- Popular Services ---', '---', '---'],
          ...popularServices.map((p) => [p.serviceName, p.bookingCount, `${p.revenue} ETB`]),
          ['--- Provider Utilization ---', '---', '---'],
          ...utilization.map((u) => [u.providerName, u.scheduledMinutes, 'Minutes Scheduled']),
        ]
      );

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `report-${period}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast({ message: 'Report exported (CSV)' });
    } catch {
      showToast({ message: common.error });
    }
  };

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
            <option value="provider">Role: Provider</option>
          </select>
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-5 flex-1">
        {/* Offline cached notification */}
        {isCached && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-3 text-xs text-amber-900 flex items-center gap-2">
            <span>ℹ️</span>
            <span>{catalog.cachedNotice}</span>
          </div>
        )}

        {/* Period Selector Tabs */}
        <section className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar" role="tablist">
            {[
              { id: 'today', label: catalog.today },
              { id: 'last7', label: catalog.last7Days },
              { id: 'last30', label: catalog.last30Days },
              { id: 'thisMonth', label: catalog.thisMonth },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={period === tab.id}
                onClick={() => setPeriod(tab.id as PeriodRange)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  period === tab.id
                    ? 'bg-plum text-on-plum font-semibold shadow-xs'
                    : 'bg-surface border border-line text-slate hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Provider Filter (Owner only) */}
          {role === 'owner' && providers.length > 0 && (
            <div className="pt-1 flex items-center justify-between text-xs">
              <span className="text-slate font-medium">Provider:</span>
              <select
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                className="px-2 py-1 bg-surface border border-line rounded text-xs text-ink"
                aria-label="Provider filter"
              >
                <option value="all">{catalog.allProviders}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* AI Executive Summary (Owner only) */}
        {role === 'owner' && showAiInsights && !loading && (
          <section className="bg-plum/5 border border-plum/25 rounded-card p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-plum/15 pb-2">
              <div>
                <h2 className="font-heading text-xs font-bold text-plum uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {assistantCatalog.insightsTitle}
                </h2>
                <p className="text-[11px] text-slate">{assistantCatalog.insightsSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  showToast({ message: 'Insights refreshed' });
                }}
                className="text-[11px] text-plum font-semibold hover:underline"
              >
                {assistantCatalog.refreshInsights}
              </button>
            </div>

            <p className="text-xs text-ink leading-relaxed">
              In this period, your business recorded {summary.totalBookings} total bookings with {summary.completedBookings} completed and {summary.noShowBookings} no-shows (no-show rate: {summary.noShowRate}%).
            </p>

            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate uppercase tracking-wider block">
                Recommended Actions
              </span>
              <ul className="space-y-1 text-xs text-slate">
                {summary.noShowRate > 10 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-plum font-bold">•</span>
                    <span>Send SMS or Telegram reminders earlier to reduce the {summary.noShowRate}% no-show rate.</span>
                  </li>
                )}
                {popularServices.length > 0 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-plum font-bold">•</span>
                    <span>{popularServices[0].serviceName} is your highest volume service with {popularServices[0].bookingCount} appointments.</span>
                  </li>
                )}
                {peakHours.length > 0 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-plum font-bold">•</span>
                    <span>Peak appointment demand occurs at {peakHours[0].hourOfDay}:00 with {peakHours[0].bookingCount} bookings.</span>
                  </li>
                )}
              </ul>
            </div>
          </section>
        )}

        {/* KPI Cards Grid */}
        {loading ? (
          <CardSkeleton />
        ) : (
          <section className="grid grid-cols-2 gap-3">
            {/* Revenue */}
            <div className="bg-surface border border-line rounded-card p-3.5 shadow-xs col-span-2 flex justify-between items-center">
              <div>
                <span className="text-[11px] font-semibold text-slate uppercase tracking-wider">
                  {catalog.totalRevenue}
                </span>
                <p className="font-heading text-2xl font-bold text-ink mt-0.5">
                  {summary.totalRevenue} <span className="text-xs font-normal text-slate">ETB</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 bg-paper border border-line text-xs font-semibold rounded-control hover:bg-line active:scale-95 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {catalog.exportCsv}
              </button>
            </div>

            {/* Total Bookings */}
            <div className="bg-surface border border-line rounded-card p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-slate uppercase tracking-wider block">
                {catalog.totalBookings}
              </span>
              <p className="font-heading text-xl font-bold text-ink mt-1">
                {summary.totalBookings}
              </p>
              <span className="text-[10px] text-st-confirmed font-medium">
                {summary.completedBookings} completed
              </span>
            </div>

            {/* Completed */}
            <div className="bg-surface border border-line rounded-card p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-slate uppercase tracking-wider block">
                {catalog.completedBookings}
              </span>
              <p className="font-heading text-xl font-bold text-ink mt-1 text-st-confirmed">
                {summary.completedBookings}
              </p>
              <span className="text-[10px] text-slate font-medium">
                {summary.confirmedBookings} upcoming
              </span>
            </div>

            {/* No-show Rate */}
            <div className="bg-surface border border-line rounded-card p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-slate uppercase tracking-wider block">
                {catalog.noShowRate}
              </span>
              <p
                className={`font-heading text-xl font-bold mt-1 ${
                  summary.noShowRate > 15 ? 'text-st-noshow' : 'text-ink'
                }`}
              >
                {summary.noShowRate}%
              </p>
              <span className="text-[10px] text-slate font-medium">
                {summary.noShowBookings} no-show{summary.noShowBookings !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Cancellation Rate */}
            <div className="bg-surface border border-line rounded-card p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-slate uppercase tracking-wider block">
                {catalog.cancellationRate}
              </span>
              <p className="font-heading text-xl font-bold text-ink mt-1">
                {summary.cancellationRate}%
              </p>
              <span className="text-[10px] text-slate font-medium">
                {summary.cancelledBookings} cancelled
              </span>
            </div>
          </section>
        )}

        {/* Popular Services Section */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-xs space-y-3">
          <h2 className="font-heading text-sm font-bold text-ink">{catalog.popularServices}</h2>
          {loading ? (
            <RowSkeleton count={2} />
          ) : popularServices.length === 0 ? (
            <p className="text-xs text-slate italic py-2">{catalog.noData}</p>
          ) : (
            <div className="space-y-2 text-xs">
              {popularServices.map((srv) => (
                <div key={srv.serviceId} className="flex justify-between items-center py-1 border-b border-line/60 last:border-none">
                  <div>
                    <span className="font-semibold text-ink">{srv.serviceName}</span>
                    <p className="text-[11px] text-slate">{srv.bookingCount} appointment{srv.bookingCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="font-semibold text-ink font-mono">{srv.revenue} ETB</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Provider Utilization Section */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-xs space-y-3">
          <h2 className="font-heading text-sm font-bold text-ink">{catalog.utilization}</h2>
          {loading ? (
            <RowSkeleton count={2} />
          ) : utilization.length === 0 ? (
            <p className="text-xs text-slate italic py-2">{catalog.noData}</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {utilization.map((u) => {
                const hours = (u.scheduledMinutes / 60).toFixed(1);
                return (
                  <div key={u.providerId} className="space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>{u.providerName}</span>
                      <span className="text-slate font-mono">{hours} hrs scheduled</span>
                    </div>
                    <div className="w-full bg-paper rounded-full h-2 overflow-hidden border border-line">
                      <div
                        className="bg-plum h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(5, (u.scheduledMinutes / 480) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Peak Hours Section */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-xs space-y-3">
          <h2 className="font-heading text-sm font-bold text-ink">{catalog.peakHours}</h2>
          {loading ? (
            <RowSkeleton count={2} />
          ) : peakHours.length === 0 ? (
            <p className="text-xs text-slate italic py-2">{catalog.noData}</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {peakHours.map((ph) => {
                const hourFormatted = `${ph.hourOfDay % 12 || 12}:00 ${ph.hourOfDay >= 12 ? 'PM' : 'AM'}`;
                return (
                  <div key={ph.hourOfDay} className="flex justify-between items-center py-0.5">
                    <span className="font-mono text-slate">{hourFormatted}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-paper rounded-full h-2 overflow-hidden border border-line">
                        <div
                          className="bg-st-confirmed h-full rounded-full"
                          style={{ width: `${Math.min(100, ph.bookingCount * 25)}%` }}
                        />
                      </div>
                      <span className="font-bold text-ink w-4 text-right">{ph.bookingCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <BottomNav role={role} currentPath="/reports" />
    </div>
  );
}
