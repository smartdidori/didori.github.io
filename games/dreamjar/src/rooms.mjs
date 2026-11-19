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
];

export function roomGoalZone(index, game) {
  const room = ROOMS[index];
  return game.roomProgress.crossedRight && room.returnZone ? room.returnZone : room.zone;
}

export function createRoom(index, onEvent) {
  const room = ROOMS[index];
  const game = new DreamJar(42, onEvent, {
    timed: false, tiltLimit: room.tiltLimit, dropBudget: room.dropBudget,
  });
  game.roomProgress = { crossedRight: false };
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
  return game;
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
    default: return false;
  }
}
