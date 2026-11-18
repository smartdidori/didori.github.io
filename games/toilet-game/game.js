/**
 * 급해! 토일렛 매니저 (Panic! Toilet Manager) - Advanced Version
 */

// 저장이 차단되어도 이번 실행의 기록은 메모리에 유지한다. 기존 저장값은 삭제하지 않는다.
const GameStorage = {
    memory: new Map(),
    get(key) {
        if (this.memory.has(key)) return this.memory.get(key);
        try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
        this.memory.set(key, String(value));
        try { localStorage.setItem(key, String(value)); } catch { /* 이번 실행에서만 유지 */ }
    },
    number(key) {
        const value = Number(this.get(key));
        return Number.isFinite(value) && value >= 0 ? value : 0;
    },
    json(key, fallback) {
        try { return JSON.parse(this.get(key)) ?? fallback; } catch { return fallback; }
    }
};

const CUSTOMER_TYPES = {
    standard: { label: '일반', icon: '', patienceMult: 1, scoreMult: 1, weight: 52 },
    vip: { label: 'VIP', icon: '👑', patienceMult: 1.5, scoreMult: 3, weight: 10 },
    child: { label: '어린이', icon: '👶', patienceMult: 2, scoreMult: 1.2, weight: 10 },
    drunk: { label: '취객', icon: '🍺', patienceMult: 0.8, scoreMult: 1.1, weight: 9 },
    business: { label: '직장인', icon: '💼', patienceMult: 1.8, scoreMult: 1.8, weight: 7 },
    cleanFreak: { label: '깔끔쟁이', icon: '🧼', patienceMult: 1.1, scoreMult: 1.4, weight: 6 },
    regular: { label: '단골', icon: '🧾', patienceMult: 0.9, scoreMult: 1.25, comboWindowBonus: 1800, weight: 4 },
    troublemaker: { label: '진상', icon: '💢', patienceMult: 1.2, scoreMult: 1.6, auraDecay: 0.025, weight: 2 }
};

const EVENT_DEFINITIONS = {
    rush: {
        warning: '🚨 곧 러시 아워가 옵니다!',
        start: '🚨 RUSH HOUR!',
        end: '러시 아워 종료',
        className: 'notification-rush',
        duration: 15000
    },
    cleaning: {
        warning: '🧹 곧 오염이 늘어납니다!',
        start: '🧹 CLEANING ALERT!',
        end: '청소 경보 종료',
        className: 'notification-cleaning',
        duration: 14000
    },
    vipTour: {
        warning: '👑 VIP 손님들이 다가옵니다!',
        start: '👑 VIP TOUR!',
        end: 'VIP 투어 종료',
        className: 'notification-vip',
        duration: 16000
    },
    drunkWave: {
        warning: '🍺 취객 무리가 접근 중!',
        start: '🍺 DRUNK WAVE!',
        end: '취객 난입 종료',
        className: 'notification-drunk',
        duration: 14000
    }
};

const UPGRADE_POOL = [
    {
        id: 'airFreshenerPower',
        title: '향기로운 한 방',
        desc: '방향제 회복량 +10',
        apply(game) { game.upgrades.airFreshenerPower += 10; }
    },
    {
        id: 'cleanClicksRequired',
        title: '청소 숙련',
        desc: '오염 청소 필요 클릭 수 -1',
        maxed(game) { return game.upgrades.cleanClicksRequired <= 1; },
        apply(game) { game.upgrades.cleanClicksRequired = Math.max(1, game.upgrades.cleanClicksRequired - 1); }
    },
    {
        id: 'processTimeMultiplier',
        title: '빠른 회전율',
        desc: '시설 사용 시간 10% 감소',
        maxed(game) { return game.upgrades.processTimeMultiplier <= 0.65; },
        apply(game) { game.upgrades.processTimeMultiplier = Math.max(0.65, game.upgrades.processTimeMultiplier - 0.1); }
    },
    {
        id: 'vipScoreMultiplier',
        title: 'VIP 응대 매뉴얼',
        desc: 'VIP 점수 배율 +1',
        apply(game) { game.upgrades.vipScoreMultiplier += 1; }
    },
    {
        id: 'patienceDecayMultiplier',
        title: '침착한 운영',
        desc: '인내심 감소 속도 8% 완화',
        maxed(game) { return game.upgrades.patienceDecayMultiplier <= 0.68; },
        apply(game) { game.upgrades.patienceDecayMultiplier = Math.max(0.68, game.upgrades.patienceDecayMultiplier - 0.08); }
    },
    {
        id: 'criticalThreshold',
        title: '위기 감지 훈련',
        desc: '인내심이 5 더 남았을 때 미리 경고',
        maxed(game) { return game.upgrades.criticalThreshold >= 45; },
        apply(game) { game.upgrades.criticalThreshold = Math.min(45, game.upgrades.criticalThreshold + 5); }
    },
    {
        id: 'comboWindow',
        title: '연속 응대 리듬',
        desc: '콤보 유지 시간 +0.7초',
        apply(game) { game.upgrades.comboWindow += 700; }
    },
    {
        id: 'recoverLife',
        title: '응급 하트',
        desc: '잃은 하트 1개 회복',
        maxed(game) { return game.lives >= 3; },
        apply(game) {
            game.lives = Math.min(3, game.lives + 1);
            game.updateLivesUI();
        }
    },
    {
        id: 'cleanerNpcHire',
        title: '청소부 고용',
        desc: '가장 가까운 오염 시설을 알아서 찾아가 청소해주는 청소부를 고용합니다',
        maxed(game) { return game.upgrades.cleanerNpcHired === true; },
        apply(game) { game.upgrades.cleanerNpcHired = true; }
    },
    {
        id: 'cleanerNpcSpeed',
        title: '청소부 숙련',
        desc: '청소부의 청소 속도가 20% 빨라집니다',
        maxed(game) { return !game.upgrades.cleanerNpcHired || game.upgrades.cleanerNpcTickMs <= 900; },
        apply(game) { game.upgrades.cleanerNpcTickMs = Math.max(900, Math.round(game.upgrades.cleanerNpcTickMs * 0.8)); }
    },
    {
        id: 'cleanerNpcCooldown',
        title: '청소부 재정비 단축',
        desc: '청소부가 다음 시설로 이동하는 대기시간이 20% 줄어듭니다',
        maxed(game) { return !game.upgrades.cleanerNpcHired || game.upgrades.cleanerNpcCooldownMs <= 600; },
        apply(game) { game.upgrades.cleanerNpcCooldownMs = Math.max(600, Math.round(game.upgrades.cleanerNpcCooldownMs * 0.8)); }
    }
];

const ACHIEVEMENT_DEFINITIONS = [
    { id: 'combo15', icon: '🔥', title: '손이 안 보여요!', desc: '한 판에서 콤보 15 달성' },
    { id: 'kidsStreak5', icon: '👶', title: '아이들의 수호자', desc: '어린이 손님 5명 연속 무사고 처리' },
    { id: 'noAirFreshenerClear', icon: '🚫✨', title: '무향(無香)의 고수', desc: '방향제 없이 레벨 클리어' },
    { id: 'clean10', icon: '🧹', title: '청소왕', desc: '오염 시설 누적 10회 완전 청소' },
    { id: 'firstThreeStar', icon: '⭐', title: '완벽주의자 데뷔', desc: '첫 별 3개 클리어' },
    { id: 'threeStarStreak3', icon: '🌟', title: '퍼펙트 트리플', desc: '별 3개로 3레벨 연속 클리어' },
    { id: 'kidsTotal10', icon: '🍼', title: '육아 대행 전문가', desc: '누적 어린이 손님 10명 처리' },
    { id: 'noLifeLost5', icon: '💗', title: '무사고 경력자', desc: '하트를 하나도 잃지 않고 레벨 5 도달' },
    { id: 'timeAttackBurst20', icon: '⚡', title: '타임어택 스퍼트', desc: '타임어택 한 판에서 20명 이상 처리' },
    { id: 'campaignComplete', icon: '🏆', title: '화장실의 전설', desc: '일반 모드 또는 테마 맵에서 10레벨 완주' }
];

const CHALLENGE_POOL = [
    {
        id: 'noAirFreshener',
        icon: '🚫✨',
        title: '방향제 금지의 날',
        desc: '오늘은 방향제 없이 버텨야 합니다!',
        apply(game) { game.challengeModifiers.airFreshenerDisabled = true; }
    },
    {
        id: 'drunkRush',
        icon: '🍺',
        title: '취객 대란의 날',
        desc: '취객 등장 확률이 2배로 늘어납니다.',
        apply(game) { game.challengeModifiers.customerWeightMultipliers.drunk = 2; }
    },
    {
        id: 'dirtyDay',
        icon: '🧹',
        title: '대청소 필요의 날',
        desc: '시설 오염 빈도가 2배로 늘어납니다.',
        apply(game) { game.challengeModifiers.dirtyProbMultiplier = 2; }
    },
    {
        id: 'vipInvasion',
        icon: '👑',
        title: 'VIP 특별 초청의 날',
        desc: 'VIP 점수 5배! 대신 VIP 손님 인내심이 더 빨리 줄어듭니다.',
        apply(game) {
            game.upgrades.vipScoreMultiplier = 5;
            game.challengeModifiers.vipPatienceExtraDecay = 0.03;
        }
    }
];

const THEME_DEFINITIONS = [
    {
        id: 'club',
        icon: '🪩',
        title: '클럽 화장실',
        desc: '취객이 몰려오고 조명이 정신없이 번쩍입니다!',
        available: true,
        apply(game) {
            game.challengeModifiers.customerWeightMultipliers.drunk =
                (game.challengeModifiers.customerWeightMultipliers.drunk || 1) * 2.5;
        }
    },
    {
        id: 'restArea',
        icon: '🛣️',
        title: '휴게소 화장실',
        desc: '러시 아워가 훨씬 자주 몰아칩니다. 미리미리 대비하세요!',
        available: true,
        apply(game) {
            game.challengeModifiers.eventWeightMultipliers.rush =
                (game.challengeModifiers.eventWeightMultipliers.rush || 1) * 3;
        }
    },
    {
        id: 'department',
        icon: '🛍️',
        title: '백화점 화장실',
        desc: 'VIP 손님과 파우더룸 수요가 크게 늘어납니다!',
        available: true,
        apply(game) {
            game.challengeModifiers.customerWeightMultipliers.vip =
                (game.challengeModifiers.customerWeightMultipliers.vip || 1) * 2.5;
            game.challengeModifiers.makeupChanceMultiplier =
                (game.challengeModifiers.makeupChanceMultiplier || 1) * 1.6;
        }
    },
    {
        id: 'school',
        icon: '🎒',
        title: '학교 화장실',
        desc: '어린이 손님이 늘어나고, 짧고 빠른 웨이브가 몰아칩니다!',
        available: true,
        apply(game) {
            game.challengeModifiers.customerWeightMultipliers.child =
                (game.challengeModifiers.customerWeightMultipliers.child || 1) * 2.5;
            game.challengeModifiers.spawnRateMultiplier =
                (game.challengeModifiers.spawnRateMultiplier || 1) * 0.65;
            game.challengeModifiers.levelTargetMultiplier =
                (game.challengeModifiers.levelTargetMultiplier || 1) * 0.6;
            game.levelTarget = Math.max(5, Math.round(game.levelTarget * game.challengeModifiers.levelTargetMultiplier));
        }
    }
];

function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function getTodayChallenge() {
    const dateStr = getTodayDateString();
    const index = hashString(dateStr) % CHALLENGE_POOL.length;
    return { dateStr, def: CHALLENGE_POOL[index] };
}

// 날짜와 용도가 같으면 항상 같은 난수열을 만든다. 시각 효과에는 사용하지 않는다.
function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), state | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

// 배치 시도나 오염 대상 선택이 손님·이벤트 순서를 바꾸지 않도록 분리한다.
function createGameRandomStreams(date = null) {
    const streams = {};
    for (const name of ['customers', 'events', 'dirt', 'dirtyTargets', 'placement', 'upgrades']) {
        streams[name] = date === null ? Math.random : createSeededRandom(hashString(`daily-v1:${date}:${name}`));
    }
    return streams;
}

const FACILITY_LABELS = {
    urinal: '소변기',
    stall: '대변칸',
    sink: '세면대',
    vanity: '파우더룸'
};

class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        // 배경 음악 설정
        this.bgm = new Audio('assets/music/Golden_Morning_Run.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.4;
        this.muted = GameStorage.get('panicToiletMuted') === '1';
        this.bgm.muted = this.muted;
    }

    toggleMute() {
        this.muted = !this.muted;
        this.bgm.muted = this.muted;
        GameStorage.set('panicToiletMuted', this.muted ? '1' : '0');
        return this.muted;
    }

    playBGM() {
        this.bgm.play().catch(e => console.log("BGM play failed:", e));
    }

    pauseBGM() {
        this.bgm.pause();
    }

    stopBGM() {
        this.bgm.pause();
        this.bgm.currentTime = 0;
    }

    play(type) {
        if (this.muted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        switch(type) {
            case 'flush':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.start();
                osc.stop(now + 0.5);
                break;
            case 'wash':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start();
                osc.stop(now + 0.2);
                break;
            case 'alert':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start();
                osc.stop(now + 0.2);
                break;
            case 'spawn':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start();
                osc.stop(now + 0.1);
                break;
            case 'item':
                osc.type = 'square';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start();
                osc.stop(now + 0.3);
                break;
            case 'fail':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 1.0);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 1.0);
                osc.start();
                osc.stop(now + 1.0);
                
                // 두 번째 낮은 음으로 아쉬움 강조
                const osc2 = this.ctx.createOscillator();
                const gain2 = this.ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(this.ctx.destination);
                osc2.type = 'sawtooth';
                osc2.frequency.setValueAtTime(200, now + 0.2);
                osc2.frequency.exponentialRampToValueAtTime(50, now + 1.2);
                gain2.gain.setValueAtTime(0.1, now + 0.2);
                gain2.gain.linearRampToValueAtTime(0, now + 1.2);
                osc2.start(now + 0.2);
                osc2.stop(now + 1.2);
                break;
        }
    }
}

class Game {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.mode = 'normal';
        this.isEndless = false;
        this.isPractice = false;
        this.practiceStep = null;
        this.isGameOver = false;
        this.isPaused = true;
        this.state = 'title';
        this.gameTime = 0;
        this.random = createGameRandomStreams();
        this.accumulatedTime = 0;
        this.lives = 3;
        this.customers = [];
        this.selectedCustomerId = null;
        this.facilities = [];
        this.spawnRate = 6000;
        this.lastSpawnTime = 0;
        this.patienceDecay = 0.05;
        
        // 고도화 시스템 변수
        this.bestScore = GameStorage.number('panicToiletBest');
        this.isNewBest = false;
        this.combo = 0;
        this.lastComboTime = 0;
        this.isRushHour = false;
        this.rushHourEndTime = 0;
        this.itemCooldown = 0;
        this.sound = new SoundManager();
        
        // 스테이지 시스템 변수
        this.levelProgress = 0;
        this.levelTarget = 10; // 첫 레벨 목표 (5 -> 10 상향)
        this.mistakes = 0;
        this.totalLivesLost = 0;
        this.levelStartScore = 0;
        this.totalProcessed = 0;
        this.maxCombo = 0;
        
        // 업그레이드 및 이벤트 시스템
        this.upgrades = {
            airFreshenerPower: 25,
            cleanClicksRequired: 3,
            processTimeMultiplier: 1,
            vipScoreMultiplier: 3,
            patienceDecayMultiplier: 1,
            criticalThreshold: 30,
            comboWindow: 3000,
            cleanerNpcHired: false,
            cleanerNpcTickMs: 1800,
            cleanerNpcCooldownMs: 2500
        };
        this.cleanerNpc = { targetId: null, nextActionAt: 0, anchor: null };
        this.upgradeChoices = [];
        this.selectedUpgradeId = null;
        this.pendingEvent = null;
        this.activeEvent = null;
        this.nextEventAt = 18000;
        this.eventWarningTime = 5000;
        this.dirtyMultiplier = 1;
        this.customerWeights = {};
        this.timeAttackDuration = 60;
        this.timeRemaining = this.timeAttackDuration;
        this.timeAttackPenalty = 5;
        this.lastUpdateTime = null;
        this.notificationQueue = [];
        this.notificationActive = false;

        // 업적/통계
        this.stats = this.loadStats();
        this.unlockedAchievements = new Set(this.loadAchievements());
        this.childStreak = 0;
        this.threeStarStreak = 0;
        this.usedAirFreshenerThisLevel = false;

        // 오늘의 챌린지
        this.isDailyChallenge = false;
        this.dailyChallenge = null;

        // 테마 맵
        this.theme = null;
        this.challengeModifiers = {
            airFreshenerDisabled: false,
            customerWeightMultipliers: {},
            dirtyProbMultiplier: 1,
            vipPatienceExtraDecay: 0,
            eventWeightMultipliers: {},
            makeupChanceMultiplier: 1,
            spawnRateMultiplier: 1,
            levelTargetMultiplier: 1
        };

        this.init();
    }

    init() {
        this.setupFacilities();
        this.bindEvents();
        this.renderFacilities();
        const muteBtn = document.getElementById('mute-btn');
        if (this.sound.muted) {
            muteBtn.innerText = '🔇';
            muteBtn.title = '눌러서 소리 켜기';
        }
        this.updateDailyChallengeBadge();
        this.gameLoop();
    }

    setupFacilities() {
        // 초기 레벨 1 시설 설정
        this.addFacility(new Facility('male-urinal-1', 'urinal', 'male', 'male-urinals'));
        this.addFacility(new Facility('male-stall-1', 'stall', 'male', 'male-stalls'));
        this.addFacility(new Facility('male-sink-1', 'sink', 'male', 'male-sinks'));
        
        this.addFacility(new Facility('female-stall-1', 'stall', 'female', 'female-stalls'));
        this.addFacility(new Facility('female-sink-1', 'sink', 'female', 'female-sinks'));
    }

    bindEvents() {
        document.getElementById('practice-btn').addEventListener('click', () => this.startPractice());
        document.getElementById('practice-skip-btn').addEventListener('click', () => this.finishPractice());
        document.getElementById('start-btn').addEventListener('click', () => this.startGame('normal'));
        document.getElementById('time-attack-btn').addEventListener('click', () => this.startGame('timeAttack'));
        document.getElementById('daily-challenge-btn').addEventListener('click', () => this.startDailyChallenge());
        document.getElementById('theme-btn').addEventListener('click', () => this.toggleThemeSelect(true));
        document.getElementById('close-theme-btn').addEventListener('click', () => this.toggleThemeSelect(false));
        document.getElementById('theme-content').addEventListener('click', (e) => {
            const card = e.target.closest('.theme-card');
            if (card && !card.classList.contains('locked')) this.startThemeGame(card.dataset.themeId);
        });
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
        document.getElementById('item-air-freshener').addEventListener('click', () => this.useAirFreshener());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());
        document.getElementById('campaign-retry-btn').addEventListener('click', () => {
            if (this.state === 'campaignComplete') location.reload();
        });
        document.getElementById('upgrade-shop').addEventListener('click', (e) => {
            const card = e.target.closest('.upgrade-card');
            if (card) this.selectUpgrade(card.dataset.upgradeId);
        });
        
        // 도움말 관련 이벤트
        document.getElementById('help-btn').addEventListener('click', () => this.toggleTutorial(true));
        document.getElementById('back-btn').addEventListener('click', () => this.toggleTutorial(false));
        document.getElementById('close-help-btn').addEventListener('click', () => this.toggleTutorial(false));

        // 업적 관련 이벤트
        document.getElementById('achievements-btn').addEventListener('click', () => this.toggleAchievements(true));
        document.getElementById('close-achievements-btn').addEventListener('click', () => this.toggleAchievements(false));

        window.addEventListener('keydown', (e) => {
            if (!e.repeat && e.key.toLowerCase() === 'p') this.togglePause();
            if (e.key === 'Escape') this.clearSelectedCustomer();
        });
        // 다른 탭으로 이동한 동안에는 게임 시간을 진행하지 않는다.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') this.togglePause();
        });
    }

    startGame(mode = 'normal') {
        if (this.state === 'paused') {
            this.resumeGame();
            return;
        }
        if (this.isGameOver) {
            location.reload();
            return;
        }
        if (this.state !== 'title') return;
        this.mode = mode;
        this.bestScore = this.loadBestScore();
        this.timeRemaining = this.timeAttackDuration;
        if (mode === 'timeAttack') {
            this.spawnRate = this.getSpawnInterval();
            this.lastSpawnTime = 1000 - this.spawnRate;
            if (!this.facilities.some(f => f.id === 'time-attack-female-stall')) {
                this.addFacility(new Facility('time-attack-female-stall', 'stall', 'female', 'female-stalls'));
            }
        }
        this.setGameState('playing');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('overlay').classList.remove('game-over-screen');
        document.getElementById('overlay').classList.remove('session-menu');
        document.getElementById('best-val').innerText = this.bestScore;
        this.configureModeUI();
        this.updateLivesUI();
        this.updateTimerUI();
        this.sound.play('spawn');
        this.sound.playBGM(); // BGM 시작
        this.updateLevelProgressUI();
    }

    // 일반 시작 흐름을 재사용하되, 연습 전용 손님과 진행 규칙만 적용한다.
    startPractice() {
        if (this.state !== 'title') return;
        this.isPractice = true;
        this.startGame('normal');
        document.getElementById('practice-panel').classList.remove('hidden');
        const customer = new Customer('male', 'standard', {}, () => 0.9);
        customer.need = 'pee';
        customer.needsWash = true;
        customer.needsMakeup = false;
        this.customers.push(customer);
        customer.render('customer-queue');
        this.setPracticeStep('place');
    }

    // 필요한 목적지 한 곳만 강조하며 단계별 안내를 제공한다.
    setPracticeStep(step) {
        this.practiceStep = step;
        const instructions = {
            place: ['1 / 3 · 손님 배치', '손님을 초록색 테두리의 남자 소변기로 끌어 옮겨보세요. 손님을 누른 뒤 시설을 눌러도 됩니다. 인내심은 줄지 않아요.'],
            usingToilet: ['1 / 3 · 시설 이용 중', '잘했어요! 이용이 끝나면 손님이 대기실로 돌아오고 욕구가 손 씻기로 바뀝니다.'],
            wash: ['2 / 3 · 손 씻기', '이번에는 손님을 한 번 누른 뒤 초록색 세면대를 눌러보세요. Tab과 Enter 또는 Space도 사용할 수 있어요.'],
            washing: ['2 / 3 · 손 씻는 중', '좋아요! 손 씻기가 끝나면 마지막으로 청소를 연습합니다.'],
            clean: ['3 / 3 · 시설 청소', '소변기가 오염됐어요. 초록색 테두리의 시설을 3번 누르세요. 청소가 끝나면 다시 사용할 수 있습니다.'],
            complete: ['실습 완료!', '배치 → 손 씻기 → 청소를 모두 익혔어요. 이제 일반 모드에서 도전해보세요! 실습은 점수와 업적에 포함되지 않습니다.']
        };
        const [title, text] = instructions[step];
        document.getElementById('practice-title').innerText = title;
        document.getElementById('practice-instruction').innerText = text;
        document.getElementById('practice-skip-btn').innerText = step === 'complete' ? '일반 모드 시작 →' : '건너뛰고 일반 모드 시작';
        const target = step === 'place' || step === 'clean' ? 'male-urinal-1' : step === 'wash' ? 'male-sink-1' : null;
        for (const facility of this.facilities) facility.el.classList.toggle('practice-target', facility.id === target);
        if (step === 'complete') this.setGameState('practiceComplete');
        this.updateLevelProgressUI();
    }

    // 실습 중 일어난 일만 정리하고 기존 최고 기록·통계·업적은 보존한다.
    finishPractice() {
        if (!this.isPractice) return;
        this.setGameState('title');
        for (const customer of this.customers) customer.el?.remove();
        this.customers = [];
        for (const facility of this.facilities) {
            facility.release();
            facility.isDirty = false;
            facility.cleanClicks = 0;
            facility.el.classList.remove('dirty', 'practice-target');
            document.getElementById(`${facility.id}-fill`).style.width = '0%';
        }
        this.isPractice = false;
        this.practiceStep = null;
        this.gameTime = 0;
        this.lastSpawnTime = 0;
        this.spawnRate = 6000;
        this.random = createGameRandomStreams();
        for (const id of ['practice-panel', 'help-overlay', 'achievements-overlay', 'theme-overlay']) document.getElementById(id).classList.add('hidden');
        document.getElementById('overlay').classList.remove('pause-menu');
        document.getElementById('pause-btn').innerText = '일시정지 (P)';
        this.startGame('normal');
    }

    // 연습에서는 시설 이용 시간만 진행하고 압박·등장·오염·점수는 계산하지 않는다.
    updatePractice(delta) {
        for (const customer of this.customers) {
            if (customer.state !== 'using') continue;
            customer.processTime = Math.max(0, customer.processTime - delta);
            if (customer.processTime <= 0) this.finishUsage(customer);
        }
    }

    loadBestScore() {
        const best = GameStorage.number(this.getBestScoreKey());
        return this.isDailyChallenge ? Math.max(best, this.getDailyChallengeRecord().best) : best;
    }

    getBestScoreKey() {
        if (this.isEndless) return `panicToiletEndlessBest:${this.theme || 'normal'}`;
        if (this.isDailyChallenge) return `panicToiletDailyBest:${this.dailyChallenge.dateStr}`;
        if (this.theme) return `panicToiletThemeBest:${this.theme}`;
        return this.mode === 'timeAttack' ? 'panicToiletTimeAttackBest' : 'panicToiletBest';
    }

    // 자정이 지나도 시작한 날짜에 저장하며, 기존 단일 날짜 기록도 읽어 보존한다.
    getDailyChallengeRecord(date = this.dailyChallenge?.dateStr || getTodayDateString()) {
        const parsed = GameStorage.json(`panicToiletDailyChallenge:${date}`, null)
            || GameStorage.json('panicToiletDailyChallenge', {});
        const valid = parsed && parsed.date === date;
        return {
            date,
            best: valid && Number.isFinite(parsed.best) && parsed.best >= 0 ? parsed.best : 0,
            plays: valid && Number.isInteger(parsed.plays) && parsed.plays >= 0 ? parsed.plays : 0
        };
    }

    saveDailyChallengeRecord(record) {
        GameStorage.set(`panicToiletDailyChallenge:${record.date}`, JSON.stringify(record));
    }

    startDailyChallenge() {
        if (this.state !== 'title') return;
        this.isDailyChallenge = true;
        const { dateStr, def } = getTodayChallenge();
        this.dailyChallenge = { dateStr, def };
        this.random = createGameRandomStreams(dateStr);
        def.apply(this);
        this.startGame('timeAttack');
    }

    startThemeGame(themeId) {
        if (this.state !== 'title') return;
        const theme = THEME_DEFINITIONS.find(t => t.id === themeId);
        if (!theme || !theme.available) return;
        this.theme = themeId;
        theme.apply(this);
        this.toggleThemeSelect(false);
        this.startGame('normal');
    }

    toggleThemeSelect(show) {
        if (show) this.renderThemeSelect();
        document.getElementById('theme-overlay').classList.toggle('hidden', !show);
    }

    renderThemeSelect() {
        const content = document.getElementById('theme-content');
        content.innerHTML = THEME_DEFINITIONS.map(t => `
            <div class="theme-card ${t.available ? '' : 'locked'}" data-theme-id="${t.id}">
                <span class="theme-icon">${t.icon}</span>
                <span class="theme-name">${t.title}</span>
                <span class="theme-desc">${t.desc}</span>
            </div>
        `).join('');
    }

    updateDailyChallengeBadge() {
        const badge = document.getElementById('daily-challenge-badge');
        if (!badge) return;
        const { def } = getTodayChallenge();
        const record = this.getDailyChallengeRecord();
        badge.innerText = record.plays > 0
            ? `${def.icon} ${def.title} · 최고 ${record.best}점`
            : `${def.icon} ${def.title} · 도전 전!`;
    }

    configureModeUI() {
        const isTimeAttack = this.mode === 'timeAttack';
        document.getElementById('best-label').innerText = this.isEndless ? '무한 최고' : this.isDailyChallenge ? '오늘 최고' : this.theme ? '테마 최고' : isTimeAttack ? '타임 최고' : '일반 최고';
        document.getElementById('timer-box').classList.toggle('hidden', !isTimeAttack);
        document.getElementById('life-box').classList.toggle('hidden', isTimeAttack);
        document.getElementById('progress-label').innerText = isTimeAttack ? 'PROCESSED' : this.isEndless ? '무한 모드' : 'LEVEL PROGRESS';
        document.body.classList.toggle('time-attack-mode', isTimeAttack);
        document.body.classList.toggle('theme-club', this.theme === 'club');
        if (this.isDailyChallenge && this.dailyChallenge) {
            const def = this.dailyChallenge.def;
            this.showNotification(`🗓️ ${def.icon} ${def.title} — ${def.desc}`);
        } else if (this.theme) {
            const def = THEME_DEFINITIONS.find(t => t.id === this.theme);
            if (def) this.showNotification(`${def.icon} ${def.title} — ${def.desc}`);
        } else if (isTimeAttack) {
            this.showNotification("⏱️ 타임어택 시작! 60초 안에 최대 점수!");
        }
    }

    toggleTutorial(show) {
        document.getElementById('help-overlay').classList.toggle('hidden', !show);
    }

    toggleAchievements(show) {
        if (show) this.renderAchievements();
        document.getElementById('achievements-overlay').classList.toggle('hidden', !show);
    }

    renderAchievements() {
        const content = document.getElementById('achievements-content');
        const progress = document.getElementById('achievements-progress');
        progress.innerText = `${this.unlockedAchievements.size} / ${ACHIEVEMENT_DEFINITIONS.length} 달성`;

        content.innerHTML = ACHIEVEMENT_DEFINITIONS.map(a => {
            const unlocked = this.unlockedAchievements.has(a.id);
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                    <span class="achievement-icon">${unlocked ? a.icon : '🔒'}</span>
                    <span class="achievement-name">${a.title}</span>
                    <span class="achievement-desc">${a.desc}</span>
                </div>
            `;
        }).join('');
    }

    // 진행 상태와 기존 표시용 플래그를 한곳에서 변경한다.
    setGameState(state) {
        this.state = state;
        this.isPaused = state !== 'playing';
        this.isGameOver = state === 'gameOver';
        this.lastUpdateTime = performance.now();
        this.accumulatedTime = 0;
        if (state !== 'playing') {
            this.clearSelectedCustomer();
            for (const customer of this.customers) customer.cancelDrag?.();
        }
    }

    // 재개할 때 기존 모드·점수·남은 시간·이벤트 일정을 그대로 유지한다.
    resumeGame() {
        if (this.state !== 'paused') return;
        this.setGameState('playing');
        for (const id of ['overlay', 'help-overlay', 'achievements-overlay', 'theme-overlay']) {
            document.getElementById(id).classList.add('hidden');
        }
        document.getElementById('overlay').classList.remove('pause-menu');
        document.getElementById('pause-btn').innerText = '일시정지 (P)';
        this.sound.playBGM();
    }

    togglePause() {
        if (this.state === 'paused') {
            this.resumeGame();
        } else if (this.state === 'playing') {
            this.setGameState('paused');
            document.getElementById('pause-btn').innerText = '재개하기 (P)';
            document.getElementById('overlay').classList.remove('hidden');
            document.getElementById('overlay').classList.add('session-menu');
            document.getElementById('overlay').classList.add('pause-menu');
            document.getElementById('help-overlay').classList.add('hidden');
            document.getElementById('modal-title').innerText = "일시정지";
            document.getElementById('modal-desc').innerText = "잠시 숨을 고르세요.";
            document.getElementById('start-btn').innerText = "계속하기";
            document.getElementById('start-btn').setAttribute('aria-label', '계속하기');
            this.sound.pauseBGM(); // BGM 일시정지
        }
    }

    toggleMute() {
        const muted = this.sound.toggleMute();
        const btn = document.getElementById('mute-btn');
        btn.innerText = muted ? '🔇' : '🔊';
        btn.title = muted ? '눌러서 소리 켜기' : '소리가 시끄러우면 눌러주세요';
    }

    renderFacilities() {
        this.facilities.forEach(f => {
            if (!f.el) f.render();
        });
    }

    loadStats() {
        const parsed = GameStorage.json('panicToiletStats', {});
        return {
            cleanCount: Number.isInteger(parsed?.cleanCount) && parsed.cleanCount >= 0 ? parsed.cleanCount : 0,
            kidsTotal: Number.isInteger(parsed?.kidsTotal) && parsed.kidsTotal >= 0 ? parsed.kidsTotal : 0
        };
    }

    saveStats() {
        GameStorage.set('panicToiletStats', JSON.stringify(this.stats));
    }

    loadAchievements() {
        const parsed = GameStorage.json('panicToiletAchievements', []);
        return Array.isArray(parsed) ? parsed.filter(id => ACHIEVEMENT_DEFINITIONS.some(def => def.id === id)) : [];
    }

    unlockAchievement(id) {
        if (this.unlockedAchievements.has(id)) return;
        this.unlockedAchievements.add(id);
        GameStorage.set('panicToiletAchievements', JSON.stringify([...this.unlockedAchievements]));
        const def = ACHIEVEMENT_DEFINITIONS.find(a => a.id === id);
        if (!def) return;
        this.showNotification(`🏅 업적 달성! ${def.icon} ${def.title}`, 'notification-achievement');
        this.sound.play('item');
    }

    gameLoop(timestamp) {
        if (this.state === 'playing') {
            this.advanceFrame(timestamp);
            this.draw();
        }
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    // 화면 갱신률과 분리해 1초당 60회 같은 규칙을 계산한다.
    // 긴 실행 지연은 최대 250ms만 따라잡아 복귀 직후 대량 실패를 방지한다.
    advanceFrame(timestamp) {
        if (this.state !== 'playing' || !Number.isFinite(timestamp)) return;
        const delta = this.lastUpdateTime === null ? 0 : Math.max(0, Math.min(250, timestamp - this.lastUpdateTime));
        this.lastUpdateTime = timestamp;
        this.accumulatedTime += delta;
        const step = 1000 / 60;
        while (this.accumulatedTime + 0.000001 >= step && this.state === 'playing') {
            this.accumulatedTime = Math.max(0, this.accumulatedTime - step);
            this.update(step);
        }
    }

    // 모든 진행 시간은 일시정지가 제외된 게임 시간만 참조한다.
    update(delta) {
        if (this.state !== 'playing') return;
        if (this.isPractice) { this.updatePractice(delta); return; }
        this.gameTime += delta;
        const timestamp = this.gameTime;
        if (this.mode === 'timeAttack') {
            this.updateTimeAttackTimer(delta);
            if (this.isGameOver) return;
        }

        this.updateEventSystem(timestamp);

        // 아이템 쿨타임 업데이트
        if (this.itemCooldown > 0) {
            this.itemCooldown = Math.max(0, this.itemCooldown - delta);
            const percent = (this.itemCooldown / 20000) * 100;
            document.getElementById('item-cooldown').style.height = `${percent}%`;
        }

        // 스폰 속도 조절 (러시 아워 시 2배 빠름)
        const currentSpawnRate = this.isRushHour ? this.spawnRate / 2 : this.spawnRate;
        if (timestamp - this.lastSpawnTime > currentSpawnRate) {
            this.spawnCustomer();
            this.lastSpawnTime = timestamp;
            this.spawnRate = this.getSpawnInterval();
        }

        // 무작위 시설 오염 (레벨에 따라 점진적 증가)
        const dirtyProb = (0.0004 + (this.level * 0.0003)) * this.dirtyMultiplier * this.challengeModifiers.dirtyProbMultiplier;
        if (this.random.dirt() < dirtyProb) {
            this.makeFacilityDirty();
        }

        // 청소부 NPC (고용 시 오염 시설을 하나씩 자동 청소)
        if (this.upgrades.cleanerNpcHired) {
            this.updateCleanerNpc(timestamp);
        }

        let troublemakerCount = 0;
        for (const c of this.customers) {
            if (c.state === 'waiting' && c.type === 'troublemaker') troublemakerCount++;
        }
        for (const c of this.customers) {
            if (this.state !== 'playing') break;
            if (c.state === 'waiting') {
                const auraPenalty = c.type === 'troublemaker' ? 0 : troublemakerCount * (CUSTOMER_TYPES.troublemaker.auraDecay || 0);
                const vipChallengePenalty = c.type === 'vip' ? this.challengeModifiers.vipPatienceExtraDecay : 0;
                c.patience -= ((this.patienceDecay * this.upgrades.patienceDecayMultiplier * c.patienceMult) + auraPenalty + vipChallengePenalty);
                if (c.patience < this.upgrades.criticalThreshold) {
                    if (!c.el.classList.contains('critical')) {
                        this.sound.play('alert');
                        this.showNotification("🚨 빨간 표시는 인내심 한계! 지금 바로 배치하세요!");
                    }
                    c.el.classList.add('critical');
                    c.el.title = `긴급 처리: ${c.getActionLabel()}에 바로 배치하세요.`;
                } else {
                    c.el.classList.remove('critical');
                    c.el.title = `${c.getActionLabel()}에 배치하세요.`;
                }

                if (c.patience <= 0) this.loseLife(c);
            } else if (c.state === 'using') {
                c.processTime = Math.max(0, c.processTime - delta);
                // 세면대 사용 시 파티클
                if (c.currentFacility.type === 'sink' && Math.random() > 0.7) {
                    this.createParticle(c.currentFacility.el);
                }
                if (c.processTime <= 0) this.finishUsage(c);
            }
        }

        // 콤보 타이머 체크
        if (this.combo > 0 && timestamp - this.lastComboTime > this.upgrades.comboWindow) {
            this.resetCombo();
        }

        this.updatePressureUI();
    }

    updateTimeAttackTimer(delta) {
        this.timeRemaining = Math.max(0, this.timeRemaining - (delta / 1000));
        // 소수 계산의 미세한 잔여값 때문에 종료가 한 박자 늦어지지 않게 한다.
        if (this.timeRemaining < 0.000000001) this.timeRemaining = 0;
        this.updateTimerUI();
        if (this.timeRemaining <= 0) {
            this.finishTimeAttack();
        }
    }

    updateTimerUI() {
        const timeEl = document.getElementById('time-val');
        if (!timeEl) return;
        timeEl.innerText = Math.ceil(this.timeRemaining);
        timeEl.classList.toggle('timer-low', this.timeRemaining <= 10);
    }

    updateEventSystem(timestamp) {
        if (this.activeEvent && timestamp > this.activeEvent.endsAt) {
            const eventDef = EVENT_DEFINITIONS[this.activeEvent.type];
            this.endActiveEvent(eventDef);
        }

        if (!this.activeEvent && !this.pendingEvent && timestamp > this.nextEventAt) {
            this.scheduleRandomEvent(timestamp);
        }

        if (this.pendingEvent && !this.pendingEvent.warned && timestamp > this.pendingEvent.warnAt) {
            this.pendingEvent.warned = true;
            const eventDef = EVENT_DEFINITIONS[this.pendingEvent.type];
            this.showNotification(eventDef.warning, eventDef.className);
        }

        if (this.pendingEvent && timestamp > this.pendingEvent.startsAt) {
            this.startScheduledEvent(timestamp);
        }
    }

    scheduleRandomEvent(timestamp) {
        const baseTypes = ['rush', 'cleaning', 'vipTour', 'drunkWave'];
        const pool = [];
        baseTypes.forEach(t => {
            const mult = this.challengeModifiers.eventWeightMultipliers[t] || 1;
            const count = Math.max(1, Math.round(mult));
            for (let i = 0; i < count; i++) pool.push(t);
        });
        const type = pool[Math.floor(this.random.events() * pool.length)];
        this.pendingEvent = {
            type,
            warned: false,
            warnAt: timestamp,
            startsAt: timestamp + this.eventWarningTime
        };
    }

    startScheduledEvent(timestamp) {
        const type = this.pendingEvent.type;
        const eventDef = EVENT_DEFINITIONS[type];
        this.pendingEvent = null;
        this.activeEvent = {
            type,
            endsAt: timestamp + eventDef.duration
        };

        this.applyEventModifiers(type);
        this.showNotification(eventDef.start, eventDef.className);
        this.sound.play('alert');
    }

    endActiveEvent(eventDef) {
        this.showNotification(eventDef.end);
        this.activeEvent = null;
        this.isRushHour = false;
        this.dirtyMultiplier = 1;
        this.customerWeights = {};
        this.nextEventAt = this.gameTime + 22000 + this.random.events() * 18000;
    }

    applyEventModifiers(type) {
        this.isRushHour = type === 'rush';
        this.dirtyMultiplier = type === 'cleaning' ? 3 : 1;
        this.customerWeights = {};
        if (type === 'vipTour') this.customerWeights.vip = 34;
        if (type === 'drunkWave') this.customerWeights.drunk = 32;
    }

    checkLevelClear() {
        if (this.state !== 'playing' || this.mode === 'timeAttack') return;
        if (this.levelProgress >= this.levelTarget) {
            this.showClearScreen();
        }
    }

    showClearScreen() {
        if (this.state !== 'playing') return;
        const completed = this.mode === 'normal' && this.level === 10 && !this.isEndless;
        this.setGameState(completed ? 'campaignComplete' : 'levelClear');
        this.sound.pauseBGM();
        
        const overlay = document.getElementById('clear-overlay');
        overlay.classList.remove('hidden');
        document.getElementById('clear-title').innerText = completed ? '🏆 10레벨 완주!' : this.isEndless ? `무한 모드 ${this.level}레벨 완료!` : 'LEVEL CLEAR!';
        document.getElementById('campaign-summary').classList.toggle('hidden', !completed);
        document.getElementById('campaign-retry-btn').classList.toggle('hidden', !completed);
        document.getElementById('campaign-hint').classList.toggle('hidden', !completed);
        if (completed) {
            const themeName = THEME_DEFINITIONS.find(theme => theme.id === this.theme)?.title || '일반 모드';
            document.getElementById('campaign-summary').innerText = `${themeName} 완주를 축하합니다!\n최종 점수: ${this.score}\n처리한 손님: ${this.totalProcessed}\n최고 콤보: ${this.maxCombo}\n놓친 손님: ${this.totalLivesLost}`;
            this.unlockAchievement('campaignComplete');
        }
        
        document.getElementById('clear-customers').innerText = this.levelProgress;
        document.getElementById('clear-score').innerText = this.score - this.levelStartScore;
        this.renderUpgradeChoices();
        
        // 스타 등급 계산 (실수 횟수 기준)
        const stars = document.querySelectorAll('#star-rating .star');
        stars.forEach(s => s.classList.remove('active'));
        
        let activeStars = 0;
        if (this.mistakes === 0) activeStars = 3;
        else if (this.mistakes < 3) activeStars = 2;
        else activeStars = 1;

        if (!this.usedAirFreshenerThisLevel) this.unlockAchievement('noAirFreshenerClear');
        if (activeStars === 3) {
            this.threeStarStreak++;
            this.unlockAchievement('firstThreeStar');
            if (this.threeStarStreak >= 3) this.unlockAchievement('threeStarStreak3');
        } else {
            this.threeStarStreak = 0;
        }

        for (let i = 0; i < activeStars; i++) {
            setTimeout(() => stars[i].classList.add('active'), i * 300);
        }
        
        this.sound.play('item'); // 축하 사운드 대용
    }

    nextLevel() {
        if (this.state !== 'levelClear' && this.state !== 'campaignComplete') return;
        if (!this.selectedUpgradeId) {
            this.showNotification("업그레이드를 하나 선택하세요!");
            return;
        }

        // 완주 기록은 유지하고, 이후 점수는 별도의 무한 모드 기록으로 보관한다.
        if (this.state === 'campaignComplete') {
            this.isEndless = true;
            this.bestScore = this.loadBestScore();
            this.isNewBest = false;
            this.addScore(0);
            this.configureModeUI();
        }

        this.level++;
        if (this.level === 5 && this.totalLivesLost === 0) this.unlockAchievement('noLifeLost5');
        this.levelProgress = 0;
        this.levelStartScore = this.score;
        this.levelTarget = Math.max(5, Math.round((10 + (this.level * 5)) * this.challengeModifiers.levelTargetMultiplier)); // 목표 상향 (10, 20, 25...)
        this.mistakes = 0;
        this.selectedUpgradeId = null;
        this.usedAirFreshenerThisLevel = false;

        document.getElementById('clear-overlay').classList.add('hidden');
        this.handleLevelUp(); // 시설 추가 로직
        
        this.setGameState('playing');
        this.sound.playBGM();
        this.updateLevelProgressUI();
        this.updatePressureUI();
    }

    renderUpgradeChoices() {
        const shop = document.getElementById('upgrade-shop');
        const nextBtn = document.getElementById('next-level-btn');
        this.selectedUpgradeId = null;
        nextBtn.disabled = true;
        nextBtn.innerText = this.state === 'campaignComplete' ? '무한 모드 보상 선택 필요' : '업그레이드 선택 필요';

        const available = UPGRADE_POOL.filter(upgrade => !upgrade.maxed || !upgrade.maxed(this));
        this.upgradeChoices = this.pickRandomItems(available, 3);

        shop.innerHTML = `
            <div class="upgrade-title">다음 레벨 보너스 선택</div>
            <div class="upgrade-grid">
                ${this.upgradeChoices.map(upgrade => `
                    <button class="upgrade-card" data-upgrade-id="${upgrade.id}">
                        <span class="upgrade-name">${upgrade.title}</span>
                        <span class="upgrade-desc">${upgrade.desc}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    pickRandomItems(items, count) {
        const copy = [...items];
        const picked = [];
        while (copy.length && picked.length < count) {
            const index = Math.floor(this.random.upgrades() * copy.length);
            picked.push(copy.splice(index, 1)[0]);
        }
        return picked;
    }

    selectUpgrade(upgradeId) {
        if (this.state !== 'levelClear' && this.state !== 'campaignComplete') return;
        const upgrade = this.upgradeChoices.find(item => item.id === upgradeId);
        if (!upgrade || this.selectedUpgradeId) return;

        upgrade.apply(this);
        this.selectedUpgradeId = upgradeId;

        document.querySelectorAll('.upgrade-card').forEach(card => {
            card.disabled = true;
            card.classList.toggle('selected', card.dataset.upgradeId === upgradeId);
        });

        const nextBtn = document.getElementById('next-level-btn');
        nextBtn.disabled = false;
        nextBtn.innerText = this.state === 'campaignComplete' ? '무한 모드 시작 →' : '다음 레벨로';
        this.showNotification(`${upgrade.title} 적용!`);
    }

    updateLevelProgressUI() {
        if (this.isPractice) {
            const completed = ['wash', 'washing'].includes(this.practiceStep) ? 1 : this.practiceStep === 'clean' ? 2 : this.practiceStep === 'complete' ? 3 : 0;
            document.getElementById('progress-label').innerText = '조작 연습';
            document.getElementById('level-progress-text').innerText = `${completed} / 3`;
            document.getElementById('level-progress-fill').style.width = `${completed / 3 * 100}%`;
            return;
        }
        if (this.mode === 'timeAttack') {
            document.getElementById('level-progress-fill').style.width = `100%`;
            document.getElementById('level-progress-text').innerText = `${this.totalProcessed} 처리`;
            return;
        }

        const percent = (this.levelProgress / this.levelTarget) * 100;
        document.getElementById('level-progress-fill').style.width = `${percent}%`;
        document.getElementById('level-progress-text').innerText = `${this.levelProgress} / ${this.levelTarget}`;
    }

    updatePressureUI() {
        const waiting = this.customers.filter(c => c.state === 'waiting');
        const lowPatience = waiting.length
            ? waiting.reduce((sum, c) => sum + (100 - c.patience), 0) / waiting.length
            : 0;
        const queuePressure = Math.min(40, waiting.length * 6);
        const levelPressure = Math.min(25, this.level * 2.2);
        const eventPressure = this.activeEvent ? 18 : 0;
        const pressure = Math.min(100, lowPatience * 0.45 + queuePressure + levelPressure + eventPressure);
        const fill = document.getElementById('pressure-fill');
        if (fill) fill.style.width = `${pressure}%`;

        document.body.style.setProperty('--panic', (pressure / 100).toFixed(2));
        document.body.classList.toggle('pressure-high', pressure >= 60);
        document.body.classList.toggle('pressure-critical', pressure >= 82);
    }

    handleLevelUp() {
        this.patienceDecay += 0.012;
        
        switch(this.level) {
            case 2:
                this.addFacility(new Facility('female-stall-2', 'stall', 'female', 'female-stalls'));
                this.addFacility(new Facility('female-sink-2', 'sink', 'female', 'female-sinks'));
                break;
            case 3:
                this.addFacility(new Facility('male-urinal-2', 'urinal', 'male', 'male-urinals'));
                this.addFacility(new Facility('female-vanity-2', 'vanity', 'female', 'female-vanity'));
                break;
            case 4:
                this.addFacility(new Facility('male-stall-2', 'stall', 'male', 'male-stalls'));
                this.addFacility(new Facility('male-sink-2', 'sink', 'male', 'male-sinks'));
                break;
            case 5:
                this.addFacility(new Facility('female-stall-3', 'stall', 'female', 'female-stalls'));
                break;
            case 6:
                this.addFacility(new Facility('male-urinal-3', 'urinal', 'male', 'male-urinals'));
                break;
            case 7:
                this.addFacility(new Facility('female-vanity-3', 'vanity', 'female', 'female-vanity'));
                this.addFacility(new Facility('female-sink-3', 'sink', 'female', 'female-sinks'));
                break;
            case 8:
                this.addFacility(new Facility('male-stall-3', 'stall', 'male', 'male-stalls'));
                break;
            case 9:
                this.addFacility(new Facility('female-stall-4', 'stall', 'female', 'female-stalls'));
                break;
            case 10:
                this.addFacility(new Facility('male-urinal-4', 'urinal', 'male', 'male-urinals'));
                this.addFacility(new Facility('female-stall-5', 'stall', 'female', 'female-stalls'));
                this.showNotification('마지막 10레벨! 완주에 도전하세요!');
                return;
        }
        this.showNotification(`LEVEL ${this.level} UP!`);
    }

    addFacility(facility) {
        this.facilities.push(facility);
        facility.render();
        this.updateFacilityDensity();
    }

    // 시설이 많아지면 모바일에서 작게 보이도록 화면 밀도 단계를 정한다.
    updateFacilityDensity() {
        const perZone = { male: 0, female: 0 };
        this.facilities.forEach(f => { perZone[f.gender] = (perZone[f.gender] || 0) + 1; });
        const max = Math.max(perZone.male, perZone.female);
        document.body.classList.toggle('dense-2', max >= 7);
        document.body.classList.toggle('dense-3', max >= 10);
    }

    spawnCustomer() {
        const gender = this.random.customers() > 0.5 ? 'male' : 'female';
        const type = this.pickCustomerType();

        const customer = new Customer(gender, type, this.getAvailableNeeds(), this.random.customers);
        this.customers.push(customer);
        customer.render('customer-queue');
        if (type !== 'standard') {
            const def = CUSTOMER_TYPES[type];
            this.showNotification(`${def.icon} ${def.label} 손님 등장!`);
        }
    }

    // 짧은 모드는 충분한 손님을 제공하고 일반 모드의 기존 진행 속도는 유지한다.
    getSpawnInterval() {
        const base = this.mode === 'timeAttack' ? 2200 : 6000 - this.level * 500;
        return Math.max(1000, base * this.challengeModifiers.spawnRateMultiplier);
    }

    pickCustomerType() {
        const weights = Object.entries(CUSTOMER_TYPES).map(([type, def]) => {
            let weight = this.customerWeights[type] || def.weight;
            if (this.level < 3 && ['business', 'cleanFreak', 'regular', 'troublemaker'].includes(type)) weight *= 0.35;
            if (this.level >= 6 && type === 'troublemaker') weight += 2;
            weight *= (this.challengeModifiers.customerWeightMultipliers[type] || 1);
            return { type, weight };
        });
        const total = weights.reduce((sum, item) => sum + item.weight, 0);
        let roll = this.random.customers() * total;
        for (const item of weights) {
            roll -= item.weight;
            if (roll <= 0) return item.type;
        }
        return 'standard';
    }

    getAvailableNeeds() {
        return {
            makeup: this.facilities.some(f => f.type === 'vanity'),
            makeupChanceMultiplier: this.challengeModifiers.makeupChanceMultiplier
        };
    }

    draw() {
        document.getElementById('score-val').innerText = this.score;
        document.getElementById('level-val').innerText = this.level;
        document.getElementById('best-val').innerText = this.bestScore;
        this.updateLivesUI();
        this.customers.forEach(c => c.updateUI());
        this.facilities.forEach(f => f.updateUI());
        if (this.selectedCustomerId) this.refreshSelection();
    }

    updateLivesUI() {
        const lifeEl = document.getElementById('life-val');
        if (!lifeEl) return;
        const hearts = '♥'.repeat(Math.max(0, this.lives));
        const lost = '♡'.repeat(Math.max(0, 3 - this.lives));
        lifeEl.innerText = hearts + lost;
    }

    addScore(points) {
        this.score = Math.max(0, this.score + points);
        document.getElementById('score-val').innerText = this.score;
        if (this.mode === 'normal' && this.score > this.bestScore) {
            this.bestScore = this.score;
            GameStorage.set(this.getBestScoreKey(), this.bestScore);
            this.markNewBest();
        }
    }

    markNewBest() {
        const bestEl = document.getElementById('best-val');
        bestEl.innerText = this.bestScore;
        bestEl.classList.remove('best-pop');
        void bestEl.offsetWidth;
        bestEl.classList.add('best-pop');

        if (!this.isNewBest) {
            this.isNewBest = true;
            this.showNotification("🏆 최고점수 갱신!");
        }
    }

    loseLife(victim) {
        if (this.isGameOver || !victim || victim.state === 'failed') return;
        if (this.mode === 'timeAttack') {
            this.applyTimeAttackMiss(victim);
            return;
        }

        if (victim.type === 'child') this.childStreak = 0;
        victim.state = 'failed';
        this.lives = Math.max(0, this.lives - 1);
        this.totalLivesLost++;
        this.mistakes++;
        this.updateLivesUI();

        if (victim.el) {
            const rect = victim.el.getBoundingClientRect();
            this.createShockwave(rect.left + rect.width / 2, rect.top + rect.height / 2);
            victim.el.classList.add('customer-failed');
            setTimeout(() => victim.el?.remove(), 450);
        }

        this.customers = this.customers.filter(c => c !== victim);
        this.resetCombo();
        document.getElementById('life-val')?.classList.remove('life-hit');
        void document.getElementById('life-val')?.offsetWidth;
        document.getElementById('life-val')?.classList.add('life-hit');
        if (this.lives <= 0) {
            this.gameOver(victim);
            return;
        }

        this.sound.play('fail');
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 450);
        this.showNotification(`💔 생명 -1! 남은 생명 ${this.lives}개`);
    }

    applyTimeAttackMiss(victim) {
        if (victim.type === 'child') this.childStreak = 0;
        victim.state = 'failed';
        this.mistakes++;
        this.timeRemaining = Math.max(0, this.timeRemaining - this.timeAttackPenalty);
        this.addScore(-100);
        this.updateTimerUI();

        if (victim.el) {
            const rect = victim.el.getBoundingClientRect();
            this.createShockwave(rect.left + rect.width / 2, rect.top + rect.height / 2);
            victim.el.classList.add('customer-failed');
            setTimeout(() => victim.el?.remove(), 450);
        }

        this.customers = this.customers.filter(c => c !== victim);
        this.resetCombo();
        this.sound.play('fail');
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 450);

        if (this.timeRemaining <= 0) {
            this.finishTimeAttack();
            return;
        }

        this.showNotification(`⏱️ 실수! -${this.timeAttackPenalty}초 / -100점`);
    }

    finishTimeAttack() {
        if (this.isGameOver) return;
        this.timeRemaining = 0;
        this.updateTimerUI();
        if (this.totalProcessed >= 20) this.unlockAchievement('timeAttackBurst20');
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            GameStorage.set(this.getBestScoreKey(), this.bestScore);
            this.markNewBest();
        }

        if (this.isDailyChallenge) {
            const record = this.getDailyChallengeRecord();
            record.plays++;
            if (this.score > record.best) record.best = this.score;
            this.saveDailyChallengeRecord(record);
            this.dailyChallengeResult = record;
        }

        this.gameOver(null, 'timeAttack');
    }

    gameOver(victim, reason = 'normal') {
        if (this.isGameOver) return;
        this.setGameState('gameOver');
        document.body.classList.add('shake'); // 화면 흔들림
        this.sound.stopBGM(); // BGM 정지
        this.sound.play('fail'); // 아쉬운 사운드 재생
        
        // 충격파 및 화면 붉게 물드는 연출 추가
        if (victim && victim.el) {
            const rect = victim.el.getBoundingClientRect();
            this.createShockwave(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
        
        const flashOverlay = document.createElement('div');
        flashOverlay.className = 'blood-flash-overlay';
        document.body.appendChild(flashOverlay);

        setTimeout(() => {
            const overlay = document.getElementById('overlay');
            overlay.classList.remove('hidden');
            overlay.classList.add('game-over-screen');
            overlay.classList.add('session-menu');
            
            // UI 요소 정리
            document.getElementById('help-overlay').classList.add('hidden');
            document.getElementById('help-btn').classList.add('hidden');
            document.getElementById('back-btn').classList.add('hidden');
            document.getElementById('modal-desc').classList.remove('hidden');
            
            if (reason === 'timeAttack' && this.isDailyChallenge) {
                const def = this.dailyChallenge?.def;
                document.getElementById('modal-title').innerText = "오늘의 챌린지 종료!";
                document.getElementById('modal-desc').innerText =
                    `${def ? def.icon + ' ' + def.title : ''}\n최종 점수: ${this.score}\n처리한 손님: ${this.totalProcessed}\n최고 콤보: ${this.maxCombo}\n오늘의 최고 기록: ${this.dailyChallengeResult?.best ?? this.score}`;
            } else if (reason === 'timeAttack') {
                document.getElementById('modal-title').innerText = "타임어택 종료!";
                document.getElementById('modal-desc').innerText =
                    `최종 점수: ${this.score}\n처리한 손님: ${this.totalProcessed}\n최고 콤보: ${this.maxCombo}\n실수: ${this.mistakes}\n타임어택 최고 기록: ${this.bestScore}`;
            } else {
                document.getElementById('modal-title').innerText = "불상사 발생!";
                document.getElementById('modal-desc').innerText = `최종 점수: ${this.score}\n최고 기록: ${this.bestScore}`;
            }
            const startBtn = document.getElementById('start-btn');
            startBtn.style.display = 'inline-block';
            startBtn.className = 'secondary-btn';
            startBtn.innerText = '재도전';
            startBtn.setAttribute('aria-label', '재도전');
            startBtn.onclick = () => location.reload();
            document.getElementById('time-attack-btn').classList.add('hidden');
        }, 1500); // 연출을 위해 1.5초 지연
    }

    // 드래그·클릭·키보드가 같은 배치 규칙을 사용한다.
    canAssignCustomer(customer, facility) {
        if (this.state !== 'playing' || !customer || customer.state !== 'waiting' || !facility || facility.isOccupied || facility.isDirty || customer.gender !== facility.gender) return false;
        if (this.isPractice && facility.id !== (this.practiceStep === 'place' ? 'male-urinal-1' : this.practiceStep === 'wash' ? 'male-sink-1' : null)) return false;
        return (facility.type === 'sink' && customer.need === 'wash') ||
            (facility.type === 'vanity' && customer.need === 'makeup') ||
            (facility.type === 'urinal' && customer.need === 'pee') ||
            (facility.type === 'stall' && (customer.need === 'pee' || customer.need === 'defecate'));
    }

    // 상태 문구가 바뀔 때만 갱신하여 읽기 도구가 매 프레임 반복 안내하지 않게 한다.
    showGuide(text) {
        const guide = document.getElementById('play-guide');
        if (guide && guide.innerText !== text) guide.innerText = text;
    }

    selectCustomer(id) {
        if (this.state !== 'playing') return;
        const customer = this.customers.find(c => c.id === id && c.state === 'waiting');
        if (!customer) return;
        const deselect = this.selectedCustomerId === id;
        this.clearSelectedCustomer();
        if (deselect) return;
        this.selectedCustomerId = id;
        customer.el.classList.add('selected');
        this.refreshSelection();
    }

    clearSelectedCustomer() {
        for (const customer of this.customers) customer.el?.classList.remove('selected');
        for (const facility of this.facilities) facility.el?.classList.remove('selection-target');
        this.selectedCustomerId = null;
        this.showGuide('손님을 끌어 옮기거나, 손님을 누른 뒤 시설을 눌러 안내하세요.');
    }

    // 점유·오염이 바뀌면 선택 가능한 목적지도 함께 갱신한다.
    refreshSelection() {
        const customer = this.customers.find(c => c.id === this.selectedCustomerId && c.state === 'waiting');
        if (!customer) { this.clearSelectedCustomer(); return; }
        let available = 0;
        for (const facility of this.facilities) {
            const valid = this.canAssignCustomer(customer, facility);
            facility.el?.classList.toggle('selection-target', valid);
            if (valid) available++;
        }
        this.showGuide(available ? `${customer.getActionLabel()}로 안내하세요. 초록색 시설을 누르면 됩니다.` : `${customer.getActionLabel()}가 모두 사용 중이거나 오염됐어요. 빈 시설을 기다리거나 청소하세요.`);
    }

    assignCustomer(customerId, facilityId) {
        if (this.state !== 'playing') return;
        const customer = this.customers.find(c => c.id === customerId);
        const facility = this.facilities.find(f => f.id === facilityId);
        if (!this.canAssignCustomer(customer, facility)) {
            this.showGuide('지금은 배치할 수 없어요. 손님의 욕구와 초록색 시설을 확인하세요.');
            return;
        }

        if (customer && customer.state === 'waiting' && facility && !facility.isOccupied && !facility.isDirty) {
            // 성별 체크
            if (facility.gender !== customer.gender) return;

            // 취객 실수 로직 (30% 확률로 빗나감)
            if (customer.type === 'drunk' && this.random.placement() < 0.3) {
                this.showNotification("🍺 취객이 휘청거려 배치를 실패했습니다!");
                this.sound.play('alert');
                this.showGuide('취객이 휘청거렸어요. 같은 시설을 다시 선택해 주세요.');
                return;
            }
            
            if (facility.type === 'sink') {
                if (customer.need === 'wash') customer.startUsing(facility, this.getProcessTime(2000));
            } else if (facility.type === 'vanity') {
                if (customer.need === 'makeup') customer.startUsing(facility, this.getProcessTime(5000));
            } else if (facility.type === 'urinal') {
                if (customer.need === 'defecate' || customer.need === 'wash' || customer.need === 'makeup') return;
                customer.startUsing(facility, this.getProcessTime(2000));
            } else if (facility.type === 'stall') {
                if (customer.need === 'wash' || customer.need === 'makeup') return;
                const time = customer.need === 'defecate' ? 5000 : 2500;
                customer.startUsing(facility, this.getProcessTime(time));
            }
            this.clearSelectedCustomer();
            this.showGuide('안내 완료! 손님이 대기실로 돌아오면 바뀐 욕구에 맞춰 다시 안내하세요.');
            if (this.isPractice) this.setPracticeStep(facility.type === 'sink' ? 'washing' : 'usingToilet');
        }
    }

    getProcessTime(baseTime) {
        return Math.max(900, baseTime * this.upgrades.processTimeMultiplier);
    }

    finishUsage(customer) {
        const facility = customer.currentFacility;
        facility.release();
        if (this.isPractice) {
            if (this.practiceStep === 'usingToilet') {
                customer.need = 'wash';
                this.moveToWaiting(customer, 0);
                this.setPracticeStep('wash');
            } else if (this.practiceStep === 'washing') {
                customer.state = 'exiting';
                customer.el.remove();
                this.customers = [];
                this.facilities.find(item => item.id === 'male-urinal-1').makeDirty();
                this.setPracticeStep('clean');
            }
            return;
        }
        
        if (facility.type === 'urinal' || facility.type === 'stall') {
            // 용변 후
            if (customer.needsWash) {
                customer.need = 'wash';
                this.moveToWaiting(customer, 30);
            } else if (customer.needsMakeup) {
                customer.need = 'makeup';
                this.moveToWaiting(customer, 20);
            } else {
                this.exitCustomer(customer);
            }
        } else if (facility.type === 'sink') {
            // 손 씻기 후
            customer.needsWash = false;
            if (customer.needsMakeup) {
                customer.need = 'makeup';
                this.moveToWaiting(customer, 20);
            } else {
                this.exitCustomer(customer);
            }
        } else if (facility.type === 'vanity') {
            // 메이크업 후
            customer.needsMakeup = false;
            this.exitCustomer(customer);
        }
    }

    moveToWaiting(customer, patienceBonus) {
        customer.state = 'waiting';
        customer.patience = Math.min(100, customer.patience + patienceBonus);
        document.getElementById('customer-queue').appendChild(customer.el);
        customer.el.style.display = 'flex';
        customer.refreshNeeds(); // 아이콘 업데이트
        customer.updateUI();
    }

    exitCustomer(customer) {
        customer.state = 'exiting'; // 상태를 변경하여 업데이트 루프에서 중복 처리되는 것을 방지합니다.

        const comboBonus = 1 + (this.combo * 0.1);
        const typeDef = CUSTOMER_TYPES[customer.type] || CUSTOMER_TYPES.standard;
        let baseScore = 150 * typeDef.scoreMult;
        
        if (customer.type === 'vip') {
            baseScore = 150 * this.upgrades.vipScoreMultiplier;
            this.createStarParticles(customer.el);
            this.showNotification("👑 VIP 처리 보너스! 👑");
        }

        const finalScore = Math.floor(baseScore * comboBonus);
        this.addScore(finalScore);
        this.levelProgress++;
        this.totalProcessed++;

        if (customer.type === 'child') {
            this.stats.kidsTotal++;
            this.saveStats();
            this.childStreak++;
            if (this.childStreak >= 5) this.unlockAchievement('kidsStreak5');
            if (this.stats.kidsTotal >= 10) this.unlockAchievement('kidsTotal10');
        }

        this.updateLevelProgressUI();
        this.updateCombo();
        this.checkLevelClear();
        this.sound.play('flush');

        // 퇴장 연출 시작
        const facilityEl = customer.currentFacility.el;
        const rect = facilityEl.getBoundingClientRect();
        
        // 손님 요소 다시 표시 및 위치 설정
        customer.el.style.display = 'flex';
        customer.el.style.position = 'fixed';
        customer.el.style.left = `${rect.left}px`;
        customer.el.style.top = `${rect.top}px`;
        customer.el.classList.add('exit-anim');

        // Thank You 말풍선 생성
        const bubble = document.createElement('div');
        bubble.className = 'thank-you-bubble';
        bubble.innerText = 'Thank You! ✨';
        bubble.style.left = `${rect.left + rect.width / 2}px`;
        bubble.style.top = `${rect.top}px`;
        document.body.appendChild(bubble);

        // 일정 시간 후 요소 제거 및 데이터 정리
        setTimeout(() => {
            customer.el.remove();
            bubble.remove();
            this.customers = this.customers.filter(c => c !== customer);
        }, 800);
    }

    createStarParticles(el) {
        for (let i = 0; i < 10; i++) {
            const star = document.createElement('div');
            star.className = 'particle-star';
            star.innerText = '⭐';
            const rect = el.getBoundingClientRect();
            star.style.left = `${rect.left + rect.width / 2}px`;
            star.style.top = `${rect.top + rect.height / 2}px`;
            
            // 랜덤 방향
            const tx = (Math.random() - 0.5) * 200;
            const ty = (Math.random() - 0.5) * 200;
            star.style.setProperty('--tx', `${tx}px`);
            star.style.setProperty('--ty', `${ty}px`);
            
            document.body.appendChild(star);
            setTimeout(() => star.remove(), 800);
        }
    }

    updateCombo() {
        this.combo++;
        if (this.combo >= 15) this.unlockAchievement('combo15');
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.lastComboTime = this.gameTime;
        const customer = this.customers.find(c => c.state === 'exiting');
        if (customer && CUSTOMER_TYPES[customer.type]?.comboWindowBonus) {
            this.lastComboTime += CUSTOMER_TYPES[customer.type].comboWindowBonus;
        }
        const comboEl = document.getElementById('combo-container');
        comboEl.classList.add('combo-show');
        comboEl.classList.remove('combo-hide');
        document.getElementById('combo-val').innerText = this.combo;
    }

    resetCombo() {
        this.combo = 0;
        const comboEl = document.getElementById('combo-container');
        comboEl.classList.remove('combo-show');
        comboEl.classList.add('combo-hide');
    }

    startRushHour(timestamp) {
        this.isRushHour = true;
        this.rushHourEndTime = timestamp + 15000; // 15초간 지속
        this.showNotification("🚨 RUSH HOUR! 🚨", 'notification-rush');
        this.sound.play('alert');
    }

    makeFacilityDirty() {
        // 일일 도전은 오염을 시도할 시설까지 고정한다. 사용 중이면 해당 시도만 건너뛴다.
        const roll = this.random.dirtyTargets();
        if (this.isDailyChallenge) {
            const facility = this.facilities[Math.floor(roll * this.facilities.length)];
            if (facility && !facility.isDirty && !facility.isOccupied) facility.makeDirty();
            return;
        }
        const cleanFacilities = this.facilities.filter(f => !f.isDirty && !f.isOccupied);
        if (cleanFacilities.length > 0) {
            const f = cleanFacilities[Math.floor(roll * cleanFacilities.length)];
            f.makeDirty();
        }
    }

    updateCleanerNpc(timestamp) {
        const npc = this.cleanerNpc;

        if (npc.targetId) {
            const target = this.facilities.find(f => f.id === npc.targetId);
            if (!target || !target.isDirty) {
                if (target) {
                    target.el?.classList.remove('npc-cleaning');
                    this.setCleanerAnchorFromFacility(target);
                }
                npc.targetId = null;
                npc.nextActionAt = timestamp + this.upgrades.cleanerNpcCooldownMs;
                return;
            }
            if (timestamp >= npc.nextActionAt) {
                target.clean();
                npc.nextActionAt = timestamp + this.upgrades.cleanerNpcTickMs;
            }
            return;
        }

        if (timestamp < npc.nextActionAt) return;
        const target = this.pickNearestDirtyFacility();
        if (!target) return;
        npc.targetId = target.id;
        target.el?.classList.add('npc-cleaning');
        npc.nextActionAt = timestamp + this.upgrades.cleanerNpcTickMs;
    }

    pickNearestDirtyFacility() {
        const dirty = this.facilities.filter(f => f.isDirty && f.el && !f.el.classList.contains('npc-cleaning'));
        if (!dirty.length) return null;
        const anchor = this.cleanerNpc.anchor || this.getDefaultCleanerAnchor();
        let best = null;
        let bestDist = Infinity;
        dirty.forEach(f => {
            const rect = f.el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(cx - anchor.x, cy - anchor.y);
            if (dist < bestDist) {
                bestDist = dist;
                best = f;
            }
        });
        return best;
    }

    getDefaultCleanerAnchor() {
        const el = document.getElementById('item-air-freshener');
        if (el) {
            const rect = el.getBoundingClientRect();
            return { x: rect.left, y: rect.top };
        }
        return { x: 0, y: 0 };
    }

    setCleanerAnchorFromFacility(facility) {
        if (!facility.el) return;
        const rect = facility.el.getBoundingClientRect();
        this.cleanerNpc.anchor = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    useAirFreshener() {
        if (this.isPractice) { this.showGuide('실습에서는 인내심이 줄지 않아 방향제가 필요하지 않아요.'); return; }
        if (this.isPaused || this.isGameOver || this.itemCooldown > 0) return;
        if (this.challengeModifiers.airFreshenerDisabled) {
            this.showNotification('🚫 오늘은 방향제 금지일! 맨몸으로 버텨주세요!');
            return;
        }

        this.usedAirFreshenerThisLevel = true;
        this.customers.forEach(c => {
            if (c.state === 'waiting') {
                c.patience = Math.min(100, c.patience + this.upgrades.airFreshenerPower);
            }
        });
        
        this.itemCooldown = 20000; // 20초 쿨타임
        this.sound.play('item');
        this.showNotification("✨ 방향제 사용! 인내심 회복");
    }

    createParticle(parentEl) {
        const p = document.createElement('div');
        p.className = 'particle';
        const rect = parentEl.getBoundingClientRect();
        p.style.left = `${rect.left + Math.random() * rect.width}px`;
        p.style.top = `${rect.top + rect.height / 2}px`;
        p.style.width = `${4 + Math.random() * 4}px`;
        p.style.height = p.style.width;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 600);
    }

    createShockwave(x, y) {
        const shockwave = document.createElement('div');
        shockwave.className = 'shockwave-effect';
        shockwave.style.left = `${x}px`;
        shockwave.style.top = `${y}px`;
        document.body.appendChild(shockwave);
        setTimeout(() => shockwave.remove(), 1500);
    }

    showNotification(text, className = '') {
        this.notificationQueue.push({ text, className });
        if (this.notificationQueue.length > 4) {
            this.notificationQueue.splice(0, this.notificationQueue.length - 4);
        }
        if (!this.notificationActive) this.processNotificationQueue();
    }

    processNotificationQueue() {
        const next = this.notificationQueue.shift();
        if (!next) {
            this.notificationActive = false;
            return;
        }
        this.notificationActive = true;

        const el = document.getElementById('notification');
        el.innerText = next.text;
        el.className = '';
        if (next.className) el.classList.add(next.className);
        el.classList.add('show');

        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => this.processNotificationQueue(), 220);
        }, 1600);
    }
}

class Customer {
    static idCounter = 0;
    constructor(gender, type = 'standard', availableNeeds = {}, random = Math.random) {
        this.id = `cust-${Customer.idCounter++}`;
        this.gender = gender;
        this.type = type;
        this.patience = 100;
        this.state = 'waiting';
        this.need = gender === 'male' ? (random() > 0.7 ? 'defecate' : 'pee') : 'defecate';
        this.needsWash = random() > 0.15; // 85% 확률로 손 씻기
        const canUseMakeup = availableNeeds.makeup === true;
        const makeupMult = availableNeeds.makeupChanceMultiplier || 1;
        this.needsMakeup = canUseMakeup && gender === 'female' && random() > Math.max(0.05, 0.4 / makeupMult); // 기본 60% 확률로 화장, 테마 배율 적용
        this.processTime = 0;
        this.initialProcessTime = 0;
        this.currentFacility = null;
        this.el = null;

        // 타입별 특성 설정
        const typeDef = CUSTOMER_TYPES[type] || CUSTOMER_TYPES.standard;
        this.patienceMult = typeDef.patienceMult;
        this.scoreMult = typeDef.scoreMult;

        if (type === 'business') {
            this.need = 'pee';
            this.needsWash = random() > 0.45;
            this.needsMakeup = false;
        }

        if (type === 'cleanFreak') {
            this.needsWash = true;
            this.needsMakeup = canUseMakeup && gender === 'female' && random() > Math.max(0.05, 0.2 / makeupMult);
        }
    }

    render(containerId) {
        const div = document.createElement('div');
        div.id = this.id;
        div.className = `customer ${this.gender} ${this.type}`;
        div.tabIndex = 0;
        div.setAttribute('role', 'button');

        div.innerHTML = `
            <div class="avatar sprite"></div>
            <div class="info">
                <div class="customer-type">${CUSTOMER_TYPES[this.type]?.icon || ''} ${CUSTOMER_TYPES[this.type]?.label || '일반'}</div>
                <div class="patience-bar"><div class="patience-fill" id="${this.id}-bar"></div></div>
                <div class="needs-container" id="${this.id}-needs"></div>
            </div>
        `;

        div.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!e.repeat) window.game.selectCustomer(this.id);
            }
        });

        document.getElementById(containerId).appendChild(div);
        this.el = div;
        this.refreshNeeds();
    }

    // 마우스와 터치를 함께 지원하는 드래그 처리 (Pointer Events)
    onPointerDown(e) {
        if (window.game.state !== 'playing' || this.state !== 'waiting' || this.cancelDrag) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const el = this.el;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = el.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        let dragging = false;
        let ghost = null;
        let dragLayer = null;
        let lastFacilityEl = null;

        const clearHighlight = () => {
            if (lastFacilityEl) {
                lastFacilityEl.classList.remove('drag-over', 'drag-invalid');
                lastFacilityEl = null;
            }
        };

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!dragging && Math.hypot(dx, dy) > 6) {
                window.game.clearSelectedCustomer();
                dragging = true;
                el.classList.add('dragging');
                ghost = el.cloneNode(true);
                ghost.classList.add('drag-ghost');
                ghost.style.width = `${rect.width}px`;
                // 복사본을 별도 고정 영역에 두어 본문 배치와 스크롤 크기를 바꾸지 않는다.
                dragLayer = document.createElement('div');
                dragLayer.className = 'customer-drag-layer';
                dragLayer.setAttribute('aria-hidden', 'true');
                dragLayer.appendChild(ghost);
                document.body.appendChild(dragLayer);
            }
            if (!dragging) return;

            ghost.style.left = `${ev.clientX - offsetX}px`;
            ghost.style.top = `${ev.clientY - offsetY}px`;

            if (ghost.style.display !== 'none') ghost.style.display = 'none';
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            ghost.style.display = '';

            const facilityEl = under ? under.closest('.facility') : null;
            if (facilityEl !== lastFacilityEl) {
                clearHighlight();
                lastFacilityEl = facilityEl;
            }
            if (facilityEl) {
                const facility = window.game.facilities.find(f => f.id === facilityEl.id);
                // 안내 색상이 실제 배치 규칙과 일치하도록 현재 욕구도 확인한다.
                const isValid = window.game.canAssignCustomer(this, facility);
                facilityEl.classList.toggle('drag-over', !!isValid);
                facilityEl.classList.toggle('drag-invalid', !isValid);
            }
        };

        const onUp = (ev) => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
            el.removeEventListener('lostpointercapture', onUp);
            this.cancelDrag = null;
            if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

            if (dragging) {
                el.classList.remove('dragging');
                clearHighlight();
                if (ghost) {
                    ghost.style.display = 'none';
                    // 취소된 터치나 포인터는 시설 배치로 처리하지 않는다.
                    const under = ev.type === 'pointerup' ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
                    ghost.remove();
                    dragLayer.remove();
                    const facilityEl = under ? under.closest('.facility') : null;
                    if (facilityEl) window.game.assignCustomer(this.id, facilityEl.id);
                }
            } else if (ev.type === 'pointerup') {
                window.game.selectCustomer(this.id);
            }
        };

        el.setPointerCapture(e.pointerId);
        this.cancelDrag = () => onUp({ type: 'pointercancel' });
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('lostpointercapture', onUp);
    }

    refreshNeeds() {
        const container = document.getElementById(`${this.id}-needs`);
        if (!container) return;
        
        let needsHtml = '';
        // 현재 및 남은 모든 욕구를 아이콘으로 표시
        if (this.need === 'defecate' || this.need === 'pee') {
            if (this.need === 'defecate') needsHtml += '<div class="need-icon need-poop"></div>';
            else needsHtml += '<div class="need-icon need-pee"></div>';
            
            if (this.needsWash) needsHtml += '<div class="need-icon need-wash" style="opacity: 0.5; transform: scale(0.8)"></div>';
            if (this.needsMakeup) needsHtml += '<div class="need-icon need-makeup" style="opacity: 0.5; transform: scale(0.8)"></div>';
        } else if (this.need === 'wash') {
            needsHtml += '<div class="need-icon need-wash"></div>';
            if (this.needsMakeup) needsHtml += '<div class="need-icon need-makeup" style="opacity: 0.5; transform: scale(0.8)"></div>';
        } else if (this.need === 'makeup') {
            needsHtml += '<div class="need-icon need-makeup"></div>';
        }
        
        needsHtml += `<div class="need-action">${this.getActionLabel()}</div>`;
        container.innerHTML = needsHtml;
        if (this.el) this.el.title = `${this.getActionLabel()}에 배치하세요.`;
    }

    getActionLabel() {
        if (this.need === 'pee') return this.gender === 'male' ? '남자 소변기' : '여자 대변칸';
        if (this.need === 'defecate') return this.gender === 'male' ? '남자 대변칸' : '여자 대변칸';
        if (this.need === 'wash') return this.gender === 'male' ? '남자 세면대' : '여자 세면대';
        if (this.need === 'makeup') return '파우더룸';
        return '알맞은 시설';
    }

    updateUI() {
        if (!this.el) return;
        // 인내심에 따라 표정만 바꾸며 게임 규칙과 판정에는 영향을 주지 않는다.
        this.el.classList.toggle('anxious', this.patience < 60);
        const bar = document.getElementById(`${this.id}-bar`);
        if (bar) {
            bar.style.width = `${this.patience}%`;
            if (this.patience < 30) bar.style.backgroundColor = '#ef4444';
            else if (this.patience < 60) bar.style.backgroundColor = '#f59e0b';
            else bar.style.backgroundColor = '#22c55e';
        }
    }

    startUsing(facility, time) {
        this.state = 'using';
        this.processTime = time;
        this.initialProcessTime = time;
        this.currentFacility = facility;
        facility.occupy(this);
        this.el.style.display = 'none';
    }
}

class Facility {
    constructor(id, type, gender, parentId) {
        this.id = id;
        this.type = type;
        this.gender = gender;
        this.parentId = parentId;
        this.isOccupied = false;
        this.isDirty = false;
        this.cleanClicks = 0;
        this.currentUser = null;
        this.el = null;
    }

    render() {
        const div = document.createElement('div');
        div.id = this.id;
        div.className = `facility ${this.type}`;
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.setAttribute('aria-label', `${this.gender === 'male' ? '남자' : '여자'} ${FACILITY_LABELS[this.type]}`);
        div.innerHTML = `
            <div class="sprite-icon"></div>
            <span class="facility-label">${FACILITY_LABELS[this.type] || this.type}</span>
            <div class="facility-progress"><div class="facility-progress-fill" id="${this.id}-fill"></div></div>
        `;
        
        // 청소 클릭 이벤트
        // 청소와 선택 배치를 같은 버튼 조작으로 제공한다.
        const activate = () => {
            if (window.game.state !== 'playing') return;
            if (this.isDirty) {
                this.clean();
                window.game.showGuide(this.isDirty ? `청소 ${this.cleanClicks}번 남았어요.` : '청소 완료! 이제 손님을 안내할 수 있어요.');
            } else if (window.game.selectedCustomerId) {
                window.game.assignCustomer(window.game.selectedCustomerId, this.id);
            } else {
                window.game.showGuide('먼저 대기실에서 손님을 선택하세요.');
            }
        };
        div.addEventListener('click', activate);
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!e.repeat) activate();
            }
        });

        document.getElementById(this.parentId).appendChild(div);
        this.el = div;
    }

    makeDirty() {
        this.isDirty = true;
        this.cleanClicks = window.game?.upgrades?.cleanClicksRequired || 3;
        this.maxCleanClicks = this.cleanClicks;
        this.el.classList.add('dirty');
        this.updateCleanUI(); // UI 바를 100%로 설정
    }

    clean() {
        if (window.game.state !== 'playing' || !this.isDirty) return;
        this.cleanClicks--;
        window.game.sound.play('wash');
        this.updateCleanUI();
        if (this.cleanClicks <= 0) {
            this.isDirty = false;
            this.el.classList.remove('dirty');
            if (window.game.isPractice) {
                window.game.setPracticeStep('complete');
                return;
            }
            window.game.stats.cleanCount++;
            window.game.saveStats();
            if (window.game.stats.cleanCount >= 10) window.game.unlockAchievement('clean10');
        }
    }

    updateCleanUI() {
        const fill = document.getElementById(`${this.id}-fill`);
        if (fill) {
            const percent = (this.cleanClicks / (this.maxCleanClicks || 3)) * 100;
            fill.style.width = `${percent}%`;
        }
    }

    occupy(customer) {
        this.isOccupied = true;
        this.currentUser = customer;
        this.el.classList.add('occupied');
    }

    release() {
        this.isOccupied = false;
        this.currentUser = null;
        this.el.classList.remove('occupied');
    }

    updateUI() {
        if (this.isOccupied && this.currentUser) {
            const fill = document.getElementById(`${this.id}-fill`);
            if (fill) {
                const total = this.currentUser.initialProcessTime;
                const current = this.currentUser.processTime;
                const percent = ((total - current) / total) * 100;
                fill.style.width = `${percent}%`;
            }
        }
    }
}

window.onload = () => {
    window.game = new Game();
};
