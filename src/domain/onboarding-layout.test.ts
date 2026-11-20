import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('onboarding layout specification test: fixed regions do not jump or resize', () => {
  const onboardingFilePath = path.join(process.cwd(), 'src', 'app', 'onboarding', 'page.tsx');
  assert.ok(fs.existsSync(onboardingFilePath), 'onboarding page.tsx must exist');

  const content = fs.readFileSync(onboardingFilePath, 'utf8');

  // 1. Verify fixed header region exists with sticky top and shrink-0
  assert.ok(
    content.includes('data-testid="fixed-header-region"'),
    'Onboarding must contain fixed header region'
  );
  assert.ok(
    content.includes('sticky top-0') && content.includes('shrink-0'),
    'Header region must be sticky top and shrink-0 to prevent vertical shift'
  );

  // 2. Verify fixed bottom actions region exists with sticky bottom and shrink-0
  assert.ok(
    content.includes('data-testid="fixed-actions-region"'),
    'Onboarding must contain fixed actions region'
  );
  assert.ok(
    content.includes('sticky bottom-0') && content.includes('shrink-0'),
    'Actions region must be sticky bottom and shrink-0 to stay stationary across all steps'
  );

  // 3. Verify scrollable content region between fixed bars
  assert.ok(
    content.includes('data-testid="scrollable-content-region"'),
    'Onboarding must contain scrollable content region'
  );
  assert.ok(
    content.includes('overflow-y-auto') && content.includes('flex-1'),
    'Content region must scroll independently without shifting action bar'
  );

  // 4. Verify reserved height for validation messages to prevent layout jumping
  assert.ok(
    content.includes('h-6 mt-3') || content.includes('min-h-5'),
    'Onboarding must have reserved message height to prevent layout shift'
  );

  // 5. Verify progress indicator has role="progressbar" with aria attributes
  assert.ok(
    content.includes('role="progressbar"'),
    'Progress bar must have accessible role="progressbar"'
  );
});
