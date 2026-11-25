const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createOcrService } = require('../src/main/ocr-service');

test('passes errorHandler to createWorker and recovers after transient initialization failure', async () => {
  let attempts = 0;
  let sawErrorHandler = false;

  const mockCreateWorker = async (_langs, _oem, opts) => {
    attempts += 1;
    if (opts && typeof opts.errorHandler === 'function') {
      sawErrorHandler = true;
    }
    if (attempts === 1) {
      throw new Error('offline traineddata fetch failed');
    }
    return {
      recognize: async () => ({ data: { text: 'Hello OCR' } }),
      terminate: async () => {}
    };
  };

  const svc = createOcrService({ cachePath: '', createWorkerImpl: mockCreateWorker });
  await assert.rejects(() => svc.recognizeDataUrl('data:image/png;base64,iVBORw0KGgo='), /OCR|çevrimdışı|offline/i);
  assert.equal(sawErrorHandler, true, 'must pass errorHandler so tesseract.js never throws uncaught in worker listener');

  const text = await svc.recognizeDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(text, 'Hello OCR');
  assert.equal(attempts, 2);
});

test('package.json unpacks tesseract.js and tesseract.js-core from ASAR for packaged exe builds', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const unpack = (pkg.build && pkg.build.asarUnpack) || [];
  assert.equal(
    unpack.some((p) => p.includes('tesseract.js')),
    true,
    'build.asarUnpack must include tesseract.js'
  );
  assert.equal(
    unpack.some((p) => p.includes('tesseract.js-core')),
    true,
    'build.asarUnpack must include tesseract.js-core'
  );
});
