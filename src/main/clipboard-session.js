const MAX_INPUT_CHARS = 25000;

function evaluateClipboardIntake({
  clipboardText = '',
  lastKnownClipboard = '',
  hasActiveSession = false,
  autoFillEnabled = true
}) {
  if (!autoFillEnabled) {
    return { action: 'none', text: '', truncated: false, originalLength: 0 };
  }

  const trimmed = typeof clipboardText === 'string' ? clipboardText.trim() : '';
  if (!trimmed || trimmed === lastKnownClipboard) {
    return { action: 'none', text: '', truncated: false, originalLength: trimmed.length };
  }

  const truncated = trimmed.length > MAX_INPUT_CHARS;
  const text = truncated ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed;

  return {
    action: hasActiveSession ? 'banner' : 'fill',
    text,
    truncated,
    originalLength: trimmed.length
  };
}

module.exports = {
  MAX_INPUT_CHARS,
  evaluateClipboardIntake
};
