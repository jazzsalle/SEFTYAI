# 인수인계 — 재난안전 AI 시범서비스 · T3Q 실연동판 (2026-10-28 기준)

다음 작업을 시작할 때 이 문서부터 읽는다. 결정의 이유는 [`renewal/design/00_decisions.md`](renewal/design/00_decisions.md)(R0~R35), 설계는 `renewal/design/01~09`에 있다(08_visual = 시각화 설계안, 승인 대기). 이전(가정 응답) 판 인수인계는 git 이력(`c813959` 이전 HANDOFF)에 있다.

## 1. 현재 상태
| 항목 | 값 |
|---|---|
| 작업 브랜치 | `renewal-t3q` — 커밋한 뒤 같은 커밋을 `main` 에 올려 운영 배포(사용자 승인: 승인이 필요한 내용을 뺀 작업은 끝나면 커밋·푸시·배포, 2026-10-28) |
| 배포 | https://safetyai-three.vercel.app — `main` 푸시 = 운영 자동 배포. 개편 판 운영 중(`3d01f42` 부터) |
| T3Q | 개발 서버 v0.3.0 (`T3Q_BASE_URL`·`T3Q_CLIENT_TOKEN`, 토큰 2027-01-21 만료). 원본: `D:\vibecoding\safetyai\T3Q_API\클라이언트 토큰.txt` |
| 계정 | 5개 사전 발급(비밀번호 로그인). 로컬은 `.env.development.local` 의 `SA_INIT_PASSWORDS` 로 발급됨 |
| 화면 원칙 | 한국어 표기(R18) · 그래프 빨강 미사용(R19) · 브리핑 기본 4문항 = 요구사항 원문(R17) |
| 로컬 DB | **PGlite(`app/.localdb`)** — `.env.local` 의 Neon 은 운영과 같은 DB 라 개발 중 쓰지 않는다 |

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
| 자동 시험(`npm test`) | 728개 통과(13묶음 — 2026-10-28 전국 기준지역 R32·R33 `harness/region`, 브리핑 예열 = 화면 브리핑 재사용 열쇠 `harness/region/warmKey.test.ts` 추가, 숫자 표기 포함) — 계약·무가공(녹화 답 전부 글자 일치, 한글 옆 굵게·`<br>` 포함)·작업 엔진 SQL·로그인/세션 SQL·정보 부족 이름·표시 형식·자료 조회 캐시·유사사례 카드·사건 상세·답변 카드·브리핑 현황판 |
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
- [ ] 도움말 내용 갱신(최종 개발 후 — 지시 9). `lib/help.ts` 에 삭제된 "응답 검증" 항목 남아 있음
- [ ] T3Q 요청 목록 전달(`renewal/design/06_t3q_requests.md`) — 특히 멀티턴·작업 영구화·지역 질문 정답 계산
- [ ] 2차(편의성): 자유 질문 규칙 분류 선표출(정밀도 확인 후 승인), 크론 예열, 표 정렬(승인 사항), 브라우저 알림, 세션 연장 안내
- [x] 시각화(R20·R25) — 설계안 2판을 사용자 결정(R25 범위, `08_visual/design_spec.md` 맨 앞 「적용 범위」)대로 2026-10-28 적용. 한글 옆 굵게(G5)·`<br>` 줄바꿈 포함
- [x] **전국 기준지역**(R32, 2026-10-28) — 지자체·중앙 모두 머리줄에서 전국 → 시·도 → 시·군·구 → 읍·면·동을 고른다(목록 = 브이월드 `/api/regions`, 데이터 조회 제한 없음, 기본값 지자체 = 자기 지역·그 밖 = 전국). 특보 줄·AI 모드는 기준지역을 따르고 바뀌면 그 지역으로 다시 시작(구역 맞추기 `lib/wxMatch.ts` — 화면·재사용 기준 D5 공용), 대응절차는 계정 관할 그대로. 기준지역을 바꾸면 새 대화(대화가 열려 있으면 「기준지역 변경」 확인 창), 질의·응답 진행 중에는 못 바꿈. `public/data/regions.json`·`emd_index.json` 삭제. 시험 `harness/region`, 화면 `node harness/e2e/shots_region.mjs` → `harness/reports/shots/region_*.png`
- [ ] **R33 임시 규칙 지우기**(사용자가 끝내기로 정할 때) — 전국 기본 계정(중앙정부·운영자)이 전국으로 「우리 지역…」을 물으면 `query_context.region` = 서울특별시(질문 글은 그대로). 지울 곳: `src/lib/server/queryContext.ts` 의 `R33_SEOUL`·`R33_OUR_REGION`·`r33Seoul`·`buildQueryContext` 「R33 임시」 줄, `harness/region/region.test.ts` 의 「R33 임시」 묶음과 라우트 시험의 서울 기대값, `00_decisions.md` R33
- [ ] **전환용 `legacyAdvIds` 지우기**(괄호 안 괄호를 쪼개던 예전 `kma.ts` 판으로 받은 답이 운영 DB 에 남지 않게 되면) — 그 판의 `wx_seen` 조각 id 를 「답을 받은 뒤 특보」에서 같은 특보로 알아보는 코드. 지울 곳: `src/lib/wxMatch.ts` `legacyAdvIds`, `src/components/answer/AnswerCard.tsx` `advisoriesAfter` 의 「전환용(임시)」 두 줄, `harness/render/answerCard.test.tsx` 「전환용」 시험
- [x] AI 모드 접힘 줄의 「특보 n건」 → 특보 이름(R25·R28), 시작 화면·AI 모드의 브리핑 설명 줄 삭제
- [x] 입력창 [브리핑 세트▾] 2단 패널(내 브리핑 질문 전체)·입력창 파란 테두리·AI 모드 접힘 띠를 내용 맨 위로·로그인 기관 표기 행정안전부(R35), 세션 유휴 4시간(R34)
- [ ] **승인 대기** — 질문 목록에서 AI 모드 점검 빼기 + 화면을 새로 열 때 10분 안에 받은 점검 답이 있으면 새로 보내지도 재사용 사본을 만들지도 않기(지금은 켤 때·새로 고침·새 탭마다 START 점검 → 같은 10분 구간이면 「이전 답변」 사본 행이 쌓임)
- [ ] **승인 대기** — AI 모드 창 R25 정리: 맨 아래 설명 줄 「누르면 이 창을 접고, …」, 「AI 안내」 빨간 글씨
- [ ] **사용자 결정 필요** — 대응절차 단계 추천(`lib/sop.ts` `recommendStep`)은 `kma.ts` 지역 이름표(/영천/ 등)를 써서 「경상북도(…제외)」·경상북도 전체 특보가 영천 대응절차에 반영되지 않음(특보 줄은 반영). 울릉군은 기상청 「울릉도.독도」 구역만 덮도록 한 규칙(검토 단계에서 추가)도 확인 필요
- [ ] T3Q 요청 #27(침수흔적 원래 폴리곤 + 대표점 — 지금은 범위 사각형뿐) · #28(재사용을 계정·역할 무관으로 해도 되는지) — `renewal/design/06_t3q_requests.md`
- [ ] 정합성 검증 방안 — 브레인스토밍 결과 `renewal/design/10_verification_brainstorm.md`(T3Q 직접 검증 + 유엔이 확인 혼합안 포함 예정)
- [x] 숫자 표기 천 단위 쉼표로 통일(R30 — 번호·코드·연도 제외)
- [ ] 운영 데이터 보존 정리(작업 원문 180일) 작업
