const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiService, parseJsonResponse, normalizeModelName } = require('../src/main/gemini-service');

test('sends API key only in x-goog-api-key header and parses structured response', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                detectedLanguage: 'Almanca',
                detectedLanguageCode: 'de',
                translation: 'Teklifinizi bekliyoruz.',
                suggestedReplyForeign: 'Sehr geehrte Damen und Herren...',
                suggestedReplyVerification: 'Sayın Yetkili...'
              })
            }]
          }
        }]
      })
    };
  };

  const svc = createGeminiService({ fetchImpl: mockFetch });
  const result = await svc.analyzeEmail({
    apiKey: 'AIza-TEST-KEY',
    model: 'gemini-2.5-flash',
    emailText: 'Wir warten auf Ihr Angebot.',
    translationLang: 'tr',
    replyLang: 'auto',
    tone: 'professional',
    signature: ''
  });

  assert.equal(capturedUrl.includes('AIza-TEST-KEY'), false);
  assert.equal(capturedHeaders['x-goog-api-key'], 'AIza-TEST-KEY');
  assert.equal(result.detectedLanguage, 'Almanca');
  assert.equal(result.translation, 'Teklifinizi bekliyoruz.');
});

test('unwraps markdown-fenced JSON responses cleanly', () => {
  const parsed = parseJsonResponse('```json\n{"translation":"Merhaba"}\n```');
  assert.equal(parsed.translation, 'Merhaba');
});

test('wraps malformed braced JSON and non-object JSON in clear Turkish error', () => {
  assert.throws(
    () => parseJsonResponse('prefix {not valid json} suffix'),
    /JSON formatında ayrıştırılamadı/i
  );
  assert.throws(
    () => parseJsonResponse('[]'),
    /JSON formatında ayrıştırılamadı/i
  );
});

test('maps offline fetch network errors to clear Turkish message', async () => {
  const svcNet = createGeminiService({
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    }
  });
  await assert.rejects(
    () => svcNet.testConnection({ apiKey: 'AIza-KEY', model: 'gemini-2.5-flash' }),
    /ağ|internet|bağlanılamadı/i
  );
});

test('maps 401/403/429/safety/timeout errors to clear Turkish messages without leaking API key', async () => {
  const secretKey = 'AIza-SUPER-SECRET-999';
  const makeErrorFetch = (status, body) => async () => ({
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });

  const svc401 = createGeminiService({ fetchImpl: makeErrorFetch(401, { error: { message: `bad key ${secretKey}` } }) });
  await assert.rejects(
    () => svc401.testConnection({ apiKey: secretKey, model: 'gemini-2.5-flash' }),
    (err) => /API anahtarı/i.test(err.message) && !err.message.includes(secretKey)
  );

  const svc429 = createGeminiService({ fetchImpl: makeErrorFetch(429, { error: { message: 'quota exceeded' } }) });
  await assert.rejects(
    () => svc429.testConnection({ apiKey: secretKey, model: 'gemini-2.5-flash' }),
    /kota|limit/i
  );

  const svcSafety = createGeminiService({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] })
    })
  });
  await assert.rejects(
    () => svcSafety.composeFromTurkish({
      apiKey: secretKey,
      model: 'gemini-2.5-flash',
      turkishDraft: 'test',
      targetLang: 'en',
      tone: 'formal',
      signature: ''
    }),
    /güvenlik|engellendi/i
  );

  const svcTimeout = createGeminiService({
    timeoutMs: 25,
    fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(
    () => svcTimeout.testConnection({ apiKey: secretKey, model: 'gemini-2.5-flash' }),
    /zaman aşımı/i
  );
});

test('normalizes models/ prefix and rejects literal custom or empty model name', () => {
  assert.equal(normalizeModelName('models/gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeModelName('  gemini-2.0-flash  '), 'gemini-2.0-flash');
  assert.throws(() => normalizeModelName('custom'), /geçerli bir Gemini model/i);
  assert.throws(() => normalizeModelName('   '), /geçerli bir Gemini model/i);
});

test('listModels fetches generateContent models via x-goog-api-key header', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  const svc = createGeminiService({
    fetchImpl: async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              supportedGenerationMethods: ['generateContent', 'countTokens']
            },
            {
              name: 'models/text-embedding-004',
              displayName: 'Text Embedding',
              supportedGenerationMethods: ['embedContent']
            }
          ]
        })
      };
    }
  });

  const models = await svc.listModels({ apiKey: 'AIza-LIST-KEY' });
  assert.equal(capturedUrl.includes('AIza-LIST-KEY'), false);
  assert.equal(capturedHeaders['x-goog-api-key'], 'AIza-LIST-KEY');
  assert.deepEqual(models, [{ id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' }]);
});

test('HTTP 404 error includes model name and sanitized Google error detail', async () => {
  const svc404 = createGeminiService({
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'models/gemini-old is not found for API version v1beta' } })
    })
  });
  await assert.rejects(
    () => svc404.testConnection({ apiKey: 'AIza-KEY', model: 'models/gemini-old' }),
    (err) => err.message.includes('gemini-old') && err.message.includes('not found')
  );
});
