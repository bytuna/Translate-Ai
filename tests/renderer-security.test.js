const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');

test('renderer HTML files enforce strict CSP and have zero remote CDN scripts or styles', () => {
  for (const file of ['index.html', 'snipper.html']) {
    const html = fs.readFileSync(path.join(rendererDir, file), 'utf8');
    assert.match(html, /Content-Security-Policy/i);
    assert.equal(/https?:\/\//i.test(html), false, `${file} must not reference remote URLs`);
    assert.equal(/require\s*\(/i.test(html), false, `${file} must not call require()`);
  }
});

test('renderer JS never uses innerHTML or require() and only talks through window.lumina / window.snipper', () => {
  for (const file of ['app.js', 'snipper.js']) {
    const js = fs.readFileSync(path.join(rendererDir, file), 'utf8');
    assert.equal(/\.innerHTML\s*=/i.test(js), false, `${file} must use textContent/DOM APIs, never innerHTML`);
    assert.equal(/require\s*\(/i.test(js), false, `${file} must not call require()`);
  }
});

test('app.js protects unsaved drafts, strips IPC error prefixes, guards stale requests, and routes Ctrl+Enter in revisionInput', () => {
  const appJs = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  assert.match(appJs, /Error invoking remote method/, 'must strip Electron IPC error prefix');
  assert.match(appJs, /aiRequestId/, 'must guard against stale async Gemini responses');
  assert.match(appJs, /quickRequestId/, 'must guard against stale async Quick Translate responses');
  assert.match(appJs, /document\.activeElement\s*===\s*revisionInput/, 'Ctrl+Enter inside revisionInput must submit revision');
  assert.match(appJs, /userEditedInput/, 'must protect unsaved user-edited drafts from clipboard overwrite');
});
