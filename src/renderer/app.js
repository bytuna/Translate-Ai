(() => {
  const api = window.lumina;
  if (!api) return;

  const state = {
    activeTab: 'ai',
    submode: 'incoming', // 'incoming' | 'compose'
    tone: 'professional',
    pinned: false,
    settings: null,
    currentOriginalInput: '',
    currentDraft: null,
    revisionHistory: [],
    pendingClipboard: null,
    userEditedInput: false,
    aiRequestId: 0,
    quickRequestId: 0,
    aiBusy: false,
    quickDebounce: null
  };

  function cleanErrorMessage(err, fallback) {
    const raw = err && err.message ? String(err.message) : '';
    const cleaned = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim();
    return cleaned || fallback;
  }

  // DOM helpers
  const $ = (id) => document.getElementById(id);

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const segBtns = document.querySelectorAll('.seg-btn');
  const toneBtns = document.querySelectorAll('#aiToneGroup .tone-btn');

  const pinBtn = $('pinBtn');
  const hideBtn = $('hideBtn');
  const clipboardBanner = $('clipboardBanner');
  const clipboardBannerText = $('clipboardBannerText');
  const loadClipboardBtn = $('loadClipboardBtn');
  const dismissClipboardBtn = $('dismissClipboardBtn');
  const apiKeyBanner = $('apiKeyBanner');
  const goToSettingsBtn = $('goToSettingsBtn');

  const aiInputTitle = $('aiInputTitle');
  const aiInputText = $('aiInputText');
  const aiCharCount = $('aiCharCount');
  const aiTranslationLang = $('aiTranslationLang');
  const translationLangWrap = $('translationLangWrap');
  const aiReplyLang = $('aiReplyLang');
  const replyLangLabel = $('replyLangLabel');
  const aiSubmitBtn = $('aiSubmitBtn');
  const aiSubmitLabel = $('aiSubmitLabel');
  const aiPasteBtn = $('aiPasteBtn');
  const aiOcrBtn = $('aiOcrBtn');
  const aiResetBtn = $('aiResetBtn');

  const aiErrorBox = $('aiErrorBox');
  const aiEmptyState = $('aiEmptyState');
  const aiResults = $('aiResults');
  const translationCard = $('translationCard');
  const detectedLangBadge = $('detectedLangBadge');
  const translationBody = $('translationBody');
  const copyTranslationBtn = $('copyTranslationBtn');

  const subjectCard = $('subjectCard');
  const subjectForeignBody = $('subjectForeignBody');
  const subjectVerifyBody = $('subjectVerifyBody');
  const copySubjectBtn = $('copySubjectBtn');

  const replyCardTitle = $('replyCardTitle');
  const replyForeignBody = $('replyForeignBody');
  const replyVerifyLabel = $('replyVerifyLabel');
  const replyVerifyBody = $('replyVerifyBody');
  const copyReplyBtn = $('copyReplyBtn');
  const copyReplyHideBtn = $('copyReplyHideBtn');
  const quickChips = document.querySelectorAll('.chip-btn');

  const revisionBar = $('revisionBar');
  const aiTokenMeta = $('aiTokenMeta');
  const revisionHistoryEl = $('revisionHistory');
  const revisionInput = $('revisionInput');
  const revisionSendBtn = $('revisionSendBtn');

  const quickSourceLang = $('quickSourceLang');
  const quickTargetLang = $('quickTargetLang');
  const quickSwapBtn = $('quickSwapBtn');
  const quickPasteBtn = $('quickPasteBtn');
  const quickOcrBtn = $('quickOcrBtn');
  const quickSourceText = $('quickSourceText');
  const quickTargetText = $('quickTargetText');
  const quickDetectedBadge = $('quickDetectedBadge');
  const quickTranslateBtn = $('quickTranslateBtn');
  const quickCopyBtn = $('quickCopyBtn');
  const quickCopyHideBtn = $('quickCopyHideBtn');

  const setApiKey = $('setApiKey');
  const toggleApiKeyVisBtn = $('toggleApiKeyVisBtn');
  const clearApiKeyBtn = $('clearApiKeyBtn');
  const apiKeyStatusText = $('apiKeyStatusText');
  const setModel = $('setModel');
  const fetchModelsBtn = $('fetchModelsBtn');
  const customModelWrap = $('customModelWrap');
  const setCustomModel = $('setCustomModel');
  const setAutoFallback = $('setAutoFallback');
  const setFallbackModel = $('setFallbackModel');
  const testApiBtn = $('testApiBtn');
  const testApiResult = $('testApiResult');
  const setSignature = $('setSignature');
  const setShortcut = $('setShortcut');
  const shortcutWarningText = $('shortcutWarningText');
  const setOpenAtLogin = $('setOpenAtLogin');
  const setAutoFillClipboard = $('setAutoFillClipboard');
  const setHideQuickOnBlur = $('setHideQuickOnBlur');
  const saveSettingsBtn = $('saveSettingsBtn');
  const saveSettingsStatus = $('saveSettingsStatus');

  const shortcutHint = $('shortcutHint');
  const toastText = $('toastText');
  const statusUsageBtn = $('statusUsageBtn');
  const resetUsageBtn = $('resetUsageBtn');
  const statLastTokens = $('statLastTokens');
  const statLastDetail = $('statLastDetail');
  const statTodayTokens = $('statTodayTokens');
  const statTodayDetail = $('statTodayDetail');
  const statMonthTokens = $('statMonthTokens');
  const statMonthDetail = $('statMonthDetail');
  const statTotalTokens = $('statTotalTokens');
  const statTotalDetail = $('statTotalDetail');
  const statByModelList = $('statByModelList');

  function formatTokens(n) {
    return `${(Number(n) || 0).toLocaleString('tr-TR')} token`;
  }

  function formatUsd(usd) {
    const num = Number(usd) || 0;
    return `~$${num < 0.01 ? num.toFixed(4) : num.toFixed(3)}`;
  }

  function mergeUsage(a, b) {
    if (!a && !b) return null;
    const p = (a?.promptTokens || 0) + (b?.promptTokens || 0);
    const o = (a?.outputTokens || 0) + (b?.outputTokens || 0);
    const t = (a?.thoughtTokens || 0) + (b?.thoughtTokens || 0);
    const tot = (a?.totalTokens || 0) + (b?.totalTokens || 0) || p + o + t;
    return { promptTokens: p, outputTokens: o, thoughtTokens: t, totalTokens: tot };
  }

  function renderActionTokenMeta(usage, modelName) {
    if (!usage || !usage.totalTokens) {
      aiTokenMeta.classList.add('hidden');
      aiTokenMeta.textContent = '';
      return;
    }
    const thoughtPart = usage.thoughtTokens ? ` · ${usage.thoughtTokens.toLocaleString('tr-TR')} düşünme` : '';
    const modelPart = modelName ? ` · ${modelName}` : '';
    aiTokenMeta.textContent = `Son işlem: ${formatTokens(usage.totalTokens)} (${usage.promptTokens.toLocaleString('tr-TR')} giriş · ${usage.outputTokens.toLocaleString('tr-TR')} çıkış${thoughtPart}${modelPart})`;
    aiTokenMeta.classList.remove('hidden');
  }

  function renderUsageSummary(summary) {
    if (!summary) return;
    statusUsageBtn.textContent = `Bugün: ${formatTokens(summary.today?.totalTokens || 0)}`;

    if (summary.last) {
      statLastTokens.textContent = formatTokens(summary.last.totalTokens);
      statLastDetail.textContent = `${summary.last.promptTokens.toLocaleString('tr-TR')} giriş · ${summary.last.outputTokens.toLocaleString('tr-TR')} çıkış (${summary.last.model})`;
    } else {
      statLastTokens.textContent = '0 token';
      statLastDetail.textContent = 'Henüz işlem yok';
    }

    const today = summary.today || {};
    statTodayTokens.textContent = formatTokens(today.totalTokens);
    statTodayDetail.textContent = `${today.requests || 0} istek · ${formatUsd(today.estimatedUsd)}`;

    const month = summary.month || {};
    statMonthTokens.textContent = formatTokens(month.totalTokens);
    statMonthDetail.textContent = `${month.requests || 0} istek · ${formatUsd(month.estimatedUsd)}`;

    const total = summary.total || {};
    statTotalTokens.textContent = formatTokens(total.totalTokens);
    statTotalDetail.textContent = `${total.requests || 0} istek · ${formatUsd(total.estimatedUsd)}`;

    while (statByModelList.firstChild) {
      statByModelList.removeChild(statByModelList.firstChild);
    }
    const entries = Object.entries(summary.byModel || {});
    entries.forEach(([modelId, bucket]) => {
      const chip = document.createElement('span');
      chip.className = 'model-usage-chip';
      chip.textContent = `${modelId}: ${formatTokens(bucket.totalTokens)} (${bucket.requests || 0} istek)`;
      statByModelList.appendChild(chip);
    });
  }

  let toastTimer = null;
  function showToast(msg) {
    toastText.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastText.textContent = '';
    }, 3000);
  }

  function updateSessionState() {
    const active = Boolean(
      state.currentDraft ||
      state.revisionHistory.length > 0 ||
      state.userEditedInput ||
      (state.submode === 'compose' && aiInputText.value.trim().length > 0)
    );
    api.window.notifySessionState(active);
  }

  function updateCharCount() {
    const len = aiInputText.value.length;
    aiCharCount.textContent = `${len.toLocaleString('tr-TR')} / 25.000 karakter`;
  }

  function setAiError(message) {
    if (!message) {
      aiErrorBox.classList.add('hidden');
      aiErrorBox.textContent = '';
      return;
    }
    aiErrorBox.textContent = message;
    aiErrorBox.classList.remove('hidden');
  }

  function setAiBusy(busy, label) {
    state.aiBusy = busy;
    aiSubmitBtn.disabled = busy;
    revisionSendBtn.disabled = busy;
    revisionInput.disabled = busy;
    quickChips.forEach((c) => {
      c.disabled = busy;
    });
    if (busy) {
      aiSubmitLabel.textContent = label || 'Gemini düşünüyor...';
    } else {
      aiSubmitLabel.textContent =
        state.submode === 'incoming' ? 'Çevir & Örnek Yanıt Oluştur' : 'İş Mailine Dönüştür';
    }
  }

  function switchTab(tab) {
    state.activeTab = tab;
    api.window.notifyActiveTab(tab);
    tabBtns.forEach((btn) => {
      const isMatch = btn.dataset.tab === tab;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    });
  }

  function switchSubmode(submode) {
    state.submode = submode;
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.submode === submode));

    const autoOption = aiReplyLang.querySelector('option[value="auto"]');
    if (submode === 'incoming') {
      aiInputTitle.textContent = 'Gelen E-posta (Göndermeden önce düzenleyebilirsiniz)';
      aiInputText.placeholder =
        "Outlook'tan kopyaladığınız yabancı maili buraya yapıştırın (veya Ctrl+C sonrası kısayolla açın). İsterseniz imza veya hassas satırları sildikten sonra gönderin...";
      translationLangWrap.classList.remove('hidden');
      replyLangLabel.textContent = 'Yanıt Dili';
      if (autoOption) autoOption.hidden = false;
      aiSubmitLabel.textContent = 'Çevir & Örnek Yanıt Oluştur';
      replyCardTitle.textContent = 'Önerilen İş Yanıtı (Gövde)';
      copyReplyBtn.textContent = 'Yanıtı Kopyala';
    } else {
      aiInputTitle.textContent = 'Türkçe Taslağınız (Profesyonel yeni iş mailine dönüştürülür)';
      aiInputText.placeholder =
        'Göndermek istediğiniz cevabı veya notu Türkçe yazın. Örn: "Yarın saat 14:00 için fiyat teklifi toplantısı yapmak istiyoruz, uygun musunuz?"';
      translationLangWrap.classList.add('hidden');
      replyLangLabel.textContent = 'Hedef Mail Dili';
      if (autoOption) autoOption.hidden = true;
      if (aiReplyLang.value === 'auto') aiReplyLang.value = 'en';
      aiSubmitLabel.textContent = 'İş Mailine Dönüştür';
      replyCardTitle.textContent = 'Mail Gövdesi';
      copyReplyBtn.textContent = 'Metni Kopyala';
    }

    resetResultsOnly();
  }

  function resetResultsOnly() {
    state.aiRequestId += 1;
    state.currentDraft = null;
    state.revisionHistory = [];
    setAiBusy(false);
    setAiError('');
    aiResults.classList.add('hidden');
    revisionBar.classList.add('hidden');
    aiTokenMeta.classList.add('hidden');
    aiTokenMeta.textContent = '';
    aiEmptyState.classList.remove('hidden');
    renderRevisionHistory();
    updateSessionState();
  }

  function resetFullSession() {
    aiInputText.value = '';
    state.currentOriginalInput = '';
    state.userEditedInput = false;
    updateCharCount();
    hideClipboardBanner();
    resetResultsOnly();
    aiInputText.focus();
  }

  function renderRevisionHistory() {
    while (revisionHistoryEl.firstChild) {
      revisionHistoryEl.removeChild(revisionHistoryEl.firstChild);
    }
    state.revisionHistory.forEach((item) => {
      const span = document.createElement('span');
      span.className = 'rev-pill';
      span.textContent = item.text;
      revisionHistoryEl.appendChild(span);
    });
  }

  function renderResults(data, isCompose) {
    aiEmptyState.classList.add('hidden');
    aiResults.classList.remove('hidden');
    revisionBar.classList.remove('hidden');

    if (isCompose) {
      translationCard.classList.add('hidden');
      subjectCard.classList.remove('hidden');
      subjectForeignBody.textContent = data.suggestedSubjectForeign || '';
      subjectVerifyBody.textContent = data.suggestedSubjectVerification || '';
      replyVerifyLabel.textContent = 'Anlam Doğrulama (Türkçe Karşılığı):';
    } else {
      subjectCard.classList.add('hidden');
      translationCard.classList.remove('hidden');
      if (data.detectedLanguage) {
        detectedLangBadge.textContent = `Algılanan: ${data.detectedLanguage}`;
        detectedLangBadge.classList.remove('hidden');
      }
      if (data.translation !== undefined) {
        translationBody.textContent = data.translation || '';
      }
      const selectedLangLabel =
        aiTranslationLang.options[aiTranslationLang.selectedIndex]?.text || 'Türkçe';
      replyVerifyLabel.textContent = `Anlam Doğrulama (${selectedLangLabel} Karşılığı):`;
    }

    replyForeignBody.textContent = data.suggestedReplyForeign || '';
    replyVerifyBody.textContent = data.suggestedReplyVerification || '';
    updateSessionState();
  }

  function showClipboardBanner(intake) {
    state.pendingClipboard = intake;
    const suffix = intake.truncated ? ' (25.000 karakter sınırı uygulandı)' : '';
    clipboardBannerText.textContent = `Panoda yeni metin algılandı (${intake.text.length.toLocaleString('tr-TR')} karakter)${suffix}.`;
    clipboardBanner.classList.remove('hidden');
  }

  function hideClipboardBanner() {
    state.pendingClipboard = null;
    clipboardBanner.classList.add('hidden');
  }

  async function runAiPrimary() {
    if (state.aiBusy) return;
    const text = aiInputText.value.trim();
    if (!text) {
      setAiError('Lütfen önce metin girin veya panodan yapıştırın.');
      return;
    }

    const reqId = ++state.aiRequestId;
    const reqSubmode = state.submode;
    const startMs = Date.now();
    setAiError('');
    setAiBusy(true, reqSubmode === 'incoming' ? 'Çevriliyor...' : 'İş maili hazırlanıyor...');

    try {
      state.currentOriginalInput = text;
      state.revisionHistory = [];
      renderRevisionHistory();

      if (reqSubmode === 'incoming') {
        const translationLang = aiTranslationLang.value;
        const replyLang = aiReplyLang.value;
        const tone = state.tone;
        let combined = {};
        let trUsage = null;
        let replyUsage = null;

        const trPromise = api.ai
          .translateIncomingOnly({ emailText: text, translationLang })
          .then((trRes) => {
            if (reqId !== state.aiRequestId) return;
            trUsage = trRes._usage || null;
            combined = { ...combined, ...trRes };
            renderResults(
              {
                ...combined,
                suggestedReplyForeign: combined.suggestedReplyForeign || 'Önerilen iş yanıtı hazırlanıyor...',
                suggestedReplyVerification: combined.suggestedReplyVerification || '...'
              },
              false
            );
            renderActionTokenMeta(mergeUsage(trUsage, replyUsage), combined._usedModel);
            showToast(`Çeviri hazır (${((Date.now() - startMs) / 1000).toFixed(1)} sn)`);
          });

        const replyPromise = api.ai
          .suggestReplyOnly({ emailText: text, translationLang, replyLang, tone })
          .then((replyRes) => {
            if (reqId !== state.aiRequestId) return;
            replyUsage = replyRes._usage || null;
            combined = { ...combined, ...replyRes };
            renderResults(
              {
                detectedLanguage: combined.detectedLanguage || '',
                translation: combined.translation || 'Çeviri tamamlanıyor...',
                ...combined
              },
              false
            );
            renderActionTokenMeta(mergeUsage(trUsage, replyUsage), combined._usedModel);
          });

        const settled = await Promise.allSettled([trPromise, replyPromise]);
        if (reqId !== state.aiRequestId) return;

        const firstErr = settled.find((s) => s.status === 'rejected');
        if (firstErr && !combined.translation && !combined.suggestedReplyForeign) {
          throw firstErr.reason;
        }
        if (firstErr) {
          setAiError(cleanErrorMessage(firstErr.reason, 'Kısmi hata oluştu.'));
        }
        state.currentDraft = combined;
        renderResults(combined, false);
        renderActionTokenMeta(mergeUsage(trUsage, replyUsage), combined._usedModel);
        const switchedNote = combined._switchedFrom && combined._usedModel
          ? ` — otomatik geçiş: ${combined._usedModel}`
          : '';
        showToast(`Tamamlandı (${((Date.now() - startMs) / 1000).toFixed(1)} sn${switchedNote})`);
      } else {
        const res = await api.ai.composeFromTurkish({
          turkishDraft: text,
          targetLang: aiReplyLang.value === 'auto' ? 'en' : aiReplyLang.value,
          tone: state.tone
        });
        if (reqId !== state.aiRequestId) return;
        state.currentDraft = res;
        renderResults(res, true);
        renderActionTokenMeta(res._usage, res._usedModel);
        const switchedNote = res._switchedFrom && res._usedModel
          ? ` — otomatik geçiş: ${res._usedModel}`
          : '';
        showToast(`Hazır (${((Date.now() - startMs) / 1000).toFixed(1)} sn${switchedNote})`);
      }
    } catch (err) {
      if (reqId !== state.aiRequestId) return;
      setAiError(cleanErrorMessage(err, 'Gemini isteği sırasında bir hata oluştu.'));
    } finally {
      if (reqId === state.aiRequestId) setAiBusy(false);
    }
  }

  async function runRevision(instructionText) {
    if (state.aiBusy || !state.currentDraft) return;
    const instruction = String(instructionText || '').trim();
    if (!instruction) return;

    const reqId = ++state.aiRequestId;
    const isCompose = state.submode === 'compose';
    setAiError('');
    setAiBusy(true, 'Yanıt düzenleniyor...');

    try {
      const effectiveReplyLang = isCompose
        ? aiReplyLang.value === 'auto' ? 'en' : aiReplyLang.value
        : aiReplyLang.value === 'auto'
          ? state.currentDraft.detectedLanguageCode || 'auto'
          : aiReplyLang.value;

      const updated = await api.ai.reviseReply({
        mode: state.submode,
        originalInput: state.currentOriginalInput,
        currentDraft: state.currentDraft,
        instruction,
        history: state.revisionHistory,
        translationLang: isCompose ? 'tr' : aiTranslationLang.value,
        replyLang: effectiveReplyLang,
        tone: state.tone
      });
      if (reqId !== state.aiRequestId) return;

      state.revisionHistory.push({ role: 'user', text: instruction });
      state.currentDraft = { ...state.currentDraft, ...updated };
      renderRevisionHistory();
      renderResults(state.currentDraft, isCompose);
      renderActionTokenMeta(updated._usage, updated._usedModel);
      revisionInput.value = '';
      showToast('Yanıt güncellendi');
    } catch (err) {
      if (reqId !== state.aiRequestId) return;
      setAiError(cleanErrorMessage(err, 'Düzenleme sırasında hata oluştu.'));
    } finally {
      if (reqId === state.aiRequestId) setAiBusy(false);
    }
  }

  // Quick Translate (Free)
  async function runQuickTranslate() {
    const reqId = ++state.quickRequestId;
    const text = quickSourceText.value.trim();
    if (!text) {
      quickTargetText.textContent = 'Sonuç bekleniyor...';
      quickDetectedBadge.textContent = '';
      return;
    }

    quickTargetText.textContent = 'Çevriliyor...';
    try {
      const res = await api.quick.translate({
        text,
        sourceLang: quickSourceLang.value,
        targetLang: quickTargetLang.value
      });
      if (reqId !== state.quickRequestId) return;
      quickTargetText.textContent = res.translatedText || '';
      quickDetectedBadge.textContent = res.detectedLang ? `Algılanan dil: ${res.detectedLang.toUpperCase()}` : '';
    } catch (err) {
      if (reqId !== state.quickRequestId) return;
      quickTargetText.textContent = cleanErrorMessage(err, 'Çeviri hatası oluştu.');
    }
  }

  // Settings
  function applySettingsToUi(settings, activeShortcut) {
    state.settings = settings;
    apiKeyBanner.classList.toggle('hidden', Boolean(settings.hasApiKey));

    if (!settings.encryptionAvailable) {
      apiKeyStatusText.textContent = 'Uyarı: Windows DPAPI şifreleme kullanılamıyor.';
      apiKeyStatusText.className = 'status-meta status-err';
    } else if (settings.hasApiKey) {
      apiKeyStatusText.textContent = 'API anahtarı Windows DPAPI ile şifreli olarak kayıtlı ✓';
      apiKeyStatusText.className = 'status-meta status-ok';
    } else {
      apiKeyStatusText.textContent = 'Henüz kayıtlı API anahtarı yok.';
      apiKeyStatusText.className = 'status-meta';
    }

    const knownOption = Array.from(setModel.options).some(
      (opt) => opt.value !== 'custom' && opt.value === settings.model
    );
    if (!knownOption && settings.model && settings.model !== 'custom') {
      const opt = document.createElement('option');
      opt.value = settings.model;
      opt.textContent = settings.model;
      const customOpt = setModel.querySelector('option[value="custom"]');
      setModel.insertBefore(opt, customOpt);
    }
    setModel.value = settings.model === 'custom' ? 'custom' : settings.model || 'gemini-2.5-flash';
    setCustomModel.value = settings.customModel || '';
    customModelWrap.classList.toggle('hidden', setModel.value !== 'custom');

    setAutoFallback.checked = settings.autoFallback !== false;
    const fbVal = settings.fallbackModel || 'auto';
    if (fbVal !== 'auto' && !Array.from(setFallbackModel.options).some((o) => o.value === fbVal)) {
      const opt = document.createElement('option');
      opt.value = fbVal;
      opt.textContent = fbVal;
      setFallbackModel.appendChild(opt);
    }
    setFallbackModel.value = fbVal;

    setSignature.value = settings.signature || '';
    setShortcut.value = settings.shortcut || 'CommandOrControl+Shift+T';
    setOpenAtLogin.checked = Boolean(settings.openAtLogin);
    setAutoFillClipboard.checked = Boolean(settings.autoFillClipboard);
    setHideQuickOnBlur.checked = Boolean(settings.hideQuickOnBlur);

    const displayShortcut = (activeShortcut || settings.shortcut || 'CommandOrControl+Shift+T').replace('CommandOrControl', 'Ctrl');
    shortcutHint.textContent = `Aç: ${displayShortcut}`;
  }

  async function init() {
    const [res, usageSummary] = await Promise.all([api.settings.get(), api.usage.get()]);
    applySettingsToUi(res.settings, res.activeShortcut);
    renderUsageSummary(usageSummary);
    if (res.shortcutWarning) {
      shortcutWarningText.textContent = res.shortcutWarning;
      shortcutWarningText.classList.remove('hidden');
      showToast(res.shortcutWarning);
    }
    if (res.settings.translationLang) aiTranslationLang.value = res.settings.translationLang;
    if (res.settings.replyLang) aiReplyLang.value = res.settings.replyLang;
    if (res.settings.defaultTone) {
      state.tone = res.settings.defaultTone;
      toneBtns.forEach((b) => b.classList.toggle('active', b.dataset.tone === state.tone));
    }
    updateCharCount();
  }

  // Event bindings
  tabBtns.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  segBtns.forEach((btn) => btn.addEventListener('click', () => switchSubmode(btn.dataset.submode)));
  toneBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tone = btn.dataset.tone;
      toneBtns.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  pinBtn.addEventListener('click', async () => {
    const next = await api.window.setPinned(!state.pinned);
    state.pinned = Boolean(next);
    pinBtn.classList.toggle('pinned', state.pinned);
  });

  hideBtn.addEventListener('click', () => api.window.hide());
  goToSettingsBtn.addEventListener('click', () => switchTab('settings'));
  statusUsageBtn.addEventListener('click', () => {
    switchTab('settings');
    const card = $('usageStatsCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
  resetUsageBtn.addEventListener('click', async () => {
    const summary = await api.usage.reset();
    renderUsageSummary(summary);
    aiTokenMeta.classList.add('hidden');
    aiTokenMeta.textContent = '';
    showToast('Token sayacı sıfırlandı');
  });

  loadClipboardBtn.addEventListener('click', () => {
    if (!state.pendingClipboard) return;
    switchTab('ai');
    switchSubmode('incoming');
    aiInputText.value = state.pendingClipboard.text;
    state.userEditedInput = false;
    updateCharCount();
    updateSessionState();
    hideClipboardBanner();
    showToast('Panodaki metin yüklendi — göndermek için butona basın');
  });

  dismissClipboardBtn.addEventListener('click', hideClipboardBanner);

  aiInputText.addEventListener('input', () => {
    state.userEditedInput = aiInputText.value.trim().length > 0;
    updateCharCount();
    updateSessionState();
  });
  aiSubmitBtn.addEventListener('click', runAiPrimary);
  aiResetBtn.addEventListener('click', resetFullSession);

  aiPasteBtn.addEventListener('click', async () => {
    const text = await api.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Panoda metin bulunamadı');
      return;
    }
    aiInputText.value = text.trim().slice(0, 25000);
    state.userEditedInput = true;
    updateCharCount();
    updateSessionState();
    hideClipboardBanner();
    showToast('Panodan yapıştırıldı');
  });

  aiOcrBtn.addEventListener('click', () => api.snipper.start('ai'));

  copyTranslationBtn.addEventListener('click', async () => {
    const txt = translationBody.textContent.trim();
    if (!txt) return;
    await api.clipboard.writeText(txt);
    showToast('Çeviri kopyalandı');
  });

  copySubjectBtn.addEventListener('click', async () => {
    const txt = subjectForeignBody.textContent.trim();
    if (!txt) return;
    await api.clipboard.writeText(txt);
    showToast('Konu kopyalandı');
  });

  copyReplyBtn.addEventListener('click', async () => {
    const txt = replyForeignBody.textContent.trim();
    if (!txt) return;
    await api.clipboard.writeText(txt);
    showToast('Yanıt panoya kopyalandı');
  });

  copyReplyHideBtn.addEventListener('click', () => {
    const txt = replyForeignBody.textContent.trim();
    if (!txt) return;
    api.window.copyAndHide(txt);
  });

  quickChips.forEach((chip) => {
    chip.addEventListener('click', () => runRevision(chip.dataset.quickRevise));
  });

  revisionSendBtn.addEventListener('click', () => runRevision(revisionInput.value));
  revisionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runRevision(revisionInput.value);
    }
  });

  // Quick Translate events
  quickSourceText.addEventListener('input', () => {
    clearTimeout(state.quickDebounce);
    state.quickDebounce = setTimeout(runQuickTranslate, 300);
  });
  quickSourceLang.addEventListener('change', runQuickTranslate);
  quickTargetLang.addEventListener('change', runQuickTranslate);
  quickTranslateBtn.addEventListener('click', runQuickTranslate);
  quickSwapBtn.addEventListener('click', () => {
    if (quickSourceLang.value === 'auto') return;
    const prev = quickSourceLang.value;
    quickSourceLang.value = quickTargetLang.value;
    quickTargetLang.value = prev;
    runQuickTranslate();
  });
  quickPasteBtn.addEventListener('click', async () => {
    const text = await api.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Panoda metin bulunamadı');
      return;
    }
    quickSourceText.value = text.trim();
    runQuickTranslate();
  });
  quickOcrBtn.addEventListener('click', () => api.snipper.start('quick'));
  quickCopyBtn.addEventListener('click', async () => {
    const txt = quickTargetText.textContent.trim();
    if (!txt || txt === 'Sonuç bekleniyor...' || txt === 'Çevriliyor...') return;
    await api.clipboard.writeText(txt);
    showToast('Çeviri kopyalandı');
  });
  quickCopyHideBtn.addEventListener('click', () => {
    const txt = quickTargetText.textContent.trim();
    if (!txt || txt === 'Sonuç bekleniyor...' || txt === 'Çevriliyor...') return;
    api.window.copyAndHide(txt);
  });

  // Settings events
  toggleApiKeyVisBtn.addEventListener('click', () => {
    const isPass = setApiKey.type === 'password';
    setApiKey.type = isPass ? 'text' : 'password';
    toggleApiKeyVisBtn.textContent = isPass ? 'Gizle' : 'Göster';
  });

  clearApiKeyBtn.addEventListener('click', async () => {
    const res = await api.settings.clearApiKey();
    setApiKey.value = '';
    applySettingsToUi(res.settings, null);
    showToast('API anahtarı silindi');
  });

  function populateModelOptions(models, preferCurrent, excludeId = '') {
    const current = setModel.value;
    while (setModel.firstChild) {
      setModel.removeChild(setModel.firstChild);
    }
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName && m.displayName !== m.id ? `${m.id} (${m.displayName})` : m.id;
      setModel.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Özel Model Adı...';
    setModel.appendChild(customOpt);

    const prevFallback = setFallbackModel.value;
    while (setFallbackModel.firstChild) {
      setFallbackModel.removeChild(setFallbackModel.firstChild);
    }
    const autoFbOpt = document.createElement('option');
    autoFbOpt.value = 'auto';
    autoFbOpt.textContent = 'Otomatik (Aktif modellerden seç)';
    setFallbackModel.appendChild(autoFbOpt);
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id;
      setFallbackModel.appendChild(opt);
    });
    setFallbackModel.value = models.some((m) => m.id === prevFallback) ? prevFallback : 'auto';

    if (preferCurrent && current !== excludeId && models.some((m) => m.id === current)) {
      setModel.value = current;
    } else {
      const preferred = models.find((m) => m.id !== excludeId) || models[0];
      if (preferred) setModel.value = preferred.id;
    }
    customModelWrap.classList.toggle('hidden', setModel.value !== 'custom');
  }

  async function fetchAvailableModels(silent = false, excludeId = '') {
    fetchModelsBtn.disabled = true;
    if (!silent) {
      testApiResult.textContent = 'API anahtarınızdaki aktif modeller getiriliyor...';
      testApiResult.className = 'status-meta';
    }
    try {
      const models = await api.ai.listModels({
        apiKey: setApiKey.value.trim() || undefined
      });
      if (!Array.isArray(models) || models.length === 0) {
        if (!silent) {
          testApiResult.textContent = 'Bu API anahtarı için generateContent destekli model bulunamadı.';
          testApiResult.className = 'status-meta status-err';
        }
        return [];
      }
      populateModelOptions(models, false, excludeId);
      if (!silent) {
        testApiResult.textContent = `${models.length} aktif model yüklendi ("${setModel.value}" seçildi) ✓ Şimdi "Bağlantıyı Test Et" veya "Ayarları Kaydet" deyin.`;
        testApiResult.className = 'status-meta status-ok';
      }
      return models;
    } catch (err) {
      if (!silent) {
        testApiResult.textContent = cleanErrorMessage(err, 'Model listesi alınamadı.');
        testApiResult.className = 'status-meta status-err';
      }
      return [];
    } finally {
      fetchModelsBtn.disabled = false;
    }
  }

  fetchModelsBtn.addEventListener('click', () => fetchAvailableModels(false));

  setModel.addEventListener('change', () => {
    customModelWrap.classList.toggle('hidden', setModel.value !== 'custom');
  });

  testApiBtn.addEventListener('click', async () => {
    testApiBtn.disabled = true;
    testApiResult.textContent = 'Test ediliyor...';
    testApiResult.className = 'status-meta';
    const triedModel = setModel.value === 'custom' ? setCustomModel.value.trim() : setModel.value;
    try {
      const res = await api.ai.testConnection({
        apiKey: setApiKey.value.trim() || undefined,
        model: setModel.value,
        customModel: setCustomModel.value.trim(),
        autoFallback: setAutoFallback.checked,
        fallbackModel: setFallbackModel.value
      });
      const sec = typeof res.elapsedMs === 'number' ? ` — ${(res.elapsedMs / 1000).toFixed(1)} sn` : '';
      const sw = res.switchedFrom ? ` ("${res.switchedFrom}" yoğundu, otomatik geçildi)` : '';
      testApiResult.textContent = `Bağlantı başarılı (${res.model}${sec})${sw} ✓`;
      testApiResult.className = 'status-meta status-ok';
    } catch (err) {
      const msg = cleanErrorMessage(err, 'Bağlantı başarısız.');
      if (/bulunamadı/i.test(msg)) {
        const models = await fetchAvailableModels(true, triedModel);
        if (models.length > 0) {
          testApiResult.textContent = `"${triedModel}" eski/desteklenmiyor; anahtarınızdaki güncel modeller yüklendi ve "${setModel.value}" seçildi. Şimdi tekrar "Bağlantıyı Test Et" ve ardından "Ayarları Kaydet" deyin.`;
          testApiResult.className = 'status-meta status-err';
          return;
        }
      }
      testApiResult.textContent = msg;
      testApiResult.className = 'status-meta status-err';
    } finally {
      testApiBtn.disabled = false;
    }
  });

  saveSettingsBtn.addEventListener('click', async () => {
    saveSettingsStatus.textContent = '';
    shortcutWarningText.classList.add('hidden');
    shortcutWarningText.textContent = '';
    try {
      const patch = {
        model: setModel.value,
        customModel: setCustomModel.value.trim(),
        autoFallback: setAutoFallback.checked,
        fallbackModel: setFallbackModel.value,
        signature: setSignature.value.trim(),
        shortcut: setShortcut.value,
        openAtLogin: setOpenAtLogin.checked,
        autoFillClipboard: setAutoFillClipboard.checked,
        hideQuickOnBlur: setHideQuickOnBlur.checked
      };
      if (setApiKey.value.trim()) {
        patch.apiKey = setApiKey.value.trim();
      }
      const res = await api.settings.save(patch);
      setApiKey.value = '';
      applySettingsToUi(res.settings, res.activeShortcut);
      if (res.shortcutWarning) {
        shortcutWarningText.textContent = res.shortcutWarning;
        shortcutWarningText.classList.remove('hidden');
      }
      saveSettingsStatus.textContent = 'Ayarlar kaydedildi ✓';
      saveSettingsStatus.className = 'status-meta status-ok';
      showToast('Ayarlar kaydedildi');
    } catch (err) {
      saveSettingsStatus.textContent = cleanErrorMessage(err, 'Ayarlar kaydedilemedi.');
      saveSettingsStatus.className = 'status-meta status-err';
    }
  });

  // Global keyboard shortcuts inside window
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      api.window.hide();
      return;
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (state.activeTab === 'ai') {
        if (document.activeElement === revisionInput) {
          runRevision(revisionInput.value);
          return;
        }
        runAiPrimary();
      } else if (state.activeTab === 'quick') {
        const txt = quickTargetText.textContent.trim();
        if (txt && txt !== 'Sonuç bekleniyor...' && txt !== 'Çevriliyor...') {
          api.window.copyAndHide(txt);
        }
      }
    }
  });

  // Main -> Renderer events
  api.events.onPinChanged((pinned) => {
    state.pinned = Boolean(pinned);
    pinBtn.classList.toggle('pinned', state.pinned);
  });

  api.events.onClipboardIntake((intake) => {
    if (!intake || intake.action === 'none') return;
    if (intake.action === 'fill') {
      switchTab('ai');
      if (state.submode !== 'incoming') switchSubmode('incoming');
      aiInputText.value = intake.text;
      updateCharCount();
      hideClipboardBanner();
      if (intake.truncated) {
        showToast('Metin 25.000 karakter sınırına kırpıldı — kontrol edip gönderin');
      } else {
        showToast('Panodaki metin yüklendi — göndermek için Ctrl+Enter');
      }
    } else if (intake.action === 'banner') {
      showClipboardBanner(intake);
    }
  });

  api.events.onOcrStatus(({ busy, targetTab }) => {
    if (targetTab === 'quick') {
      quickOcrBtn.disabled = busy;
      quickOcrBtn.textContent = busy ? 'Taranıyor...' : 'Alan Seç & Çevir (OCR)';
    } else {
      aiOcrBtn.disabled = busy;
      aiOcrBtn.textContent = busy ? 'Taranıyor...' : 'Alan Seç (OCR)';
    }
  });

  api.events.onOcrResult(({ text, targetTab }) => {
    if (targetTab === 'quick') {
      switchTab('quick');
      quickSourceText.value = text;
      runQuickTranslate();
    } else {
      switchTab('ai');
      aiInputText.value = text.slice(0, 25000);
      updateCharCount();
      showToast('OCR metni önizleme kutusuna aktarıldı');
    }
  });

  api.events.onOcrError(({ message }) => {
    showToast(message || 'OCR hatası oluştu');
  });

  api.events.onUsageUpdated((summary) => {
    renderUsageSummary(summary);
  });

  init();
})();
