# 인수인계 — 재난안전 AI 시범서비스 (2026-10-03 기준)

다음 작업을 시작할 때 이 문서부터 읽는다. 결정의 이유는 [`design/00_decisions.md`](design/00_decisions.md)(D1~D30), 설계는 [`design/01_system_design.md`](design/01_system_design.md)에 있다.

## 1. 현재 상태
| 항목 | 값 |
|---|---|
| 배포 | https://safetyai-three.vercel.app (Vercel `jazzsalle-projects/safetyai`, Root `app`, Node 22, region `icn1`) |
| 저장소 | GitHub `jazzsalle/SEFTYAI` — **비공개**, `main` 푸시 시 자동 배포 |
| 마지막 커밋 | `c813959` (배포 성공, 2026-10-04) |
| 시연 계정 | 로그인 화면 카드 클릭(비밀번호 없음): 행안부 `mois_dsd01`(전국) · 부산 `bs_safety01` · 영천 `yc_safety02` · 인제 `ij_safety01` · 운영 `admin01` |

## 2. 이 결과물의 성격
- **화면설계 목업(300. 시범서비스 화면설계 시연_261001)을 기준으로, 앞으로 T3Q 에이전트가 답할 모습을 미리 구현한 검토용 자료**이다. 완성된 POC나 서비스로 소개하지 않는다.
- 목적은 두 가지다.
  - 에이전트 응답 중심의 화면·업무 흐름을 미리 확인한다.
  - **T3Q API 요청 항목(상세조회·응답 구조)을 점검하고 리스크를 관리**한다.
- T3Q와는 연결되지 않았다. `/api/agent/query`는 계약(zod)을 지키는 **가정 응답 서버**이다. `T3Q_AGENT_URL`을 설정하면 실제 T3Q로 프록시된다.

## 3. 동작 규칙 (사용자가 정한 것 — 바꾸지 말 것)
| 규칙 | 내용 | 결정 |
|---|---|---|
| 에이전트 중심 | 채팅 우선. 짧은 결론 → 근거 → 결과 목록 → 이어서 질문. 그래프·통계 페이지·보고서식 나열 금지 | D20~D21 |
| AI 모드 켜짐 | 현재 발효 특보를 질의에 전달한다(`context.aiMode=true`, `advisory`). 전광판은 비모달 오버레이로, 끌어서 옮길 수 있고 띄운 채 일반 대화 가능 | D22, D27, D30 |
| AI 모드 꺼짐 | **사용자가 입력한 재난상황 조건만** 전달한다. 조건이 없으면 기준지역 일반 질의. 재난유형은 "선택 안 함" 가능. 조건 모달에 기준지역 없음(헤더 기준지역이 항상 전달) | D27 |
| 특보로 질문 | 특보를 입력창에 참조로 건다(`context.refAdvisory`). **AI 모드 중에는 비활성**. AI 모드가 꺼져 있으면 조건 + 특보 참조를 함께 쓸 수 있다 | D28 |
| 재난상황 조건 브리핑 | 입력 조건(+참조 특보)으로 브리핑한다. 조건이 없으면 그 사실을 밝히고 평시 현황으로 정리한다 | D30 |
| 지도 주제도 | 지자체를 고른 경우에만 그 지자체 범위로 표시한다. 전국이면 표시하지 않고, 고른 항목의 지자체만 켠다(읍면동 포함, 다른 지자체 항목을 고르면 전환) | D29 |
| 브리핑 질문 | AI 모드 전광판·시작 화면의 질문은 **내 브리핑 항목**에서 나온다(추천 질문 아님). AI 모드 = 위에서부터 5개, 시작 화면 = 접속할 때마다 무작위 4개. 설정: 사용자 메뉴 > 브리핑 항목 | D32 |
| 공개용 / 내부용 | 공개용 = 대화 화면. 내부용 = 운영관리 > **응답 검증**(운영자 전용, T3Q 담당자용): ① 요청 정합 ② 응답 정답(정답셋) ③ 표출 정합 + 사람 판정·CSV. 정답셋 180문항은 `node scripts/build_gold.mjs`로 재생성(T3Q 정답셋 수신 시 교체) | D31 |
| 새 대화 | 기준지역의 전국↔시·도 단위가 바뀌면 새 대화로 시작하고 안내한다("다시 보지 않기" 있음). 시군구·읍면동만 바꾸면 대화를 이어간다 | — |
| 사용자 문구 | 요구사항 번호, T3Q, 시연, 샘플, 검증필요 같은 내부 용어를 화면에 내보내지 않는다. 응답 직전에 `lib/server/ux.ts`의 `uxClean`으로 정리한다 | — |
| Figma | 디자이너 작업본이다. **분석만 하고 원본은 절대 수정하지 않는다**. 참고 이미지는 저장소 이력에서 제거했다 | — |

## 4. 코드 지도 (`app/src/`)
| 파일 | 역할 |
|---|---|
| `lib/contract/agent.ts` | T3Q Agent API 계약: `QueryContext`(aiMode·refAdvisory·hydro·situationKind…), `AgentResponse`, `DetailResponse` |
| `lib/server/agent/index.ts` | 의도 분류 라우터 (`classify`, 특보 참조용 `classifyAdvisory`) |
| `lib/server/agent/core.ts` | `situation()` = 특보·강우·사건 판단 (AI 모드·참조 특보일 때만 특보 기준), `condSummary()` |
| `lib/server/agent/composers.ts`, `composers2.ts` | 의도별 응답: 위험·유사사례·매뉴얼·하천·사건·브리핑 / 상황판단·통제·대피·복구·문자·보고·AI 점검 |
| `lib/server/agent/advisory.ts` | 특보 참조 응답: 기준·격상·해제, 풍랑(해안), 산사태 |
| `lib/server/agent/detail.ts` | 우측 상세(위험·사건·하천·119·침수흔적·재해대장) |
| `lib/server/ux.ts` | 사용자 노출 문구 정리 |
| `app/(main)/explore/page.tsx` | 대화 화면: 질의 컨텍스트 구성, 연속 질의, 새 대화 규칙 |
| `components/explore/*` | 입력창·조건 모달(`Composer`), 시작 화면, 답변 카드, 우측 패널(지도↔상세 분할·보기 탭), AI 전광판, 질문 라이브러리 |
| `components/map/MapView.tsx` | OpenLayers + VWorld, 주제도 지자체 필터(`layerRegion`), 경계 맞춤 |
| `components/AppShell.tsx` | 헤더(녹색 기상특보 데이터 전환·기준지역·AI 모드), 특보 바(특보로 질문) |
| `lib/session.tsx` | 계정·조건·AI 모드·참조 특보·대화 저장(localStorage) |
| `lib/verify.ts`, `lib/server/verify.ts`, `app/api/verify`, `components/admin/VerifyTab.tsx` | 내부용 응답 정합성 검증 (3단 비교 로직 · 정답셋 실행 API · 화면). 정답셋 `app/data/seed/gold_set.json` |
| `lib/help.ts`, `components/HelpCenter.tsx` | 온라인 도움말: 내용(항목·순서·예시 질문) / 전 화면 공통 버튼·서랍 (`app/layout.tsx`에 장착, `openHelp("verify")`로 특정 항목 열기) |
| `lib/server/scenarios.ts`, `library.ts` | 조건 시나리오 13종, 추천 질문(CQ), 연속 질의 시연(특보 참조 흐름 포함) |

## 5. 점검 (수정 후 반드시)
```bash
cd app && npm run dev -- -p 3100
node scripts/golden.mjs  http://localhost:3100        # 골든 22문항 (AI 모드 켜짐 기준)
node scripts/wxref.mjs   http://localhost:3100        # 특보 참조 19문항
node scripts/library.mjs http://localhost:3100 lib    # 추천 질문 (flow · check 도 각각)
curl -s -X POST http://localhost:3100/api/verify -d '{}' -H 'content-type: application/json'   # 정답셋 180문항 3단 검증 (모두 ok 여야 함)
npx tsc --noEmit                                       # .next/types TS6053 경고는 무시
```
배포 후에는 같은 스크립트를 `https://safetyai-three.vercel.app`로 다시 돌린다.

## 6. 배포·운영 주의
- **비공개 저장소 배포 조건:** 커밋 작성자가 GitHub 계정과 연결된 이메일이어야 한다. 이 저장소에는 `user.email = 183509977+jazzsalle@users.noreply.github.com`이 설정돼 있다. 배포가 **BLOCKED**("couldn't find a Git account for the commit author")이면 작성자 이메일부터 확인한다.
- **Vercel 환경변수:** `NEXT_PUBLIC_VWORLD_KEY`, `KMA_SERVICE_KEY`(암호화 저장됨). 로컬은 `app/.env.local`(gitignore).
- **VWorld 키:** 배포 도메인을 VWorld 콘솔에 등록해야 한다. 누락 시 OSM으로 폴백된다.
- **Vercel CLI/API 토큰** 만료 시 `vercel login`.

## 7. 데이터 성격 (시연 시 설명할 것)
- **훈련 시나리오:** `1001-20261002-01/02` 사건(10.2~3 호우). 특보·강우·119 신고 값은 가상이다. 헤더 녹색 전환으로 실시간(기상청 실제 특보)으로 바꿀 수 있다.
- **T3Q 제공 가정 시드:** 과거 33개 사건의 강우, 하천기본계획(제방고·여유고·위험요인).
- **119 신고:** 실제 표준 스키마에 가상 값을 넣었다. 건축물 지하공간은 예시 자료다.
- **발주처 수신 원천:** `seed_data/`는 수정하지 않고 git에서도 제외했다.

## 7-1. 요구사항 ID 체계 (2026-10-04 개정)
- 상세 기능 요구사항 정의서 v1.71 개정판(`seed_data/07. 사업수행/2. 요구사항 정의/3. 재난안전AI_시범서비스_상세 기능 요구사항 정의서_v1.71.xlsx`)은 **02_조회·연계구조(GR-01~21, 업무 흐름 순)** · **03_상세정보 제공항목(DQ-GG-NNN, GG = 그룹 번호)** 을 쓴다.
- 이전 판(DP-01~16 · DQ-001~155)과 155개 묶음의 내용은 같고 ID만 바뀌었다. 대조표: `docs/deliverables/DQ_ID_대조표_v1.71(이전→개정).csv`. **T3Q 2차 검토회신표는 아직 이전 ID**를 쓴다.
- `docs/analysis/00~03`(.md·.json)은 새 ID로 갱신됨.
- 요구사항이 바뀌어 **개발(코드·분석 문서)을 고쳐야 하면 먼저 사용자 승인**을 받는다. 문서 작성은 바로 해도 된다.

## 7-2. 산출물 (`docs/deliverables`)
- `SafetyAI_02-03시트_화면_API요청_가이드_v3.pptx` — 02·03 시트가 시범서비스 화면 어디에 나오는지(번호 박스 주석) + 0917 T3Q-15 개정 샘플 JSON + 작성 규칙 + API↔그룹↔묶음 대응표. 생성 스크립트는 남기지 않았다(필요 시 재작성).
- `DQ_ID_대조표_v1.71(이전→개정).csv`
- 리스크: 0917 요청 목록에 **매뉴얼 프로세스(GR-17·18)·소방 신고(GR-08) API가 없음** → 신규 요청 필요. 유사도 요인 비교(DQ-04-003·004)는 필수 응답으로 T3Q-11 보강 필요.

## 8. 남은 일 / 다음 후보
- [ ] 사내 메신저 공지 (아래 부록 문안)
- [ ] 개발자에게 02·03 시트 가이드(pptx) 공유 → T3Q-15 개정안부터 T3Q와 구조 합의
- [ ] 우측 상세 표시 항목 ↔ 요구사항 v1.71 상세조회 항목(`docs/analysis/02_t3q_detail_items.md`) 전수 대조 — 아직 하지 않음
- [x] 도움말 '문의' 항목 문의처 = 공간안전기술연구소 · st@unes.co.kr (`lib/help.ts`)
- [ ] 화면 확정 후 도움말 문구 재점검 (필요하면 그림 추가)
- [ ] 외부 공유 범위 결정 (사이트에 재해대장·상습침수 등 수신 데이터 요약 포함)
- [x] Figma 참고 이미지 git 이력 제거·강제 푸시 완료. GitHub 캐시까지 완전히 지우려면 GitHub 지원 요청이 필요하다

## 부록 — 사내 메신저 공지 문안

**본문**
> **[공유] 재난안전 AI 시범서비스 — 에이전트 응답 미리보기 (검토용)**
>
> 화면설계 목업(9월 월간보고 시연본)을 기준으로, 앞으로 T3Q 에이전트가 답하게 될 모습을 미리 구현해 본 검토용 화면입니다.
> 완성된 POC나 서비스가 아니라, **응답 형태와 API 요청 항목을 미리 점검해 리스크를 줄이기 위한 자료**입니다.
>
> 🔗 https://safetyai-three.vercel.app (로그인 화면에서 계정을 고르면 바로 들어갑니다)
>
> **봐 주셨으면 하는 것**
> 1. 질문했을 때 에이전트 답변이 업무에 쓸 만한 형태인지
> 2. 그 답을 만들려면 T3Q가 어떤 데이터·필드를 줘야 하는지, 지금 요청서에서 빠진 것은 없는지
> 3. 목업과 다르거나 실제로 구현하기 어려워 보이는 부분
>
> **써 보는 방법** — 질문 입력 · [AI 모드] 특보 기반 상황 점검 · [특보로 질문] 특보를 걸고 질문 · 상단 녹색 [훈련 시나리오 / 실시간(기상청)] 전환
>
> **유의사항** — T3Q 미연동 상태의 가정 응답이며, 훈련 시나리오의 일부 값은 가상입니다. 발주처 수신 데이터가 들어 있으니 외부 공유는 자제 부탁드립니다.
> 의견은 이 스레드에 남겨 주세요. 특히 "이런 답이 나오려면 T3Q에 이것도 요청해야 한다"는 의견이 가장 도움이 됩니다.

**짧은 버전**
> [검토용] 재난안전 AI 에이전트 응답 미리보기 — https://safetyai-three.vercel.app
> 화면설계 목업 기준으로 T3Q 에이전트 응답을 미리 구현해 본 자료입니다(POC 아님). 답변 형태가 업무에 쓸 만한지, T3Q API 요청 항목에 빠진 것은 없는지 봐 주시고 의견 부탁드립니다. T3Q 미연동 가정 응답이며 일부 값은 가상, 외부 공유는 자제해 주세요.
