'use client';

import React from 'react';
import { useI18n } from '../i18n/index.ts';

export type MemberRole = 'owner' | 'reception' | 'provider';

interface BottomNavProps {
  currentPath?: string;
  role?: MemberRole;
  remindersBadge?: number;
  todayBadge?: number;
}

export function BottomNav({ currentPath = '/', role = 'owner', remindersBadge = 0, todayBadge = 0 }: BottomNavProps) {
  const { t } = useI18n();
  const catalog = t.nav;

  const renderIcon = (type: string) => {
    switch (type) {
      case 'today':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'calendar':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'new':
        return (
          <svg className="w-6 h-6 text-on-plum" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        );
      case 'reminders':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        );
      case 'more':
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        );
    }
  };

  const items = role === 'provider' ? [
    { label: catalog.myDay, href: '/', iconType: 'today', badge: todayBadge },
    { label: catalog.myCalendar, href: '/calendar', iconType: 'calendar' },
    { label: catalog.newBooking, href: '/new', isCenter: true, iconType: 'new' },
    { label: catalog.more, href: '/more', iconType: 'more' },
  ] : [
    { label: catalog.today, href: '/', iconType: 'today', badge: todayBadge },
    { label: catalog.calendar, href: '/calendar', iconType: 'calendar' },
    { label: catalog.newBooking, href: '/new', isCenter: true, iconType: 'new' },
    { label: catalog.reminders, href: '/reminders', iconType: 'reminders', badge: remindersBadge },
    { label: catalog.more, href: '/more', iconType: 'more' },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line"
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
                <div className="w-12 h-12 rounded-full bg-plum text-on-plum flex items-center justify-center shadow-sm active:scale-95 transition-transform">
                  {renderIcon(item.iconType)}
                </div>
                <span className="text-[11px] font-medium text-slate mt-1">{item.label}</span>
              </a>
            );
          }

          return (
            <a
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center w-14 py-1 transition-colors ${
                isActive ? 'text-plum font-semibold' : 'text-slate hover:text-ink'
              }`}
            >
              <div className="relative flex items-center justify-center h-6">
                {renderIcon(item.iconType)}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 bg-st-noshow text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
