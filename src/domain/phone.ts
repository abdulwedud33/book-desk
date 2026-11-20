/**
 * Normalises phone numbers:
 * - Strips spaces, dashes, brackets, and periods.
 * - Local Ethiopian 09xxxxxxxx and 07xxxxxxxx (10 digits) become +2519xxxxxxxx and +2517xxxxxxxx.
 * - +2519xxxxxxxx and +2517xxxxxxxx are accepted.
 * - Other international numbers in E.164 format (+...) are accepted (min 8 digits, max 16 digits).
 * - Too short or too long numbers throw an error or return null.
 */
export function normalizePhone(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Strip whitespace, dashes, brackets, dots
  const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');

  // Ethiopian local: 09... or 07... (10 digits total)
  if (/^0[97]\d{8}$/.test(cleaned)) {
    return `+251${cleaned.slice(1)}`;
  }

  // Ethiopian local without leading zero: 9... or 7... (9 digits total)
  if (/^[97]\d{8}$/.test(cleaned)) {
    return `+251${cleaned}`;
  }

  // Already prefixed Ethiopian: +2519... or +2517...
  if (/^\+251[97]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // Ethiopian international without plus: 2519... or 2517...
  if (/^251[97]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Standard international E.164: + followed by 7 to 15 digits
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}
