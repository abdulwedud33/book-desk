#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIRS = ['out', 'src', 'booking-page'];

// Patterns indicating leaked service-role keys, model keys, or db credentials
const SECRET_PATTERNS = [
  { name: 'OpenAI Secret Key', regex: /sk-[a-zA-Z0-9]{32,}/ },
  { name: 'Anthropic Secret Key', regex: /sk-ant-[a-zA-Z0-9-_]{32,}/ },
  { name: 'Google AI API Key', regex: /AIzaSy[a-zA-Z0-9-_]{33}/ },
  { name: 'Postgres Connection String with Password', regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/ },
  { name: 'Generic Private Key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
];

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function scanContent(filePath, content) {
  const violations = [];

  // Check known secret regexes
  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(content)) {
      violations.push(`Found potential ${name} in ${filePath}`);
    }
  }

  // Check for any JWT
  const jwtRegex = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
  let match;
  while ((match = jwtRegex.exec(content)) !== null) {
    const token = match[0];
    const payload = decodeJwtPayload(token);
    if (payload) {
      if (payload.role && payload.role !== 'anon') {
        violations.push(`Found non-anon JWT with role "${payload.role}" in ${filePath}`);
      }
      if (payload.role === 'service_role') {
        violations.push(`CRITICAL: Service role JWT leaked in ${filePath}`);
      }
    }
  }

  return violations;
}

function walkDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
        files = files.concat(walkDir(fullPath));
      }
    } else if (/\.(js|mjs|cjs|html|css|json|map|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function runSecretScan(specificPath = null) {
  const filesToScan = specificPath ? (fs.existsSync(specificPath) ? [specificPath] : []) : TARGET_DIRS.flatMap(walkDir);
  const allViolations = [];

  for (const file of filesToScan) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const violations = scanContent(file, content);
      allViolations.push(...violations);
    } catch {
      // Ignore unreadable binary or locked files
    }
  }

  return allViolations;
}

if (process.argv[1] && process.argv[1].endsWith('scan-bundle-secrets.mjs')) {
  const target = process.argv[2] || null;
  console.log(`[Secret Scan] Scanning ${target || TARGET_DIRS.join(', ')}...`);
  const violations = runSecretScan(target);

  if (violations.length > 0) {
    console.error('\n🚨 SECRET SCAN FAILED! Disallowed secrets or non-anon JWTs found:');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  } else {
    console.log('✅ Secret scan clean. No service-role keys, model keys, or non-anon JWTs detected.');
    process.exit(0);
  }
}

