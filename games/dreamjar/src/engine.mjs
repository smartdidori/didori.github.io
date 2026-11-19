export const WIDTH = 360;
export const HEIGHT = 446;
export const LEFT = 33;
export const RIGHT = 327;
export const FLOOR = 420;
export const DANGER = 104;
export const STEP = 1 / 120;
export const RULE_VERSION = 3;
export const LANE_COUNT = 3;
export const LANE_LIMIT = 4;
export const LANE_WIDTH = (RIGHT - LEFT) / LANE_COUNT;
export const SHARDS = [
  { name: '모래알', radius: 12, color: '#e7d2a3', mark: '●' },
  { name: '유리구슬', radius: 17, color: '#9ee7f9', mark: '◌' },
  { name: '이슬', radius: 22, color: '#9af3d6', mark: '◇' },
  { name: '종', radius: 29, color: '#eab1ef', mark: '♫' },
  { name: '달조각', radius: 37, color: '#c2b4ff', mark: '☾', light: 60 },
  { name: '별', radius: 47, color: '#ffe295', mark: '✦', light: 90 },
  { name: '보름달', radius: 60, color: '#ffb7b5', mark: '✺', light: 130 },
  { name: '새벽빛', radius: 73, color: '#ffd8a6', mark: '✷' },
];
const MAX_TILT = 25;
const DROP_DELAY = 0.35;
const WARNING_TICKS = Math.round(2 / STEP);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export class DreamJar {
  constructor(seed, onEvent = () => {}, { timed = true, tiltLimit = MAX_TILT, dropBudget = Infinity } = {}) {
    this.timed = timed;
    this.tiltLimit = tiltLimit;
    this.dropBudget = dropBudget;
    this.seed = seed >>> 0;
    this.random = seededRandom(this.seed);
    this.onEvent = onEvent;
    this.phase = 'playing';
    this.bodies = [];
    this.tick = 0;
    this.nextId = 1;
    this.angle = 0;
    this.angularSpeed = 0;
    this.target = null;
    this.score = 0;
    this.dawns = 0;
    this.highest = 0;
    this.drops = 0;
    this.roundDrops = 0;
    this.lanePressure = Array(LANE_COUNT).fill(0);
    this.danger = 0;
    this.cooldown = 0;
    this.transition = 0;
    this.dropAim = WIDTH / 2;
    this.dropTicks = this.dropLimitTicks;
    this.current = this.drawStage();
    this.next = this.drawStage();
    this.emit('session_start');
  }

  emit(name, data = {}) {
    this.onEvent({ name, tick: this.tick, seed: this.seed, rule: RULE_VERSION, ...data });
  }

  drawStage() {
    const value = this.random();
    if (value < 0.45) return 1;
    if (value < 0.75) return 2;
    return value < 0.93 ? 3 : 4;
  }

  aim(x) {
    const radius = SHARDS[this.current - 1].radius;
    return clamp(x, LEFT + radius + 1, RIGHT - radius - 1);
  }

  laneAt(x) {
    return clamp(Math.floor((this.aim(x) - LEFT) / LANE_WIDTH), 0, LANE_COUNT - 1);
  }

  get dropLimitTicks() {
    const seconds = this.dawns ? 5 : this.drops < 5 ? 8 : 6;
    return Math.round(seconds / STEP);
  }

  updateDropAim(x) {
    if (Number.isFinite(x) && this.lanePressure[this.laneAt(x)] < LANE_LIMIT) {
      this.dropAim = this.aim(x);
      return;
    }
    if (this.lanePressure[this.laneAt(this.dropAim)] < LANE_LIMIT) {
      this.dropAim = this.aim(this.dropAim);
      return;
    }
    // An accepted drop cools the other lanes, so at least one stays open.
    let nearest = WIDTH;
    for (const [index, pressure] of this.lanePressure.entries()) {
      if (pressure >= LANE_LIMIT) continue;
      const center = LEFT + (index + 0.5) * LANE_WIDTH;
      const distance = Math.abs(center - this.dropAim);
      if (distance >= nearest) continue;
      nearest = distance;
      x = center;
    }
    this.dropAim = this.aim(x);
  }

  get dangerLine() {
    return DANGER + Math.min(20, Math.floor(this.roundDrops / 16) * 4);
  }

  get fogTop() {
    return FLOOR - (FLOOR - DANGER) * Math.min(0.45, 0.25 + this.dawns * 0.05);
  }

  drop(x, automatic = false) {
    if (this.phase !== 'playing' || this.cooldown > 0 || this.drops >= this.dropBudget || !Number.isFinite(x)) return false;
    const position = this.aim(x);
    const lane = this.laneAt(position);
    if (this.lanePressure[lane] >= LANE_LIMIT) return false;
    this.lanePressure = this.lanePressure.map((pressure, index) =>
      index === lane ? pressure + 1 : Math.max(0, pressure - 1)
    );
    this.roundDrops++;
    this.addShard(this.current, position, 52, 0, 30, false);
    this.drops++;
    this.highest = Math.max(this.highest, this.current);
    this.emit('fragment_drop', { x: Math.round(position * 10) / 10, stage: this.current, drops: this.drops, lane, automatic });
    this.current = this.next;
    this.next = this.drawStage();
    this.cooldown = DROP_DELAY;
    this.dropTicks = this.dropLimitTicks;
    this.updateDropAim(x);
    return true;
  }

  addShard(stage, x, y, vx = 0, vy = 0, arrived = true) {
    const { radius } = SHARDS[stage - 1];
    const shard = { id: this.nextId++, stage, r: radius, x, y, vx, vy, arrived, age: 0 };
    this.bodies.push(shard);
    return shard;
  }

  setTilt(value) {
    const next = value === null ? null : Math.round(clamp(value, -this.tiltLimit, this.tiltLimit));
    if (next === this.target) return;
    this.target = next;
    this.emit('tilt_input', { target: next });
  }

  updateTilt() {
    if (this.target !== null) {
      const movement = clamp(this.target - this.angle, -60 * STEP, 60 * STEP);
      this.angle += movement;
      this.angularSpeed = movement / STEP;
      return;
    }
    this.angularSpeed = clamp(this.angularSpeed + (-45 * this.angle - 7 * this.angularSpeed) * STEP, -60, 60);
    this.angle = clamp(this.angle + this.angularSpeed * STEP, -this.tiltLimit, this.tiltLimit);
  }

  step(aim = this.dropAim) {
    if (this.phase === 'ended') return;
    this.tick++;
    if (this.phase === 'dawn') {
      this.transition -= STEP;
      if (this.transition <= 0) this.phase = 'playing';
      return;
    }
    this.updateTilt();
    const readyAtStart = this.cooldown <= 0;
    this.cooldown = Math.max(0, this.cooldown - STEP);
    const radians = this.angle * Math.PI / 180;
    for (const body of this.bodies) {
      body.age += STEP;
      body.vx = (body.vx + Math.sin(radians) * 860 * STEP) * 0.997;
      body.vy = (body.vy + Math.cos(radians) * 860 * STEP) * 0.999;
      body.x += body.vx * STEP;
      body.y += body.vy * STEP;
      if (body.y + body.r >= DANGER || body.age >= 0.6) body.arrived = true;
      this.constrain(body);
    }

    const consumed = new Set();
    const merges = [];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < this.bodies.length; i++) {
        const first = this.bodies[i];
        if (consumed.has(first.id)) continue;
        for (let j = i + 1; j < this.bodies.length; j++) {
          const second = this.bodies[j];
          if (consumed.has(second.id)) continue;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy);
          const combined = first.r + second.r;
          if (distance > combined) continue;
          if (first.stage === second.stage) {
            consumed.add(first.id);
            consumed.add(second.id);
            merges.push([first, second]);
            break;
          }
          this.separate(first, second, distance, combined, dx, dy);
        }
      }
      for (const body of this.bodies) this.constrain(body);
    }

    if (merges.length) {
      this.bodies = this.bodies.filter(body => !consumed.has(body.id));
      for (const [first, second] of merges) {
        this.merge(first, second);
        if (this.phase === 'dawn') return;
      }
    }

    const dangerLine = this.dangerLine;
    const overflow = this.bodies.some(body => body.arrived && body.y - body.r < dangerLine);
    this.danger = overflow ? this.danger + STEP : 0;
    if (this.danger + 1e-9 >= 3) {
      this.phase = 'ended';
      this.emit('session_end', { score: this.score, drops: this.drops, highest: this.highest, dawns: this.dawns, reason: 'overflow' });
      return;
    }
    this.updateDropAim(aim);
    if (!this.timed || !readyAtStart) return;
    this.dropTicks--;
    if (this.dropTicks === WARNING_TICKS) this.emit('drop_timer_warning');
    if (this.dropTicks === 0) this.drop(this.dropAim, true);
  }

  constrain(body) {
    if (body.x < LEFT + body.r) {
      body.x = LEFT + body.r;
      body.vx = Math.max(0, -body.vx * 0.22);
    }
    if (body.x > RIGHT - body.r) {
      body.x = RIGHT - body.r;
      body.vx = Math.min(0, -body.vx * 0.22);
    }
    if (body.y > FLOOR - body.r) {
      body.y = FLOOR - body.r;
      body.vy = Math.min(0, -body.vy * 0.22);
      body.vx *= 0.98;
    }
  }

  separate(first, second, distance, combined, dx, dy) {
    const nx = distance ? dx / distance : 1;
    const ny = distance ? dy / distance : 0;
    const inverseFirst = 1 / (first.r * first.r);
    const inverseSecond = 1 / (second.r * second.r);
    const sum = inverseFirst + inverseSecond;
    const overlap = (combined - distance) / sum;
    first.x -= nx * overlap * inverseFirst;
    first.y -= ny * overlap * inverseFirst;
    second.x += nx * overlap * inverseSecond;
    second.y += ny * overlap * inverseSecond;
    const approach = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
    if (approach >= 0) return;
    const impulse = -1.18 * approach / sum;
    first.vx -= nx * impulse * inverseFirst;
    first.vy -= ny * impulse * inverseFirst;
    second.vx += nx * impulse * inverseSecond;
    second.vy += ny * impulse * inverseSecond;
  }

  merge(first, second) {
    const stage = first.stage + 1;
    const x = (first.x + second.x) / 2;
    const y = (first.y + second.y) / 2;
    this.highest = Math.max(this.highest, stage);
    this.score += stage * stage * 15;
    this.emit('merge', { stage, x, y, score: this.score });
    if (stage < 8) {
      this.constrain(this.addShard(stage, x, y, (first.vx + second.vx) / 2, (first.vy + second.vy) / 2));
      return;
    }
    this.score += 2000;
    this.dawns++;
    this.roundDrops = 0;
    this.lanePressure.fill(0);
    this.dropTicks = this.dropLimitTicks;
    this.danger = 0;
    this.cooldown = 0;
    this.angle = 0;
    this.angularSpeed = 0;
    this.target = null;
    this.bodies.length = 0;
    this.phase = 'dawn';
    this.transition = 1.35;
    this.emit('dawn_reached', { dawns: this.dawns, score: this.score, drops: this.drops });
  }
}
