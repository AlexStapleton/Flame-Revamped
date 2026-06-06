const { test } = require('node:test');
const assert = require('node:assert');
const { markActive, msSinceActive, isActive } = require('../utils/activity');

// node's test runner isolates each file in its own process, so the activity
// module starts fresh (lastActiveAt === 0) here. The "before any view" test must
// run first, before any markActive() call below.

test('isActive is false before any view (unattended instance does not probe)', () => {
  assert.strictEqual(isActive(60_000), false);
});

test('isActive is true within the window after a view', () => {
  markActive();
  assert.strictEqual(isActive(60_000), true);
  assert.ok(msSinceActive() < 1_000);
});

test('isActive is false once the view falls outside the window', () => {
  markActive();
  // A zero/negative window means "viewed strictly in the future" — never true.
  assert.strictEqual(isActive(-1), false);
});
