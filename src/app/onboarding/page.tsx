'use client';

import React, { useState, useEffect, useId } from 'react';
import { t, initLocale, type Locale } from '../../i18n/index.ts';
import { LanguageSwitch } from '../../components/language-switch.tsx';

type BusinessType = 'salon' | 'clinic' | 'tutor' | 'garage' | 'other';

interface FormState {
  businessType: BusinessType;
  businessName: string;
  slug: string;
  serviceName: string;
  durationMin: number;
}

const TYPE_DEFAULTS: Record<BusinessType, { service: string; duration: number }> = {
  salon: { service: 'Haircut & Style', duration: 30 },
  clinic: { service: 'General Consultation', duration: 20 },
  tutor: { service: '1-on-1 Tutoring Session', duration: 45 },
  garage: { service: 'Vehicle Diagnostic', duration: 60 },
  other: { service: 'Standard Appointment', duration: 30 },
};

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [locale, setLocalLocale] = useState<Locale>('en');
  const [formData, setFormData] = useState<FormState>({
    businessType: 'salon',
    businessName: '',
    slug: '',
    serviceName: 'Haircut & Style',
    durationMin: 30,
  });

  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLocalLocale(initLocale());
  }, []);

  const catalog = t().onboarding;
  const common = t().common;

  // Live slug generation and validation
  const handleNameChange = (name: string) => {
    const generatedSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setFormData((prev) => ({
      ...prev,
      businessName: name,
      slug: prev.slug === '' || prev.slug === formData.slug ? generatedSlug : prev.slug,
    }));

    if (generatedSlug.length >= 3) {
      validateSlug(generatedSlug);
    } else {
      setSlugStatus('idle');
    }
  };

  const validateSlug = (slugToCheck: string) => {
    setSlugStatus('checking');
    // Reserved slug list check
    const reserved = ['admin', 'api', 'app', 'auth', 'b', 'm', 'book', 'login', 'www', 'support'];
    const validPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slugToCheck);

    setTimeout(() => {
      if (validPattern && !reserved.includes(slugToCheck)) {
        setSlugStatus('available');
      } else {
        setSlugStatus('unavailable');
      }
    }, 150);
  };

  const handleTypeSelect = (type: BusinessType) => {
    const defaults = TYPE_DEFAULTS[type];
    setFormData((prev) => ({
      ...prev,
      businessType: type,
      serviceName: defaults.service,
      durationMin: defaults.duration,
    }));
  };

  const handleNext = () => {
    setErrorMessage('');
    if (step === 1) {
      if (!formData.businessName.trim()) {
        setErrorMessage('Please enter your business name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (slugStatus === 'unavailable' || !formData.slug) {
        setErrorMessage(catalog.slugUnavailable);
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    setErrorMessage('');
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/b/${formData.slug || 'my-shop'}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      data-testid="onboarding-container"
      className="max-w-md mx-auto min-h-screen flex flex-col justify-between bg-paper text-ink"
    >
      {/* 1. FIXED TOP REGION: Header, Language Switch, and Stationary Progress Bar */}
      <header
        data-testid="fixed-header-region"
        className="sticky top-0 z-30 bg-paper/95 backdrop-blur-sm border-b border-line px-4 pt-3 pb-3 shrink-0"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="font-heading font-semibold text-lg text-ink">Book Desk</span>
            <span className="text-xs text-slate ml-2">Setup</span>
          </div>
          <LanguageSwitch onLocaleChange={(l) => setLocalLocale(l)} />
        </div>

        {/* Goal Gradient Progress Area */}
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate mb-1">
            <span>Step {step} of 3</span>
            <span>{step === 1 ? '33%' : step === 2 ? '66%' : '100%'}</span>
          </div>
          <div className="w-full bg-line rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
            <div
              className="bg-plum h-full transition-all duration-200"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* 2. SCROLLABLE CONTENT REGION with Reserved Validation Height */}
      <main
        data-testid="scrollable-content-region"
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        {/* Step 1: Your Business */}
        {step === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h1 className="font-heading text-xl text-ink font-semibold">{catalog.step1Title}</h1>
              <p className="text-sm text-slate mt-1">{catalog.step1Subtitle}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate block">{catalog.businessTypeLabel}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['salon', 'clinic', 'tutor', 'garage'] as BusinessType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeSelect(type)}
                    className={`h-12 px-3 flex items-center justify-center rounded-control border text-sm font-medium transition-all ${
                      formData.businessType === type
                        ? 'border-plum bg-plum/10 text-plum font-semibold'
                        : 'border-line bg-surface text-ink hover:border-slate'
                    }`}
                  >
                    {type === 'salon' && 'Salon / Barber'}
                    {type === 'clinic' && 'Clinic'}
                    {type === 'tutor' && 'Tutor'}
                    {type === 'garage' && 'Garage'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="businessNameInput" className="text-xs font-semibold text-slate block">
                {catalog.businessNameLabel}
              </label>
              <input
                id="businessNameInput"
                type="text"
                value={formData.businessName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={catalog.businessNamePlaceholder}
                className="w-full h-12 px-3 rounded-control border border-line bg-surface text-ink text-base focus:outline-none focus:border-plum"
              />
            </div>
          </div>
        )}

        {/* Step 2: Your Link & First Service */}
        {step === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h1 className="font-heading text-xl text-ink font-semibold">{catalog.step2Title}</h1>
              <p className="text-sm text-slate mt-1">{catalog.step2Subtitle}</p>
            </div>

            {/* Slug input with live feedback */}
            <div className="space-y-1.5">
              <label htmlFor="slugInput" className="text-xs font-semibold text-slate block">
                {catalog.slugLabel}
              </label>
              <div className="flex items-center rounded-control border border-line bg-surface overflow-hidden focus-within:border-plum">
                <span className="px-3 text-slate text-sm bg-line/20 select-none">/b/</span>
                <input
                  id="slugInput"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setFormData((prev) => ({ ...prev, slug: val }));
                    validateSlug(val);
                  }}
                  className="flex-1 h-12 px-2 bg-transparent text-ink text-base focus:outline-none"
                />
              </div>

              {/* Reserved status indicator space (prevents layout jump) */}
              <div className="h-5 flex items-center text-xs">
                {slugStatus === 'checking' && <span className="text-slate">Checking availability...</span>}
                {slugStatus === 'available' && (
                  <span className="text-st-confirmed font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {catalog.slugAvailable}
                  </span>
                )}
                {slugStatus === 'unavailable' && <span className="text-st-noshow font-medium">{catalog.slugUnavailable}</span>}
              </div>
            </div>

            {/* Service & Duration Template */}
            <div className="p-4 bg-surface rounded-card border border-line space-y-3">
              <div>
                <label htmlFor="serviceInput" className="text-xs font-semibold text-slate block mb-1">
                  {catalog.firstServiceLabel}
                </label>
                <input
                  id="serviceInput"
                  type="text"
                  value={formData.serviceName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, serviceName: e.target.value }))}
                  className="w-full h-11 px-3 rounded-control border border-line bg-paper text-ink text-sm focus:outline-none focus:border-plum"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate block mb-1">
                  {catalog.durationLabel}
                </label>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, durationMin: mins }))}
                      className={`flex-1 h-10 rounded-control border text-xs font-semibold transition-all ${
                        formData.durationMin === mins
                          ? 'border-plum bg-plum text-on-plum'
                          : 'border-line bg-paper text-slate hover:text-ink'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Ready to Share */}
        {step === 3 && (
          <div className="space-y-6 text-center animate-fadeIn pt-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-st-confirmed/15 text-st-confirmed flex items-center justify-center">
              <svg className="w-8 h-8 text-st-confirmed" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h1 className="font-heading text-2xl text-ink font-semibold">{catalog.readyTitle}</h1>
              <p className="text-sm text-slate mt-1 max-w-xs mx-auto">{catalog.readyDescription}</p>
            </div>

            {/* Link Preview Card */}
            <div className="p-4 bg-surface border border-line rounded-card text-left space-y-3 shadow-sm">
              <span className="text-xs font-semibold text-slate uppercase tracking-wider block">Your Public Link</span>
              <div className="flex items-center justify-between p-2.5 rounded-control bg-paper border border-line">
                <span className="font-mono text-xs text-ink truncate mr-2">
                  bookdesk.app/b/{formData.slug || 'my-shop'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-xs font-semibold text-plum hover:underline shrink-0"
                >
                  {copied ? common.copied : catalog.copyLinkButton}
                </button>
              </div>
            </div>

            {/* QR Placeholder */}
            <div className="w-40 h-40 mx-auto border border-line rounded-card bg-surface flex flex-col items-center justify-center p-2">
              <div className="w-28 h-28 border border-dashed border-slate/40 flex items-center justify-center text-xs text-slate">
                [ QR Code ]
              </div>
              <span className="text-[11px] text-slate mt-1">Scan to book</span>
            </div>
          </div>
        )}

        {/* Reserved space for error messages (ensures nothing jumps) */}
        <div className="h-6 mt-3 flex items-center">
          {errorMessage && (
            <p className="text-xs font-medium text-st-noshow" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </main>

      {/* 3. FIXED BOTTOM REGION: Action bar with stationary buttons */}
      <footer
        data-testid="fixed-actions-region"
        className="sticky bottom-0 z-30 bg-surface border-t border-line px-4 py-3 shrink-0"
      >
        <div className="flex gap-3">
          {step > 1 && step < 3 && (
            <button
              type="button"
              onClick={handleBack}
              className="h-13 px-5 border border-line rounded-control text-ink text-sm font-semibold active:opacity-80 transition-opacity"
            >
              {common.back}
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 h-13 bg-plum text-on-plum rounded-control text-base font-semibold active:opacity-90 transition-opacity"
            >
              {common.continue}
            </button>
          ) : (
            <a
              href="/"
              className="flex-1 h-13 bg-plum text-on-plum rounded-control text-base font-semibold flex items-center justify-center active:opacity-90 transition-opacity"
            >
              {catalog.goToAppButton}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
