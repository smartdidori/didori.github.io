(function () {
  "use strict";

  const validTime = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

  function newAttempt(bestMs = null) {
    return { elapsedMs: 0, hints: 0, bestMs, tracked: true, finished: false, newBest: false };
  }

  function restore(saved, started, complete) {
    const bestMs = validTime(saved?.bestMs) ? saved.bestMs : null;
    if (validTime(saved?.elapsedMs) && Number.isSafeInteger(saved.hints) && saved.hints >= 0 &&
        typeof saved.tracked === "boolean" && typeof saved.finished === "boolean" && (!complete || saved.finished)) {
      return {
        elapsedMs: saved.elapsedMs, hints: saved.hints, bestMs,
        tracked: saved.tracked, finished: saved.finished, newBest: saved.newBest === true,
      };
    }
    return { ...newAttempt(bestMs), tracked: !started && !complete, finished: complete };
  }

  function finish(attempt) {
    if (attempt.finished) return;
    attempt.finished = true;
    if (!attempt.tracked) return;

    attempt.elapsedMs = Math.round(attempt.elapsedMs / 100) * 100;
    attempt.newBest = attempt.bestMs !== null && attempt.elapsedMs < attempt.bestMs;
    if (attempt.bestMs === null || attempt.newBest) attempt.bestMs = attempt.elapsedMs;
  }

  function formatTime(ms) {
    const tenths = Math.floor(ms / 100);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
  }

  const records = { newAttempt, restore, finish, formatTime };
  if (typeof module === "object" && module.exports) module.exports = records;
  else globalThis.NumberCascadeRecords = records;
})();
