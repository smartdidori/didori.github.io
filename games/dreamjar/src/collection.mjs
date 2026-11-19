export const THEMES = [
  { id: 'original', name: '보랏빛 항아리', cost: 0, colors: ['#f6f0ff', '#e6e5ff', '#9677d6a3'] },
  { id: 'mint', name: '민트빛 항아리', cost: 12, colors: ['#edfdf6', '#ccebe4', '#498a78a3'] },
  { id: 'sunrise', name: '살구빛 항아리', cost: 30, colors: ['#fff6e6', '#fce0d2', '#ba7451a3'] },
];

export const DAWN_LETTERS = [
  { title: '첫 빛', text: '항아리 바닥에 남은 가장 작은 빛이 새벽을 불러왔어요. 어제 놓친 꿈도 오늘 다시 담을 수 있겠지요.' },
  { title: '기울어진 밤', text: '한쪽으로 몰린 꿈을 조금 기울였더니, 멀어 보이던 빛 두 점이 만났어요.' },
  { title: '안개의 가장자리', text: '안개는 빛을 감추기도 하지만, 달조각이 가까이 오면 작은 흔적부터 드러나요.' },
  { title: '빈 항아리', text: '항아리가 다시 비었어요. 새벽마다 남는 건 빛을 모으는 법과 한 장의 편지예요.' },
  { title: '다음 꿈에게', text: '오늘의 마지막 빛을 내일의 꿈에게 남겨 둘게요. 항아리 뚜껑은 조금만 열어 두세요.' },
  { title: '첫 자국', text: '항아리 벽에 별 하나가 스치고 지나갔어요. 오늘의 밤을 떠올릴 수 있도록 그 자국을 남겨 둘게요.' },
  { title: '달이 내려앉는 곳', text: '달조각이 안개 속에 놓이자 잊었던 꿈 하나가 보였어요.' },
  { title: '작은 물결', text: '기울이던 손을 멈추니 가장 작은 구슬만 조금 더 굴렀어요.' },
  { title: '새벽의 온도', text: '차가웠던 항아리를 감싸 쥐었더니 조금씩 손이 따뜻해졌어요.' },
  { title: '종 두 번', text: '첫 종소리와 다음 종소리 사이에 아직 밤이 남아 있었어요.' },
  { title: '빛의 자리', text: '한쪽에 모아 둔 빛을 옮기니 아직 볼 수 없었던 파편이 나타났어요.' },
  { title: '기다리는 등불', text: '등불이 꺼져도 방금 본 자리는 기억할 수 있었어요.' },
  { title: '새벽을 세는 법', text: '오늘은 종이 네 번 울리는 동안 창가가 서서히 밝아졌어요.' },
  { title: '두 번째 길', text: '오른편이 막혔을 때 왼편으로 돌아가는 길이 있었어요.' },
  { title: '작은 여백', text: '항아리 안쪽에 구슬 하나 놓을 자리를 끝까지 남겨 두었어요.' },
  { title: '밤의 고리', text: '서로 다른 조각이 차례로 만나 마지막에는 하나의 빛이 되었어요.' },
  { title: '창가의 색', text: '새벽이 오자 창가의 보랏빛 끝에 살구색이 번졌어요.' },
  { title: '둥근 모서리', text: '항아리를 기울여 볼 때마다 그 둥근 벽을 따라 다른 길이 생겼어요.' },
  { title: '줄어드는 시간', text: '눈금이 작아질 때, 나는 아직 남아 있는 빈자리를 먼저 보았어요.' },
  { title: '고요한 균형', text: '구슬이 가운데 멈추자 손이 먼저 편안해졌어요.' },
  { title: '안개 위의 달', text: '보름달을 아래에 두었더니 안개의 가장자리까지 밝았어요.' },
  { title: '빈자리의 편지', text: '오늘 비워 낸 항아리에 내일은 어떤 꿈을 가장 먼저 담을까요?' },
  { title: '먼 새벽', text: '수많은 조각이 흔들리던 밤이 지나고 항아리에 다시 빛이 들었어요.' },
  { title: '스물네 번째 아침', text: '항아리에 담았던 꿈을 모두 기억하진 못해요. 그래도 새벽이 올 때마다 빛을 기다리던 마음은 남아 있어요.' },
];

const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const addCount = (value, amount) => Math.min(Number.MAX_SAFE_INTEGER, value + amount);
const validStage = stage => Number.isInteger(stage) && stage >= 1 && stage <= 8;

export function readCollection(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { /* Start fresh if the prior value is malformed. */ }
  if (data?.version !== 1) data = {};
  const owned = ['original', ...THEMES.slice(1).filter(theme =>
    Array.isArray(data.owned) && data.owned.includes(theme.id)).map(theme => theme.id)];
  return {
    version: 1,
    mongnok: safeCount(data.mongnok),
    dawns: safeCount(data.dawns),
    discovered: Array.isArray(data.discovered) ? [...new Set(data.discovered.filter(validStage))] : [],
    owned,
    theme: owned.includes(data.theme) ? data.theme : 'original',
  };
}

export function collectGameEvent(collection, event) {
  if (event.name === 'dawn_reached') {
    return { ...collection, dawns: addCount(collection.dawns, 1), mongnok: addCount(collection.mongnok, 20) };
  }
  if (!['fragment_drop', 'merge'].includes(event.name) || !validStage(event.stage)) return collection;
  const known = collection.discovered.includes(event.stage);
  if (known && event.name === 'fragment_drop') return collection;
  return {
    ...collection,
    mongnok: addCount(collection.mongnok, event.name === 'merge' ? 1 : 0),
    discovered: known ? collection.discovered : [...collection.discovered, event.stage],
  };
}

export function selectTheme(collection, id) {
  const theme = THEMES.find(entry => entry.id === id);
  if (!theme || id === collection.theme) return collection;
  if (collection.owned.includes(id)) return { ...collection, theme: id };
  if (collection.mongnok < theme.cost) return collection;
  return { ...collection, mongnok: collection.mongnok - theme.cost, owned: [...collection.owned, id], theme: id };
}
