import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOOKING_TRANSITIONS } from './status.ts';

test('Parity: booking_transitions in SQL migration matches domain/status.ts exactly', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/0005_bookings_and_calendar.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Parse SQL insert values: ('from', 'to', array['role1', ...], bool)
  const insertRegex = /\('([a-z_]+)',\s*'([a-z_]+)',\s*array\[([^\]]+)\]::public\.member_role\[\],\s*(true|false)\)/g;
  const sqlTransitions: Array<{
    from: string;
    to: string;
    roles: string[];
    customerAllowed: boolean;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = insertRegex.exec(sql)) !== null) {
    const from = match[1];
    const to = match[2];
    const roles = match[3]
      .split(',')
      .map((r) => r.replace(/['"\s]/g, ''))
      .sort();
    const customerAllowed = match[4] === 'true';

    sqlTransitions.push({ from, to, roles, customerAllowed });
  }

  assert.equal(
    sqlTransitions.length,
    BOOKING_TRANSITIONS.length,
    `Transition count must match (${BOOKING_TRANSITIONS.length})`
  );

  for (const domainT of BOOKING_TRANSITIONS) {
    const sqlT = sqlTransitions.find((t) => t.from === domainT.from && t.to === domainT.to);
    assert.ok(sqlT, `Missing transition in SQL: ${domainT.from} -> ${domainT.to}`);
    assert.deepEqual(
      sqlT.roles,
      [...domainT.roles].sort(),
      `Role mismatch for ${domainT.from} -> ${domainT.to}`
    );
    assert.equal(
      sqlT.customerAllowed,
      domainT.customerAllowed,
      `customerAllowed mismatch for ${domainT.from} -> ${domainT.to}`
    );
  }
});
