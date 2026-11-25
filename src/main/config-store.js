const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = Object.freeze({
  model: 'gemini-2.5-flash',
  customModel: '',
  autoFallback: true,
  fallbackModel: 'auto',
  shortcut: 'CommandOrControl+Shift+T',
  openAtLogin: false,
  autoFillClipboard: true,
  copyAndHide: false,
  hideQuickOnBlur: false,
  signature: '',
  translationLang: 'tr',
  replyLang: 'auto',
  defaultTone: 'professional'
});

const PUBLIC_KEYS = Object.keys(DEFAULT_SETTINGS);

function createConfigStore({ filePath, safeStorage }) {
  if (!filePath) throw new Error('filePath gereklidir.');

  function isEncryptionAvailable() {
    try {
      return Boolean(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  function readRaw() {
    try {
      if (!fs.existsSync(filePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeRaw(data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }

  function buildPublic(raw) {
    const out = {};
    for (const key of PUBLIC_KEYS) {
      out[key] = raw[key] !== undefined ? raw[key] : DEFAULT_SETTINGS[key];
    }
    out.hasApiKey = typeof raw.encryptedApiKey === 'string' && raw.encryptedApiKey.length > 0;
    out.encryptionAvailable = isEncryptionAvailable();
    return out;
  }

  function getPublicSettings() {
    return buildPublic(readRaw());
  }

  function getApiKey() {
    const raw = readRaw();
    if (!raw.encryptedApiKey || typeof raw.encryptedApiKey !== 'string') return null;
    if (!isEncryptionAvailable()) return null;
    try {
      const buf = Buffer.from(raw.encryptedApiKey, 'base64');
      const decrypted = safeStorage.decryptString(buf);
      return decrypted && decrypted.trim() ? decrypted.trim() : null;
    } catch {
      return null;
    }
  }

  function saveSettings(patch = {}) {
    const raw = readRaw();
    const next = { ...raw };

    for (const key of PUBLIC_KEYS) {
      if (patch[key] !== undefined) {
        next[key] = patch[key];
      }
    }

    if (typeof patch.apiKey === 'string' && patch.apiKey.trim().length > 0) {
      if (!isEncryptionAvailable()) {
        throw new Error('Windows şifreleme servisi (DPAPI) kullanılamıyor; API anahtarı düz metin olarak kaydedilmedi.');
      }
      const encrypted = safeStorage.encryptString(patch.apiKey.trim());
      next.encryptedApiKey = Buffer.from(encrypted).toString('base64');
    }

    delete next.apiKey;
    writeRaw(next);
    return buildPublic(next);
  }

  function clearApiKey() {
    const raw = readRaw();
    delete raw.encryptedApiKey;
    delete raw.apiKey;
    writeRaw(raw);
    return buildPublic(raw);
  }

  return {
    getPublicSettings,
    getApiKey,
    saveSettings,
    clearApiKey
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  createConfigStore
};
