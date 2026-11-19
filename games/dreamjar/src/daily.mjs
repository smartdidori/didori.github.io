import { RULE_VERSION } from './engine.mjs';

export const DAILY_LIMIT = 3;

export function seoulDay(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dailySeed(day) {
  let hash = 2166136261;
  for (const char of day + ':' + RULE_VERSION) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function readDaily(raw, day) {
  let stored;
  try { stored = JSON.parse(raw); } catch { /* Start fresh for malformed data. */ }
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const sameDay = stored?.day === day && stored.version === RULE_VERSION;
  return {
    day, version: RULE_VERSION,
    attempts: sameDay ? Math.min(DAILY_LIMIT, count(stored.attempts)) : 0,
    best: sameDay ? count(stored.best) : 0,
  };
}

export function useDailyAttempt(record) {
  if (record.attempts >= DAILY_LIMIT) return null;
  return { ...record, attempts: record.attempts + 1 };
}

export function finishDaily(record, score) {
  if (record.attempts === 0 || !Number.isSafeInteger(score) || score <= record.best) return record;
  return { ...record, best: score };
}
