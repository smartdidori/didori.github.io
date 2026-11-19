import { DreamJar, FLOOR, LEFT, RIGHT, SHARDS, WIDTH } from './engine.mjs';

const CENTER = WIDTH / 2;
const FOG_TARGET = 126;
const LAMP = 178;

export const ROOMS = [
  { name: '첫 투하', instruction: '보드에서 원하는 위치에 구슬을 떨어뜨리세요. 키보드는 Space로 투하할 수 있습니다.' },
  { name: '첫 합체', instruction: '안내선에 모래알을 떨어뜨려 아래의 모래알과 합치세요.', aim: CENTER },
  { name: '기울이기', instruction: '오른쪽 기울기 버튼이나 D를 잠깐 눌러 구슬을 오른쪽으로 굴리세요.' },
  { name: '안개 속 빛', instruction: '달조각이 밝히는 곳의 모래알을 찾아 합치세요. 안내선은 그 모래알의 위치입니다.', aim: FOG_TARGET },
  { name: '새벽 열기', instruction: '보름달 두 개를 합쳐 새벽빛을 만들고, 항아리가 비워지는 모습을 확인하세요.', aim: CENTER },
  { name: '왼쪽으로 모으기', instruction: '왼쪽으로 기울여 모래알 두 개를 합치세요. 추가 투하는 없습니다.', shards: [[1, 76], [1, 222]], dropBudget: 0 },
  { name: '15도 새벽', instruction: '최대 15°만 기울일 수 있습니다. 보름달 두 개를 한쪽으로 모아 새벽을 한 번 여세요.', shards: [[7, 106], [7, 254]], tiltLimit: 15, dropBudget: 0 },
  { name: '오른쪽 표식', instruction: '오른쪽으로 기울여 유리구슬의 중심을 오른쪽 초록 구역에 넣으세요.', shards: [[2, 106]], zone: [270, RIGHT], dropBudget: 0 },
  { name: '가운데 멈추기', instruction: '오른쪽으로 굴린 뒤 제때 손을 떼거나 반대 방향으로 기울여 가운데 초록 구역 안에 멈추세요.', shards: [[1, 96]], zone: [154, 224], dropBudget: 0 },
  { name: '방향 전환', instruction: '같은 구슬을 오른쪽 초록 구역에 넣은 뒤, 왼쪽 초록 구역까지 되돌리세요.', shards: [[2, 180]], zone: [265, RIGHT], returnZone: [LEFT, 95], dropBudget: 0 },
  { name: '한 번의 투하', instruction: '안내선에 유리구슬을 한 번 놓으세요. 기울여 합친 뒤 이슬을 오른쪽 초록 구역으로 굴리세요.', shards: [[2, 82]], stage: 2, aim: 241, zone: [260, RIGHT], dropBudget: 1 },
  { name: '연쇄 합체', instruction: '18° 안에서 기울여 모래알 두 개를 합치고, 새 유리구슬을 나머지 유리구슬과 합쳐 이슬을 만드세요.', shards: [[1, 78], [1, 134], [2, 240]], tiltLimit: 18, dropBudget: 0 },
  { name: '첫 등불', instruction: '등불을 켜서 모래알의 위치를 확인한 뒤 모래알을 한 번 투하해 합치세요.', fog: 0.30, lanterns: 1, shards: [[1, 122]], dropBudget: 1 },
  { name: '빛을 따라', instruction: '오른쪽으로 기울여 모래알을 달조각의 빛 안으로 굴리세요.', fog: 0.32, shards: [[1, 70], [5, 209]], dropBudget: 0 },
  { name: '달빛 아래 합체', instruction: '달조각 옆의 유리구슬을 찾아 합치고, 빛이 닿는 곳에서 이슬을 만드세요.', fog: 0.34, shards: [[2, 124], [5, 176]], stage: 2, dropBudget: 1 },
  { name: '별을 밝히기', instruction: '안개 속에서 빛나는 달조각 두 개를 한쪽으로 모아 별을 만드세요.', fog: 0.36, shards: [[5, 85], [5, 236]], dropBudget: 0 },
  { name: '두 번의 점등', instruction: '등불은 한 번에 4초 켜집니다. 첫 등불이 꺼지면 다시 켜고 유리구슬 두 개를 합치세요.', fog: 0.38, lanterns: 2, lanternSeconds: 4, shards: [[2, 220]], stage: 2, dropBudget: 1 },
  { name: '안개 건너기', instruction: '모래알을 오른쪽 초록 구역으로 굴려 보내고, 뒤따르는 달조각의 빛으로 비추세요.', fog: 0.39, shards: [[1, 147], [5, 82]], zone: [270, RIGHT], dropBudget: 0 },
  { name: '종 네 번 울리기', instruction: '안개 40%. 무료 등불 1회로 이슬 네 개를 찾아 종을 네 번 만드세요.', fog: 0.40, lanterns: 1, shards: [[3, 72], [3, 144], [3, 216], [3, 288]], stage: 3, dropBudget: 4, bellGoal: 4 },
  { name: '빛의 연쇄', instruction: '한쪽으로 기울여 이슬 → 종 → 달조각 순서로 연쇄 합체를 만드세요.', fog: 0.43, shards: [[3, 84], [3, 139], [4, 239]], dropBudget: 0 },
  { name: '안개 너머 새벽', instruction: '안개 45%. 등불을 켜 보름달을 찾고, 한 번의 투하로 새벽빛을 만드세요.', fog: 0.45, lanterns: 1, shards: [[7, 164]], stage: 7, dropBudget: 1 },
  { name: '작은 빛 운반', instruction: '등불을 켜고 모래알을 합친 뒤, 유리구슬을 오른쪽 초록 구역으로 보내세요. 투하 1회, 최대 12°입니다.', fog: 0.35, shards: [[1, 110]], lanterns: 1, dropBudget: 1, tiltLimit: 12, zone: [263, RIGHT] },
  { name: '느린 미끄럼', instruction: '최대 12°로 왼쪽에 유리구슬을 모아 이슬을 만들고 왼쪽 초록 구역까지 굴리세요.', fog: 0.37, shards: [[2, 70], [2, 230]], dropBudget: 0, tiltLimit: 12, zone: [LEFT, 125] },
  { name: '두 종의 위치', instruction: '등불로 이슬 둘의 위치를 찾아 각각 합치세요. 투하는 두 번까지 할 수 있습니다.', fog: 0.39, shards: [[3, 90], [3, 237]], stage: 3, lanterns: 1, lanternSeconds: 6, dropBudget: 2, bellGoal: 2 },
  { name: '안개 속 정지', instruction: '18° 안에서 모래알을 움직여 가운데 초록 구역에 멈추세요.', fog: 0.40, shards: [[1, 96]], zone: [146, 223], tiltLimit: 18, dropBudget: 0 },
  { name: '별의 목적지', instruction: '달조각 두 개를 합쳐 별을 만들고 그 별을 오른쪽 초록 구역으로 보내세요.', fog: 0.42, shards: [[5, 85], [5, 231]], zone: [249, RIGHT], tiltLimit: 18, dropBudget: 0 },
  { name: '한 번의 연쇄', instruction: '안내선에 이슬을 한 번 놓고, 왼쪽으로 기울여 종을 거쳐 달조각을 만드세요.', fog: 0.42, shards: [[3, 87], [4, 263]], aim: 165, stage: 3, dropBudget: 1, tiltLimit: 18 },
  { name: '10도 새벽', instruction: '등불을 켜고 최대 10°만 기울여 보름달 두 개를 합치세요. 추가 투하는 없습니다.', fog: 0.43, lanterns: 1, shards: [[7, 105], [7, 252]], tiltLimit: 10, dropBudget: 0 },
  { name: '세 줄의 빛', instruction: '등불을 켜고 세 구역의 유리구슬을 각각 합쳐 이슬 세 개를 만드세요. 투하는 세 번입니다.', fog: 0.44, lanterns: 1, lanternSeconds: 6, shards: [[2, 68], [2, 170], [2, 272]], stage: 2, dropBudget: 3 },
  { name: '마지막 새벽', instruction: '등불로 위치를 확인하고 별을 한 번 투하하세요. 두 별을 합친 뒤 15° 이내에서 보름달을 모아 새벽을 여세요.', fog: 0.45, lanterns: 1, shards: [[7, 100], [6, 244]], aim: 244, stage: 6, dropBudget: 1, tiltLimit: 15 },
];

export function roomGoalZone(index, game) {
  const room = ROOMS[index];
  return game.roomProgress.crossedRight && room.returnZone ? room.returnZone : room.zone;
}

export function createRoom(index, onEvent) {
  const room = ROOMS[index];
  const progress = { crossedRight: false, bells: 0 };
  const game = new DreamJar(42, event => {
    if (room.bellGoal && event.name === 'merge' && event.stage === 4) progress.bells++;
    onEvent?.(event);
  }, {
    timed: false, tiltLimit: room.tiltLimit, dropBudget: room.dropBudget,
    fogCover: room.fog, lanterns: room.lanterns, lanternSeconds: room.lanternSeconds,
  });
  game.roomProgress = progress;
  for (const [stage, x] of room.shards ?? []) {
    game.addShard(stage, x, FLOOR - SHARDS[stage - 1].radius);
  }
  if (index === 1) game.addShard(1, CENTER, FLOOR - SHARDS[0].radius);
  if (index === 2) game.addShard(1, CENTER, FLOOR - SHARDS[0].radius);
  if (index === 3) {
    game.addShard(1, FOG_TARGET, FLOOR - SHARDS[0].radius);
    game.addShard(5, LAMP, FLOOR - SHARDS[4].radius);
  }
  if (index === 4) {
    game.current = 7;
    game.next = 7;
    game.addShard(7, CENTER, FLOOR - SHARDS[6].radius);
  } else {
    game.current = room.stage ?? 1;
    game.next = room.stage ?? 1;
  }
  if (room.stage !== undefined) game.drawStage = () => room.stage;
  return game;
}

function litByMoon(game, body) {
  return game.bodies.some(light => light.stage === 5 &&
    Math.hypot(light.x - body.x, light.y - body.y) <= SHARDS[4].light);
}

export function isRoomComplete(index, game) {
  switch (index) {
    case 0: return game.drops > 0 && game.bodies.some(body => body.y > 200);
    case 1: return game.score > 0;
    case 2: return game.bodies[0]?.x >= CENTER + 30;
    case 3: return game.bodies.some(body => body.stage === 2 && body.y > game.fogTop &&
      game.bodies.some(light => light.stage === 5 &&
        Math.hypot(light.x - body.x, light.y - body.y) <= SHARDS[4].light));
    case 4: return game.dawns > 0 && game.phase === 'playing';
    case 5: return game.bodies.some(body => body.stage === 2 && body.x < 125);
    case 6: return game.dawns > 0 && game.phase === 'playing';
    case 7: return game.bodies[0]?.x >= ROOMS[index].zone[0];
    case 8: {
      const body = game.bodies[0];
      const [left, right] = ROOMS[index].zone;
      return body && body.x >= left && body.x <= right && Math.abs(body.vx) < 12 && Math.abs(game.angle) < 2;
    }
    case 9: {
      const x = game.bodies[0]?.x ?? CENTER;
      if (x >= ROOMS[index].zone[0]) game.roomProgress.crossedRight = true;
      return game.roomProgress.crossedRight && x <= ROOMS[index].returnZone[1];
    }
    case 10: return game.drops === 1 && game.bodies.some(body => body.stage === 3 && body.x >= ROOMS[index].zone[0]);
    case 11: return game.bodies.some(body => body.stage === 3);
    case 12: return game.lanternsUsed > 0 && game.score >= 60;
    case 13: return game.bodies.some(body => body.stage === 1 && litByMoon(game, body));
    case 14: return game.bodies.some(body => body.stage === 3 && litByMoon(game, body));
    case 15: return game.bodies.some(body => body.stage === 6);
    case 16: return game.lanternsUsed === 2 && game.score >= 135;
    case 17: return game.bodies.some(body => body.stage === 1 && body.x >= ROOMS[index].zone[0] && litByMoon(game, body));
    case 18: return game.lanternsUsed > 0 && game.roomProgress.bells >= 4;
    case 19: return game.bodies.some(body => body.stage === 5);
    case 20: return game.lanternsUsed > 0 && game.dawns > 0 && game.phase === 'playing';
    case 21: return game.lanternsUsed > 0 && game.bodies.some(body => body.stage === 2 && body.x >= ROOMS[index].zone[0]);
    case 22: return game.bodies.some(body => body.stage === 3 && body.x <= ROOMS[index].zone[1]);
    case 23: return game.lanternsUsed > 0 && game.roomProgress.bells >= ROOMS[index].bellGoal;
    case 24: {
      const body = game.bodies[0];
      const [left, right] = ROOMS[index].zone;
      return body && body.x >= left && body.x <= right && Math.abs(body.vx) < 12 && Math.abs(game.angle) < 2;
    }
    case 25: return game.bodies.some(body => body.stage === 6 && body.x >= ROOMS[index].zone[0]);
    case 26: return game.bodies.some(body => body.stage === 5);
    case 27:
    case 29: return game.lanternsUsed > 0 && game.dawns > 0 && game.phase === 'playing';
    case 28: return game.lanternsUsed > 0 && game.bodies.filter(body => body.stage === 3).length >= 3;
    default: return false;
  }
}
