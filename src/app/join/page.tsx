'use client';

import React, { useState, useEffect } from 'react';
import { t, initLocale, type Locale } from '../../i18n/index.ts';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { translateError } from '../../domain/errors.ts';

export default function JoinPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [locale, setLocalLocale] = useState<Locale>('en');

  useEffect(() => {
    setLocalLocale(initLocale());
  }, []);

  const catalog = t().join;
  const common = t().common;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!code.trim()) {
      setErrorMessage(catalog.codeLabel + ' is required');
      return;
    }

    setLoading(true);
    try {
      // In production, calls supabase.rpc('accept_invite', { p_code: code })
      setTimeout(() => {
        setLoading(false);
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }, 400);
    } catch (err) {
      setLoading(false);
      setErrorMessage(translateError(err));
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between p-4 bg-paper text-ink">
      <header className="flex justify-between items-center py-2">
        <a href="/auth" className="font-heading font-semibold text-xl text-ink">
          Book Desk
        </a>
        <LanguageSwitch onLocaleChange={(l) => setLocalLocale(l)} />
      </header>

      <main className="my-auto py-8">
        <div className="bg-surface border border-line rounded-card p-6 shadow-sm">
          <h1 className="font-heading text-2xl font-semibold mb-1">
            {catalog.title}
          </h1>
          <p className="text-slate text-sm mb-6">
            {catalog.subtitle}
          </p>

          {success ? (
            <div className="p-4 bg-st-confirmed/15 border border-st-confirmed/30 rounded-control text-center">
              <p className="text-st-confirmed font-semibold text-sm">
                ✓ {catalog.successMessage}
              </p>
              <p className="text-xs text-slate mt-1">Redirecting to calendar...</p>
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate block mb-1">
                  {catalog.codeLabel}
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={catalog.codePlaceholder}
                  className="w-full h-12 px-3 rounded-control border border-line bg-paper text-ink font-mono text-base focus:outline-none focus:border-plum"
                />
              </div>

              {/* Reserved Error Message Space */}
              <div className="min-h-5 flex items-center">
                {errorMessage && (
                  <p className="text-xs font-medium text-st-noshow" role="alert">
                    {errorMessage}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-13 bg-plum text-on-plum rounded-control font-semibold text-base active:opacity-90 transition-opacity"
              >
                {loading ? common.loading : catalog.joinButton}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-center">
          <a href="/auth" className="text-xs font-medium text-slate hover:underline">
            ← Back to Sign In
          </a>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate">
        Book Desk • Single-use invite code
      </footer>
    </div>
  );
}
