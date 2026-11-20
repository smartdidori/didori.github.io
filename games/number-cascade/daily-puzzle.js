(function () {
  "use strict";

  const node = typeof module === "object" && module.exports;
  const { size, row, column } = node ? require("./puzzle-rules") : globalThis.NumberCascadeRules;
  const { reviewLogic } = node ? require("./logic-review") : globalThis.NumberCascadeLogic;
  const dayMs = 86_400_000;
  const prefix = "daily-";
  const seoul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  });
  // Keep this rotation stable when the regular catalog gains levels.
  const rotation = ["easy", "normal", "hard"].flatMap((grade) =>
    Array.from({ length: 10 }, (_, i) => `${grade}-${String(i + 1).padStart(2, "0")}`),
  );
  const wrap = (value, modulus) => ((value % modulus) + modulus) % modulus;

  function dateKey(date = new Date()) {
    const parts = new Map(seoul.formatToParts(date).map(({ type, value }) => [type, value]));
    return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  }

  function nextRollover(now = new Date()) {
    return Date.parse(`${dateKey(now)}T00:00:00+09:00`) + dayMs;
  }

  function createDaily(levels, day) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const time = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return null;
    const dayNumber = time / dayMs;
    const cycle = Math.floor(dayNumber / rotation.length);
    const slot = wrap(dayNumber, rotation.length);
    const base = levels.find(({ id }) => id === rotation[wrap(slot * 7 + cycle * 8, rotation.length)]);
    if (!base) return null;

    // Use 15 non-identity variants of the board. Every transform preserves the three rules.
    const variant = wrap(cycle, 15) + 1;
    const complement = variant >= 8;
    const reflected = Boolean(variant & 4);
    const turns = variant % 4;
    function transform(cell) {
      let y = row(cell);
      let x = column(cell);
      if (reflected) x = size - 1 - x;
      for (let turn = 0; turn < turns; turn++) [y, x] = [x, size - 1 - y];
      return y * size + x;
    }

    const givens = Array(size * size).fill(0);
    base.givens.forEach((value, cell) => {
      if (value) givens[transform(cell)] = complement ? size + 1 - value : value;
    });
    const [, month, date] = day.split("-");
    const label = `${Number(month)}월 ${Number(date)}일`;
    const level = {
      id: prefix + day,
      dailyDate: day,
      dateLabel: label,
      name: `일일 퍼즐 · ${label}`,
      difficulty: base.difficulty,
      version: base.version,
      givens,
      edges: base.edges.map((cells) => cells.map(transform)),
      zones: base.zones.map(({ cells, target }) => ({
        cells: cells.map(transform),
        target: complement ? (size + 1) * cells.length - target : target,
      })),
    };
    const deduction = reviewLogic(level);
    if (deduction.completed) level.difficulty = deduction.difficulty;
    return level;
  }

  function fromId(levels, id) {
    return typeof id === "string" && id.startsWith(prefix) ? createDaily(levels, id.slice(prefix.length)) : null;
  }

  const daily = { idPrefix: prefix, dateKey, nextRollover, fromId, createDaily };
  if (node) module.exports = daily;
  else globalThis.NumberCascadeDaily = daily;
})();
