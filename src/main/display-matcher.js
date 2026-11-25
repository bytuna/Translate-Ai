function selectDisplaySource(sources, displays, currentDisplay) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  if (currentDisplay && currentDisplay.id !== undefined) {
    const idStr = String(currentDisplay.id);
    const byId = sources.find((s) => s && String(s.display_id) === idStr);
    if (byId) return byId;
  }
  if (Array.isArray(displays) && currentDisplay) {
    const idx = displays.findIndex((d) => d && d.id === currentDisplay.id);
    if (idx >= 0 && sources[idx]) return sources[idx];
  }
  return sources[0];
}

module.exports = {
  selectDisplaySource
};
