const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('lumina', {
  ai: {
    analyzeEmail: (params) => ipcRenderer.invoke('ai:analyze-email', params),
    composeFromTurkish: (params) => ipcRenderer.invoke('ai:compose-turkish', params),
    reviseReply: (params) => ipcRenderer.invoke('ai:revise-reply', params),
    testConnection: (params) => ipcRenderer.invoke('ai:test-connection', params)
  },
  quick: {
    translate: (params) => ipcRenderer.invoke('quick:translate', params)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
    clearApiKey: () => ipcRenderer.invoke('settings:clear-api-key')
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:read'),
    writeText: (text) => ipcRenderer.invoke('clipboard:write', text)
  },
  window: {
    hide: () => ipcRenderer.send('window:hide'),
    copyAndHide: (text) => ipcRenderer.send('window:copy-and-hide', text),
    setPinned: (pinned) => ipcRenderer.invoke('window:set-pinned', Boolean(pinned)),
    notifySessionState: (hasActive) => ipcRenderer.send('window:session-state', Boolean(hasActive)),
    notifyActiveTab: (tab) => ipcRenderer.send('window:active-tab', String(tab || 'ai'))
  },
  snipper: {
    start: (targetTab) => ipcRenderer.send('snipper:start', String(targetTab || 'ai'))
  },
  events: {
    onClipboardIntake: (cb) => subscribe('clipboard-intake', cb),
    onOcrStatus: (cb) => subscribe('ocr-status', cb),
    onOcrResult: (cb) => subscribe('ocr-result', cb),
    onOcrError: (cb) => subscribe('ocr-error', cb),
    onPinChanged: (cb) => subscribe('pin-changed', cb)
  }
});
