# 재난안전 AI 데이터 활용 서비스 — 시범서비스 (유엔이)

> **이어서 작업할 때는 [`docs/HANDOFF.md`](docs/HANDOFF.md)부터 읽는다** — 현재 상태·동작 원칙·점검(하네스)·남은 일.
> 배포: https://safetyai-three.vercel.app (비공개 저장소, `main` 푸시 시 자동 배포 — **커밋·배포는 승인 후**)

행정안전부 · 부산광역시 · 영천시 · 인제군 풍수해 의사결정 지원 시범서비스.
**T3Q 시범서비스 API(v0.3) 실연동판** — 에이전트(T3Q Agent) 답을 **가공 없이 그대로** 보여 주고 검증하는 것이 유엔이의 임무다.

## 폴더
| 경로 | 내용 |
|---|---|
| `app/` | Next.js 15 서비스 (배포 루트) |
| `app/src/lib/t3q/` | T3Q 계약(zod)·호출 클라이언트·지역 코드 변환·재생(개발 전용) |
| `app/src/lib/server/jobs.ts` | 비동기 질의 작업(Neon `sa_agent_jobs`) — 접수·폴링·캐시·동시성 |
| `app/src/lib/library.ts` | 부산·인제·영천 질문 라이브러리(역량질문 템플릿 기반) + 자동 조회 데이터 매핑 |
| `app/harness/` | 하네스: 계약·무가공 테스트, T3Q 실측 프로브, 역량질문 배치, 스모크, 화면 캡처, 녹화본 |
| `app/data/seed/` | 행동매뉴얼 대응절차 추출본만(보존 기능) — 임의 seed 는 삭제 |
| `docs/renewal/design/` | **개편 설계** 00 결정 · 01 시스템 · 02 DB · 03 업무흐름·시나리오 · 04 화면 · 05 하네스 · 06 T3Q 요청 |
| `docs/renewal/analysis/` | Figma·요구사항(v1.72·v1.74)·T3Q 계약·실측 분석 |
| `docs/design/`, `docs/analysis/` | 이전(가정 응답) 판 설계·분석 — 참고용 |

## 실행
```bash
cd app
npm install
# .env.local: T3Q_BASE_URL, T3Q_CLIENT_TOKEN, NEXT_PUBLIC_VWORLD_KEY, KMA_SERVICE_KEY (+ Vercel 의 DATABASE_URL)
# .env.development.local: DATABASE_URL=pglite:.localdb (운영 DB 와 분리), SESSION_SECRET, SEED_SECRET, SA_INIT_PASSWORDS
npm run dev -- -p 3100
node scripts/seed_accounts.mjs          # 계정 사전 발급 (SEED_URL·SEED_SECRET·SA_INIT_PASSWORDS)
```

## 점검 (하네스 — `docs/renewal/design/05_harness.md`)
```bash
npm test                     # 아래 다섯 전부(실서버 안 부름)
npm run harness:contract     # T3Q 녹화본 계약 검증
npm run harness:verbatim     # 답변 무가공 렌더 검증
npm run harness:jobs         # 질의 작업 엔진 SQL(PGlite + 재생)
npm run harness:auth         # 로그인·세션·잠금 SQL(PGlite)
npm run harness:labels       # 정보 부족 항목 이름 한국어
npm run harness:smoke -- http://localhost:3100 bs_safety01 BS-03   # 로그인→질의→자동 조회→답→캐시→로그아웃
npm run harness:forcepw -- http://localhost:3100                   # 초기 비밀번호 변경 강제(로컬 전용)
npm run harness:shots -- http://localhost:3100                     # 화면 캡처(설치된 Chrome)
npm run harness:cq -- --conc 3                                      # 역량질문 70문 실서버 실행·리포트
npx tsc --noEmit && npx eslint src harness --max-warnings=0
```

## 환경변수
`app/.env.example` 참고. T3Q 토큰·세션 비밀은 **서버 전용**이다.

## 계정
사전 발급 5개(비밀번호 로그인, 세션 30분): 부산 `bs_safety01` · 인제 `ij_safety01` · 영천 `yc_safety02` · 정부기관 `mois_dsd01` · 운영자 `admin01`.
