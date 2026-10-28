# 기존 가정 계약 ↔ 실제 T3Q v0.3.0 차이

> 비교 대상
> - **기존(가정)**: `app/src/lib/contract/agent.ts`(Mock·화면이 쓰는 camelCase zod 계약) · `docs/analysis/00_api_contract.md`(0917 요청서 기반 «추정·정리본»)
> - **실제**: T3Q 소스 v0.3.0 — 상세는 `t3q_contract.md`, 타입 `t3q_types.ts`/`t3q_schemas.ts`
> 근거 줄 번호는 T3Q 리포 기준.

## 1. 큰 그림

| 항목 | 기존 가정 | 실제 T3Q | 화면 영향 |
|---|---|---|---|
| 필드 표기 | camelCase(`sessionId`, `blocks`, `followUps` …) — agent.ts | snake_case 봉투 그대로 | **BFF 에 어댑터 계층 필수**(T3Q 원형 → 화면 모델) |
| 답변 구조 | `blocks[]`(headline·facts·narrative·actions·results·similar·timeline·rainChart·notice·briefing) — agent.ts:127-171 | **마크다운 글 `answer` 한 덩어리 + `refs[]`** (agent.py:137-141) | 블록형 답변 UI 는 Agent 응답만으로 못 채움 → ① 마크다운 렌더러 + `#ref:` 칩 ② 구조 블록은 Data API 로 따로 조회해 만들거나 포기 |
| 응답 시간·방식 | SYNC(+ SSE `STREAM` 미확정) — 00 §5.2 | 1~6분, **ASYNC 202 + 3초 폴링**, SSE 없음 (agent.py:84-117, 설명서 §4) | 로딩 UX(경과 시간·취소 버튼), 폴링 상한·재시도, 서버 재시작 시 유실 처리 |
| 봉투 버전 | `schema_version: "1.0"` — 00 §2.3 | `"2.0"` (envelope.py:25) | 검증 리터럴 변경 |
| status | 7종 | 7종 + **`PROCESSING`(202)**. `FORBIDDEN` 은 사용처 없음 | 상태 처리 표에 PROCESSING 추가 |
| `meta.disclosure_level` | `PUBLIC`/`INTERNAL`/`RESTRICTED` | 늘 **`"공개"`**(한글) (envelope.py:83) | enum 검증 제거 |
| `meta.model_version` | 있음 | **없음** | 표시 제거 |
| 권한 필터 | `caller.role` 로 응답 범위 필터, FORBIDDEN | **없음**(role 미사용) (catalog.py:81-82) | 권한 제어는 우리 쪽 |
| 지역 | `RegionId` enum `national·busan·yeongcheon·inje` + `sigungu`/`emd` 문자열 — agent.ts:8,19-21 | `region{admin_code(법정동 10자리), name, level SIDO/SIGUNGU/EMD}` (common.py:24-28) | 지역 선택값 → 법정동코드 매핑표 필요(부산 2600000000 등). «전국» 은 region 생략 |
| 재난유형 | 단일 `disasterType` enum(+ "전체") | `disaster_types: string[]`(한글), 유사도는 첫 항목만 | "전체" = 빈 배열. 배열로 변환 |
| 좌표 | `EntityRef.lon/lat`, `DetailResponse.geometry` | 응답에 좌표 없음. `refs[].map{key,value}`·`spatial_object_id` → **EXT-01** 로 GeoJSON | 지도 레이어가 2단계(답 → 도형 조회). 근사 정밀도(`dong_center` 등) 표기 필요 |
| 대화 문맥 | stateful, `conversation_history`, `resume` | `conversation_id` 저장만, **Agent 에 이전 대화 미전달**(agent.py:45-51). 24시간 EXPIRED | «이어서 질문» 은 질문 글에 맥락을 우리가 넣어야 함 |

## 2. 요청 필드 대응 (T3Q-01)

| 기존(agent.ts `AgentRequest`/`QueryContext`) | 실제 | 비고 |
|---|---|---|
| `sessionId` | `conversation_id`(null 이면 서버 생성) + `turn_no` | 첫 응답(최종 결과)에서 받는다. 202 응답엔 없음 |
| `question`(≤2000) | `question`(1..4000) | 화면은 2000 유지 |
| `presetKey` | `question_source`(`SUGGEST`·`QUICK`·`BRIEFING`·`AI_MODE`…) + `briefing{…}`·`quick_query_id`·`ai_mode{…}` | 키 체계 재정의 |
| `context.region/sigungu/emd` | `query_context.region{admin_code,name,level}` | 코드 변환 |
| `context.disasterType` | `query_context.disaster_types[]` | |
| `context.baseTime` / `endTime` | `query_context.reference_time` / `period{from,to}` | |
| `context.hydro{rain1h…waterLevel}` | `query_context.detail.conditions[{item:RAIN_1H…, value, unit, source_type:"MANUAL"}]` | **유사도에 쓰이지 않음**(warning CONDITION_NOT_USED). `rainTotal`·`waterStation`·`tide` 대응 코드 없음 |
| `context.keywords` | `query_context.detail.keywords` | |
| `context.situationKind{type,level}` / `advisory` | `query_context.detail.warning_kind/warning_level` | 유사도 미사용 |
| `context.aiMode` / `prevCheckAt` | `question_source:"AI_MODE"` + `ai_mode{check_id, trigger, interval_min, prompt_id}` | prevCheckAt 대응 없음 |
| `context.refAdvisory` / 발효 특보 | 최상위 `weather_warnings{collect_status, items[]}`(검증 없음) | 우리 기상청 연계 결과를 그대로 전달 |
| `context.refEntity` | `reference`(dict, 서버 해석 없음) | 형태 자유 |
| `context.mode`(scenario/live)·`scenarioId` | **없음** | BFF 내부 개념으로 유지 |
| 00 문서 `entry_point`·`selected_entities`·`capability_question_id`·`query_id`·`alert_stage`·`judgement_ref`·`resume`·`conversation_history` | **없음**(보내도 무시 — extra allow) | 송신에서 제거 |

## 3. 응답 필드 대응 (T3Q-01 `result`)

| 기존 | 실제 | 상태 |
|---|---|---|
| `requestId` / `answeredAt` | 봉투 `request_id` / `meta.base_time`(Agent 는 응답 시각) | 이름만 다름 |
| `intent` / `interpretation` / `requestEcho` | **없음** | 정합성 검증 화면 근거 상실 → 우리 요청 로그로 대체 |
| `status`(ok/partial/clarify/error) | 봉투 `status`(T3qStatus) | clarify 없음 |
| `title`(대화 제목) | `conversation_title` **늘 null** | 첫 질문 앞부분으로 우리가 생성 |
| `blocks[]` | `answer`(MARKDOWN) | **사라짐** |
| `entities[]`(EntityRef: type/id/name/lon/lat/metric/level) | `refs[]{ref, entity_type, display_name, map{key,value,draw}}` + `entities[]`(통과, 사실상 빈 배열 ⚠) | id·category·metric·level·좌표 없음. refs 는 지도용 키만 |
| 본문 토큰 `{{e:id}}` | 마크다운 링크 `[이름](#ref:rN)` | 렌더러 교체 |
| `citations[]` | `evidence_refs[]`(통과, 사실상 빈 배열 ⚠) | 근거 칩 없음 → T3Q-19 로 별도 조회(대상 ID 를 알아야 함) |
| `followUps[]` | `follow_up_questions[]`(통과, 사실상 빈 배열 ⚠) | 후속 질문은 T3Q-03 고정 목록 또는 우리 프리셋 |
| `mapFocus` / `focusEntity` | **없음** — refs 전체가 지도 대상 | |
| `error{code,message}` | 봉투 `status` + `warnings[]` + `data_gaps[]` | |
| `trace{apis,datasets,elapsedMs}` | `meta.elapsed_ms` 만 | |
| (00) `knowledge_types`·`related_events`·`context_used` 상세 | 없음 / `context_used` 고정 빈 값 | |
| (00 §5.3) AI 모드 `check{needs_review, per_alert_guidance, priority_checks, missing_info}` | `check_id`·`checked_at`·`region` + `priority_review:null`·`warning_guides:[]`·`info_gaps:[]` — **판단은 answer 글에만** | AI 모드 알림 카드(특보별 안내)를 구조로 못 만듦 → 글 표시 |
| (00) 브리핑 문항 `summary`·`count`·`status` | `briefing_item{item_status, summary:null, count:null}` | 브리핑 카드의 건수·요약 칸 비움 → 글 또는 Data API(T3Q-05 count)로 |
| (agent.ts `actions` 블록) 행동매뉴얼 | `manual:null, action_items:[]` + gap `manual NOT_IN_SOURCE` | **행동매뉴얼 화면 데이터 없음** |
| — (신규) | `response_id`(평가 키), `answer_format`, `limitations`(고정), `refs[]` | 평가(T3Q-31)·지도 칩에 사용 |

## 4. 엔드포인트 차이

| API | 기존 가정 | 실제 | 영향 |
|---|---|---|---|
| T3Q-03 | `GET /v1/capability-questions` 역량질의 목록 | `GET /v1/suggested-questions` 고정 6문항(`question_id, group, text, data_api`) | 지역 무시. 추천 질문은 우리 프리셋 중심 |
| T3Q-07 피해위치 · 08 위험조건 판정 · 09 참조관측소 · 14 사례 관측 · 21 lineage · 26 참조 유효성 | 경로·필드 정의 | **없음** | 판정 배지·관측 비교·이력 «갱신됨» 표시 불가 |
| T3Q-11 | `GET …/similarity?query_id=` | **`POST`** `/v1/events/{id}/similarity` + 본문 `query_context`/`reference_event_id` | 메서드 변경 |
| T3Q-11 결과 | `factors[{factor, contribution}]`(합 1.0), `scale "0~1"`, 요인군 4(기상수문·공간취약·피해·대응) | `scale "0~100"`, `contributions[{factor_group, contribution_points, contribution_pct}]` + `factors[]` 상세(current/past/match/weight_used), 요인군 5(재난유형 포함), **«대응» 원천 없음** | 기여도 막대 재설계, 점수 스케일 변경 |
| T3Q-04 | `similarity.score 0~1`, `reasons[]`, `damage_summary`, `linked_counts`, `satellite_available`, `response_summary` | `score 0~100`, `coverage` 추가 / reasons·피해 요약·linked_counts·위성 **없음**, `has_geometry` 늘 false | 유사사례 카드는 이름·기간·점수·대표지역만 |
| T3Q-13 | `/damage-recovery`, 천원 단위, 복구율·민원·보험·요약보고서 | `/damage-response`(+`/reports` 미제공), **원 단위**, 공공·사유시설 집계·복구비, 대응 조치 없음 | 단위 변환 제거, 탭 축소 |
| T3Q-12 | `phase`(전·중·후)·`collection_status`·`source_dataset` | 없음. `category`(특보/재난문자)·`elapsed_hours`·`relation_basis: TIME_REGION_OVERLAP` | 단계 구분 탭 불가, «중첩 기반» 안내 필요 |
| T3Q-05 | `object_groups[]`(5종)·`subtypes`·`keyword`, `group_counts{}`, `key_condition`·`plan_reference`·`current_status` | `data_group`(2종)·`categories[]`, `category_counts[]`, 위 3개 칸 없음 | 그룹 칩 2종 + 분류 이름 |
| T3Q-15 | `attributes[{importance}]`, `plan_reference`, `w4` | `risk.attributes[{key,label,value,evidence_ref}]`, `basis.related_plans`, 지정사유·예상피해 null | «어디/왜/언제/무엇» 중 «왜» 비어 있음 |
| T3Q-16 | `risk_sections`·`mitigation_measures`·`freeboard_ok`·`current_status` | 앞 둘 빈 배열(NOT_YET_BUILT), `freeboard_ok:null`, `freeboard_m` 은 계산값 | 여유고 «미달» 판정 표시 불가(값만) |
| T3Q-17 | `selection_stages[]`, `linked_risk_area_ids[]` | `type_specific_items[]`(label/value 표), HZP 는 샘플 20개, 본문 없음 | |
| T3Q-18 | relation_type `RELATED_RIVER·HAS_RISK_FACTOR·PAST_EVENT·EVACUATES_TO`, `valid_from` | `HAS_SOURCE_DOCUMENT·PLAN_TARGET_RIVER·TRIBUTARY_OF·PLAN_LISTED_ZONE`, 사건↔위험지구 없음 | 관련 객체 칩 범위 축소 |
| T3Q-19 | `passage`·`DIRECT_QUOTE` | 인용 문단 없음 — `TITLE_ONLY`·`AGGREGATE_ONLY`(피해 집계 표) | 근거 뷰어는 «문서명·쪽» 수준 |
| T3Q-20 | 만료 URL 다운로드 | 늘 DATA_NOT_AVAILABLE | 원문 보기 비활성 |
| T3Q-25 | `POST …/conversations/status` 일괄, `resume_requirement: SEND_CONVERSATION_HISTORY` | 단건 GET만, `NEW_CONVERSATION_OR_SEND_HISTORY` | |
| T3Q-28·29·30·31·32~36 | 일부 미정의 | 28·29 = 같은 `/v1/agent/query`, 30 침수흔적 제공, 31 평가 제공, 32~36 늘 DATA_NOT_AVAILABLE | 미제공 탭은 «원천 없음» 상태로 |
| 공간정보 | ITK(아이타이쿤) I-01~I-11 / T3Q Spatial 협의 중 | T3Q **EXT-01** `POST /v1/spatial-objects/geometry`(≤300건, GeoJSON) | 지도 BFF 라우트 1개로 통합 가능 |
| 결과 조회 | — | **EXT-02** `GET /v1/agent/query/{request_id}` | 폴링 라우트 신설 |

## 5. 우리 쪽에서 해야 할 일 (화면 영향 요약)

1. **어댑터**: T3Q snake_case 봉투 → 화면 모델. Mock(`/api/agent/*`)도 실제 꼴(봉투 2.0, `answer`+`refs`)로 바꿔 두 경로를 같은 어댑터에 태운다.
2. **답변 렌더러**: 블록 렌더러 → 안전한 마크다운 + `#ref:rN` 칩(refs 에 없는 표지는 일반 글). T3Q 시험 화면 방식 참고(index.html:318-333).
3. **ASYNC 흐름**: 접수(202) → 3초 폴링 → 완료/취소/NOT_FOUND/상한 초과. 첫 턴 완료 전 후속 질문 잠금(conversation_id 를 결과에서야 받음).
4. **지도**: refs·spatial_object_id → EXT-01 → GeoJSON. `SL-`/`LS-`/`UP-` 는 키 변환(`toGeoItem`, t3q_schemas.ts). 근사 정밀도 표기.
5. **구조 데이터는 Data API 로**: 유사사례(04·10·11·12·13), 위험·취약(05·15), 하천·계획(06·16·17), 침수흔적(30), 근거(19) — 모두 LLM 없이 결정론.
6. **빈 칸 처리**: 브리핑 건수, AI 모드 특보별 안내, 행동매뉴얼, 근거 문단, 원문, 위성·119·민원·대피·침수지도 속성 — «원천 없음/구축 전» 표기(`data_gaps.reason` 한글화: NOT_IN_SOURCE=원천에 없음, NOT_YET_BUILT=구축 전 — index.html:176).
7. **송신 정리**: 기존 가정 필드(`entry_point`, `selected_entities`, `query_id`, `alert_stage`, `judgement_ref`, hydro 의 대응 없는 칸) 제거. 서버가 무시하므로 오류는 안 나지만 오해 소지.
