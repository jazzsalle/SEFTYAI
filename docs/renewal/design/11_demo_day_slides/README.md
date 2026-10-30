# 시연 따라하기 슬라이드 만드는 법

`../11_demo_day_slides.pptx` = 진행자가 11/4 리허설·11/5 시연에서 띄워 놓고 따라 하는 슬라이드다(청중용 아님). 대본 [`../11_demo_day_story.md`](../11_demo_day_story.md)를 단계마다 두 장(① 누르기 · ② 짚기·말하기)으로 옮기고, 화면 사진은 로컬 리허설 화면이다.

| 파일 | 내용 |
|---|---|
| `content.json` | 슬라이드 글 — 대본에서 뽑아 대본·앱 화면 글자와 대조한 것(준비·운영 순서·단계별 누를 것·짚을 것·말할 것·주의·막히면·발표자 노트) |
| `build.cjs` | 슬라이드 만들기(pptxgenjs) — 글 크기를 칸에 맞추고, 화면 사진을 자르고(답 카드 머리 · 특보 줄 · 주황 테두리 둘레), 테마 색을 쓴다 |
| `package.json` | 만들 때 쓰는 도구(pptxgenjs · sharp) — 앱 의존성과 따로 둔다 |

## 다시 만들기

1. 화면 사진(로컬 — 개발 서버 `localhost:3100`, 실제 T3Q 질의가 나간다):
   - `cd app` → `node harness/e2e/rehearsal.mjs http://localhost:3100 --deck` — 대본 순서대로 누르며 누를 곳에 주황 테두리를 그려 찍는다(`harness/reports/shots/deck_*.png`)
   - `node harness/e2e/deck_answers.mjs harness/recordings/rehearsal_<시각>` — 같은 작업을 대화 이력에서 열어 답 카드 머리를 찍는다(질의 없음)
2. 이 폴더에서 `npm install` → `node build.cjs ../11_demo_day_slides.pptx`
   - 사진 폴더가 다르면 환경 변수 `DECK_SHOTS` 로 준다
   - 글이 칸을 넘칠 것 같으면 끝에 「넘칠 수 있음」으로 알린다 — `content.json` 글을 줄인다

대본을 고치면 `content.json` 도 같이 고친다(질문 글·조건은 `app/src/lib/library.ts` DEMO_DAY 와 글자까지 같아야 한다).
