'use client';

import React, { useState, useEffect } from 'react';
import { t, initLocale, type Locale } from '../../i18n/index.ts';
import { LanguageSwitch } from '../../components/language-switch.tsx';
import { translateError } from '../../domain/errors.ts';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [locale, setLocalLocale] = useState<Locale>('en');

  useEffect(() => {
    setLocalLocale(initLocale());
  }, []);

  const catalog = t().auth;
  const common = t().common;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage(catalog.emailLabel + ' and password required');
      return;
    }

    if (password.length < 10) {
      setErrorMessage(catalog.passwordLabel);
      return;
    }

    setLoading(true);
    try {
      // In production, calls supabase.auth.signInWithPassword or signUp
      // Simulate brief optimistic feedback
      setTimeout(() => {
        setLoading(false);
        window.location.href = isSignUp ? '/onboarding' : '/';
      }, 500);
    } catch (err) {
      setLoading(false);
      setErrorMessage(translateError(err));
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between p-4 bg-paper text-ink">
      <header className="flex justify-between items-center py-2">
        <div>
          <span className="font-heading font-semibold text-xl text-ink">Book Desk</span>
        </div>
        <LanguageSwitch onLocaleChange={(l) => setLocalLocale(l)} />
      </header>

      <main className="my-auto py-8">
        <div className="bg-surface border border-line rounded-card p-6 shadow-sm">
          <h1 className="font-heading text-2xl font-semibold mb-1">
            {isSignUp ? catalog.signUp : catalog.signIn}
          </h1>
          <p className="text-slate text-sm mb-6">
            {isSignUp ? 'Create your business account to get started.' : 'Sign in to access your business calendar.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="text-xs font-semibold text-slate block mb-1">
                  {catalog.fullNameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-12 px-3 rounded-control border border-line bg-paper text-ink text-base focus:outline-none focus:border-plum"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate block mb-1">
                {catalog.emailLabel}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-3 rounded-control border border-line bg-paper text-ink text-base focus:outline-none focus:border-plum"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate block mb-1">
                {catalog.passwordLabel}
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-3 rounded-control border border-line bg-paper text-ink text-base focus:outline-none focus:border-plum"
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
              {loading ? common.loading : isSignUp ? catalog.signUpButton : catalog.signInButton}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-line text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMessage('');
              }}
              className="text-xs font-semibold text-slate hover:text-plum transition-colors"
            >
              {isSignUp ? catalog.haveAccount : catalog.needAccount}
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <a href="/join" className="text-xs font-medium text-slate hover:underline">
            Have an invite code? Join team
          </a>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate">
        Book Desk • Appointment Booking
      </footer>
    </div>
  );
}
