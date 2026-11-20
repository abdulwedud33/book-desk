#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGETS = {
  bookingJs: 70 * 1024,      // 70 KB gzip
  bookingCss: 15 * 1024,     // 15 KB gzip
  staffFirstLoadJs: 170 * 1024, // 170 KB gzip
};

function getGzipSize(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

console.log('[Budgets] Checking bundle size budgets...');
let failed = false;

// 1. Check booking page JS & CSS (located in out/booking)
const bookingJsPath = path.join('out', 'booking', 'index.js');
const bookingCssPath = path.join('out', 'booking', 'index.css');

if (fs.existsSync(bookingJsPath)) {
  const jsSize = getGzipSize(bookingJsPath);
  console.log(`  Booking JS (gzip): ${formatKb(jsSize)} / Budget: ${formatKb(BUDGETS.bookingJs)}`);
  if (jsSize > BUDGETS.bookingJs) {
    console.error(`🚨 Booking JS budget exceeded! ${formatKb(jsSize)} > ${formatKb(BUDGETS.bookingJs)}`);
    failed = true;
  }
} else {
  console.log('  Notice: out/booking/index.js not found (yet).');
}

if (fs.existsSync(bookingCssPath)) {
  const cssSize = getGzipSize(bookingCssPath);
  console.log(`  Booking CSS (gzip): ${formatKb(cssSize)} / Budget: ${formatKb(BUDGETS.bookingCss)}`);
  if (cssSize > BUDGETS.bookingCss) {
    console.error(`🚨 Booking CSS budget exceeded! ${formatKb(cssSize)} > ${formatKb(BUDGETS.bookingCss)}`);
    failed = true;
  }
}

// 2. Check staff app first-load JS size
const nextStaticDir = path.join('out', '_next', 'static');
if (fs.existsSync(nextStaticDir)) {
  let totalJsGzip = 0;
  function sumJsGzip(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        sumJsGzip(full);
      } else if (entry.name.endsWith('.js') && (entry.name.includes('main') || entry.name.includes('framework') || entry.name.includes('app'))) {
        totalJsGzip += getGzipSize(full);
      }
    }
  }
  sumJsGzip(nextStaticDir);
  console.log(`  Staff App Critical JS (gzip): ${formatKb(totalJsGzip)} / Budget: ${formatKb(BUDGETS.staffFirstLoadJs)}`);
  if (totalJsGzip > BUDGETS.staffFirstLoadJs) {
    console.error(`🚨 Staff app critical JS budget exceeded! ${formatKb(totalJsGzip)} > ${formatKb(BUDGETS.staffFirstLoadJs)}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('✅ Bundle size budgets satisfied.');
}

