const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZES = [16, 32, 48, 64, 128, 256];
const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');

function buildIcoBuffer(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, 'utf8').toString('base64')}`;

    const win = new BrowserWindow({
      width: 300,
      height: 300,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    await win.loadURL('data:text/html;charset=utf-8,<html><body style="margin:0;background:transparent"></body></html>');

    const entries = [];
    for (const size of SIZES) {
      const base64Png = await win.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement('canvas');
            cv.width = ${size};
            cv.height = ${size};
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, ${size}, ${size});
            resolve(cv.toDataURL('image/png').replace(/^data:image\\/png;base64,/, ''));
          };
          img.onerror = (e) => reject(new Error('SVG load failed'));
          img.src = ${JSON.stringify(svgDataUrl)};
        });
      `);
      const png = Buffer.from(base64Png, 'base64');
      entries.push({ size, png });
      if (size === 256) {
        fs.writeFileSync(path.join(assetsDir, 'icon.png'), png);
      }
      if (size === 32) {
        fs.writeFileSync(path.join(assetsDir, 'tray.png'), png);
      }
    }

    const ico = buildIcoBuffer(entries);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
    console.log(`ICONS_OK: icon.png, tray.png, icon.ico (${ico.length} bytes)`);
    app.exit(0);
  } catch (err) {
    console.error('ICONS_ERROR:', err);
    app.exit(1);
  }
});
