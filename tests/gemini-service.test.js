const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGeminiService,
  parseJsonResponse,
  normalizeModelName,
  buildThinkingConfig
} = require('../src/main/gemini-service');

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

test('listModels ranks newest Gemini text models ahead of older 2.x and image/tts variants', async () => {
  const svc = createGeminiService({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-image-preview', displayName: 'Gemini 3.1 Image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3-flash-preview', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent'] }
        ]
      })
    })
  });
  const models = await svc.listModels({ apiKey: 'AIza-KEY' });
  assert.equal(models[0].id, 'gemini-3-flash-preview');
  assert.equal(models[1].id, 'gemini-3.1-pro-preview');
  assert.equal(models[models.length - 1].id, 'gemini-3.1-flash-image-preview');
});

test('buildThinkingConfig picks low-latency config per Gemini generation', () => {
  assert.deepEqual(buildThinkingConfig('gemini-3.1-flash-lite-preview'), { thinkingLevel: 'minimal' });
  assert.deepEqual(buildThinkingConfig('gemini-3-flash-preview'), { thinkingLevel: 'minimal' });
  assert.deepEqual(buildThinkingConfig('gemini-3.1-pro-preview'), { thinkingLevel: 'low' });
  assert.deepEqual(buildThinkingConfig('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.equal(buildThinkingConfig('gemini-2.0-flash'), undefined);
});

test('retries without thinkingConfig automatically if API returns 400 for thinking parameter', async () => {
  const bodies = [];
  const svc = createGeminiService({
    fetchImpl: async (_url, opts) => {
      const parsed = JSON.parse(opts.body);
      bodies.push(parsed);
      if (bodies.length === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid value at thinkingConfig.thinkingLevel' } })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"status":"ok"}' }] } }]
        })
      };
    }
  });

  const res = await svc.testConnection({ apiKey: 'AIza-KEY', model: 'gemini-3.1-flash-lite-preview' });
  assert.equal(res.ok, true);
  assert.equal(typeof res.elapsedMs, 'number');
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
});

test('supports separate fast translateIncomingOnly and suggestReplyOnly for parallel Mode 1 UX', async () => {
  const svc = createGeminiService({
    fetchImpl: async (_url, opts) => {
      const parsed = JSON.parse(opts.body);
      const isTranslate = parsed.generationConfig.responseSchema.required.includes('translation');
      const payload = isTranslate
        ? { detectedLanguage: 'İngilizce', detectedLanguageCode: 'en', translation: 'Fiyat listesini gönderir misiniz?' }
        : { suggestedReplyForeign: 'Dear Sir, please find attached...', suggestedReplyVerification: 'Sayın Yetkili, ekte...' };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
        })
      };
    }
  });

  const [trRes, replyRes] = await Promise.all([
    svc.translateIncomingOnly({ apiKey: 'AIza-KEY', model: 'gemini-3.1-flash-lite-preview', emailText: 'Please send price list.', translationLang: 'tr' }),
    svc.suggestReplyOnly({ apiKey: 'AIza-KEY', model: 'gemini-3.1-flash-lite-preview', emailText: 'Please send price list.', translationLang: 'tr', replyLang: 'auto', tone: 'professional', signature: '' })
  ]);
  assert.equal(trRes.translation, 'Fiyat listesini gönderir misiniz?');
  assert.equal(replyRes.suggestedReplyForeign, 'Dear Sir, please find attached...');
});

test('automatically switches to next available text model on 503/429/404 and reports _usedModel', async () => {
  const calledUrls = [];
  const svc = createGeminiService({
    fetchImpl: async (url) => {
      calledUrls.push(url);
      if (url.includes('?pageSize=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [
              { name: 'models/gemini-3.1-flash-lite-preview', displayName: '3.1 Flash Lite', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.1-flash-image-preview', displayName: 'Image Only', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3-flash-preview', displayName: '3 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', displayName: '2.5 Flash', supportedGenerationMethods: ['generateContent'] }
            ]
          })
        };
      }
      if (url.includes('gemini-3.1-flash-lite-preview')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } })
        };
      }
      if (url.includes('gemini-3-flash-preview')) {
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
                    translation: 'Merhaba'
                  })
                }]
              }
            }]
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const res = await svc.translateIncomingOnly({
    apiKey: 'AIza-KEY',
    model: 'gemini-3.1-flash-lite-preview',
    autoFallback: true,
    fallbackModel: 'auto',
    emailText: 'Hallo',
    translationLang: 'tr'
  });

  assert.equal(res.translation, 'Merhaba');
  assert.equal(res._usedModel, 'gemini-3-flash-preview');
  assert.equal(res._switchedFrom, 'gemini-3.1-flash-lite-preview');
  assert.equal(calledUrls.some((u) => u.includes('image-preview')), false, 'must never fall back to image-only model');
});

test('does not fall back on 401/403 auth errors or when autoFallback is false', async () => {
  let callCount = 0;
  const svc = createGeminiService({
    fetchImpl: async () => {
      callCount += 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'invalid key' } })
      };
    }
  });

  await assert.rejects(
    () => svc.translateIncomingOnly({
      apiKey: 'AIza-BAD',
      model: 'gemini-3.1-flash-lite-preview',
      autoFallback: true,
      fallbackModel: 'gemini-3-flash-preview',
      emailText: 'Hello',
      translationLang: 'tr'
    }),
    /API anahtarı/i
  );
  assert.equal(callCount, 1);
});
