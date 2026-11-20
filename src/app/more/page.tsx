'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BottomNav, type MemberRole } from '../../components/bottom-nav.tsx';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { t } from '../../i18n/index.ts';

export default function MorePage() {
  const [role, setRole] = useState<MemberRole>('owner');
  const catalog = t().nav;
  const assistantCatalog = t().assistant;

  const links = [
    {
      title: 'Customers & CRM',
      desc: 'Customer book, notes, no-show counts, and approvals.',
      href: '/customers',
      icon: '👥',
      roles: ['owner', 'reception'],
    },
    {
      title: 'Reports & Analytics',
      desc: 'Revenues, popular services, utilization, and CSV exports.',
      href: '/reports',
      icon: '📈',
      roles: ['owner', 'provider'],
    },
    {
      title: 'Services & Providers',
      desc: 'Configure business services, provider schedules, and working hours.',
      href: '/services',
      icon: '✂️',
      roles: ['owner', 'reception', 'provider'],
    },
    {
      title: assistantCatalog.memoryTitle,
      desc: assistantCatalog.memorySubtitle,
      href: '/memory',
      icon: '🧠',
      roles: ['owner', 'reception'],
    },
  ];

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between pb-20 bg-paper text-ink">
      <header className="p-4 border-b border-line bg-surface/90 sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">{catalog.more}</h1>
          <p className="text-xs text-slate">Business settings and management</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="text-xs bg-paper border border-line rounded px-1.5 py-1 text-slate font-medium"
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
              className="p-3.5 bg-surface border border-line rounded-card flex items-center justify-between hover:border-plum/40 hover:bg-plum/5 active:scale-[0.99] transition-all shadow-xs"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2 bg-paper rounded-control border border-line">
                  {item.icon}
                </span>
                <div>
                  <h2 className="font-heading text-sm font-semibold text-ink">{item.title}</h2>
                  <p className="text-xs text-slate">{item.desc}</p>
                </div>
              </div>
              <span className="text-slate text-sm font-bold">→</span>
            </Link>
          ))}
        </div>

        {/* Business Link Pill */}
        <div className="mt-6 p-4 bg-plum/5 border border-plum/20 rounded-card space-y-2 text-xs">
          <span className="font-bold text-plum uppercase tracking-wider block text-[10px]">
            Public Booking Page
          </span>
          <p className="text-slate">
            Customers book online at{' '}
            <code className="text-ink font-semibold">/b/addis-barber</code>.
          </p>
          <div className="pt-1 flex gap-2">
            <Link
              href="/booking"
              className="px-3 py-1.5 bg-plum text-on-plum font-semibold rounded-control text-xs"
            >
              Open Public Page
            </Link>
          </div>
        </div>
      </main>

      <BottomNav role={role} currentPath="/more" />
    </div>
  );
}
