# 하네스 엔지니어링 설계

작성 2026-10-28 · 위치 `app/harness/` · 실행 `npm run harness:*` (package.json)

## 1. 원칙
- 녹화본(`harness/recordings/`)은 T3Q 실응답이며 **개발·테스트 전용**이다. 런타임 코드(`src/`)는 녹화본을 import하지 않는다(ESLint `no-restricted-imports`).
- `T3Q_MODE=replay`는 로컬·CI 전용이다. `VERCEL_ENV=production`에서는 부팅 시 오류를 낸다.
- 녹화본에는 개인정보가 없다(T3Q 공개 데이터). 다만 원천 데이터이므로 저장소 공개 범위는 비공개를 유지한다.

## 2. 구성
| 단계 | 파일 | 내용 | 명령 |
|---|---|---|---|
| ⓪ 프로브 | `t3q/probe_async.mjs` · `probe_data.mjs` · `probe_unknowns.mjs` | 실서버 실측(응답 시간·동시성·미확인 계약) → 녹화 | `node harness/t3q/probe_*.mjs` |
| ① 계약 | `contract/contract.test.ts` | 녹화본 전체를 `lib/t3q/schemas.ts`로 검증, `#ref` ⊂ refs | `npm run harness:contract` |
| ② 재생 | `lib/t3q/client.ts`(replay 분기) · `t3q/replay-index.mjs` | 요청 지문(경로 + canonical body) → 녹화본. ASYNC는 202 → RUNNING ×2 → 최종 순으로 재생 | `T3Q_MODE=replay npm run dev` |
| ③ 무가공 | `render/verbatim.test.tsx` | Markdown 렌더 결과 textContent ≡ 원문 평문, 칩 수 ≡ 고유 표지 수, refs 밖 표지는 링크가 아님 | `npm run harness:verbatim` |
| ④ CQ 배치 | `cq/run.mjs` | `cq/cq_variants.json` 70문, 동시 3, 작업당 15분 상한 → `recordings/cq_<ts>/`, 리포트 `reports/cq_<ts>.md`(자동·부분·사람 판정) | `npm run harness:cq -- [--only A-02] [--limit 10]` |
| ⑤ 지역 질문 | `cq/run.mjs --set regional` | 부산·인제·영천 라이브러리 질문 실행·녹화(라이브러리 품질 확인용) | `npm run harness:regional` |
| ⑥ e2e | `e2e/*.spec.ts`(Playwright, replay) | 로그인 → 큐 4건 → 완료순 → 칩 → 지도 → 새로고침 복원 → 취소 | `npm run harness:e2e` |
| ⑦ 스모크 | `t3q/smoke.mjs` | 배포본 대상: 로그인 · Data API 1건 · Agent 1건(ASYNC) | `node harness/t3q/smoke.mjs <url>` |

## 3. 판정 기준(CQ 리포트)
- **자동**: 정답이 숫자·이름 목록이면 답 글에 각 항목이 포함되는지 본다(공백·쉼표 정규화).
- **부분 자동**: 정답의 핵심 토큰 비율.
- **사람**: 서술형. 리포트에 정답과 답 원문을 나란히 놓는다.
- 판정은 검증 리포트용이다. 화면 표출에는 영향을 주지 않는다(무가공 원칙).

## 4. 실행 순서(개발 중)
1. 계약 변경·T3Q 판 변경 시: ⓪ → ①
2. UI 개발: ② 재생 모드로 개발. 머지 전 ③ · ⑥
3. 시연 전: ④ · ⑤ 실서버 실행 → 리포트 → ⑦ 배포본 스모크
