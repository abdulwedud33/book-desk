#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT_DIR = 'out';

function computeSha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('base64');
}

function processHtmlFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');

  // Extract inline script contents
  const scriptRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  const scriptHashes = new Set();
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptBody = match[2];
    if (scriptBody && scriptBody.trim().length > 0) {
      const hash = computeSha256(scriptBody);
      scriptHashes.add(`'sha256-${hash}'`);
    }
  }

  const hashList = Array.from(scriptHashes).join(' ');
  const scriptSrc = `'self' ${hashList}`.trim();

  // Strict CSP: no unsafe-inline for scripts!
  const cspDirectives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind / standard CSS styling
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${cspDirectives}">`;

  // Remove existing CSP meta tags if any and insert before </head>
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/gi, '');
  if (html.includes('</head>')) {
    html = html.replace('</head>', `  ${cspMetaTag}\n</head>`);
  } else {
    html = `${cspMetaTag}\n${html}`;
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[CSP] Generated CSP with ${scriptHashes.size} inline script hash(es) for ${filePath}`);
}

function walkHtml(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtml(fullPath);
    } else if (entry.name.endsWith('.html')) {
      processHtmlFile(fullPath);
    }
  }
}

if (fs.existsSync(OUT_DIR)) {
  console.log(`[CSP] Generating per-page Content Security Policy for ${OUT_DIR}...`);
  walkHtml(OUT_DIR);
  console.log('✅ CSP generation complete.');
} else {
  console.log(`[CSP] Output directory "${OUT_DIR}" does not exist yet. Skipping CSP generation.`);
}
