import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from './catalogs/en.ts';
import { am } from './catalogs/am.ts';
import { om } from './catalogs/om.ts';

function assertStructureMatches(
  base: Record<string, any>,
  target: Record<string, any>,
  targetName: string,
  prefix = ''
) {
  for (const key of Object.keys(base)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    assert.ok(
      key in target,
      `Missing translation key in catalog "${targetName}": ${fullKey}`
    );

    if (typeof base[key] === 'object' && base[key] !== null) {
      assert.equal(
        typeof target[key],
        'object',
        `Type mismatch for translation group "${fullKey}" in "${targetName}"`
      );
      assertStructureMatches(base[key], target[key], targetName, fullKey);
    } else {
      assert.equal(
        typeof target[key],
        'string',
        `Translation key "${fullKey}" in "${targetName}" should be a string`
      );
      assert.ok(
        target[key].trim().length > 0,
        `Translation key "${fullKey}" in "${targetName}" must not be empty`
      );
    }
  }

  // Also assert target has no extra unknown keys
  for (const key of Object.keys(target)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    assert.ok(
      key in base,
      `Superfluous translation key found in catalog "${targetName}": ${fullKey}`
    );
  }
}

test('i18n catalog parity test: Amharic (am) matches English (en) exactly', () => {
  assertStructureMatches(en, am, 'am');
});

test('i18n catalog parity test: Afaan Oromo (om) matches English (en) exactly', () => {
  assertStructureMatches(en, om, 'om');
});
