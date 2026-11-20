'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { useI18n } from '../../i18n/index.ts';

export default function MorePage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const { t } = useI18n();
  const catalog = t.nav;
  const assistantCatalog = t.assistant;

  const links = [
    {
      title: 'Customers & CRM',
      desc: 'Customer book, notes, no-show counts, and approvals.',
      href: '/customers',
      icon: (
        <svg className="w-5 h-5 text-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      roles: ['owner', 'reception'],
    },
    {
      title: 'Reports & Analytics',
      desc: 'Revenues, popular services, utilization, and CSV exports.',
      href: '/reports',
      icon: (
        <svg className="w-5 h-5 text-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      roles: ['owner', 'provider'],
    },
    {
      title: 'Services & Providers',
      desc: 'Configure business services, provider schedules, and working hours.',
      href: '/services',
      icon: (
        <svg className="w-5 h-5 text-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879a3 3 0 11-4.242-4.242L10.757 8.5m3.364 5.621L8.5 19.757a3 3 0 11-4.242-4.242L7.121 12.636" />
        </svg>
      ),
      roles: ['owner', 'reception', 'provider'],
    },
    {
      title: assistantCatalog.memoryTitle,
      desc: assistantCatalog.memorySubtitle,
      href: '/memory',
      icon: (
        <svg className="w-5 h-5 text-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      roles: ['owner', 'reception'],
    },
  ];

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.more}</h1>
          <p className="text-xs text-slate">Business settings and management</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="text-xs bg-paper border border-line rounded-control px-2 py-1.5 text-slate font-medium"
            aria-label="Role Switcher"
          >
            <option value="owner">Role: Owner</option>
            <option value="reception">Role: Reception</option>
            <option value="provider">Role: Provider</option>
          </select>
          <LanguageSwitch />
        </div>
      </header>

      <main className="p-4 space-y-3 flex-1">
        <div className="space-y-2">
          {visibleLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="p-3.5 bg-surface border border-line rounded-card flex items-center justify-between hover:border-plum/40 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-control bg-paper border border-line flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h2 className="font-heading text-sm font-semibold text-ink">{item.title}</h2>
                  <p className="text-xs text-slate">{item.desc}</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {/* Business Link Pill */}
        <div className="mt-6 p-4 bg-surface border border-line rounded-card space-y-2 text-xs">
          <span className="font-semibold text-plum uppercase tracking-wider block text-[10px]">
            Public Booking Page
          </span>
          <p className="text-slate">
            Customers book online at{' '}
            <code className="text-ink font-semibold">/b/addis-barber</code>.
          </p>
          <div className="pt-1 flex gap-2">
            <Link
              href="/b/addis-barber"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper hover:bg-line border border-line rounded-control text-ink font-medium transition-colors"
            >
              <span>Open booking page</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
        </div>
      </main>

      <BottomNav currentPath="/more" role={role} />
    </div>
  );
}
