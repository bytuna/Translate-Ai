const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleTranslateService } = require('../src/main/google-translate-service');

test('translates via primary gtx endpoint and extracts detected language', async () => {
  const svc = createGoogleTranslateService({
    fetchImpl: async () => ({
      ok: true,
      json: async () => [[['Merhaba dünya', 'Hello world']], null, 'en']
    })
  });
  const res = await svc.translate({ text: 'Hello world', sourceLang: 'auto', targetLang: 'tr' });
  assert.deepEqual(res, { translatedText: 'Merhaba dünya', detectedLang: 'en' });
});

test('falls back to secondary endpoint when primary fails', async () => {
  let calls = 0;
  const svc = createGoogleTranslateService({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('network');
      return { ok: true, json: async () => ['Guten Tag'] };
    }
  });
  const res = await svc.translate({ text: 'İyi günler', sourceLang: 'tr', targetLang: 'de' });
  assert.equal(res.translatedText, 'Guten Tag');
  assert.equal(calls, 2);
});
