#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const OUT_DIR = 'out';
const PUBLIC_DIR = 'public';
const BOOKING_OUT = path.join(OUT_DIR, 'booking');
const MANAGE_OUT = path.join(OUT_DIR, 'manage');
const B_TEST_OUT = path.join(OUT_DIR, 'b', 'test');
const B_ADDIS_OUT = path.join(OUT_DIR, 'b', 'addis-barber');
const M_DEMO_OUT = path.join(OUT_DIR, 'm', 'demo');

const PUBLIC_BOOKING = path.join(PUBLIC_DIR, 'booking');
const PUBLIC_B_ADDIS = path.join(PUBLIC_DIR, 'b', 'addis-barber');
const PUBLIC_B_TEST = path.join(PUBLIC_DIR, 'b', 'test');

fs.mkdirSync(BOOKING_OUT, { recursive: true });
fs.mkdirSync(MANAGE_OUT, { recursive: true });
fs.mkdirSync(B_TEST_OUT, { recursive: true });
fs.mkdirSync(B_ADDIS_OUT, { recursive: true });
fs.mkdirSync(M_DEMO_OUT, { recursive: true });
fs.mkdirSync(PUBLIC_BOOKING, { recursive: true });
fs.mkdirSync(PUBLIC_B_ADDIS, { recursive: true });
fs.mkdirSync(PUBLIC_B_TEST, { recursive: true });

console.log('[Build Booking] Compiling standalone booking page bundle...');

// 1. Bundle JS with esbuild
await esbuild.build({
  entryPoints: ['booking-page/src/index.tsx'],
  bundle: true,
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  treeShaking: true,
  alias: {
    'react': 'preact/compat',
    'react-dom': 'preact/compat',
  },
  sourcemap: false,
  target: ['es2022'],
  outfile: path.join(BOOKING_OUT, 'index.js'),
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

// 2. Minimal standalone CSS with tokens
const cssContent = `
:root {
  --color-ink: #1A1B25;
  --color-paper: #F5F6F9;
  --color-surface: #FFFFFF;
  --color-line: #DEE1E8;
  --color-slate: #5C6370;
  --color-plum: #6A3FA0;
  --color-on-plum: #FFFFFF;
  --color-st-confirmed: #0F7B5F;
  --color-st-pending: #E0A030;
  --color-st-pending-text: #8A5600;
  --color-st-active: #1D5FD1;
  --color-st-noshow: #B3402F;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-ink: #ECEDF3;
    --color-paper: #0F1117;
    --color-surface: #181B24;
    --color-line: #2A2F3B;
    --color-slate: #9CA3B2;
    --color-plum: #B79CF0;
    --color-on-plum: #14091F;
    --color-st-confirmed: #3DBE97;
    --color-st-pending: #E0A030;
    --color-st-pending-text: #E0A030;
    --color-st-active: #6FA2FF;
    --color-st-noshow: #F08070;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-feature-settings: "tnum";
  background-color: var(--color-paper);
  color: var(--color-ink);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 {
  font-family: "Fraunces", Georgia, serif;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.15;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 52px;
  background-color: var(--color-plum);
  color: var(--color-on-plum);
  border-radius: 8px;
  border: none;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: opacity 120ms ease-out;
}
.btn-primary:active {
  opacity: 0.9;
}
.card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: 12px;
  padding: 16px;
}
`;

fs.writeFileSync(path.join(BOOKING_OUT, 'index.css'), cssContent.trim(), 'utf8');
fs.writeFileSync(path.join(PUBLIC_BOOKING, 'index.css'), cssContent.trim(), 'utf8');

// Copy index.js to public/booking/index.js
fs.copyFileSync(path.join(BOOKING_OUT, 'index.js'), path.join(PUBLIC_BOOKING, 'index.js'));

// 3. Emit booking shell HTML
const bookingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book Appointment - Book Desk</title>
  <link rel="stylesheet" href="/booking/index.css">
</head>
<body>
  <div id="booking-root"></div>
  <script src="/booking/index.js"></script>
</body>
</html>
`;

const manageHtml = bookingHtml.replace('Book Appointment', 'Manage Booking');

// Write out/ directory targets (both directory index and cleanUrl .html files)
fs.writeFileSync(path.join(BOOKING_OUT, 'index.html'), bookingHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'booking.html'), bookingHtml, 'utf8');

fs.writeFileSync(path.join(MANAGE_OUT, 'index.html'), manageHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'manage.html'), manageHtml, 'utf8');

fs.writeFileSync(path.join(B_TEST_OUT, 'index.html'), bookingHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'b', 'test.html'), bookingHtml, 'utf8');

fs.writeFileSync(path.join(B_ADDIS_OUT, 'index.html'), bookingHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'b', 'addis-barber.html'), bookingHtml, 'utf8');

fs.writeFileSync(path.join(M_DEMO_OUT, 'index.html'), manageHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'm', 'demo.html'), manageHtml, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'm', 'tok_test.html'), manageHtml, 'utf8');

// Write public/ directory targets
fs.writeFileSync(path.join(PUBLIC_BOOKING, 'index.html'), bookingHtml, 'utf8');
fs.writeFileSync(path.join(PUBLIC_B_TEST, 'index.html'), bookingHtml, 'utf8');
fs.writeFileSync(path.join(PUBLIC_B_ADDIS, 'index.html'), bookingHtml, 'utf8');

console.log('✅ Standalone booking page bundle generated successfully.');

