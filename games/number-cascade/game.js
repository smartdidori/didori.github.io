(function () {
  "use strict";

  const levels = globalThis.NumberCascadeLevels;
  const regularLevels = levels.filter(({ difficulty }) => ["easy", "normal", "hard"].includes(difficulty));
  const rules = globalThis.NumberCascadeRules;
  const { getHint } = globalThis.NumberCascadeLogic;
  const audio = globalThis.NumberCascadeAudio;
  const records = globalThis.NumberCascadeRecords;
  const daily = globalThis.NumberCascadeDaily;
  const { size, cellCount, row, column, related, inspectBoard } = rules;
  const get = (id) => document.getElementById(id);
  const grid = get("grid");
  const status = get("status");
  const resetDialog = get("reset-dialog");
  const titleScreen = get("title-screen");
  const playScreen = get("play-screen");
  const resultScreen = get("result-screen");
  const resumeButton = get("resume-game");
  const dailyButton = get("daily-game");
  const nextButton = get("next-level");
  const hintButton = get("hint");
  const lastLevelKey = "number-cascade:last-level";
  const storagePrefix = "number-cascade:";
  const storageKey = (level) => storagePrefix + level.id;
  const storageVersion = 1;
  const gradeLabels = { easy: "쉬움", normal: "보통", hard: "어려움" };
  const digits = Array.from({ length: size }, (_, index) => index + 1);
  const directions = [
    { side: "top", change: -size, hasNeighbor: (cell) => row(cell) > 0 },
    { side: "right", change: 1, hasNeighbor: (cell) => column(cell) < size - 1 },
    { side: "bottom", change: size, hasNeighbor: (cell) => row(cell) < size - 1 },
    { side: "left", change: -1, hasNeighbor: (cell) => column(cell) > 0 },
  ];

  const states = new Map();
  const dailyLevels = new Map();
  const levelButtons = new Map();
  let level, nextLevel, board, notes, history, cleared, selected, noteMode;
  let resumeLevel;
  let todayLevel;
  let dailyRefreshTimer;
  let attempt;
  let clockStart = null;
  let zoneByCell, cellViews, edgesByCell, edgeViews, zoneViews;
  let activeHint = null;

  function validEntry(value, mask) {
    return Number.isInteger(value) && value >= 0 && value <= size &&
      Number.isInteger(mask) && mask >= 0 && mask < (1 << size) && (value === 0 || mask === 0);
  }

  function restore(level) {
    const empty = {
      board: level.givens.slice(), notes: Array(cellCount).fill(0), history: [],
      cleared: false, attempt: records.newAttempt(),
    };
    try {
      const raw = localStorage.getItem(storageKey(level));
      if (!raw) return empty;
      const saved = JSON.parse(raw);
      if (saved?.version !== storageVersion || saved.levelVersion !== level.version ||
          !Array.isArray(saved.board) || saved.board.length !== cellCount ||
          !Array.isArray(saved.notes) || saved.notes.length !== cellCount ||
          !Array.isArray(saved.history) ||
          !level.givens.every((given, cell) =>
            validEntry(saved.board[cell], saved.notes[cell]) && (!given || saved.board[cell] === given)) ||
          !saved.history.every((entry) => entry && Number.isInteger(entry.cell) &&
            level.givens[entry.cell] === 0 && validEntry(entry.value, entry.mask))) {
        return empty;
      }
      const complete = inspectBoard(level, saved.board).complete;
      const started = saved.history.length > 0 || saved.notes.some(Boolean) ||
        saved.board.some((value, cell) => value !== level.givens[cell]);
      return {
        board: saved.board,
        notes: saved.notes,
        history: saved.history,
        cleared: saved.cleared === true || complete,
        attempt: records.restore(saved.attempt, started, complete),
      };
    } catch (error) {
      if (!(error instanceof SyntaxError)) get("save-status").hidden = false;
      return empty;
    }
  }

  function advanceClock() {
    if (clockStart === null) return;
    const now = performance.now();
    attempt.elapsedMs += now - clockStart;
    clockStart = now;
  }

  function pauseClock() {
    if (clockStart === null) return;
    advanceClock();
    clockStart = null;
    persist(states.get(level.id));
  }

  function resumeClock() {
    if (!playScreen.hidden && !document.hidden && !resetDialog.open && attempt.tracked && !attempt.finished) {
      clockStart ??= performance.now();
    }
  }

  function persist(entry) {
    try {
      localStorage.setItem(storageKey(level), JSON.stringify({
        version: storageVersion,
        levelVersion: level.version,
        ...entry,
      }));
      get("save-status").hidden = true;
    } catch {
      get("save-status").hidden = false;
    }
  }

  function save(result = inspectBoard(level, board)) {
    advanceClock();
    if (result.complete) {
      clockStart = null;
      records.finish(attempt);
    }
    const alreadyCleared = cleared;
    cleared ||= result.complete;
    const entry = { board, notes, history, cleared, attempt };
    states.set(level.id, entry);
    updateLevelButton(level);
    if (cleared !== alreadyCleared) updateCompletion();
    persist(entry);
  }

  function updateLevelButton(item) {
    const view = levelButtons.get(item.id);
    if (!view) return;
    const entry = states.get(item.id);
    const { button, label } = view;
    button.dataset.state = entry.cleared ? "complete" : entry.history.length ? "playing" : "new";
    label.textContent = entry.cleared ? "완료" : entry.history.length ? "진행 중" : "";
    label.hidden = !label.textContent;
  }

  function updateCompletion() {
    const completed = regularLevels.filter(({ id }) => states.get(id).cleared).length;
    const message = `정식 퍼즐 ${completed} / ${regularLevels.length} 완료`;
    get("completion").textContent = message;
    get("menu-completion").textContent = message;
  }

  function levelState(item) {
    if (!states.has(item.id)) states.set(item.id, restore(item));
    return states.get(item.id);
  }

  function dailyLevel(id) {
    if (dailyLevels.has(id)) return dailyLevels.get(id);
    const item = daily.fromId(regularLevels, id);
    if (item) dailyLevels.set(id, item);
    return item;
  }

  function refreshDaily() {
    const date = daily.dateKey();
    if (todayLevel?.dailyDate !== date) todayLevel = dailyLevel(daily.idPrefix + date);
    dailyButton.hidden = !todayLevel;
    if (!todayLevel) return;

    const state = levelState(todayLevel);
    const label = [todayLevel.dateLabel, gradeLabels[todayLevel.difficulty]];
    if (state.cleared) label.push("완료");
    else if (state.history.length || state.attempt.hints) label.push("진행 중");
    get("daily-status").textContent = label.join(" · ");
  }

  function archivedDailyIds() {
    const ids = new Set(dailyLevels.keys());
    const prefix = storagePrefix + daily.idPrefix;
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) ids.add(key.slice(storagePrefix.length));
      }
    } catch {
      // Records opened in this tab remain available when storage is blocked.
    }
    return [...ids].sort().reverse();
  }

  function renderDailyHistory() {
    const list = get("daily-history-list");
    const rows = [];
    for (const id of archivedDailyIds()) {
      const item = dailyLevel(id);
      if (!item) continue;
      const state = levelState(item);
      const { attempt } = state;
      const filled = state.board.filter(Boolean).length;
      const started = state.cleared || state.history.length || attempt.hints || attempt.elapsedMs > 0 ||
        filled > item.givens.filter(Boolean).length || state.notes.some(Boolean);
      if (!started) continue;

      const complete = state.cleared && inspectBoard(item, state.board).complete;
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "title-action daily-history-entry";
      button.dataset.day = item.dailyDate;
      button.dataset.cleared = String(state.cleared);

      const title = document.createElement("span");
      const date = document.createElement("time");
      date.dateTime = item.dailyDate;
      date.textContent = `${item.dailyDate.slice(0, 4)}년 ${item.dateLabel}`;
      const progress = document.createElement("span");
      progress.className = "title-action-detail daily-history-progress";
      progress.textContent = complete ? gradeLabels[item.difficulty] :
        `${gradeLabels[item.difficulty]} · ${filled} / ${cellCount}칸`;
      title.append(date, progress);

      const record = document.createElement("span");
      record.className = "daily-history-record";
      const label = document.createElement("span");
      label.className = "daily-history-state";
      label.textContent = complete ? "완료" : state.cleared ? "완료 · 다시 푸는 중" : "진행 중";
      record.append(label);
      if (state.cleared) {
        const best = document.createElement("span");
        best.className = "title-action-detail";
        best.textContent = attempt.bestMs === null ? "최단 기록 없음" : `최단 ${records.formatTime(attempt.bestMs)}`;
        record.append(best);
      }
      button.append(title, record);
      button.addEventListener("click", () => openLevel(item));
      row.append(button);
      rows.push(row);
    }
    list.replaceChildren(...rows);
    list.hidden = !rows.length;
    get("daily-history-empty").hidden = rows.length > 0;
  }

  function scheduleDailyRefresh() {
    window.clearTimeout(dailyRefreshTimer);
    dailyRefreshTimer = window.setTimeout(() => {
      refreshDaily();
      scheduleDailyRefresh();
    }, Math.max(1, daily.nextRollover() - Date.now()));
  }

  function select(cell) {
    if (selected === cell) return;
    selected = cell;
    render();
  }

  function makeCell(cell) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-readonly", String(Boolean(level.givens[cell])));
    if (level.givens[cell]) button.classList.add("given");
    button.addEventListener("focus", () => select(cell));
    button.addEventListener("click", () => select(cell));
    const digit = document.createElement("span");
    digit.className = "digit";
    digit.setAttribute("aria-hidden", "true");
    const candidates = document.createElement("span");
    candidates.className = "candidates";
    candidates.setAttribute("aria-hidden", "true");
    const marks = digits.map(() => document.createElement("span"));
    candidates.append(...marks);
    button.append(digit, candidates);

    const zoneIndex = zoneByCell[cell];
    if (zoneIndex !== -1) {
      button.classList.add("in-zone");
      const outline = document.createElement("span");
      outline.className = "zone-outline";
      outline.setAttribute("aria-hidden", "true");
      for (const { side, change, hasNeighbor } of directions) {
        if (hasNeighbor(cell) && zoneByCell[cell + change] === zoneIndex) {
          outline.style[side] = "-1px";
        } else {
          outline.style.setProperty(`--z-${side}`, "1px");
        }
      }
      button.append(outline);
      const zone = level.zones[zoneIndex];
      if (cell === Math.min(...zone.cells)) {
        const label = document.createElement("span");
        label.className = "target";
        label.textContent = `${zoneName(zoneIndex)} ${zone.target}`;
        label.setAttribute("aria-hidden", "true");
        button.append(label);
      }
    }

    cellViews.push({ button, digit, candidates, marks });
    return button;
  }

  function buildBoard() {
    cellViews = [];
    zoneByCell = Array(cellCount).fill(-1);
    level.zones.forEach((zone, index) => {
      for (const cell of zone.cells) zoneByCell[cell] = index;
    });
    const rows = [];
    for (let y = 0; y < size; y++) {
      const line = document.createElement("div");
      line.className = "grid-row";
      line.setAttribute("role", "row");
      for (let x = 0; x < size; x++) line.append(makeCell(y * size + x));
      rows.push(line);
    }
    grid.replaceChildren(...rows);

    edgesByCell = Array.from({ length: cellCount }, () => []);
    edgeViews = level.edges.map(([a, b]) => {
      const marker = document.createElement("span");
      const start = Math.min(a, b);
      marker.className = column(a) === column(b) ? "edge edge-down" : "edge edge-right";
      marker.setAttribute("aria-hidden", "true");
      cellViews[start].button.append(marker);
      edgesByCell[a].push(b);
      edgesByCell[b].push(a);
      return marker;
    });
    zoneViews = level.zones.map((_, index) => {
      const item = document.createElement("li");
      item.className = "zone-info";
      const details = document.createElement("span");
      details.className = "sr-only";
      const code = document.createElement("strong");
      code.textContent = zoneName(index);
      const total = document.createElement("span");
      const symbol = document.createElement("span");
      symbol.className = "zone-symbol";
      for (const part of [code, total, symbol]) part.setAttribute("aria-hidden", "true");
      item.append(details, code, total, symbol);
      return { item, details, total, symbol };
    });
    const zoneList = get("zones");
    zoneList.replaceChildren(...zoneViews.map(({ item }) => item));
    zoneList.hidden = zoneViews.length === 0;
    get("zone-guide").hidden = zoneViews.length === 0;
    get("edge-guide").hidden = edgeViews.length === 0;
  }

  const conflictLabels = {
    row: "행 중복", column: "열 중복", block: "3×3 블록 중복",
    edge: "연쇄 위반", zone: "목표 합계 오류",
  };
  const zoneLabels = { conflict: "합계 오류", pending: "진행 중", met: "달성" };
  const location = (cell) => `${row(cell) + 1}행 ${column(cell) + 1}열`;
  const zoneName = (index) => String.fromCharCode(65 + index);
  const unitName = ({ kind, index }) => kind === "row" ? `${index + 1}행` :
    kind === "column" ? `${index + 1}열` : `${index + 1}번 3×3 블록`;

  function hintPrompt({ technique, cells, context }) {
    const target = location(cells[0]);
    switch (technique) {
      case "single":
        return `${target}의 행, 열, 3×3 블록을 함께 보고 들어갈 수 있는 수를 하나로 좁혀 보세요.`;
      case "only-position":
        return `${unitName(context.unit)}에서 어느 숫자의 자리가 한 칸으로 정해지는지 살펴보세요.`;
      case "cascade-neighbor":
      case "cascade-pair":
        return `${context.cells.map(location).join("과 ")} 사이의 연쇄를 보고, 두 수가 짝을 이룰 수 있는지 확인하세요.`;
      case "sum-last":
        return `${target}이 포함된 점선 영역에서 목표 합계와 이미 채운 숫자의 합을 비교해 보세요.`;
      case "sum-combination":
        return `${target}이 포함된 점선 영역에서 합이 ${context.zone.target}이 되는 숫자 조합을 찾아보세요.`;
      case "locked-candidates":
        return `${unitName(context.unit)}에서 같은 행이나 열에 모여 있는 후보를 찾아보세요.`;
    }
  }

  function hintExplanation({ technique, cells, value, changes, context }, index) {
    const target = location(cells[0]);
    const exclusions = changes?.map(({ cell, removed }) => `${location(cell)}에서 ${removed.join(", ")} 제외`).join(" · ");
    switch (technique) {
      case "single":
        return `${index ? "앞의 후보 제외까지 적용하면" : "행, 열, 3×3 블록의 숫자를 제외하면"} ${target}에 들어갈 수는 ${value} 하나입니다.`;
      case "only-position":
        return `${unitName(context.unit)}에서 숫자 ${value}의 자리는 ${target} 한 곳뿐입니다.`;
      case "cascade-neighbor":
      case "cascade-pair":
        return `연쇄의 두 수는 차이가 1이거나 홀짝이 같아야 합니다. 짝을 만들 수 없는 후보를 지웁니다. ${exclusions}.`;
      case "sum-last":
        return `목표 합계 ${context.zone.target}에서 채운 수의 합 ${context.filledSum}을 뺍니다. ${target}에 넣을 값은 ${context.zone.target - context.filledSum}입니다.`;
      case "sum-combination":
        return `점선 영역의 합을 ${context.zone.target}으로 만드는 조합에 한 번도 등장하지 않는 후보를 지웁니다. ${exclusions}.`;
      case "locked-candidates":
        return `${unitName(context.unit)}에서 숫자 ${context.digit}의 후보 칸이 모두 ${unitName(context.line)}에 있습니다. 같은 줄의 블록 바깥 칸에서 이 후보를 지웁니다. ${exclusions}.`;
    }
  }

  function setHint(next) {
    if (activeHint === next) return;
    activeHint = next;
    get("hint-panel").hidden = !next;
    hintButton.setAttribute("aria-expanded", String(Boolean(next)));
    hintButton.textContent = !next ? "힌트" : next.canExpand ? "근거 보기" : "힌트 닫기";
    get("hint-message").textContent = next?.message ?? "";
    const details = get("hint-details");
    const explanations = next?.explanations ?? [];
    details.hidden = !explanations.length;
    details.replaceChildren(...explanations.map((explanation) => {
      const item = document.createElement("li");
      item.textContent = explanation;
      return item;
    }));
  }

  function showHint() {
    if (activeHint) {
      if (activeHint.canExpand) {
        const steps = activeHint.steps;
        const target = steps.at(-1).cells[0];
        setHint({
          ...activeHint, target, canExpand: false,
          message: "다음 수를 찾을 때 적용한 규칙입니다.",
          explanations: steps.map(hintExplanation),
        });
        selected = target;
      } else {
        setHint(null);
      }
      render();
      return;
    }

    const hint = getHint(level, board);
    const first = hint.steps?.[0];
    const related = first?.context?.cells ?? first?.context?.zone?.cells ?? hint.conflict?.cells ?? [];
    const target = first?.cells[0] ?? related.find((cell) => !level.givens[cell]);
    const messages = {
      conflict: "먼저 표시된 칸의 규칙 충돌을 해결하세요.",
      inconsistent: "현재 입력으로는 퍼즐을 완성할 수 없습니다. 최근에 넣은 숫자를 다시 확인하세요.",
      stalled: "현재 보드에서 설명할 수 있는 다음 수를 찾지 못했습니다.",
    };
    if (hint.state === "complete") return;
    if (hint.state === "ready" && !attempt.finished) {
      attempt.hints++;
      save();
    }
    audio.play("hint");
    setHint({
      message: first ? hintPrompt(first) : messages[hint.state],
      steps: hint.steps,
      target,
      related,
      canExpand: Boolean(first),
      explanations: [],
    });
    if (target !== undefined) selected = target;
    render();
  }

  function render(result = inspectBoard(level, board)) {
    const relatedEdges = selected === null ? [] : edgesByCell[selected];
    const conflictsByCell = Array.from({ length: cellCount }, () => []);
    const invalidEdges = new Set();
    for (const conflict of result.conflicts) {
      if (conflict.kind === "edge") invalidEdges.add(conflict.index);
      for (const cell of conflict.cells) conflictsByCell[cell].push(conflictLabels[conflict.kind]);
    }

    const lesson = level.lesson;
    const lessonFocus = lesson?.focus;
    const needsPractice = lesson && (!board[lessonFocus] || conflictsByCell[lessonFocus].length > 0);
    const firstEditable = Math.max(0, board.indexOf(0) === -1 ? level.givens.indexOf(0) : board.indexOf(0));
    const tabCell = selected ?? (needsPractice ? lessonFocus : firstEditable);
    get("lesson").hidden = !lesson || result.complete;
    if (lesson) {
      const prompt = needsPractice ? lesson.prompt : "이제 각 행, 열, 3×3 블록을 보고 남은 칸을 채우세요.";
      const message = `연습 ${lesson.number} / 3 · ${prompt}`;
      if (get("lesson").textContent !== message) get("lesson").textContent = message;
    }

    cellViews.forEach(({ button, digit, candidates, marks }, cell) => {
      const value = board[cell];
      const memo = digits.filter((number) => notes[cell] & (1 << (number - 1)));
      const zoneIndex = zoneByCell[cell];
      const conflicts = conflictsByCell[cell];
      button.tabIndex = cell === tabCell ? 0 : -1;
      button.classList.toggle("selected", cell === selected);
      button.classList.toggle("peer", selected !== null && cell !== selected && related(cell, selected));
      button.classList.toggle("linked", relatedEdges.includes(cell));
      button.classList.toggle("conflict", conflicts.length > 0);
      button.classList.toggle("lesson-focus", Boolean(needsPractice && cell === lessonFocus));
      button.classList.toggle("hint-target", activeHint?.target === cell);
      button.classList.toggle("hint-related", Boolean(activeHint?.related.includes(cell) && activeHint.target !== cell));
      button.classList.toggle("target-conflict", zoneIndex !== -1 && result.zones[zoneIndex].state === "conflict");
      button.setAttribute("aria-selected", String(cell === selected));
      const label = [location(cell), value || "빈칸"];
      if (level.givens[cell]) label.push("고정 숫자");
      if (memo.length) label.push(`메모 ${memo.join(", ")}`);
      if (needsPractice && cell === lessonFocus) label.push("연습할 칸");
      if (activeHint?.target === cell) label.push("힌트 대상");
      if (zoneIndex !== -1) label.push(`목표 영역 ${zoneName(zoneIndex)}, 합계 ${level.zones[zoneIndex].target}`);
      if (edgesByCell[cell].length) label.push(`연쇄 상대 ${edgesByCell[cell].map(location).join(", ")}`);
      button.setAttribute("aria-label", [...label, ...new Set(conflicts)].join(", "));
      digit.textContent = value || "";
      candidates.hidden = memo.length === 0;
      marks.forEach((mark, index) => { mark.textContent = memo.includes(index + 1) ? index + 1 : ""; });
    });

    edgeViews.forEach((marker, index) => {
      marker.classList.toggle("active", level.edges[index].includes(selected));
      marker.classList.toggle("invalid", invalidEdges.has(index));
      marker.textContent = invalidEdges.has(index) ? "!" : "";
    });
    result.zones.forEach(({ sum, blanks, state }, index) => {
      const { item, details, total, symbol } = zoneViews[index];
      const target = level.zones[index].target;
      item.dataset.state = state;
      item.classList.toggle("active", selected !== null && zoneByCell[selected] === index);
      total.textContent = `${sum} / ${target}`;
      symbol.textContent = state === "met" ? "✓" : state === "conflict" ? "!" : "";
      details.textContent = `${zoneName(index)} 영역 · ${sum} / ${target} · 빈칸 ${blanks}개 · ${zoneLabels[state]}`;
    });
    get("progress").textContent = `채운 칸 ${cellCount - result.blanks} / ${cellCount}`;
    get("notes").setAttribute("aria-pressed", String(noteMode));
    get("undo").disabled = history.length === 0;
    hintButton.disabled = result.complete;

    const selectedConflicts = selected === null ? [] : [...new Set(conflictsByCell[selected])];
    const allConflicts = [...new Set(result.conflicts.map(({ kind }) => conflictLabels[kind]))];
    const message = result.complete ? (lesson ? "연습을 마쳤습니다!" : "퍼즐을 완성했습니다!") :
      selectedConflicts.length ? selectedConflicts.join(" · ") :
      allConflicts.length ? allConflicts.join(" · ") : "현재 충돌 없음";
    status.dataset.state = result.complete ? "complete" : allConflicts.length ? "conflict" : "playing";
    if (status.textContent !== message) status.textContent = message;
    get("view-result").hidden = !result.complete;
  }

  function showView(view, focusTarget) {
    if (view !== "play") pauseClock();
    titleScreen.hidden = view !== "title";
    playScreen.hidden = view !== "play";
    resultScreen.hidden = view !== "result";
    get("play-header").hidden = view === "title";
    const skip = get("game-skip");
    skip.href = view === "result" ? "#result-heading" : "#board-heading";
    skip.textContent = view === "result" ? "결과로 이동" : "퍼즐로 이동";
    if (view === "play") resumeClock();
    if (focusTarget) {
      window.scrollTo(0, 0);
      focusTarget.focus({ preventScroll: true });
    }
  }

  function showResult() {
    const hasRecord = attempt.tracked && attempt.finished;
    get("result-level").textContent = level.name;
    get("result-heading").textContent = level.lesson ? "연습 완료" : "퍼즐 완료";
    get("result-time").textContent = hasRecord ? records.formatTime(attempt.elapsedMs) : "기록 없음";
    get("result-hints").textContent = hasRecord ? `${attempt.hints}회` : "기록 없음";
    get("result-best-time").textContent = attempt.bestMs === null ? "기록 없음" : records.formatTime(attempt.bestMs);
    get("result-best-notice").hidden = !attempt.newBest;
    get("result-levels").textContent = level.dailyDate ? "일일 기록" : "퍼즐 선택";
    nextButton.hidden = !nextLevel;
    showView("result", get("result-heading"));
  }

  function openLevel(item) {
    pauseClock();
    audio.play("menu");
    resumeLevel = item;
    level = item;
    const index = levels.indexOf(item);
    const upcoming = index < 0 ? null : levels[index + 1];
    nextLevel = upcoming?.difficulty === "unrated" ? null : upcoming;
    ({ board, notes, history, cleared, attempt } = levelState(item));
    setHint(null);
    selected = null;
    noteMode = false;
    get("board-heading").textContent = item.name;
    nextButton.textContent = nextLevel ? `다음 퍼즐 · ${nextLevel.name}` : "";
    buildBoard();
    const result = inspectBoard(level, board);
    render(result);
    if (result.complete) showResult();
    else showView("play", get("board-heading"));
    try {
      localStorage.setItem(lastLevelKey, item.id);
    } catch {
      get("save-status").hidden = false;
    }
  }

  function showTitle(view, focusTarget) {
    if (view === "home") refreshDaily();
    if (view === "daily-history") renderDailyHistory();
    get("title-home").hidden = view !== "home";
    get("title-levels").hidden = view !== "levels";
    get("title-daily-history").hidden = view !== "daily-history";
    resumeButton.hidden = !resumeLevel;
    resumeButton.classList.toggle("primary", Boolean(resumeLevel));
    get("browse-levels").classList.toggle("primary", !resumeLevel);
    get("resume-name").textContent = resumeLevel?.name ?? "";
    if (focusTarget) audio.play("menu");
    showView("title", focusTarget);
  }

  function applyInput(number) {
    if (selected === null || level.givens[selected]) return;
    let value = board[selected];
    let mask = notes[selected];
    if (number && noteMode) {
      if (value !== 0) return;
      mask ^= 1 << (number - 1);
    } else {
      value = number;
      mask = 0;
    }
    if (value === board[selected] && mask === notes[selected]) return;
    const previous = value === board[selected] ? null : inspectBoard(level, board);
    history.push({ cell: selected, value: board[selected], mask: notes[selected] });
    if (previous) setHint(null);
    board[selected] = value;
    notes[selected] = mask;
    const result = inspectBoard(level, board);
    const action = number === 0 ? "erase" : noteMode ? "memo" : "place";
    audio.play(audio.editCue(previous, result, action));
    save(result);
    render(result);
    if (result.complete) showResult();
  }

  function undo() {
    const entry = history.pop();
    if (!entry) return;
    if (board[entry.cell] !== entry.value) setHint(null);
    board[entry.cell] = entry.value;
    notes[entry.cell] = entry.mask;
    const result = inspectBoard(level, board);
    audio.play(result.complete ? "clear" : "undo");
    save(result);
    if (result.complete) {
      render(result);
      showResult();
      return;
    }
    selected = null;
    cellViews[entry.cell].button.focus();
    select(entry.cell);
  }

  const keypad = get("keypad");
  const eraseButton = get("erase");
  for (const digit of digits) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = digit;
    button.setAttribute("aria-label", `${digit} 입력`);
    button.addEventListener("click", () => applyInput(digit));
    keypad.insertBefore(button, eraseButton);
  }
  eraseButton.addEventListener("click", () => applyInput(0));
  const compactLayout = window.matchMedia("(max-width: 900px)");
  const updateRulesGuide = ({ matches }) => { get("rules-guide").open = !matches; };
  compactLayout.addEventListener("change", updateRulesGuide);
  updateRulesGuide(compactLayout);
  get("notes").addEventListener("click", () => {
    noteMode = !noteMode;
    audio.play("menu");
    render();
  });
  get("undo").addEventListener("click", undo);
  hintButton.addEventListener("click", showHint);
  get("reset").addEventListener("click", () => {
    audio.play("menu");
    pauseClock();
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });

  function restartAttempt() {
    pauseClock();
    setHint(null);
    board = level.givens.slice();
    notes = Array(cellCount).fill(0);
    history = [];
    attempt = records.newAttempt(attempt.bestMs);
    selected = null;
    noteMode = false;
    save();
    render();
    showView("play", get("board-heading"));
  }

  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue === "reset") restartAttempt();
    else resumeClock();
  });
  get("replay-level").addEventListener("click", () => {
    audio.play("menu");
    restartAttempt();
  });
  get("result-levels").addEventListener("click", () => {
    if (level.dailyDate) showTitle("daily-history", get("daily-history-heading"));
    else showTitle("levels", get("levels-heading"));
  });
  get("view-result").addEventListener("click", () => {
    audio.play("menu");
    showResult();
  });
  get("review-board").addEventListener("click", () => {
    audio.play("menu");
    showView("play", get("board-heading"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseClock();
    else syncVisiblePage();
  });
  window.addEventListener("pagehide", pauseClock);
  window.addEventListener("pageshow", syncVisiblePage);

  function syncVisiblePage() {
    resumeClock();
    refreshDaily();
    scheduleDailyRefresh();
  }

  const audioButtons = [...document.querySelectorAll("[data-sound-toggle]")];
  function updateSoundButtons() {
    for (const button of audioButtons) {
      button.textContent = audio.enabled ? "효과음 켜짐" : "효과음 꺼짐";
      button.setAttribute("aria-pressed", String(audio.enabled));
    }
  }
  for (const button of audioButtons) {
    button.addEventListener("click", () => {
      audio.toggle();
      updateSoundButtons();
    });
  }
  updateSoundButtons();

  const arrows = { ArrowUp: directions[0], ArrowRight: directions[1], ArrowDown: directions[2], ArrowLeft: directions[3] };
  grid.addEventListener("keydown", (event) => {
    const focusedCell = cellViews.findIndex(({ button }) => button === event.target);
    if (focusedCell !== -1) select(focusedCell);
    const arrow = arrows[event.key];
    if (!arrow || selected === null) return;
    event.preventDefault();
    if (arrow.hasNeighbor(selected)) cellViews[selected + arrow.change].button.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (playScreen.hidden || resetDialog.open || event.altKey || event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      if (!history.length) return;
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || selected === null) return;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      applyInput(Number(event.key));
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      applyInput(0);
    }
  });

  const groups = {
    tutorial: "튜토리얼",
    easy: "쉬운 퍼즐",
    normal: "보통 퍼즐",
    hard: "어려운 퍼즐",
    unrated: "샘플",
  };
  for (const [difficulty, label] of Object.entries(groups)) {
    const group = document.createElement("section");
    group.className = "level-group";
    group.classList.toggle("regular-level-group", Object.hasOwn(gradeLabels, difficulty));
    group.id = `levels-${difficulty}`;
    const heading = document.createElement("h2");
    heading.textContent = label;
    heading.tabIndex = -1;
    const choices = document.createElement("div");
    choices.className = "level-choices";
    for (const item of levels.filter((entry) => entry.difficulty === difficulty)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-choice";
      button.dataset.level = item.id;
      const name = document.createElement("span");
      name.textContent = item.name;
      const statusLabel = document.createElement("span");
      statusLabel.className = "level-status";
      button.append(name, statusLabel);
      button.addEventListener("click", () => openLevel(item));
      levelState(item);
      levelButtons.set(item.id, { button, label: statusLabel });
      updateLevelButton(item);
      choices.append(button);
    }
    group.append(heading, choices);
    get("level-menu").append(group);
  }
  updateCompletion();
  for (const shortcut of document.querySelectorAll("[data-level-group]")) {
    shortcut.addEventListener("click", () => {
      const group = get(`levels-${shortcut.dataset.levelGroup}`);
      audio.play("menu");
      group.scrollIntoView({ block: "start" });
      group.querySelector("h2").focus({ preventScroll: true });
    });
  }

  try {
    const lastLevel = localStorage.getItem(lastLevelKey);
    resumeLevel = levels.find((item) => item.id === lastLevel) ?? dailyLevel(lastLevel);
  } catch {
    get("save-status").hidden = false;
  }
  resumeLevel ??= levels.find(({ id }) => {
    const state = states.get(id);
    return state.history.length > 0 || state.cleared;
  });

  get("browse-levels").addEventListener("click", () => showTitle("levels", get("levels-heading")));
  get("browse-daily-history").addEventListener("click", () => showTitle("daily-history", get("daily-history-heading")));
  get("daily-history-back").addEventListener("click", () => showTitle("home", get("browse-daily-history")));
  function openToday() {
    refreshDaily();
    if (todayLevel) openLevel(todayLevel);
  }
  dailyButton.addEventListener("click", openToday);
  get("daily-history-today").addEventListener("click", openToday);
  get("back-to-title").addEventListener("click", () => showTitle("home", get("browse-levels")));
  get("game-menu").addEventListener("click", () => showTitle("home", resumeButton));
  resumeButton.addEventListener("click", () => { if (resumeLevel) openLevel(resumeLevel); });
  get("start-tutorial").addEventListener("click", () => {
    const tutorials = levels.filter(({ difficulty }) => difficulty === "tutorial");
    openLevel(tutorials.find(({ id }) => !states.get(id).cleared) ?? tutorials[0]);
  });
  nextButton.addEventListener("click", () => { if (nextLevel) openLevel(nextLevel); });
  showTitle("home");
  scheduleDailyRefresh();
})();
