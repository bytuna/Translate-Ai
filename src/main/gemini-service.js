const {
  buildAnalyzePayload,
  buildComposePayload,
  buildRevisePayload
} = require('./prompt-builder');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 30000;

function scrubSecret(message, apiKey) {
  const str = String(message || '');
  if (!apiKey) return str;
  return str.split(apiKey).join('[REDACTED]');
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

function classifyHttpError(status, detail, apiKey) {
  const safeDetail = scrubSecret(detail, apiKey);
  if (status === 401 || status === 403) {
    return new Error('Gemini API anahtarı geçersiz veya yetkisiz. Lütfen Ayarlar ekranından anahtarınızı kontrol edin.');
  }
  if (status === 404) {
    return new Error('Seçilen Gemini modeli bulunamadı. Ayarlar ekranından model adını kontrol edin.');
  }
  if (status === 429) {
    return new Error('Gemini API kullanım kotası veya hız limiti aşıldı (429). Kısa süre sonra tekrar deneyin.');
  }
  if (status >= 500) {
    return new Error(`Gemini sunucusu geçici olarak yanıt veremiyor (HTTP ${status}). Lütfen tekrar deneyin.`);
  }
  return new Error(`Gemini API hatası (HTTP ${status})${safeDetail ? `: ${safeDetail.slice(0, 180)}` : ''}`);
}

function createGeminiService({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  async function generateStructured({ apiKey, model = 'gemini-2.5-flash', systemInstruction, userPrompt, responseSchema }) {
    if (!apiKey || !String(apiKey).trim()) {
      throw new Error('Gemini API anahtarı kayıtlı değil. Lütfen Ayarlar sekmesinden anahtarınızı girin.');
    }
    const cleanKey = String(apiKey).trim();
    const cleanModel = String(model || 'gemini-2.5-flash').trim();
    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(cleanModel)}:generateContent`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema
      }
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
        throw classifyHttpError(response.status, detail, cleanKey);
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
        throw new Error('Gemini API isteği zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
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

  async function analyzeEmail({ apiKey, model, emailText, translationLang, replyLang, tone, signature }) {
    if (!emailText || !emailText.trim()) {
      throw new Error('Lütfen çevrilecek e-posta metnini girin.');
    }
    const payload = buildAnalyzePayload({ emailText, translationLang, replyLang, tone, signature });
    return generateStructured({ apiKey, model, ...payload });
  }

  async function composeFromTurkish({ apiKey, model, turkishDraft, targetLang, tone, signature }) {
    if (!turkishDraft || !turkishDraft.trim()) {
      throw new Error('Lütfen dönüştürülecek Türkçe metni yazın.');
    }
    const payload = buildComposePayload({ turkishDraft, targetLang, tone, signature });
    return generateStructured({ apiKey, model, ...payload });
  }

  async function reviseReply({
    apiKey,
    model,
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
    return generateStructured({ apiKey, model, ...payload });
  }

  async function testConnection({ apiKey, model = 'gemini-2.5-flash' }) {
    const res = await generateStructured({
      apiKey,
      model,
      systemInstruction: 'Return JSON {"status":"ok"}.',
      userPrompt: 'Ping',
      responseSchema: {
        type: 'OBJECT',
        properties: { status: { type: 'STRING' } },
        required: ['status']
      }
    });
    return { ok: Boolean(res && res.status), model };
  }

  return {
    analyzeEmail,
    composeFromTurkish,
    reviseReply,
    testConnection
  };
}

module.exports = {
  createGeminiService,
  parseJsonResponse
};
