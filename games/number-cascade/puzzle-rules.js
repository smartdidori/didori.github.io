(function () {
  "use strict";

  const size = 9;
  const cellCount = size * size;
  const indices = Array.from({ length: cellCount }, (_, index) => index);
  const digits = Array.from({ length: size }, (_, index) => index + 1);
  const row = (index) => Math.floor(index / size);
  const column = (index) => index % size;
  const block = (index) => Math.floor(row(index) / 3) * 3 + Math.floor(column(index) / 3);
  const inRange = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  const adjacent = (a, b) => Math.abs(row(a) - row(b)) + Math.abs(column(a) - column(b)) === 1;
  const related = (a, b) => row(a) === row(b) || column(a) === column(b) || block(a) === block(b);
  const peers = indices.map((cell) => indices.filter((other) => cell !== other && related(cell, other)));
  const units = Object.entries({ row, column, block }).flatMap(([kind, group]) =>
    digits.map((digit) => ({
      kind,
      index: digit - 1,
      cells: indices.filter((cell) => group(cell) === digit - 1),
    })),
  );

  function cascadeMatches(a, b) {
    return Math.abs(a - b) === 1 || a % 2 === b % 2;
  }

  function inspectZone(board, zone) {
    let sum = 0;
    let blanks = 0;
    for (const cell of zone.cells) {
      if (board[cell] === 0) blanks++;
      sum += board[cell];
    }
    const impossible = zone.target < sum + blanks || zone.target > sum + size * blanks;
    return { sum, blanks, state: impossible ? "conflict" : blanks ? "pending" : "met" };
  }

  function inspectBoard(level, board) {
    const conflicts = [];
    if (!Array.isArray(board) || board.length !== cellCount || indices.some((cell) => !inRange(board[cell], size))) {
      conflicts.push({ kind: "value", cells: [] });
      return { conflicts, zones: [], blanks: null, complete: false };
    }

    let blanks = 0;
    for (const cell of indices) {
      if (level.givens[cell] !== 0 && board[cell] !== level.givens[cell]) {
        conflicts.push({ kind: "given", cells: [cell] });
      }
      if (board[cell] === 0) blanks++;
    }

    for (const unit of units) {
      const byValue = Array.from({ length: size + 1 }, () => []);
      for (const cell of unit.cells) {
        if (board[cell] !== 0) byValue[board[cell]].push(cell);
      }
      for (const cells of byValue) {
        if (cells.length > 1) conflicts.push({ kind: unit.kind, index: unit.index, cells });
      }
    }

    level.edges.forEach(([a, b], index) => {
      if (board[a] && board[b] && !cascadeMatches(board[a], board[b])) {
        conflicts.push({ kind: "edge", index, cells: [a, b] });
      }
    });

    const zones = level.zones.map((zone, index) => {
      const result = inspectZone(board, zone);
      if (result.state === "conflict") {
        conflicts.push({ kind: "zone", index, cells: zone.cells });
      }
      return result;
    });

    return { conflicts, zones, blanks, complete: blanks === 0 && conflicts.length === 0 };
  }

  function validateLevel(level) {
    if (!level || typeof level.id !== "string" || !level.id.trim() ||
        !Number.isInteger(level.version) || level.version < 1 ||
        !["tutorial", "easy", "normal", "hard", "unrated"].includes(level.difficulty)) {
      return "Invalid level metadata";
    }
    if (!Array.isArray(level.givens) || level.givens.length !== cellCount ||
        indices.some((cell) => !inRange(level.givens[cell], size))) {
      return "Expected 81 givens in the range 0–9";
    }
    if (!Array.isArray(level.edges) || !Array.isArray(level.zones)) {
      return "Expected edge and zone lists";
    }

    const edgeKeys = new Set();
    for (const edge of level.edges) {
      if (!Array.isArray(edge) || edge.length !== 2 ||
          !inRange(edge[0], cellCount - 1) || !inRange(edge[1], cellCount - 1) ||
          !adjacent(...edge)) {
        return "Each edge must connect two orthogonally adjacent cells";
      }
      const key = Math.min(...edge) * cellCount + Math.max(...edge);
      if (edgeKeys.has(key)) return "Duplicate edge";
      edgeKeys.add(key);
    }

    const occupied = new Set();
    for (const zone of level.zones) {
      if (!zone || !Array.isArray(zone.cells) || zone.cells.length < 2 || zone.cells.length > 5) {
        return "Each zone must contain 2–5 cells";
      }
      if (!Number.isInteger(zone.target) || zone.target < zone.cells.length ||
          zone.target > size * zone.cells.length) {
        return "Zone target is outside the allowed range";
      }
      for (const cell of zone.cells) {
        if (!inRange(cell, cellCount - 1) || occupied.has(cell)) return "Invalid or overlapping zone cell";
        occupied.add(cell);
      }
      const connected = new Set([zone.cells[0]]);
      for (const cell of connected) {
        for (const other of zone.cells) {
          if (adjacent(cell, other)) connected.add(other);
        }
      }
      if (connected.size !== zone.cells.length) return "Zone cells must be connected";
    }

    const { conflicts } = inspectBoard(level, level.givens);
    if (conflicts.length) return `Conflict in givens: ${conflicts[0].kind}`;
    return null;
  }

  function countSolutions(level) {
    const problem = validateLevel(level);
    if (problem) return { count: 0, solution: null, problem };

    const board = level.givens.slice();
    const links = indices.map(() => []);
    for (const [a, b] of level.edges) {
      links[a].push(b);
      links[b].push(a);
    }
    const zoneByCell = Array(cellCount).fill(null);
    for (const zone of level.zones) {
      for (const cell of zone.cells) zoneByCell[cell] = zone;
    }

    let count = 0;
    let solution = null;

    function search() {
      let selected = -1;
      let candidates = null;
      for (const cell of indices) {
        if (board[cell] !== 0) continue;
        const used = new Set(peers[cell].map((other) => board[other]));
        const zone = zoneByCell[cell];
        const options = digits.filter((digit) => {
          if (used.has(digit) ||
              links[cell].some((other) => board[other] && !cascadeMatches(digit, board[other]))) {
            return false;
          }
          if (!zone) return true;
          board[cell] = digit;
          const possible = inspectZone(board, zone).state !== "conflict";
          board[cell] = 0;
          return possible;
        });
        if (!options.length) return;
        if (!candidates || options.length < candidates.length) {
          selected = cell;
          candidates = options;
        }
      }

      if (selected === -1) {
        count++;
        if (count === 1) solution = board.slice();
        return;
      }
      for (const digit of candidates) {
        board[selected] = digit;
        search();
        board[selected] = 0;
        if (count === 2) return;
      }
    }

    search();
    return { count, solution, problem: null };
  }

  const rules = {
    size, cellCount, row, column, related, units, peers, cascadeMatches,
    inspectBoard, validateLevel, countSolutions,
  };
  if (typeof module === "object" && module.exports) module.exports = rules;
  else globalThis.NumberCascadeRules = rules;
})();
