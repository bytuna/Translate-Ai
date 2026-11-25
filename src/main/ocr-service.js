const fs = require('node:fs');
const { createWorker } = require('tesseract.js');

function createOcrService({ cachePath }) {
  let workerPromise = null;

  async function getWorker() {
    if (!workerPromise) {
      if (cachePath) {
        fs.mkdirSync(cachePath, { recursive: true });
      }
      workerPromise = createWorker('eng+tur', 1, cachePath ? { cachePath } : {});
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
        await worker.terminate();
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
