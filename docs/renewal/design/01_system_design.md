# 시스템 설계서 — 유엔이 시범서비스 T3Q 실연동판

작성 2026-10-28 · 결정 근거 `00_decisions.md`(R0~R16) · 계약 `../analysis/t3q_contract.md` · 실측 `../analysis/t3q_live_probe.md`

## 1. 목표와 범위
- T3Q 시범서비스 API(v0.3)의 Agent 질의와 Data API를 실제로 연동해, 지자체(부산·인제·영천)와 정부기관 공무원이 풍수해 의사결정에 쓰는 **운영 서비스**로 전환한다.
- 에이전트 응답은 **무가공 표출**하고, 대기 시간을 줄이는 장치(질문 큐·병렬·캐시·Data 선표출)를 붙인다.
- 보존: 행동매뉴얼 대응절차(SOP), 연락망, 상황전파, 실행이력(대응절차·발송·대화), 실시간 기상특보, 도움말(내용은 최종 개발 후 수정).
- 삭제: 가정 응답 composer, 훈련 시나리오, 가상 seed(사건·119·상황보고·하천계획·정답셋), 골든 스크립트.

## 2. 아키텍처

```
브라우저 (Next.js App Router, React 19)
 ├─ 헤더(1줄, R13) · 특보 바 · 대응 단계 바(지자체)
 ├─ 좌측: 질문 큐 패널(접이식, R2)
 ├─ 가운데: 대화(턴 = 질문 + 자동 조회 데이터 카드 + 에이전트 답)
 └─ 우측: 지도(OpenLayers+VWorld) · 상세 · 대응절차 탭
        │  fetch (쿠키 세션 sa_sid)
        ▼
Next 서버 라우트 (Vercel 서버리스 icn1, maxDuration 30s, Agent await 금지)
 ├─ /api/auth/*            로그인·로그아웃·세션
 ├─ /api/agent/jobs*       작업 접수·상태(lazy 폴링)·취소·목록
 ├─ /api/t3q/data/*        Data API 프록시(화이트리스트·zod 검증·무가공 전달)
 ├─ /api/t3q/geometry      EXT-01 도형 프록시
 ├─ /api/t3q/suggested     T3Q-03
 ├─ /api/t3q/feedback      T3Q-31 + sa_feedback
 ├─ /api/library           지역 질문 라이브러리(정적, 질문 ID ↔ Data API 매핑)
 ├─ /api/weather           기상청 실시간 특보(보존)
 ├─ /api/admin/*           운영자: 작업 현황·예열(warm)·추적로그·계정
 └─ (보존) /api/sop · contacts · dispatch · conversations · checks · kv · trace · docs(MAN:)
        │                                 │
        ▼                                 ▼
Neon Postgres (sa_*)               T3Q 시범서비스 API (dev165.rootsall.net, Bearer a2app_…)
                                    ├─ POST /agent/query (ASYNC) → GET /agent/query/{id}
                                    ├─ Data API 04·05·06·10~19·30
                                    └─ EXT-01 /spatial-objects/geometry
```

### 2.1 모듈 (app/src)
| 경로 | 역할 |
|---|---|
| `lib/t3q/schemas.ts` | zod 계약(요청 strict, 응답 loose). 단일 정본 |
| `lib/t3q/client.ts` | 서버 전용 T3Q 호출: Bearer, X-Request-Id(항상 새 uuid), 타임아웃 20초, 응답 zod 검증. 비봉투(401·422) 정규화. `T3Q_MODE=live\|replay`(replay는 production에서 부팅 실패) |
| `lib/t3q/region.ts` | 우리 지역 선택(시도·시군구·읍면동) → T3Q `Region{admin_code(10자리), level, name}` |
| `lib/server/jobs.ts` | 작업 표 CRUD, 접수(동시성 슬롯 R8), lazy 폴링(2.5초 스로틀), 타임아웃·LOST 처리, 캐시 키·in-flight 합류(R2), 완료 시 도형 선조회 |
| `lib/server/auth.ts` | scrypt 해시, 세션 생성·검증·갱신, 잠금 |
| `middleware.ts` | `(main)`·`/api/*` 보호 |
| `lib/library/*` | 지역 질문 라이브러리(부산·인제·영천 × 업무단계·조건 시나리오·연속질의), 브리핑 기본 세트, 특보 질문, 질문 ID → Data API 매핑 |
| `components/answer/Markdown.tsx` | 무가공 렌더러(remark-gfm + sanitize, `#ref` 칩) |
| `components/queue/QueuePanel.tsx` | 좌측 질문 큐 |
| `components/answer/DataCard.tsx` | 자동 조회 데이터 카드(출처·기준시각 표기, 원응답 항목 그대로) |
| `components/map/MapView.tsx` | 보존 + refs/도형 레이어 |

## 3. 질의 처리 흐름

### 3.1 제출
1. 사용자가 질문을 낸다(자유 입력 / 브리핑 세트 / 특보 질문 / 추천 / 지역 라이브러리 / 이어서 묻기).
2. 브라우저 `POST /api/agent/jobs {question, source, libraryId?, followUp?{jobId, refs[]}, condition?}`.
3. 서버 처리:
   - 세션 확인 → `query_context`(기준지역, 재난유형, 사용자 입력 조건), `weather_warnings`(AI 모드 또는 특보 질문일 때 기상청 실시간 원문), `caller{user_id: HMAC 가명, role, org_admin_code}`를 조립한다.
   - `question_sent`: 기본은 `question_user`와 같다. 이어서 묻기일 때만 접두 템플릿을 붙인다(R4).
   - `cache_key = sha256(question_sent‖source‖canon(query_context)‖canon(warnings 키)‖canon(reference))`. 24시간 안의 DONE·SUCCESS 작업이 있으면 즉시 그 작업을 돌려준다(cached=true). 같은 키가 진행 중이면 그 작업에 합류한다.
   - 슬롯(계정 4·전체 8)이 남아 있으면 T3Q `POST /agent/query {response_mode: ASYNC}` → 202 → `SUBMITTED`. 슬롯이 없으면 `QUEUED`.
   - 라이브러리 질문이면 매핑된 Data API를 **동시에** 호출해 `sa_agent_jobs.preview`에 원응답을 저장한다(R3).
4. 응답 `{job}` → 큐 패널에 즉시 추가되고, 입력창은 비워진다(비차단).

### 3.2 대기·완료
- 브라우저는 활성 작업마다 `GET /api/agent/jobs/{id}`를 3초(5분 경과 후 6초) 간격으로 부른다.
- 서버는 `last_polled_at`이 2.5초 이내면 DB 값만 돌려준다. 아니면 T3Q EXT-02를 호출한다.
  - 202 RUNNING → 유지
  - 200 → `raw`에 봉투 그대로 저장, `state=DONE` → refs가 있으면 EXT-01로 도형을 선조회해 `geo`에 저장
  - `NOT_FOUND` → `LOST`(90초 이내면 1회 자동 재제출)
  - 502·네트워크 → `FAILED`(자동 재시도 없음, "다시 질의" 버튼)
  - 15분 초과 → T3Q cancel 후 `TIMEOUT`
- 같은 폴링 요청에서 QUEUED 작업 디스패치와 같은 계정의 방치된 RUNNING 작업 1~2건 폴링을 함께 처리한다(lazy sweep).
- 완료 순서대로 큐 패널에 배지를 붙이고, 현재 보고 있는 대화의 턴이면 바로 렌더한다.

### 3.3 표시(턴 구성)
```
[질문 말풍선]  출처 배지(브리핑/특보/추천/지역질문/자유/이어서) · (이어서 묻기면) "실제 전송 질문 보기"
[자동 조회 데이터]  (라이브러리 질문만) T3Q Data API 원응답 항목 표 · 출처 API · 데이터 기준시각
[에이전트 답]   로딩: 경과 시간 · 최근 중앙값 기준 예상 시간 · 취소
                완료: 마크다운 무가공 렌더 · #ref 칩 · 원문 보기/복사 · warnings·data_gaps·limitations·base_time · 평가(좋아요/아쉬워요)
```

## 4. 계정·권한
| 계정 | 유형(T3Q role) | 기준지역 기본 | 메뉴 |
|---|---|---|---|
| `bs_safety01` | 지자체 LOCAL_GOV_OFFICER | 부산광역시(2600000000) | 대화·대응절차·연락망·상황전파·이력 |
| `ij_safety01` | 지자체 | 인제군(5181000000) | 위와 같음 |
| `yc_safety02` | 지자체 | 영천시(4723000000) | 위와 같음 |
| `mois_dsd01` | 정부기관 CENTRAL_GOV_OFFICER | 전국 | 대화·이력·연락망(조회) |
| `admin01` | 운영자 OPERATOR | 전국 | 전체 + 운영관리(작업 현황·예열·추적로그·계정) |

T3Q `caller.role` 값은 계약 분석 문서의 enum을 따른다. 데이터는 모두 공개 등급이라 응답 차이는 없다.

## 5. 대기 최소화 장치 (R2)
| 장치 | 1차 | 설명 |
|---|---|---|
| 질문 큐 패널 | ✔ | 좌측 슬라이드(숨김 가능). 진행·완료순 정렬, 경과초, 출처, 상태, 취소 |
| 병렬 제출 | ✔ | 브리핑 세트 4문항 = 작업 4개 동시 제출 |
| 동일질의 캐시 | ✔ | 24시간. "HH:MM에 생성된 답변 · 다시 질의" 표시 |
| Data API 선표출 | ✔(정의된 질문) | 질문 ID ↔ API 정적 매핑. 출처 분리 카드 |
| 도형 선조회 | ✔ | 답 완료와 동시에 지도에 바로 표시 |
| 예상 시간 | ✔ | 최근 20건 중앙값 |
| 운영자 예열 | ✔ | `/admin` "브리핑 예열" 버튼(3지역 × 기본 4문항, 동시 4) |
| 크론 예열 · 자유질문 분류 · 알림 | 2차 | |

## 6. 응답 렌더링 규칙 (R5 상세)
**허용(표현)**
1. GFM 마크다운을 의미대로 렌더한다(제목·표·목록·인용·구분선·굵게·기울임·인라인 코드). 넓은 표는 가로 스크롤한다.
2. `[이름](#ref:rN)`은 `refs[]`에 rN이 있을 때만 칩으로 만든다(라벨 = 링크 글자 그대로). 없으면 링크가 아닌 일반 글자로 둔다.
3. 칩을 누르면 지도에서 강조·이동한다. 같은 답의 다른 refs는 흐리게 함께 표시한다. EXT-01 `precision`이 근사면 "동 중심(근사)" 배지를 붙인다.
4. `http(s)` 링크만 새 창으로 열고, 그 밖의 href·HTML·스크립트·이미지는 제거한다.
5. 서체·색·여백·다크모드·표 줄무늬 같은 시각 디자인. 긴 답 접기는 기본 펼침이고, 최신 답은 항상 펼친다. 내용은 삭제하지 않는다.
6. 원문 보기(마크다운 원문), 원문 복사, 표 복사(셀 글자 그대로).
7. `warnings[].message`, `data_gaps`(reason 한글 대역표), `limitations`, `meta.base_time`, `meta.elapsed_ms`를 답 아래에 그대로 표시한다.
8. 인라인 코드(`disaster.recovery_item` 등)는 그대로 노출한다.

**금지(가공)**: 요약, 문장·용어·숫자·단위 변경, 오탈자 수정, 절 순서 변경·병합, 제목 생성, 결론 자동 하이라이트, 표 정렬·필터·열 숨김(2차 승인 사항), 여러 답 합치기, Data API 결과를 답 안에 삽입, 경고·한계 생략, refs 밖 대상을 지도에 표시, 좌표 추정.

**검증**: 렌더 DOM textContent ≡ 원문 마크다운의 평문(공백 정규화), 칩 수 ≡ refs에 있는 고유 표지 수 — 하네스 무가공 테스트.

## 7. 특보·AI 모드 (R6)
- 특보: 기상청 실시간만 쓴다(`/api/weather`, 서버 캐시 60초). 상태는 발효 중 / 발효 특보 없음 / 조회 실패를 구분해 표시한다.
- 특보 질문: 발효 특보마다 [특보로 질문]을 둔다. 질의에 `weather_warnings`(기상청 원문 항목)를 붙이고 `question_source=QUICK`으로 보낸다.
- AI 모드: 켜면 즉시 1회, 이후 10분마다 탭이 열려 있을 때만 점검한다. `question_source=AI_MODE`, `ai_mode{check_id, trigger, interval_min}`, 현재 특보를 넣는다(없으면 빈 items). 답은 무가공으로 표시하고 `sa_ai_checks`에 이력을 남긴다.
- 재난상황 조건 입력: 사용자가 입력한 조건(`query_context.detail`·`period`·`reference_time`)은 "사용자 입력 조건"으로 표기하고 그대로 보낸다.

## 8. 보안·운영
- T3Q 토큰·DB·세션 비밀은 서버 env에만 둔다(`T3Q_BASE_URL`, `T3Q_CLIENT_TOKEN`, `SESSION_SECRET`, `CRON_SECRET`, `KMA_SERVICE_KEY`, `DATABASE_URL`). 로그에서 마스킹한다.
- `caller.user_id` = HMAC(account_id) 가명.
- 보존 기간: `sa_agent_jobs.raw` 180일, `sa_trace` 90일, `sa_check_history` 30일(기존).
- T3Q 가용성: `/health` 30초 캐시. 실패하면 상단 배너 "T3Q 연결 불가 · 이전 답은 이력에서 조회"를 띄운다.
- 시연 전: T3Q에 파드 재시작 자제를 요청하고, 운영자 예열을 실행한다.

## 9. 비기능
- 응답 대기: 첫 화면 반응 200ms 안에 큐 등록. Data 선표출 2초 안.
- 접근성: 키보드 조작, 글자 크기 조절(UFR-008), 대비.
- 브라우저: 최신 Chrome·Edge.
