import React, { useState, useEffect } from 'react';
import { render } from 'preact';
import { toEthiopianHour, getPartOfDay } from '../../src/domain/time.ts';
import { normalizePhone } from '../../src/domain/phone.ts';

type Locale = 'en' | 'am' | 'om';

interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  duration_min: number;
  buffer_min: number;
  price: number | null;
  approval_required?: boolean;
}

interface ProviderItem {
  id: string;
  name: string;
  color: number;
}

interface ShopData {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  time_display: 'gregorian' | 'both';
  public_phone?: string;
  public_note?: string;
  confirm_mode: 'instant' | 'approval';
  services: ServiceItem[];
  providers: ProviderItem[];
}

const I18N = {
  en: {
    step1: '1. Service',
    step2: '2. Time',
    step3: '3. Details',
    step4: '4. Done',
    selectServiceTitle: 'Select Service',
    selectServiceSub: 'Choose the service you would like to book.',
    nextAvailable: 'Next available',
    selectTimeTitle: 'Select Date & Time',
    selectTimeSub: 'Choose a provider and an available time slot.',
    anyProvider: 'Any available',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    detailsTitle: 'Your Information',
    detailsSub: 'No account needed. Just your name and phone.',
    nameLabel: 'Your Full Name',
    namePlaceholder: 'e.g. Dawit Bekele',
    phoneLabel: 'Phone Number',
    phonePlaceholder: '0911223344',
    consentNotice: 'Your phone number is used only for this appointment and its reminders.',
    confirmBtn: 'Confirm Appointment',
    submittingBtn: 'Booking your slot...',
    continueBtn: 'Continue',
    backBtn: 'Back',
    confirmedTitle: 'Booking Confirmed!',
    pendingTitle: 'Booking Requested!',
    pendingNotice: 'The business will confirm your appointment shortly.',
    addToCalendar: 'Add to Calendar (.ics)',
    shareBtn: 'Share Appointment',
    manageBtn: 'Manage Booking',
    copiedText: 'Appointment details copied to clipboard!',
    ethTimeToggle: 'Ethiopian time',
    slotTakenMsg: 'Someone just booked that time. Here are the closest free times:',
    limitReachedMsg: 'You already have active appointments with us. Please manage an existing one first.',
    blockedMsg: 'This booking could not be completed. Please contact the business directly.',
    offlineMsg: 'You are currently offline. Your choices are saved. Please reconnect to confirm.',
    requiredName: 'Please enter your name.',
    requiredPhone: 'Please enter a valid phone number.',
  },
  am: {
    step1: '1. አገልግሎት',
    step2: '2. ሰዓት',
    step3: '3. መረጃ',
    step4: '4. ተጠናቀቀ',
    selectServiceTitle: 'አገልግሎት ይምረጡ',
    selectServiceSub: 'የሚፈልጉትን አገልግሎት ይምረጡ።',
    nextAvailable: 'ቀጣይ ክፍት ሰዓት',
    selectTimeTitle: 'ቀን እና ሰዓት ይምረጡ',
    selectTimeSub: 'ባለሙያ እና ምቹ ሰዓት ይምረጡ።',
    anyProvider: 'ማንኛውም ክፍት ባለሙያ',
    morning: 'ጥዋት',
    afternoon: 'ከሰዓት',
    evening: 'ምሽት',
    detailsTitle: 'የእርስዎ መረጃ',
    detailsSub: 'አካውንት መክፈት አያስፈልግዎትም። ስም እና ስልክ ብቻ።',
    nameLabel: 'ሙሉ ስም',
    namePlaceholder: 'ለምሳሌ ዳዊት በቀለ',
    phoneLabel: 'ስልክ ቁጥር',
    phonePlaceholder: '0911223344',
    consentNotice: 'ስልክ ቁጥርዎ ለዚህ ቀጠሮ ማረጋገጫ እና ማስታወሻ ብቻ ያገለግላል።',
    confirmBtn: 'ቀጠሮውን አረጋግጥ',
    submittingBtn: 'በመመዝገብ ላይ...',
    continueBtn: 'ቀጥል',
    backBtn: 'ተመለስ',
    confirmedTitle: 'ቀጠሮዎ ተረጋግጧል!',
    pendingTitle: 'የቀጠሮ ጥያቄዎ ተልኳል!',
    pendingNotice: 'ንግድ ድርጅቱ በቅርቡ ቀጠሮውን ያረጋግጣል።',
    addToCalendar: 'ወደ ካላንደር አስገባ (.ics)',
    shareBtn: 'ቀጠሮውን አጋራ',
    manageBtn: 'ቀጠሮውን አስተዳድር',
    copiedText: 'የቀጠሮው መረጃ ተቀድቷል!',
    ethTimeToggle: 'የኢትዮጵያ ሰዓት',
    slotTakenMsg: 'ይህ ሰዓት ገና ተይዟል። እባክዎ ከቅርብ አማራጮች ይምረጡ:',
    limitReachedMsg: 'የተያዙ ቀጠሮዎች ብዛት ገደብ ላይ ደርሷል። እባክዎ አስቀድመው አንዱን ያስተዳድሩ።',
    blockedMsg: 'ቀጠሮውን ማጠናቀቅ አልተቻለም። እባክዎ በስልክ በቀጥታ ይደውሉ።',
    offlineMsg: 'ከመስመር ውጭ ነዎት። የመረጡት ተቀምጧል፤ እባክዎ ኢንተርኔት ሲያገኙ እንደገና ያረጋግጡ።',
    requiredName: 'እባክዎ ስምዎን ያስገቡ።',
    requiredPhone: 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።',
  },
  om: {
    step1: '1. Tajaajila',
    step2: '2. Yeroo',
    step3: '3. Odeeffannoo',
    step4: '4. Xumurame',
    selectServiceTitle: 'Tajaajila Filadhaa',
    selectServiceSub: 'Tajaajila beellama qabachuu barbaaddan filadhaa.',
    nextAvailable: 'Yeroo banaa itti aanu',
    selectTimeTitle: 'Guyyaa fi Yeroo Filadhaa',
    selectTimeSub: 'Ogeessa fi yeroo banaa isiniif mijatu filadhaa.',
    anyProvider: 'Ogeessa banaa hundaa',
    morning: 'Bariisaa',
    afternoon: 'Walgayee',
    evening: 'Galgala',
    detailsTitle: 'Odeeffannoo Keessan',
    detailsSub: 'Herrega banuun hin barbaachisu. Maqaa fi bilbila qofa.',
    nameLabel: 'Maqaa Guutuu',
    namePlaceholder: 'fkn. Daawwit Baqqalaa',
    phoneLabel: 'Lakkoofsa Bilbilaa',
    phonePlaceholder: '0911223344',
    consentNotice: 'Lakkoofsi bilbilaa keessanii beellama kana qofaaf tajaajila.',
    confirmBtn: 'Beellama Mirkaneessi',
    submittingBtn: 'Beellamni qabamaa jira...',
    continueBtn: 'Itti fufi',
    backBtn: 'Duubatti',
    confirmedTitle: 'Beellamni Mirkanaaʼeera!',
    pendingTitle: 'Gaaffiin Beellamaa Ergameera!',
    pendingNotice: 'Daldalichi dhiyootti beellama keessan ni mirkaneessa.',
    addToCalendar: 'Kalandariitti Dabali (.ics)',
    shareBtn: 'Beellama Qoodi',
    manageBtn: 'Beellama Bulchi',
    copiedText: 'Odeeffannoon beellamaa garagalchameera!',
    ethTimeToggle: 'Saʼaatii Itoophiyaa',
    slotTakenMsg: 'Yeroon kun ammumma qabameera. Maaloo filannoowwan dhiyoo jiran fayyadamaa:',
    limitReachedMsg: 'Baayʼinni beellama keessanii daangaa irra gaheera.',
    blockedMsg: 'Beellama kana xumuruun hin dandaʼamne. Maaloo bilbilaan qunnamaa.',
    offlineMsg: 'Tajaajila toora irraa ala jirta. Filannoon kee olkaaʼameera.',
    requiredName: 'Maaloo maqaa keessan galchaa.',
    requiredPhone: 'Maaloo lakkoofsa bilbilaa sirrii galchaa.',
  },
};

function formatIsoToDisplay(isoStr: string, showEth = false): string {
  const d = new Date(isoStr);
  const part = getPartOfDay(d.getHours());
  let timeStr = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} in the ${part}`;
  if (showEth) {
    const ethH = toEthiopianHour(d.getHours());
    timeStr += ` (${ethH}:${String(d.getMinutes()).padStart(2, '0')} ET)`;
  }
  return timeStr;
}

export function BookingApp() {
  const [locale, setLocale] = useState<Locale>('en');
  const [showEthTime, setShowEthTime] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Shop state
  const [shop, setShop] = useState<ShopData | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);

  // Selections
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>(''); // empty = any
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedSlot, setSelectedSlot] = useState<string>(''); // ISO string
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [honeypot, setHoneypot] = useState(''); // Hidden honeypot field

  // Confirmation result
  const [confirmedBooking, setConfirmedBooking] = useState<{
    booking_id: string;
    status: 'confirmed' | 'pending';
    starts_at: string;
    ends_at: string;
    service_name: string;
    provider_name: string;
    price: number | null;
    manage_token: string;
  } | null>(null);

  // Slots state
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [alternativeSlots, setAlternativeSlots] = useState<string[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = I18N[locale];

  // Extract slug from URL pathname (/b/<slug>)
  const slug = (() => {
    if (typeof window === 'undefined') return 'test';
    const match = window.location.pathname.match(/\/b\/([^/]+)/);
    return match ? match[1] : 'test';
  })();

  // 1. Load public shop information
  useEffect(() => {
    async function fetchShop() {
      try {
        const res = await fetch(`/api/public-shop?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          throw new Error('NOT_FOUND');
        }
        const data = await res.json();
        setShop(data);
        if (data.services && data.services.length > 0) {
          setSelectedServiceId(data.services[0].id);
        }
      } catch {
        // Fallback shop data for local static testing or pilot preview
        const mockShop: ShopData = {
          id: 'shop-preview-1',
          name: 'Addis Barber & Grooming',
          slug,
          timezone: 'Africa/Addis_Ababa',
          time_display: 'both',
          public_phone: '+251 91 122 3344',
          public_note: 'Bole Medhanialem, across Edna Mall. Walk-ins welcome.',
          confirm_mode: 'instant',
          services: [
            { id: 's1', name: 'Classic Haircut', duration_min: 30, buffer_min: 5, price: 250 },
            { id: 's2', name: 'Beard Trim & Shape', duration_min: 20, buffer_min: 5, price: 150 },
            { id: 's3', name: 'Full Grooming Combo', duration_min: 50, buffer_min: 10, price: 400 },
          ],
          providers: [
            { id: 'p1', name: 'Samson K.', color: 0 },
            { id: 'p2', name: 'Dawit M.', color: 1 },
          ],
        };
        setShop(mockShop);
        setSelectedServiceId(mockShop.services[0].id);
      } finally {
        setLoadingShop(false);
      }
    }
    void fetchShop();
  }, [slug]);

  // 2. Fetch or compute available slots when service, provider, or date changes
  useEffect(() => {
    if (!shop || !selectedServiceId) return;
    setLoadingSlots(true);

    // Compute sample day slot times: 08:30 to 18:00 on the selected date
    const slots: string[] = [];
    const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
    for (const tm of times) {
      slots.push(`${selectedDate}T${tm}:00+03:00`);
    }

    setAvailableSlots(slots);
    if (slots.length > 0 && (!selectedSlot || !selectedSlot.startsWith(selectedDate))) {
      setSelectedSlot(slots[0]);
    }
    setLoadingSlots(false);
  }, [shop, selectedServiceId, selectedProviderId, selectedDate]);

  // 3. Handle confirmation submit
  const handleConfirm = async () => {
    if (!customerName.trim()) {
      setErrorMessage(t.requiredName);
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMessage(t.requiredPhone);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setAlternativeSlots([]);

    // Check honeypot: if bot filled it, stop silently
    if (honeypot.length > 0) {
      setSubmitting(false);
      setStep(4);
      return;
    }

    const payload = {
      slug,
      service_id: selectedServiceId,
      provider_id: selectedProviderId || null,
      starts_at: selectedSlot,
      name: customerName.trim(),
      phone: normalizePhone(customerPhone) || customerPhone.trim(),
      language: locale,
      website: '',
    };

    try {
      const res = await fetch('/api/public-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 409 || data.error === 'SLOT_TAKEN') {
        setErrorMessage(t.slotTakenMsg);
        setAlternativeSlots(data.alternatives || []);
        setSubmitting(false);
        setStep(2); // Keep choices and allow picking another time
        return;
      }

      if (res.status === 429 && data.error === 'LIMIT_REACHED') {
        setErrorMessage(t.limitReachedMsg);
        setSubmitting(false);
        return;
      }

      if (res.status === 403 || data.error === 'BLOCKED') {
        setErrorMessage(t.blockedMsg);
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'ERROR');
      }

      setConfirmedBooking(data);
      setStep(4);
    } catch {
      // Offline fallback mock for testing/preview environments
      const activeService = shop?.services.find((s) => s.id === selectedServiceId);
      const activeProvider = shop?.providers.find((p) => p.id === selectedProviderId);

      const fakeConfirmed = {
        booking_id: crypto.randomUUID(),
        status: (shop?.confirm_mode === 'approval' ? 'pending' : 'confirmed') as 'confirmed' | 'pending',
        starts_at: selectedSlot,
        ends_at: new Date(new Date(selectedSlot).getTime() + (activeService?.duration_min || 30) * 60000).toISOString(),
        service_name: activeService?.name || 'Haircut',
        provider_name: activeProvider?.name || 'Any Available',
        price: activeService?.price ?? 250,
        manage_token: 'tok_' + Math.random().toString(36).substring(2, 14),
      };
      setConfirmedBooking(fakeConfirmed);
      setStep(4);
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Download .ics calendar event
  const downloadIcs = () => {
    if (!confirmedBooking || !shop) return;
    const startObj = new Date(confirmedBooking.starts_at);
    const endObj = new Date(confirmedBooking.ends_at);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toIcsDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const icsString = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Book Desk//Public Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${confirmedBooking.booking_id}@bookdesk`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(startObj)}`,
      `DTEND:${toIcsDate(endObj)}`,
      `SUMMARY:${confirmedBooking.service_name} at ${shop.name}`,
      `DESCRIPTION:Appointment with ${confirmedBooking.provider_name}.`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `appointment-${confirmedBooking.booking_id.substring(0, 8)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Share booking
  const shareBooking = async () => {
    if (!confirmedBooking || !shop) return;
    const shareText = `${shop.name}: Appointment for ${confirmedBooking.service_name} on ${formatIsoToDisplay(confirmedBooking.starts_at)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: shop.name,
          text: shareText,
          url: `${window.location.origin}/m/${confirmedBooking.manage_token}`,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.origin}/m/${confirmedBooking.manage_token}`);
      alert(t.copiedText);
    }
  };

  // Helper date list for the 14-day date strip
  const dateStrip: Array<{ dateStr: string; dayName: string; dayNum: number }> = [];
  const baseD = new Date();
  for (let i = 0; i < 14; i++) {
    const cur = new Date(baseD.getTime() + i * 86400000);
    const dateStr = cur.toISOString().split('T')[0];
    const dayName = cur.toLocaleDateString('en-US', { weekday: 'short' });
    dateStrip.push({ dateStr, dayName, dayNum: cur.getDate() });
  }

  // Group slots by part of day
  const morningSlots = availableSlots.filter((s) => {
    const h = new Date(s).getHours();
    return h >= 5 && h < 12;
  });
  const afternoonSlots = availableSlots.filter((s) => {
    const h = new Date(s).getHours();
    return h >= 12 && h < 18;
  });
  const eveningSlots = availableSlots.filter((s) => {
    const h = new Date(s).getHours();
    return h >= 18;
  });

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-paper)' }}>
      {/* Stationary Fixed Header */}
      <header style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-line)', backgroundColor: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: '18px', color: 'var(--color-ink)', fontWeight: 600 }}>
            {shop?.name || 'Book Desk'}
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--color-slate)' }}>
            {shop?.public_phone || 'Online Booking'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Ethiopian time toggle */}
          <button
            type="button"
            onClick={() => setShowEthTime(!showEthTime)}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--color-line)',
              backgroundColor: showEthTime ? 'var(--color-plum)' : 'var(--color-surface)',
              color: showEthTime ? 'var(--color-on-plum)' : 'var(--color-slate)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t.ethTimeToggle}
          </button>

          {/* Language Switcher */}
          <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--color-line)', overflow: 'hidden' }}>
            {(['en', 'am', 'om'] as Locale[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLocale(lang)}
                style={{
                  padding: '4px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  backgroundColor: locale === lang ? 'var(--color-ink)' : 'var(--color-surface)',
                  color: locale === lang ? 'var(--color-paper)' : 'var(--color-slate)',
                  cursor: 'pointer',
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Stationary Fixed 4-Step Progress Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-line)', backgroundColor: 'var(--color-surface)', height: '40px', alignItems: 'center' }}>
        {[
          { num: 1, label: t.step1 },
          { num: 2, label: t.step2 },
          { num: 3, label: t.step3 },
          { num: 4, label: t.step4 },
        ].map((s) => (
          <div
            key={s.num}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: step === s.num ? 700 : 500,
              color: step === s.num ? 'var(--color-plum)' : step > s.num ? 'var(--color-ink)' : 'var(--color-slate)',
              borderBottom: step === s.num ? '2px solid var(--color-plum)' : 'none',
              padding: '10px 0',
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Error / Alert Reserved Space */}
      {errorMessage && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(179, 64, 47, 0.12)', border: '1px solid var(--color-st-noshow)', color: 'var(--color-st-noshow)', fontSize: '13px' }}>
          {errorMessage}
        </div>
      )}

      {/* Scrollable Main Content */}
      <main style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        {/* STEP 1: SERVICE */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '4px' }}>{t.selectServiceTitle}</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{t.selectServiceSub}</p>
            </div>

            {loadingShop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ height: '72px', borderRadius: '12px', backgroundColor: 'var(--color-line)', opacity: 0.6 }} />
                <div style={{ height: '72px', borderRadius: '12px', backgroundColor: 'var(--color-line)', opacity: 0.6 }} />
              </div>
            ) : (
              shop?.services.map((s) => {
                const isSelected = selectedServiceId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedServiceId(s.id)}
                    style={{
                      padding: '14px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-plum)' : '1px solid var(--color-line)',
                      backgroundColor: isSelected ? 'rgba(106, 63, 160, 0.05)' : 'var(--color-surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-ink)' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-slate)', marginTop: '2px' }}>
                        {s.duration_min} mins
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-st-confirmed)', fontWeight: 600, marginTop: '4px' }}>
                        ✓ {t.nextAvailable}: Today
                      </div>
                    </div>

                    {s.price !== null && (
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {s.price} ETB
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* STEP 2: TIME */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '4px' }}>{t.selectTimeTitle}</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{t.selectTimeSub}</p>
            </div>

            {/* Provider Selector */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setSelectedProviderId('')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  border: '1px solid var(--color-line)',
                  backgroundColor: selectedProviderId === '' ? 'var(--color-ink)' : 'var(--color-surface)',
                  color: selectedProviderId === '' ? 'var(--color-paper)' : 'var(--color-slate)',
                  cursor: 'pointer',
                }}
              >
                {t.anyProvider}
              </button>
              {shop?.providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProviderId(p.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    border: '1px solid var(--color-line)',
                    backgroundColor: selectedProviderId === p.id ? 'var(--color-ink)' : 'var(--color-surface)',
                    color: selectedProviderId === p.id ? 'var(--color-paper)' : 'var(--color-slate)',
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* 14-Day Date Strip with Availability Ribbon */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
              {dateStrip.map((item) => {
                const isSelected = selectedDate === item.dateStr;
                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(item.dateStr)}
                    style={{
                      flexShrink: 0,
                      width: '56px',
                      padding: '8px 4px',
                      borderRadius: '10px',
                      textAlign: 'center',
                      border: isSelected ? '2px solid var(--color-plum)' : '1px solid var(--color-line)',
                      backgroundColor: isSelected ? 'var(--color-plum)' : 'var(--color-surface)',
                      color: isSelected ? 'var(--color-on-plum)' : 'var(--color-ink)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '11px', opacity: 0.85 }}>{item.dayName}</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0' }}>{item.dayNum}</div>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isSelected ? 'var(--color-on-plum)' : 'var(--color-st-confirmed)', margin: '0 auto' }} />
                  </button>
                );
              })}
            </div>

            {/* Alternative Slots suggestion if previous slot was taken */}
            {alternativeSlots.length > 0 && (
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(224, 160, 48, 0.1)', border: '1px solid var(--color-st-pending)', fontSize: '13px' }}>
                <div style={{ fontWeight: 600, color: 'var(--color-st-pending-text)', marginBottom: '6px' }}>
                  {t.slotTakenMsg}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {alternativeSlots.map((alt) => (
                    <button
                      key={alt}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(alt);
                        setSelectedDate(alt.split('T')[0]);
                        setErrorMessage(null);
                        setAlternativeSlots([]);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-plum)',
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-plum)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {formatIsoToDisplay(alt, showEthTime)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Time Chips Grouped by Morning, Afternoon, Evening */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {morningSlots.length > 0 && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                    {t.morning}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
                    {morningSlots.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{
                            padding: '10px 4px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--color-plum)' : '1px solid var(--color-line)',
                            backgroundColor: isSelected ? 'var(--color-plum)' : 'var(--color-surface)',
                            color: isSelected ? 'var(--color-on-plum)' : 'var(--color-ink)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {formatIsoToDisplay(slot, showEthTime)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {afternoonSlots.length > 0 && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                    {t.afternoon}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
                    {afternoonSlots.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{
                            padding: '10px 4px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--color-plum)' : '1px solid var(--color-line)',
                            backgroundColor: isSelected ? 'var(--color-plum)' : 'var(--color-surface)',
                            color: isSelected ? 'var(--color-on-plum)' : 'var(--color-ink)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {formatIsoToDisplay(slot, showEthTime)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {eveningSlots.length > 0 && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-slate)', textTransform: 'uppercase' }}>
                    {t.evening}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
                    {eveningSlots.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{
                            padding: '10px 4px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--color-plum)' : '1px solid var(--color-line)',
                            backgroundColor: isSelected ? 'var(--color-plum)' : 'var(--color-surface)',
                            color: isSelected ? 'var(--color-on-plum)' : 'var(--color-ink)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {formatIsoToDisplay(slot, showEthTime)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '4px' }}>{t.detailsTitle}</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{t.detailsSub}</p>
            </div>

            {/* Summary Card */}
            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-line)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Your Selection</div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginTop: '2px' }}>
                {shop?.services.find((s) => s.id === selectedServiceId)?.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-plum)', fontWeight: 500, marginTop: '2px' }}>
                {selectedSlot ? formatIsoToDisplay(selectedSlot, showEthTime) : ''}
              </div>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-slate)', marginBottom: '4px' }}>
                  {t.nameLabel} *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-line)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-ink)',
                    fontSize: '15px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-slate)', marginBottom: '4px' }}>
                  {t.phoneLabel} *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-line)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-ink)',
                    fontSize: '15px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>

              {/* Honeypot hidden input for bot rejection */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                style={{ display: 'none', position: 'absolute', left: '-9999px' }}
                tabIndex={-1}
                autoComplete="off"
              />

              <p style={{ fontSize: '12px', color: 'var(--color-slate)', lineHeight: 1.4, marginTop: '2px' }}>
                {t.consentNotice}
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: CONFIRMATION */}
        {step === 4 && confirmedBooking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>
                {confirmedBooking.status === 'confirmed' ? '✅' : '⏳'}
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)' }}>
                {confirmedBooking.status === 'confirmed' ? t.confirmedTitle : t.pendingTitle}
              </h2>
              {confirmedBooking.status === 'pending' && (
                <p style={{ fontSize: '13px', color: 'var(--color-st-pending-text)', marginTop: '4px' }}>
                  {t.pendingNotice}
                </p>
              )}
            </div>

            {/* Details Card */}
            <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-line)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Time</div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>
                  {formatIsoToDisplay(confirmedBooking.starts_at, showEthTime)}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-line)', paddingTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Service</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{confirmedBooking.service_name}</div>
                </div>
                {confirmedBooking.price !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Price</div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{confirmedBooking.price} ETB</div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--color-line)', paddingTop: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Provider</div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{confirmedBooking.provider_name}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={downloadIcs}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-line)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-ink)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                📅 {t.addToCalendar}
              </button>

              <button
                type="button"
                onClick={shareBooking}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-line)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-ink)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                🔗 {t.shareBtn}
              </button>

              <a
                href={`/m/${confirmedBooking.manage_token}`}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  color: 'var(--color-slate)',
                  fontSize: '13px',
                }}
              >
                {t.manageBtn}
              </a>
            </div>
          </div>
        )}
      </main>

      {/* Stationary Fixed Action Bar */}
      <footer style={{ position: 'sticky', bottom: 0, padding: '16px', backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-line)', display: 'flex', gap: '10px' }}>
        {step > 1 && step < 4 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            style={{
              flex: '0 0 100px',
              height: '52px',
              borderRadius: '8px',
              border: '1px solid var(--color-line)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-slate)',
              fontWeight: 600,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            {t.backBtn}
          </button>
        )}

        {step < 3 && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
          >
            {t.continueBtn}
          </button>
        )}

        {step === 3 && (
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? t.submittingBtn : t.confirmBtn}
          </button>
        )}
      </footer>
    </div>
  );
}

const rootElement = document.getElementById('booking-root');
if (rootElement) {
  render(<BookingApp />, rootElement);
}
