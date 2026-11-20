(function () {
  "use strict";

  const node = typeof module === "object" && module.exports;
  const rules = node ? require("./puzzle-rules") : globalThis.NumberCascadeRules;
  const { size, units, peers, row, column, related, cascadeMatches, inspectBoard, validateLevel, countSolutions } = rules;
  const digits = Array.from({ length: size }, (_, index) => index + 1);

  // This checker models deductions. It never branches on a tentative board entry.
  function deduce(level, initial, stopAfterPlacement = false) {
    const board = initial.slice();
    const candidates = board.map((value, cell) => value ? [value] :
      digits.filter((digit) => peers[cell].every((peer) => board[peer] !== digit)));
    const steps = [];

    function place(cell, value, technique, context = null) {
      board[cell] = value;
      candidates[cell] = [value];
      for (const peer of peers[cell]) {
        if (!board[peer]) candidates[peer] = candidates[peer].filter((digit) => digit !== value);
      }
      steps.push({ technique, cells: [cell], value, context });
      return true;
    }

    function restrict(cells, allowed, technique, context) {
      const changes = [];
      cells.forEach((cell, index) => {
        if (board[cell]) return;
        const previous = candidates[cell];
        const remaining = previous.filter((digit) => allowed[index].includes(digit));
        if (remaining.length === previous.length) return;
        candidates[cell] = remaining;
        changes.push({ cell, removed: previous.filter((digit) => !remaining.includes(digit)) });
      });
      if (!changes.length) return false;
      steps.push({ technique, cells: changes.map(({ cell }) => cell), changes, context });
      return true;
    }

    function sudoku() {
      const single = board.findIndex((value, cell) => !value && candidates[cell].length === 1);
      if (single !== -1) return place(single, candidates[single][0], "single");
      for (const unit of units) {
        const empty = unit.cells.filter((cell) => !board[cell]);
        for (const digit of digits) {
          const positions = empty.filter((cell) => candidates[cell].includes(digit));
          if (positions.length === 1) return place(positions[0], digit, "only-position", { unit });
        }
      }
      return false;
    }

    function cascade(bothBlank) {
      const technique = bothBlank ? "cascade-pair" : "cascade-neighbor";
      for (const pair of level.edges) {
        const [a, b] = pair;
        if (board[a] && board[b]) continue;
        if ((!board[a] && !board[b]) !== bothBlank) continue;
        const allowed = pair.map((cell, index) => candidates[cell].filter((digit) =>
          candidates[pair[1 - index]].some((other) => digit !== other && cascadeMatches(digit, other)),
        ));
        if (restrict(pair, allowed, technique, { cells: pair })) return true;
      }
      return false;
    }

    function lastSumCell() {
      for (const zone of level.zones) {
        const empty = zone.cells.filter((cell) => !board[cell]);
        if (empty.length !== 1) continue;
        const filledSum = zone.cells.reduce((sum, cell) => sum + board[cell], 0);
        if (restrict(empty, [[zone.target - filledSum]], "sum-last", { zone, filledSum })) return true;
      }
      return false;
    }

    function sumCombinations() {
      for (const zone of level.zones) {
        const empty = zone.cells.filter((cell) => !board[cell]);
        if (empty.length < 2) continue;
        const target = zone.target - zone.cells.reduce((sum, cell) => sum + board[cell], 0);
        const supported = empty.map(() => new Set());
        const values = [];
        const sharedUnits = empty.map((cell, index) => empty.slice(0, index).map((other) => related(cell, other)));

        // Enumerate combinations within this clue only, allowing repeats across unrelated cells.
        function visit(index, remaining) {
          if (index === empty.length) {
            if (remaining === 0) values.forEach((digit, at) => supported[at].add(digit));
            return;
          }
          const blanksAfter = empty.length - index - 1;
          for (const digit of candidates[empty[index]]) {
            const rest = remaining - digit;
            if (rest < blanksAfter || rest > size * blanksAfter) continue;
            if (sharedUnits[index].some((shared, at) => shared && values[at] === digit)) continue;
            values[index] = digit;
            visit(index + 1, rest);
          }
        }

        visit(0, target);
        if (restrict(empty, supported.map((set) => [...set]), "sum-combination", { zone })) return true;
      }
      return false;
    }

    function lockedCandidates() {
      for (const unit of units) {
        if (unit.kind !== "block") continue;
        for (const digit of digits) {
          const positions = unit.cells.filter((cell) => !board[cell] && candidates[cell].includes(digit));
          if (positions.length < 2) continue;
          for (const line of units) {
            if (line.kind === "block" || !positions.every((cell) => line.cells.includes(cell))) continue;
            const outside = line.cells.filter((cell) => !board[cell] && !unit.cells.includes(cell));
            const allowed = outside.map((cell) => candidates[cell].filter((candidate) => candidate !== digit));
            if (restrict(outside, allowed, "locked-candidates", { unit, line, digit, cells: positions })) return true;
          }
        }
      }
      return false;
    }

    while (board.includes(0)) {
      if (candidates.some((values) => !values.length)) break;
      if (!(sudoku() || cascade(false) || lastSumCell() || cascade(true) || sumCombinations() || lockedCandidates())) break;
      if (stopAfterPlacement && steps.at(-1).value !== undefined) break;
    }
    return { board, steps };
  }

  function reviewLogic(level) {
    const problem = validateLevel(level);
    if (problem) throw new Error(problem);
    const { board, steps } = deduce(level, level.givens);

    const advanced = steps.filter(({ technique }) =>
      ["cascade-pair", "sum-combination", "locked-candidates"].includes(technique));
    const completed = inspectBoard(level, board).complete;
    const techniques = new Set(advanced.map(({ technique }) => technique));
    const beyondOnePair = advanced.length > 1 || (advanced.length === 1 && !techniques.has("cascade-pair"));
    const difficulty = !completed ? null :
      (advanced.length >= 5 && techniques.has("cascade-pair") && techniques.has("sum-combination")) ? "hard" :
      beyondOnePair ? "normal" : "easy";
    return { completed, difficulty, steps };
  }

  function getHint(level, board) {
    const result = inspectBoard(level, board);
    if (result.conflicts.length) return { state: "conflict", conflict: result.conflicts[0] };
    if (result.complete) return { state: "complete" };

    // Check whether the player's entries can extend to a solution. Use only the count for hints.
    const hasEntries = board.some((value, cell) => value !== level.givens[cell]);
    if (hasEntries && countSolutions({ ...level, givens: board }).count === 0) return { state: "inconsistent" };

    const { steps } = deduce(level, board, true);
    return steps.length ? { state: "ready", steps } : { state: "stalled" };
  }

  const logic = { reviewLogic, getHint };
  if (node) module.exports = logic;
  else globalThis.NumberCascadeLogic = logic;

  if (node && require.main === module) {
    const levels = require("./levels");
    const id = process.argv[2];
    const selected = id ? levels.filter((level) => level.id === id) :
      levels.filter(({ difficulty }) => ["easy", "normal", "hard"].includes(difficulty));
    if (!selected.length) {
      console.error(`Unknown level: ${id}`);
      process.exitCode = 1;
    }

    const coordinate = (cell) => `R${row(cell) + 1}C${column(cell) + 1}`;
    for (const level of selected) {
      const report = reviewLogic(level);
      const counts = new Map();
      for (const { technique } of report.steps) counts.set(technique, (counts.get(technique) ?? 0) + 1);
      console.log(level.id, report.difficulty ?? "stalled", Object.fromEntries(counts));
      if (!report.completed) process.exitCode = 1;
      if (!id) continue;
      report.steps.forEach(({ technique, cells, value, changes }, index) => {
        const detail = changes ? changes.map(({ cell, removed }) => `${coordinate(cell)} excludes ${removed.join(", ")}`).join(" · ") :
          `${coordinate(cells[0])} = ${value}`;
        console.log(`${index + 1}. ${technique} · ${detail}`);
      });
    }
  }
})();
