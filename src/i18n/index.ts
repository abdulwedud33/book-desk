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

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (catalogs[locale]) {
    currentLocale = locale;
    if (typeof window !== 'undefined') {
      localStorage.setItem('book_desk_locale', locale);
    }
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
  return 'en';
}
