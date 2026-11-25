function createShortcutManager({ globalShortcut }) {
  let activeShortcut = null;
  let activeHandler = null;

  function register(accelerator, handler) {
    const target = typeof accelerator === 'string' ? accelerator.trim() : '';
    if (!target) {
      return {
        ok: false,
        activeShortcut,
        error: 'Geçerli bir kısayol seçilmelidir.'
      };
    }

    if (target === activeShortcut && handler === activeHandler) {
      return { ok: true, activeShortcut };
    }

    const previousShortcut = activeShortcut;
    const previousHandler = activeHandler;

    if (previousShortcut) {
      try {
        globalShortcut.unregister(previousShortcut);
      } catch {
        // Ignore unregister error
      }
    }

    let ok = false;
    try {
      ok = Boolean(globalShortcut.register(target, handler));
    } catch {
      ok = false;
    }

    if (ok) {
      activeShortcut = target;
      activeHandler = handler;
      return { ok: true, activeShortcut };
    }

    if (previousShortcut && previousHandler) {
      try {
        globalShortcut.register(previousShortcut, previousHandler);
        activeShortcut = previousShortcut;
        activeHandler = previousHandler;
      } catch {
        activeShortcut = null;
        activeHandler = null;
      }
    } else {
      activeShortcut = null;
      activeHandler = null;
    }

    return {
      ok: false,
      activeShortcut,
      error: `"${target}" kısayolu başka bir uygulama (ör. eski Lumina) tarafından kullanımda. Önceki kısayol korundu.`
    };
  }

  function unregisterAll() {
    try {
      globalShortcut.unregisterAll();
    } catch {
      // Ignore
    }
    activeShortcut = null;
    activeHandler = null;
  }

  return {
    register,
    unregisterAll,
    getActiveShortcut: () => activeShortcut
  };
}

module.exports = {
  createShortcutManager
};
