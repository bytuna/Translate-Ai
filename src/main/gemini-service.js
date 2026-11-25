const {
  buildAnalyzePayload,
  buildTranslateOnlyPayload,
  buildSuggestReplyPayload,
  buildComposePayload,
  buildRevisePayload
} = require('./prompt-builder');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 45000;

function scrubSecret(message, apiKey) {
  const str = String(message || '');
  if (!apiKey) return str;
  return str.split(apiKey).join('[REDACTED]');
}

function normalizeModelName(model) {
  const raw = typeof model === 'string' ? model.trim() : '';
  const stripped = raw.replace(/^models\//i, '').trim();
  if (!stripped || stripped.toLowerCase() === 'custom') {
    throw new Error('Lütfen geçerli bir Gemini model adı seçin veya "Modelleri Getir" butonuna basın.');
  }
  return stripped;
}

function parseJsonResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Gemini boş yanıt döndürdü.');
  }
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error('Gemini yanıtı JSON formatında ayrıştırılamadı.');
      }
    } else {
      throw new Error('Gemini yanıtı JSON formatında ayrıştırılamadı.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini yanıtı JSON formatında ayrıştırılamadı.');
  }
  return parsed;
}

function classifyHttpError(status, detail, apiKey, modelName = '') {
  const safeDetail = scrubSecret(detail, apiKey);
  let err;
  if (status === 401 || status === 403) {
    err = new Error('Gemini API anahtarı geçersiz veya yetkisiz. Lütfen Ayarlar ekranından anahtarınızı kontrol edin.');
  } else if (status === 404) {
    const label = modelName ? ` ("${modelName}")` : '';
    const extra = safeDetail ? ` [${safeDetail.slice(0, 160)}]` : '';
    err = new Error(
      `Seçilen Gemini modeli${label} bulunamadı. Ayarlar'dan "Modelleri Getir" butonuna basıp aktif bir model seçin.${extra}`
    );
    err.retryableModelError = true;
  } else if (status === 429) {
    err = new Error('Gemini API kullanım kotası veya hız limiti aşıldı (429). Kısa süre sonra tekrar deneyin.');
    err.retryableModelError = true;
  } else if (status >= 500) {
    err = new Error(`Gemini sunucusu geçici olarak yanıt veremiyor (HTTP ${status}). Lütfen tekrar deneyin.`);
    err.retryableModelError = true;
  } else {
    err = new Error(`Gemini API hatası (HTTP ${status})${safeDetail ? `: ${safeDetail.slice(0, 180)}` : ''}`);
  }
  err.httpStatus = status;
  return err;
}

function isTextChatModel(id) {
  const lower = String(id || '').toLowerCase();
  if (!lower.startsWith('gemini-')) return false;
  return !/(image|tts|audio|robotics|computer-use|deep-research|customtools|live|vision|exp-|embedding)/.test(lower);
}

function rankGeminiModel(id) {
  const lower = String(id || '').toLowerCase();
  let score = 0;
  if (!lower.startsWith('gemini-')) score -= 5000;
  if (/(image|tts|audio|robotics|computer-use|deep-research|customtools|live|vision|exp-)/.test(lower)) {
    score -= 10000;
  }
  const verMatch = lower.match(/^gemini-(\d+)(?:\.(\d+))?/);
  if (verMatch) {
    const major = Number(verMatch[1]) || 0;
    const minor = Number(verMatch[2]) || 0;
    score += major * 1000 + minor * 10;
  }
  if (/flash/.test(lower) && !/lite|8b/.test(lower)) {
    score += 150;
  } else if (/flash-lite/.test(lower)) {
    score += 120;
  } else if (/pro/.test(lower)) {
    score += 100;
  }
  return score;
}

function buildThinkingConfig(model) {
  const lower = String(model || '').toLowerCase();
  const verMatch = lower.match(/^gemini-(\d+)(?:\.(\d+))?/);
  if (!verMatch) return undefined;
  const major = Number(verMatch[1]) || 0;
  const minor = Number(verMatch[2]) || 0;

  if (major >= 3) {
    if (/flash/.test(lower)) {
      return { thinkingLevel: 'minimal' };
    }
    return { thinkingLevel: 'low' };
  }
  if (major === 2 && minor === 5 && /flash/.test(lower)) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

function createGeminiService({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const modelListCache = new Map();
  const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

  async function generateStructured({
    apiKey,
    model = 'gemini-2.5-flash',
    systemInstruction,
    userPrompt,
    responseSchema,
    allowThinkingFallback = true,
    attemptTimeoutMs = timeoutMs
  }) {
    if (!apiKey || !String(apiKey).trim()) {
      throw new Error('Gemini API anahtarı kayıtlı değil. Lütfen Ayarlar sekmesinden anahtarınızı girin.');
    }
    const cleanKey = String(apiKey).trim();
    const cleanModel = normalizeModelName(model);
    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(cleanModel)}:generateContent`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

    const thinkingConfig = allowThinkingFallback ? buildThinkingConfig(cleanModel) : undefined;
    const generationConfig = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema
    };
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig
    };

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errJson = await response.json();
          detail = errJson && errJson.error && errJson.error.message ? errJson.error.message : '';
        } catch {
          try {
            detail = await response.text();
          } catch {
            detail = '';
          }
        }
        if (
          response.status === 400 &&
          thinkingConfig &&
          /thinking/i.test(detail)
        ) {
          clearTimeout(timer);
          return generateStructured({
            apiKey: cleanKey,
            model: cleanModel,
            systemInstruction,
            userPrompt,
            responseSchema,
            allowThinkingFallback: false
          });
        }
        throw classifyHttpError(response.status, detail, cleanKey, cleanModel);
      }

      const data = await response.json();
      if (data && data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`İçerik Gemini güvenlik filtresi tarafından engellendi (${data.promptFeedback.blockReason}).`);
      }

      const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
      if (!candidate) {
        throw new Error('Gemini yanıt adayı üretmedi. Lütfen tekrar deneyin.');
      }
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
        throw new Error('Yanıt Gemini güvenlik politikası nedeniyle engellendi.');
      }

      const parts = candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
      return parseJsonResponse(text);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const timeoutErr = new Error('Gemini API isteği zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
        timeoutErr.retryableModelError = true;
        throw timeoutErr;
      }
      if (
        err &&
        (err.name === 'TypeError' ||
          /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(String(err.message || '')))
      ) {
        throw new Error('Gemini sunucusuna bağlanılamadı. İnternet veya ağ bağlantınızı kontrol edip tekrar deneyin.');
      }
      if (err instanceof Error) {
        err.message = scrubSecret(err.message, cleanKey);
        throw err;
      }
      throw new Error('Gemini API çağrısı sırasında beklenmeyen bir hata oluştu.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function getCachedTextModels(apiKey) {
    const cleanKey = String(apiKey || '').trim();
    const cached = modelListCache.get(cleanKey);
    if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL_MS) {
      return cached.models;
    }
    try {
      const all = await listModels({ apiKey: cleanKey });
      const textModels = all.map((m) => m.id).filter(isTextChatModel);
      modelListCache.set(cleanKey, { ts: Date.now(), models: textModels });
      return textModels;
    } catch {
      return [];
    }
  }

  async function generateWithFallback({
    apiKey,
    model,
    autoFallback = true,
    fallbackModel = 'auto',
    systemInstruction,
    userPrompt,
    responseSchema
  }) {
    const primary = normalizeModelName(model);
    try {
      const res = await generateStructured({
        apiKey,
        model: primary,
        systemInstruction,
        userPrompt,
        responseSchema,
        attemptTimeoutMs: autoFallback ? Math.min(timeoutMs, 20000) : timeoutMs
      });
      return { ...res, _usedModel: primary };
    } catch (firstErr) {
      if (!autoFallback || !firstErr || !firstErr.retryableModelError) {
        throw firstErr;
      }

      const candidates = [];
      const seen = new Set([primary]);

      if (fallbackModel && fallbackModel !== 'auto') {
        try {
          const explicit = normalizeModelName(fallbackModel);
          if (!seen.has(explicit)) {
            seen.add(explicit);
            candidates.push(explicit);
          }
        } catch {
          // Ignore invalid explicit fallback and continue with discovery
        }
      }

      const discovered = await getCachedTextModels(apiKey);
      for (const id of discovered) {
        if (!seen.has(id) && candidates.length < 3) {
          seen.add(id);
          candidates.push(id);
        }
      }

      let lastErr = firstErr;
      const tried = [primary];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        tried.push(candidate);
        const isLast = i === candidates.length - 1;
        try {
          const res = await generateStructured({
            apiKey,
            model: candidate,
            systemInstruction,
            userPrompt,
            responseSchema,
            attemptTimeoutMs: isLast ? timeoutMs : Math.min(timeoutMs, 20000)
          });
          return { ...res, _usedModel: candidate, _switchedFrom: primary };
        } catch (err) {
          lastErr = err;
          if (!err || !err.retryableModelError) {
            throw err;
          }
        }
      }

      if (tried.length > 1 && lastErr instanceof Error) {
        lastErr.message = `${lastErr.message} (Otomatik denenen modeller: ${tried.join(', ')})`;
      }
      throw lastErr;
    }
  }

  async function analyzeEmail({ apiKey, model, autoFallback, fallbackModel, emailText, translationLang, replyLang, tone, signature }) {
    if (!emailText || !emailText.trim()) {
      throw new Error('Lütfen çevrilecek e-posta metnini girin.');
    }
    const payload = buildAnalyzePayload({ emailText, translationLang, replyLang, tone, signature });
    return generateWithFallback({ apiKey, model, autoFallback, fallbackModel, ...payload });
  }

  async function translateIncomingOnly({ apiKey, model, autoFallback, fallbackModel, emailText, translationLang }) {
    if (!emailText || !emailText.trim()) {
      throw new Error('Lütfen çevrilecek e-posta metnini girin.');
    }
    const payload = buildTranslateOnlyPayload({ emailText, translationLang });
    return generateWithFallback({ apiKey, model, autoFallback, fallbackModel, ...payload });
  }

  async function suggestReplyOnly({ apiKey, model, autoFallback, fallbackModel, emailText, translationLang, replyLang, tone, signature }) {
    if (!emailText || !emailText.trim()) {
      throw new Error('Lütfen çevrilecek e-posta metnini girin.');
    }
    const payload = buildSuggestReplyPayload({ emailText, translationLang, replyLang, tone, signature });
    return generateWithFallback({ apiKey, model, autoFallback, fallbackModel, ...payload });
  }

  async function composeFromTurkish({ apiKey, model, autoFallback, fallbackModel, turkishDraft, targetLang, tone, signature }) {
    if (!turkishDraft || !turkishDraft.trim()) {
      throw new Error('Lütfen dönüştürülecek Türkçe metni yazın.');
    }
    const payload = buildComposePayload({ turkishDraft, targetLang, tone, signature });
    return generateWithFallback({ apiKey, model, autoFallback, fallbackModel, ...payload });
  }

  async function reviseReply({
    apiKey,
    model,
    autoFallback,
    fallbackModel,
    mode,
    originalInput,
    currentDraft,
    instruction,
    history,
    translationLang,
    replyLang,
    tone,
    signature
  }) {
    if (!instruction || !instruction.trim()) {
      throw new Error('Lütfen düzenleme talimatınızı yazın.');
    }
    const payload = buildRevisePayload({
      mode,
      originalInput,
      currentDraft,
      instruction,
      history,
      translationLang,
      replyLang,
      tone,
      signature
    });
    return generateWithFallback({ apiKey, model, autoFallback, fallbackModel, ...payload });
  }

  async function testConnection({ apiKey, model = 'gemini-2.5-flash', autoFallback = false, fallbackModel = 'auto' }) {
    const cleanModel = normalizeModelName(model);
    const start = Date.now();
    const res = await generateWithFallback({
      apiKey,
      model: cleanModel,
      autoFallback,
      fallbackModel,
      systemInstruction: 'Return JSON {"status":"ok"}.',
      userPrompt: 'Ping',
      responseSchema: {
        type: 'OBJECT',
        properties: { status: { type: 'STRING' } },
        required: ['status']
      }
    });
    return {
      ok: Boolean(res && res.status),
      model: res._usedModel || cleanModel,
      switchedFrom: res._switchedFrom || null,
      elapsedMs: Date.now() - start
    };
  }

  async function listModels({ apiKey }) {
    if (!apiKey || !String(apiKey).trim()) {
      throw new Error('Gemini API anahtarı kayıtlı değil. Lütfen Ayarlar sekmesinden anahtarınızı girin.');
    }
    const cleanKey = String(apiKey).trim();
    const url = `${GEMINI_BASE_URL}?pageSize=100`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'x-goog-api-key': cleanKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errJson = await response.json();
          detail = errJson && errJson.error && errJson.error.message ? errJson.error.message : '';
        } catch {
          detail = '';
        }
        throw classifyHttpError(response.status, detail, cleanKey);
      }

      const data = await response.json();
      const rawModels = data && Array.isArray(data.models) ? data.models : [];
      return rawModels
        .filter(
          (m) =>
            m &&
            typeof m.name === 'string' &&
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m) => ({
          id: m.name.replace(/^models\//i, ''),
          displayName: m.displayName || m.name.replace(/^models\//i, '')
        }))
        .sort((a, b) => rankGeminiModel(b.id) - rankGeminiModel(a.id));
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Model listesi alınırken zaman aşımı oluştu. İnternet bağlantınızı kontrol edin.');
      }
      if (
        err &&
        (err.name === 'TypeError' ||
          /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(String(err.message || '')))
      ) {
        throw new Error('Gemini sunucusuna bağlanılamadı. İnternet veya ağ bağlantınızı kontrol edin.');
      }
      if (err instanceof Error) {
        err.message = scrubSecret(err.message, cleanKey);
        throw err;
      }
      throw new Error('Model listesi alınamadı.');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    analyzeEmail,
    translateIncomingOnly,
    suggestReplyOnly,
    composeFromTurkish,
    reviseReply,
    testConnection,
    listModels
  };
}

module.exports = {
  createGeminiService,
  parseJsonResponse,
  normalizeModelName,
  buildThinkingConfig
};
