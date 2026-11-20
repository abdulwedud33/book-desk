'use client';

import React, { useState } from 'react';
import { BottomNav, type MemberRole } from '../components/bottom-nav.tsx';
import { ToastProvider, useToast } from '../components/toast.tsx';
import { Banner } from '../components/banner.tsx';
import { LanguageSwitch } from '../components/language-switch.tsx';
import { CardSkeleton } from '../components/skeleton.tsx';
import { t } from '../i18n/index.ts';

function TodayContent() {
  const [role, setRole] = useState<MemberRole>('owner');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const catalog = t().common;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Book Desk</h1>
          <p className="text-xs text-slate">Addis Barber Shop</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick role toggle for previewing role-aware layout */}
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
        {/* Banner area */}
        <Banner
          type="pending"
          message="1 appointment waiting for confirmation"
          actionLabel="Review"
          onAction={() => showToast({ message: 'Opening pending requests...' })}
        />

        {/* Next Up card */}
        <section className="bg-surface border border-line rounded-card p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-slate uppercase tracking-wider">Next Appointment</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-st-confirmed/15 text-st-confirmed">
              Confirmed
            </span>
          </div>
          <h2 className="font-heading text-lg font-semibold">Abel Tesfaye</h2>
          <p className="text-sm text-slate">Haircut & Beard • Samson</p>
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-line text-xs">
            <span className="font-semibold text-ink">3:30 in the afternoon</span>
            <button
              type="button"
              onClick={() => showToast({ message: 'Customer marked as arrived' })}
              className="px-3 py-1.5 bg-plum text-on-plum rounded-control font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
              Mark Arrived
            </button>
          </div>
        </section>

        {/* Today's timeline */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-heading text-base font-semibold">Today's Schedule</h3>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 800);
              }}
              className="text-xs text-plum font-semibold hover:underline"
            >
              Simulate Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-surface border border-line rounded-card p-3 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-sm">4:15 in the afternoon</span>
                  <p className="text-xs text-slate">Dawit M. • Skin Fade</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-st-active/15 text-st-active font-medium">
                  In Service
                </span>
              </div>

              {/* Quiet Free Gap */}
              <div className="border border-dashed border-line rounded-card p-3 text-center text-xs text-slate hover:border-plum hover:text-plum cursor-pointer transition-colors">
                + Free slot at 5:00 in the afternoon (Tap to add Walk-in)
              </div>
            </div>
          )}
        </section>
      </main>

      <BottomNav currentPath="/" role={role} />
    </div>
  );
}

export default function HomePage() {
  return (
    <ToastProvider>
      <TodayContent />
    </ToastProvider>
  );
}
