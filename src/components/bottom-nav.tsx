'use client';

import React from 'react';
import Link from 'next/navigation';
import { t } from '../i18n/index.ts';

export type MemberRole = 'owner' | 'reception' | 'provider';

interface BottomNavProps {
  currentPath?: string;
  role?: MemberRole;
}

export function BottomNav({ currentPath = '/', role = 'owner' }: BottomNavProps) {
  const catalog = t().nav;

  const items = role === 'provider' ? [
    { label: catalog.myDay, href: '/', icon: '🗓️' },
    { label: catalog.myCalendar, href: '/calendar', icon: '📅' },
    { label: catalog.newBooking, href: '/new', isCenter: true, icon: '➕' },
    { label: catalog.more, href: '/more', icon: '⚙️' },
  ] : [
    { label: catalog.today, href: '/', icon: '🗓️' },
    { label: catalog.calendar, href: '/calendar', icon: '📅' },
    { label: catalog.newBooking, href: '/new', isCenter: true, icon: '➕' },
    { label: catalog.reminders, href: '/reminders', icon: '🔔' },
    { label: catalog.more, href: '/more', icon: '⚙️' },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line shadow-sm"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const isActive = currentPath === item.href;
          if (item.isCenter) {
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center -mt-5"
                aria-label={item.label}
              >
                <div className="w-12 h-12 rounded-full bg-plum text-on-plum flex items-center justify-center shadow-md active:scale-95 transition-transform text-lg">
                  {item.icon}
                </div>
                <span className="text-[11px] font-medium text-slate mt-0.5">{item.label}</span>
              </a>
            );
          }

          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-14 py-1 transition-colors ${
                isActive ? 'text-plum font-semibold' : 'text-slate hover:text-ink'
              }`}
            >
              <span className="text-base" aria-hidden="true">{item.icon}</span>
              <span className="text-[11px] mt-0.5">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
