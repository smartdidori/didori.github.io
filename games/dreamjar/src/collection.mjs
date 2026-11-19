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
