import { DreamJar, SHARDS, WIDTH, HEIGHT, LEFT, RIGHT, FLOOR, LANE_LIMIT, LANE_WIDTH, STEP } from './engine.mjs';

import { ROOMS, createRoom, isRoomComplete, roomGoalZone } from './rooms.mjs';

import { THEMES, DAWN_LETTERS, readCollection, collectGameEvent, selectTheme } from './collection.mjs';

const BUILD = '0.1.0-dev.8';
const get = id => document.getElementById(id);
const board = get('board');
const collectionDialog = get('collection-dialog');
const tilt = get('tilt');
const tiltControls = get('tilt-controls');
const tiltButtons = [[get('tilt-left'), -25], [get('tilt-right'), 25]];
const ctx = board.getContext('2d');
const laneIndicators = [0, 1, 2].map(index => {
  const element = get('lane-' + index);
  const meter = element.querySelector('meter');
  meter.max = LANE_LIMIT;
  return { element, meter, label: element.querySelector('.locked-label') };
});
const query = new URLSearchParams(location.search);
const preset = query.get('qa');
const profileKey = preset ? 'dreamjar.qa.profile.2' : 'dreamjar.profile.2';
const collectionKey = preset ? 'dreamjar.qa.collection' : 'dreamjar.collection';
let collection = readCollection(null);
let collectionSaved = true;
try { collection = readCollection(localStorage.getItem(collectionKey)); }
catch { collectionSaved = false; }
const seedParam = query.get('seed');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const log = [];
const keys = new Set();
const stars = Array.from({ length: 38 }, (_, i) => ({
  x: (i * 79 + 13) % WIDTH, y: (i * 127 + 23) % HEIGHT, r: i % 7 === 0 ? 1.15 : 0.55,
}));
let best = 0;
try { best = Math.max(0, Number(localStorage.getItem(profileKey)) || 0); } catch { /* Private browsing can block storage. */ }
const roomsKey = 'dreamjar.rooms.progress';
let roomsCompleted = 0;
try {
  const count = Number(localStorage.getItem(roomsKey));
  if (Number.isInteger(count) && count >= 0 && count <= ROOMS.length) roomsCompleted = count;
} catch { /* Progress can still be kept for the current session. */ }
let roomIndex = null;
let roomCleared = false;
let state;
let aim = WIDTH / 2;
let paused = false;
let started = false;
let dropPointer = null;
let tiltPointer = null;
let tiltStart = 0;
let tiltTarget = null;
let tiltButtonPress = null;
let last = null;
let elapsed = 0;
let animationTime = 0;
let autoDropUntil = 0;
let particles = [];
let announcedFirstMerge = false;
const soundPreference = 'dreamjar.sound';
let soundOn = true;
try { soundOn = localStorage.getItem(soundPreference) !== 'off'; } catch { /* Storage is optional. */ }
const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
const MediaAudio = window.Audio;
const waveforms = new Map();
let audioContext;
let audioOutput;
let mediaAudio;
let soundNeedsRetry = false;
let dangerSoundPlayed = false;

function cueNotes(cue, stage) {
  const pitch = 530 * 2 ** ((stage - 2) / 6);
  return {
    ready: [[659, 659, 0, 0.15, 0.24], [880, 880, 0.075, 0.2, 0.24]],
    drop: [[660, 360, 0, 0.14, 0.26]],
    merge: [[pitch, pitch, 0, 0.22, 0.23], [pitch * 1.5, pitch * 1.5, 0.045, 0.19, 0.16]],
    dawn: [[523, 523, 0, 0.32, 0.25], [659, 659, 0.10, 0.38, 0.25], [784, 784, 0.20, 0.42, 0.24], [1047, 1047, 0.31, 0.52, 0.22]],
    timer: [[750, 820, 0, 0.09, 0.16], [850, 890, 0.12, 0.09, 0.16]],
    warning: [[510, 420, 0, 0.14, 0.24], [510, 420, 0.17, 0.16, 0.24]],
    end: [[470, 365, 0, 0.22, 0.22], [340, 250, 0.13, 0.36, 0.20]],
  }[cue];
}

function resumeAudio() {
  if (!AudioContextClass) return Promise.resolve();
  try {
    if (!audioContext) {
      audioContext = new AudioContextClass();
      audioOutput = audioContext.createGain();
      audioOutput.connect(audioContext.destination);
    }
    audioOutput.gain.value = 1;
    if (audioContext.state !== 'running') return audioContext.resume().catch(() => {});
  } catch { /* The HTML audio path remains available. */ }
  return Promise.resolve();
}

function playSynth(notes) {
  for (const [pitch, finish, delay, length, volume] of notes) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(pitch, start);
    oscillator.frequency.exponentialRampToValueAtTime(finish, start + length);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain);
    gain.connect(audioOutput);
    oscillator.start(start);
    oscillator.stop(start + length);
  }
}

function wavSource(notes) {
  const rate = 22050;
  const length = Math.ceil(Math.max(...notes.map(([, , delay, duration]) => delay + duration)) * rate);
  const samples = new Float32Array(length);
  for (const [pitch, finish, delay, duration, volume] of notes) {
    const start = Math.round(delay * rate);
    let phase = 0;
    for (let i = 0; i < Math.floor(duration * rate) && start + i < length; i++) {
      const time = i / rate;
      const progress = time / duration;
      const envelope = Math.min(1, time / 0.012) * (1 - progress) ** 2;
      phase += 2 * Math.PI * (pitch * (finish / pitch) ** progress) / rate;
      samples[start + i] += Math.sin(phase) * volume * envelope;
    }
  }
  const bytes = new Uint8Array(44 + length * 2);
  const header = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
    bytes.set([...text].map(character => character.charCodeAt(0)), offset);
  }
  header.setUint32(4, bytes.length - 8, true);
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  header.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    header.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  }
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes));
}

async function playMedia(cue, stage, notes) {
  if (!MediaAudio) return false;
  try {
    const key = cue + ':' + stage;
    if (!waveforms.has(key)) waveforms.set(key, wavSource(notes));
    mediaAudio ??= new MediaAudio();
    mediaAudio.src = waveforms.get(key);
    await mediaAudio.play();
    return true;
  } catch { return false; }
}

function playSound(cue, stage = 2) {
  if (!soundOn) return;
  const notes = cueNotes(cue, stage);
  if (audioContext?.state === 'running' && audioOutput) playSynth(notes);
  else void playMedia(cue, stage, notes);
}

async function confirmSound() {
  if (!soundOn) return;
  const resuming = resumeAudio();
  const notes = cueNotes('ready', 2);
  let played = false;
  if (audioContext?.state === 'running' && audioOutput) {
    playSynth(notes);
    played = true;
  } else {
    played = await playMedia('ready', 2, notes);
  }
  if (!played && soundOn) {
    await Promise.race([resuming, new Promise(resolve => setTimeout(resolve, 800))]);
    if (soundOn && audioContext?.state === 'running' && audioOutput) {
      playSynth(notes);
      played = true;
    } else if (soundOn) played = await playMedia('ready', 2, notes);
  }
  if (!soundOn) return;
  soundNeedsRetry = !played;
  syncSoundButton();
}

function onEvent(event) {
  const record = { build: BUILD, ...event };
  log.push(record);
  if (log.length > 1800) log.shift();
  if (event.name === 'drop_timer_warning') playSound('timer');
  if (event.name === 'fragment_drop') {
    if (event.automatic) {
      releaseDropPointer();
      autoDropUntil = animationTime + 850;
    }
    if (soundOn && audioContext?.state !== 'running') void resumeAudio();
    playSound('drop');
  }
  if (event.name === 'merge') {
    if (!announcedFirstMerge) {
      log.push({ ...record, name: 'first_merge' });
      announcedFirstMerge = true;
    }
    if (!reducedMotion.matches) {
      particles.push({ ...event, time: animationTime });
      if (particles.length > 24) particles.shift();
    }
    if (event.stage < 8) playSound('merge', event.stage);
  }
  if (event.name === 'dawn_reached') {
    clearInputs();
    playSound('dawn');
  }
  if (roomIndex === null) updateCollection(collectGameEvent(collection, event));
  if (roomIndex === null && event.score > best) {
    best = event.score;
    try { localStorage.setItem(profileKey, String(best)); } catch { /* Continue with an in-memory score. */ }
  }
  if (event.name === 'session_end') {
    clearInputs();
    playSound('end');
    if (roomIndex === null) {
      setOverlay('꿈이 잠들었습니다', '점수 ' + event.score.toLocaleString('ko-KR') + ' · 새벽 ' + event.dawns + '회', '새 꿈 시작');
    } else {
      setOverlay('다시 도전', ROOMS[roomIndex].instruction, '이 방 다시 시작');
    }
  }
}

function restart() {
  clearInputs();
  paused = false;
  roomCleared = false;
  elapsed = 0;
  last = null;
  aim = (roomIndex === null ? null : ROOMS[roomIndex].aim) ?? WIDTH / 2;
  autoDropUntil = 0;
  particles = [];
  announcedFirstMerge = false;
  dangerSoundPlayed = false;
  const fixedSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : null;
  state = roomIndex === null ? new DreamJar(fixedSeed ?? (Date.now() >>> 0), onEvent) : createRoom(roomIndex, onEvent);
  state.updateDropAim(aim);
  if (roomIndex === null && preset === 'dawn') {
    state.addShard(7, 120, 359);
    state.addShard(7, 239, 359);
  }
  if (roomIndex === null && preset === 'overflow') {
    [7, 6, 7, 6].forEach((stage, level) => state.addShard(stage, 181, 358 - 105 * level));
    state.addShard(3, 84, 362);
    state.addShard(4, 87, 290);
    state.addShard(3, 85, 224);
    state.addShard(5, 282, 340);
    state.addShard(4, 285, 268);
  }
  hideOverlay();
  syncRoomControls();
  syncHud();
}

function releaseDropPointer() {
  const capturedDrop = dropPointer;
  dropPointer = null;
  if (capturedDrop !== null && board.hasPointerCapture(capturedDrop)) board.releasePointerCapture(capturedDrop);
}

function clearInputs() {
  releaseDropPointer();
  const capturedTilt = tiltPointer;
  const buttonPress = tiltButtonPress;
  tiltButtonPress = null;
  if (buttonPress?.button.hasPointerCapture(buttonPress.pointerId)) {
    buttonPress.button.releasePointerCapture(buttonPress.pointerId);
  }
  tiltPointer = null;
  tiltTarget = null;
  keys.clear();
  if (capturedTilt !== null && tilt.hasPointerCapture(capturedTilt)) tilt.releasePointerCapture(capturedTilt);
  state?.setTilt(null);
}

function setOverlay(title, detail, label) {
  get('overlay-title').textContent = title;
  get('overlay-detail').textContent = detail;
  get('continue').textContent = label;
  get('overlay').hidden = false;
  if (!document.hidden) get('continue').focus({ preventScroll: true });
}

function hideOverlay() {
  get('overlay').hidden = true;
  get('pause-label').textContent = '일시정지';
  get('pause').disabled = !started;
}

function togglePause() {
  if (!started || roomCleared || state.phase === 'ended') return;
  paused = !paused;
  elapsed = 0;
  if (paused) {
    clearInputs();
    setOverlay('잠시 쉬어 가세요', '지금 상태에서 이어서 플레이할 수 있습니다.', '계속하기');
    get('pause-label').textContent = '계속하기';
    return;
  }
  hideOverlay();
  board.focus({ preventScroll: true });
}

function updateText(id, text) {
  const element = get(id);
  if (element.textContent !== String(text)) element.textContent = text;
}

function setShardChip(chip, spec) {
  if (chip.textContent === spec.mark) return;
  chip.textContent = spec.mark;
  chip.style.setProperty('--shard', spec.color);
}

function syncHud() {
  updateText('score', state.score.toLocaleString('ko-KR'));
  updateText('best', best.toLocaleString('ko-KR'));
  updateText('dawns', state.dawns);
  updateText('collection-balance', collection.mongnok.toLocaleString('ko-KR'));
  const outOfDrops = state.drops >= state.dropBudget;
  get('drop-queue').hidden = outOfDrops;
  const current = SHARDS[state.current - 1];
  const next = SHARDS[state.next - 1];
  updateText('current', current.name);
  updateText('next', next.name);
  setShardChip(get('current-icon'), current);
  setShardChip(get('next-icon'), next);
  const direction = state.angle < -1.5 ? 'left' : state.angle > 1.5 ? 'right' : 'down';
  if (tiltControls.dataset.direction !== direction) {
    tiltControls.dataset.direction = direction;
    updateText('gravity-direction', { left: '↙ 왼쪽 아래', right: '↘ 오른쪽 아래', down: '↓ 아래' }[direction]);
  }
  if (!state.danger) dangerSoundPlayed = false;
  else if (started && !paused && state.phase === 'playing' && state.danger >= 0.45 && !dangerSoundPlayed) {
    dangerSoundPlayed = true;
    playSound('warning');
  }
  const active = state.laneAt(aim);
  for (const [i, { element, meter, label }] of laneIndicators.entries()) {
    const pressure = state.lanePressure[i];
    const locked = pressure >= LANE_LIMIT;
    if (meter.value !== pressure) meter.value = pressure;
    if (label.hidden === locked) {
      label.hidden = !locked;
      element.dataset.locked = String(locked);
    }
    const selected = String(i === active);
    if (element.dataset.active !== selected) element.dataset.active = selected;
  }
  const timer = get('drop-timer');
  const seconds = Math.ceil(state.dropTicks * STEP);
  const timing = state.timed && started && state.phase === 'playing' && state.cooldown <= 0;
  const urgent = String(timing && seconds <= 2);
  if (timer.dataset.urgent !== urgent) timer.dataset.urgent = urgent;
  updateText('drop-seconds', !timing ? '—' : seconds + '초');
  let message = '위치를 고르고 파편을 놓으세요.';
  if (state.phase === 'dawn') message = '새벽이 열렸습니다 · +2,000';
  else if (state.phase === 'ended') message = '입구선 초과';
  else if (state.danger) message = '입구선을 비우세요 · ' + Math.max(1, Math.ceil(3 - state.danger)) + '초';
  else if (animationTime < autoDropUntil) message = '시간 초과 · 자동 투하';
  else if (outOfDrops) message = '좌우로 기울여 파편을 움직이세요.';
  else if (state.lanePressure[active] >= LANE_LIMIT) {
    message = state.timed ? '이 구역이 잠겼어요. 시간이 끝나면 원이 표시된 곳에 떨어집니다.' : '이 구역이 잠겼어요. 열린 구역에 놓거나 이 방을 다시 시작하세요.';
  }
  updateText('status', message);
}

function buildShardGuide() {
  const guide = get('shard-guide');
  for (const spec of SHARDS) {
    const entry = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'shard-chip';
    chip.setAttribute('aria-hidden', 'true');
    setShardChip(chip, spec);
    entry.append(chip, spec.name);
    guide.append(entry);
  }
}

function drawShard(x, y, r, stage, visible = true, alpha = 1) {
  const spec = SHARDS[stage - 1];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const fill = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, 1, x, y, r);
  fill.addColorStop(0, '#fffefa');
  fill.addColorStop(0.62, visible ? spec.color : '#eee7fa');
  fill.addColorStop(1, visible ? spec.color : '#cdc0e7');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = visible ? '#53398e77' : '#8f79af';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = visible ? '#402759' : '#6b5586';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.round(r * 1.08) + 'px system-ui';
  ctx.fillText(spec.mark, x, y + 1);
  ctx.restore();
}

function draw() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const desiredWidth = Math.round(WIDTH * dpr);
  const desiredHeight = Math.round(HEIGHT * dpr);
  if (board.width !== desiredWidth || board.height !== desiredHeight) {
    board.width = desiredWidth;
    board.height = desiredHeight;
  }
  ctx.setTransform(board.width / WIDTH, 0, 0, board.height / HEIGHT, 0, 0);
  const dawn = state.phase === 'dawn';
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  const [top, bottom, speckles] = THEMES.find(theme => theme.id === collection.theme).colors;
  background.addColorStop(0, dawn ? '#fff1c9' : top);
  background.addColorStop(1, dawn ? '#ffc9b7' : bottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = speckles;
  for (const star of stars) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff7d';
  ctx.fillRect(LEFT, 63, RIGHT - LEFT, FLOOR - 63);
  for (const [lane, pressure] of state.lanePressure.entries()) {
    ctx.fillStyle = pressure >= LANE_LIMIT ? '#ff9e843d' : ['#f9c9e52a', '#c4b0ff33', '#a5eadf3e'][lane];
    const x = LEFT + lane * LANE_WIDTH;
    ctx.fillRect(x, 63, LANE_WIDTH, FLOOR - 63);
    if (lane > 0) {
      ctx.fillStyle = '#aa8bdf51';
      ctx.fillRect(x, 63, 1, FLOOR - 63);
    }
  }
  const zone = roomIndex === null ? null : roomGoalZone(roomIndex, state);
  if (zone) {
    const [left, right] = zone;
    ctx.fillStyle = '#31998128';
    ctx.fillRect(left, FLOOR - 58, right - left, 58);
    ctx.fillStyle = '#26735e';
    ctx.fillRect(left, FLOOR - 5, right - left, 5);
  }
  const fog = state.fogTop;
  const haze = ctx.createLinearGradient(0, fog, 0, FLOOR);
  haze.addColorStop(0, '#c1ace840');
  haze.addColorStop(1, '#b4a0dc79');
  ctx.fillStyle = haze;
  ctx.fillRect(LEFT, fog, RIGHT - LEFT, FLOOR - fog);
  const lights = state.bodies.filter(body => SHARDS[body.stage - 1].light);
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT, fog, RIGHT - LEFT, FLOOR - fog);
  ctx.clip();
  for (const light of lights) {
    const spec = SHARDS[light.stage - 1];
    const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, spec.light);
    glow.addColorStop(0, spec.color + '62');
    glow.addColorStop(1, spec.color + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(light.x - spec.light, light.y - spec.light, spec.light * 2, spec.light * 2);
  }
  ctx.restore();
  for (const body of state.bodies) {
    const visible = body.y <= fog || lights.some(light => Math.hypot(light.x - body.x, light.y - body.y) <= SHARDS[light.stage - 1].light);
    drawShard(body.x, body.y, body.r, body.stage, visible);
  }

  ctx.strokeStyle = '#9579c7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LEFT, 62);
  ctx.lineTo(LEFT, FLOOR);
  ctx.lineTo(RIGHT, FLOOR);
  ctx.lineTo(RIGHT, 62);
  ctx.stroke();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = state.danger ? '#c64a48' : '#9479c5';
  ctx.beginPath();
  ctx.moveTo(LEFT, state.dangerLine);
  ctx.lineTo(RIGHT, state.dangerLine);
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.phase === 'playing' && !roomCleared && state.drops < state.dropBudget) {
    const target = roomIndex === null ? null : ROOMS[roomIndex].aim;
    if (target !== null && target !== undefined) {
      ctx.strokeStyle = '#3c9989';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(target, 80);
      ctx.lineTo(target, FLOOR);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const current = SHARDS[state.current - 1];
    const x = state.dropAim;
    const ready = state.cooldown <= 0;
    if (ready) {
      const urgent = state.dropTicks * STEP <= 2;
      const radius = current.radius + 5;
      ctx.strokeStyle = urgent ? '#a83631' : '#7652c8';
      ctx.beginPath();
      ctx.moveTo(x, 53 + radius);
      ctx.lineTo(x, 137);
      ctx.stroke();
      if (started && state.timed) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, 53, radius, -Math.PI / 2,
          -Math.PI / 2 + 2 * Math.PI * state.dropTicks / state.dropLimitTicks);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    drawShard(x, 53, current.radius, state.current, true, ready ? 1 : 0.35);
  }

  particles = particles.filter(particle => animationTime - particle.time < 460);
  for (const particle of particles) {
    const progress = (animationTime - particle.time) / 460;
    ctx.strokeStyle = SHARDS[particle.stage - 1].color;
    ctx.globalAlpha = 1 - progress;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 8 + progress * 42, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (dawn) {
    ctx.fillStyle = '#814925';
    ctx.textAlign = 'center';
    ctx.font = '36px system-ui';
    ctx.fillText('✷', WIDTH / 2, HEIGHT / 2 - 8);
    ctx.font = 'bold 23px system-ui';
    ctx.fillText('새벽빛', WIDTH / 2, HEIGHT / 2 + 32);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const frameTime = last === null ? 0 : Math.min(75, now - last);
  last = now;
  if (started && !paused && !roomCleared && !collectionDialog.open && !document.hidden) {
    animationTime += frameTime;
    elapsed += frameTime / 1000;
    while (elapsed >= STEP) {
      const move = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      if (move) aim = state.aim(aim + move * 190 * STEP);
      const direction = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      if (tiltButtonPress && !tiltButtonPress.held && animationTime >= tiltButtonPress.until) {
        tiltButtonPress = null;
      }
      const target = tiltTarget ?? tiltButtonPress?.target ?? (direction ? direction * 25 : null);
      state.setTilt(state.phase === 'playing' ? target : null);
      state.step(aim);
      elapsed -= STEP;
      if (roomIndex !== null && isRoomComplete(roomIndex, state)) {
        completeRoom();
        break;
      }
    }
  }
  syncHud();
  draw();
}

function pointerAim(event) {
  const rect = board.getBoundingClientRect();
  aim = state.aim((event.clientX - rect.left) / rect.width * WIDTH);
}

const canInput = () => started && !paused && !roomCleared && !collectionDialog.open && state.phase === 'playing';
board.addEventListener('pointerdown', event => {
  if (!canInput() || dropPointer !== null || event.button !== 0) return;
  event.preventDefault();
  board.focus({ preventScroll: true });
  dropPointer = event.pointerId;
  board.setPointerCapture(dropPointer);
  pointerAim(event);
});
board.addEventListener('pointermove', event => {
  if (event.pointerId === dropPointer || (dropPointer === null && event.pointerType === 'mouse' && canInput())) {
    pointerAim(event);
  }
});
board.addEventListener('pointerup', event => {
  if (event.pointerId !== dropPointer) return;
  pointerAim(event);
  dropPointer = null;
  if (canInput()) state.drop(aim);
});
for (const cancel of ['pointercancel', 'lostpointercapture']) {
  board.addEventListener(cancel, event => {
    if (event.pointerId === dropPointer) dropPointer = null;
  });
}

tilt.addEventListener('pointerdown', event => {
  if (!canInput() || tiltPointer !== null || tiltButtonPress?.held || event.button !== 0) return;
  event.preventDefault();
  tiltButtonPress = null;
  tiltPointer = event.pointerId;
  tiltStart = event.clientX;
  tilt.setPointerCapture(tiltPointer);
});
tilt.addEventListener('pointermove', event => {
  if (event.pointerId === tiltPointer) tiltTarget = (event.clientX - tiltStart) / tilt.clientWidth * 90;
});
for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  tilt.addEventListener(release, event => {
    if (event.pointerId !== tiltPointer) return;
    tiltPointer = null;
    tiltTarget = null;
  });
}

for (const [button, target] of tiltButtons) {
  button.addEventListener('pointerdown', event => {
    if (!canInput() || tiltPointer !== null || tiltButtonPress?.held || event.button !== 0) return;
    tiltButtonPress = { button, target, pointerId: event.pointerId, held: true, until: animationTime + 220 };
    button.setPointerCapture(event.pointerId);
  });
  for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(release, event => {
      if (tiltButtonPress?.button !== button || tiltButtonPress.pointerId !== event.pointerId || !tiltButtonPress.held) return;
      if (release === 'pointerup') tiltButtonPress.held = false;
      else tiltButtonPress = null;
    });
  }
  button.addEventListener('click', event => {
    if (canInput() && event.detail === 0 && tiltPointer === null && !tiltButtonPress?.held) {
      tiltButtonPress = { button, target, pointerId: -1, held: false, until: animationTime + 220 };
    }
  });
}

function gameHasFocus() {
  return document.activeElement === board || tiltControls.contains(document.activeElement);
}

document.addEventListener('keydown', event => {
  if (collectionDialog.open) return;
  if (event.code === 'Escape' && (gameHasFocus() || paused)) {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (!gameHasFocus() || !canInput()) return;
  if (event.code === 'Space' && document.activeElement === board) {
    event.preventDefault();
    if (!event.repeat) state.drop(aim);
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
});
document.addEventListener('keyup', event => keys.delete(event.code));
document.addEventListener('focusout', event => {
  if (event.relatedTarget !== board && !tiltControls.contains(event.relatedTarget)) keys.clear();
});
window.addEventListener('blur', clearInputs);
document.addEventListener('visibilitychange', () => {
  last = null;
  elapsed = 0;
  if (document.hidden && !paused && state.phase !== 'ended') togglePause();
});

function updateCollection(next) {
  if (next === collection) return;
  collection = next;
  try {
    localStorage.setItem(collectionKey, JSON.stringify(collection));
    collectionSaved = true;
  } catch { collectionSaved = false; }
}

function renderCollection() {
  updateText('collection-total', collection.mongnok.toLocaleString('ko-KR') + ' 몽록');
  updateText('discovery-total', collection.discovered.length + ' / ' + SHARDS.length);
  updateText('letter-total', Math.min(collection.dawns, DAWN_LETTERS.length) + ' / ' + DAWN_LETTERS.length);
  get('collection-save-warning').hidden = collectionSaved;
  get('discovery-list').replaceChildren(...SHARDS.map((spec, index) => {
    const known = collection.discovered.includes(index + 1);
    const item = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'shard-chip';
    chip.setAttribute('aria-hidden', 'true');
    setShardChip(chip, known ? spec : { mark: '?', color: '#e7dff4' });
    item.append(chip, known ? spec.name : '미발견');
    return item;
  }));
  get('letter-list').replaceChildren(...DAWN_LETTERS.map((letter, index) => {
    const opened = index < collection.dawns;
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = (index + 1) + '. ' + (opened ? letter.title : '봉인된 편지');
    const body = document.createElement('p');
    body.textContent = opened ? letter.text : '무한 꿈에서 새벽 ' + (index + 1) + '회 달성하면 열립니다.';
    item.append(title, body);
    return item;
  }));
  get('theme-list').replaceChildren(...THEMES.map(theme => {
    const owned = collection.owned.includes(theme.id);
    const active = collection.theme === theme.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.theme = theme.id;
    button.style.setProperty('--theme-color', theme.colors[1]);
    button.disabled = active || (!owned && collection.mongnok < theme.cost);
    button.textContent = theme.name + (active ? ' · 사용 중' : owned ? ' · 적용' : ' · ' + theme.cost + ' 몽록');
    button.addEventListener('click', () => {
      updateCollection(selectTheme(collection, theme.id));
      renderCollection();
      get('collection-close').focus();
    });
    return button;
  }));
}

get('open-collection').addEventListener('click', () => {
  clearInputs();
  elapsed = 0;
  renderCollection();
  collectionDialog.showModal();
  get('collection-close').focus();
});
get('collection-close').addEventListener('click', () => collectionDialog.close());
collectionDialog.addEventListener('close', () => {
  elapsed = 0;
  last = null;
  get('open-collection').focus();
});

const roomButtons = ROOMS.map((room, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'room-button';
  button.textContent = String(index + 1);
  button.addEventListener('click', () => openMode(index));
  get('room-steps').append(button);
  return button;
});

function syncRoomControls() {
  const training = roomIndex !== null;
  get('mode-endless').setAttribute('aria-pressed', String(!training));
  get('mode-rooms').setAttribute('aria-pressed', String(training));
  updateText('mode-label', training ? '기억의 방' : '무한 꿈');
  get('room-info').hidden = !training;
  get('drop-timer').hidden = training;
  if (!training) return;
  const room = ROOMS[roomIndex];
  updateText('room-name', (roomIndex + 1) + '. ' + room.name + (roomIndex >= 5 ? ' · 기울기 심화' : ''));
  updateText('room-hint', room.instruction);
  for (const [index, button] of roomButtons.entries()) {
    const complete = index < roomsCompleted;
    button.disabled = index > roomsCompleted;
    button.dataset.complete = String(complete);
    button.setAttribute('aria-current', index === roomIndex ? 'step' : 'false');
    button.setAttribute('aria-label', (index + 1) + '. ' + ROOMS[index].name +
      (complete ? ' · 완료' : button.disabled ? ' · 잠김' : ''));
  }
}

function openMode(index) {
  roomIndex = index;
  started = true;
  void confirmSound();
  restart();
  board.focus({ preventScroll: true });
}

function completeRoom() {
  roomCleared = true;
  clearInputs();
  if (roomIndex === roomsCompleted) {
    roomsCompleted++;
    try { localStorage.setItem(roomsKey, String(roomsCompleted)); } catch { /* Keep the current session usable. */ }
  }
  syncRoomControls();
  get('pause').disabled = true;
  const finalRoom = roomIndex === ROOMS.length - 1;
  setOverlay(finalRoom ? '기억의 방 완료' : '방 완료',
    finalRoom ? '배운 조작으로 무한 꿈에 도전해 보세요.' : ROOMS[roomIndex].name + ' 연습을 마쳤어요.',
    finalRoom ? '무한 꿈 시작' : '다음 방');
}

get('mode-endless').addEventListener('click', () => {
  if (roomIndex !== null || !started) openMode(null);
});
get('mode-rooms').addEventListener('click', () => {
  if (roomIndex === null) openMode(roomsCompleted === ROOMS.length ? 0 : roomsCompleted);
});
get('room-restart').addEventListener('click', () => openMode(roomIndex));

get('pause').addEventListener('click', togglePause);
get('continue').addEventListener('click', () => {
  if (roomCleared) {
    openMode(roomIndex + 1 < ROOMS.length ? roomIndex + 1 : null);
    return;
  }
  if (!started || state.phase === 'ended') void confirmSound();
  else if (soundOn) void resumeAudio();
  if (!started || state.phase === 'ended') {
    started = true;
    restart();
  } else togglePause();
  board.focus({ preventScroll: true });
});
function syncSoundButton() {
  const supported = Boolean(AudioContextClass || MediaAudio);
  get('sound').disabled = !supported;
  get('sound').setAttribute('aria-pressed', String(supported && soundOn && !soundNeedsRetry));
  let label = soundOn ? '소리 끄기' : '소리 켜기';
  if (!supported) label = '소리 미지원';
  else if (soundOn && soundNeedsRetry) label = '소리 다시 시도';
  updateText('sound-label', label);
}

get('sound').addEventListener('click', () => {
  soundOn = soundNeedsRetry || !soundOn;
  soundNeedsRetry = false;
  try { localStorage.setItem(soundPreference, soundOn ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  if (soundOn) void confirmSound();
  else {
    if (audioOutput) audioOutput.gain.value = 0;
    if (mediaAudio) mediaAudio.pause();
  }
  syncSoundButton();
});

syncSoundButton();
buildShardGuide();
started = preset === 'dawn' || preset === 'overflow';
restart();
if (!started) {
  get('overlay').hidden = false;
}
get('continue').disabled = false;
get('load-error').hidden = true;
requestAnimationFrame(frame);
if (preset || query.has('debug')) {
  window.dreamJarDebug = {
    snapshot: () => ({ phase: state.phase, tick: state.tick, angle: state.angle, score: state.score, dawns: state.dawns, drops: state.drops, pressure: [...state.lanePressure], dangerLine: state.dangerLine, dropTicks: state.dropTicks, dropAim: state.dropAim, roomIndex, roomCleared, roomsCompleted, paused }),
    events: () => log.map(event => ({ ...event })),
  };
}
