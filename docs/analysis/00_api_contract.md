# 00. T3Q Agent API 연계 계약 (추정·정리본)

> **ID 체계 갱신 (2026-10-04)** — 상세 기능 요구사항 정의서 v1.71 개정판(02_조회·연계구조 **GR-01~21** / 03_상세정보 제공항목 **DQ-GG-NNN**) 기준으로 바꿨다. 조회 대상·항목·응답 요청 기준·식별자 내용은 이전 판과 155건 모두 같다. 이전 ID(DP-xx, DQ-001~155)와의 대조는 `docs/deliverables/DQ_ID_대조표_v1.71(이전→개정).csv` — T3Q 2차 검토회신표는 아직 이전 ID를 쓴다.

> **상태: 협의안(UNE 제안) — T3Q 확정 명세 아님.** T3Q는 아직 어떤 요청서에도 회신하지 않았다(기술협의서 T-01~T-25 회신란, 2차 검토회신표 417건 회신란 모두 공란). 경로·필드명은 `1_1. T3Q_API 요청목록(전달자료)_0917.xlsx`(T3Q-01~27 + 공통규약)를 1차 기준으로 하고, 이후 결정(v1.71 요구사항 2026-10-02, 01·02 pptx 2026-10-03)을 반영해 보정했다. 예시값은 부산 시나리오 seed 기반이며 **인용 금지**.
> 보조 출처: `1. (T3Q) AI Agent 연계 기술 협의서_0910`(T-01~T-25), `2. (아이타이쿤) 공간정보 기술 협의서_0914`(I-01~I-11), 역량질문 v1.1(02~06 시트: T3Q-REQ-001~060, API-001~022, QueryContext/AgentResponse 스키마, MapAction), 2차 검토회신표(DQ-03-001·DQ-03-002·DQ-19-001·DQ-21-001·DQ-18-001~009).

---

## 1. 연계 구조

```
[UNE Next.js 웹]  ──▶  [UNE 연계중계서버(BFF)]  ──▶  ① T3Q Agent API   (자연어 질의 → 답변 + entities[] + evidence_refs[])
                                                   ──▶  ② T3Q Data API    (ID/조건 → 결정론적 데이터, 같은 요청=같은 결과)
                                                   ──▶  ③ 공간정보 API     (T3Q Spatial 또는 아이타이쿤 ITK — 경로 3사 협의 중)
                                                   ──▶  ④ 기상청 기상특보 API (UNE 직접 호출, 1분 주기)
                                                   ──▶  ⑤ VWorld 2D 배경지도
```

| 사용자 행동 | 호출 | 받아야 할 내용 |
|---|---|---|
| 자유 질문·후속 질문·빠른질의·브리핑 문항 | ① Agent | 답변·근거·엔터티·**후속 추천질문** |
| AI 모드 상황 점검 | ① Agent (UNE가 기준지역·시각·**기상특보** 전달) | 특보별 판단·우선 확인사항·정보 부족사항 |
| 답변의 대상(챗 엔터티)/목록/지도 객체 클릭 | ② Data (Agent 재호출 없음) | 대상별 항목·표·이력·원문 근거 |
| 답변 관련 지도 표시 | ③ 공간 (또는 Agent 응답에 직접 포함) | 점·선·폴리곤 또는 공간객체 연결값 |

**핵심 규칙**
- Agent 응답은 **객체 ID(entities)와 근거 ref(evidence_refs)까지만** 제공하고, 데이터 자체는 UNE가 `entity_type`별 Data API로 조회한다(공통규약 §8).
- 같은 ID·자료 버전으로 조회하면 같은 원천 상세정보를 받아야 한다(Data API 결정론성).
- T3Q는 UI Action을 주지 않는다(T-07) — 지도 이동·강조·상세 열기는 UNE가 `entity_type`/`entity_id`로 결정.
- 9/17 결정: 지도에는 **Agent 응답이 반환한 객체의 공간정보만** 표출(bbox 상시조회·전체 주제도 금지).
- v1.71: 현재 기상·수문 관측값 자동조회 **제외** → `conditions[].source_type`은 실질적으로 `MANUAL`만, 기상특보만 UNE가 기상청에서 받아 전달.

---

## 2. 공통 규약 (T3Q-22 상태·오류 모델 / T3Q-23 공통 메타·권한)

### 2.1 요청 헤더
```http
Authorization: Bearer {service_token}
X-Request-Id: REQ-20260909-000311
X-Correlation-Id: corr-20260909-000311
Content-Type: application/json; charset=utf-8
Accept: application/json
```

### 2.2 공통 요청 필드
```json
{
  "request_id": "REQ-20260909-000311",
  "caller": { "user_id": "U-2647-0031", "role": "LOCAL_GOV_OFFICER", "org_admin_code": "2647000000" },
  "...": "(API별 요청 필드)"
}
```
- `caller.user_id`는 가명 식별자(실명·연락처 전송 금지).
- `caller.role` 코드(공통규약): `LOCAL_GOV_OFFICER` / `CENTRAL_OFFICER` / `VERIFIER` / `ADMIN`. **v1.71 사용자 2유형(지자체 공무원·시스템 운영자) → `LOCAL_GOV_OFFICER`·`ADMIN` 사용, 두 유형 모두 지역·자료 조회 제한 없음.** (T-19 '역할별 응답 필터링'은 원천 공개등급 처리 용도로만 유지)

### 2.3 공통 응답 봉투
```json
{
  "schema_version": "1.0",
  "request_id": "REQ-20260909-000311",
  "correlation_id": "corr-20260909-000311",
  "status": "SUCCESS",
  "result": { "...": "(API별 결과)" },
  "data_gaps": [ { "component": "rainfall", "reason": "SOURCE_NOT_COLLECTED" } ],
  "warnings":  [ { "code": "AGENT_TIMEOUT", "message": "…", "retryable": true } ],
  "meta": {
    "source": "T3Q",
    "base_time": "2026-09-09T09:00:00+09:00",
    "quality_status": "VERIFIED",
    "disclosure_level": "PUBLIC",
    "model_version": "agent-2026.09",
    "elapsed_ms": 4820
  }
}
```

### 2.4 status 값과 화면 처리
| status | HTTP | 의미 | UNE 화면 처리 (UFR-008-001-01/02) |
|---|---|---|---|
| `SUCCESS` | 200 | 정상 | 결과 표시 |
| `NO_RESULT` | 200 | 정상 처리, 0건 | "검색결과 0건 · 정상 빈결과", 조건 완화 안내 (오류 아님) |
| `DATA_NOT_AVAILABLE` | 200 | 원천에 없음(미구축·미수집) | "미제공" 상태 (오류 아님) |
| `PARTIAL_SUCCESS` | 200 | 일부 구성요소 실패·미수집 | 가능한 결과 + `data_gaps` 미확인 안내 |
| `FORBIDDEN` | 403 | 권한 없음(원문 비노출) | "접근권한 제한", Passage만/원문 비노출 |
| `TIMEOUT` | 504 | T3Q 처리시간 초과 | 상관ID + 재시도 버튼, 이전 성공 결과 유지 |
| `UPSTREAM_ERROR` | 502 | RAG·KG·Data 등 T3Q 내부 연계 실패 | 사용자 친화 메시지 + 운영로그, 재시도 |

오류 예시 — TIMEOUT:
```json
{
  "schema_version": "1.0", "request_id": "REQ-20260909-000330", "correlation_id": "corr-20260909-000330",
  "status": "TIMEOUT", "result": null, "data_gaps": [],
  "warnings": [ { "code": "AGENT_TIMEOUT", "message": "Agent 응답 시간이 초과되었습니다.", "retryable": true } ],
  "meta": { "source": "T3Q", "base_time": "2026-09-09T09:00:00+09:00", "quality_status": "VERIFIED", "disclosure_level": "PUBLIC", "elapsed_ms": 30000 }
}
```
UPSTREAM_ERROR(T3Q-08 판정 중 Rule 저장소 실패):
```json
{ "status": "UPSTREAM_ERROR", "result": null,
  "data_gaps": [ { "component": "risk_rule_store", "reason": "CONNECTION_FAILED" } ],
  "warnings": [ { "code": "RULE_STORE_UNAVAILABLE", "message": "위험조건 판정을 수행할 수 없습니다.", "retryable": true } ] }
```
FORBIDDEN(제한 등급 객체): `warnings:[{"code":"DISCLOSURE_RESTRICTED","message":"공무원 한정 정보입니다.","retryable":false}]`, `meta.disclosure_level:"RESTRICTED"`
DATA_NOT_AVAILABLE(관측 요약 미구축): `result:{"event_master_id":"…","rainfall":null,"water_level":null}`, `data_gaps:[{"component":"rainfall","reason":"SOURCE_NOT_COLLECTED"}, …]`

경고 코드(예시에 등장): `AGENT_TIMEOUT`, `RULE_STORE_UNAVAILABLE`, `DISCLOSURE_RESTRICTED`. data_gaps reason: `SOURCE_NOT_COLLECTED`, `CONNECTION_FAILED`. SLA·타임아웃·재시도(멱등성)·동시 사용자 한도는 T-08 회신 대기.

### 2.5 작성 규칙
| 항목 | 규칙 |
|---|---|
| 시각 | ISO 8601 + offset. 원천에 timezone 없으면 임의 변환 금지, `source_time_raw` 병기 |
| null vs 0 | null=미제공·미수집, 0=실제 값 0 |
| 금액·단위 | 필드명 접미사(`_krw_thousand`=천원) 또는 `unit` 필드. (2차 보완: 숫자·단위·설명문 분리, 표시용 문자열만 주지 말 것) |
| ID | `event_master_id`·`object_id` 등은 연결키. **UNE는 파싱하지 않음**(지역코드 세그먼트 제거 확정, 형식 T-24 미확정, 예 `T10107-20200723-0001`) |
| Geometry | 0917안: T3Q 응답에 좌표 미포함, `spatial_object_id`로 공간객체 조회 / pptx(10/03) 권고: 소수 위치점은 직접 포함, 큰 폴리곤·주제도는 참조 — 3사 협의 |
| 권한 | `caller.role` 기준 T3Q가 응답 범위 필터링, 권한 없는 원문 미반환 |
| current_status | 정비 완료 여부 모르면 `UNKNOWN`(LLM 추론 금지). `COMPLETED / IN_PROGRESS / PLANNED / UNKNOWN` |

### 2.6 코드값 (UNE 제안)
| 필드 | 값 |
|---|---|
| `question_source` | `USER_DIRECT` / `RECOMMENDED` / `USER_BRIEFING` (+ 제안: `AI_MODE_CHECK`) |
| `entry_point` | `CHAT_INPUT` / `RECOMMENDED_LIST` / `SEARCH_PANEL` / `HISTORY_RESUME` / `BRIEFING` (+ 제안: `ALERT_QUICK_QUERY`, `AI_MODE`) |
| `conditions[].source_type` | `MANUAL` / `REALTIME` / `CORRECTED`(original_value 동반) — v1.71: 실시간 자동반영 제외로 `MANUAL` 위주 |
| `entity_type` | `EVENT` / `RISK_AREA` / `RIVER` / `REACH` / `STATION` / `FACILITY` / `OBSERVATION_STATION` / `DOCUMENT` / `EVIDENCE` / `PLAN` / `MITIGATION` / `ADMIN_AREA` + 제안 `RISK_FACTOR`, `SHELTER` + 매뉴얼 제안 `process`, `response_task`(DQ-18-009) |
| `knowledge_types` | `PLAN_KNOWLEDGE` / `ACTUAL_EVENT` / `REALTIME_OBSERVATION` / `RULE_JUDGEMENT` |
| `data_nature` | `DESIGNATED` / `PLAN_KNOWLEDGE` / `DAMAGE_HISTORY` / `DERIVED` |
| `meta.disclosure_level` | `PUBLIC` / `INTERNAL` / `RESTRICTED` (⚠ 재난메타 PRV-05: 공개/제한공개/내부전용/비공개 4종과 대응 미확정) |
| `meta.quality_status` | `VERIFIED` / `UNDER_REVIEW` / `PROVISIONAL` |
| `answer_format` | `MARKDOWN` (허용 요소만 안전 렌더링) |

---

## 3. 엔드포인트 목록

| API | 이름 | 구분 | Method · Endpoint(예시) | 화면 사용처 | 근거 기능(구 FUN-UFR) | 우선 |
|---|---|---|---|---|---|---|
| T3Q-01 | Agent 질의 | Agent | `POST /v1/agent/query` (SSE 시 `response_mode:"STREAM"`) | 직접 질의·추천질문·조건 기반 질의·이력 이어서 질의 | 304002, 205005, 305001~305003, 405004 | P0 |
| T3Q-02 | 브리핑 순차 호출·취소 | Agent | `POST /v1/agent/query` · `POST /v1/agent/query/{request_id}/cancel` | 브리핑 실행·문항 상태·취소 | 303001~303006 | P1 |
| T3Q-03 | 역량질의 목록 | Agent | `GET /v1/capability-questions?region_admin_code=&disaster_types=&status=ACTIVE` | 추천질문(CQ 번호) — JSON/Excel 파일 대체 가능 | 304004, 205004 | P1 |
| T3Q-04 | 유사사례 검색 | Data | `POST /v1/similar-events/search` | 유사사례 카드 | 103002, 501001~501006 | P0 |
| T3Q-05 | 위험·취약 대상 목록 | Data | `POST /v1/risk-knowledge/search` | 위험·취약 탭(그룹 칩·카드) | 605003, 605006, 603001 | P0 |
| T3Q-06 | 계획문서 목록 | Data | `POST /v1/plans/search` | 하천·계획 탭, 하천 카드 계획 요약 | 607001 | P1 |
| T3Q-07 | 사건별 피해위치 목록 | Data | `GET /v1/events/{event_master_id}/damage-locations?page=&size=` | 피해·신고 탭, 피해위치 표 | 503001, 503004 | P1 |
| T3Q-08 | 위험조건 판정 | Data | `POST /v1/risk-areas/evaluate` | 조건 적용·판정, 판정결과 목록·배지 | 203006~203008 | P0 |
| T3Q-09 | 참조관측소 조회 | Data | `POST /v1/stations/search` | 조건 비교 '관측소 상이' 판단 | – | P1 |
| T3Q-10 | 사건 상세 | Data | `GET /v1/events/{event_master_id}` | 유사사례 개요 탭 | 601001, 501006 | P0 |
| T3Q-11 | 유사도 근거·요인별 기여도 | Data | `GET /v1/events/{event_master_id}/similarity?query_id=` | 요인별 기여도 막대·선정근거 | 504001~504004 | P0 |
| T3Q-12 | 사건 타임라인 | Data | `GET /v1/events/{event_master_id}/timeline` | 타임라인 탭(전·중·후·기타) | 601003~601005 | P0 |
| T3Q-13 | 피해·복구·요약보고서 | Data | `GET /v1/events/{event_master_id}/damage-recovery` | 피해·복구 탭(복구·민원·보험·요약보고서) | 602001, 602002, 602004 | P0 |
| T3Q-14 | 사례 당시 관측 요약값 | Data | `GET /v1/events/{event_master_id}/observations/summary` | 조건 비교 탭 사례값 | 504004 | P1 |
| T3Q-15 | 위험·취약 대상 상세 | Data | `GET /v1/risk-objects/{object_id}` | 위험·취약 상세 탭 | 603002, 604001, 606001~606003 | P0 |
| T3Q-16 | 하천 계획지식 | Data | `GET /v1/rivers/{river_id}/plan-knowledge` | 하천 상세(계획 요약·측점표·위험구간) | 603004, 603005 | P1 |
| T3Q-17 | 계획문서 상세 | Data | `GET /v1/plans/{plan_id}` | 계획문서 상세(위험지구 선정 단계) | 607001 | P1 |
| T3Q-18 | 객체관계 조회 | Data | `POST /v1/kg/query` | 관련 하천·대피장소·과거사건 칩 | 503006, 607002, 709002 | P0 |
| T3Q-19 | 근거 조회 | Data | `POST /v1/evidence/search` | 근거 칩, 근거 탭, 근거 뷰어 | 801001, 801002, 802001~802003 | P0 |
| T3Q-20 | 근거 원문 다운로드 | Data | `GET /v1/documents/{document_id}/file?user_role=` | 원문 다운로드(만료 URL 방식 예시) | 803001 | P1 |
| T3Q-21 | 원천 메타(lineage) | Data | `GET /v1/evidence/{evidence_ref}/lineage?user_role=VERIFIER` | 근거 뷰어 내부 검증모드(인가자만) | 801004 | P1 |
| T3Q-22·23 | 공통 규약 | 공통 | – | 헤더·봉투·status·오류·코드값 | – | P0 |
| T3Q-24 | 인터페이스 정의서·샘플·테스트 환경 | 공통 | – (OpenAPI/JSON Schema, 테스트 엔드포인트) | – | – | P0 |
| T3Q-25 | 대화 문맥 상태 조회 | Agent | `GET /v1/agent/conversations/{conversation_id}` · `POST /v1/agent/conversations/status` | 이력 목록·상세 [현재 세션/종료] 배지, 이어서 질의 방식 | 405001, 405004 | P1 |
| T3Q-26 | 참조 유효성 확인 | Data | `POST /v1/references/validate` | 이력 상세 근거 "미사용"/"갱신됨", 조건 복원 전 확인 | 405003, 405004, 405006 | P1 |
| T3Q-27 | 대화 문맥 삭제 | Agent | `DELETE /v1/agent/conversations/{conversation_id}` · `POST /v1/agent/conversations/purge` | 이력 삭제·보관기간 만료 일괄 삭제 | 405006, 404002 | P1 |

> 근거 기능 ID(FUN-UFR-xxxxxx)는 0917 당시 기능분해도 번호로, 시연 HTML의 FUN-UNE 번호와 체계가 다르다(01_requirements.md 참조).
> 1차 통합 제안: T3Q-07·10~14는 Event Bundle(`GET /v1/events/{id}/bundle`)로 묶어도 됨, T3Q-04+05는 1차 결과집합 통합 API로 제공해도 됨.
> v1.71 이후 변화: 조건 검색 후 목록 API 병행 → **Agent 결과 중심 표출 + 선택 객체 상세조회**로 전환(02 pptx). 따라서 T3Q-04/05/06(조건 기반 목록 검색)은 Agent 반환 ID 목록 재조회 용도로 축소될 가능성.

### 3.1 entity_type → 상세조회 라우팅 (공통규약 §8)
| entity_type | 조회 Data API | 상세패널 | 위치(공간) |
|---|---|---|---|
| `EVENT` | T3Q-10 (탭: T3Q-12 타임라인 · T3Q-13 피해·복구 · T3Q-07 피해위치 · T3Q-11 유사도 · T3Q-14 사례 관측) | GR-04, GR-05, GR-07 | 대표·영향 지역 ITK-02·03 |
| `RISK_AREA` · `FACILITY` · `RISK_FACTOR` | T3Q-15 (`object_group`으로 구분) | GR-10, GR-11, GR-12 | ITK-04 |
| `SHELTER` | T3Q-15 (제공처 확인필요 C-02) | GR-17·18 | – |
| `RIVER` | T3Q-16 | GR-13, GR-15 | ITK-10·11 |
| `REACH` · `STATION`(측점) | T3Q-16(`risk_sections`·`stations`) — 측점 ID만 받았을 때 상위 river_id 반환 필요(2차 보완) | GR-15 | ITK-12 |
| `OBSERVATION_STATION` | T3Q-09 | – | ITK-05 |
| `PLAN` | T3Q-17 | GR-14~16 | – |
| `MITIGATION` | 별도 상세 없음 — T3Q-15 attributes / T3Q-16 mitigation_measures | – | – |
| `DOCUMENT` · `EVIDENCE` | T3Q-19 (원문 T3Q-20, lineage T3Q-21) | GR-06 | – |
| `ADMIN_AREA` | T3Q 아님 — ITK-01·02 | – | ITK-01·02 |
| (모든 객체) 관련 객체 | T3Q-18 | 연관 객체 칩 | – |
| `process` · `response_task`(제안) | 매뉴얼 프로세스 상세(DQ-18-009-03 응답 계약 요청) | GR-17·18 | – |

---

## 4. QueryContext (요청)

### 4.1 0917 요청서 구조 (T3Q-01 `query_context`)
| 필드 | 타입 | 설명 |
|---|---|---|
| `query_id` | string | 조건 세트 ID (예 `QC-26090901-BSN`) |
| `reference_time` | datetime | 기준시각(ISO8601+09:00) |
| `region` | object `{admin_code, name, level}` | 기준지역. level: `SIDO`/`SGG`(/`EMD` 제안, 전국 제안 `NATION`) |
| `disaster_types` | string[] | 호우/홍수/침수/태풍/산사태 (다중) |
| `period` | object `{from, to}` | 발생기간 — **v1.71 필수**(년월일시 범위) |
| `alert_stage` | string\|null | 특보/경보 단계(예 `주의보`) |
| `keyword` | string\|null | 피해·통제 키워드 |
| `conditions[]` | object[] | `{condition_id, group, item, value, unit, observed_at, source_type, original_value?, station{code,name,agency}?}` — group: `기상·수문` / `잠재 위험·취약 단서` / `기타` |
| `judgement_ref` | object\|null | `{evaluation_id, rule_version, matched_risk_area_ids[]}` (T3Q-08 판정결과 인용) |

T3Q-01 최상위: `request_id`, `conversation_id`, `turn_no`, `question`, `question_source`, `entry_point`, `capability_question_id?`, `caller`, `query_context`, `selected_entities[{entity_type, entity_id}]`, `response_mode`(`SYNC`/`STREAM`), `resume?{resumed_from_history, context_mode(CURRENT|RESTORED), restored_from_turn}`, `conversation_history?{summary, recent_turns[]}`(Stateless 방식).

### 4.2 v1.71 반영 UNE 권장 요청 예시 (부산, 특보 빠른질의)
```json
{
  "request_id": "REQ-20261003-000101",
  "conversation_id": "CONV-20261003-0001",
  "turn_no": 1,
  "question": "현재 특보에서 우선 확인해야 할 위험·취약지역은?",
  "question_source": "RECOMMENDED",
  "entry_point": "ALERT_QUICK_QUERY",
  "caller": { "user_id": "U-2600-0007", "role": "LOCAL_GOV_OFFICER", "org_admin_code": "2600000000" },
  "query_context": {
    "query_id": "QC-20261003-BSN-01",
    "reference_time": "2026-10-03T09:00:00+09:00",
    "region": { "admin_code": "2600000000", "name": "부산광역시", "level": "SIDO" },
    "disaster_types": ["호우", "침수"],
    "period": { "from": "2026-10-03T00:00:00+09:00", "to": "2026-10-03T09:00:00+09:00" },
    "weather_alerts": [
      { "alert_type": "호우", "alert_level": "경보", "target_area": "부산", "announced_at": "2026-10-03T08:00:00+09:00",
        "effective_at": "2026-10-03T08:00:00+09:00", "status": "발효", "source": "기상청" }
    ],
    "alert_stage": "경보",
    "keyword": "지하차도 통제, 산책로 대피",
    "conditions": [
      { "condition_id": "c-r1", "group": "기상·수문", "item": "1시간 강우량", "value": 62, "unit": "mm",
        "observed_at": "2026-10-03T09:00:00+09:00", "source_type": "MANUAL", "station": null }
    ],
    "judgement_ref": null
  },
  "selected_entities": [],
  "response_mode": "SYNC"
}
```
> `weather_alerts`는 UNE 제안 필드(UFR-001-001-03/05: "기상청 API에서 조회한 특보정보와 기준지역·현재 조건을 Agent에 전달"). 0917안은 기상특보를 `conditions[]`의 `item:"기상특보"`로 표현 — 둘 중 하나로 T3Q와 확정 필요.

### 4.3 CQ v1.1 확장 제안 필드(참고, 미확정)
`schema_version`, `mode(scenario|realtime_context)`, `user_role`, `access_profile`, `region.sido_code/sigungu_code/geometry`, `weather.rain_1h_mm…rain_24h_mm/wind_ms/humidity_pct/alerts[]`, `hydrology.river_id/station_id/water_level_m/flow_m3s/trend/observed_at`, `tide.*`, `field_signals[]`, `risk_keywords[]`, `damage_keywords[]`, `control_keywords[]`, `selected_feature_refs[]`, `selected_realtime_observations[]`(⚠ v1.71 제외), `top_k`(기본 5), `include[]`, `client_context`, `business_cq_id`, `judgement_stage(예측|분석|대응|복구)`, `observation_context[]`, `requested_response_mode(fact|compare|relation|review_support)`, `client_ontology_version`.

---

## 5. AgentResponse (T3Q-01 응답 `result`)

| 필드 | 타입 | 설명 | 상태 |
|---|---|---|---|
| `response_id` | string | 응답 ID(브리핑 이력 재구성용, T-05) | 0917안 |
| `answer` | string | 최종 답변 | 0917안 |
| `answer_format` | enum | `MARKDOWN` | 0917안 |
| `knowledge_types` | string[] | PLAN_KNOWLEDGE / ACTUAL_EVENT / REALTIME_OBSERVATION / RULE_JUDGEMENT | 0917안 |
| `entities[]` | object[] | `{entity_type, entity_id, display_name, external_refs[{system, object_id}]}` — 챗 엔터티 | 0917안 (필수, T-07) |
| `related_events[]` | object[] | `{event_master_id, display_name, similarity_score?}` | 0917안 |
| `evidence_refs[]` | object[] | `{evidence_ref, document_id, passage_id, page, title}` (최소 document_id+page, T-16) | 0917안 |
| `limitations[]` | string[] | 계획값 기준시점·보정값 포함 등 한계 | 0917안 |
| `context_used` | object | `{used_condition_ids[], unused_condition_ids[], used_entity_ids[], judgement_ref_used, context_mode?}` (T-18) | 0917안 |
| `follow_up_questions[]` | object[] | `{question, entity_type?, entity_id?}` — 없으면 빈 배열(DQ-21-001, **필수 응답**) | 2차 요청 |
| `entity_links[]`(제안) | object[] | 답변 문장/표 셀 ↔ 엔터티 위치 연결(2차 보완 ⑥) | 2차 요청 |
| `tables[]`(제안) | object[] | 표·목록 구조화 데이터(UFR-006-001-07: 제공 형식·구조화 데이터에 한해 표출) | 요구사항 |
| `action_items[]`(제안) | object[] | 매뉴얼 대응절차 `{id, order, title, crisis_level?, actor?, evidence_ref}` (UFR-006-001-08, DQ-18-009) | 요구사항 |
| `similar_events[]`(CQ v1.1) | object[] | `{event_master_id, similarity_score, similarity_reasons[], factor_contributions[], summary}` | 참고 |
| `decision_support`(CQ v1.1) | object | `{type: retrieved_fact|rule_match|inference|review_support, official_decision:false}` | 참고 |
| `stage_levels`(CQ v1.1) | object | `{weather_alert_level, crisis_warning_level, response_stage}` 3종 분리 | 참고 |
| `used_tools[]`·`runtime_versions`·`trace_id`(CQ v1.1) | – | Tool trace(No CoT)·버전·추적 ID | 참고(운영로그) |

### 5.1 응답 예시 (01-A 직접 질의, 요약)
```json
{
  "schema_version": "1.0", "request_id": "REQ-20260909-000311", "correlation_id": "corr-20260909-000311",
  "status": "SUCCESS", "conversation_id": "CONV-20260909-0012", "turn_no": 3,
  "result": {
    "response_id": "RES-20260909-000311",
    "answer": "온천천 하천기본계획(변경, 2020)의 측점별 계획홍수위·제방고 표에 따르면 **No.11~No.14 구간(연제구 연산동 좌안)** 이 기준여유고 1.0m에 미달합니다. …(계획 기준 · 현행화 여부 미확인).",
    "answer_format": "MARKDOWN",
    "knowledge_types": ["PLAN_KNOWLEDGE"],
    "entities": [
      { "entity_type": "RIVER", "entity_id": "RV-2201110", "display_name": "온천천", "external_refs": [ { "system": "RIMGIS", "object_id": "2201110" } ] },
      { "entity_type": "RISK_AREA", "entity_id": "RA-BSN-01", "display_name": "온천천 하류 침수위험지구(A-03)", "external_refs": [] },
      { "entity_type": "RISK_FACTOR", "entity_id": "RK-BSN-03", "display_name": "RK-03 제방고 부족 — 온천천 No.11~No.14", "external_refs": [] }
    ],
    "related_events": [],
    "evidence_refs": [
      { "evidence_ref": "EV-B2", "document_id": "DOC-B2", "passage_id": "PSG-B2-0312-01", "page": "p.312", "title": "온천천 하천기본계획(변경) 보고서 (2020, 지방하천)" },
      { "evidence_ref": "EV-B1", "document_id": "DOC-B1", "passage_id": "PSG-B1-04112-03", "page": "p.4-112", "title": "부산광역시 자연재해저감종합계획(2021.12) 본보고서" }
    ],
    "limitations": ["계획값(2020 기준) — 현재 제방 상태·정비 진행 여부는 미확인", "보정값(3시간 118mm) 포함 조건에서 응답"],
    "context_used": { "used_condition_ids": ["c-r3", "c-v2"], "unused_condition_ids": ["c-r1", "c-r12", "c-wl", "c-alert", "c-v1", "c-k1"], "used_entity_ids": ["RA-BSN-01"], "judgement_ref_used": false },
    "follow_up_questions": [ { "question": "이 구간의 계획상 저감대책과 사업비는?", "entity_type": "RISK_AREA", "entity_id": "RA-BSN-01" } ]
  },
  "data_gaps": [], "warnings": [],
  "meta": { "source": "T3Q", "base_time": "2026-09-09T09:00:00+09:00", "quality_status": "VERIFIED", "disclosure_level": "PUBLIC", "model_version": "agent-2026.09", "elapsed_ms": 4820 }
}
```
(`follow_up_questions`는 2차 요청 DQ-21-001 반영 예시로 UNE가 추가)

### 5.2 SSE 스트리밍 (01-E, T-04 미확정)
```
POST /v1/agent/query   (response_mode: "STREAM")
Content-Type: text/event-stream; charset=utf-8

event: meta   data: {"request_id":"…","correlation_id":"…","conversation_id":"…","turn_no":3}
event: token  data: {"delta":"온천천 하천기본계획(변경, 2020)의 …"}
… (token 반복)
event: final  data: {동기 응답(5.1)과 동일한 전체 JSON — 한 줄 직렬화}
event: done   data: {}
```
취소: 연결 종료 또는 `POST /v1/agent/query/{request_id}/cancel` → `cancel_result: CANCELLED | ALREADY_COMPLETED | NOT_FOUND`.

### 5.3 AI 모드 상황점검 (UFR-001-001-05, DQ-03-001·DQ-03-002 — 응답 구조 미확정, UNE 제안)
요청: T3Q-01과 동일, `question`=고정 점검 질의문(요구사항 원문), `question_source:"AI_MODE_CHECK"`(제안), `query_context.weather_alerts[]` 포함. 점검 시점: AI 모드 실행 시, 특보 발표·변경·해제 시, 기본 10분 주기.
```json
{
  "result": {
    "response_id": "RES-…",
    "check": {
      "request_id": "CHK-20261003-0901", "region": { "admin_code": "2600000000", "name": "부산광역시" },
      "reference_time": "2026-10-03T09:00:00+09:00",
      "needs_review": true, "review_type": "상황확인", "official_decision": false,
      "per_alert_guidance": [
        { "alert_type": "호우", "alert_level": "경보", "guidance": "(2문장·80자 내외 안내)" }
      ],
      "priority_checks": ["…"], "missing_info": ["현재 강우·수위 관측값 미제공"],
      "evidence": [ { "entity_type": "EVENT", "entity_id": "T10107-20200723-0001", "evidence_ref": "EV-B3" } ]
    },
    "entities": [], "evidence_refs": [], "follow_up_questions": []
  }
}
```
특보가 없으면 과거 사례·위험지역 언급 없이 "대응 검토 사유 미확인" 점검 결과만(2문장). AI 모드 추천질의는 T3Q가 아니라 **UNE 사전 정의 브리핑 질의** 사용.

---

## 6. Data API 응답 요지 (예시 필드)

| API | 요청 | `result` 핵심 필드 |
|---|---|---|
| T3Q-02 브리핑 | T3Q-01과 동일, `question_source:"USER_BRIEFING"`, `entry_point:"BRIEFING"`, 직전 응답 후 순차 전송 | T3Q-01과 동일. 1회 최대 문항 수·문항별 상태 전달 방식은 T-06 회신 대기 |
| T3Q-03 역량질의 | query: region_admin_code, disaster_types, status | `capability_set_version`, `items[{capability_question_id, question_text, status, required_entity_types[], data_domains[], schema_refs[]}]` — v1.71: 일반대화 추천은 DQ-144로 대체, AI 모드는 UNE 프리셋 |
| T3Q-04 유사사례 | `query_id`, `query_context{reference_time, region, disaster_types, period, alert_stage, keyword}`, `conditions[]`, `page{page,size}` | `total_count`, `items[{event_master_id, display_name, disaster_types[], lifecycle_status, started_at, ended_at, source_timezone, similarity{rank, score, scale:"0~1", algorithm_version}, reasons[], representative_admin_area{admin_code,name}, damage_summary{dead, missing, injured, evacuee_households, evacuee_persons, damage_amount_krw_thousand, damage_amount_basis}, linked_counts{damage_locations, risk_areas, rivers, evidence}, satellite_available, response_summary}]` — 0건은 `NO_RESULT`. ※ v1.71 최초 목록은 사건명+유사도만 표출 |
| T3Q-05 위험·취약 목록 | `region{admin_code,level}`, `object_groups[RISK_AREA, FACILITY, RISK_FACTOR, OBSERVATION_FACILITY, SHELTER]`, `subtypes`, `keyword`, `page` | `total_count`, `group_counts{}`, `items[{object_id, spatial_object_id, object_group, subtype, name, disaster_type, grade{value, status(PROVIDED|NOT_PROVIDED)}, data_nature, address, admin_code, key_condition{label,value}, plan_reference{plan_id, base_date, survey_year}, current_status{status, as_of, source}, disclosure_level}]` |
| T3Q-06 계획문서 목록 | `region`, `river_codes[]`(ITK-10 하천 목록에서), `plan_types[]`, `page` | `items[{plan_id, plan_type, scope_type(ADMIN_AREA|RIVER), name, agency, target_area, target_admin_codes, target_rivers[{river_code, spatial_object_id, river_name}], plan_period{from,to}, base_year, approval{date,text}, version, other_versions[], linked_risk_area_count, performance_target, river_plan_summary{design_frequency_yr, design_flood_cms, reference_station_no}, knowledge_type, current_status}]`, `river_codes_without_plan[]` |
| T3Q-07 피해위치 | path: event_master_id | `items[{damage_location_id, spatial_object_id, year, address, admin_code, facility_type, damage_type, summary, quantity{value,unit}, damage_amount_krw_thousand, recovery{type, progress_pct}, aggregation_status(CONFIRMED|PROVISIONAL), source, evidence_ref}]` (권한 없으면 상세주소 마스킹) |
| T3Q-08 위험조건 판정 | `query_id`, `reference_time`, `target_scope{admin_code, level}`, `conditions[]` | `evaluation_id`, `rule_version`, `evaluated_at`, `summary{matched, not_matched, undetermined}`, `matched_risk_area_ids[]`, `rules[{rule_id, risk_area_id, risk_area_name, variable, operator, threshold, unit, input_value, input_condition_id, input_source(UNE_CONDITION|T3Q_OBSERVATION), result(MATCHED|NOT_MATCHED|UNDETERMINED), undetermined_reason(CONDITION_NOT_APPLIED|MISSING_VALUE|UNIT_MISMATCH), evidence_ref}]`, `logic[{risk_area_id, combine(AND|OR), rule_ids[]}]` — UNE는 임계값 비교·대체계산 안 함. ⚠ v1.71 01 시트에는 판정 전용 요구사항 행이 없음(v1.54 변경기록에 '위험지역 비교·판정 내용 반영' 언급, 0917 목업 기능) — 사용 여부 확인 필요 |
| T3Q-09 참조관측소 | `object_ids[]`, `rule_ids[]` | `items[{object_id, stations[{station_code, station_name, agency, measurements[WATER_LEVEL, FLOW], relation_type:"MONITORED_BY", relation_basis, evidence_ref}]}]` |
| T3Q-10 사건 상세 | path | `event_master_id, display_name, disaster_types[], lifecycle_status, time_profile{started_at, ended_at, source_timezone, source_time_raw{start,end}}, representative_admin_area, affected_admin_areas[], crisis_alert{level_path[], changed_at}, cdb_stage, response_summary, damage_summary{…, facilities{public,private}, flooding{houses, shops}}, linked_counts, satellite_available, evidence_refs[]` |
| T3Q-11 유사도 근거 | path + `query_id` | `similarity{score, rank, scale, algorithm_version}, factors[{factor, contribution}](합 1.0), similarity_reasons[], explanation_path[{source_id, relation_type, target_id, evidence_ref}], disclaimer:"유사도는 위험도·발생확률이 아님"` — **2차 보완: 요인별 현재값/과거값/단위/일치도/가중치(DQ-04-003·DQ-04-004) 필수 추가 요청** |
| T3Q-12 타임라인 | path | `items[{seq, occurred_at, source_time_raw, time_precision(MINUTE|DATE|NONE), phase(BEFORE|DURING|AFTER|OTHER), category, description, agency, source_dataset, collection_status(COLLECTED|REQUESTED), record_type(ACTUAL|PLAN_RECOMMENDATION), evidence_ref}]` |
| T3Q-13 피해·복구 | path | `damage{human{dead,missing,injured}, evacuees{households,persons}, facilities, flooding, damage_amounts[{basis(CENTRAL_CONFIRMED|LOCAL_REPORTED), amount_krw_thousand, status}]}, recovery{costs[{basis,total,national,local}], types{restoration, improvement}, progress_pct, completed_at, actions[]}, complaints{total, repeat, deidentified}, insurance{claims, amount_krw_thousand, basis}, summary_report{report_id, title, blocks[{type(heading|paragraph|list), text|items, evidence_ref}]}` — 일부 미수집 시 `PARTIAL_SUCCESS` |
| T3Q-14 사례 관측 요약 | path | `observation_period{from,to}, rainfall{station{code,name,agency}, unit, max_1h, max_3h, max_12h, max_24h, max_1h_at}, water_level{station, unit, max_level, max_level_at}, calculation_basis{}` — 같은 누적시간·같은 관측소일 때만 비교 |
| T3Q-15 위험·취약 상세 | path: object_id | T3Q-05 항목 + `grade.basis`, `attributes[{key, label, importance(5/4/3), value, evidence_ref}]`, `plan_reference{plan_id, plan_name, base_date, survey_year}`, `evidence_refs[]` — **2차 보완: 값을 숫자·단위·설명으로 분리, 유형별 이력 배열(급경사지 지정·평가·점검·사업, 지하차도 설비 등)** → 항목 정의는 02 문서 |
| T3Q-16 하천 계획지식 | path: river_id | `river_code, river_name, plan{plan_id, name, agency, notice{date,number}, plan_period, probable_rainfall[{duration, value_mm, return_period_yr}], design_flood{value_cms, station_no, return_period_yr}, freeboard_required_m, vertical_datum}, stations[{station_no, design_flood_cms, design_flood_level_elm, levee_left_elm, levee_right_elm, freeboard_m, freeboard_ok}], facilities, management_state, risk_sections[{risk_factor_id, name, station_range}], mitigation_measures[], knowledge_type, current_status, evidence_refs[]` |
| T3Q-17 계획문서 상세 | path: plan_id | T3Q-06 항목 + `linked_risk_area_ids[]`, `selection_stages[{stage(예비후보지|후보지|위험지구|관리지구), count}]` — 2차: 위험지구별 분석표·투자우선순위·침수심별 면적 등(DQ-14-003~005·DQ-14-007~010·DQ-14-012~014·DQ-15-002·DQ-15-004~005·DQ-15-008~009·DQ-16-002·DQ-16-004~006·DQ-16-008·DQ-21-001) |
| T3Q-18 객체관계 | `source_ids[]`, `relation_types`, `depth:1` | `nodes[{id, entity_type, name}]`, `edges[{source_id, relation_type(RELATED_RIVER|HAS_RISK_FACTOR|PAST_EVENT|EVACUATES_TO…), target_id, relation_basis(DOCUMENT_STATED|DATA_LINKED), evidence_ref, status, valid_from}]` — 좌표근접·명칭일치 관계 미제공 |
| T3Q-19 근거 | `evidence_refs[]` 또는 `object_id`, `include_passage`, `page` | `items[{evidence_ref, document_id, passage_id, title, document_type, agency, published_at, version, page, table, passage, quote_type(DIRECT_QUOTE|SUMMARY), ocr_status, disclosure_level, download_allowed, related_object_ids[]}]` |
| T3Q-20 원문 | path + `user_role` | `document_id, file_name, content_type, size_bytes, sha256, download_url, expires_at` / 제한 시 403 `DISCLOSURE_RESTRICTED`. 다운로드 이벤트 로그는 UNE 기록 |
| T3Q-21 lineage | path + `user_role=VERIFIER` | `source_data_id, source_metadata{dataset, original_file, ingested_at, source_version, checksum}, lineage[{step, process(PDF_PARSE|TABLE_STRUCTURING|HUMAN_REVIEW), tool, version, processed_at}]` — 일반 역할은 FORBIDDEN |
| T3Q-25 대화 상태 | path / `conversation_ids[]` | `context_mode(STATEFUL), context_status(ACTIVE|EXPIRED|NOT_FOUND), last_turn_no, last_activity_at, expires_at, context_idle_timeout_hours(예 24), resume_requirement(SEND_CONVERSATION_HISTORY)` |
| T3Q-26 참조 유효성 | `conversation_id`, `evidence_refs[]`, `entities[]`, `rule_version` | `checked_at, evidence[{evidence_ref, status(VALID|SUPERSEDED|DELETED|FORBIDDEN), current_ref, reason}], entities[…], rule{rule_version, status, current_rule_version}, summary{valid, superseded, deleted, forbidden}` — 화면: DELETED·FORBIDDEN="미사용", SUPERSEDED="갱신됨" |
| T3Q-27 문맥 삭제 | `reason(USER_REQUEST|RETENTION_EXPIRED)` | `delete_result(DELETED|NOT_FOUND), deleted_at, deleted_items[context, turn_cache]` — NOT_FOUND도 UNE 삭제 계속 |

### 6.1 유사사례 응답 예시 (T3Q-04, 1건)
```json
{
  "event_master_id": "T10107-20200723-0001",
  "display_name": "2020.07.23 호우(부산)",
  "disaster_types": ["호우", "침수"],
  "lifecycle_status": "CLOSED",
  "started_at": "2020-07-23T18:00:00+09:00", "ended_at": "2020-07-24T03:00:00+09:00", "source_timezone": "+09:00",
  "similarity": { "rank": 1, "score": 0.87, "scale": "0~1", "algorithm_version": "SIM-2026.08" },
  "reasons": ["동일 특보단계(호우경보)", "시우량 유사(81.6mm vs 62mm)", "도심 지하차도·반지하 침수"],
  "representative_admin_area": { "admin_code": "2617000000", "name": "부산광역시 동구" },
  "damage_summary": { "dead": 3, "missing": 0, "injured": 0, "evacuee_households": 116, "evacuee_persons": 178, "damage_amount_krw_thousand": 21700000, "damage_amount_basis": "CENTRAL_CONFIRMED" },
  "linked_counts": { "damage_locations": 38, "risk_areas": 9, "rivers": 3, "evidence": 6 },
  "satellite_available": true,
  "response_summary": "초량 제1지하차도 사후 통제 · 온천천 산책로 통제 · CBS 12건 송출 · 배수펌프 42대 가동"
}
```

### 6.2 유사도 근거 + 영향요인 비교 (T3Q-11 + 2차 요청 DQ-04-003·DQ-04-004, UNE 통합 제안)
```json
{
  "event_master_id": "T10107-20200723-0001", "query_id": "QC-26090901-BSN",
  "similarity": { "score": 0.87, "rank": 1, "scale": "0~1", "algorithm_version": "SIM-2026.08" },
  "factors": [ { "factor": "기상수문", "contribution": 0.42 }, { "factor": "공간취약", "contribution": 0.25 }, { "factor": "피해", "contribution": 0.18 }, { "factor": "대응", "contribution": 0.15 } ],
  "factor_comparisons": [
    { "factor_group": "기상·수문", "factor_name": "1시간 강우량",
      "current": { "condition_id": "c-r1", "value": 62, "unit": "mm", "reference_time": "2026-09-09T09:00:00+09:00", "source_type": "MANUAL" },
      "past": { "value": 81.6, "unit": "mm" },
      "match": { "value": 0.76, "scale": "0~1", "match_class": "근접" },
      "weight": 0.4, "evidence_refs": ["EV-B8"] }
  ],
  "weight_scheme": { "disaster_type": "호우", "factor_weights": { "기상·수문": 0.4, "공간·취약": 0.25, "피해": 0.2, "대응": 0.15 }, "version": "SIM-2026.08" },
  "similarity_reasons": ["동일 특보단계(호우경보)", "시우량 유사(81.6mm vs 62mm)"],
  "explanation_path": [ { "source_id": "QC-26090901-BSN", "relation_type": "SAME_ALERT_STAGE", "target_id": "T10107-20200723-0001", "evidence_ref": "EV-B8" } ],
  "disclaimer": "유사도는 위험도·발생확률이 아님"
}
```

### 6.3 매뉴얼 대응절차 상세 (DQ-18-009-03 응답 계약 요청, 제안 구조)
```json
{
  "manual": { "id": "MAN-BSN-FLOOD-2607", "title": "(부산) 풍수해 재난 현장조치 행동매뉴얼", "jurisdiction": "부산광역시", "version": "26.7.6.", "verification_status": "검토필요" },
  "process": { "id": "PRC-BSN-01", "name": "부산시 재난대응 프로세스", "source_table_id": "PDF40-44" },
  "phases": [ { "id": "P1", "order": 1, "name": "징후감지", "crisis_levels": ["관심", "주의"] }, { "id": "P2", "order": 2, "name": "초기대응", "crisis_levels": ["주의"] } ],
  "tasks": [ { "id": "T-6-1", "source_number": "[6-1]", "phase_id": "P2", "title": "상황판단 및 대책회의", "action_type": "회의", "instruction_kind": "normative" } ],
  "actors": [ { "id": "A-01", "name": "시민안전실장", "type": "직위" } ],
  "conditions": [ { "id": "C-01", "text_raw": "호우주의보", "parse_status": "PARSED" } ],
  "task_relations": [ { "id": "R-01", "type": "REPORT_TO", "from_ref": "구·군", "to_ref": "재난안전상황실", "task_id": "T-6-7" } ],
  "task_links": [],
  "evidence": [ { "id": "E-01", "pdf_page": 40, "printed_page": 34, "source_number": "[6-1]", "quote": "…" } ],
  "quality": { "status": "검토필요", "conflicts": ["표별 지원부서 수 차이(QC-02)"] }
}
```
규칙: 프로세스 단계·위기수준·비상근무 단계 별도 필드, normative/recommended/observed 구분, 자동 발동규칙·명령 생성 금지, PDF쪽/인쇄쪽 혼용 금지, 원문번호는 유일키 아님.

---

## 7. 공간정보 API (아이타이쿤 협의서 I-01~I-11 / T3Q Spatial)

| ID | 요청 | 필수 필드 |
|---|---|---|
| I-01 | 공간객체 공통 조회(EPSG:4326, 결정론적) | `spatial_object_id, object_type(RIVER/REACH/STATION/RISK_AREA/FACILITY/OBSERVATION_STATION/ADMIN_AREA), name, 코드, admin_code·주소, crs=EPSG:4326, geometry(Point~MultiPolygon, GeoJSON), bbox[minX,minY,maxX,maxY], representative_point{coordinates, method, derived}, geometry_status, source, as_of, 공개등급` |
| I-02 | 행정구역 Geometry(시도→시군구→읍면동 계층) | `admin_code, 코드체계(법정동/행정동/시군구), 상위 코드, geometry, bbox, (구축 시) event_impact_geometry` |
| I-03 | 하천 검색 색인 | `spatial_object_id, name, river_code, river_type(국가/지방/소하천), 통과 시군구 코드(법정관리 vs 물리적 공간 구분), source_id(RIMGIS 등)` |
| I-04 | 하천 형상(시군구 단위) | 실폭하천·하천경계·소하천구역 Polygon + 대표 Point 별도 |
| I-05 | 주제도 | Polygon + 속성 함께 |
| I-08 | Geometry 상태 | `geometry_status: SOURCE_CONFIRMED / DERIVED / BBOX_ONLY / NOT_AVAILABLE`, 누락 사유, `method=BBOX_CENTER_FALLBACK` |
| I-10 | 정의서·샘플·테스트 환경 | 스키마·샘플 JSON·ID 규칙·미보유 처리 예시 |
| I-11 | T3Q Entity ID ↔ spatial_object_id | 동일 ID 우선, 다르면 `external_refs[{system(T3Q_AGENT/RIMGIS/행정구역코드), object_id}]` + 역조회 |

0917 요청서에서 쓰인 ITK 번호: ITK-01·02(행정구역), ITK-03(영향지역), ITK-04(위험·취약 대상), ITK-05(관측소 위치), ITK-06(피해위치), ITK-10(기준지역 하천 목록), ITK-11(하천 형상), ITK-12(구간·측점 좌표).
연결 상태값(pptx): 연결 완료·미연결·복수 후보 — 미연결은 정상 상태로 전달, 지구명 분석에 의한 임의 매칭 금지. GeoJSON은 WGS84 [경도, 위도] 순서.

---

## 8. 기상특보 (UNE 직접 연계)
- 공공데이터포털 기상청: **기상특보 조회서비스 · 특보구역정보 조회서비스 · 특보 조회 서비스**.
- 조회 주기 기본 1분(운영설정), 기준지역 해당 특보 우선, 발표·변경·해제 반영, **특보 미발효 vs 조회 실패 구분**, 최종 갱신시각 표시.
- 결과는 화면 표시(특보바·AI 모드) + `query_context.weather_alerts[]`로 Agent에 전달. 필드 정의는 02 문서 `weather_alert_current`.

---

## 9. UNE 연계중계서버(BFF) 권장 라우트 (Next.js 구현 제안, UNE 내부)
| UNE 라우트(제안) | 프록시 대상 | 비고 |
|---|---|---|
| `POST /api/agent/query` (+`/stream`) | T3Q-01 | request_id/correlation_id 발급, 추적로그(UFR-008-001-03), 질의 마스킹 저장 |
| `POST /api/agent/query/:requestId/cancel` | T3Q-02 cancel | 브리핑 취소 |
| `POST /api/briefings/:presetId/run` | T3Q-01 × N 순차 | 프리셋 관리·실행 이력은 UNE DB |
| `GET /api/events/:id[/timeline|/damage-recovery|/similarity|/observations|/damage-locations]` | T3Q-10~14, 07 | Event Bundle로 대체 가능 |
| `GET /api/objects/:entityType/:id` | entity_type 라우팅표(§3.1) | 상세패널 공통 진입 |
| `POST /api/relations` | T3Q-18 | |
| `POST /api/evidence` · `GET /api/documents/:id/file` | T3Q-19 · T3Q-20 | 다운로드 로그 |
| `POST /api/spatial/objects` | I-01/T3Q Spatial | 객체 ID 목록 일괄 공간조회 |
| `GET /api/weather-alerts?region=` | 기상청 API | 1분 캐시 |
| `GET/PATCH/DELETE /api/conversations…` | UNE DB + T3Q-25/26/27 | 본인 이력만 |
| `/api/admin/accounts…`, `/api/admin/logs…` | UNE DB | 운영자 전용 |

---

## 10. 미확정·확인 요청 사항 (T3Q 회신 필요)
1. **전 항목 미회신**: T-01~T-25, 2차 회신표 417건, 데이터 구축회신 327행. OpenAPI/샘플/테스트 엔드포인트(T-21/T3Q-24) 제공 시점 미정.
2. **대화 방식**: Stateful(conversation_id, 만료 예 24h) vs Stateless(conversation_history 상한) — T-02/T-03.
3. **전송 방식**: REST vs SSE(final 이벤트 스키마) — T-04.
4. **SLA·타임아웃·재시도·동시 사용자** — T-08.
5. **event_master_id 정식 형식**(T-24), 대표/영향지역 별도 제공(T-25).
6. **공간정보 경로**: T3Q 직접 포함 / 참조(ITK) / 혼합 — 3사 협의.
7. **공개등급 코드** 3종↔4종 대응, `caller.role` 코드의 v1.71 2유형 정리.
8. **기상특보 전달 필드**(`weather_alerts[]` vs `conditions[item=기상특보]`).
9. **T3Q-08 판정의 `input_source=T3Q_OBSERVATION`**(T3Q 자체 관측값 사용) 허용 여부(C-04) — v1.71 관측 자동반영 제외와 충돌 가능.
10. **SHELTER 제공처**(C-02), MITIGATION 단독 상세 필요 여부, 측점 ID→상위 river_id 반환.
11. 2차 보완 6건: ① 요구사항·회신표·API 항목 추적 ② 숫자·단위 구조화 ③ 유형별 항목·복수 이력 ④ 계획자료 상세표 ⑤ 유사도 비교값·산정근거 ⑥ 답변 대상↔조회키 명시 연결.
