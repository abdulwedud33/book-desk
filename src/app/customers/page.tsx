'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { useToast } from '../../components/toast.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { CardSkeleton, RowSkeleton } from '../../components/skeleton.tsx';
import { db, type LocalCustomer, type LocalBooking } from '../../lib/db.ts';
import { supabase } from '../../lib/supabase.ts';
import { useI18n } from '../../i18n/index.ts';
import { generateCsv } from '../../domain/csv.ts';
import { formatTimeWithPartOfDay, formatDateInTz } from '../../domain/time.ts';

export default function CustomersPage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [bookings, setBookings] = useState<LocalBooking[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { showToast } = useToast();
  const { t } = useI18n();

  const catalog = t.customers;
  const common = t.common;

  useEffect(() => {
    async function loadData() {
      try {
        let allCusts = await db.customers.toArray();
        const allBookings = await db.bookings.toArray();
        setBookings(allBookings);

        // Seed demo customers if empty
        if (allCusts.length === 0) {
          const now = new Date();
          const demo: LocalCustomer[] = [
            {
              id: 'cust-1',
              shopId: 'shop-1',
              name: 'Abel Tesfaye',
              phoneE164: '+251911223344',
              language: 'en',
              notes: 'Prefers afternoon appointments. Always tips the barber.',
              noShowCount: 0,
              requireApproval: false,
              blocked: false,
              createdAt: new Date(now.getTime() - 90 * 86400 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'cust-2',
              shopId: 'shop-1',
              name: 'Dawit Mengistu',
              phoneE164: '+251922334455',
              language: 'am',
              notes: 'Missed two appointments last month without calling.',
              noShowCount: 2,
              requireApproval: true,
              blocked: false,
              createdAt: new Date(now.getTime() - 45 * 86400 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'cust-3',
              shopId: 'shop-1',
              name: 'Caaltuu Dibaba',
              phoneE164: '+251933445566',
              language: 'om',
              notes: 'Regular customer for styling.',
              noShowCount: 0,
              requireApproval: false,
              blocked: false,
              createdAt: new Date(now.getTime() - 30 * 86400 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'cust-4',
              shopId: 'shop-1',
              name: 'Spam / Bad Actor',
              phoneE164: '+251944556677',
              language: 'en',
              notes: 'Repeated fake bookings denying slots to real customers.',
              noShowCount: 3,
              requireApproval: true,
              blocked: true,
              createdAt: new Date(now.getTime() - 10 * 86400 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
          await db.customers.bulkPut(demo);
          allCusts = demo;
        }

        setCustomers(allCusts);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  // Filter customers by search term
  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phoneE164.includes(q);
  });

  // Get customer booking history
  const customerBookings = selectedCustomer
    ? bookings.filter(
        (b) =>
          b.customerId === selectedCustomer.id ||
          b.customerPhone === selectedCustomer.phoneE164
      )
    : [];

  const handleSelectCustomer = (c: LocalCustomer) => {
    setSelectedCustomer(c);
    setEditingNotes(c.notes || '');
  };

  const handleSaveNotes = async () => {
    if (!selectedCustomer) return;
    try {
      const updated = {
        ...selectedCustomer,
        notes: editingNotes,
        updatedAt: new Date().toISOString(),
      };
      await db.customers.put(updated);
      setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedCustomer(updated);
      showToast({ message: 'Notes saved' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleToggleRequireApproval = async () => {
    if (!selectedCustomer || role !== 'owner') return;
    const newVal = !selectedCustomer.requireApproval;
    try {
      const updated = {
        ...selectedCustomer,
        requireApproval: newVal,
        updatedAt: new Date().toISOString(),
      };
      await db.customers.put(updated);
      setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedCustomer(updated);
      // Synchronize with server RPC
      void supabase.rpc('set_customer_require_approval', {
        p_shop: selectedCustomer.shopId,
        p_customer: selectedCustomer.id,
        p_require_approval: newVal,
      });
      showToast({ message: newVal ? 'Approval required for this customer' : 'Instant booking restored' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleToggleBlocked = async () => {
    if (!selectedCustomer || role !== 'owner') return;
    const newVal = !selectedCustomer.blocked;
    try {
      const updated = {
        ...selectedCustomer,
        blocked: newVal,
        updatedAt: new Date().toISOString(),
      };
      await db.customers.put(updated);
      setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedCustomer(updated);
      // Synchronize with server RPC
      void supabase.rpc('set_customer_blocked', {
        p_shop: selectedCustomer.shopId,
        p_customer: selectedCustomer.id,
        p_blocked: newVal,
      });
      showToast({ message: newVal ? 'Phone number blocked' : 'Phone number unblocked' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleExportCsv = () => {
    if (!selectedCustomer) return;
    try {
      const headers = ['Customer Name', 'Phone', 'Language', 'No Shows', 'Require Approval', 'Blocked', 'Notes', 'Created At'];
      const rows = [
        [
          selectedCustomer.name,
          selectedCustomer.phoneE164,
          selectedCustomer.language,
          selectedCustomer.noShowCount,
          selectedCustomer.requireApproval,
          selectedCustomer.blocked,
          selectedCustomer.notes || '',
          selectedCustomer.createdAt,
        ],
      ];

      // Add booking history lines
      headers.push('Booking ID', 'Starts At', 'Ends At', 'Status', 'Price');
      const csvContent = generateCsv(
        ['Field', 'Value'],
        [
          ['Name', selectedCustomer.name],
          ['Phone', selectedCustomer.phoneE164],
          ['Language', selectedCustomer.language],
          ['No Shows', selectedCustomer.noShowCount],
          ['Approval Required', selectedCustomer.requireApproval ? 'Yes' : 'No'],
          ['Blocked', selectedCustomer.blocked ? 'Yes' : 'No'],
          ['Notes', selectedCustomer.notes || ''],
          ['Member Since', selectedCustomer.createdAt],
          ['--- Booking History ---', '---'],
          ...customerBookings.map((b) => [
            b.startsAt,
            `Status: ${b.status} | Price: ${b.price || 0} ETB | Note: ${b.note || 'None'}`,
          ]),
        ]
      );

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `customer-${selectedCustomer.id.slice(0, 8)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Audit export via RPC
      void supabase.rpc('export_customer', {
        p_shop: selectedCustomer.shopId,
        p_customer: selectedCustomer.id,
      });

      showToast({ message: 'Customer data exported (CSV)' });
    } catch {
      showToast({ message: common.error });
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer || role !== 'owner') return;
    try {
      await db.customers.delete(selectedCustomer.id);
      setCustomers((prev) => prev.filter((item) => item.id !== selectedCustomer.id));
      setShowDeleteModal(false);
      setSelectedCustomer(null);

      // Call server RPC: deletes contacts, unlinks bookings, audits
      void supabase.rpc('delete_customer', {
        p_shop: selectedCustomer.shopId,
        p_customer: selectedCustomer.id,
      });

      showToast({ message: 'Customer deleted. Booking slots preserved.' });
    } catch {
      showToast({ message: common.error });
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.title}</h1>
          <p className="text-xs text-slate">{customers.length} registered customers</p>
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
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={catalog.searchPlaceholder}
            className="w-full px-3 py-2 pl-9 bg-surface border border-line rounded-control text-sm text-ink placeholder:text-slate focus:outline-none focus:border-plum"
            aria-label="Search customers"
          />
          <svg className="w-4 h-4 text-slate absolute left-3 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate hover:text-ink"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Customer List */}
        {loading ? (
          <RowSkeleton count={4} />
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-line rounded-card bg-surface/50 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-paper border border-line flex items-center justify-center text-slate">
              <svg className="w-5 h-5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate">{catalog.empty}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCustomers.map((cust) => {
              const custBookingsCount = bookings.filter(
                (b) => b.customerId === cust.id || b.customerPhone === cust.phoneE164
              ).length;

              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => handleSelectCustomer(cust)}
                  className={`w-full text-left bg-surface border rounded-card p-3 transition-all hover:border-slate/40 active:scale-[0.99] ${
                    cust.blocked
                      ? 'border-st-noshow/40 bg-st-noshow/5'
                      : cust.noShowCount >= 2
                      ? 'border-amber-500/40'
                      : 'border-line'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-sm text-ink">{cust.name}</span>
                      <p className="text-xs text-slate font-mono">{cust.phoneE164}</p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {cust.blocked && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-st-noshow text-white">
                          {catalog.statusBlocked}
                        </span>
                      )}

                      {cust.requireApproval && !cust.blocked && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900">
                          {catalog.statusApproval}
                        </span>
                      )}

                      {cust.noShowCount >= 2 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-st-noshow/15 text-st-noshow">
                          {cust.noShowCount} {catalog.noShows}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-line flex justify-between text-[11px] text-slate">
                    <span>{custBookingsCount} appointment{custBookingsCount !== 1 ? 's' : ''}</span>
                    <span>Lang: {cust.language.toUpperCase()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
        >
          <div className="bg-surface border border-line w-full max-w-md rounded-t-card sm:rounded-card max-h-[90vh] flex flex-col shadow-md">
            {/* Header */}
            <div className="p-4 border-b border-line flex justify-between items-center bg-surface sticky top-0 z-10 rounded-t-card">
              <div>
                <h2 className="font-heading text-lg font-bold text-ink">{selectedCustomer.name}</h2>
                <a
                  href={`tel:${selectedCustomer.phoneE164}`}
                  className="text-xs text-plum font-mono hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {selectedCustomer.phoneE164} (Tap to Call)
                </a>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-8 h-8 rounded-full border border-line text-slate hover:text-ink flex items-center justify-center text-sm"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* No-show Warning Banner */}
              {selectedCustomer.noShowCount >= 2 && (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-card p-3 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <svg className="w-4 h-4 text-amber-800 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <span>Repeat No-Show Customer ({selectedCustomer.noShowCount} missed)</span>
                  </div>
                  <p className="text-amber-900/80 leading-relaxed">
                    {catalog.repeatNoShowWarning.replace('{count}', String(selectedCustomer.noShowCount))}
                  </p>
                </div>
              )}

              {/* Blocked Notice */}
              {selectedCustomer.blocked && (
                <div className="bg-st-noshow/10 border border-st-noshow/30 rounded-card p-3 text-st-noshow font-medium flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  This phone number is blocked from booking online.
                </div>
              )}

              {/* Private Staff Notes */}
              <div className="space-y-1.5">
                <label className="font-semibold text-ink block">{catalog.notes}</label>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  placeholder={catalog.notesPlaceholder}
                  rows={3}
                  maxLength={500}
                  className="w-full p-2 bg-paper border border-line rounded text-xs text-ink placeholder:text-slate focus:outline-none focus:border-plum"
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="px-3 py-1 bg-plum text-on-plum font-semibold rounded text-xs hover:opacity-90 active:scale-95 transition-all"
                >
                  {catalog.saveNotes}
                </button>
              </div>

              {/* Owner Access Controls */}
              {role === 'owner' && (
                <div className="p-3 bg-paper border border-line rounded-card space-y-3">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-slate block">
                    Owner Controls
                  </span>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink">{catalog.requireApproval}</p>
                      <p className="text-[11px] text-slate">{catalog.requireApprovalDesc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedCustomer.requireApproval}
                      onClick={handleToggleRequireApproval}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        selectedCustomer.requireApproval ? 'bg-plum' : 'bg-line'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          selectedCustomer.requireApproval ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line">
                    <div>
                      <p className="font-semibold text-ink">{catalog.blockPhone}</p>
                      <p className="text-[11px] text-slate">{catalog.blockPhoneDesc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedCustomer.blocked}
                      onClick={handleToggleBlocked}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        selectedCustomer.blocked ? 'bg-st-noshow' : 'bg-line'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          selectedCustomer.blocked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Booking History */}
              <div className="space-y-2">
                <h3 className="font-semibold text-ink">{catalog.bookingHistory} ({customerBookings.length})</h3>
                {customerBookings.length === 0 ? (
                  <p className="text-slate italic">{catalog.noBookings}</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {customerBookings.map((b) => (
                      <div
                        key={b.id}
                        className="p-2 border border-line rounded bg-paper flex justify-between items-center text-[11px]"
                      >
                        <div>
                          <p className="font-medium text-ink">
                            {formatDateInTz(new Date(b.startsAt), 'Africa/Addis_Ababa')}
                          </p>
                          <p className="text-slate font-mono">
                            {formatTimeWithPartOfDay(new Date(b.startsAt), 'Africa/Addis_Ababa')}
                          </p>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded font-medium ${
                            b.status === 'confirmed'
                              ? 'bg-st-confirmed/15 text-st-confirmed'
                              : b.status === 'completed'
                              ? 'bg-st-done/15 text-st-done'
                              : b.status === 'no_show'
                              ? 'bg-st-noshow/15 text-st-noshow font-bold'
                              : 'bg-line text-slate'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Export & Delete Actions (Owner Only) */}
              {role === 'owner' && (
                <div className="pt-2 border-t border-line flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="w-full py-2 bg-surface border border-line text-ink font-semibold rounded-control hover:bg-line active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {catalog.exportData}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full py-2 bg-st-noshow/10 text-st-noshow font-semibold rounded-control hover:bg-st-noshow/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {catalog.deleteCustomer}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-surface border border-line max-w-sm w-full rounded-card p-5 space-y-3 shadow-md">
            <h3 className="font-heading text-base font-bold text-ink text-st-noshow">
              {catalog.deleteConfirmTitle}
            </h3>
            <p className="text-xs text-slate leading-relaxed">
              {catalog.deleteConfirmDesc}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 bg-surface border border-line text-slate hover:text-ink font-semibold text-xs rounded-control active:scale-95 transition-all"
              >
                {common.cancel}
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                className="flex-1 py-2 bg-st-noshow text-white font-semibold text-xs rounded-control hover:opacity-90 active:scale-95 transition-all"
              >
                {common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav role={role} currentPath="/customers" />
    </div>
  );
}
