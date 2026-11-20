import { useState, useEffect } from 'react';
import type { Catalog } from './types.ts';
import { en } from './catalogs/en.ts';
import { am } from './catalogs/am.ts';
import { om } from './catalogs/om.ts';

export type Locale = 'en' | 'am' | 'om';

export const catalogs: Record<Locale, Catalog> = {
  en,
  am,
  om,
};

let currentLocale: Locale = 'en';
type LocaleListener = (locale: Locale) => void;
const listeners = new Set<LocaleListener>();

export function getLocale(): Locale {
  return currentLocale;
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLocale(locale: Locale): void {
  if (catalogs[locale]) {
    currentLocale = locale;
    if (typeof window !== 'undefined') {
      localStorage.setItem('book_desk_locale', locale);
      window.dispatchEvent(new CustomEvent('book_desk_locale_change', { detail: locale }));
    }
    listeners.forEach((fn) => fn(locale));
  }
}

export function t(): Catalog {
  return catalogs[currentLocale];
}

export function initLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('book_desk_locale') as Locale | null;
    if (saved && catalogs[saved]) {
      currentLocale = saved;
      return saved;
    }
  }
  return currentLocale;
}

/**
 * Reactive React hook for i18n that re-renders components immediately when language changes.
 */
export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  useEffect(() => {
    // Sync with localStorage on mount
    const initial = initLocale();
    setLocaleState(initial);

    // Subscribe to immediate changes without page reload
    const unsubscribe = subscribeLocale((newLoc) => {
      setLocaleState(newLoc);
    });

    const handleWindowChange = (e: Event) => {
      const customEvent = e as CustomEvent<Locale>;
      if (customEvent.detail && catalogs[customEvent.detail]) {
        setLocaleState(customEvent.detail);
      }
    };
    window.addEventListener('book_desk_locale_change', handleWindowChange);

    return () => {
      unsubscribe();
      window.removeEventListener('book_desk_locale_change', handleWindowChange);
    };
  }, []);

  return {
    locale,
    setLocale,
    t: catalogs[locale],
  };
}
