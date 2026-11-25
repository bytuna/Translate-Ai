const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function createGoogleTranslateService({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  async function translate({ text, sourceLang = 'auto', targetLang = 'tr' }) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Çevrilecek metin gereklidir.');
    }

    const sl = encodeURIComponent(sourceLang || 'auto');
    const tl = encodeURIComponent(targetLang || 'tr');
    const q = encodeURIComponent(cleanText);

    try {
      const url1 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${q}`;
      const res1 = await fetchWithTimeout(fetchImpl, url1, timeoutMs);
      if (res1 && res1.ok) {
        const data = await res1.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translatedText = data[0].map((item) => (Array.isArray(item) ? item[0] : '')).join('');
          const detectedLang = typeof data[2] === 'string' ? data[2] : sourceLang;
          return { translatedText, detectedLang };
        }
      }
    } catch {
      // Fallback to secondary endpoint
    }

    try {
      const url2 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=${tl}&q=${q}`;
      const res2 = await fetchWithTimeout(fetchImpl, url2, timeoutMs);
      if (res2 && res2.ok) {
        const data = await res2.json();
        if (Array.isArray(data)) {
          const first = data[0];
          if (Array.isArray(first)) {
            return {
              translatedText: String(first[0] || ''),
              detectedLang: typeof first[1] === 'string' ? first[1] : sourceLang
            };
          }
          return { translatedText: data.join(' '), detectedLang: sourceLang };
        }
        if (typeof data === 'string') {
          return { translatedText: data, detectedLang: sourceLang };
        }
        if (data && Array.isArray(data.sentences)) {
          return {
            translatedText: data.sentences.map((s) => s.trans || '').join(''),
            detectedLang: data.src || sourceLang
          };
        }
      }
    } catch {
      // Fall through to user-friendly error
    }

    throw new Error('Ücretsiz çeviri servisine ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }

  return { translate };
}

module.exports = {
  createGoogleTranslateService
};
