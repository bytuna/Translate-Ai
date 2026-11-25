const test = require('node:test');
const assert = require('node:assert/strict');
const { createShortcutManager } = require('../src/main/shortcut-manager');

test('reverts to previous shortcut and returns Turkish warning on conflict', () => {
  const registered = new Set();
  const mockGlobalShortcut = {
    register: (acc) => {
      if (acc === 'CommandOrControl+Alt+T') return false;
      registered.add(acc);
      return true;
    },
    unregister: (acc) => registered.delete(acc),
    unregisterAll: () => registered.clear()
  };

  const mgr = createShortcutManager({ globalShortcut: mockGlobalShortcut });
  const init = mgr.register('CommandOrControl+Shift+T', () => {});
  assert.equal(init.ok, true);
  assert.equal(init.activeShortcut, 'CommandOrControl+Shift+T');

  const conflict = mgr.register('CommandOrControl+Alt+T', () => {});
  assert.equal(conflict.ok, false);
  assert.equal(conflict.activeShortcut, 'CommandOrControl+Shift+T');
  assert.match(conflict.error, /başka bir uygulama|kullanımda/i);
  assert.equal(registered.has('CommandOrControl+Shift+T'), true);
});
