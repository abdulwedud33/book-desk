'use client';

import React from 'react';
import { useI18n, type Locale } from '../i18n/index.ts';

interface LanguageSwitchProps {
  className?: string;
  onLocaleChange?: (locale: Locale) => void;
}

export function LanguageSwitch({ className = '', onLocaleChange }: LanguageSwitchProps) {
  const { locale, setLocale } = useI18n();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value as Locale;
    setLocale(nextLocale);
    onLocaleChange?.(nextLocale);
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={locale}
        onChange={handleChange}
        aria-label="Language"
        className="appearance-none bg-surface text-ink border border-line rounded-control text-xs font-medium py-1.5 pl-2.5 pr-7 focus:outline-none focus:ring-1 focus:ring-plum transition-colors cursor-pointer"
      >
        <option value="en">English (EN)</option>
        <option value="am">አማርኛ (AM)</option>
        <option value="om">Afaan Oromoo (OM)</option>
      </select>
      <svg
        className="w-3.5 h-3.5 text-slate absolute right-2 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
