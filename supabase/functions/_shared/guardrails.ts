/**
 * AI Guardrails and Safety Engine for Supabase Edge Functions.
 * Complies with docs/guardrails.md, docs/prompts.md, docs/tools.md, and docs/memory.md.
 * 
 * Core rule: The AI proposes, deterministic code decides, a person confirms.
 */

export interface RedactionResult {
  redactedText: string;
  phoneMap: Record<string, string>; // e.g. { '[PHONE_1]': '+251911223344' }
  extractedPhones: string[];
}

export interface TrustedContext {
  now: Date;
  timeZone: string;
  businessType: string;
  language: 'en' | 'am' | 'om';
  timeDisplay: 'gregorian' | 'ethiopian';
}

export interface AmbiguityResult {
  isAmbiguous: boolean;
  clockTime?: string;
  question?: string;
  options?: Array<{ id: string; label: string }>;
}

export function normalizePhone(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');
  if (/^0[97]\d{8}$/.test(cleaned)) return `+251${cleaned.slice(1)}`;
  if (/^[97]\d{8}$/.test(cleaned)) return `+251${cleaned}`;
  if (/^\+251[97]\d{8}$/.test(cleaned)) return cleaned;
  if (/^251[97]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  return null;
}

export function toEthiopianHour(internationalHour: number): number {
  if (internationalHour < 0 || internationalHour > 23 || !Number.isInteger(internationalHour)) {
    throw new RangeError(`Invalid international hour: ${internationalHour}`);
  }
  const raw = (internationalHour - 6) % 12;
  const mod = raw < 0 ? raw + 12 : raw;
  return mod === 0 ? 12 : mod;
}

export function getPartOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export function getIsoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * 1. Sanitizes untrusted user/chat input:
 * - Truncates to max 600 characters
 * - Unicode NFC normalization
 * - Strips zero-width characters and unprintable ASCII control characters
 * - Neutralizes closing XML/HTML tags
 */
export function sanitizeUntrustedInput(raw: string, maxLength = 600): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.normalize('NFC');
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  cleaned = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return cleaned.trim();
}

/**
 * 2. Redacts phone numbers before sending to any model:
 */
export function redactPhones(text: string): RedactionResult {
  if (!text) {
    return { redactedText: '', phoneMap: {}, extractedPhones: [] };
  }
  const phoneMap: Record<string, string> = {};
  const extractedPhones: string[] = [];
  let counter = 1;
  const phoneRegex = /(?:\+251[\s\-]?[97]\d(?:[\s\-]?\d){7}|0[97]\d(?:[\s\-]?\d){7}|\b[97]\d(?:[\s\-]?\d){7}\b|\+[1-9]\d{1,14}\b)/g;

  const redactedText = text.replace(phoneRegex, (match) => {
    const normalized = normalizePhone(match);
    if (!normalized) return match;
    const placeholder = `[PHONE_${counter++}]`;
    phoneMap[placeholder] = normalized;
    extractedPhones.push(normalized);
    return placeholder;
  });

  return { redactedText, phoneMap, extractedPhones };
}

/**
 * Restores redacted phone placeholders into real phone numbers.
 */
export function restorePhones(text: string, phoneMap: Record<string, string>): string {
  if (!text) return '';
  let restored = text;
  for (const [placeholder, phone] of Object.entries(phoneMap)) {
    restored = restored.replaceAll(placeholder, phone);
  }
  return restored;
}

/**
 * 3. Builds server-supplied trusted context block:
 */
export function buildTrustedContext(ctx: TrustedContext): string {
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ctx.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(ctx.now);
  const pMap: Record<string, string> = {};
  for (const p of parts) {
    pMap[p.type] = p.value;
  }

  const localIso = `${pMap.year}-${pMap.month}-${pMap.day}T${pMap.hour}:${pMap.minute}:00`;
  const todayIsoDate = `${pMap.year}-${pMap.month}-${pMap.day}`;
  const todayWeekdayIndex = getIsoWeekday(todayIsoDate);
  const weekdayName = weekdayNames[todayWeekdayIndex - 1];

  const calendarDays: string[] = [];
  const [currY, currM, currD] = [parseInt(pMap.year, 10), parseInt(pMap.month, 10) - 1, parseInt(pMap.day, 10)];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(currY, currM, currD + i));
    const iso = d.toISOString().slice(0, 10);
    const dayName = weekdayNames[getIsoWeekday(iso) - 1];
    calendarDays.push(`${iso} (${dayName})`);
  }

  return `<trusted_context>
Now: ${localIso} (${ctx.timeZone}), ${weekdayName}. Calendar: ${calendarDays.join(', ')}.
Time display: ${ctx.timeDisplay}. Business type: ${ctx.businessType}. Language: ${ctx.language}.
</trusted_context>`;
}

/**
 * 4. Detects ambiguous clock times per Rule 5 in prompts.md & guardrails.md:
 */
export function detectTimeAmbiguity(text: string): AmbiguityResult {
  if (!text) return { isAmbiguous: false };
  const lower = text.toLowerCase();
  const hasAmPm = /\b(am|pm|a\.m\.|p\.m\.)\b/i.test(lower);
  const hasPartOfDay = /\b(morning|afternoon|evening|night|ganama|galgala)\b/i.test(lower) ||
    /(ጠዋት|ከሰዓት|ማታ)/.test(lower);
  const hasEthiopianMarker = /\b(ethiopian(\s*time)?|sa'aati\s*itoophiyaa)\b/i.test(lower) ||
    /(የኢትዮጵያ(\s*ሰዓት)?|የሀበሻ(\s*ሰዓት)?)/.test(lower);
  const has24HourTime = /\b(1[3-9]|2[0-3]):[0-5]\d\b/.test(lower);

  if (hasAmPm || hasPartOfDay || hasEthiopianMarker || has24HourTime) {
    return { isAmbiguous: false };
  }

  const bareClockMatch = text.match(/\b([1-9]|1[0-2])(?::([0-5]\d))?\s*(?:o['’]clock)?\b/i);
  if (!bareClockMatch) {
    return { isAmbiguous: false };
  }

  const rawHour = parseInt(bareClockMatch[1], 10);
  const rawMin = bareClockMatch[2] ? bareClockMatch[2] : '00';
  const displayClock = `${rawHour}:${rawMin}`;

  const afternoonHour = rawHour < 12 ? rawHour + 12 : rawHour;
  const ethiopianToGregorianMorning = (rawHour + 6) % 12 || 12;

  const question = `Do you mean ${rawHour}:${rawMin} in the afternoon, or ${rawHour} o'clock Ethiopian time (${ethiopianToGregorianMorning}:${rawMin} in the morning)?`;
  const options = [
    { id: `${String(afternoonHour).padStart(2, '0')}:${rawMin}`, label: `${rawHour}:${rawMin} in the afternoon` },
    { id: `${String((rawHour + 6) % 24).padStart(2, '0')}:${rawMin}`, label: `${rawHour} o'clock Ethiopian time (${ethiopianToGregorianMorning}:${rawMin} AM)` },
  ];

  return {
    isAmbiguous: true,
    clockTime: displayClock,
    question,
    options,
  };
}

/**
 * 5. Converts Ethiopian time to 24-hour international local time.
 */
export function convertEthiopianToInternational(hour: number, minute = 0, isNight = false): { hour: number; minute: number; time24: string } {
  if (hour < 1 || hour > 12) {
    throw new RangeError(`Invalid Ethiopian hour: ${hour}. Must be 1 to 12.`);
  }
  let intHour = isNight ? (hour + 18) % 24 : (hour + 6) % 24;
  const time24 = `${String(intHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour: intHour, minute, time24 };
}

/**
 * 6. Validates proposed slot start against allowed returned slots.
 */
export function validateSlotGrounding(proposedStart: string, allowedSlots: Array<{ start: string }>): boolean {
  if (!proposedStart || !Array.isArray(allowedSlots) || allowedSlots.length === 0) {
    return false;
  }
  return allowedSlots.some((slot) => slot.start === proposedStart);
}

/**
 * 7. Validates message drafts per guardrails.md section 4:
 */
export function validateMessageDraftSafety(
  message: string,
  context: { businessName: string; allowedPrice?: boolean }
): { valid: boolean; reason?: string } {
  if (!message || typeof message !== 'string') {
    return { valid: false, reason: 'Empty message' };
  }
  const wordCount = message.trim().split(/\s+/).length;
  if (wordCount > 60) {
    return { valid: false, reason: `Word count exceeds 60 words (${wordCount})` };
  }
  if (!message.toLowerCase().includes(context.businessName.toLowerCase())) {
    return { valid: false, reason: 'Missing business name in message' };
  }
  const prohibitedPatterns = /\b(penalty|fine|lawsuit|court|legal\s*action|sue|threat|punish|shame|debt\s*collector|police)\b/i;
  if (prohibitedPatterns.test(message)) {
    return { valid: false, reason: 'Contains punitive, threatening, or legal terminology' };
  }
  const phonePattern = /(?:\+251|09\d{8}|07\d{8}|\b\d{9,14}\b)/;
  if (phonePattern.test(message)) {
    return { valid: false, reason: 'Phone numbers must not appear in customer messages' };
  }
  if (!context.allowedPrice && /\b(\d+)\s*(birr|etb|\$|dollars)\b/i.test(message)) {
    return { valid: false, reason: 'Price mentioned without request' };
  }
  return { valid: true };
}

/**
 * Fallback deterministic message generator.
 */
export function getFallbackMessage(
  kind: 'confirmation' | 'reminder' | 'reschedule' | 'no_show',
  data: { firstName: string; businessName: string; serviceName: string; dateTimeWords: string; ethiopianWords?: string },
  lang: 'en' | 'am' | 'om' = 'en'
): string {
  const timeWithEth = data.ethiopianWords ? `${data.dateTimeWords} [${data.ethiopianWords}]` : data.dateTimeWords;

  if (lang === 'am') {
    switch (kind) {
      case 'confirmation':
        return `ሰላም ${data.firstName}፣ ይሄ ከ${data.businessName} ነው። የ${data.serviceName} ቀጠሮዎ በ${timeWithEth} ተይዟል።`;
      case 'reminder':
        return `ሰላም ${data.firstName}፣ ከ${data.businessName} የቀጠሮ ማስታወሻ ነው። የ${data.serviceName} ቀጠሮዎ በ${timeWithEth} ነው።`;
      case 'reschedule':
        return `ሰላም ${data.firstName}፣ የ${data.serviceName} ቀጠሮዎ ወደ ${timeWithEth} ተቀይሯል። እናመሰግናለን፣ ${data.businessName}።`;
      case 'no_show':
        return `ሰላም ${data.firstName}፣ ዛሬ በ${data.businessName} ቀጠሮዎ ላይ ባለመገኘትዎ አዝነናል። በማንኛውም ጊዜ እንደገና መያዝ ይችላሉ።`;
    }
  }

  if (lang === 'om') {
    switch (kind) {
      case 'confirmation':
        return `Akkam ${data.firstName}, kun ${data.businessName} irraayi. Beellamni ${data.serviceName} keessan ${timeWithEth} irratti qabameera.`;
      case 'reminder':
        return `Akkam ${data.firstName}, kun yaadachiisa beellama ${data.businessName} ti. Beellamni ${data.serviceName} keessan ${timeWithEth} dha.`;
      case 'reschedule':
        return `Akkam ${data.firstName}, beellamni ${data.serviceName} keessan gara ${timeWithEth}tti jijjiirameera. Galatoomaa, ${data.businessName}.`;
      case 'no_show':
        return `Akkam ${data.firstName}, har'a beellama ${data.businessName} irratti waan hin argamneef gaddineerra. Yeroo barbaaddanitti deebitanii qabachuu dandeessu.`;
    }
  }

  switch (kind) {
    case 'confirmation':
      return `Hello ${data.firstName}, this is ${data.businessName}. Your ${data.serviceName} appointment is confirmed for ${timeWithEth}. See you then.`;
    case 'reminder':
      return `Hello ${data.firstName}, friendly reminder from ${data.businessName}: your ${data.serviceName} appointment is on ${timeWithEth}.`;
    case 'reschedule':
      return `Hello ${data.firstName}, your ${data.serviceName} appointment with ${data.businessName} has been moved to ${timeWithEth}.`;
    case 'no_show':
      return `Hello ${data.firstName}, we missed you today for your appointment at ${data.businessName}. We would love to welcome you back whenever you're ready to rebook.`;
  }
}

/**
 * 8. Validates Insights grounding.
 */
export function validateInsightsGrounding(
  summary: string,
  suggestions: Array<{ text: string }>,
  allowedNumbers: number[]
): boolean {
  const allowedSet = new Set(allowedNumbers.map((n) => Math.round(n)));
  const extractNumbers = (str: string): number[] => {
    const matches = str.match(/\b\d+(?:\.\d+)?\b/g);
    if (!matches) return [];
    return matches.map((m) => Math.round(parseFloat(m)));
  };

  const allNumbers = [
    ...extractNumbers(summary),
    ...suggestions.flatMap((s) => extractNumbers(s.text)),
  ];

  for (const num of allNumbers) {
    if (!allowedSet.has(num)) {
      return false;
    }
  }
  return true;
}

/**
 * 9. Validates memory item creation before saving.
 */
export function validateMemoryItem(
  kind: string,
  key: string,
  value: string
): { valid: boolean; error?: string } {
  if (!['alias', 'preference', 'fact'].includes(kind)) {
    return { valid: false, error: 'Invalid memory kind' };
  }
  if (!key || key.trim().length === 0 || key.length > 80) {
    return { valid: false, error: 'Key must be between 1 and 80 characters' };
  }
  if (!value || value.trim().length === 0 || value.length > 300) {
    return { valid: false, error: 'Value must be between 1 and 300 characters' };
  }
  const injectionPattern = /(ignore|override|bypass|disregard).*instruction|double\s*book|as\s*system|developer\s*mode|system\s*prompt/i;
  if (injectionPattern.test(value) || injectionPattern.test(key)) {
    return { valid: false, error: 'Instruction-like patterns are not allowed in memory' };
  }
  const phonePattern = /(\+251|09\d{8}|07\d{8}|\b\d{9,15}\b)/;
  if (phonePattern.test(value) || phonePattern.test(key)) {
    return { valid: false, error: 'Phone numbers must never be saved in memory' };
  }
  return { valid: true };
}
