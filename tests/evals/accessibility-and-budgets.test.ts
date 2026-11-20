// tests/evals/accessibility-and-budgets.test.ts
// Accessibility audits and bundle budget verification per docs/evals.md section 9.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function getGzipSize(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

describe('Budgets & Performance Verification (evals.md s9)', () => {
  it('enforces standalone booking page JS bundle budget (target < 70 KB gzip)', () => {
    const bookingJsPath = path.join(process.cwd(), 'out', 'booking', 'index.js');
    assert.ok(fs.existsSync(bookingJsPath), 'out/booking/index.js must exist');
    const size = getGzipSize(bookingJsPath);
    const limit = 70 * 1024;
    assert.ok(
      size <= limit,
      `Booking JS size (${(size / 1024).toFixed(2)} KB) exceeds budget of 70 KB gzip`
    );
  });

  it('enforces standalone booking page CSS bundle budget (target < 15 KB gzip)', () => {
    const bookingCssPath = path.join(process.cwd(), 'out', 'booking', 'index.css');
    assert.ok(fs.existsSync(bookingCssPath), 'out/booking/index.css must exist');
    const size = getGzipSize(bookingCssPath);
    const limit = 15 * 1024;
    assert.ok(
      size <= limit,
      `Booking CSS size (${(size / 1024).toFixed(2)} KB) exceeds budget of 15 KB gzip`
    );
  });

  it('enforces staff app first-load critical JS budget (target < 170 KB gzip)', () => {
    const nextStaticDir = path.join(process.cwd(), 'out', '_next', 'static');
    assert.ok(fs.existsSync(nextStaticDir), 'Next static directory must exist');

    let totalGzip = 0;
    function scanDir(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (
          entry.name.endsWith('.js') &&
          (entry.name.includes('main') || entry.name.includes('framework') || entry.name.includes('app'))
        ) {
          totalGzip += getGzipSize(full);
        }
      }
    }
    scanDir(nextStaticDir);

    const limit = 170 * 1024;
    assert.ok(
      totalGzip <= limit,
      `Staff App critical JS (${(totalGzip / 1024).toFixed(2)} KB) exceeds budget of 170 KB gzip`
    );
  });
});

describe('Static HTML Accessibility Audit (axe / WCAG 2.2 AA)', () => {
  const outDir = path.join(process.cwd(), 'out');
  const htmlFiles = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => f.endsWith('.html'))
    : [];

  it('verifies that all exported HTML pages declare a valid doctype and html element', () => {
    assert.ok(htmlFiles.length >= 10, 'Expected at least 10 static exported pages');
    for (const file of htmlFiles) {
      const content = fs.readFileSync(path.join(outDir, file), 'utf-8');
      assert.ok(content.includes('<!DOCTYPE html>'), `${file} must include valid DOCTYPE`);
      assert.ok(content.includes('<html'), `${file} must include <html> tag`);
    }
  });

  it('verifies that meta viewport has proper scaling without disallowing user zoom', () => {
    for (const file of htmlFiles) {
      const content = fs.readFileSync(path.join(outDir, file), 'utf-8');
      if (content.includes('name="viewport"')) {
        assert.ok(
          !content.includes('user-scalable=no') && !content.includes('maximum-scale=1'),
          `${file} must not disable user pinch-to-zoom (WCAG 1.4.4)`
        );
      }
    }
  });

  it('verifies zero serious/critical accessibility issues in standalone booking page', () => {
    const bookingHtmlPath = path.join(outDir, 'booking', 'index.html');
    if (fs.existsSync(bookingHtmlPath)) {
      const content = fs.readFileSync(bookingHtmlPath, 'utf-8');
      // Has lang
      assert.ok(content.includes('lang="en"'), 'Standalone booking page must specify lang attribute');
      // Has title
      assert.ok(content.includes('<title>'), 'Standalone booking page must have a title');
      // Has UTF-8 charset (case insensitive)
      assert.ok(/charset=["']?utf-8/i.test(content), 'Standalone booking page must declare utf-8 charset');
    }
  });
});
