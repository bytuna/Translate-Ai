const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateClipboardIntake, MAX_INPUT_CHARS } = require('../src/main/clipboard-session');

test('fills empty session on new clipboard text and ignores unchanged clipboard', () => {
  const first = evaluateClipboardIntake({
    clipboardText: '  Dear Sir, please send invoice.  ',
    lastKnownClipboard: '',
    hasActiveSession: false,
    autoFillEnabled: true
  });
  assert.equal(first.action, 'fill');
  assert.equal(first.text, 'Dear Sir, please send invoice.');
  assert.equal(first.truncated, false);

  const same = evaluateClipboardIntake({
    clipboardText: 'Dear Sir, please send invoice.',
    lastKnownClipboard: 'Dear Sir, please send invoice.',
    hasActiveSession: false,
    autoFillEnabled: true
  });
  assert.equal(same.action, 'none');
});

test('returns non-destructive banner when an active session is already open', () => {
  const res = evaluateClipboardIntake({
    clipboardText: '2500 EUR',
    lastKnownClipboard: 'old email',
    hasActiveSession: true,
    autoFillEnabled: true
  });
  assert.equal(res.action, 'banner');
  assert.equal(res.text, '2500 EUR');
});

test('truncates oversized email threads above 25000 chars cleanly', () => {
  const huge = 'a'.repeat(MAX_INPUT_CHARS + 500);
  const res = evaluateClipboardIntake({
    clipboardText: huge,
    lastKnownClipboard: '',
    hasActiveSession: false,
    autoFillEnabled: true
  });
  assert.equal(res.action, 'fill');
  assert.equal(res.truncated, true);
  assert.equal(res.text.length, MAX_INPUT_CHARS);
  assert.equal(res.originalLength, MAX_INPUT_CHARS + 500);
});
