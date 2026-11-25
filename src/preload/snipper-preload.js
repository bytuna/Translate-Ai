const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snipper', {
  onInit: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, screenDataUrl) => callback(screenDataUrl);
    ipcRenderer.on('init-snip', listener);
    return () => ipcRenderer.removeListener('init-snip', listener);
  },
  cancel: () => ipcRenderer.send('snipper:cancel'),
  done: (croppedDataUrl) => ipcRenderer.send('snipper:done', croppedDataUrl)
});
