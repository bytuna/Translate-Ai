const fs = require('node:fs');
const path = require('node:path');
const { createWorker } = require('tesseract.js');

function resolveUnpackedPath(moduleRequest) {
  try {
    const resolved = require.resolve(moduleRequest);
    if (resolved.includes('app.asar') && !resolved.includes('app.asar.unpacked')) {
      return resolved.replace('app.asar', 'app.asar.unpacked');
    }
    return resolved;
  } catch {
    return undefined;
  }
}

function createOcrService({ cachePath, createWorkerImpl = createWorker, isPackaged = false } = {}) {
  let workerPromise = null;

  async function getWorker() {
    if (!workerPromise) {
      if (cachePath) {
        fs.mkdirSync(cachePath, { recursive: true });
      }

      let rejectError = null;
      const workerErrorPromise = new Promise((_resolve, reject) => {
        rejectError = reject;
      });

      const opts = {
        errorHandler: (err) => {
          if (rejectError) {
            rejectError(err instanceof Error ? err : new Error(String(err || 'OCR hatası')));
          }
        }
      };

      if (cachePath) {
        opts.cachePath = cachePath;
      }

      if (isPackaged) {
        const workerPath = resolveUnpackedPath('tesseract.js/src/worker-script/node/index.js');
        const corePath = resolveUnpackedPath('tesseract.js-core/tesseract-core.wasm.js');
        if (workerPath) opts.workerPath = workerPath;
        if (corePath) opts.corePath = path.dirname(corePath);
      }

      workerPromise = Promise.race([
        Promise.resolve().then(() => createWorkerImpl('eng+tur', 1, opts)),
        workerErrorPromise
      ]).catch((err) => {
        workerPromise = null;
        throw new Error(
          `OCR motoru başlatılamadı (ilk kullanımda internet bağlantısı gerekebilir): ${err && err.message ? err.message : 'Bilinmeyen hata'}`
        );
      });
    }
    return workerPromise;
  }

  async function recognizeDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('Geçersiz ekran görüntüsü verisi.');
    }
    const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const worker = await getWorker();
    const { data } = await worker.recognize(buffer);
    return (data && typeof data.text === 'string' ? data.text : '').trim();
  }

  async function terminate() {
    if (workerPromise) {
      try {
        const worker = await workerPromise;
        if (worker && typeof worker.terminate === 'function') {
          await worker.terminate();
        }
      } catch {
        // Ignore cleanup errors
      } finally {
        workerPromise = null;
      }
    }
  }

  return {
    recognizeDataUrl,
    terminate
  };
}

module.exports = {
  createOcrService
};
