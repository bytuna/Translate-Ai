const fs = require('node:fs');
const path = require('node:path');

function emptyBucket() {
  return {
    requests: 0,
    promptTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0
  };
}

function emptyState() {
  return {
    last: null,
    daily: {},
    monthly: {},
    total: emptyBucket(),
    byModel: {}
  };
}

function toSafeInt(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function estimateCostUsd(model, usage = {}) {
  const lower = String(model || '').toLowerCase();
  let inputPerM = 0.3;
  let outputPerM = 2.5;

  if (/flash-lite|8b/.test(lower)) {
    inputPerM = 0.1;
    outputPerM = 0.4;
  } else if (/pro/.test(lower)) {
    inputPerM = 1.25;
    outputPerM = 10.0;
  } else if (/flash/.test(lower)) {
    inputPerM = 0.3;
    outputPerM = 2.5;
  }

  const promptTokens = toSafeInt(usage.promptTokens);
  const outputAndThoughts = toSafeInt(usage.outputTokens) + toSafeInt(usage.thoughtTokens);
  const cost = (promptTokens / 1_000_000) * inputPerM + (outputAndThoughts / 1_000_000) * outputPerM;
  return Number(cost.toFixed(6));
}

function getDateKeys(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return {
    dayKey: `${y}-${m}-${d}`,
    monthKey: `${y}-${m}`
  };
}

function addToBucket(bucket, entry) {
  const target = bucket && typeof bucket === 'object' ? { ...emptyBucket(), ...bucket } : emptyBucket();
  target.requests += 1;
  target.promptTokens += entry.promptTokens;
  target.outputTokens += entry.outputTokens;
  target.thoughtTokens += entry.thoughtTokens;
  target.totalTokens += entry.totalTokens;
  target.estimatedUsd = Number((target.estimatedUsd + entry.estimatedUsd).toFixed(6));
  return target;
}

function createUsageStore({ filePath, nowFn = () => new Date() }) {
  if (!filePath) throw new Error('filePath gereklidir.');

  function readState() {
    try {
      if (!fs.existsSync(filePath)) return emptyState();
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyState();
      return {
        last: parsed.last && typeof parsed.last === 'object' ? parsed.last : null,
        daily: parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {},
        monthly: parsed.monthly && typeof parsed.monthly === 'object' ? parsed.monthly : {},
        total: parsed.total && typeof parsed.total === 'object' ? { ...emptyBucket(), ...parsed.total } : emptyBucket(),
        byModel: parsed.byModel && typeof parsed.byModel === 'object' ? parsed.byModel : {}
      };
    } catch {
      return emptyState();
    }
  }

  function writeState(state) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }

  function pruneOldDays(daily) {
    const keys = Object.keys(daily).sort();
    while (keys.length > 35) {
      const oldest = keys.shift();
      delete daily[oldest];
    }
  }

  function buildSummary(state) {
    const { dayKey, monthKey } = getDateKeys(nowFn());
    return {
      last: state.last,
      today: state.daily[dayKey] ? { ...emptyBucket(), ...state.daily[dayKey] } : emptyBucket(),
      month: state.monthly[monthKey] ? { ...emptyBucket(), ...state.monthly[monthKey] } : emptyBucket(),
      total: { ...emptyBucket(), ...state.total },
      byModel: { ...state.byModel }
    };
  }

  function getSummary() {
    return buildSummary(readState());
  }

  function record({ model = 'unknown', usage }) {
    if (!usage || typeof usage !== 'object') return getSummary();
    const promptTokens = toSafeInt(usage.promptTokens);
    const outputTokens = toSafeInt(usage.outputTokens);
    const thoughtTokens = toSafeInt(usage.thoughtTokens);
    const totalTokens = toSafeInt(usage.totalTokens) || promptTokens + outputTokens + thoughtTokens;
    if (totalTokens <= 0) return getSummary();

    const now = nowFn();
    const { dayKey, monthKey } = getDateKeys(now);
    const estimatedUsd = estimateCostUsd(model, { promptTokens, outputTokens, thoughtTokens });

    const entry = {
      model: String(model || 'unknown'),
      promptTokens,
      outputTokens,
      thoughtTokens,
      totalTokens,
      estimatedUsd,
      timestamp: now.toISOString()
    };

    const state = readState();
    state.last = entry;
    state.daily[dayKey] = addToBucket(state.daily[dayKey], entry);
    pruneOldDays(state.daily);
    state.monthly[monthKey] = addToBucket(state.monthly[monthKey], entry);
    state.total = addToBucket(state.total, entry);
    state.byModel[entry.model] = addToBucket(state.byModel[entry.model], entry);

    writeState(state);
    return buildSummary(state);
  }

  function reset() {
    const fresh = emptyState();
    writeState(fresh);
    return buildSummary(fresh);
  }

  return {
    getSummary,
    record,
    reset
  };
}

module.exports = {
  createUsageStore,
  estimateCostUsd
};
