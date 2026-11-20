/**
 * Formula-safe CSV export generator for Book Desk.
 * Complies with RFC 4180 and mitigates formula injection attacks (CSV Injection)
 * by prepending a single quote to cells beginning with formula-trigger characters.
 */

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r', '%']);

/**
 * Sanitizes an individual CSV cell to prevent formula injection
 * and RFC 4180 delimiter conflicts.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Formula injection mitigation: prepend single quote if cell starts with a trigger character
  if (str.length > 0 && FORMULA_TRIGGERS.has(str[0])) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them
  const hasSpecialChars =
    str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');

  if (hasSpecialChars) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates a complete formula-safe CSV document string from headers and row data.
 */
export function generateCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));

  return [headerLine, ...rowLines].join('\r\n');
}
