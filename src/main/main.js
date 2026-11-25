const {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  clipboard,
  desktopCapturer,
  safeStorage,
  net
} = require('electron');
const path = require('node:path');

const { createConfigStore } = require('./config-store');
const { createGeminiService } = require('./gemini-service');
const { createGoogleTranslateService } = require('./google-translate-service');
const { evaluateClipboardIntake } = require('./clipboard-session');
const { createShortcutManager } = require('./shortcut-manager');
const { createOcrService } = require('./ocr-service');
const { selectDisplaySource } = require('./display-matcher');
const { createUsageStore } = require('./usage-store');

const IS_SMOKE_TEST = process.argv.includes('--smoke-test');

app.setAppUserModelId('com.bytuna.lumina-ai-mail');

if (!IS_SMOKE_TEST) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    process.exit(0);
  }
}

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isPinned = false;
let activeTab = 'ai';
let hasActiveSession = false;
let lastKnownClipboard = '';
let pendingSnipTargetTab = 'ai';
let isQuitting = false;
let startupShortcutWarning = null;

let configStore = null;
let geminiService = null;
let googleTranslateService = null;
let shortcutManager = null;
let ocrService = null;
let usageStore = null;

function recordUsageFromResult(res, fallbackModelName) {
  if (!usageStore || !res || !res._usage) return;
  const summary = usageStore.record({
    model: res._usedModel || res.model || fallbackModelName,
    usage: res._usage
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('usage-updated', summary);
  }
}

function resolveActiveModel(settings) {
  if (settings.model === 'custom' && settings.customModel && settings.customModel.trim()) {
    return settings.customModel.trim();
  }
  return settings.model || 'gemini-2.5-flash';
}

function centerWindowOnActiveDisplay() {
  if (!mainWindow) return;
  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = currentDisplay.workArea || currentDisplay.bounds;
  const [winWidth, winHeight] = mainWindow.getSize();
  const centerX = Math.round(x + (width - winWidth) / 2);
  const centerY = Math.round(y + (height - winHeight) / 2);
  mainWindow.setPosition(centerX, centerY);
}

function buildTrayIcon() {
  const trayPngPath = path.join(__dirname, '..', '..', 'assets', 'tray.png');
  const loaded = nativeImage.createFromPath(trayPngPath);
  if (loaded && !loaded.isEmpty()) {
    return loaded.resize({ width: 16, height: 16 });
  }
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (x >= 1 && x <= 14 && y >= 1 && y <= 14) {
        const isLVert = x >= 4 && x <= 5 && y >= 3 && y <= 12;
        const isLHoriz = x >= 4 && x <= 11 && y >= 11 && y <= 12;
        const isDot = x >= 10 && x <= 11 && y >= 4 && y <= 5;
        if (isLVert || isLHoriz || isDot) {
          buffer[idx] = 255;
          buffer[idx + 1] = 255;
          buffer[idx + 2] = 255;
          buffer[idx + 3] = 255;
        } else {
          buffer[idx] = 16;
          buffer[idx + 1] = 185;
          buffer[idx + 2] = 129;
          buffer[idx + 3] = 255;
        }
      } else {
        buffer[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function updateTrayMenu() {
  if (!tray) return;
  const settings = configStore.getPublicSettings();
  const shortcutLabel = settings.shortcut.replace('CommandOrControl', 'Ctrl');
  const contextMenu = Menu.buildFromTemplate([
    { label: `Lumina AI Mail'i Aç (${shortcutLabel})`, click: () => showWindow(true) },
    {
      label: isPinned ? 'Sabitlemeyi Kaldır ✓' : 'Üstte Sabitle (Pin)',
      click: () => setPinned(!isPinned)
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip(`Lumina AI Mail (${shortcutLabel})`);
  tray.setContextMenu(contextMenu);
}

function setPinned(nextPinned) {
  isPinned = Boolean(nextPinned);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(isPinned, 'floating');
    mainWindow.webContents.send('pin-changed', isPinned);
  }
  updateTrayMenu();
  return isPinned;
}

function showWindow(checkClipboard = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  centerWindowOnActiveDisplay();
  mainWindow.show();
  mainWindow.focus();

  if (checkClipboard) {
    const settings = configStore.getPublicSettings();
    const clipText = clipboard.readText();
    const intake = evaluateClipboardIntake({
      clipboardText: clipText,
      lastKnownClipboard,
      hasActiveSession,
      autoFillEnabled: settings.autoFillClipboard
    });
    if (intake.action !== 'none') {
      lastKnownClipboard = typeof clipText === 'string' ? clipText.trim() : '';
      mainWindow.webContents.send('clipboard-intake', intake);
    }
  }
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow(true);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('blur', () => {
    if (overlayWindow || isPinned) return;
    const settings = configStore.getPublicSettings();
    if (activeTab === 'quick' && settings.hideQuickOnBlur) {
      mainWindow.hide();
    }
  });
}

async function startSnipping(targetTab = 'ai') {
  pendingSnipTargetTab = targetTab;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = currentDisplay.bounds;

  try {
    const scale = currentDisplay.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
      }
    });

    const allDisplays = screen.getAllDisplays();
    const chosenSource = selectDisplaySource(sources, allDisplays, currentDisplay);
    if (!chosenSource) {
      throw new Error('Ekran görüntüsü kaynağı alınamadı.');
    }
    const screenDataUrl = chosenSource.thumbnail.toDataURL();

    overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'snipper-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'snipper.html'));
    overlayWindow.webContents.on('did-finish-load', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('init-snip', screenDataUrl);
      }
    });
    overlayWindow.on('closed', () => {
      overlayWindow = null;
    });
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showWindow(false);
      mainWindow.webContents.send('ocr-error', {
        message: err instanceof Error ? err.message : 'Ekran kırpma başlatılamadı.',
        targetTab: pendingSnipTargetTab
      });
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => {
    return {
      settings: configStore.getPublicSettings(),
      activeShortcut: shortcutManager.getActiveShortcut(),
      shortcutWarning: startupShortcutWarning
    };
  });

  ipcMain.handle('settings:save', (_event, patch = {}) => {
    const current = configStore.getPublicSettings();
    let shortcutWarning = null;
    const sanitizedPatch = { ...patch };

    if (
      typeof patch.shortcut === 'string' &&
      patch.shortcut.trim() &&
      patch.shortcut !== shortcutManager.getActiveShortcut()
    ) {
      const reg = shortcutManager.register(patch.shortcut, toggleWindow);
      if (!reg.ok) {
        shortcutWarning = reg.error;
        sanitizedPatch.shortcut = reg.activeShortcut || current.shortcut;
      } else {
        startupShortcutWarning = null;
      }
    }

    const updated = configStore.saveSettings(sanitizedPatch);

    if (typeof sanitizedPatch.openAtLogin === 'boolean' && !IS_SMOKE_TEST) {
      try {
        app.setLoginItemSettings({
          openAtLogin: updated.openAtLogin,
          path: process.execPath,
          args: app.isPackaged ? [] : [path.resolve(__dirname, '..', '..')]
        });
      } catch {
        // Non-fatal on restricted environments
      }
    }

    updateTrayMenu();
    return {
      settings: updated,
      activeShortcut: shortcutManager.getActiveShortcut(),
      shortcutWarning
    };
  });

  ipcMain.handle('settings:clear-api-key', () => {
    return { settings: configStore.clearApiKey() };
  });

  ipcMain.handle('ai:analyze-email', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = configStore.getApiKey();
    const model = resolveActiveModel(settings);
    const res = await geminiService.analyzeEmail({
      apiKey,
      model,
      autoFallback: settings.autoFallback,
      fallbackModel: settings.fallbackModel,
      emailText: params.emailText,
      translationLang: params.translationLang || settings.translationLang,
      replyLang: params.replyLang || settings.replyLang,
      tone: params.tone || settings.defaultTone,
      signature: settings.signature
    });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('ai:translate-only', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = configStore.getApiKey();
    const model = resolveActiveModel(settings);
    const res = await geminiService.translateIncomingOnly({
      apiKey,
      model,
      autoFallback: settings.autoFallback,
      fallbackModel: settings.fallbackModel,
      emailText: params.emailText,
      translationLang: params.translationLang || settings.translationLang
    });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('ai:suggest-reply', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = configStore.getApiKey();
    const model = resolveActiveModel(settings);
    const res = await geminiService.suggestReplyOnly({
      apiKey,
      model,
      autoFallback: settings.autoFallback,
      fallbackModel: settings.fallbackModel,
      emailText: params.emailText,
      translationLang: params.translationLang || settings.translationLang,
      replyLang: params.replyLang || settings.replyLang,
      tone: params.tone || settings.defaultTone,
      signature: settings.signature
    });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('ai:compose-turkish', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = configStore.getApiKey();
    const model = resolveActiveModel(settings);
    const res = await geminiService.composeFromTurkish({
      apiKey,
      model,
      autoFallback: settings.autoFallback,
      fallbackModel: settings.fallbackModel,
      turkishDraft: params.turkishDraft,
      targetLang: params.targetLang || 'en',
      tone: params.tone || settings.defaultTone,
      signature: settings.signature
    });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('ai:revise-reply', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = configStore.getApiKey();
    const model = resolveActiveModel(settings);
    const res = await geminiService.reviseReply({
      apiKey,
      model,
      autoFallback: settings.autoFallback,
      fallbackModel: settings.fallbackModel,
      mode: params.mode,
      originalInput: params.originalInput,
      currentDraft: params.currentDraft,
      instruction: params.instruction,
      history: params.history,
      translationLang: params.translationLang || settings.translationLang,
      replyLang: params.replyLang || settings.replyLang,
      tone: params.tone || settings.defaultTone,
      signature: settings.signature
    });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('ai:test-connection', async (_event, params = {}) => {
    const settings = configStore.getPublicSettings();
    const apiKey = (params.apiKey && params.apiKey.trim()) || configStore.getApiKey();
    const model =
      params.model === 'custom'
        ? (params.customModel || '').trim()
        : params.model || resolveActiveModel(settings);
    const autoFallback = params.autoFallback !== undefined ? Boolean(params.autoFallback) : settings.autoFallback;
    const fallbackModel = params.fallbackModel || settings.fallbackModel;
    const res = await geminiService.testConnection({ apiKey, model, autoFallback, fallbackModel });
    recordUsageFromResult(res, model);
    return res;
  });

  ipcMain.handle('usage:get', () => usageStore.getSummary());
  ipcMain.handle('usage:reset', () => {
    const summary = usageStore.reset();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('usage-updated', summary);
    }
    return summary;
  });

  ipcMain.handle('ai:list-models', async (_event, params = {}) => {
    const apiKey = (params.apiKey && params.apiKey.trim()) || configStore.getApiKey();
    return geminiService.listModels({ apiKey });
  });

  ipcMain.handle('quick:translate', async (_event, params = {}) => {
    return googleTranslateService.translate({
      text: params.text,
      sourceLang: params.sourceLang || 'auto',
      targetLang: params.targetLang || 'tr'
    });
  });

  ipcMain.handle('clipboard:read', () => {
    const text = clipboard.readText() || '';
    lastKnownClipboard = text.trim();
    return text;
  });

  ipcMain.handle('clipboard:write', (_event, text) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text);
      lastKnownClipboard = text.trim();
    }
    return true;
  });

  ipcMain.handle('window:set-pinned', (_event, pinned) => setPinned(pinned));

  ipcMain.on('window:hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });

  ipcMain.on('window:copy-and-hide', (_event, text) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text);
      lastKnownClipboard = text.trim();
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });

  ipcMain.on('window:session-state', (_event, active) => {
    hasActiveSession = Boolean(active);
  });

  ipcMain.on('window:active-tab', (_event, tab) => {
    activeTab = tab;
  });

  ipcMain.on('snipper:start', (_event, targetTab) => {
    startSnipping(targetTab);
  });

  ipcMain.on('snipper:cancel', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    showWindow(false);
  });

  ipcMain.on('snipper:done', async (_event, croppedDataUrl) => {
    const targetTab = pendingSnipTargetTab;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    showWindow(false);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ocr-status', { busy: true, targetTab });
    }
    try {
      const text = await ocrService.recognizeDataUrl(croppedDataUrl);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ocr-status', { busy: false, targetTab });
        if (text) {
          mainWindow.webContents.send('ocr-result', { text, targetTab });
        } else {
          mainWindow.webContents.send('ocr-error', {
            message: 'Seçilen alanda okunabilir metin bulunamadı.',
            targetTab
          });
        }
      }
    } catch (err) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ocr-status', { busy: false, targetTab });
        mainWindow.webContents.send('ocr-error', {
          message: err instanceof Error ? err.message : 'OCR okuma hatası oluştu.',
          targetTab
        });
      }
    }
  });
}

app.on('second-instance', () => {
  showWindow(true);
});

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  configStore = createConfigStore({
    filePath: path.join(userData, 'config.json'),
    safeStorage
  });
  usageStore = createUsageStore({
    filePath: path.join(userData, 'usage.json')
  });
  const electronFetch = (url, opts) => net.fetch(url, opts);
  geminiService = createGeminiService({ fetchImpl: electronFetch });
  googleTranslateService = createGoogleTranslateService({ fetchImpl: electronFetch });
  shortcutManager = createShortcutManager({ globalShortcut });
  ocrService = createOcrService({
    cachePath: path.join(userData, 'tessdata'),
    isPackaged: app.isPackaged
  });

  registerIpcHandlers();
  createWindow();

  const settings = configStore.getPublicSettings();
  if (!IS_SMOKE_TEST) {
    const reg = shortcutManager.register(settings.shortcut, toggleWindow);
    startupShortcutWarning = reg.ok ? null : reg.error;
    tray = new Tray(buildTrayIcon());
    updateTrayMenu();
    tray.on('click', () => toggleWindow());

    mainWindow.once('ready-to-show', () => {
      showWindow(false);
    });
  } else {
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error(`SMOKE_FAIL_LOAD: ${code} ${desc}`);
      app.exit(1);
    });
    mainWindow.webContents.on('console-message', (_e, level, msg) => {
      if (level >= 3) {
        console.error(`SMOKE_CONSOLE_ERROR: ${msg}`);
        app.exit(1);
      }
    });
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const hasBridge = await mainWindow.webContents.executeJavaScript('Boolean(window.lumina && window.lumina.ai && window.lumina.settings)');
        const hasNode = await mainWindow.webContents.executeJavaScript('typeof require !== "undefined"');
        if (!hasBridge || hasNode) {
          console.error(`SMOKE_BRIDGE_FAIL: hasBridge=${hasBridge}, hasNode=${hasNode}`);
          app.exit(1);
          return;
        }
        console.log('SMOKE_OK');
        isQuitting = true;
        app.exit(0);
      } catch (err) {
        console.error('SMOKE_EVAL_ERROR:', err);
        app.exit(1);
      }
    });
  }
});

app.on('will-quit', async () => {
  if (shortcutManager) shortcutManager.unregisterAll();
  if (ocrService) await ocrService.terminate();
});
