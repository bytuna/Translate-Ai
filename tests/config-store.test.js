const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore, DEFAULT_SETTINGS } = require('../src/main/config-store');

function makeTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-cfg-'));
  return path.join(dir, 'config.json');
}

function makeMockSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`ENC:${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^ENC:/, '')
  };
}

test('returns defaults and encrypts API key via safeStorage without plaintext on disk', () => {
  const filePath = makeTempFile();
  const store = createConfigStore({ filePath, safeStorage: makeMockSafeStorage(true) });

  assert.equal(store.getPublicSettings().model, DEFAULT_SETTINGS.model);
  assert.equal(store.getPublicSettings().shortcut, 'CommandOrControl+Shift+T');
  assert.equal(store.getPublicSettings().openAtLogin, false);
  assert.equal(store.getPublicSettings().hasApiKey, false);

  store.saveSettings({ apiKey: 'AIza-secret-123', model: 'gemini-2.5-pro', signature: 'İlker' });
  const raw = fs.readFileSync(filePath, 'utf8');
  assert.equal(raw.includes('AIza-secret-123'), false);
  assert.equal(store.getApiKey(), 'AIza-secret-123');
  assert.equal(store.getPublicSettings().hasApiKey, true);
  assert.equal(store.getPublicSettings().model, 'gemini-2.5-pro');

  store.clearApiKey();
  assert.equal(store.getApiKey(), null);
  assert.equal(store.getPublicSettings().hasApiKey, false);
});

test('refuses plaintext API key save when safeStorage encryption is unavailable', () => {
  const filePath = makeTempFile();
  const store = createConfigStore({ filePath, safeStorage: makeMockSafeStorage(false) });

  assert.throws(
    () => store.saveSettings({ apiKey: 'AIza-secret-123' }),
    /şifreleme/i
  );
  assert.equal(store.getApiKey(), null);
});

test('recovers to defaults when config.json is corrupted JSON', () => {
  const filePath = makeTempFile();
  fs.writeFileSync(filePath, '{corrupted json!!!', 'utf8');
  const store = createConfigStore({ filePath, safeStorage: makeMockSafeStorage(true) });

  const pub = store.getPublicSettings();
  assert.equal(pub.model, 'gemini-2.5-flash');
  assert.equal(pub.hasApiKey, false);
});
