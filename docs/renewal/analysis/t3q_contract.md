# T3Q 시범서비스 API — 실제 계약 (소스 기준)

> 기준: T3Q `pilot-svc-api` **v0.3.0** 소스(FastAPI) + 「시범서비스 API 설명서 v0.3」. 작성 2026-10-28.
> 근거 표기 `파일:줄` 은 T3Q 리포 루트 기준(`api/app/…`, `index.html` …). 설명서는 `설명서 §n`.
> **소스에 없는 것은 쓰지 않았다.** 소스에서 확인할 수 없어 실측이 필요한 항목은 `⚠ 확인 필요` 로 표시했다.
> 짝 파일: `t3q_types.ts`(타입) · `t3q_schemas.ts`(zod 4) · `t3q_examples.json`(catalog.py 예시 요청) · `t3q_vs_old_contract.md`(기존 가정 계약과 차이).

---

## 0. 한눈에

| 항목 | 값 | 근거 |
|---|---|---|
| 기본 주소 | `https://<T3Q 서버>/apps/r/<서비스 토큰>/api` + `/v1/…` | 설명서 §1 · README.md:9 |
| 인증 | `Authorization: Bearer <클라이언트 토큰 a2app_…>` — 게이트웨이(a2adc)가 검증, API 는 게이트웨이를 거쳤는지만 본다 | api/app/deps.py:8-12 · api/a2adc_sdk/core.py:176-192 |
| 응답 | 모든 `/v1` = 공통 봉투 JSON (예외: 401·422·게이트웨이 오류 — §2.4) | api/app/envelope.py:82-98 |
| 봉투 버전 | `schema_version: "2.0"` | envelope.py:25 |
| Agent | `POST /v1/agent/query` 한 주소에 T3Q-01·02·28·29. 1~6분 소요 → **`response_mode: "ASYNC"` + 폴링 필수** | agent.py:3-6, 84-104 · catalog.py:18 |
| Data API | 결정론(같은 요청=같은 결과), LLM 없음, SQL 읽기만 | api/AGENTS.md:27 · data.py:1-5 |
| 배포 | uvicorn `WORKERS=1`, k8s `replicas: 1`, 대화·작업 저장 = 컨테이너 `/tmp/pilot-svc/pilot.db`(SQLite) | Dockerfile:11 · k8s.yaml:12-14,22 · settings.py:18 |

---

## 1. 인증 · 헤더

| 헤더 | 방향 | 규칙 | 근거 |
|---|---|---|---|
| `Authorization: Bearer a2app_…` | 요청 | 게이트웨이가 검증 후 API 에는 `X-A2ADC-Caller`·`X-A2ADC-Proxy-Key` 만 넘긴다. 프록시 비밀이 안 맞으면 **HTTP 401 `{"detail": "..."}`(봉투 아님)** | deps.py:8-12 · core.py:164-192 · tests/test_offline.py:61-65 |
| `X-Request-Id` | 요청·응답 | 있으면 그 값(80자 자름) → 없으면 본문 `request_id` → 없으면 서버 생성 `REQ-YYYYMMDD-xxxxxx`(hex 6). 응답 헤더로 되돌려준다 | envelope.py:56-70, 40-41, 97 |
| `X-Correlation-Id` | 요청·응답 | 있으면 그 값(80자) → 없으면 `corr-` + request_id 의 `REQ-` 뒤 | envelope.py:67-69 |
| `Content-Type: application/json` | 요청 | POST 본문 | — |

- `GET /health` 는 인증 없이 `{"status":"ok","version":"0.3.0"}` (봉투 아님). main.py:24-27
- `caller.role` 은 서버가 **쓰지 않는다**(역할별 응답 차이 없음). catalog.py:81-82 · 설명서 §2. `caller.user_id` 만 대화 저장에 들어간다. agent.py:155-156

---

## 2. 공통 응답 봉투

```jsonc
{
  "schema_version": "2.0",
  "request_id": "REQ-20261028-a1b2c3",
  "correlation_id": "corr-20261028-a1b2c3",
  "status": "SUCCESS",
  // Agent 질의(T3Q-01·02·28)에만, 대화가 있을 때: "conversation_id": "CONV-…", "turn_no": 1   ← status 와 result 사이
  "result": { /* API 별 */ } ,          // 실패·미발견 시 null 가능
  "data_gaps": [ { "component": "crisis_alert_level", "reason": "NOT_IN_SOURCE" } ],   // 늘 배열
  "warnings":  [ { "code": "NOT_FOUND", "message": "…", "retryable": false } ],        // 늘 배열
  "meta": { "source": "T3Q", "base_time": "2026-10-20T00:00:00+09:00",
            "quality_status": "VERIFIED", "disclosure_level": "공개", "elapsed_ms": 123 }
}
```
근거: envelope.py:82-98 (키 순서 87-96, `top` 삽입 88-89).

| 필드 | 값 | 근거 |
|---|---|---|
| `meta.source` | 늘 `"T3Q"` | envelope.py:94 |
| `meta.base_time` | Data API = 고정 `PILOT_DATA_BASE_TIME`(기본 `2026-10-20T00:00:00+09:00`) · Agent·대화·평가 API = 응답 시각(`now_kst`) | settings.py:16 · agent.py:103,158,… |
| `meta.quality_status` | 기본 `VERIFIED`, 사건 검토 표시 있으면 `UNDER_REVIEW`(T3Q-10·13) | envelope.py:83 · events.py:66-70 |
| `meta.disclosure_level` | 늘 `"공개"` (한글. 기존 가정의 `PUBLIC` 아님) | envelope.py:83 |
| `meta.elapsed_ms` | 서버 처리 시간 | envelope.py:52-53 |
| `model_version` | **없음** | — |

### 2.1 status ↔ HTTP

| status | HTTP | 언제 | 근거 |
|---|---|---|---|
| `SUCCESS` | 200 | 정상 | envelope.py:98 |
| `NO_RESULT` | 200 / **404** | 0건(200) · 상세 API 의 없는 ID(404 + warning `NOT_FOUND`) · EXT-02 미발견/취소(200) | events.py:62-63 · risk.py:278 · plans.py:197,250,270,273 · evidence.py:160,170 · agent.py:110-116 |
| `DATA_NOT_AVAILABLE` | 200 | 원천 없음/미구축(+data_gaps) · Agent 가 «API(ReACT)» 유형 아님 | events.py:204,341,420,431 · agent.py:130-135 |
| `PARTIAL_SUCCESS` | 200 | 일부 칸 원천 없음 | events.py:265,413 · plans.py:212,234,267,311 · kg.py:180 · spatial.py:98 |
| `FORBIDDEN` | 403 | 정의만 있고 **쓰는 곳 없음** | envelope.py:29 (grep 결과 사용처 0) |
| `TIMEOUT` | 504 | a2adc 데이터 호출 시간 초과(동기 경로만) · warning `UPSTREAM_TIMEOUT`(retryable) | main.py:30-34 · data.py:44 |
| `UPSTREAM_ERROR` | 502 | a2adc 연계 실패 · data_gaps `{component, CONNECTION_FAILED}` + warning `UPSTREAM_UNAVAILABLE`(retryable) | main.py:35-36 |
| `PROCESSING` | 202 | (T3Q 확장) ASYNC 접수·진행 중 | envelope.py:8,29 · agent.py:102-103,113-114 |

`list_status()` 규칙(목록 API): 0건 → `NO_RESULT`, gap 있으면 `PARTIAL_SUCCESS`, 아니면 `SUCCESS`. envelope.py:101-105

### 2.2 data_gaps / warnings

- `data_gaps[] = {component: string, reason}` — reason 5종: `NOT_IN_SOURCE`·`NOT_YET_BUILT`·`SOURCE_NOT_COLLECTED`·`CONNECTION_FAILED`·`INPUT_NOT_PROVIDED`. envelope.py:28,73-75
  - `component` 는 자유 문자열 경로(`"time_profile.ended_at"`, `"items[].paragraphs"`, `"similarity.factors.{요인}"`, `"factors.{요인군}"`, `"relations.EVENT→RISK_AREA·FACILITY·FLOOD_TRACE·PLAN"` …). 화면은 **코드값 enum 으로 묶지 말 것**.
- `warnings[] = {code, message, retryable}` — message 는 화면에 보여도 되는 짧은 문구. envelope.py:78-79, 10
  - 소스에 나오는 code: `NOT_FOUND`·`UNKNOWN_ID`·`UNKNOWN_REF`·`UNKNOWN_DATA_GROUP`·`INPUT_NOT_PROVIDED`·`CONDITION_NOT_USED`·`SIMILARITY_NOTE`·`SIMILARITY_NOT_COMPUTED`·`NO_COMPARABLE_FACTOR`·`RANK_OUT_OF_TOP`·`EVENT_REVIEW_FLAG`·`TIMELINE_NOT_IN_SOURCE`·`TIMELINE_LINKED_BY_OVERLAP`·`REPORT_NOT_IN_SOURCE`·`SATELLITE_NOT_IN_SOURCE`·`FIRE_REPORT_NOT_IN_SOURCE`·`COMPLAINT_NOT_IN_SOURCE`·`EVACUATION_NOT_IN_SOURCE`·`FLOOD_MAP_NOT_IN_SOURCE`·`REGION_NOT_APPLICABLE`·`REGION_NOT_APPLIED`·`FREEBOARD_COMPUTED`·`LINKED_IDS_SAMPLE`·`FANOUT_LIMITED`·`EVENT_LINK_NOT_BUILT`·`DOCUMENT_STORE_NOT_BUILT`·`AGENT_NOT_READY`·`UPSTREAM_TIMEOUT`·`UPSTREAM_UNAVAILABLE`. retryable=true 는 `UPSTREAM_*` 둘뿐.
- **null ≠ 0**: null = 미제공, 0 = 실제 0. api/AGENTS.md:28-29

### 2.3 ID 꼴(연결키 — 파싱하지 말 것, 단 §8.4 지도 키 변환은 예외)

사건 `T10107-20200728-0001`(정규식 `^T\d{5}-\d{8}-\d{4}$`, kg.py:25) · 위험·취약 `HZ-{zone_id}`·`SL-{관리번호}`·`LS-{ID}`·`UP-{id}` · 하천 `RV-{하천코드7}` · 계획 `RBP-{과업번호13}`·`HZP-{종류코드}`(NDIZ·WLZ·CRA·FVZ·RDD·RSV) · 침수흔적 `FT-I_{n}` · 침수 재해 `FE-{id}` · 문서 `DOC-{2020_재해연보}` · 근거 `EV-EVT-{사건}`·`EV-DMG-{사건}`·`EV-OBJ-{객체ID}` · 대화 `CONV-YYYYMMDD-xxxxxx` · 응답 `RES-YYYYMMDD-xxxxxx`. common.py:3-7 · plans.py:23 · agent.py:122-123

### 2.4 봉투가 **아닌** 응답 (클라이언트가 따로 처리)

| 경우 | 형태 | 근거 |
|---|---|---|
| 게이트웨이 미경유·토큰 오류 | HTTP 401 `{"detail": "a2adc 게이트웨이를 거치지 않은 요청입니다 …"}` | deps.py:11 |
| 요청 검증 실패(필수 누락·범위·패턴) | HTTP 422 FastAPI 기본 `{"detail": [{loc, msg, type}…]}` | tests/test_offline.py:160 (rating "SOSO" → 422) |
| 처리 안 된 예외(SQLite 오류 등) | HTTP 500 (FastAPI 기본) | main.py 는 `UpstreamError` 만 잡는다(30-36) |
| 앞단 HAProxy 60초 상한 초과(SYNC Agent 등) | 게이트웨이 오류 응답(형식은 T3Q 소스 밖) ⚠ 확인 필요 | agent.py:6 · core.py:70 · a2adc_sdk/README.md:58 |
| `/health` | `{"status":"ok","version":"0.3.0"}` | main.py:24-27 |

---

## 3. 공통 요청 모델 (`api/app/common.py`) — 그대로

모든 모델 `extra="allow"`(모르는 필드는 받아 넘긴다 — 에러 아님). common.py:18,25,32,38,47,55,70

```text
Caller        { user_id?: str (가명), role?: str (LOCAL_GOV_OFFICER·CENTRAL_GOV_OFFICER·SYSTEM_OPERATOR), org_admin_code?: str }   common.py:17-21
Region        { admin_code?: str (법정동 10자리), name?: str, level?: str (SIDO·SIGUNGU·EMD) }                                   common.py:24-28
Period        { from?: str, to?: str }      ← 파이썬 필드명 from_, JSON 키는 "from"                                              common.py:31-34
Condition     { item?: str, label?: str, value?: number, unit?: str, source_type?: str }                                          common.py:37-43
Detail        { warning_kind?: str, warning_level?: str, keywords: str[] = [], conditions: Condition[] = [] }                     common.py:46-51
QueryContext  { reference_time?: str, region?: Region, disaster_types: str[] = [], period?: Period, detail?: Detail }             common.py:54-60
Page          { page: int ≥1 = 1, size: int 1..100 = 20 }                                                                        common.py:63-65
BaseReq       { request_id?: str, caller?: Caller, conversation_id?: str, turn_no?: int }                                        common.py:68-74
```

- **`weather_warnings` 는 QueryContext 에 없다** — `AgentQueryReq` 최상위 필드(`Optional[dict]`, 내부 검증 없음). agent.py:38. 단 QueryContext 가 `extra="allow"` 라 안에 넣어도 Agent 입력으로 그대로 넘어간다(agent.py:50 `model_dump(by_alias=True, exclude_none=True)`).
- 명세 v0.9 의 `weather_warnings` 예시 꼴(서버가 검증하지 않음, 참고): `{collect_status, collected_at, source, items[{warning_key, kind, level, area, announced_at, effective_at, change}]}` — spec/시범서비스 API 명세서_v0.9.md:4476-4500.
- `region.admin_code` 해석(Data API): 10자리면 level 또는 끝자리 0 패턴으로 시도 2·시군구 5·읍면동 8·리 10자리 앞부분 일치. 2·5·8자리 숫자도 그대로. 코드 없으면 `name` 으로 시도만. common.py:79-96
- `disaster_types` 는 **한글 이름**(호우·태풍 …) → 분류코드(L3 우선)로 바꿈. 유사도는 **첫 유형 하나만** 쓴다(나머지는 warning). common.py:118-125 · data.py:92-97
- `detail.conditions`(강우·수위)·`warning_kind/level` 는 유사도에 **쓰지 않음** → warning `CONDITION_NOT_USED`. common.py:136-140 · events.py:86
- 조건 item 코드: `RAIN_1H`·`RAIN_3H`·`RAIN_6H`·`RAIN_12H`·`RAIN_24H`·`WATER_LEVEL`·`FLOW`·`WIND_SPEED`·`HUMIDITY`. common.py:108-109
- 유사도 날짜 = `period.from` → 없으면 `reference_time`(앞 10자). common.py:130-132

---

## 4. 엔드포인트 요약

| ID | 메서드·경로 | 종류 | 상태(catalog) | 근거 |
|---|---|---|---|---|
| T3Q-01 | POST `/v1/agent/query` | Agent | IMPLEMENTED | agent.py:84 |
| T3Q-02 | POST `/v1/agent/query` (BRIEFING) · POST `/v1/agent/query/{request_id}/cancel` | Agent | IMPLEMENTED | agent.py:84,165 |
| T3Q-03 | GET `/v1/suggested-questions` | Agent(고정 목록) | IMPLEMENTED | agent.py:194 |
| T3Q-04 | POST `/v1/similar-events/search` | Data | IMPLEMENTED | events.py:81 |
| T3Q-05 | POST `/v1/risk-knowledge/search` | Data | IMPLEMENTED | risk.py:80 |
| T3Q-06 | POST `/v1/plans/search` | Data | IMPLEMENTED | plans.py:95 |
| T3Q-10 | GET `/v1/events/{event_master_id}` | Data | IMPLEMENTED | events.py:134 |
| T3Q-11 | POST `/v1/events/{event_master_id}/similarity` | Data | IMPLEMENTED | events.py:194 |
| T3Q-12 | GET `/v1/events/{event_master_id}/timeline` | Data | IMPLEMENTED | events.py:334 |
| T3Q-13 | GET `/v1/events/{id}/damage-response` · GET `/v1/events/{id}/reports` | Data | IMPLEMENTED · 보고서는 늘 DATA_NOT_AVAILABLE | events.py:380,416 |
| T3Q-15 | GET `/v1/risk-objects/{object_id}` | Data | IMPLEMENTED | risk.py:274 |
| T3Q-16 | GET `/v1/rivers/{river_id}/plan-knowledge` | Data | IMPLEMENTED | plans.py:192 |
| T3Q-17 | GET `/v1/plans/{plan_id}` | Data | IMPLEMENTED | plans.py:243 |
| T3Q-18 | POST `/v1/kg/query` | Data | IMPLEMENTED | kg.py:130 |
| T3Q-19 | POST `/v1/evidence/search` | Data | IMPLEMENTED | evidence.py:126 |
| T3Q-20 | GET `/v1/documents/{document_id}/file` · `/pages/{page}` | Data | DATA_NOT_AVAILABLE | evidence.py:157,167 |
| T3Q-25 | GET `/v1/agent/conversations/{conversation_id}` | 자체 저장 | STORE | agent.py:212 |
| T3Q-27 | DELETE `/v1/agent/conversations/{conversation_id}` · POST `/v1/agent/conversations/purge` | 자체 저장 | STORE | agent.py:232,247 |
| T3Q-28 | POST `/v1/agent/query` (QUICK·QQ-03) | Agent | IMPLEMENTED(답 글) | agent.py:41-42,145-147 |
| T3Q-29 | POST `/v1/agent/query` (AI_MODE) | Agent | IMPLEMENTED(답 글) | agent.py:148-152 |
| T3Q-30 | POST `/v1/flood-traces/search` | Data | IMPLEMENTED | flood.py:41 |
| T3Q-31 | POST `/v1/agent/feedback` | 자체 저장 | STORE | agent.py:265 |
| T3Q-32 | GET `/v1/events/{id}/satellite-images` | Data | DATA_NOT_AVAILABLE | events.py:434 |
| T3Q-33 | GET `/v1/events/{id}/fire-reports` | Data | DATA_NOT_AVAILABLE | events.py:440 |
| T3Q-34 | POST `/v1/evacuation-facilities/search` | Data | DATA_NOT_AVAILABLE | risk.py:293 |
| T3Q-35 | GET `/v1/events/{id}/complaints` | Data | DATA_NOT_AVAILABLE | events.py:447 |
| T3Q-36 | POST `/v1/flood-maps/search` | Data | DATA_NOT_AVAILABLE | flood.py:85 |
| EXT-01 | POST `/v1/spatial-objects/geometry` | Data(확장) | IMPLEMENTED | spatial.py:68 |
| EXT-02 | GET `/v1/agent/query/{request_id}` | Agent(확장) | IMPLEMENTED | agent.py:107 |
| — | GET `/v1/catalog` · GET `/health` | 시스템 | — | main.py:24,39 |

**없는 것**: T3Q-07(피해위치)·08(위험조건 판정)·09(참조관측소)·14(사례 관측)·21(lineage)·26(참조 유효성) — 라우터·catalog 어디에도 없음. SSE 스트리밍(`STREAM`) 없음(설명서 §4).

---

## 5. Agent API 상세

### 5.1 T3Q-01·02·28·29 — `POST /v1/agent/query`

요청 `AgentQueryReq(BaseReq)` — agent.py:29-38

| 필드 | 타입 | 필수 | 기본 | 제약·동작 | 근거 |
|---|---|---|---|---|---|
| `request_id` | str | | 서버 생성 | 헤더 `X-Request-Id` 가 우선. **ASYNC 작업 키** | envelope.py:58-66 |
| `caller` | Caller | | | `user_id` 만 저장에 사용 | agent.py:156 |
| `conversation_id` | str\|null | | null | null 이고 source≠AI_MODE 면 서버가 `CONV-…` 새로 만듦. AI_MODE+null 이면 대화 저장 안 함 | agent.py:122 |
| `turn_no` | int\|null | | 마지막+1 | 주면 그대로(같은 번호면 덮어씀) | store.py:67-68 |
| `question` | str | **필수** | | 1~4000자(화면 입력 2,000자 권장) | agent.py:30 |
| `question_source` | str | | `"USER"` | `USER`·`SUGGEST`·`FOLLOW_UP`·`QUICK`·`BRIEFING`·`AI_MODE`. 그 밖의 값은 **조용히 USER 로**(422 아님) | agent.py:26,31,121 |
| `query_context` | QueryContext | | | Agent 입력 `inputs.query_context` 로 그대로 | agent.py:47-50 |
| `reference` | dict | | | 그대로 Agent 에 전달(서버 해석 없음) | agent.py:33,47 |
| `response_mode` | str | | `"SYNC"` | 대소문자 무시 `ASYNC` 만 비동기, 나머지는 모두 SYNC | agent.py:34,87 |
| `briefing` | dict | | | T3Q-02 `{preset_id, briefing_item_id, item_no, item_total}` | agent.py:35 |
| `quick_query_id` | str | | | `QQ-01~03`. `QQ-03` 이거나 질문에 «대응절차»/«행동매뉴얼» 이 들어가면 행동매뉴얼 칸 추가 | agent.py:36,41-42 |
| `ai_mode` | dict | | | T3Q-29 `{check_id, trigger, interval_min, prompt_id}` | agent.py:37 |
| `weather_warnings` | dict | | | 검증 없이 Agent 에 전달(꼴은 §3 참고) | agent.py:38 |

Agent 에 실제로 넘어가는 것: `{"messages":[{"role":"user","content": question}], "inputs": {question_source, query_context?, reference?, briefing?, ai_mode?, weather_warnings?}}` — agent.py:45-51. **`conversation_id`·이전 대화는 Agent 에 넘기지 않는다** → 서버 쪽 다회차 문맥 없음(각 질문 독립). 

응답 `result` — agent.py:137-152

| 필드 | 타입 | 실제 값 | 근거 |
|---|---|---|---|
| `response_id` | str | `RES-YYYYMMDD-xxxxxx` (T3Q-31 평가 키) | agent.py:123 |
| `question` / `question_source` | str | 요청 그대로(정규화된 source) | agent.py:137 |
| `answer` | str\|null | **MARKDOWN**. 지도 대상은 `[이름](#ref:rN)` 링크. Agent 미구축(DATA_NOT_AVAILABLE)이면 null | agent.py:73,132,137 · 설명서 §7.2 |
| `answer_format` | `"MARKDOWN"` | 고정 | agent.py:138 |
| `refs[]` | Ref[] | `{ref, entity_type, display_name, map:{key, value(문자열화), draw}}` — `ref`·`map` 없는 항목은 버림. `draw` 없으면 key 별 기본(slope_no→line, flood_map_id·trace_code·geoai_area_id·river_code→layer, 그 밖 pin) | agent.py:54-66 |
| `entities[]` | any[] | Agent 출력 `entities` 를 **그대로** 통과, 없으면 `[]` | agent.py:79 |
| `result_groups[]` | any[] | 동일(통과, 기본 `[]`) | agent.py:78 |
| `evidence_refs[]` | any[] | 동일(통과, 기본 `[]`) | agent.py:78 |
| `follow_up_questions[]` | any[] | 동일(통과, 기본 `[]`) | agent.py:79 |
| `conversation_title` | null | **늘 null** | agent.py:139 |
| `limitations` | str[] | **고정** `["유사사례는 예측·위험판단이 아닌 참고 정보"]` | agent.py:140 |
| `context_used` | object | **고정** `{used_conditions: [], unused_conditions: [], reference_used: false}` | agent.py:141 |
| `briefing_item` | object | source=BRIEFING 이고 `briefing` 이 있을 때만: `{briefing_item_id(요청 값), item_name:null, item_status:(봉투 status), summary:null, count:null, unit:null, objects:[], evidence_refs:[]}` | agent.py:142-144 |
| `manual`·`action_items`·`action_item_total` | null·[]·null | 행동매뉴얼 요청일 때만 추가, **늘 비어 있음** + data_gaps `manual NOT_IN_SOURCE` (status 는 SUCCESS 그대로) | agent.py:145-147 |
| AI_MODE 칸 | | source=AI_MODE 일 때만: `check_id`(요청 ai_mode.check_id), `checked_at`(서버 시각), `region{admin_code, name}`(query_context.region 에서, 없으면 null), `priority_review: null`, `warning_guides: []`, `no_warning_message: null`, `info_gaps: []` — **판단 결과는 answer 글에만** | agent.py:148-152 |

봉투 최상위 추가: `conversation_id`, `turn_no`(대화가 있을 때만) — agent.py:153-158.

**무엇이 비어서 오는가 (요약)**: 구조화된 칸은 사실상 `answer`(글)와 `refs[]` 뿐이다. `entities`·`result_groups`·`evidence_refs`·`follow_up_questions` 는 Agent(a2adc Agent 416) 출력에 그 키가 있을 때만 채워지는데, T3Q 시험 픽스처의 Agent 출력은 `output.text` + `refs` 뿐이다(tests/test_offline.py:216-219) → **빈 배열로 온다고 가정하고 설계** ⚠ 실측 확인 필요. `conversation_title`·`limitations`·`context_used` 는 고정값, 브리핑 요약·건수, 행동매뉴얼 action_items, AI 모드 `priority_review`·`warning_guides` 는 빈 칸(설명서 §3, catalog.py:22,58,60).

`#ref:` 표지: 설명서 §7.3 은 «refs 에 없는 표지는 서버가 벗긴다» 고 하지만 **api/ 코드(`_from_agent`)에는 벗기는 로직이 없다**(agent.py:69-82) — Agent(a2adc) 쪽 처리로 보임. 클라이언트는 `refs[]` 에 없는 `#ref:rN` 을 일반 글로 렌더링해야 안전하다. T3Q 시험 화면은 `#ref:` 외 링크는 `http(s)` 만 새 창, 나머지 href 제거, script/img 등 제거(index.html:318-333).

상태별 동작
- SUCCESS: Agent 응답 받음. agent.py:127-128
- DATA_NOT_AVAILABLE: a2adc 오류 문구에 «API(ReACT)»·«유형»·«찾을 수 없습니다»·«쓸 수 없습니다» → answer null, data_gaps `agent NOT_YET_BUILT`, warning `AGENT_NOT_READY`. agent.py:129-135
- 그 밖 a2adc 오류: SYNC → UPSTREAM_ERROR(502)/TIMEOUT(504) 봉투(main.py). **ASYNC → 늘 UPSTREAM_ERROR(502)** 로 저장(TIMEOUT 구분 없음, agent.py:94-97).
- 실패한 질문(UPSTREAM_ERROR)은 `record_turn` 이전에 예외가 나므로 **대화 이력에 남지 않는다**(agent.py:126,154-157).

### 5.2 ASYNC — 접수(202) → 폴링(EXT-02) → 취소

```text
POST /v1/agent/query {…, "response_mode":"ASYNC"}
  → 202 {status:"PROCESSING", request_id, result:{request_id, poll:"/v1/agent/query/{request_id}"}, meta.base_time=지금}   agent.py:102-103
     ※ 이 응답엔 conversation_id·turn_no 가 없다 — 최종 결과에서 받는다(agent.py:153-158 은 작업 스레드 안에서만 돈다)
GET /v1/agent/query/{request_id}                    agent.py:107-117
  → 202 {status:"PROCESSING", result:{request_id, job_status:"RUNNING", started_at}}
  → (끝) 저장된 T3Q-01 응답 본문·HTTP 코드 그대로 (200 SUCCESS / 200 DATA_NOT_AVAILABLE / 502 UPSTREAM_ERROR)
  → 200 {status:"NO_RESULT", result:{request_id, job_status:"CANCELLED"}}
  → 200 {status:"NO_RESULT", result:{request_id, job_status:"NOT_FOUND"}}      ← 모르는 id·하루 지나 지워진 id·pod 재시작으로 유실된 id
POST /v1/agent/query/{request_id}/cancel  body: {reason?: "USER_CANCELLED"}   agent.py:161-173
  → 200 SUCCESS {request_id, cancel_result:"CANCELLED", cancelled_at}             ← RUNNING 이었음
  → 200 SUCCESS {request_id, cancel_result:"ALREADY_COMPLETED"|"NOT_FOUND", cancelled_at:null}
```
- `poll` 은 `/v1/…` 상대경로 — 클라이언트 base(`…/api`)를 앞에 붙인다.
- 폴링 간격: 설명서·시험 화면 모두 3초(설명서 §6.1 · index.html:413).
- 취소해도 **Agent 는 끝까지 돈다**(결과만 버림). store.py:133
- 취소 본문: `CancelReq` 가 필수 본문 파라미터라 **빈 본문이면 422 가능** → 늘 `{}` 이상 보낼 것(시험 화면은 `{reason}` 보냄, index.html:426). ⚠ 실측 확인 필요
- DONE 결과는 같은 id 로 **여러 번** 다시 받을 수 있다(행 삭제 없음, 하루 보관). store.py:116,126-129

### 5.3 T3Q-03 — `GET /v1/suggested-questions`

query: `region_admin_code?`(무시됨 — 주면 warning `REGION_NOT_APPLIED`), `disaster_types?`(쉼표 목록, 질문의 유형과 교집합으로 거름), `per_group` 1~3(기본 1). agent.py:195-207
result: `{capability_set_version: "CQS-152-v0.1", items[{question_id, group, group_label, text, data_api}]}` — 고정 6문항(SQ-CASE-01·SQ-RISK-01·SQ-FAC-01·SQ-PLAN-01·SQ-FT-01·SQ-RV-01), group ∈ SIMILAR_EVENT·RISK_AREA·RISK_FACTOR_FACILITY·PLAN·FLOOD_TRACE·RIVER. 0건이면 NO_RESULT. agent.py:178-191,207

### 5.4 T3Q-25 — `GET /v1/agent/conversations/{conversation_id}`

result: `{conversation_id, context_mode:"STATEFUL", context_status, last_turn_no, last_activity_at}` + ACTIVE 면 `{expires_at, context_idle_timeout_hours: 24}` / EXPIRED 면 `{expired_at, resume_requirement:"NEW_CONVERSATION_OR_SEND_HISTORY"}`. 없으면 NO_RESULT `{conversation_id, context_mode, context_status:"NOT_FOUND"}`(HTTP 200). 만료 = 마지막 활동 + `PILOT_CONTEXT_IDLE_HOURS`(24). agent.py:212-225 · store.py:80-83 · settings.py:19
⚠ «STATEFUL» 이지만 Agent 에 이전 대화를 넘기지 않는다(§5.1) — 상태는 «대화 행이 있다» 이상의 의미가 없다.

### 5.5 T3Q-27 — 대화 삭제

- `DELETE /v1/agent/conversations/{id}` (본문 없음) → SUCCESS `{conversation_id, delete_result:"DELETED", deleted_at, deleted_items:["context","turn_cache"]}` / NO_RESULT `{…, delete_result:"NOT_FOUND", deleted_at:null}`(200). agent.py:232-239 (DeleteReq 는 정의만 되고 안 쓰임, 228-229)
- `POST /v1/agent/conversations/purge` `{conversation_ids: str[1..200] 필수, reason?: "USER_REQUEST"|"RETENTION_EXPIRED"}` → SUCCESS `{items[{conversation_id, delete_result, deleted_at}]}`(중복 제거). agent.py:242-253
- 삭제된 대화 id 로 다시 질문하면 되살아난다(deleted_at 해제). store.py:66-67

### 5.6 T3Q-31 — `POST /v1/agent/feedback`

`{response_id: str 1..80 필수, rating: "GOOD"|"BAD" 필수(패턴), comment?: ≤1000, rated_at?: str, conversation_id?, turn_no?}` → SUCCESS `{response_id, feedback_result: "ACCEPTED"|"UPDATED"}`. response_id 존재 여부는 **검사 안 함**. agent.py:258-268 · store.py:102-108

---

## 6. Data API 상세

공통: 모든 POST 본문은 BaseReq(request_id·caller·conversation_id·turn_no) 를 함께 받는다(쓰지는 않음). `page` 는 `Page{page,size}` 객체(T3Q-34·36 만 `page`·`size` 정수 최상위).

### T3Q-04 유사사례 — `POST /v1/similar-events/search`  (events.py:75-129)
요청: `event_master_ids?: str[]`(null=전체 후보, `[]`=즉시 NO_RESULT), `query_context?`, `page: Page`(기본 size 20).
- query_context 도 ids 도 없으면 NO_RESULT + gap `query_context INPUT_NOT_PROVIDED`.
- ids 만 있고 유사도 질의가 비면 요청 순서 그대로 + warning `SIMILARITY_NOT_COMPUTED`, `similarity: null`.
- 유사도 후보 상한 k = min(50, page×size) → **전체 순위는 최대 50위**.
result: `{total_count, items[{event_master_id, display_name, disaster_types[str], lifecycle_status("CLOSED"|null), started_at, ended_at, time_precision:"DATE", similarity:{rank, score, scale:"0~100", algorithm_version, coverage}|null, representative_admin_area:{admin_code, name}|null, crisis_alert_level:null, has_geometry:false}]}`.
비어서 오는 것: `crisis_alert_level`(null), `has_geometry`(늘 false), 피해 요약·linked_counts·reasons **없음**(reasons 는 T3Q-11).

### T3Q-10 사건 상세 — `GET /v1/events/{event_master_id}`  (events.py:134-162)
result: `{event_master_id, display_name, disaster_types[], disaster_type_code, source_disaster_type_text, lifecycle_status, time_profile:{started_at, ended_at, time_precision:"DATE", source_timezone:null, source_time_raw:{start,end}}, representative_admin_area, affected_admin_areas[{admin_code,name}], affected_admin_areas_more:false, crisis_alert_level:null, cdb_stage:null, lead_agency, event_summary(" · " 이어 붙인 글), available_sections:{similarity:true, timeline:bool, damage_response:true, report:false, evidence:true, satellite:false}, evidence_refs[str]}`.
data_gaps 늘 `crisis_alert_level`·`cdb_stage` NOT_IN_SOURCE (+ended_at 없으면). status 는 SUCCESS(gap 있어도). 없는 id → 404 NO_RESULT.

### T3Q-11 유사도 근거 — `POST /v1/events/{id}/similarity`  (events.py:167-265)
요청: `query_context?` 또는 `reference_event_id?`(이 사건과 견주기). 둘 다 없으면 DATA_NOT_AVAILABLE + `INPUT_NOT_PROVIDED`.
result: `{event_master_id, similarity:{score, rank|null(50위 밖), scale:"0~100", algorithm_version, coverage}, contributions[{factor_group, contribution_points, contribution_pct}], weights:{disaster_type, by_group[{factor_group, weight(정수 %)}], weight_stage}, similarity_reasons[str], factors[{factor_group, factor_key, factor, unit, current_value, past_value, match, weight_used, contribution, evidence_ref:null}], factor_groups_not_provided[str], disclaimer}`.
- 요인: type·keyword(재난유형) · season·duration(기상·수문) · region(공간·취약) · severity·casualty(피해). 요인군 순서 `재난유형·기상·수문·공간·취약·피해·대응` — **«대응» 원천 없음**. events.py:24-26
- 사용자 강우 조건은 factors 에 `past_value:null, match:null, weight_used:0, contribution:0` 로만 붙는다. events.py:232-235
- status: gap 있으면 PARTIAL_SUCCESS(대부분 그렇다).

### T3Q-12 타임라인 — `GET /v1/events/{id}/timeline?page=1&size=100(≤500)`  (events.py:334-350)
result: `{event_master_id, time_origin:{type:"ABSOLUTE", origin_at, note}, total_count, items[{seq, occurred_at, elapsed_hours, time_precision:"MINUTE", category:"특보"|"재난문자", description, agency|null, record_type:"ACTUAL", evidence_ref:null, source_ref, relation_basis:"TIME_REGION_OVERLAP"}]}` + 늘 warning `TIMELINE_LINKED_BY_OVERLAP`. 항목 없으면 DATA_NOT_AVAILABLE `{…, total_count:null, items:[]}`.
`phase`(전·중·후) 없음.

### T3Q-13 피해·대응 — `GET /v1/events/{id}/damage-response`  (events.py:380-413)
result: `{event_master_id, damage:{human:{text:null, dead, missing, injured, displaced}, property:{text:null, property_damage_krw, houses:null}, facilities:{public:{record_count, damage_amount_krw, by_category[{category, record_count, damage_amount_krw}]}|null, private:{record_count, damage_amount_krw}|null, recovery[{report_level, item_count, damage_amount_krw, recovery_cost_krw}], damage_registers[{disaster_id, disaster_year, name}]}|null}, response:{road_control_count:null, evacuation:{text:null, persons:null}, actions:[]}, evidence_refs[]}` — **늘 PARTIAL_SUCCESS**, gap `response NOT_IN_SOURCE`. 금액 단위 원(천원 아님).
`GET …/reports` → 늘 DATA_NOT_AVAILABLE `{event_master_id, total_count:null, reports:[]}`.

### T3Q-32·33·35 — 늘 DATA_NOT_AVAILABLE (events.py:427-450)
result `{event_master_id, total_count:null, items:[]}` (+32: `missing_phases[{phase:"ALL", reason:"NOT_IN_SOURCE", note}]`, 33·35: `page`, `size`). 없는 사건 id 는 404.

### T3Q-05 위험·취약 목록 — `POST /v1/risk-knowledge/search`  (risk.py:60-110)
요청: `data_group?: "RISK_AREA"|"RISK_FACTOR_FACILITY"`(null=둘 다, 그 밖 값 → NO_RESULT+`UNKNOWN_DATA_GROUP`), `object_ids?`(`[]`→NO_RESULT), `region?`, `categories?: str[]`(분류 이름), `page`(기본 size **100**).
result: `{total_count, category_counts[{category, count}], items[{object_id, spatial_object_id|null, data_group, category, type, source_subtype, name, grade:{value, status:"PROVIDED"|"NOT_PROVIDED"}, address, admin_code, admin_name, has_geometry, disclosure_level:"공개"}]}`.
category 값: 자연재해위험개선지구 등 hazard.zone_kind 이름·`급경사지`·`산사태취약지역`·`지하차도(취약시설)`. 좌표 없음.

### T3Q-15 위험·취약 상세 — `GET /v1/risk-objects/{object_id}`  (risk.py:147-280)
result: `{object_id, spatial_object_id|null, data_group, category, type, source_subtype, name, admin_area:{admin_code, name}, address, risk:{designation_reason:null, key_risk_condition:null, expected_damage:null, vulnerability:null, grade:{value,status}, risk_score_detail:{score}|null, designated_at, designation_no, area_or_length, attributes[{key, label, value, evidence_ref}]}, management:{agency, department, contact:null, contains_pii:false}, basis:{designation_basis:null, related_plans[{plan_id, name}], related_documents[{title, evidence_ref}], past_events:[]}, source:{name, table, row_no, as_of}, disclosure_level}`. grade 없으면 gap `risk.grade NOT_IN_SOURCE`. 없는 id → 404.
비어서 오는 것: 지정사유·핵심조건·예상피해·취약성·지정근거·과거사건·연락처 — 늘 null/[].

### T3Q-34 대피시설 — 늘 DATA_NOT_AVAILABLE (risk.py:285-298)
요청 `{linked_object_ids?, region?, facility_types?, page:int=1, size:int=20}` → `{total_count:null, page, size, items:[]}`.

### T3Q-06 계획 목록 — `POST /v1/plans/search`  (plans.py:60-137)
요청: `plan_ids?`, `region?`, `plan_types?: ("하천기본계획"|"위험지구 정비계획")[]`, `river_code?`(7자리 또는 `RV-…`), `keyword?`, `page`(size 20).
- region 만 주면 하천기본계획은 거르지 않고 빠짐 + warning `REGION_NOT_APPLICABLE`.
result: `{total_count, items[PlanItem]}`, PlanItem = `{plan_id, plan_type, scope_type:"RIVER"|"ADMIN_AREA", name, agency:null, target_area, target_admin_codes, target_rivers[{river_code, spatial_object_id:null, river_name, river_id}]|null, plan_period:null, base_year, approval:null, version, other_versions[], linked_risk_area_count, river_plan_summary:{design_frequency_yr, design_flood_cms, reference_station_no}|null, summary}`.

### T3Q-16 하천 계획지식 — `GET /v1/rivers/{river_id}/plan-knowledge?station_limit=50(1..500)`  (plans.py:192-234)
result: `{river_id, river_code, river_name, river_basic:{river_type, passing_admin_areas:null, managing_agency:null, water_system, basin_code, parent_river:{river_id, river_name}|null, tributary_order, river_length_km, catchment_km2, designation}, plan:{plan_id, name, agency:null, notice:null, plan_period:null, base_year, probable_rainfall[{duration:"1시간"|"24시간", value_mm, return_period_yr, site, distribution}], design_flood:{value_cms, station_no, return_period_yr}|null, freeboard_required_m:null, vertical_datum:"EL.m", other_plans[]}|null, stations[{station_no, cum_dist_m, design_flood_cms, design_flood_level_elm, levee_left_elm, levee_right_elm, plan_width_m, thalweg_elm, return_period_yr, freeboard_m, freeboard_ok:null}], station_total, facilities(str)|null, facility_items[{facility_type, count, scope}], management_state:null, risk_sections:[], mitigation_measures:[], knowledge_type:"PLAN_KNOWLEDGE", evidence_refs[]}` — **늘 PARTIAL_SUCCESS**. `freeboard_m` = min(좌·우 제방고) − 계획홍수위(계산값). risk_sections·mitigation_measures NOT_YET_BUILT.

### T3Q-17 계획 상세 — `GET /v1/plans/{plan_id}`  (plans.py:243-311)
공통: `{plan_id, plan_type, name, target_area, agency:null, plan_period:null, base_year, version, other_versions, content:{plan_summary:null, risk_causes:null, mitigation_measures:null, related_passage:null}, type_specific_items[{section, items[{label, value}]}], target_rivers, linked_risk_area_count, document_id:null, quality_status, disclosure_level, evidence_refs}` + HZP: `linked_risk_area_ids_sample[≤20]` / RBP: `linked_risk_area_ids:[]`. 늘 PARTIAL_SUCCESS(gap `content NOT_YET_BUILT`).

### T3Q-18 객체관계 — `POST /v1/kg/query`  (kg.py:29-180)
요청: `source_ids: str[1..20] 필수`, `relation_types?`, `target_entity_types?`, `depth: 1|2`(기본 1).
result: `{nodes[{id, entity_type(EVENT·DOCUMENT·RIVER·PLAN·RISK_AREA·FACILITY), name, has_geometry}], edges[{source_id, relation_type(HAS_SOURCE_DOCUMENT·PLAN_TARGET_RIVER·TRIBUTARY_OF·PLAN_LISTED_ZONE), target_id, relation_basis:"DATA_LINKED", evidence_ref, status:"ACTIVE"}], group_counts[{entity_type, count}]}`. 노드당 이웃 50개 상한(warning `FANOUT_LIMITED`). 사건→위험지구·시설·침수흔적 관계 없음.

### T3Q-19 근거 — `POST /v1/evidence/search`  (evidence.py:25-146)
요청: `evidence_refs?: str[≤50]` 또는 `object_id?`(둘 다 없으면 NO_RESULT+INPUT_NOT_PROVIDED), `include_passage=true`, `context_paragraphs 0..5`(쓰이지 않음), `page`.
result: evidence_refs 로 부르면 `{items[]}`, object_id 로 부르면 `{object_id, total_count, items[]}`. 항목 = `{evidence_ref, document_id, passage_id:null, page("p.N")|null, title, short_title, document_type, agency, published_at:null, version:null, total_pages:null, section_path, section_title:null, pdf_page:null, paragraphs:[], table|null, quote_type:"TITLE_ONLY"|"SUMMARY", ocr_status:null, source_availability:"TITLE_ONLY"|"AGGREGATE_ONLY", disclosure_level, download_allowed:false, related_object_ids[]}` (+EV-EVT: `source_row{table,row_no}`, EV-DMG: `table{caption, head[], rows[][], highlighted_row, totals{…}}`·`coverage_note`). **인용 문단 없음**.

### T3Q-20 원문 — 늘 DATA_NOT_AVAILABLE (evidence.py:157-174)
`/file` → `{document_id, file_name:null, content_type:null, size_bytes:null, sha256:null, download_url:null, expires_at:null}` · `/pages/{page}` → `{document_id, page, pdf_page:null, total_pages:null, image_url:null, expires_at:null}`. 없는 DOC → 404.

### T3Q-30 침수흔적 — `POST /v1/flood-traces/search`  (flood.py:32-74)
요청: `flood_trace_ids?: str[≤200]`, `event_master_id?`(필터로 **안 씀**), `region?`, `flood_year?`, `period?{from,to}`, `page`(size 50). 필터가 하나도 없으면 NO_RESULT+INPUT_NOT_PROVIDED, event_master_id 만이면 DATA_NOT_AVAILABLE.
result: `{total_count, items[{flood_trace_id, spatial_object_id|null, district_name, admin_code, event_master_id:null, flood_event:{flood_event_id, name}|null, flood_grade:null, max_depth_m:null, avg_flood_depth_raw, avg_flood_depth_unit(설명 문자열), avg_flood_level_m:null, area_m2, damage_amount_krw, flood_hours, cause, flood_year, started_on, ended_on, report:null, has_geometry}]}`.

### T3Q-36 침수지도 속성 — 늘 DATA_NOT_AVAILABLE (flood.py:77-89)
요청 `{region?, map_types?: ("URBAN_FLOOD"|"RIVER_FLOOD")[], spatial_object_ids?, page:int, size:int}` → `{total_count:null, page, size, items:[]}`. (도형은 EXT-01 `flood_map_id` 로 가능 — 설명서 §3)

### EXT-01 공간객체 도형 — `POST /v1/spatial-objects/geometry`  (spatial.py:48-100)
요청: `items: {ref?: str, key: str = "spatial_object_id", value: str}[1..300]`.
key: `spatial_object_id`(`FT-` 접두 → trace_code, 그 밖은 flood_map_id → trace_code → slope_no → bdst_ldgr_unq_no 순으로 찾음) · `latlon`("위도,경도", DB 안 감) · `bdst_ldgr_unq_no` · `slope_no` · `trace_code` · `flood_map_id` · `landslide_area_id` · `geoai_area_id` · `river_code` · `pnu` · `sigungu_code` · `legal_dong_code`(동 → 읍면 → 시군구 중심 순 대체) · `underpass_id`(동/읍면 중심). spatial.py:25-45,72-85
result: `{type:"FeatureCollection", features[{type:"Feature", geometry(GeoJSON, EPSG:4326, 소수 6자리), properties:{ref, key, value, precision}}], missing[{ref, value, reason:"NOT_FOUND"|"UNKNOWN_KEY"|"BAD_LATLON"}]}`. precision: `exact`·`bbox`·`centroid_only`·`building_center`·`dong_center`·`emd_center`·`sigungu_center` (+ 시험 화면엔 `bbox_unchecked`·`bbox_suspect` 표기도 있음, index.html:286-287). 하천·침수지도 폴리곤은 5m 단순화. status: 전부 찾음 SUCCESS · 일부 PARTIAL_SUCCESS · 없음 NO_RESULT(+gap `spatial_object NOT_IN_SOURCE`).

---

## 7. 실 예시 요청 (catalog.py)

전체는 `t3q_examples.json`. 핵심 상수(catalog.py:7-12):
```json
CALLER = {"user_id":"U-TEST-0001","role":"LOCAL_GOV_OFFICER","org_admin_code":"2600000000"}
QC = {"reference_time":"2026-08-25T16:00:00+09:00","region":{"admin_code":"2600000000","name":"부산광역시","level":"SIDO"},
      "disaster_types":["호우"],"period":{"from":"2026-08-25T14:00:00+09:00","to":null},
      "detail":{"warning_kind":"호우","warning_level":"경보","keywords":["호우","침수"],
                "conditions":[{"item":"RAIN_1H","label":"1시간 강우","value":68,"unit":"mm","source_type":"MANUAL"}]}}
EV = "T10107-20200728-0001"
```
실 ID: 사건 `T10107-20200728-0001`(타임라인 있음)·`T10101-20181026-0001`(타임라인 없음) · 위험 `HZ-1536`·`SL-2611000001`·`UP-609` · 하천 `RV-1024180` · 계획 `RBP-1024180202010`·`HZP-NDIZ`·`HZP-CRA` · 문서 `DOC-2020_재해연보` · 흔적 `FT-I_109` · 시군구 `2629000000`·`2617000000`.

---

## 8. 클라이언트 설계 시 주의

### 8.1 응답 시간
- Agent: **1~6분**(catalog.py:18 «1~6분», README·설명서 «1~5분», 실측 118초 — 설명서 §7.6). 앞단 HAProxy **60초**에 끊긴다 → SYNC 금지, ASYNC + 3초 폴링. agent.py:6 · core.py:70
- 서버가 Agent 를 기다리는 상한: a2adc SDK `poll_timeout` **1800초(30분)** — 이 안에 끝나지 않으면 job_timeout → (ASYNC) UPSTREAM_ERROR. core.py:67,72,149-160
- Data API: a2adc 데이터 질의 1건 상한 75초(`A2ADC_TIMEOUT`), SQL 30초·1000행. 엔드포인트 하나가 SQL 을 여러 번 부른다(예: T3Q-17 RBP 는 5~6회, T3Q-04 는 유사도+사건 조회). 실측 지연값은 소스에 없음 ⚠ 실측 필요. core.py:71 · a2adc_sdk/README.md:21,58

### 8.2 ASYNC 작업 저장과 유실 위험
| 사실 | 영향 | 근거 |
|---|---|---|
| 작업 = `threading.Thread(daemon=True)` 1개/질문, 큐·상한 없음 | 동시 질문 수만큼 스레드. 과부하 보호 없음 | agent.py:101 |
| 작업 상태 = SQLite `PILOT_DATA_DIR/pilot.db` 의 `agent_job`, 기본 `/tmp/pilot-svc`(k8s 도 /tmp) | **pod 재시작·재배포 시 작업·대화·평가 전부 소실** → 폴링이 `NO_RESULT/NOT_FOUND` | store.py:1-3,26-27,33-36 · k8s.yaml:14 |
| 프로세스만 재시작(같은 컨테이너)되면 행은 `RUNNING` 으로 남고 스레드는 없음 | **영원히 PROCESSING(202)** — 서버에 만료 처리 없음 | store.py:113-117,126-129 |
| 하루 지난 작업 삭제는 «새 작업이 시작될 때만» | 결과 보관 ≈ 1일(보장 아님) | store.py:116 |
| 취소해도 Agent 는 계속 돈다 | 취소가 부하를 줄이지 않음 | store.py:133 |
| 같은 request_id 재사용 시 `INSERT OR REPLACE` 로 덮어씀 | 이전 작업 결과가 섞일 수 있음 → **요청마다 새 X-Request-Id** | store.py:117,121-123 |
| ASYNC 202 응답에 conversation_id 없음 | 첫 질문 결과가 오기 전 두 번째 질문을 보내면 대화가 둘로 갈라짐 → 첫 턴 완료 전 후속 질문 막기 | agent.py:102-103,122 |

**클라이언트 권장**: (1) 폴링 최대 대기(예: 7~10분) 후 cancel + 사용자에게 재시도 안내 (2) `NOT_FOUND` 를 «서버 재시작으로 유실» 로 처리 (3) 202 와 200 PROCESSING 을 모두 «진행 중» 으로 인식(HTTP 코드와 status 둘 다 확인) (4) 502 결과 본문도 봉투이므로 파싱.

### 8.3 동시성 한계
- uvicorn `--workers ${WORKERS:-1}`, ConfigMap `WORKERS: "1"`, `replicas: 1` — 단일 프로세스. Dockerfile:11 · k8s.yaml:12,22 · api.yaml:11
- 엔드포인트는 모두 동기 `def` → FastAPI 스레드풀에서 돈다(a2adc_sdk/README.md:59). **SYNC Agent 요청은 스레드풀 스레드 1개를 최대 30분 점유**.
- SQLite 접근은 전역 `threading.Lock` 하나로 직렬화(대화·작업·평가 모두). store.py:18,39-49
- 컨테이너 자원 limit `cpu: 1, memory: 512Mi`. k8s.yaml:48-50
- 유사도 엔진: a2adc `data_similarity_rank` 가 없으면 앱 내 계산으로 전환(전역 상태). similarity.py:22-39

### 8.4 지도 연동 함정
- 목록·상세의 `spatial_object_id` 는 `SL-…`·`LS-…`·`FT-…` 꼴인데, EXT-01 은 `FT-` 만 벗기고 나머지는 접두 그대로 조회한다(spatial.py:80-81,88). 소스상 `SL-2611000001` 은 `slope_no::text` 와 맞지 않아 **NOT_FOUND 가 될 것**으로 보인다 ⚠ 실측 확인 필요. 우회: `SL-{n}` → `{key:"slope_no", value:n}`, `LS-{n}` → `{key:"landslide_area_id", value:n}`, `UP-{n}` → `{key:"underpass_id", value:n}`(동 중심 근사).
- `HZ-`(위험지구) 는 도형 키가 없다(has_geometry false).
- Agent refs 는 이미 `map{key,value}` 를 주므로 그대로 EXT-01 에 넘긴다(index.html:311-317).
- refs `map.value` 는 서버가 `str()` 로 바꿈 — 원래 값이 없으면 문자열 `"None"` 이 될 수 있다(agent.py:65).

### 8.5 기타
- 요청에 모르는 필드를 넣어도 에러가 아니다(extra allow) — 오타가 조용히 무시된다. 클라이언트 쪽 zod 로 송신 검증할 것.
- `question_source` 오타는 USER 로 바뀐다(agent.py:121).
- Data API `meta.base_time` 은 데이터 적재 기준(2026-10-20 고정) — «실시간» 아님.
- 역할 기반 필터링·FORBIDDEN 없음 — 화면 권한 제어는 우리 쪽 책임.
- 실시간 관측(강우·수위)·기상특보 원천 없음 — 특보는 우리가 `weather_warnings` 로 넘겨야 하고, 서버는 내용 검증 없이 Agent 에 전달만 한다.
