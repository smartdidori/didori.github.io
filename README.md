# 🎮 Didori Arcade (디도리 캐주얼 아케이드)

> **설치 없이 브라우저에서 바로 즐기는 가볍고 유쾌한 캐주얼 웹 게임 모음집**  
> 🌐 **웹사이트 바로가기:** [https://smartdidori.github.io/](https://smartdidori.github.io/)

---

## 📌 사이트 소개
**Didori Arcade**는 PC와 모바일 브라우저 어디서나 별도의 설치 없이 즉시 플레이할 수 있는 캐주얼 미니게임 포털입니다.  
직관적인 룰과 스피디한 게임성을 가진 웹 기반 게임들을 지속적으로 개발 및 서비스하고 있습니다.

---

## 🕹️ 서비스 중인 게임 라인업

### 1. 🚽 급해! 토일렛 매니저 (Panic! Toilet Manager)
- **장르:** 캐주얼 아케이드 / 손님 관리 / 타임어택
- **플레이 주소:** [게임 바로 플레이하기 🚀](https://smartdidori.github.io/games/toilet-game/)
- **게임 소개:**
  - 밀려드는 손님들의 대참사를 막아라! 화장실 칸이 비는 즉시 신속하게 손님을 배치해야 합니다.
  - 급박한 손님들의 인내심을 회복시켜주는 **방향제 아이템**, **콤보 시스템**, **점수 랭킹** 지원!
  - 스마트폰 세로/가로 모드 완벽 대응 (한 화면에 꽉 차는 모바일 최적화 UI)

### 2. ⛳ 골프골프 · 부킹 매니저 (GolfGolf)
- **장르:** 전략 경영 타이쿤 / 티타임 예약 퍼즐
- **플레이 주소:** [게임 바로 플레이하기 ⛳](https://smartdidori.github.io/games/golfgolf/)
- **게임 소개:**
  - 한 칸의 선택, 하루의 승부! 골프장의 티타임 예약표를 빈틈없이 운영하는 전략 타이쿤 게임.
  - 단체 고객을 위한 연속 블록 확보, 프라임 타임(×1.2) 단가 극대화, 35% 노쇼 위험 조율!
  - 8초 홀드, 판촉 모드, 시설 재투자 시스템 및 5일 시즌 명예의 전당 랭킹 지원.

---

## 🚀 향후 라인업 (Coming Soon)
- 🧩 **신작 퍼즐 & 두뇌 게임** (출시 준비 중)
- 🏃 **러닝 & 타이밍 아케이드 액션** (기획 중)
- 새로운 미니게임들이 계속해서 추가될 예정입니다!

---

## 🛠️ 기술 스택
- **Frontend:** HTML5, CSS3, Modern JavaScript (ES6+)
- **Audio & Assets:** Web Audio API, SVG, Pixel Sprite Art
- **Hosting & CI/CD:** GitHub Pages, GitHub Actions

---

## 📂 프로젝트 디렉터리 구조

```text
smartdidori.github.io/
├── index.html                  # 🎮 메인 아케이드 포털 페이지
├── README.md                   # 📄 프로젝트 및 사이트 소개
└── games/                      # 📁 개별 게임 모음 디렉터리
    ├── toilet-game/            # 🚽 1호 게임: 급해! 토일렛 매니저
    │   ├── index.html
    │   ├── game.js
    │   ├── style.css
    │   ├── arcade.css
    │   ├── assets/             # 이미지, 사운드, 스프라이트 리소스
    │   └── previews/           # 게임 썸네일 및 프리뷰
    └── golfgolf/               # ⛳ 2호 게임: 골프골프 · 부킹 매니저
        ├── index.html
        ├── game.js
        ├── style.css
        ├── engine.js
        ├── club.js
        └── bot.js
```

---

## ➕ 새로운 게임 추가 가이드
1. `games/<새게임폴더명>/` 경로에 완성된 웹 게임 파일(`index.html`, 스크립트, 리소스)을 생성합니다.
2. 메인 [`index.html`](index.html)의 `.games-grid` 섹션에 새 게임 카드(제목, 설명, 썸네일, 링크)를 추가합니다.
3. Git 커밋 후 `main` 브랜치에 푸시하면 GitHub Pages를 통해 자동으로 즉시 배포됩니다.

---

## 👨‍💻 Developer
- **GitHub:** [@smartdidori](https://github.com/smartdidori)
- **Repository:** [smartdidori/smartdidori.github.io](https://github.com/smartdidori/smartdidori.github.io)

&copy; 2026 Didori. Powered by GitHub Pages.
