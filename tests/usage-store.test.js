const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUsageStore, estimateCostUsd } = require('../src/main/usage-store');

function makeTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-usage-'));
  return path.join(dir, 'usage.json');
}

test('records daily, monthly, total, and per-model token counts and persists across reloads', () => {
  const filePath = makeTempFile();
  let currentNow = new Date('2026-11-25T10:00:00Z');
  const store = createUsageStore({ filePath, nowFn: () => currentNow });

  const initial = store.getSummary();
  assert.equal(initial.total.totalTokens, 0);
  assert.equal(initial.today.totalTokens, 0);
  assert.equal(initial.last, null);

  store.record({
    model: 'gemini-3.1-flash-lite-preview',
    usage: { promptTokens: 400, outputTokens: 200, thoughtTokens: 50, totalTokens: 650 }
  });

  currentNow = new Date('2026-11-25T14:00:00Z');
  store.record({
    model: 'gemini-3-flash-preview',
    usage: { promptTokens: 1000, outputTokens: 500, thoughtTokens: 0, totalTokens: 1500 }
  });

  const reloaded = createUsageStore({ filePath, nowFn: () => currentNow });
  const summary = reloaded.getSummary();

  assert.equal(summary.today.requests, 2);
  assert.equal(summary.today.totalTokens, 2150);
  assert.equal(summary.month.totalTokens, 2150);
  assert.equal(summary.total.totalTokens, 2150);
  assert.equal(summary.last.model, 'gemini-3-flash-preview');
  assert.equal(summary.last.totalTokens, 1500);
  assert.equal(summary.byModel['gemini-3.1-flash-lite-preview'].totalTokens, 650);
  assert.equal(summary.byModel['gemini-3-flash-preview'].totalTokens, 1500);
  assert.equal(summary.total.estimatedUsd > 0, true);

  reloaded.reset();
  assert.equal(reloaded.getSummary().total.totalTokens, 0);
  assert.equal(reloaded.getSummary().last, null);
});

test('separates daily counters when date rolls over while preserving monthly and total', () => {
  const filePath = makeTempFile();
  let currentNow = new Date('2026-11-25T20:00:00Z');
  const store = createUsageStore({ filePath, nowFn: () => currentNow });

  store.record({
    model: 'gemini-3.1-flash-lite-preview',
    usage: { promptTokens: 100, outputTokens: 100, thoughtTokens: 0, totalTokens: 200 }
  });

  currentNow = new Date('2026-11-26T09:00:00Z');
  const summary = store.getSummary();
  assert.equal(summary.today.totalTokens, 0);
  assert.equal(summary.month.totalTokens, 200);
  assert.equal(summary.total.totalTokens, 200);
});

test('recovers cleanly on corrupted usage.json and estimates model-tiered USD cost', () => {
  const filePath = makeTempFile();
  fs.writeFileSync(filePath, '{bad-json', 'utf8');
  const store = createUsageStore({ filePath });
  assert.equal(store.getSummary().total.totalTokens, 0);

  const liteCost = estimateCostUsd('gemini-3.1-flash-lite-preview', { promptTokens: 1_000_000, outputTokens: 1_000_000, thoughtTokens: 0 });
  const proCost = estimateCostUsd('gemini-3.1-pro-preview', { promptTokens: 1_000_000, outputTokens: 1_000_000, thoughtTokens: 0 });
  assert.equal(proCost > liteCost, true);
});
