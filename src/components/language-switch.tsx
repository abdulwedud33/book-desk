'use client';

import React, { useState, useEffect } from 'react';
import { getLocale, setLocale, type Locale } from '../i18n/index.ts';

interface LanguageSwitchProps {
  className?: string;
  onLocaleChange?: (locale: Locale) => void;
}

export function LanguageSwitch({ className = '', onLocaleChange }: LanguageSwitchProps) {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');

  useEffect(() => {
    setActiveLocale(getLocale());
  }, []);

  const handleSelect = (locale: Locale) => {
    setLocale(locale);
    setActiveLocale(locale);
    onLocaleChange?.(locale);
  };

  return (
    <div className={`inline-flex rounded-control border border-line p-0.5 bg-surface ${className}`} role="group" aria-label="Language Selector">
      <button
        type="button"
        onClick={() => handleSelect('en')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-control transition-colors ${
          activeLocale === 'en'
            ? 'bg-plum text-on-plum'
            : 'text-slate hover:text-ink'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleSelect('am')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-control transition-colors ${
          activeLocale === 'am'
            ? 'bg-plum text-on-plum'
            : 'text-slate hover:text-ink'
        }`}
      >
        አማ
      </button>
      <button
        type="button"
        onClick={() => handleSelect('om')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-control transition-colors ${
          activeLocale === 'om'
            ? 'bg-plum text-on-plum'
            : 'text-slate hover:text-ink'
        }`}
      >
        ORO
      </button>
    </div>
  );
}
