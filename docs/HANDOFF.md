# 인수인계 — 재난안전 AI 시범서비스 · T3Q 실연동판 (2026-10-28 기준)

다음 작업을 시작할 때 이 문서부터 읽는다. 결정의 이유는 [`renewal/design/00_decisions.md`](renewal/design/00_decisions.md)(R0~R48), 설계는 `renewal/design/01~09`에 있다(08_visual = 시각화 설계안, 승인 대기). 이전(가정 응답) 판 인수인계는 git 이력(`c813959` 이전 HANDOFF)에 있다.

## 1. 현재 상태
| 항목 | 값 |
|---|---|
| 작업 브랜치 | `renewal-t3q` — 커밋한 뒤 같은 커밋을 `main` 에 올려 운영 배포(사용자 승인: 승인이 필요한 내용을 뺀 작업은 끝나면 커밋·푸시·배포, 2026-10-28) |
| 배포 | https://safetyai-three.vercel.app — `main` 푸시 = 운영 자동 배포. 개편 판 운영 중(`3d01f42` 부터) |
| T3Q | 개발 서버 v0.3.0 (`T3Q_BASE_URL`·`T3Q_CLIENT_TOKEN`, 토큰 2027-01-21 만료). 원본: `D:\vibecoding\safetyai\T3Q_API\클라이언트 토큰.txt` |
| 계정 | 5개 사전 발급(비밀번호 로그인). 로컬은 `.env.development.local` 의 `SA_INIT_PASSWORDS` 로 발급됨 |
| 화면 원칙 | 한국어 표기(R18) · 그래프 빨강 미사용(R19) · 브리핑 기본 4문항 = 요구사항 원문(R17) |
| 로컬 DB | **PGlite(`app/.localdb`)** — `.env.local` 의 Neon 은 운영과 같은 DB 라 개발 중 쓰지 않는다 |
| 작업 이력·다른 PC | 클로드 코드 대화 기록·클로드 메모리·이어받기 안내 = **비공개 저장소 `jazzsalle/SEFTYAI-history`**(2026-10-30 오후 기준 · 비밀값 가림). 다른 PC 에서는 그 README 순서대로: 이 저장소를 같은 경로(`D:ibecodingsafetyaiSEFTYAI`)에 받기 → 저장소에 없는 `app/.env.local`·`app/.env.development.local`·`_secrets`·`T3Q_API`·원자료는 직접 옮기기 → `gh`·`vercel` 로그인·`npm install` → 메모리 복원 → 이 문서부터 읽기. **이 공개 저장소에는 대화 원본을 올리지 않는다**(사용자 결정 2026-10-30) |

## 2. 절대 원칙 (사용자 지시 — 바꾸지 말 것)
1. **T3Q 응답 무가공** — 답 글·지도 대상(refs)·경고 문구를 요약·수정·재배치하지 않는다. 표현(마크다운 렌더·칩·접기·지도 그리기)만 한다. 경계 목록은 `01_system_design.md` §6.
2. 모의 데이터·훈련 시나리오·임의 seed·우리가 만든 공간정보(하천·소하천·행정경계 GeoJSON) **사용 금지**. 지도는 VWorld 배경·경계(WMS) + T3Q 도형만.
3. 보존: 행동매뉴얼 대응절차(SOP)·연락망·상황전파·실행이력·도움말(내용 수정은 최종 개발 후). UFR-009 미적용.
4. 연락망은 **[샘플] 표시 구성 예시**로 시작(`lib/contactsSample.ts`).
5. 커밋·배포는 승인 후. 설계 결정은 Fable 과 상의.

## 3. 구조
```
브라우저 ── /api/agent/jobs (접수·lazy 폴링·취소) ── Neon sa_agent_jobs(raw=T3Q 원문) ── T3Q /agent/query ASYNC + /agent/query/{id}
        ── /api/t3q/data · geometry · suggested · feedback · health ── T3Q Data API · EXT-01
        ── /api/auth/* (scrypt·서명 쿠키 세션 — 유휴 4시간·최대 12시간, R34) · /api/admin/* (운영자)
        ── (보존) /api/sop · contacts · dispatch · conversations · checks · kv · trace · docs(MAN:) · weather(기상청 실시간)
```
| 파일 | 역할 |
|---|---|
| `src/lib/t3q/schemas.ts` | T3Q 계약(zod) — 정본 |
| `src/lib/t3q/client.ts` · `replay.ts` | 서버 전용 호출(새 X-Request-Id) · 재생(개발 전용, 운영 차단) |
| `src/lib/server/jobs.ts` | 작업: 캐시 24h·진행 중 합류·동시성(계정 4/전체 8)·LOST 재제출·15분 상한·도형 선조회·추적로그 |
| `src/lib/server/preview.ts` · `src/lib/library.ts` | 정의된 질문 ↔ Data API 자동 조회(R3) · 부산·인제·영천 질문 라이브러리 |
| `src/lib/server/queryContext.ts` · `src/lib/t3q/region.ts` | 화면 조건 → T3Q query_context(입력한 값만, R33 임시 규칙 포함) · 지역 코드 |
| `src/lib/baseRegion.ts` · `src/lib/wxMatch.ts` · `src/components/BasePicker.tsx` | 기준지역(R32) 기본값·보낼 값·검사 · 기상특보 구역 ↔ 기준지역(화면·서버 공용) · 머리줄 고르기(확인 창·진행 중 막힘) |
| `src/lib/server/auth.ts` · `src/middleware.ts` | 로그인·세션·잠금 · 화면 보호 |
| `src/lib/server/dbLocal.ts` | `DATABASE_URL=pglite:` 로컬 DB 어댑터(neon 꼴) |
| `src/lib/session.tsx` | 세션·특보(60초)·T3Q 상태(30초)·질문 큐 폴링(3초→6초)·원응답 캐시 |
| `src/app/(main)/explore/page.tsx` | 통합 탐색: 시작 화면·대화·브리핑 묶음(병렬)·이어서 묻기·지도 연결 |
| `src/components/answer/*` | `Markdown`(무가공 렌더) · `AnswerCard` · `DataCard`(자동 조회 데이터) |
| `src/components/queue/QueuePanel.tsx` | 좌측 질문 목록(진행·완료순) |
| `src/components/explore/*` | `Composer`(조건 모달) · `StartScreen` · `LibraryDrawer` · `RightPanel` · `DetailPane` · `AiModeModal` |
| `src/components/map/*` | VWorld 배경·행정경계 WMS · T3Q 도형 · 범례 · 근사 위치 표시 |
| `src/components/AppShell.tsx` | 한 줄 헤더 · 특보 바 · 대응 단계 바 · 계정 모달 |
| `src/app/(main)/admin` · `src/app/api/admin/*` | 질의 현황(원응답 JSON)·브리핑 예열·계정 잠금 해제·평가·추적로그 |

## 4. 점검 (수정 후 반드시)
```bash
cd app
npx tsc --noEmit && npx eslint src harness --max-warnings=0
npm test                                                       # 계약·무가공·작업 엔진·로그인/세션·한국어 표기(PGlite·재생, 실서버 안 부름)
npm run dev -- -p 3100                                         # 로컬(PGlite)
npm run harness:smoke -- http://localhost:3100 bs_safety01 BS-03
npm run harness:shots -- http://localhost:3100                 # harness/reports/shots/*.png
npm run harness:forcepw -- http://localhost:3100               # 초기 비밀번호 변경 강제(로컬 전용, 끝나면 원상 복구)
npm run harness:cq -- --conc 3                                 # 역량질문 70문(실서버, 약 50분) → harness/reports/cq_*.md
node harness/cq/run.mjs --set regional --conc 3                # 부산·인제·영천 51문
```

### 4-1. 실서버 시험 결과 (2026-10-28)
| 시험 | 결과 |
|---|---|
| 역량질문 변형 70문 | 응답 70/70 · 정답 값 전부 포함 40 · 일부 22 · 미포함 1 · 서술형 7 · 중앙값 128초(최대 279초) — `app/harness/reports/cq_*.md` |
| 부산·인제·영천 지역 질문 51문 | 응답 51/51 · 지도 대상 있는 답 34 · 중앙값 127초(최대 227초) — 시연 후보 `docs/renewal/design/09_demo_questions.md` |
| 브리핑 4문항 병렬(화면) | 첫 답 약 2분, 4건 모두 174초 · AI 모드·운영관리 화면 정상 — `app/harness/reports/shots/` |
| 자동 시험(`npm test`) | 814개 통과(19묶음 — 2026-10-30 R46 표기 `harness/explore/scenarioWx` · R47 기준지역 변경·AI 모드 `harness/explore/baseLock`·`harness/jobs` 추가, 2026-10-29 R44 기준지역 잠금 `harness/explore/baseLock.test.tsx` · R45 실시간 특보 끊음 `harness/region/scenario`·`scenarioRoute`·`demoWarmKey`·`harness/explore/scenarioWx`·`harness/jobs`(D5) 추가, 2026-10-29 AI 모드 정리·특보 줄·사건 근거 R39~R41 `harness/explore/queueWx.test.tsx` 등 추가, 2026-10-28 전국 기준지역 R32·R33 `harness/region`, 브리핑 예열 = 화면 브리핑 재사용 열쇠 `harness/region/warmKey.test.ts` 추가, 숫자 표기 포함) — 계약·무가공(녹화 답 전부 글자 일치, 한글 옆 굵게·`<br>` 포함)·작업 엔진 SQL·로그인/세션 SQL·정보 부족 이름·표시 형식·자료 조회 캐시·유사사례 카드·사건 상세·답변 카드·브리핑 현황판 |
| 시각 설계 적용(R25 범위) | 2026-10-28 적용 — 에이전트 11개(기반·화면 4·통합·검토 3·고침), 검토 결함 18건 모두 고침. 적용 전후 화면 `app/harness/reports/shots/visual/{before,after}_*.png` |
| 초기 비밀번호 변경 강제(화면) | 7/7 — 닫을 수 없는 창, 바꾸기 전 질의·연락망·T3Q 조회 403 |
| 독립 검토(R23) | 확인 결함 37건 모두 수정 · 다시 점검(형식·린트 경고 0·시험) 통과 |

## 5. 배포·운영 메모
0. 진행 상태(2026-10-28): 1번 비밀값은 사용자가 Vercel 화면에서 등록함. 2번 계정 발급은 사용자가 운영 화면 브라우저 콘솔(`_secrets/seed_console.js`)로 하기로 함 — **발급 확인 대기**, 발급 뒤 `SEED_SECRET` 은 Vercel 에서 지우기 권장. 3·4번은 끝남(옛 판 내려감, 배포 뒤 `sa_conv_accounts` 삭제함).
1. Vercel 운영 환경변수(사용자가 실행 — 비밀값): `node scripts/deploy_setup.mjs` → `T3Q_BASE_URL`·`T3Q_CLIENT_TOKEN`(.env.local 값)·`SESSION_SECRET`·`SEED_SECRET`(새로 만듦) 등록 + 계정 5개 초기 비밀번호를 저장소 밖 `D:\vibecoding\safetyai\_secrets\seed.env` 에 저장. 크론은 쓰지 않는다(방치 작업은 질문 목록·운영 화면 조회 때 정리 — `CRON_SECRET` 불필요).
2. 배포 후 계정 발급(사용자가 실행): `node --env-file=D:/vibecoding/safetyai/_secrets/seed.env scripts/seed_accounts.mjs` — 첫 로그인 때 비밀번호 변경이 강제된다(R24).
3. 운영 DB 연락망은 2026-10-28 [샘플] 구성 예시로 **일괄 교체 완료**(R21, 백업 `D:\vibecoding\safetyai\_backups\`). 단, 배포 전까지 지금 떠 있는 이전 판 화면의 [예시 연락망으로 되돌리기]를 누르면 옛 가상 인명으로 돌아가므로 배포를 서두르거나 그 버튼을 쓰지 않게 안내.
4. 운영 DB는 2026-10-28 **초기화**(R26 — 대화 이력 29·상황전파 이력 1·대응절차 실행이력 2·추적로그 19·감사 기록 7 삭제, 백업 없음, [샘플] 연락망만 남김). `db.ts` 의 `sa_conv_accounts` 만들기 문은 제거함 — 배포 직후 운영 DB 에서 `drop table sa_conv_accounts`(옛 판의 시연 대화 채움 표시 3행 — 배포 전에 지우면 떠 있는 옛 판이 시연 대화를 다시 채움), 그 사이 옛 판이 새로 채운 이전 형식 대화가 있으면 다시 지움. 새 열 `sa_agent_jobs.wx_seen`(답 완료 때의 발효 특보 — 「답변을 받은 뒤 특보 발표」 판단)은 첫 DB 사용 때 자동 추가.
5. 배포 대상은 **기존과 같다** — GitHub `jazzsalle/SEFTYAI`, Vercel `safetyai-three.vercel.app`(사용자 확인 2026-10-28). **`main` 에 푸시하면 운영에 자동 배포**되고 다른 브랜치는 미리보기로 배포된다 — 비밀값(1번)을 먼저 등록한 뒤 푸시할 것(2026-10-28 비밀값 없이 자동 배포가 걸려 취소한 일이 있음). 커밋 작성자 이메일은 `183509977+jazzsalle@users.noreply.github.com`(아니면 배포가 막힘). 브이월드 키가 이 주소로 등록돼 있어 추가 등록 불필요(`VWORLD_DOMAIN` 기본값 = 이 주소, 기준지역 목록 `/api/regions` 가 서버에서 이 주소로 조회).
6. 배포본 스모크: `npm run harness:smoke -- https://…`.

## 6. 남은 일
- [ ] 도움말 내용 갱신(최종 개발 후 — 지시 9). `lib/help.ts` 에 삭제된 "응답 검증" 항목 남아 있음. aim·wxref 항목의 「모든 질문에 자동 반영」은 R46 으로 고침
- [ ] T3Q 요청 목록 전달(`renewal/design/06_t3q_requests.md`) — 특히 멀티턴·작업 영구화·지역 질문 정답 계산
- [ ] 2차(편의성): 자유 질문 규칙 분류 선표출(정밀도 확인 후 승인), 크론 예열, 표 정렬(승인 사항), 브라우저 알림, 세션 연장 안내
- [x] 시각화(R20·R25) — 설계안 2판을 사용자 결정(R25 범위, `08_visual/design_spec.md` 맨 앞 「적용 범위」)대로 2026-10-28 적용. 한글 옆 굵게(G5)·`<br>` 줄바꿈 포함
- [x] **전국 기준지역**(R32, 2026-10-28) — 지자체·중앙 모두 머리줄에서 전국 → 시·도 → 시·군·구 → 읍·면·동을 고른다(목록 = 브이월드 `/api/regions`, 데이터 조회 제한 없음, 기본값 지자체 = 자기 지역·그 밖 = 전국). 특보 줄·AI 모드는 기준지역을 따르고 바뀌면 그 지역으로 다시 시작(구역 맞추기 `lib/wxMatch.ts` — 화면·재사용 기준 D5 공용), 대응절차는 계정 관할 그대로. 기준지역을 바꾸면 새 대화(대화가 열려 있으면 「기준지역 변경」 확인 창), 질의·응답 진행 중에는 못 바꿈. `public/data/regions.json`·`emd_index.json` 삭제. 시험 `harness/region`, 화면 `node harness/e2e/shots_region.mjs` → `harness/reports/shots/region_*.png`
- [ ] **R33 임시 규칙 지우기**(사용자가 끝내기로 정할 때) — 전국 기본 계정(중앙정부·운영자)이 전국으로 「우리 지역…」을 물으면 `query_context.region` = 서울특별시(질문 글은 그대로). 지울 곳: `src/lib/server/queryContext.ts` 의 `R33_SEOUL`·`R33_OUR_REGION`·`r33Seoul`·`buildQueryContext` 「R33 임시」 줄, `harness/region/region.test.ts` 의 「R33 임시」 묶음과 라우트 시험의 서울 기대값, `00_decisions.md` R33
- [ ] **전환용 `legacyAdvIds` 지우기**(괄호 안 괄호를 쪼개던 예전 `kma.ts` 판으로 받은 답이 운영 DB 에 남지 않게 되면) — 그 판의 `wx_seen` 조각 id 를 「답을 받은 뒤 특보」에서 같은 특보로 알아보는 코드. 지울 곳: `src/lib/wxMatch.ts` `legacyAdvIds`, `src/components/answer/AnswerCard.tsx` `advisoriesAfter` 의 「전환용(임시)」 두 줄, `harness/render/answerCard.test.tsx` 「전환용」 시험
- [x] AI 모드 접힘 줄의 「특보 n건」 → 특보 이름(R25·R28), 시작 화면·AI 모드의 브리핑 설명 줄 삭제
- [x] 입력창 [브리핑 세트▾] 2단 패널(내 브리핑 질문 전체)·입력창 파란 테두리·AI 모드 접힘 띠를 내용 맨 위로·로그인 기관 표기 행정안전부(R35), 세션 유휴 4시간(R34)
- [x] **AI 모드 정리**(R39, 2026-10-29 승인) — 질문 목록에서 AI 모드 점검 빼기, 같은 계정이 같은 10분 구간에 다시 보낸 점검(새로 고침·새 탭·껐다 켬)은 사본 행 없이 원래 점검 작업 그대로(다른 계정 원래 답이면 사본), 점검 `query_context` = 기준지역만(입력창 가정 조건 버림). 화면 `node harness/e2e/shots_aimode_r25.mjs` → `harness/reports/shots/r39_*.png`
- [x] **R25 정리 2건**(R40, 2026-10-29 승인) — AI 모드 창 「AI 안내」 빨간 글씨 → 남색, 특보 줄 「외 n건」 → 나머지 특보 이름 그대로(받은 순서, · 로, 한 줄 말줄임) + [모두 보기] 전체 목록(받은 순서, 바깥 누르기·Esc 로 닫힘, 900px 이하는 특보 줄 폭 안에)
- [x] **사건 상세에 근거(재해연보 쪽)**(R41, 2026-10-29 승인) — T3Q-19 받은 값 그대로(문서 제목·쪽·장 경로, 데이터 기준 시각), 받지 못함·없음은 회색 한 줄, 받은 항목이 제공처 전체 건수보다 적을 때만 ⚠ 부분 목록
- [x] **시연 묶음·프리셋·예열**(R42, 2026-10-29 승인) — 질문 모음 「재난담당자의 하루」 탭(한 번 누르기), 질문별 조건 프리셋(그 질문에만 — 세션 조건 그대로), 운영관리 「시연 세트 예열」(실시간 3항목 제외 · 부산 브리핑 세트 포함 · 화면과 같은 열쇠). 시험 `harness/region/demoWarmKey.test.ts`
- [x] **시연 시나리오 특보**(R43, 2026-10-29 승인 — R6 의 시연용 예외) — 운영관리 「시연 세트 예열」 탭에서 켜고 끔(끝나는 시각 기본 4시간 뒤·최대 48시간, 지나면 저절로 꺼짐). 시연 계정 셋에만 `/api/weather` 가 붙임, 특보가 보이는 곳마다 「시연 시나리오」, T3Q 출처 「시연 시나리오(가상 특보)」·특보 번호 `SCN-*` 고정, D5 는 기상청 실시간만. 화면 `node harness/e2e/shots_demo_set.mjs` → `harness/reports/shots/r42_*.png`
- [ ] **시연 뒤 시나리오 끄기 확인**(11/5 시연·리허설마다) — 운영관리 「시연 세트 예열」 탭 「시연 시나리오 특보」가 「꺼짐」인지, 세 시연 계정 특보 줄에 「시연 시나리오」가 없는지(끝나는 시각이 지나면 저절로 꺼지지만 끝나는 시각을 길게 잡았으면 직접 끈다)
- [ ] **부산 시연 계정 브리핑 4번 넣기**(예열 전 한 번) — `bs_safety01` 로 설정 → 내 브리핑 항목 → 「+ 항목 추가」, 항목 이름 「하천 옆 지하차도」, 질의문 = 대본 단계 2 의 4번 글(녹화 `demo_v3/BRF-BS-4` 질문 글자 그대로), BR-04(행동매뉴얼) 체크 해제. 질문 모음 문항으로는 등록하지 않는다(대본 §8 #6 사용자 결정 전)
- [ ] **승인 대기** — AI 모드 창 맨 아래 설명 줄 「누르면 이 창을 접고, 발효 중인 특보 기준으로 새 대화에서 질의합니다.」 지우기(R25 — 「AI 안내」 빨간 글씨는 R40 으로 끝남)
- [x] **경보 빨간 표시는 그대로 둔다**(사용자 2026-10-30 「경보 빨간표시는 좋은데?」) — 특보 줄 「긴급」 표시(`--c-dang`)·경보일 때 분홍 바탕(`.wxbar.danger`), [특보로 질문] 고르기의 단계 색, AI 모드 창 경보 카드 분홍 바탕(`aim-card danger`)·「새 특보」 빨간 표시
- [ ] **승인 대기**(R25 — 남은 센 값) — AI 모드 창 특보 넘기기 「1 / n」(유엔이가 센 개수)
- [x] **기준지역 잠금에서 AI 모드 점검 빼기**(R44, 2026-10-29 사용자 결정 「그래」 — R39 에서 남긴 것) — 대화 질의가 진행 중일 때만 잠근다(`lib/jobTypes` `locksBase`). AI 모드 창은 접수 중 기준지역이 바뀌면 이전 지역 점검을 버리고(진행 중이면 취소) 새 지역으로 START — 잇달아 고르면 1.5초 뒤 마지막 지역만. 시험 `harness/explore/baseLock.test.tsx`
- [x] **시연 시나리오를 켠 동안 시연 계정은 기상청 실시간 특보 끊음**(R45, 2026-10-29 사용자 지시) — 켠 지역의 시연 계정은 `/api/weather` 가 기상청을 부르지 않고 시나리오 특보만(예비특보 없음 · `realtimeCut`), 특보 줄 「HH:MM 켬 · 기상청 실시간 특보 끊음」, 구역 밖 기준지역은 「실시간 끊음」 · 「기상청 실시간 특보 끊음」(「특보 없음」이라 하지 않음). D5 1시간 단축은 그 계정 질의에 없음(24시간). 운영자·행안부·켜지 않은 지역은 실시간 그대로. 그래서 **시나리오를 켠 시연 계정에는 당일 기상청 실시간 특보 상태를 맞추거나 실제 특보가 나면 1시간 안에 다시 예열할 필요가 없다**(예열한 브리핑·묶음 답은 24시간). 화면 `node harness/e2e/shots_r45.mjs` → `harness/reports/shots/r45_*.png`(실제 T3Q AI 모드 점검 2건)
- [x] **시연 따라하기 슬라이드**(2026-10-30 사용자 요청 「시연 시나리오를 내가 따라할 수 있게 ppt 슬라이드로 만들어줘」) — `renewal/design/11_demo_day_slides.pptx`(진행자용 68장: 준비·운영 순서 → 단계마다 ① 누르기 · ② 짚기·말하기 → 마무리·막힐 때·한계 말하는 법·정리. 화면 사진 = 로컬 리허설 2026-10-30 저녁 — 검사 38 통과, 누를 곳 주황 테두리). 글은 대본 v3.3.2 에서 뽑아 대본·앱 화면 글자와 대조(질문 글·붙는 조건 = DEMO_DAY 글자 그대로). 다시 만드는 법 `renewal/design/11_demo_day_slides/README.md`
- [x] **기준지역을 시·도까지만 골라도 인제·영천 질문 · 질문 글에서 CCTV 뺌**(R48, 2026-10-30 사용자 지시) — 질문 모음·시작 화면 = `lib/baseRegion` `baseQuestionPilot`(강원특별자치도 = 인제 · 경상북도 = 영천, 지도 첫 화면·대화 이력은 그대로), 보낼 때 기준지역은 화면 값 그대로(예열 답은 인제군·영천시 열쇠 — 시연은 계정 기본값 그대로). 부산 단계 5(DD-BS-02) 글에서 「·CCTV」 뺌 — 새 글 실측 39.2초(`demo_v3/BS-02-v4`), 대본 v3.3.2
- [x] **AI 모드 사용자별 독립 · 기준지역을 바꾸면 AI 모드 종료 · 확인 창 하나로**(R47, 2026-10-30 사용자 지시·세부 결정) — 점검 재사용은 같은 계정 것만(`lib/server/jobs.ts`), 켜짐은 계정별 저장(`sa.aim.<계정>`), 기준지역을 바꿀 때마다 「기준지역 변경」 확인 창(AI 모드를 켜 두었으면 「1. … AI 모드가 종료됩니다 … 2. 새 대화로 시작합니다 …」, 아니면 한 줄) → AI 모드 끔·진행 중 점검 취소(`lib/session` setBase·submit) → 통합 탐색 새 대화. 새 지역 자동 재점검(R44 의 1.5초)은 없앰, 대화 질의·예열 작업만 잠금(R44 그대로). 쓰지 않게 된 convOpen 제거. 시험 `harness/explore/baseLock.test.tsx`(R47 6개)·`harness/jobs`, 화면 `node harness/e2e/shots_r45.mjs`(R47 확인 창·취소·다시 켬 — 실제 T3Q 점검 2건) → `harness/reports/shots/r45_04_r47_base_dialog.png` 등. 대본은 v3.3 에서 단계 10·운영 규칙을 맞춤
- [x] **로컬 리허설**(2026-10-30) — `node harness/e2e/rehearsal.mjs`(로컬 주소에서만 — 대본 운영 순서 ①~⑤ · 무대 단계 1~19 · ⑦ 정리, 실시간 세 질문을 보냄) → 검사 37개 통과 · 예열 18건 5분 31초 · 예열 14문·브리핑 4항목 모두 「이전 답변 재사용」 1.4초 안(화면 열쇠 = 예열 열쇠를 실제 화면 경로로 확인) · 실시간 처리 BS-02 36.1 · IJ-05-R 85.5 · YC-02 106.1초(대본 §2 보다 IJ-05-R·YC-02 각 +30초). 답 `harness/recordings/rehearsal_2026-10-30T01-55-41/`, 결과 `renewal/analysis/demo_day/rehearsal_local_20261030.md`
- [x] **(하지 않음 — 사용자 2026-10-30: 리허설에는 클로드 코드가 붙지 않고 시연은 웹사이트에서 화면을 그대로 읽는다 · 대본 §8 #20)** ~~11/4 리허설 — 예열 답으로 대본 인용 다시 맞추기~~ — 진행자는 예열 뒤 시연 계정 화면 왼쪽 질문 목록에서 예열한 질문을 눌러(보내지 않고 열림) 미리 읽어 본다. 도구는 개발용으로만 남김. 예전 계획: — 운영 예열(§7.1 ③) 뒤 `node harness/demo/dump_jobs.mjs`(운영 DB 읽기만 · 시연 계정 셋의 원래 답) → 사람이 읽고 대본 §4 인용 고침 → `node harness/demo/check_story_quotes.mjs --rec <받은 폴더>`. 로컬 리허설에서 인용 137개 중 22개만 글자까지 같았다(흐름·원천 값은 같고, 에이전트가 센 수·순위·표 모양·지도 대상 수·정비 서술 자리가 실행마다 바뀜)
- [x] **「AI 모드 · 특보 자동 반영」 표기를 동작에 맞춤**(R46, 2026-10-30 사용자 결정) — 단추 「AI 모드 · 브리핑에 특보 반영」·말풍선·도움말(aim·wxref) 고침, 동작·예열·대본 그대로. 발견 때 기록: AI 모드를 켜면 특보 줄 단추(`AppShell.tsx`)·말풍선·도움말(`help.ts` aim·wxref)이 「특보가 (모든) 질문에 자동으로 반영」이라 하지만 실제로 특보가 붙는 것은 브리핑·AI 모드 점검뿐(직접 쓴 질문·질문 모음·시연 묶음은 안 붙음 — `explore/page.tsx` askText·askLib·askDemo). 표기를 동작에 맞출지, 동작을 표기에 맞출지(시연 묶음 예열 열쇠·대본 §8 #2 「사슬 질문은 특보 없이」와 걸림)
- [x] **대본 v3.3·v3.3.1**(2026-10-30 사용자 결정 「지금 고침」 — Fable 초안 · 독립 검토 지적 반영 · R46·R47 반영, 인용 204/204 · 리허설 답 기준 87 일치) — 대본 멘트를 실행마다 흔들리는 사실에 기대지 않게(v3.3 — 원천 값만 숫자로, 셈·순위·「가장 큰」·지도 대상 수·처리 시간은 화면 짚기, 「주의」를 규칙으로, 실시간 장면 시간을 범위로) — 지금 할지, 11/4 예열 답을 받은 뒤 인용과 함께 할지
- [x] **(R47 로 해소 — 기준지역을 바꾸면 AI 모드가 꺼져 구역 밖 자동 점검이 나가지 않음, 다시 켤 때만 해당)** ~~확인 필요~~(R45) — 끊긴 계정이 기준지역을 시나리오 구역 밖(예: 서울특별시)으로 바꾸면 AI 모드 점검 질의는 빈 특보 목록(source 「시연 시나리오(가상 특보)」)으로 가고, T3Q 답이 「현재 서울특별시 지역에 발효 중인 기상특보가 없어 …」처럼 실제 특보가 없다고 읽힐 수 있다(답은 무가공 — 창 위 회색 「기상청 실시간 특보 끊음」만 붙음, 2026-10-29 실측). 시연 대본에서 시연 계정 기준지역을 구역 밖으로 바꾸지 않는지 · 점검 질의에 다른 것을 보낼지는 사용자 결정. 선택지: ① 제품은 그대로, 대본에서 시연 계정 기준지역을 구역 밖으로 바꾸지 않음(대본 단계 10 「동구」는 구역 안) ② 끊긴 계정에 덮는 시나리오 특보가 없으면 AI 모드 점검을 보내지 않고 AI 안내 자리에 회색 한 줄(예: 「시연 시나리오 구역 밖이라 점검하지 않습니다」 — AI 모드 동작 변경이라 승인 뒤에만, 점검 질의 글 R36 은 그대로) ③ 지금처럼 보냄. 그런 답에는 답 카드·대화 보고서·브리핑 현황판 머리에 회색 「시연 시나리오 특보와 함께 보낸 질문」이 붙는다(2026-10-29 검토 반영 — 출처로 판별). 특보 항목 없이 보낸 질문에 이 글이 맞는지(예: 「기상청 실시간 특보를 끊고 보낸 질문」으로 나눌지)도 사용자 결정
- [x] **(R47 로 해소 — 다른 계정의 점검을 가져오지 않음)** ~~사용자 결정 필요~~(R39 남은 것) — 같은 10분 구간의 원래 점검 답이 다른 계정 것이면, 그 계정이 새로 고침·새 탭을 할 때마다 사본 행이 또 생김(지시대로 사본 유지). 같은 계정의 기존 사본(`cached_from` = 그 원래 답)을 찾아 돌려줄지
- [ ] **사용자 결정 필요**(R40) — 전국 특보 줄의 나머지 이름이 종류·단계만이라 「강풍주의보 · 강풍주의보 · …」로 겹쳐 보임(기상청 원문 한 줄을 구역마다 나눈 것은 유엔이 읽기). 받은 칸으로 「{구역} {종류}{단계}」(예 「서해5도 강풍주의보」)로 이을지, 지금처럼 둘지
- [ ] **사용자 결정 필요**(R41) — 근거 「원본 항목 전체 보기」에 T3Q 코드 값 `TITLE_ONLY`·`AGGREGATE_ONLY`·`SUMMARY`(인용 종류·원문 제공 여부)가 영어로 보임(원본 보기는 값을 받은 그대로 — 다른 섹션과 같은 규칙). `labels.ts` `VALUE_KO` 에 한국어 이름을 더해 코드 칸만 사전으로 보일지. 피해대장 집계 항목의 제공처 주의 `coverage_note` 를 그 줄 아래 회색 주의로 보일지
- [ ] **사용자 결정 필요** — 대응절차 단계 추천(`lib/sop.ts` `recommendStep`)은 `kma.ts` 지역 이름표(/영천/ 등)를 써서 「경상북도(…제외)」·경상북도 전체 특보가 영천 대응절차에 반영되지 않음(특보 줄은 반영). 울릉군은 기상청 「울릉도.독도」 구역만 덮도록 한 규칙(검토 단계에서 추가)도 확인 필요
- [ ] T3Q 요청 #27(침수흔적 원래 폴리곤 + 대표점 — 지금은 범위 사각형뿐) · #28(재사용을 계정·역할 무관으로 해도 되는지) · **#30(침수 사건 FE-8 이름 「우20년07월 장마철 집중호」 글자 밀림 — 시연 BS-04·BS-07 표에 보임, 11/5 전)** · **#31(답 글 합계를 모델이 더함 — IJ-04 누적 복구액이 소계 합과 4,000원 다름)** — `renewal/design/06_t3q_requests.md`. #11 스트리밍은 2026-10-30 다시 확인해도 개발 서버 v0.3.0 그대로(경로 31개 · 스트리밍 없음)
- [ ] 정합성 검증 방안 — 브레인스토밍 결과 `renewal/design/10_verification_brainstorm.md`(T3Q 직접 검증 + 유엔이 확인 혼합안 포함 예정)
- [x] 숫자 표기 천 단위 쉼표로 통일(R30 — 번호·코드·연도 제외)
- [ ] 운영 데이터 보존 정리(작업 원문 180일) 작업
