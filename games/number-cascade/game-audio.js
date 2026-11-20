(function () {
  "use strict";

  const cues = ["menu", "place", "memo", "erase", "undo", "conflict", "hint", "target", "clear"];

  function editCue(before, after, action) {
    if (!before) return action;
    if (after.complete && !before.complete) return "clear";

    const conflictKey = ({ kind, index, cells }) => `${kind}:${index ?? ""}:${cells.join(",")}`;
    const previousConflicts = new Set(before.conflicts.map(conflictKey));
    if (after.conflicts.some((conflict) => !previousConflicts.has(conflictKey(conflict)))) return "conflict";
    if (after.zones.some(({ state }, index) => state === "met" && before.zones[index].state !== "met")) {
      return "target";
    }
    return action;
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { editCue };
    return;
  }

  const storageKey = "number-cascade:sound";
  let enabled = true;
  try {
    enabled = localStorage.getItem(storageKey) !== "off";
  } catch {
    // Keep the setting available in memory when storage is blocked.
  }

  const sounds = new Map(cues.map((cue) => {
    const audio = new Audio(`sound/${cue}.wav`);
    audio.preload = enabled ? "auto" : "none";
    return [cue, audio];
  }));
  let current = null;

  function play(cue) {
    if (!enabled) return;
    const sound = sounds.get(cue);
    if (current === sounds.get("clear") && !current.paused && cue === "menu") return;
    current?.pause();
    sound.currentTime = 0;
    current = sound;
    sound.play().catch(() => {});
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled) current?.pause();
    try {
      localStorage.setItem(storageKey, enabled ? "on" : "off");
    } catch {
      // The current tab still honors the setting.
    }
    if (enabled) play("menu");
  }

  globalThis.NumberCascadeAudio = { play, toggle, editCue, get enabled() { return enabled; } };
})();
