# 02. T3Q 상세정보조회 항목 정의 (Detail-view item definitions)

> 기준: `T3Q_Agent_API_상세정보조회_2차검토회신표.xlsx` (2차 검토회신표 **155개 조회묶음 / 417개 세부요청**) + 상세기능요구사항정의서 v1.71(02·03 시트) + 패널활용예시 v1.71 + 1차 API 요청서(0917) 예시값.  
> 기계가독 버전: [`02_t3q_detail_items.json`](./02_t3q_detail_items.json) (동일 내용 + linkKey·legacyApiRef·requirements·note 전체).

## 0. 핵심 사항 (먼저 읽기)

| 구분 | 내용 |
|---|---|
| **T3Q 회신 상태** | 2차 검토회신표의 T3Q 회신 열(N~S: 제공여부·확정 API/필드·자료형·연결키·제공시점·의견)은 **전부 공란**. 1차 회신의 임의 필드명은 확정 명세로 이관되지 않음. → 전 항목 `t3qStatus = 미회신(회신대기)` |
| **설계 가정** | 프로젝트 지시에 따라 **T3Q가 417개 항목 모두 제공한다고 가정**(`assumedProvided: true`). UI는 항목별 미제공 상태(빈값·미구축·연계실패)를 표시할 수 있게 설계 |
| **응답 요청 기준** | `필수 응답`(T3Q 필수, 미제공=연계 미이행) / `원천값 요청`(원천값 그대로) / `추가 협의`(방식 미정) |
| **key/dtype/example** | UNE 제안값(snake_case). 예시값은 부산 seed·원문 이미지 기반 **가상/인용금지** |
| **화면 구조** | 목록카드(4그룹) → 상세패널 16개(DP-01~16) + AI-01. 챗엔터티 클릭 → `대상유형 + 대상 ID (+문서·구간 연결키)`로 T3Q 상세조회 → 패널(기본정보 / 세부내용 / 근거·제공상태) |
| **제외/변경** | 현재 관측값 자동조회·반영 제외(v1.71). 로그인 사용자·조직관리·이메일/문자 발송 데이터는 UNE 범위로 T3Q 상세조회 대상 아님. 사용자 유형별 조회 제한 신설하지 않음 |

## 1. 목록카드 ↔ 상세패널 구조 (v1.71 02 시트)

| 목록그룹 | 포함 데이터유형 | 목록카드 핵심항목 | 기본 상세 | 연결 상세 |
|---|---|---|---|---|
| 유사재난 사례 | 재난사건 ID, 유사도·선정근거 | 사건명·재난유형·발생기간·대표지역·유사도 (최초 목록=사건명+유사도) | DP-01 | DP-11~16 |
| 법정·계획상 위험·취약지역 | 재해위험지구·홍수취약지구·급경사지·붕괴위험지역·산사태취약지역·재해위험저수지 등 | 명칭·분류·유형·행정구역·지정/위험속성 | DP-02 | DP-13, 15, 16 |
| 잠재 위험요소·취약시설 | 지하차도·지하공간·반지하·캠핑장·산지숙박·협착구간·저형고 교량 등 | 명칭·분류·유형·행정구역·시설/위험속성 | DP-03, DP-04 | DP-12, 13, 16 |
| 계획지식 | 자연재해저감종합계획·하천기본계획·소하천정비종합계획 | 계획유형·계획명/문서명·대상지역·수립기간·요약/Passage | DP-06, 07, 08 | DP-05, 13, 16 (+명시 연결된 DP-02~04) |

| 패널 | 구분 | 대상 | 연결 조건 |
|---|---|---|---|
| DP-01 | 기본 | 재난사건(유사재난 사례) | 재난사건 ID 선택 → 기본정보·유사도 근거 + **영향요인 비교표·요인별 기여도·유사도 산정기준(필수, TER-004)** |
| DP-02 | 기본 | 법정·계획상 위험·취약지역 | 객체 ID 선택 → 지정·위험·관리정보 |
| DP-03 | 기본 | 취약시설 | 시설·위험·관리정보 |
| DP-04 | 기본 | 잠재 위험요소 | 위험속성·연계정보 |
| DP-05 | 연계 | 하천·소하천 | 계획지식에 하천 ID/공간식별자가 명시된 경우만 |
| DP-06 | 기본 | 자연재해저감종합계획 | 계획·문서 ID → 계획내용·Passage |
| DP-07 | 기본 | 하천기본계획 | 계획·문서 ID → 계획내용·Passage |
| DP-08 | 기본 | 소하천정비종합계획 | 계획·문서 ID → 계획내용·Passage |
| DP-09 | 조건입력 보조 | 기상관측·기상특보 | 독립 목록 없음. 기상·수문 수동입력, 특보는 API·AI 모드 |
| DP-10 | 조건입력 보조 | 수위·유량·홍수특보·댐방류 | 독립 목록 없음. 관측값 자동반영 제외 |
| DP-11 | 연계 | 사건 이력(타임라인·피해·대응·복구·보고서 요약) | 선택 사건의 세부정보가 있는 경우 |
| DP-12 | 연계 | 대피시설·행동매뉴얼 | 명시적 연관 객체 ID가 있는 경우만 |
| DP-13 | 공통 | 근거문서·출처메타 | 근거 참조정보가 있는 답변·객체·계획지식 |
| DP-14 | 공통 | 위성영상 | 영상정보가 있는 사건 → 비교뷰어 |
| DP-15 | 공통 지도 | 침수흔적도 | 공간·관계정보가 있는 경우 주제레이어+속성 |
| DP-16 | 공통 지도 | 공간객체 공통메타 | 모든 지도 객체(목록·지도·상세 연결) |
| AI-01 | AI 모드 안내 | 기상특보·Agent 점검결과 | 특보·안내·근거·추천질의 → 대화 연결 |

## 2. 객체유형별 항목 요약

| # | type | 라벨 | DP | 항목 수 | 원천 데이터셋(요약) |
|---|---|---|---|---|---|
| 1 | `similar_event` | 유사재난 사례(재난사건 기본·유사도) | DP-01 | 23 | 재난메타 v0.96 · 재해대장·상황보고·위기경보 발령이력(사건 연결) · T3Q 유사도 산정(TER-004) |
| 2 | `risk_area_common` | 법정·계획상 위험·취약지역(공통) | DP-02 | 21 | 20260930 취약지역: 지정·평가·정비계획 자료 (지역_재해위험·자연재해저감종합계획 위험지구 등) |
| 3 | `disaster_risk_reservoir` | 재해위험저수지(위험저수지) | DP-02 | 8 | SRC-102 재해위험저수지_정비계획(tb_dstr_risk_rsrvr_mtnc_plan) · 위험저수지.geojson |
| 4 | `steep_slope_collapse_area` | 급경사지·붕괴위험지역 | DP-02 | 13 | SRC-074~081·105 급경사지정보/붕괴위험지역지정/안전점검/일제조사서/재해위험도평가/정비사업/준공도서 (NDMS) · 붕괴위험지역.geojson |
| 5 | `landslide_vulnerable_area` | 산사태·토석류 취약지역 | DP-02 | 6 | SRC-084 산사태_취약지역_지정현황(tb_ldsl_vlnara_dsgn) |
| 6 | `flood_vulnerable_district` | 홍수취약지구 | DP-02 | 10 | SRC-099·100 26년_홍수취약지구_리스트/지정 · SRC-101 홍수취약지구_관리카드 |
| 7 | `disaster_improvement_district` | 자연재해위험개선지구·풍수해생활권(풍수해개선지구) | DP-02 | 3 | SRC-103·104 자연재해위험개선지구 중기계획('26~'30)·풍수해생활권종합정비 · 풍수해개선지구.geojson |
| 8 | `casualty_risk_area` | 인명피해우려지역 | DP-02 | 2 | SRC-110 지역_인명피해우려 · SRC-325 인명피해우려지역(별도) |
| 9 | `isolation_expected_area` | 고립예상지역 | DP-02 | 4 | SRC-112·113 지역_고립예상_지정/대책 |
| 10 | `habitual_flood_area` | 상습침수지역 | DP-02 | 4 | SRC-132·133 상습침수지역_전체주소_필지기준 / 위험지구지정_예방사업_취합(tb_chflar_dsrprjt_prst) |
| 11 | `local_disaster_risk_district` | 지역 재해위험지구 | DP-02 | 3 | SRC-108·109 지역_재해위험지구 / 지역_재해위험지구_안전점검 |
| 12 | `vulnerable_facility_common` | 잠재 위험요소·취약시설(공통) | DP-03 | 17 | 20260930 원시데이터목록: 지하차도·건축물·야영장·대피시설 |
| 13 | `underpass` | 지하차도 | DP-03 | 14 | SRC-135~138 지하차도 차단시설/대피시설/담당자/관리제외현황(별도·비공개) |
| 14 | `building_underground_space` | 건축물 지하공간(반지하 포함) | DP-03 | 8 | 건축물대장 · GIS건물일반집합정보 (아이타이쿤 9월 적재 예정) |
| 15 | `campsite_mountain_lodging` | 캠핑장/야영장·산지인접 숙박시설 | DP-03 | 5 | SRC-139 문화_일반야영장업(tb_gnrl_ldg_fclt) |
| 16 | `riverside_parking` | 둔치주차장 | DP-03 | 1 | 20260930 둔치주차장 |
| 17 | `risk_factor` | 잠재 위험요소·위험구간 | DP-04 | 15 | 20260930 취약지역 / 하천·시설 원천 및 T3Q 판단기준 |
| 18 | `river` | 하천·소하천(기본/공간정보) | DP-05 | 18 | SRC-127·128·129·310·311·313~315 하천망도·국가기본도 하천·권역/유역 · SRC-106 소하천구역 · 하천기본계획 |
| 19 | `plan_disaster_reduction` | 계획지식: 자연재해저감종합계획(위험지구·저감대책) | DP-06 | 32 | SRC-064·065 자연재해저감종합계획(광역·시군구 보고서) · (참고)문서형태 이미지1~6 · NIA 이미지(3)(4) |
| 20 | `plan_river_basic` | 계획지식: 하천기본계획 | DP-07 | 24 | SRC-067 RIMGIS_하천정비기본계획보고서 · (참고)문서형태 이미지7~11 |
| 21 | `river_risk_section` | 하천 위험요소·위험구간(하천기본계획) | DP-07 | 5 | 하천기본계획 (20260930 취약지역!3행) |
| 22 | `plan_small_river` | 계획지식: 소하천정비종합계획 | DP-08 | 20 | SRC-068 소하천정비 종합계획(시군구, HWP→MD 정형화) · (참고)문서형태 이미지12~15 |
| 23 | `event_damage_response` | 재난사건 이력: 피해·대응·복구·보고 | DP-11 | 21 | 20260930 원시데이터목록: 상황보고·재해대장·피해/복구 (SRC-026~059 등) |
| 24 | `event_crisis_alert` | 재난사건 이력: 위기경보 발령·해제 | DP-11 | 4 | SRC-009~013 재난유형별_위기경보(대국민_통합발령·산사태예보발령 등) |
| 25 | `event_emergency_message` | 재난사건 이력: 긴급재난문자 송출 | DP-11 | 4 | SRC-001·002 긴급재난문자·재난문자(과거 송출이력) |
| 26 | `disaster_ledger` | 재해대장/피해·복구(피해시설 단위) | DP-11 | 4 | SRC-035·040~044·056~063 재해대장(복구/응급복구/피해산출)·복구확정 피해내역·풍수해보험금 |
| 27 | `civil_report_history` | 민원·안전신고 처리이력 | DP-11 | 5 | 20260930 원시데이터목록: 민원·안전신고(소방 신고와 구분) |
| 28 | `event_observations` | 과거 사건 당시 기상·수문 관측 | DP-11 | 3 | 20260930 원시데이터목록: 06. 기상수문환경 (기상청·홍수통제소·댐 등) |
| 29 | `shelter_evacuation` | 대피시설·대피/행동절차 | DP-12 | 16 | SRC-141·143·146~151 통합대피소·민방위대피소·수용시설·임시주거시설 · 위기관리/풍수해 매뉴얼 |
| 30 | `response_manual_process` | 풍수해 현장조치 행동매뉴얼 대응 프로세스 | DP-12 | 23 | (부산) 풍수해 재난 현장조치 행동매뉴얼(26.7.6.) PDF28~29·39·40~44·266~282 |
| 31 | `evidence_document` | 근거문서·원문(Passage) | DP-13 | 14 | 재난메타 v0.96 · 계획·보고·매뉴얼 원문(정형화 MD, 페이지/표 주석) |
| 32 | `satellite_imagery` | 위성영상(재난 전·중·후) | DP-14 | 13 | SRC-234~239 Sentinel-1(SAR)/Sentinel-2(광학) PRE·EVENT·POST (구축: 쓰리디랩스) |
| 33 | `flood_trace` | 침수흔적도(과거 침수기록) | DP-15 | 9 | SRC-069~073 침수흔적도(tb_indtmp)·심선·위선·보고서 |
| 34 | `flood_hazard_map` | 하천범람지도·도시침수지도 | DP-15 | 3 | SRC-089~096 홍수위험지도정보제공포털 하천범람·도시침수지도 |
| 35 | `spatial_object_common` | 공간객체 공통메타(모든 지도 객체) | DP-16 | 9 | 20260930 공간자료 및 각 유형별 원천의 객체·좌표 메타 (아이타이쿤 적재) |
| 36 | `fire_emergency_report` | 소방 신고·긴급구조정보(사건 연관) | FIRE | 24 | SRC-FIRE 소방긴급구조정보(표준).xls (예시 200행, 활용 확정·T3Q 구축 예정) |
| 37 | `ai_mode_check` | AI 모드 상황점검 응답 | AG | 5 | UNE 전달 기준지역·기준시각·기상특보 + T3Q 구축데이터·매뉴얼 |
| 38 | `follow_up_questions` | 일반대화 후속 추천질문 | AG | 1 | T3Q Agent 응답 부가정보 |
| 39 | `detail_common` | 상세조회 공통 응답(식별·제공상태·출처) | COMMON | 3 | 모든 상세조회 응답 |
| 40 | `weather_alert_current` | 기상특보 현황(현재, 기준지역) | DP-09 / AI-01 | 9 | 기상청 기상특보 조회서비스·특보구역정보 조회서비스·특보 조회 서비스(공공데이터포털) — UNE 직접 호출(기본 1분 주기, 운영설정) |

## 3. 객체유형별 필드 정의

열: `reqId`(회신표 세부요청 ID) · `key`(제안) · 한국어 라벨(원문) · `dtype` · 예시 · 기준(응답 요청 기준) · T3Q 회신상태. 비고(요청 내용·단위·확인사항)는 JSON `note` 참조.

### DP-01 · 유사재난 사례(재난사건 기본·유사도) — `similar_event`

- 원문 조회대상: **유사재난 사례** · 원천: 재난메타 v0.96 · 재해대장·상황보고·위기경보 발령이력(사건 연결) · T3Q 유사도 산정(TER-004)
- 조회·연결 식별자: 재난사건 ID + 질의/검색 결과 식별자
- 관련 요구사항: UFR-002-001-01, UFR-002-001-03, UFR-002-002-01, UFR-003-001-01, UFR-003-001-03, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-001-01 | `event_name` | 사건명 | string | 2020.07.23 호우(부산) | 필수 응답 | 미회신(회신대기) |
| DQ-001-02 | `disaster_types` | 재난유형 | enum[] (호우 | 홍수\|침수\|태풍\|산사태)\|["호우","침수"] | 필수 응답 | 미회신(회신대기) |
| DQ-001-03 | `occurrence_period` | 발생기간 | object{started_at,ended_at,source_timezone,source_time_raw}… | {"started_at": "2020-07-23T18:00:00+09:00", "ended_at": "20… | 원천값 요청 | 미회신(회신대기) |
| DQ-001-04 | `representative_admin_area` | 대표 행정구역 | object{admin_code,name} | {"admin_code": "2617000000", "name": "부산광역시 동구"} | 원천값 요청 | 미회신(회신대기) |
| DQ-001-05 | `affected_admin_areas` | 영향 행정구역 | array<object{admin_code,name}> | [{"admin_code": "2623000000", "name": "부산진구"}, {"admin_code… | 원천값 요청 | 미회신(회신대기) |
| DQ-002-01 | `similarity` | 유사도 점수·순위 | object{score,rank,scale,algorithm_version} | {"score": 0.87, "rank": 1, "scale": "0~1", "algorithm_versi… | 필수 응답 | 미회신(회신대기) |
| DQ-002-02 | `selection_reasons` | 핵심 선정근거 | string[] | ["동일 특보단계(호우경보)", "시우량 유사(81.6mm vs 62mm)", "도심 지하차도·반지하 침수… | 필수 응답 | 미회신(회신대기) |
| DQ-002-03 | `factor_contributions` | 요인별 기여도 | array<object{factor_group,factor,contribution}> | [{"factor": "기상수문", "contribution": 0.42}, {"factor": "공간취약… | 필수 응답 | 미회신(회신대기) |
| DQ-003-01 | `lifecycle_status` | 사건 생애주기 상태 | enum (발생 | 진행\|종료 등; 예시 CLOSED)\|CLOSED | 원천값 요청 | 미회신(회신대기) |
| DQ-003-02 | `crisis_alert_stage` | 위기경보·대응단계 | object{level_path[],changed_at,cdb_stage} | {"level_path": ["경계", "심각"], "changed_at": "2020-07-23T22:0… | 원천값 요청 | 미회신(회신대기) |
| DQ-004-01 | `damage_summary` | 피해 요약 | object{dead,missing,injured,evacuee_households,evacuee_pers… | {"dead": 3, "missing": 0, "injured": 0, "evacuee_persons": … | 원천값 요청 | 미회신(회신대기) |
| DQ-005-01 | `response_summary` | 대응 요약 | string | 초량 제1지하차도 사후 통제 · 온천천 산책로 통제 · CBS 12건 송출 · 배수펌프 42대 가동 | 원천값 요청 | 미회신(회신대기) |
| DQ-006-01 | `linked_location_counts` | 관련 위치 수 | object{damage_locations,risk_areas,rivers} | {"damage_locations": 38, "risk_areas": 9, "rivers": 3} | 원천값 요청 | 미회신(회신대기) |
| DQ-006-02 | `linked_evidence_count` | 근거문서 수 | integer | 6 | 원천값 요청 | 미회신(회신대기) |
| DQ-006-03 | `event_master_id` | 재난사건 식별자 | string (opaque, 파싱 금지) | T10107-20200723-0001 | 필수 응답 | 미회신(회신대기) |
| DQ-006-04 | `source_quality_status` | 출처·품질상태 | object{source,processing_status,quality_status} | {"source": "NDMS 재해대장", "quality_status": "VERIFIED"} | 원천값 요청 | 미회신(회신대기) |
| DQ-098-01 | `factor_name_group` | 영향요인명·요인군 | object{factor_group(기상·수문 | 공간·취약\|피해\|대응),factor_name}\|{"factor_group":"기상·수문","facto… | 필수 응답 | 미회신(회신대기) |
| DQ-098-02 | `current_condition_value` | 현재조건 입력값 | object{condition_id,value,unit,reference_time,source_type} | {"condition_id": "c-r3", "value": 118, "unit": "mm", "refer… | 필수 응답 | 미회신(회신대기) |
| DQ-098-03 | `past_case_value` | 과거사례 값 | object{value,unit} | {"value": 202.6, "unit": "mm"} | 필수 응답 | 미회신(회신대기) |
| DQ-098-04 | `factor_unit` | 단위 | string | mm | 필수 응답 | 미회신(회신대기) |
| DQ-098-05 | `factor_match` | 요인별 일치도 | object{value,scale,match_class(일치 | 근접\|상이),basis}\|{"value":0.72,"scale":"0~1","match_class":"… | 필수 응답 | 미회신(회신대기) |
| DQ-098-06 | `weight_scheme` | 재난유형별 가중치·산정버전 | object{factor_weights{},score_scale,algorithm_version} | {"factor_weights": {"기상·수문": 0.4, "공간·취약": 0.25, "피해": 0.2,… | 필수 응답 | 미회신(회신대기) |
| DQ-099-01 | `factor_evidence` | 요인 근거·출처 | array<object{factor,evidence_ref,source_type(document | record\|observation),passage_id}>\|[{"factor":"3시간 누적강우","e… | 필수 응답 | 미회신(회신대기) |

### DP-02 · 법정·계획상 위험·취약지역(공통) — `risk_area_common`

- 원문 조회대상: **위험지역** · 원천: 20260930 취약지역: 지정·평가·정비계획 자료 (지역_재해위험·자연재해저감종합계획 위험지구 등)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06, UFR-004-001-02, UFR-004-002-01, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-007-01 | `risk_area_name` | 위험지역명 | string | 온천천 하류 침수위험지구(A-03) | 필수 응답 | 미회신(회신대기) |
| DQ-007-02 | `risk_area_type` | 위험지역 유형 | enum (자연재해저감계획 위험지구 | 개선지구\|급경사지\|산사태\|홍수취약\|인명피해우려\|고립예상 등)\|자연재해저감종합계획 위험지구 | 필수 응답 | 미회신(회신대기) |
| DQ-007-03 | `hazard_type` | 재해유형 | enum (내수 | 하천\|사면\|토사\|해안 등)\|하천재해 | 원천값 요청 | 미회신(회신대기) |
| DQ-007-04 | `risk_grade` | 위험등급 | object{value,grade_system,status(PROVIDED | NOT_PROVIDED),basis}\|{"value":"위험도 2등급","status":"PROVIDED… | 원천값 요청 | 미회신(회신대기) |
| DQ-007-05 | `address_admin` | 주소·행정구역 | object{address,admin_code} | {"address": "부산광역시 연제구 연산동·거제동 온천천 좌안 일원", "admin_code": "2… | 원천값 요청 | 미회신(회신대기) |
| DQ-007-06 | `spatial_boundary` | 공간경계 | object{geometry_type(Point | LineString\|Polygon\|대표점),spatial_object_id}\|{"geometry_ty… | 원천값 요청 | 미회신(회신대기) |
| DQ-008-01 | `designation_reason` | 지정사유 | string | 계획홍수위 대비 여유고 0.48m(기준 1.0m) 미달 구간(No.11~No.14) · 2014·2016·… | 원천값 요청 | 미회신(회신대기) |
| DQ-008-02 | `designation_notice_no` | 지정번호·고시번호 | object{designation_no,notice_no} | {"designation_no": "A-03", "notice_no": "(원천 고시번호)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-008-03 | `designation_notice_date` | 지정일·고시일 | object{designated_on,noticed_on} (date) | {"designated_on": "2021-12-28", "noticed_on": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-009-01 | `area_length` | 면적·연장 | object{value,unit} | {"value": 12.4, "unit": "ha"} | 원천값 요청 | 미회신(회신대기) |
| DQ-009-02 | `key_risk_condition` | 핵심 위험조건 | object{text,as_of} | {"text": "계획홍수위 대비 여유고 0.48m", "as_of": "2020"} | 원천값 요청 | 미회신(회신대기) |
| DQ-009-03 | `expected_damage` | 예상 피해내용 | string (원문 근거) | 주택 480동 · 상가 120동 · 인구 1,900명 침수 우려 | 원천값 요청 | 미회신(회신대기) |
| DQ-009-04 | `risk_score_detail` | 위험도 세부점수 | object{items[{name,score}],total,grade_basis} | {"total": 78, "items": [{"name": "위험요인", "score": 32}, {"na… | 원천값 요청 | 미회신(회신대기) |
| DQ-010-01 | `planned_project_info` | 계획상 정비사업 정보 | object{content,source_status,base_date} (현재상태 아님) | {"content": "온천천 하도 준설 및 좌안 제방 보강 L=1.2km", "base_date": "2… | 원천값 요청 | 미회신(회신대기) |
| DQ-010-02 | `project_name_content` | 정비사업명·내용 | object{name,content} | {"name": "온천천 하도정비", "content": "하도 준설 및 좌안 제방 보강 L=1.2km"} | 원천값 요청 | 미회신(회신대기) |
| DQ-010-03 | `project_period_cost` | 사업기간·사업비 | object{period,cost{value,unit},breakdown[],basis(계획 | 집행)}\|{"period":"2023~2027","cost":{"value":12400,"unit":"백… | 원천값 요청 | 미회신(회신대기) |
| DQ-010-04 | `planned_priority_status` | 계획상 우선순위·원문 상태 | object{priority,status_raw,as_of} | {"priority": "투자우선순위 2위", "status_raw": "계획", "as_of": "202… | 원천값 요청 | 미회신(회신대기) |
| DQ-011-01 | `managing_agency` | 관리기관 | object{agency,department} | {"agency": "부산광역시", "department": "재난대응과"} | 원천값 요청 | 미회신(회신대기) |
| DQ-011-02 | `related_rivers_plans` | 관련 하천·계획 | array<object{river_code,document_id,relation_basis}> | [{"river_code": "2201110", "document_id": "DOC-B2", "relati… | 원천값 요청 | 미회신(회신대기) |
| DQ-011-03 | `related_past_events` | 과거 사건·피해위치 | object{count,event_ids[]} | {"count": 1, "event_ids": ["T10107-20140825-0001"]} | 원천값 요청 | 미회신(회신대기) |
| DQ-011-04 | `source_evidence` | 원문 근거 | array<object{document_id,page,table,passage_id}> | [{"document_id": "DOC-B1", "page": "p.4-112", "table": "표 4… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 재해위험저수지(위험저수지) — `disaster_risk_reservoir`

- 원문 조회대상: **재해위험저수지** · 원천: SRC-102 재해위험저수지_정비계획(tb_dstr_risk_rsrvr_mtnc_plan) · 위험저수지.geojson
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-077-01 | `reservoir_risk_grade` | 위험등급 | string (정밀안전진단 등급) | D | 원천값 요청 | 미회신(회신대기) |
| DQ-077-02 | `completion_year` | 준공연도 | integer | 1965 | 원천값 요청 | 미회신(회신대기) |
| DQ-077-03 | `dam_specs` | 제당 길이·높이·저수량 | object{length_m,height_m,storage_m3} | {"length_m": 120, "height_m": 12.5, "storage_m3": 150000} | 원천값 요청 | 미회신(회신대기) |
| DQ-077-04 | `residents_at_risk` | 인명피해 우려주민수 | integer (명) | 35 | 원천값 요청 | 미회신(회신대기) |
| DQ-077-05 | `house_distance_m` | 주택 이격거리 | number (m) | 150 | 원천값 요청 | 미회신(회신대기) |
| DQ-077-06 | `eap_established` | EAP 수립 여부 | boolean | true | 원천값 요청 | 미회신(회신대기) |
| DQ-078-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id,geo… | {"address": "경상북도 영천시 ○○면 ○○리", "admin_code": "4723000000",… | 원천값 요청 | 미회신(회신대기) |
| DQ-079-01 | `project_budget` | 총사업비·연차별 예산 | object{total_cost{value,unit},annual_budgets[{year,value,un… | {"total_cost": {"value": 3200, "unit": "백만원"}, "annual_budg… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 급경사지·붕괴위험지역 — `steep_slope_collapse_area`

- 원문 조회대상: **급경사지·붕괴위험지역** · 원천: SRC-074~081·105 급경사지정보/붕괴위험지역지정/안전점검/일제조사서/재해위험도평가/정비사업/준공도서 (NDMS) · 붕괴위험지역.geojson
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-082-01 | `hazard_assessment_grade_score` | 재해위험도 등급·점수 | object{grade,score} | {"grade": "C", "score": 54} | 원천값 요청 | 미회신(회신대기) |
| DQ-082-02 | `latest_safety_inspection` | 안전점검일·결과 | object{inspected_on,result,action_required} | {"inspected_on": "2025-04-10", "result": "보수 필요"} | 원천값 요청 | 미회신(회신대기) |
| DQ-082-03 | `residents` | 거주가구·인구 | object{households,population} | {"households": 12, "population": 25} | 원천값 요청 | 미회신(회신대기) |
| DQ-083-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "강원특별자치도 인제군 인제읍 ○○리", "admin_code": "518102500… | 원천값 요청 | 미회신(회신대기) |
| DQ-084-01 | `reinforcement_method` | 보수보강 방법 | string | 낙석방지망 설치 · 옹벽 보강 | 원천값 요청 | 미회신(회신대기) |
| DQ-084-02 | `planned_progress_status` | 계획자료상 공정률·사업상태 | object{progress_pct,status_raw,as_of} (현행화 확인 필요) | {"progress_pct": 60, "status_raw": "진행", "as_of": "2026-01"} | 원천값 요청 | 미회신(회신대기) |
| DQ-100-01 | `management_no_history_ids` | 관리번호·세부이력 식별자 | object{management_no,record_ids{designation[],assessment[],… | {"management_no": "(원천 관리번호)", "record_ids": {"inspection":… | 필수 응답 | 미회신(회신대기) |
| DQ-101-01 | `designation_history` | 지정·해제일자·지정사유 | array<object{designated_on,released_on,reason,as_of}> | [{"designated_on": "2019-03-15", "released_on": null, "reas… | 원천값 요청 | 미회신(회신대기) |
| DQ-102-01 | `inspection_history` | 점검일자·내용·조치사항 | array<object{inspected_on,content,action}> | [{"inspected_on": "2025-04-10", "content": "배수로 막힘", "actio… | 원천값 요청 | 미회신(회신대기) |
| DQ-103-01 | `survey_info` | 조사일자·비탈면 유형·높이·경사각 | array<object{surveyed_on,slope_type,height_m,slope_angle_de… | [{"surveyed_on": "2024-06-01", "slope_type": "인공비탈면", "heig… | 원천값 요청 | 미회신(회신대기) |
| DQ-103-02 | `hazard_assessments` | 평가일자·평가유형·항목별 점수·평가등급 | array<object{assessed_on,assessment_type,item_scores[],grad… | [{"assessed_on": "2024-06-20", "assessment_type": "재해위험도평가"… | 원천값 요청 | 미회신(회신대기) |
| DQ-104-01 | `maintenance_projects` | 사업년도·사업유형·사업량·사업비 | array<object{year,project_type,quantity,cost{value,unit}}> | [{"year": 2025, "project_type": "정비", "cost": {"value": 450… | 원천값 요청 | 미회신(회신대기) |
| DQ-104-02 | `completion_documents` | 준공도서·사업명·사업기간·준공일자 | array<object{doc_name,project_name,period,completed_on}> | [{"project_name": "○○ 급경사지 정비사업", "completed_on": "2025-11-… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 산사태·토석류 취약지역 — `landslide_vulnerable_area`

- 원문 조회대상: **산사태·토석류 취약지역** · 원천: SRC-084 산사태_취약지역_지정현황(tb_ldsl_vlnara_dsgn)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-085-01 | `landslide_type_grade` | 종류·위험등급 | object{type(산사태 | 토석류),grade}\|{"type":"산사태","grade":"1등급"} | 원천값 요청 | 미회신(회신대기) |
| DQ-085-02 | `designation_reason` | 지정사유 | string | 급경사 및 토심 깊음, 하부 인가 피해 우려 | 원천값 요청 | 미회신(회신대기) |
| DQ-085-03 | `expected_damage_houses_population` | 예상피해 가옥·인구 | object{buildings,households,population} | {"buildings": 8, "households": 10, "population": 21} | 원천값 요청 | 미회신(회신대기) |
| DQ-086-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "강원특별자치도 인제군 기린면 ○○리 산○", "admin_code": "518103… | 원천값 요청 | 미회신(회신대기) |
| DQ-087-01 | `evacuation_sites` | 대피장소 | array<object{name,address,shelter_id}> | [{"name": "○○마을회관", "shelter_id": null}] | 원천값 요청 | 미회신(회신대기) |
| DQ-088-01 | `expected_rainfall_threshold` | 시간당·일 예상강우 | object{hourly_mm,daily_mm,basis} | {"hourly_mm": 30, "daily_mm": 150} | 추가 협의 | 미회신(회신대기) |

### DP-02 · 홍수취약지구 — `flood_vulnerable_district`

- 원문 조회대상: **홍수취약지구** · 원천: SRC-099·100 26년_홍수취약지구_리스트/지정 · SRC-101 홍수취약지구_관리카드
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06, UFR-004-001-02, UFR-004-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-089-01 | `vulnerability_type` | 취약유형 | enum (축제 | 보축\|통수단면\|횡단시설\|수문\|보수보강\|지속관리\|공사구간)\|축제 | 원천값 요청 | 미회신(회신대기) |
| DQ-089-02 | `river_name_grade` | 하천명·등급 | object{river_name,river_grade(국가 | 지방)}\|{"river_name":"낙동강","river_grade":"국가하천"} | 원천값 요청 | 미회신(회신대기) |
| DQ-089-03 | `vulnerable_section` | 취약구간 연장·원인 | object{length{value,unit},cause,source} | {"length": {"value": 1.2, "unit": "km"}, "cause": "제방고 부족",… | 원천값 요청 | 미회신(회신대기) |
| DQ-089-04 | `response_level_station` | 대응수위·연계 관측소 | object{level_m,station_code,station_name} | {"level_m": 4.5, "station_code": "2018640", "station_name":… | 원천값 요청 | 미회신(회신대기) |
| DQ-089-05 | `flood_warning_point` | 특보지점 | string | 구포 | 원천값 요청 | 미회신(회신대기) |
| DQ-089-06 | `risk_communication_system` | 위험전달체계 | string (요약) | 낙동강홍수통제소 → 부산시 재난상황실 → 구청 | 원천값 요청 | 미회신(회신대기) |
| DQ-090-01 | `river_authority_management` | 하천관리청·관리구분 | object{authority,management_class(구조적 개선 | 지속관리)}\|{"authority":"(하천관리청)","management_class":"구조적 개선"} | 원천값 요청 | 미회신(회신대기) |
| DQ-091-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "부산광역시 북구 구포동 낙동강 좌안", "admin_code": "263200000… | 원천값 요청 | 미회신(회신대기) |
| DQ-105-01 | `source_serial_nos` | 원천 지구 일련번호·지정이력 일련번호 | object{district_serial_no,designation_serial_no} | {"district_serial_no": "(원천 일련번호)", "designation_serial_no"… | 원천값 요청 | 미회신(회신대기) |
| DQ-105-02 | `designation_status` | 지정시점·관리번호·지정상태 | object{designated_at,management_no,status} | {"designated_at": "2025", "management_no": "25-낙동강-014", "s… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 자연재해위험개선지구·풍수해생활권(풍수해개선지구) — `disaster_improvement_district`

- 원문 조회대상: **자연재해위험개선지구·풍수해생활권** · 원천: SRC-103·104 자연재해위험개선지구 중기계획('26~'30)·풍수해생활권종합정비 · 풍수해개선지구.geojson
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-106-01 | `district_basic` | 원천 식별번호·지구명·유형·등급 | object{source_id,name,type,grade} | {"source_id": "(원천 식별번호)", "name": "연산 침수위험지구", "type": "침수… | 원천값 요청 | 미회신(회신대기) |
| DQ-106-02 | `designation_area_dates` | 지정면적·지정/해제일자 | object{area_m2,designated_on,released_on} | {"area_m2": 85000, "designated_on": "2015-03-12", "released… | 원천값 요청 | 미회신(회신대기) |
| DQ-106-03 | `facility_project` | 시설명·등급·사업내용·시작/종료연도 | object{facility_name,grade,content,start_year,end_year} | {"content": "우수관 확충(D=1,200mm, L=860m) · 지하 저류시설(3,000㎥)", … | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 인명피해우려지역 — `casualty_risk_area`

- 원문 조회대상: **인명피해우려지역** · 원천: SRC-110 지역_인명피해우려 · SRC-325 인명피해우려지역(별도)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-107-01 | `area_id_type_location` | 지역 식별자·지역유형·위치 | object{area_id,area_type,location} | {"area_id": "LP-BSN-01", "area_type": "하천변 산책로", "location"… | 원천값 요청 | 미회신(회신대기) |
| DQ-107-02 | `evacuation_capacity` | 대피인원·대피시설·수용인원 | object{evacuees,shelter_name,capacity} | {"evacuees": 120, "shelter_name": "연제구민체육공원 실내체육관", "capaci… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 고립예상지역 — `isolation_expected_area`

- 원문 조회대상: **고립예상지역** · 원천: SRC-112·113 지역_고립예상_지정/대책
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-108-01 | `identifiers` | 지역코드·연도·지정/대책 식별자 | object{region_code,year,designation_id,measure_id} | {"region_code": "5181000000", "year": 2025, "designation_id… | 원천값 요청 | 미회신(회신대기) |
| DQ-108-02 | `isolation_risk` | 고립위험사유·예상세대수·예상인원수 | object{reason,expected_households,expected_persons} | {"reason": "진입도로 침수 시 고립", "expected_households": 15, "expe… | 원천값 요청 | 미회신(회신대기) |
| DQ-108-03 | `access_options` | 우회도로·헬기구조·고지대대피 가능여부 | object{detour_road,helicopter_rescue,highland_evacuation} (… | {"detour_road": false, "helicopter_rescue": true, "highland… | 원천값 요청 | 미회신(회신대기) |
| DQ-108-04 | `evacuation_refs` | 대피지역코드·수용시설 식별자 | object{evacuation_area_code,shelter_id} | {"evacuation_area_code": "(대피지역코드)", "shelter_id": "(수용시설 I… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 상습침수지역 — `habitual_flood_area`

- 원문 조회대상: **상습침수지역** · 원천: SRC-132·133 상습침수지역_전체주소_필지기준 / 위험지구지정_예방사업_취합(tb_chflar_dsrprjt_prst)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-109-01 | `parcel_address` | 필지 ID·주소·행정코드 | object{parcel_id,address,admin_code} | {"parcel_id": "(필지 ID)", "address": "부산 연제구 연산동 403-12", "a… | 원천값 요청 | 미회신(회신대기) |
| DQ-109-02 | `flood_history` | 피해일자·침수건수·상습침수 판정 | object{damage_dates[],flood_count,is_habitual} | {"damage_dates": ["2014-08-25", "2016-10-05", "2020-07-23"]… | 원천값 요청 | 미회신(회신대기) |
| DQ-109-03 | `risk_district_designation` | 위험지구 지정여부·유형·등급·지정/해제일 | object{designated,type,grade,designated_on,released_on} | {"designated": true, "type": "침수", "grade": "나", "designate… | 원천값 요청 | 미회신(회신대기) |
| DQ-109-04 | `prevention_projects` | 사업명·사업비·시작/종료일·사업내용 | array<object{name,cost{value,unit},started_on,ended_on,cont… | [{"name": "연산지구 배수개선", "cost": {"value": 5600, "unit": "백만원… | 원천값 요청 | 미회신(회신대기) |

### DP-02 · 지역 재해위험지구 — `local_disaster_risk_district`

- 원문 조회대상: **지역 재해위험지구** · 원천: SRC-108·109 지역_재해위험지구 / 지역_재해위험지구_안전점검
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-04, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-110-01 | `district_basic` | 관리번호·지구명·유형·등급 | object{management_no,name,type,grade} | {"management_no": "(관리번호)", "name": "○○ 재해위험지구", "type": "침… | 원천값 요청 | 미회신(회신대기) |
| DQ-110-02 | `designation_detail` | 지정/해제일·사유·거주세대/인원 | object{designated_on,released_on,reason,households,persons} | {"designated_on": "2018-05-01", "reason": "상습 침수", "househo… | 원천값 요청 | 미회신(회신대기) |
| DQ-110-03 | `inspection_history` | 점검일시·점검내용·조치사항 | array<object{inspected_at,content,action}> | [{"inspected_at": "2025-06-15", "content": "배수펌프 점검", "acti… | 원천값 요청 | 미회신(회신대기) |

### DP-03 · 잠재 위험요소·취약시설(공통) — `vulnerable_facility_common`

- 원문 조회대상: **지하차도·지하공간·캠핑장·산지숙박시설 등 취약시설** · 원천: 20260930 원시데이터목록: 지하차도·건축물·야영장·대피시설
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06, UFR-004-001-02, UFR-004-002-01, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-012-01 | `facility_name` | 시설명 | string | 초량 제1지하차도 | 필수 응답 | 미회신(회신대기) |
| DQ-012-02 | `facility_type` | 시설유형 | enum (지하차도 | 지하공간\|저수지\|체류시설\|하천시설 등)\|지하차도 | 필수 응답 | 미회신(회신대기) |
| DQ-012-03 | `address_admin_location` | 주소·행정구역·위치·경계 | object{address,admin_code} | {"address": "부산 동구 초량동 1187-8", "admin_code": "2617010100"} | 원천값 요청 | 미회신(회신대기) |
| DQ-012-04 | `geometry_ref` | 좌표·형상 | object{geometry_type,crs,spatial_object_id} | {"geometry_type": "LineString", "crs": "EPSG:4326", "spatia… | 원천값 요청 | 미회신(회신대기) |
| DQ-013-01 | `key_risk_factors` | 핵심 위험요소 | string[] (침수 | 월류\|붕괴\|고립\|대피지연 등)\|["침수","고립"] | 원천값 요청 | 미회신(회신대기) |
| DQ-013-02 | `related_risk_areas` | 연관 위험지역 | array<object{relation_type,risk_area_id,name}> | [{"relation_type": "LOCATED_IN", "risk_area_id": "IMP-77", … | 원천값 요청 | 미회신(회신대기) |
| DQ-013-03 | `related_river_distance` | 연관 하천·이격정보 | object{river_name,distance_m,as_of} | {"river_name": "온천천", "distance_m": 320, "as_of": "2026-06"} | 원천값 요청 | 미회신(회신대기) |
| DQ-013-04 | `usage_characteristics` | 용도·이용특성 | string (거주·교통·다중이용 등) | 교통 | 원천값 요청 | 미회신(회신대기) |
| DQ-013-05 | `underground_capacity` | 지하층·수용/이용 규모 | object{basement_floors,capacity} | {"basement_floors": null, "capacity": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-013-06 | `structure_scale` | 구조·규모 | object{length_m,height_m,storage_m3,area_m2} | {"length_m": 175, "height_m": 4.5} | 원천값 요청 | 미회신(회신대기) |
| DQ-014-01 | `managing_agency` | 관리기관 | object{owner,manager} | {"owner": "부산광역시", "manager": "동구 건설과"} | 원천값 요청 | 미회신(회신대기) |
| DQ-014-02 | `inspection_management_status` | 점검·관리상태 | string (정상 | 주의\|개선필요 등 원천값)\|주의 | 원천값 요청 | 미회신(회신대기) |
| DQ-014-03 | `blocking_drainage_alarm_equipment` | 차단·배수·경보 설비 | object{blocking,drainage,alarm,operating_status} | {"blocking": "설치", "drainage": "배수펌프 2대", "alarm": "전광판"} | 원천값 요청 | 미회신(회신대기) |
| DQ-014-04 | `source_base_date` | 출처·기준일 | object{source_org,updated_on} | {"source_org": "행정안전부", "updated_on": "2026-06-10"} | 원천값 요청 | 미회신(회신대기) |
| DQ-014-05 | `object_id_disclosure` | 객체 식별자·원천 공개등급 | object{object_id,source_disclosure_level} | {"object_id": "UP-BSN-01", "source_disclosure_level": "제한공개… | 원천값 요청 | 미회신(회신대기) |
| DQ-015-01 | `evacuation_targets_facilities` | 대피대상·대피시설 | object{targets,shelters[]} | {"targets": "지하차도 이용 차량·보행자", "shelters": []} | 원천값 요청 | 미회신(회신대기) |
| DQ-016-01 | `damage_inspection_history` | 과거 피해·점검이력 | array<object{date,type(피해 | 점검),content,action}>\|[{"date":"2020-07-23","type":"피해","co… | 원천값 요청 | 미회신(회신대기) |

### DP-03 · 지하차도 — `underpass`

- 원문 조회대상: **지하차도** · 원천: SRC-135~138 지하차도 차단시설/대피시설/담당자/관리제외현황(별도·비공개)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-072-01 | `blocking_mandatory` | 차단시설 의무대상 여부 | boolean | true | 원천값 요청 | 미회신(회신대기) |
| DQ-072-02 | `mandatory_basis` | 의무대상 판정근거 | string[] (U자형·하천 500m·수방기준 지역 등) | ["U자형 종단", "과거 5년 이내 침수(2020.7)"] | 원천값 요청 | 미회신(회신대기) |
| DQ-072-03 | `entry_blocking_installed` | 진입차단시설 설치현황 | enum (설치 | 미설치)\|설치 | 원천값 요청 | 미회신(회신대기) |
| DQ-072-04 | `blocking_method` | 차단방식 | enum (자동 | 수동)\|자동 | 원천값 요청 | 미회신(회신대기) |
| DQ-072-05 | `evacuation_facility` | 대피시설 설치대상·현황 | object{required,status} | {"required": true, "status": "사다리·난간 설치"} | 원천값 요청 | 미회신(회신대기) |
| DQ-073-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "부산 동구 초량동 1187-8", "admin_code": "2617010100",… | 원천값 요청 | 미회신(회신대기) |
| DQ-074-01 | `annual_install_plan` | 연도별 설치계획 | array<object{year,facility}> | [{"year": 2027, "facility": "자동 진입차단시설"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-074-02 | `inspection_findings` | 점검·지적사항 | array<object{date,finding}> | [{"date": "2025-05-20", "finding": "수위계 오작동"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-074-03 | `department_contact` | 담당부서·연락처 | object{agency,department,phone} | {"agency": "부산광역시 동구", "department": "건설과", "phone": "051-0… | 원천값 요청 | 미회신(회신대기) |
| DQ-111-01 | `control_flood_depth` | 통제기준 침수심·자료 기준일 | object{depth_cm,data_as_of} | {"depth_cm": 15, "data_as_of": "2026-06-10"} | 원천값 요청 | 미회신(회신대기) |
| DQ-111-02 | `monitoring_equipment` | CCTV·전광판·스피커·수위계·배수시설 설치여부 | object{cctv,display_board,speaker,water_gauge,drainage} (bo… | {"cctv": true, "display_board": true, "speaker": true, "wat… | 원천값 요청 | 미회신(회신대기) |
| DQ-111-03 | `operation_check` | 차단시설·배수펌프 정상작동여부·최근 점검연월 | object{blocking_ok,pump_ok,last_inspected_ym} (자료 기준일 값) | {"blocking_ok": true, "pump_ok": true, "last_inspected_ym":… | 원천값 요청 | 미회신(회신대기) |
| DQ-111-04 | `evacuation_facility_status` | 대피시설 설치대상·설치현황 | object{required,installed} | {"required": true, "installed": true} | 원천값 요청 | 미회신(회신대기) |
| DQ-111-05 | `management_exclusion` | 관리 제외 사유·자료 기준정보 | object{reason,data_basis} | {"reason": null, "data_basis": "지하차도 현황(26.6.10. 기준)"} | 원천값 요청 | 미회신(회신대기) |

### DP-03 · 건축물 지하공간(반지하 포함) — `building_underground_space`

- 원문 조회대상: **건축물 지하공간** · 원천: 건축물대장 · GIS건물일반집합정보 (아이타이쿤 9월 적재 예정)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06, UFR-004-001-02, UFR-004-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-075-01 | `has_basement` | 지하층 보유 여부 | boolean | true | 원천값 요청 | 미회신(회신대기) |
| DQ-075-02 | `basement_floors_usage` | 지하층 수·용도 | object{floors,usage[]} | {"floors": 1, "usage": ["주거"]} | 원천값 요청 | 미회신(회신대기) |
| DQ-075-03 | `flood_history` | 침수이력 | array<object{year,area,grade}> | [{"year": 2020, "area": "연산동 403 일원", "grade": "0.5~1m"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-075-04 | `semi_basement_households_grid` | 격자별 반지하 가구수 | object{grid_id,households} | {"grid_id": "(100m 격자 ID)", "households": 41} | 추가 협의 | 미회신(회신대기) |
| DQ-075-05 | `flood_prevention_zone` | 수방기준 적용지역 여부 | boolean | true | 원천값 요청 | 미회신(회신대기) |
| DQ-076-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "부산 연제구 연산동 403-12", "admin_code": "2647010500"} | 원천값 요청 | 미회신(회신대기) |
| DQ-112-01 | `building_ids` | 건축물대장 고유번호·GIS건물 통합식별번호·필지 ID | object{bldg_register_no,gis_bldg_id,parcel_id} | {"bldg_register_no": "(건축물대장 고유번호)", "gis_bldg_id": "(GIS건물… | 원천값 요청 | 미회신(회신대기) |
| DQ-112-02 | `building_specs` | 건물 용도·구조·지상/지하층수·가구/세대수·기준일 | object{usage,structure,floors_above,floors_below,households… | {"usage": "다세대주택", "structure": "철근콘크리트", "floors_above": 4… | 원천값 요청 | 미회신(회신대기) |

### DP-03 · 캠핑장/야영장·산지인접 숙박시설 — `campsite_mountain_lodging`

- 원문 조회대상: **캠핑장·산지숙박** · 원천: SRC-139 문화_일반야영장업(tb_gnrl_ldg_fclt)
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-080-01 | `facility_type_sites` | 시설유형·사이트 수 | object{type(일반 | 자동차\|글램핑\|카라반),site_count,capacity}\|{"type":"일반야영장","site_… | 원천값 요청 | 미회신(회신대기) |
| DQ-080-02 | `fire_facilities` | 소방시설 | object{extinguishers,water_tanks,detectors} | {"extinguishers": 12, "water_tanks": 2, "detectors": 8} | 원천값 요청 | 미회신(회신대기) |
| DQ-080-03 | `stream_distance_m` | 하천·계곡 이격거리 | number (m, 공간정보 제공측 값) | 35 | 원천값 요청 | 미회신(회신대기) |
| DQ-080-04 | `adjacent_risk_districts` | 인접 위험지구 | string[] | ["○○ 산사태취약지역"] | 원천값 요청 | 미회신(회신대기) |
| DQ-081-01 | `location` | 주소·행정구역·좌표 | object{address,admin_code,coordinates,spatial_object_id} | {"address": "강원특별자치도 인제군 상남면 ○○리 (내린천 변)", "admin_code": "5… | 원천값 요청 | 미회신(회신대기) |

### DP-03 · 둔치주차장 — `riverside_parking`

- 원문 조회대상: **둔치주차장** · 원천: 20260930 둔치주차장
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-113-01 | `basic_location` | 객체관리번호·주소·행정구역·좌표 | object{object_mgmt_no,address,admin_code,coordinates} | {"object_mgmt_no": "(객체관리번호)", "address": "부산 연제구 온천천 둔치", … | 원천값 요청 | 미회신(회신대기) |

### DP-04 · 잠재 위험요소·위험구간 — `risk_factor`

- 원문 조회대상: **위험요소** · 원천: 20260930 취약지역 / 하천·시설 원천 및 T3Q 판단기준
- 조회·연결 식별자: 대상유형 + 객체 ID + 원천 관리번호
- 관련 요구사항: UFR-003-001-05, UFR-003-001-06, UFR-004-001-02, UFR-004-002-01, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-017-01 | `risk_factor_name` | 위험요소명 | string | RK-03 제방고 부족 — 온천천 No.11~No.14 | 필수 응답 | 미회신(회신대기) |
| DQ-017-02 | `risk_factor_type` | 위험요소 유형 | enum (기상수문 | 지형공간\|하천시설\|취약시설\|과거피해\|대응관리)\|하천시설 | 필수 응답 | 미회신(회신대기) |
| DQ-017-03 | `target_location_extent` | 대상 위치·범위 | object{geometry_type,admin_code,spatial_object_id} | {"geometry_type": "LineString", "admin_code": "2647010500",… | 원천값 요청 | 미회신(회신대기) |
| DQ-018-01 | `risk_description` | 위험 설명 | string | 계획홍수위 대비 제방 여유고가 기준(1.0m) 미달하여 월류 가능성 증가 | 원천값 요청 | 미회신(회신대기) |
| DQ-018-02 | `criteria_threshold` | 판단기준·임계값 | object{variable,operator,threshold,unit,criteria_version} | {"variable": "여유고", "operator": "<", "threshold": 1.0, "uni… | 원천값 요청 | 미회신(회신대기) |
| DQ-018-03 | `judgement_inputs` | 판단에 사용한 입력값 | array<object{condition_id,value,unit,reference_time}> | [{"condition_id": "c-r3", "value": 118, "unit": "mm", "refe… | 원천값 요청 | 미회신(회신대기) |
| DQ-018-04 | `fulfillment_status` | 충족 상태 | enum (MATCHED | NOT_MATCHED\|UNDETERMINED)\|UNDETERMINED | 원천값 요청 | 미회신(회신대기) |
| DQ-019-01 | `related_risk_areas` | 연관 위험지역 | array<object{risk_area_id,relation_basis}> (N:N) | [{"risk_area_id": "RA-BSN-01", "relation_basis": "DOCUMENT_… | 원천값 요청 | 미회신(회신대기) |
| DQ-019-02 | `related_facilities` | 연관 취약시설 | array<object{facility_id,name,type,distance_or_containment}> | [{"facility_id": "UP-BSN-01", "name": "초량 제1지하차도", "type": … | 원천값 요청 | 미회신(회신대기) |
| DQ-019-03 | `related_events` | 관련 사건 | array<object{event_master_id,occurred_on}> | [{"event_master_id": "T10107-20140825-0001", "occurred_on":… | 원천값 요청 | 미회신(회신대기) |
| DQ-019-04 | `evidence_type` | 근거유형 | enum (관측 | 신고\|언론\|점검\|계획)\|계획 | 원천값 요청 | 미회신(회신대기) |
| DQ-019-05 | `evidence_citations` | 근거문서·인용위치 | array<object{document_id,page,passage_id}> | [{"document_id": "DOC-B2", "page": "p.312", "passage_id": "… | 원천값 요청 | 미회신(회신대기) |
| DQ-019-06 | `reference_time_source` | 기준시각·출처 | object{as_of,source_org} | {"as_of": "2020-12-30", "source_org": "부산광역시"} | 원천값 요청 | 미회신(회신대기) |
| DQ-020-01 | `verification_status` | 검증상태 | enum (확정 | 검토중\|미검증)\|확정 | 원천값 요청 | 미회신(회신대기) |
| DQ-020-02 | `object_id_disclosure` | 객체 식별자·원천 공개등급 | object{object_id,source_disclosure_level} | {"object_id": "RK-BSN-03", "source_disclosure_level": "공개"} | 원천값 요청 | 미회신(회신대기) |

### DP-05 · 하천·소하천(기본/공간정보) — `river`

- 원문 조회대상: **하천** · 원천: SRC-127·128·129·310·311·313~315 하천망도·국가기본도 하천·권역/유역 · SRC-106 소하천구역 · 하천기본계획
- 조회·연결 식별자: 하천코드·소하천 식별번호 + 공간객체 ID
- 관련 요구사항: UFR-003-001-03, UFR-003-001-07, UFR-003-001-08, UFR-004-001-02, UFR-004-002-01, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-021-01 | `river_name` | 하천명 | string | 온천천 | 원천값 요청 | 미회신(회신대기) |
| DQ-021-02 | `river_class` | 하천구분 | enum (국가하천 | 지방하천\|소하천)\|지방하천 | 원천값 요청 | 미회신(회신대기) |
| DQ-021-03 | `river_code` | 하천코드·관리번호 | string (하천코드·관리번호) | 2201110 | 원천값 요청 | 미회신(회신대기) |
| DQ-021-04 | `river_geometry_section` | 하천 형상·구간 | object{geometry_type,start,end,spatial_object_id} | {"geometry_type": "MultiLineString", "spatial_object_id": "… | 원천값 요청 | 미회신(회신대기) |
| DQ-021-05 | `crossing_admin_areas` | 통과 행정구역 | array<object{admin_code,name}> | [{"admin_code": "2626000000", "name": "동래구"}, {"admin_code"… | 원천값 요청 | 미회신(회신대기) |
| DQ-021-06 | `basin` | 수계·유역 | object{water_system,basin_code} | {"water_system": "수영강", "basin_code": "(유역코드)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-022-01 | `managing_authority` | 관리기관 | object{legal_authority,field_agency,as_of} | {"legal_authority": "부산광역시", "field_agency": "연제구", "as_of"… | 원천값 요청 | 미회신(회신대기) |
| DQ-022-02 | `related_risk_areas` | 관련 위험지역 | array<object{risk_area_id,name,type,relation_basis}> | [{"risk_area_id": "RA-BSN-01", "name": "온천천 하류 침수위험지구(A-03)… | 원천값 요청 | 미회신(회신대기) |
| DQ-022-03 | `related_plan_documents` | 관련 계획문서 | array<object{document_id,plan_type,base_year}> | [{"document_id": "DOC-B2", "plan_type": "하천기본계획", "base_yea… | 원천값 요청 | 미회신(회신대기) |
| DQ-022-04 | `source_base_date` | 출처·기준일 | object{source_org,as_of} | {"source_org": "RIMGIS", "as_of": "2026-07-15"} | 원천값 요청 | 미회신(회신대기) |
| DQ-022-05 | `crs_spatial_quality` | CRS·공간품질 | object{crs,accuracy,update_status,as_of} | {"crs": "EPSG:4326", "update_status": "(원천값)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-023-01 | `length_basin_area` | 하천연장·유역면적 | object{length_km,basin_area_km2} | {"length_km": 19.6, "basin_area_km2": 56.6} | 원천값 요청 | 미회신(회신대기) |
| DQ-023-02 | `start_end_points` | 기점·종점 | object{start{address,coordinates},end{address,coordinates},… | {"start": {"address": "부산 금정구 ○○동"}, "end": {"address": "수영… | 원천값 요청 | 미회신(회신대기) |
| DQ-023-03 | `levee_freeboard` | 제방고·여유고 | array<object{station,side,levee_el_m,freeboard_m,as_of}> | [{"station": "No.12", "side": "좌안", "levee_el_m": 5.8, "fre… | 원천값 요청 | 미회신(회신대기) |
| DQ-023-04 | `structures` | 교량·보·수문·암거 | array<object{type,name,specs,condition,as_of}> | [{"type": "교량", "name": "세병교", "condition": "형하여유고 0.6m 부족"… | 원천값 요청 | 미회신(회신대기) |
| DQ-023-05 | `vulnerable_sections` | 협착·저형고·취약구간 | array<object{section,reason}> | [{"section": "No.11~No.14", "reason": "제방고 부족"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-024-01 | `design_flood` | 계획홍수량 | object{value_cms,station_no,return_period_yr} | {"value_cms": 820, "station_no": "No.12", "return_period_yr… | 원천값 요청 | 미회신(회신대기) |
| DQ-024-02 | `design_flood_level` | 계획홍수위 | object{value_el_m,station_no,vertical_datum} | {"value_el_m": 5.32, "station_no": "No.12", "vertical_datum… | 원천값 요청 | 미회신(회신대기) |

### DP-06 · 계획지식: 자연재해저감종합계획(위험지구·저감대책) — `plan_disaster_reduction`

- 원문 조회대상: **계획 위험지구·저감대책** · 원천: SRC-064·065 자연재해저감종합계획(광역·시군구 보고서) · (참고)문서형태 이미지1~6 · NIA 이미지(3)(4)
- 조회·연결 식별자: 문서 ID + 지구 ID + 평가/검토표 ID + 원문 행 ID / 문서 ID + 지구/객체 ID
- 관련 요구사항: UFR-003-001-07, UFR-003-001-07~09, UFR-003-001-08, UFR-003-001-09, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-025-01 | `plan_name` | 계획명 | string | 부산광역시 자연재해저감종합계획 (2021.12) | 원천값 요청 | 미회신(회신대기) |
| DQ-025-02 | `agency_target_area` | 수립기관·대상지역 | object{agency,target_area,target_admin_codes[]} | {"agency": "부산광역시", "target_area": "부산광역시 전역(16개 구·군)", "ta… | 원천값 요청 | 미회신(회신대기) |
| DQ-025-03 | `plan_period_base_year` | 계획기간·기준연도 | object{from,to,base_year} | {"from": 2022, "to": 2031, "base_year": 2020} | 원천값 요청 | 미회신(회신대기) |
| DQ-025-04 | `approval_notice` | 승인·고시 정보 | object{date,text,version,other_versions[]} | {"date": "2021-12-28", "text": "승인(행안부) · 제2차", "version": … | 원천값 요청 | 미회신(회신대기) |
| DQ-026-01 | `district_name_hazard` | 지구명·재해유형 | object{name,hazard_type} | {"name": "대천1 지구", "hazard_type": "하천재해"} | 원천값 요청 | 미회신(회신대기) |
| DQ-026-02 | `district_location_boundary` | 위치·경계 | object{address,admin_code,spatial_object_id} | {"address": "부산 북구 화명동", "spatial_object_id": "(공간객체 ID)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-026-03 | `risk_grade_priority` | 위험등급·우선순위 | object{risk_grade,priority} | {"risk_grade": "(원문 등급)", "priority": 3} | 원천값 요청 | 미회신(회신대기) |
| DQ-026-04 | `risk_factors_causes` | 위험요인·발생원인 | string[] | ["제방고 부족 0.02~1.78m"] | 원천값 요청 | 미회신(회신대기) |
| DQ-026-05 | `expected_damage` | 예상 피해 | object{persons,facilities,flood_area,isolation} | {"persons": 698, "facilities": null, "flood_area": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-027-01 | `risk_score_detail` | 위험도 세부점수 | array<object{item,points,score}> | [{"item": "피해이력(A)", "points": 5, "score": 3}] | 원천값 요청 | 미회신(회신대기) |
| DQ-027-02 | `performance_target_threshold_rain` | 방재성능목표·임계강우 | object{durations[{duration,value_mm}],base_year} | {"durations": [{"duration": "1시간", "value_mm": 100}, {"dura… | 원천값 요청 | 미회신(회신대기) |
| DQ-028-01 | `mitigation_measures` | 저감대책 | array<object{type(구조적 | 비구조적),content}>\|[{"type":"구조적","content":"좌안 제방 보축 H=0.6m"… | 원천값 요청 | 미회신(회신대기) |
| DQ-028-02 | `alternatives_selection` | 대안 비교·선정사유 | array<object{alternative,criteria,selected,reason}> | [{"alternative": "제방 보축", "selected": true, "reason": "경제성"… | 원천값 요청 | 미회신(회신대기) |
| DQ-028-03 | `project_name_content` | 정비사업명·내용 | object{name,content,as_of} | {"name": "대천1 지구 정비사업", "content": "제방 보축 · 교량 재가설", "as_of… | 원천값 요청 | 미회신(회신대기) |
| DQ-028-04 | `project_period_cost` | 사업기간·사업비 | object{period,cost{value,unit},basis(계획 | 집행),as_of}\|{"period":"2023~2027","cost":{"value":185,"unit… | 원천값 요청 | 미회신(회신대기) |
| DQ-028-05 | `planned_status_as_of` | 계획상 사업상태·기준시점 | object{status_raw,survey_or_plan_date,currency_check} | {"status_raw": "계획", "survey_or_plan_date": "2020", "curren… | 원천값 요청 | 미회신(회신대기) |
| DQ-029-01 | `related_objects` | 관련 하천·취약시설·사건 | array<object{entity_type,entity_id,relation_basis}> | [{"entity_type": "RIVER", "entity_id": "RV-2201110", "relat… | 원천값 요청 | 미회신(회신대기) |
| DQ-029-02 | `source_location` | 원문 위치 | object{chapter,section,page,table,passage_id} | {"page": "p.4-112", "table": "표 4.3-12", "passage_id": "PSG… | 원천값 요청 | 미회신(회신대기) |
| DQ-029-03 | `document_meta` | 문서ID·품질·공개등급 | object{document_id,quality_status,disclosure_level,as_of} | {"document_id": "DOC-B1", "quality_status": "VERIFIED", "di… | 원천값 요청 | 미회신(회신대기) |
| DQ-126-01 | `candidate_site_basic` | 후보지 관리번호·하천등급·선정사유 | object{management_no,name,hazard_type,district_type,water_s… | {"management_no": "RR-005-02", "name": "대천1 지구", "river_gra… | 원천값 요청 | 미회신(회신대기) |
| DQ-127-01 | `risk_population_facilities` | 위험인구·재해약자·주변시설·수용능력 | object{risk_population,vulnerable_persons,nearby_facilities… | {"risk_population": 698, "vulnerable_persons": 97} | 원천값 요청 | 미회신(회신대기) |
| DQ-128-01 | `levee_bridge_review` | 제방고·여유고 및 교량능력 검토 | object{levee_rows[{station,cum_distance_m,design_flood_cms,… | {"levee_rows": [{"station": "8+760", "design_flood_level_el… | 원천값 요청 | 미회신(회신대기) |
| DQ-129-01 | `flood_area_by_depth` | 빈도별 취약지역 총면적·침수심별 면적 | array<object{scenario(빈도 | 방재성능목표),total_area{value,unit},avg_depth_m,depth_bins[{rang… | 원천값 요청 | 미회신(회신대기) |
| DQ-130-01 | `land_use_damage` | 토지이용현황·용도지역별 피해규모 | object{land_use_rows[{class,subclass,area_ha,population,bui… | {"land_use_rows": [{"class": "합계", "area_ha": 2.7, "populat… | 원천값 요청 | 미회신(회신대기) |
| DQ-131-01 | `mitigation_effects` | 관리·도시계획·구조적 대책과 사업기대효과 | array<object{type(관리 | 도시계획\|구조적),content,quantity,design_frequency_yr,approx_cost… | 원천값 요청 | 미회신(회신대기) |
| DQ-132-01 | `investment_priority` | 투자우선순위 평가항목·점수·순위 | object{basic_scores{bc_ratio,damage_history,risk,inconvenie… | {"rank": 3} | 원천값 요청 | 미회신(회신대기) |
| DQ-133-01 | `common_measures_evacuation_criteria` | 시설유형별 침수방지대책·강우량별 대피기준 | object{facility_measures[{facility_type,main_risk,measures}… | 시\|일),value_mm,stage(주의보\|경보),remark}]}\|{"evacuation_rules… | 원천값 요청 | 미회신(회신대기) |
| DQ-145-01 | `risk_assessment_rows` | 간략·상세 평가 구분 및 평가행 | array<object{id,type(간략 | 상세),method_version,district_id,survey_as_of}>\|[{"id":"(평가 … | 원천값 요청 | 미회신(회신대기) |
| DQ-145-02 | `risk_assessment_items` | 평가항목·점수·산정근거 | array<object{code(A | B\|C\|D),name,points,score,scale,basis,basis_year}>\|[{"cod… | 원천값 요청 | 미회신(회신대기) |
| DQ-145-03 | `risk_formula_index_grade` | 원문 산식·가중치·위험도지수·등급 | object{formula_raw,coefficients,index,grade,selection_basis… | {"formula_raw": "A×(0.6B+0.4C)×D", "index": 3.2, "grade": n… | 원천값 요청 | 미회신(회신대기) |
| DQ-146-01 | `flood_cause_review` | 배수시설 능력·침수원인 검토 | object{scenario,method,facilities[],capacity_rows[],causes[… | {"scenario": "방재성능목표", "causes": ["관로 통수능력 부족", "홍제천 외수위 영향… | 원천값 요청 | 미회신(회신대기) |
| DQ-146-02 | `source_assets` | 위치도·현장사진·침수도·시설능력 그래프 | array<object{id,type(위치도 | 현장사진\|침수도\|그래프),caption,target_refs,legend,source_ref,acces… | 원천값 요청 | 미회신(회신대기) |

### DP-07 · 계획지식: 하천기본계획 — `plan_river_basic`

- 원문 조회대상: **하천·계획정보** · 원천: SRC-067 RIMGIS_하천정비기본계획보고서 · (참고)문서형태 이미지7~11
- 조회·연결 식별자: 문서 ID + 하천코드 + 구간/시설 ID / 문서 ID + 하천코드 + 구간/측점/시설 ID
- 관련 요구사항: UFR-003-001-07, UFR-003-001-07~09, UFR-003-001-08, UFR-003-001-09, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-030-01 | `plan_river_name` | 계획명·하천명 | object{plan_name,river_name} | {"plan_name": "온천천 하천기본계획(변경)", "river_name": "온천천"} | 원천값 요청 | 미회신(회신대기) |
| DQ-030-02 | `agency_notice` | 수립기관·고시 | object{agency,notice_no,notice_date} | {"agency": "부산광역시", "notice_no": "부산광역시 고시 제2020-512호", "no… | 원천값 요청 | 미회신(회신대기) |
| DQ-030-03 | `plan_target_year` | 계획연도·목표연도 | object{plan_year,target_year} | {"plan_year": 2020, "target_year": 2030} | 원천값 요청 | 미회신(회신대기) |
| DQ-030-04 | `plan_section` | 계획 대상구간 정보 | object{start,end,stations,length_km} | {"start": "(기점)", "end": "수영강 합류점", "length_km": 14.2} | 원천값 요청 | 미회신(회신대기) |
| DQ-030-05 | `basin_area` | 수계·유역면적 | object{water_system,basin_code,area_km2} | {"water_system": "수영강", "area_km2": 56.6} | 원천값 요청 | 미회신(회신대기) |
| DQ-031-01 | `probable_rainfall` | 확률강우량 | array<object{duration,return_period_yr,value_mm}> | [{"duration": "1시간", "return_period_yr": 50, "value_mm": 10… | 원천값 요청 | 미회신(회신대기) |
| DQ-031-02 | `design_flood` | 계획홍수량 | array<object{station_no,return_period_yr,value_cms}> | [{"station_no": "No.12", "return_period_yr": 100, "value_cm… | 원천값 요청 | 미회신(회신대기) |
| DQ-031-03 | `design_flood_level` | 계획홍수위 | array<object{station_no,value_el_m,vertical_datum}> | [{"station_no": "No.12", "value_el_m": 5.32, "vertical_datu… | 원천값 요청 | 미회신(회신대기) |
| DQ-031-04 | `design_width_bed` | 계획하폭·하상고 | array<object{station_no,width_m,bed_el_m}> | [{"station_no": "No.12", "width_m": 45, "bed_el_m": 1.2}] | 원천값 요청 | 미회신(회신대기) |
| DQ-031-05 | `capacity_freeboard` | 통수능·여유고 | array<object{station_no,current,plan}> | [{"station_no": "No.12", "current": {"freeboard_m": 0.48}, … | 원천값 요청 | 미회신(회신대기) |
| DQ-031-06 | `levee_height_type` | 제방고·제방형식 | array<object{station_no,side,height_el_m,type}> | [{"station_no": "No.12", "side": "좌안", "height_el_m": 5.8, … | 원천값 요청 | 미회신(회신대기) |
| DQ-032-01 | `structures` | 교량·보·수문·배수시설 | array<object{type,name,location,specs,as_of}> | [{"type": "교량", "name": "세병교"}, {"summary": "교량 27 · 보 4 · … | 원천값 요청 | 미회신(회신대기) |
| DQ-032-02 | `structure_condition` | 시설 관리상태 | array<object{name,condition,as_of}> | [{"name": "연안교", "condition": "하부 세굴 · 개선필요", "as_of": "202… | 원천값 요청 | 미회신(회신대기) |
| DQ-032-03 | `vulnerable_constricted_sections` | 홍수취약·협착구간 | array<object{location,reason}> | [{"location": "세병교", "reason": "교량 통수능 부족"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-033-01 | `improvement_plan` | 하도·제방·시설 정비계획 | array<object{content,priority}> | [{"content": "하도 준설 L=2.4km"}, {"content": "세병교 재가설", "prio… | 원천값 요청 | 미회신(회신대기) |
| DQ-034-01 | `related_risk_events` | 관련 위험지구·피해사례 | array<object{entity_type,entity_id,relation_basis}> | [{"entity_type": "RISK_AREA", "entity_id": "RA-BSN-01", "re… | 원천값 요청 | 미회신(회신대기) |
| DQ-034-02 | `source_locations` | 도면·표·원문 위치 | array<object{drawing_no,table,page,passage_id}> | [{"table": "표 3.4-9 측점별 계획홍수위 및 제방고", "page": "p.312"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-034-03 | `river_code_document_id` | 하천코드·문서ID | object{river_code,document_id,as_of} | {"river_code": "2201110", "document_id": "DOC-B2"} | 원천값 요청 | 미회신(회신대기) |
| DQ-034-04 | `crs_datum_units` | 좌표계·기준면·단위 | object{crs,vertical_datum,units} | {"crs": "EPSG:4326", "vertical_datum": "EL.m (기준면 확인 필요)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-134-01 | `improvement_district` | 정비지구명·측점구간·좌우안·연장·현황 | object{district_id,name,station_start,station_end,side,leng… | {"name": "구미천 축제우1 지구", "station_start": "No.2+827", "stati… | 원천값 요청 | 미회신(회신대기) |
| DQ-135-01 | `station_hydraulics_table` | 측점별 계획홍수량·홍수위·하폭·좌우 제방고 표 | array<object{station_no,cum_distance_m,design_flood_cms,des… | [{"station_no": "No.12", "design_flood_cms": 820, "design_f… | 원천값 요청 | 미회신(회신대기) |
| DQ-136-01 | `district_levee_specs` | 둑마루폭·유속·소류력·비탈경사 | object{crest_width_m,velocity_ms,tractive_force{value,unit}… | 검토)}\|{"crest_width_m":4.0,"velocity_ms":3.2,"freeboard_m":… | 원천값 요청 | 미회신(회신대기) |
| DQ-137-01 | `alternatives_review` | 대안별 정비방향·계획하폭·검토결과·선정근거 | array<object{alternative,flood_cms,direction,design_width_m… | [{"alternative": "1안", "flood_cms": 260, "selected": true}] | 원천값 요청 | 미회신(회신대기) |
| DQ-138-01 | `expected_damage_by_frequency` | 빈도별 인명·이재민·자산별 피해액 표 | array<object{river,district,return_period_yr,casualties,dis… | [{"return_period_yr": 100, "total": {"value": 1250, "unit":… | 원천값 요청 | 미회신(회신대기) |

### DP-07 · 하천 위험요소·위험구간(하천기본계획) — `river_risk_section`

- 원문 조회대상: **하천 위험요소·위험구간** · 원천: 하천기본계획 (20260930 취약지역!3행)
- 조회·연결 식별자: 문서 ID + 하천코드 + 구간/시설 ID
- 관련 요구사항: UFR-003-001-07, UFR-003-001-08, UFR-003-001-09, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-092-01 | `river_risk_factor_code` | 위험요소 코드 | string | RK-03 | 원천값 요청 | 미회신(회신대기) |
| DQ-092-02 | `river_risk_factor_name_grade` | 위험요소명·위험등급 | object{name,grade} | {"name": "제방고 부족", "grade": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-092-03 | `target_facility_section` | 대상시설·구간 | object{facility,stations,length_m} | {"stations": "No.11~No.14", "length_m": 600} | 원천값 요청 | 미회신(회신대기) |
| DQ-092-04 | `response_points` | 대응 착안점 | string (근거 기반 요약) | 월류 우려 구간 우선 예찰 | 원천값 요청 | 미회신(회신대기) |
| DQ-092-05 | `source_excerpt` | 원문발췌 | object{table,page,text} | {"table": "표 3.4-9", "page": "p.312", "text": "(원문 발췌)"} | 원천값 요청 | 미회신(회신대기) |

### DP-08 · 계획지식: 소하천정비종합계획 — `plan_small_river`

- 원문 조회대상: **소하천·정비계획** · 원천: SRC-068 소하천정비 종합계획(시군구, HWP→MD 정형화) · (참고)문서형태 이미지12~15
- 조회·연결 식별자: 문서 ID + 소하천 식별번호 + 구간 ID / 문서 ID + 소하천 식별번호 + 구간/측점 ID
- 관련 요구사항: UFR-003-001-07, UFR-003-001-07~09, UFR-003-001-08, UFR-003-001-09, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-035-01 | `plan_name_target_area` | 계획명·대상지역 | object{plan_name,target_area} | {"plan_name": "영천시 소하천정비종합계획", "target_area": "경상북도 영천시"} | 원천값 요청 | 미회신(회신대기) |
| DQ-035-02 | `small_river_name` | 소하천명 | string | 대미천 | 원천값 요청 | 미회신(회신대기) |
| DQ-035-03 | `small_river_mgmt_no` | 관리번호 | string (소하천 식별자) | (관리번호) | 원천값 요청 | 미회신(회신대기) |
| DQ-035-04 | `notice_info` | 고시번호·고시일 | object{notice_no,notice_date} | {"notice_no": "(고시번호)", "notice_date": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-035-05 | `plan_section` | 계획 대상구간 정보 | object{start,end,length_m} | {"start": "(기점)", "end": "(종점)", "length_m": 2400} | 원천값 요청 | 미회신(회신대기) |
| DQ-035-06 | `small_river_zone_geometry` | 소하천구역 형상 | object{geometry_type,crs,spatial_object_id} | {"geometry_type": "Polygon", "crs": "EPSG:4326", "spatial_o… | 원천값 요청 | 미회신(회신대기) |
| DQ-036-01 | `design_frequency_flood` | 계획빈도·계획홍수량 | object{return_period_yr,value_cms} | {"return_period_yr": 80, "value_cms": 107} | 원천값 요청 | 미회신(회신대기) |
| DQ-036-02 | `design_flood_level_width` | 계획홍수위·하폭 | array<object{station_no,level_el_m,width_m}> | [{"station_no": "0", "level_el_m": 58.92, "width_m": 18}] | 원천값 요청 | 미회신(회신대기) |
| DQ-036-03 | `structures` | 교량·암거·보·제방 | array<object{type(교량 | 암거\|보\|제방),name,specs,condition,as_of}>\|[{"type":"교량","nam… | 원천값 요청 | 미회신(회신대기) |
| DQ-036-04 | `vulnerable_sections` | 취약·협착구간 | array<object{location,reason}> | [{"location": "(구간)", "reason": "협착"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-037-01 | `improvement_plan_methods` | 정비계획·주요공법 | array<object{section,content,method}> | [{"section": "(구간)", "content": "축제", "method": "블록 호안"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-037-02 | `planned_priority_status` | 계획상 우선순위·사업상태 | object{priority,status_raw,as_of} | {"priority": 2, "status_raw": "계획", "as_of": "(수립연도)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-038-01 | `related_risk_damage` | 위험지구·과거피해 | array<object{entity_type,entity_id,relation_basis}> | [{"entity_type": "EVENT", "entity_id": "(재난사건 ID)", "relati… | 원천값 요청 | 미회신(회신대기) |
| DQ-038-02 | `source_locations` | 원문·도면·표 위치 | array<object{page,drawing_no,table,passage_id}> | [{"table": "소하천별 계획홍수위·하폭·제방고", "page": "(쪽)"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-038-03 | `document_meta` | 문서ID·출처·품질 | object{document_id,source,quality_status,as_of} | {"document_id": "(문서 ID)", "quality_status": "VERIFIED"} | 원천값 요청 | 미회신(회신대기) |
| DQ-139-01 | `zone_environment` | 구역구분·해당구간·현황사유·환경특성 | array<object{zone_class(복원 | 보전\|정비\|친수),section,status_reason,bod_grade,eco_grade,remar… | 원천값 요청 | 미회신(회신대기) |
| DQ-140-01 | `improvement_quantities` | 구간별 축제·보축·호안 연장 및 시설별 개수 | array<object{section,levee_new_m,levee_reinforce_m,revetmen… | [{"section": "(구간)", "levee_new_m": 320, "revetment_m": 540… | 원천값 요청 | 미회신(회신대기) |
| DQ-141-01 | `design_width_calc` | 유역면적·유로연장·하상경사·산정방법별 계획하폭 표 | array<object{section,basin_area_km2,channel_length_km,desig… | [{"section": "(구간)", "basin_area_km2": 4.2, "design_flood_c… | 원천값 요청 | 미회신(회신대기) |
| DQ-142-01 | `flood_level_before_after` | 측점·빈도별 개수 전·후 홍수위 비교표 | array<object{station_no,cum_distance_m,return_period_yr,lev… | [{"station_no": "0", "return_period_yr": 80, "level_before_… | 원천값 요청 | 미회신(회신대기) |
| DQ-143-01 | `station_hydraulics_table` | 측점별 계획홍수량·홍수위·기존/계획하폭·좌우제방고 표 | array<object{station_no,cum_distance_m,design_flood_cms,des… | [{"station_no": "0", "cum_distance_m": 0.0, "design_flood_c… | 원천값 요청 | 미회신(회신대기) |

### DP-11 · 재난사건 이력: 피해·대응·복구·보고 — `event_damage_response`

- 원문 조회대상: **피해·대응·복구** · 원천: 20260930 원시데이터목록: 상황보고·재해대장·피해/복구 (SRC-026~059 등)
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01, UFR-003-001-02, UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-039-01 | `related_event_type` | 관련 사건·재난유형 | object{event_master_id,disaster_type} | {"event_master_id": "T10107-20200723-0001", "disaster_type"… | 원천값 요청 | 미회신(회신대기) |
| DQ-040-01 | `damage_location_admin` | 피해위치·행정구역 | object{address,admin_code,spatial_object_id,extent} | {"address": "부산 동구 초량동 1187-8 (초량 제1지하차도)", "admin_code": "… | 원천값 요청 | 미회신(회신대기) |
| DQ-041-01 | `occurred_received_reported_at` | 발생·접수·보고시각 | object{occurred_at,received_at,reported_at} | {"occurred_at": "2020-07-23T21:40:00+09:00", "reported_at":… | 원천값 요청 | 미회신(회신대기) |
| DQ-042-01 | `damage_type` | 피해유형 | enum (침수 | 붕괴\|유실\|고립 등)\|침수 | 원천값 요청 | 미회신(회신대기) |
| DQ-042-02 | `casualties` | 사망·실종·부상 | object{dead,missing,injured,basis} | {"dead": 3, "missing": 0, "injured": 0} | 원천값 요청 | 미회신(회신대기) |
| DQ-042-03 | `evacuees` | 이재민·대피인원 | object{households,persons} | {"households": 116, "persons": 178} | 원천값 요청 | 미회신(회신대기) |
| DQ-042-04 | `facility_damage` | 시설피해 | object{public,private,by_type[{type,count}]} | {"public": 214, "private": 3012} | 원천값 요청 | 미회신(회신대기) |
| DQ-042-05 | `flooding` | 침수면적·침수심·기간 | object{area{value,unit},depth_m,duration,extent_ref} | {"area": {"value": null, "unit": "㎡"}, "depth_m": null} | 원천값 요청 | 미회신(회신대기) |
| DQ-042-06 | `property_damage_amount` | 재산피해액 | object{amount_krw_thousand,status(CONFIRMED | PROVISIONAL\|NOT_COLLECTED),basis(CENTRAL_CONFIRMED\|LOCAL_… | 원천값 요청 | 미회신(회신대기) |
| DQ-043-01 | `traffic_control` | 교통·도로통제 | array<object{section,direction,from,to}> | [{"section": "초량 제1지하차도", "direction": "양방향", "from": "2020… | 원천값 요청 | 미회신(회신대기) |
| DQ-044-01 | `key_actions` | 주요 조치 | array<object{type,content,agency,at}> | [{"type": "통제", "content": "지하차도 9개소 · 둔치주차장 통제", "agency":… | 원천값 요청 | 미회신(회신대기) |
| DQ-044-02 | `evacuation_actions` | 대피조치 | array<object{target,persons,shelter,at}> | [{"target": "온천천 저지대", "persons": 178, "shelter": "(대피소)"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-044-03 | `control_actions` | 통제조치 | array<object{target_type(도로 | 시설\|출입),target,at}>\|[{"target_type":"도로","target":"지하차도 9개… | 원천값 요청 | 미회신(회신대기) |
| DQ-044-04 | `cdb_stage` | 중대본·지대본 단계 | object{stage,activated_at,released_at} | {"stage": "중대본 비상 1단계", "activated_at": "2020-07-23T22:00:0… | 원천값 요청 | 미회신(회신대기) |
| DQ-044-05 | `mobilized_resources` | 동원 인력·장비·자원 | array<object{type,quantity,agency}> | [{"type": "배수펌프", "quantity": 42, "agency": "부산광역시"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-045-01 | `emergency_recovery` | 응급복구 내용·상태 | object{content,progress_pct,completed,as_of} | {"content": "배수로 준설", "progress_pct": 100, "as_of": "2020-0… | 원천값 요청 | 미회신(회신대기) |
| DQ-045-02 | `recovery_cost` | 복구비 | object{total_krw_thousand,national_krw_thousand,local_krw_t… | {"total_krw_thousand": 38400000, "national_krw_thousand": 2… | 원천값 요청 | 미회신(회신대기) |
| DQ-045-03 | `linked_projects` | 정비사업 연계 | array<object{name,status_at_event,as_of}> | [{"name": "초량 제1지하차도 진입차단시설 설치", "status_at_event": "완료(202… | 원천값 요청 | 미회신(회신대기) |
| DQ-046-01 | `report_ref` | 보고서·차수·페이지 | object{report_name,report_seq,page,evidence_ref} | {"report_name": "중대본 상황보고", "report_seq": "제7보", "evidence_… | 원천값 요청 | 미회신(회신대기) |
| DQ-046-02 | `reporting_agency_role` | 보고기관·작성자 역할 | object{agency,department,role} (개인명 제한) | {"agency": "부산광역시", "department": "재난대응과", "role": "보고기관"} | 원천값 요청 | 미회신(회신대기) |
| DQ-047-01 | `summary_report` | 중대본·상황보고서 요약 | object{report_id,title,format(markdown | html\|blocks),blocks[{type,text,items,evidence_ref}]}\|{"re… | 원천값 요청 | 미회신(회신대기) |

### DP-11 · 재난사건 이력: 위기경보 발령·해제 — `event_crisis_alert`

- 원문 조회대상: **위기경보** · 원천: SRC-009~013 재난유형별_위기경보(대국민_통합발령·산사태예보발령 등)
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01~03

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-093-01 | `crisis_alert_stage_issued` | 위기경보 단계·발령일자 | object{level(관심 | 주의\|경계\|심각),issued_at}\|{"level":"경계","issued_at":"2020-07-… | 원천값 요청 | 미회신(회신대기) |
| DQ-093-02 | `crisis_alert_released_at` | 위기경보 해제일시 | datetime (결측을 현재 발효로 추정 금지) | 2020-07-25T10:00:00+09:00 | 원천값 요청 | 미회신(회신대기) |
| DQ-093-03 | `alert_managing_department` | 관리부서 | string | 행정안전부 자연재난대응과 | 원천값 요청 | 미회신(회신대기) |
| DQ-093-04 | `stage_actions_summary` | 단계별 조치요약 | string (매뉴얼·보도자료 근거) | 위기경보 경계 발령 · 중대본 비상 1단계 가동 | 원천값 요청 | 미회신(회신대기) |

### DP-11 · 재난사건 이력: 긴급재난문자 송출 — `event_emergency_message`

- 원문 조회대상: **송출 이력** · 원천: SRC-001·002 긴급재난문자·재난문자(과거 송출이력)
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01~03

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-094-01 | `message_content_area` | 메시지 내용·수신지역 | object{content,target_area} | {"content": "[부산시] 호우경보 발효 중, 지하차도·하천변 접근 금지", "target_area… | 원천값 요청 | 미회신(회신대기) |
| DQ-094-02 | `emergency_level_hazard` | 긴급단계·재해구분 | object{level(위급 | 긴급\|안전),hazard_type}\|{"level":"긴급","hazard_type":"호우"} | 원천값 요청 | 미회신(회신대기) |
| DQ-094-03 | `message_created_at` | 생성일시 | datetime | 2020-07-23T20:12:00+09:00 | 원천값 요청 | 미회신(회신대기) |
| DQ-094-04 | `sending_agency` | 발송기관 | string | 부산광역시 | 원천값 요청 | 미회신(회신대기) |

### DP-11 · 재해대장/피해·복구(피해시설 단위) — `disaster_ledger`

- 원문 조회대상: **피해·복구** · 원천: SRC-035·040~044·056~063 재해대장(복구/응급복구/피해산출)·복구확정 피해내역·풍수해보험금
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-095-01 | `damage_overview_quantity` | 피해개요·피해물량 | object{summary,quantity{value,unit}} | {"summary": "지하차도 침수 · 차량 6대 고립", "quantity": {"value": 175… | 원천값 요청 | 미회신(회신대기) |
| DQ-096-01 | `damage_amount` | 피해금액 | object{amount_krw_thousand,category(공공 | 사유)}\|{"amount_krw_thousand":1240000,"category":"공공"} | 원천값 요청 | 미회신(회신대기) |
| DQ-096-02 | `recovery_type_progress` | 복구유형·공정률 | object{type(원상복구 | 개선복구),progress_pct}\|{"type":"원상복구","progress_pct":100} | 원천값 요청 | 미회신(회신대기) |
| DQ-096-03 | `disaster_insurance_payout` | 풍수해보험금 | object{claims,amount_krw_thousand,basis} (지역·유형별 집계, 비식별) | {"claims": 312, "amount_krw_thousand": 1870000, "basis": "시… | 원천값 요청 | 미회신(회신대기) |

### DP-11 · 민원·안전신고 처리이력 — `civil_report_history`

- 원문 조회대상: **신고·처리 이력** · 원천: 20260930 원시데이터목록: 민원·안전신고(소방 신고와 구분)
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-097-01 | `report_location` | 신고장소 | object{address,coordinates} | {"address": "부산 연제구 연산동 ○○"} | 원천값 요청 | 미회신(회신대기) |
| DQ-097-02 | `report_type_content` | 신고유형·신고내용 | object{type(침수 | 배수\|사면 등),content_summary} (개인정보 제거)\|{"type":"침수","content… | 원천값 요청 | 미회신(회신대기) |
| DQ-097-03 | `handling_status` | 처리내용·상태 | object{action,status(접수 | 처리중\|완료)}\|{"action":"배수구 준설","status":"완료"} | 원천값 요청 | 미회신(회신대기) |
| DQ-097-04 | `before_after_photos` | 전·후 사진 | array<object{asset_id,phase(전 | 후),deidentified}>\|[{"asset_id":"(사진 ID)","phase":"후","deid… | 추가 협의 | 미회신(회신대기) |
| DQ-097-05 | `repeat_report_count` | 반복 신고건수 | integer | 7 | 추가 협의 | 미회신(회신대기) |

### DP-11 · 과거 사건 당시 기상·수문 관측 — `event_observations`

- 원문 조회대상: **과거 사건 기상·수문** · 원천: 20260930 원시데이터목록: 06. 기상수문환경 (기상청·홍수통제소·댐 등)
- 조회·연결 식별자: 재난사건 ID + 피해/조치/보고/신고 레코드 ID
- 관련 요구사항: UFR-003-001-01~03

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-115-01 | `observation_point_time_source` | 관측지점·자료시각·원천 | object{station{code,name,agency},period{from,to},source} | {"station": {"code": "159", "name": "부산(ASOS)", "agency": "… | 원천값 요청 | 미회신(회신대기) |
| DQ-115-02 | `rain_wind_humidity` | 시간/누적 강우·풍속·습도 | object{max_1h,max_3h,max_12h,max_24h,max_1h_at,wind_ms,humi… | {"max_1h": 81.6, "max_3h": 202.6, "max_12h": 389.5, "max_24… | 원천값 요청 | 미회신(회신대기) |
| DQ-115-03 | `water_level_flow_dam` | 수위·유량·댐수위·방류량 | object{station{code,name},max_level_m,max_level_at,flow_cms… | {"station": {"code": "2501640", "name": "세병교(온천천)"}, "max_l… | 원천값 요청 | 미회신(회신대기) |

### DP-12 · 대피시설·대피/행동절차 — `shelter_evacuation`

- 원문 조회대상: **대피·행동절차** · 원천: SRC-141·143·146~151 통합대피소·민방위대피소·수용시설·임시주거시설 · 위기관리/풍수해 매뉴얼
- 조회·연결 식별자: 시설/매뉴얼 ID + 사건/위기단계 연결
- 관련 요구사항: UFR-003-001-03, UFR-006-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-048-01 | `shelter_name_type` | 시설명·유형 | object{name,type} | {"name": "연제구민체육공원 실내체육관", "type": "이재민임시주거시설"} | 원천값 요청 | 미회신(회신대기) |
| DQ-048-02 | `shelter_address_coord` | 주소·좌표 | object{address,admin_code,spatial_object_id} | {"address": "부산 연제구 ○○로", "admin_code": "2647000000", "spat… | 원천값 요청 | 미회신(회신대기) |
| DQ-048-03 | `shelter_capacity` | 수용가능 인원 | object{persons,as_of} | {"persons": 300, "as_of": "2025-05"} | 원천값 요청 | 미회신(회신대기) |
| DQ-048-04 | `shelter_operation_status_as_of` | 자료 기준 운영상태 | object{status_raw,as_of} (현재 개방 여부 아님) | {"status_raw": "운영", "as_of": "2025-05"} | 원천값 요청 | 미회신(회신대기) |
| DQ-048-05 | `accessibility_support` | 접근성·취약계층 지원 | object{wheelchair_access,assistive_facilities} | {"wheelchair_access": true, "assistive_facilities": "경사로"} | 원천값 요청 | 미회신(회신대기) |
| DQ-048-06 | `shelter_contact_agency` | 연락처·관리기관 | object{agency,department,phone} | {"agency": "연제구", "department": "안전총괄과", "phone": "051-000-… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-01 | `evacuation_targets` | 대피대상·대피인원 | object{households,persons,vulnerable_groups} | {"households": 40, "persons": 85, "vulnerable_groups": "반지하… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-02 | `evacuation_route_control` | 대피경로·통제구간 | object{route,control_sections[],notes} | {"route": "온천천 좌안 → 연제구민체육공원", "control_sections": ["온천천 산책… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-03 | `disaster_crisis_stage` | 재난유형·위기단계 | object{disaster_type,crisis_level,process_phase,duty_stage}… | {"disaster_type": "호우", "crisis_level": "주의", "process_phas… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-04 | `trigger_criteria` | 판단기준·발동조건 | array<object{text_raw,metric,operator,value,unit}> | [{"text_raw": "온천천 세병교 수위 3.2m 도달 시 산책로 출입 통제", "metric": "… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-05 | `stage_procedures` | 단계별 행동절차 | array<object{task_id,phase_id,title}> (DQ-147~155 연결) | [{"task_id": "(업무 ID)", "phase_id": "P2", "title": "[6-1] 상… | 원천값 요청 | 미회신(회신대기) |
| DQ-049-06 | `responsible_agencies` | 담당기관·부서 | array<object{agency,role}> | [{"agency": "부산광역시 시민안전실", "role": "주관"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-050-01 | `resources_as_of` | 자료 기준 인력·장비 | array<object{type,quantity,unit,as_of}> (현재 가용상태 아님) | [{"type": "양수기", "quantity": 20, "unit": "대", "as_of": "202… | 원천값 요청 | 미회신(회신대기) |
| DQ-050-02 | `contact_system` | 연락체계 | array<object{agency,channel}> (개인정보 보호) | [{"agency": "재난안전상황실", "channel": "(원문 연락수단)"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-051-01 | `manual_citation` | 매뉴얼명·버전·페이지 | object{manual_name,document_id,region,owner,version,doc_dat… | {"manual_name": "(부산) 풍수해 재난 현장조치 행동매뉴얼", "version": "26.7.… | 원천값 요청 | 미회신(회신대기) |
| DQ-051-02 | `action_vs_recommendation` | 실제조치/권고 구분 | enum (ACTUAL | PLAN_RECOMMENDATION)\|PLAN_RECOMMENDATION | 원천값 요청 | 미회신(회신대기) |

### DP-12 · 풍수해 현장조치 행동매뉴얼 대응 프로세스 — `response_manual_process`

- 원문 조회대상: **대피·풍수해 대응 매뉴얼** · 원천: (부산) 풍수해 재난 현장조치 행동매뉴얼(26.7.6.) PDF28~29·39·40~44·266~282
- 조회·연결 식별자: 문서 ID/버전 + 원천 표 ID + 프로세스/단계 ID + 업무 ID
- 관련 요구사항: UFR-006-001-08, 기존 단계별 행동절차·매뉴얼 상세조회 보완

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-147-01 | `manual` | 매뉴얼 식별·지역·버전 | object{id,title,disaster_types,jurisdiction,owner,version,t… | {"id": "(매뉴얼 ID)", "title": "(부산) 풍수해 재난 현장조치 행동매뉴얼", "juri… | 필수 응답 | 미회신(회신대기) |
| DQ-147-02 | `process` | 프로세스 식별·원천 표 | object{id,name,source_table_id,manual_id} | {"id": "(프로세스 ID)", "name": "부산시 재난대응 프로세스", "source_table_… | 필수 응답 | 미회신(회신대기) |
| DQ-148-01 | `phases` | 단계 ID·순서·명칭 | array<object{id,order,name,objectives,entry_condition,exit_… | [{"order": 1, "name": "징후감지"}, {"order": 2, "name": "초기대응"}… | 필수 응답 | 미회신(회신대기) |
| DQ-148-02 | `crisis_levels_duty_stages` | 위기수준·비상근무 단계의 별도 대응 | object{phase_crisis_levels[{phase_id,levels[]}],duty_rules[… | {"phase_crisis_levels": [{"phase_id": "P2", "levels": ["주의"… | 필수 응답 | 미회신(회신대기) |
| DQ-149-01 | `task_ids` | 업무 ID·원문번호·소속 단계 | array<object{id,source_number,phase_id,source_table_id,acto… | [{"id": "(업무 ID)", "source_number": "[6-1]", "phase_id": "P… | 필수 응답 | 미회신(회신대기) |
| DQ-149-02 | `task_content` | 업무명·행동내용·대상·장소 | array<object{task_id,title,action_type,action_text,targets,… | [{"title": "상황판단 및 대책회의", "action_type": "회의"}] | 필수 응답 | 미회신(회신대기) |
| DQ-149-03 | `task_hierarchy` | 하위업무·원문 표시 순서 | array<object{task_id,parent_id,child_ids[],display_order}> | [{"task_id": "(업무 ID)", "parent_id": null, "display_order":… | 필수 응답 | 미회신(회신대기) |
| DQ-150-01 | `task_roles` | 주관부서·실행기관·결정권자 | array<object{task_id,actor_id,actor_name,actor_type,role(주관 | 실행\|회의주재\|결정)}>\|[{"actor_name":"시민안전실장","role":"회의주재"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-150-02 | `collaboration_functions` | 협업기능·지원기관·협조 업무 | array<object{function_id,name,lead_dept,support_agencies[],… | [{"name": "재난상황관리", "lead_dept": "자연재난과"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-150-03 | `task_relations` | 보고·지시·요청·수신 관계 | array<object{id,type(REPORT_TO | INSTRUCT\|REQUEST\|SUPPORT),from_ref,to_ref,task_id,content… | 원천값 요청 | 미회신(회신대기) |
| DQ-151-01 | `conditions_raw` | 조건 원문·판단 입력값 | array<object{id,text_raw,input_refs,evidence_refs}> | [{"text_raw": "호우예비특보", "input_refs": ["weather_alert"]}] | 원천값 요청 | 미회신(회신대기) |
| DQ-151-02 | `conditions_parsed` | 수치조건·단위·논리·예외 | array<object{metric,operator,value,unit,logic,exceptions,pa… | [{"metric": "예보적설량", "operator": ">=", "value": 1, "unit": … | 원천값 요청 | 미회신(회신대기) |
| DQ-151-03 | `decision_rules` | 상황판단회의·승인·대체 보고 | array<object{trigger,chair,attendees,location,method,substi… | [{"trigger": "예비특보 단계부터 필요시", "location": "재대본실(15층)", "met… | 원천값 요청 | 미회신(회신대기) |
| DQ-152-01 | `task_links` | 선행·후속·동시·조건부 업무 관계 | array<object{from_task_id,to_task_id,relation(before | after\|parallel\|conditional),condition_id,evidence_refs}>\… | 원천값 요청 | 미회신(회신대기) |
| DQ-152-02 | `task_io_timing` | 업무별 입력·산출물·수행시점 | array<object{task_id,required_inputs[],outputs[],timing_raw… | [{"required_inputs": ["기상특보"], "outputs": ["상황보고"], "timing… | 원천값 요청 | 미회신(회신대기) |
| DQ-153-01 | `evacuation_control_targets` | 대피·통제 업무와 대상 연결 | array<object{task_id,target_type,target_id,target_name,rout… | [{"target_type": "지하차도", "target_name": "관내 지하차도", "unlinke… | 원천값 요청 | 미회신(회신대기) |
| DQ-153-02 | `resource_requirements` | 인력·장비·물자·시설의 원문 요구 | array<object{task_id,resource,quantity,unit}> (원문 요구량) | [{"resource": "양수기", "quantity": null, "unit": "대"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-154-01 | `evidence_locations` | 업무·조건·관계별 원문 근거 | array<object{id,manual_id,pdf_page,printed_page,section,tab… | [{"pdf_page": 40, "printed_page": 34, "source_number": "[6-… | 필수 응답 | 미회신(회신대기) |
| DQ-154-02 | `extraction_quality` | 미기재·미구축·추출실패·불일치 상태 | object{status(미기재 | 미구축\|추출실패\|출처불일치\|검토필요),missing_fields[],reasons[],conflict… | 필수 응답 | 미회신(회신대기) |
| DQ-154-03 | `instruction_kind` | 매뉴얼 지시·Agent 권고·실제 조치 구분 | enum (normative | recommended\|observed)\|normative | 필수 응답 | 미회신(회신대기) |
| DQ-155-01 | `procedure_entities` | 대화 엔터티→프로세스 상세조회 연결 | array<object{type(process | response_task),id,manual_id,version,jurisdiction,detail_ref… | 필수 응답 | 미회신(회신대기) |
| DQ-155-02 | `condition_selection` | 조회 조건과 조건 충족 판단 | object{context,task_ids[],condition_results[{task_id,result… | needs_confirmation\|not_applicable),basis}],missing_inputs[… | 필수 응답 | 미회신(회신대기) |
| DQ-155-03 | `procedure_detail_response` | 프로세스·업무 배열·출처 응답 구조 | object{manual,process,phases,tasks,actors,conditions,task_r… | {"manual": {}, "phases": [], "tasks": [], "evidence": [], "… | 필수 응답 | 미회신(회신대기) |

### DP-13 · 근거문서·원문(Passage) — `evidence_document`

- 원문 조회대상: **근거문서** · 원천: 재난메타 v0.96 · 계획·보고·매뉴얼 원문(정형화 MD, 페이지/표 주석)
- 조회·연결 식별자: 문서 ID + Passage ID + 사건/객체 참조
- 관련 요구사항: UFR-005-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-052-01 | `document_title` | 문서명 | string | 온천천 하천기본계획(변경) 보고서 (2020, 지방하천) | 원천값 요청 | 미회신(회신대기) |
| DQ-052-02 | `document_type` | 문서유형 | enum (계획 | 보고\|매뉴얼\|연보\|고시 등)\|하천기본계획 | 원천값 요청 | 미회신(회신대기) |
| DQ-052-03 | `publisher_date` | 발행기관·작성일 | object{agency,published_at} | {"agency": "부산광역시", "published_at": "2020-12-30"} | 원천값 요청 | 미회신(회신대기) |
| DQ-052-04 | `version_seq` | 버전·차수 | string | 고시 제2020-512호 | 원천값 요청 | 미회신(회신대기) |
| DQ-053-01 | `citation_location` | 인용 페이지·표·문단 | object{page,table,paragraph} | {"page": "p.312", "table": "표 3.4-9 측점별 계획홍수위 및 제방고"} | 원천값 요청 | 미회신(회신대기) |
| DQ-053-02 | `passage` | Passage·발췌 | string | 온천천 세병교 수위 3.2m 도달 시 산책로 출입 통제, 4.0m 도달 예상 시 좌안 저지대 및 반지하 가… | 원천값 요청 | 미회신(회신대기) |
| DQ-053-03 | `quote_type` | 요약/직접인용 구분 | enum (DIRECT_QUOTE | SUMMARY)\|DIRECT_QUOTE | 원천값 요청 | 미회신(회신대기) |
| DQ-054-01 | `related_objects` | 관련 사건·객체 | array<object{entity_type,entity_id,relation_type}> | [{"entity_type": "RIVER", "entity_id": "RV-2201110"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-054-02 | `document_passage_ids` | 문서ID·Passage ID | object{document_id,passage_id} | {"document_id": "DOC-B2", "passage_id": "PSG-B2-0312-01"} | 원천값 요청 | 미회신(회신대기) |
| DQ-054-03 | `source_path_collected_on` | 원천 경로·수집일 | object{source_path(내부 메타, 직접경로 비노출),collected_on} | {"collected_on": "2026-07-15"} | 원천값 요청 | 미회신(회신대기) |
| DQ-054-04 | `processing_history` | 수정·처리 이력 | array<object{step,process,tool,version,processed_at}> | [{"step": 1, "process": "PDF_PARSE", "version": "3.2.0"}] | 원천값 요청 | 미회신(회신대기) |
| DQ-055-01 | `ocr_quality_status` | 추출·OCR 품질상태 | enum (VERIFIED | TABLE_VERIFIED\|UNVERIFIED\|MISMATCH 등)\|VERIFIED | 원천값 요청 | 미회신(회신대기) |
| DQ-056-01 | `disclosure_level` | 공개등급 | enum (공개 | 제한공개\|내부전용\|비공개; PRV-05)\|공개 | 원천값 요청 | 미회신(회신대기) |
| DQ-056-02 | `original_access` | 원문 열람·다운로드 제공정보 | object{download_allowed,file_ref,format,access_url,expires_… | {"download_allowed": true, "format": "application/pdf", "ex… | 추가 협의 | 미회신(회신대기) |

### DP-14 · 위성영상(재난 전·중·후) — `satellite_imagery`

- 원문 조회대상: **재난 전·후 위성영상** · 원천: SRC-234~239 Sentinel-1(SAR)/Sentinel-2(광학) PRE·EVENT·POST (구축: 쓰리디랩스)
- 조회·연결 식별자: 재난사건 ID + 영상 ID
- 관련 요구사항: UFR-005-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-057-01 | `related_event` | 관련 사건 | object{event_master_id,disaster_type} | {"event_master_id": "T10107-20200723-0001", "disaster_type"… | 필수 응답 | 미회신(회신대기) |
| DQ-057-02 | `image_id_format_access` | 영상 식별자·형식·접근정보 | object{image_id,format(래스터 | 타일),access_method}\|{"image_id":"(영상 ID)","format":"COG/XYZ… | 원천값 요청 | 미회신(회신대기) |
| DQ-058-01 | `image_phase` | 재난 전·중·후 구분 | enum (PRE | EVENT\|POST)\|POST | 필수 응답 | 미회신(회신대기) |
| DQ-058-02 | `acquisition_time` | 촬영일시 또는 촬영기간 | object{acquired_at | from,to,timezone}\|{"acquired_at":"2020-07-25T06:20:00+09:0… | 필수 응답 | 미회신(회신대기) |
| DQ-058-03 | `satellite_sensor` | 위성·센서 | object{platform,sensor} | {"platform": "Sentinel-1", "sensor": "C-SAR"} | 원천값 요청 | 미회신(회신대기) |
| DQ-058-04 | `product_type` | 제품유형 | enum (광학 | SAR\|정사영상 등)\|SAR(GRD) | 원천값 요청 | 미회신(회신대기) |
| DQ-058-05 | `spatial_resolution_m` | 공간해상도 | number (m/pixel) | 10 | 원천값 요청 | 미회신(회신대기) |
| DQ-059-01 | `footprint` | 촬영위치·범위 | object{geometry | representative_point,event_master_id}\|{"geometry_type":"Po… | 필수 응답 | 미회신(회신대기) |
| DQ-059-02 | `crs` | 좌표계 | string | EPSG:4326 | 원천값 요청 | 미회신(회신대기) |
| DQ-060-01 | `preprocessing_status` | 전처리 상태 | string | 궤도·방사보정 완료 | 원천값 요청 | 미회신(회신대기) |
| DQ-061-01 | `labels_detections` | 라벨·탐지결과 | object{label(홍수 | 비홍수),polygon_ref,is_actual_damage:false}\|{"label":"홍수","is… | 추가 협의 | 미회신(회신대기) |
| DQ-062-01 | `comparability` | 비교 가능여부 | object{comparable,reason} | {"comparable": true, "reason": "동일 궤도·촬영각"} | 원천값 요청 | 미회신(회신대기) |
| DQ-063-01 | `availability_reason` | 보유·미보유 사유 | object{available,reason} | {"available": false, "reason": "EVENT 시점 영상 미확보"} | 원천값 요청 | 미회신(회신대기) |

### DP-15 · 침수흔적도(과거 침수기록) — `flood_trace`

- 원문 조회대상: **과거 침수기록** · 원천: SRC-069~073 침수흔적도(tb_indtmp)·심선·위선·보고서
- 조회·연결 식별자: 침수기록/공간객체 ID + 재난사건 ID
- 관련 요구사항: UFR-003-001-03, UFR-004-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-064-01 | `flood_district_name` | 침수지구명 | string | (침수지구명) | 원천값 요청 | 미회신(회신대기) |
| DQ-064-02 | `flood_boundary` | 침수경계 | object{geometry_type,spatial_object_id} | {"geometry_type": "Polygon", "spatial_object_id": "(침수흔적 공간… | 원천값 요청 | 미회신(회신대기) |
| DQ-065-01 | `flood_grade` | 침수등급 | string | (원자료 침수등급) | 원천값 요청 | 미회신(회신대기) |
| DQ-065-02 | `flood_depth_m` | 침수심 | number (m) | 0.8 | 원천값 요청 | 미회신(회신대기) |
| DQ-065-03 | `flood_area_m2` | 침수면적 | number (㎡) | 12500 | 원천값 요청 | 미회신(회신대기) |
| DQ-065-04 | `avg_flood_level` | 평균침수위 | number | 0.6 | 원천값 요청 | 미회신(회신대기) |
| DQ-066-01 | `flood_started_on` | 침수 시작일 | date | 2020-07-23 | 원천값 요청 | 미회신(회신대기) |
| DQ-066-02 | `flood_ended_on` | 침수 종료일 | date | 2020-07-24 | 원천값 요청 | 미회신(회신대기) |
| DQ-067-01 | `survey_report_page` | 근거 보고서·페이지 | object{report_name,page} | {"report_name": "침수흔적조사 보고서", "page": "(쪽)"} | 원천값 요청 | 미회신(회신대기) |

### DP-15 · 하천범람지도·도시침수지도 — `flood_hazard_map`

- 원문 조회대상: **하천범람·도시침수지도** · 원천: SRC-089~096 홍수위험지도정보제공포털 하천범람·도시침수지도
- 조회·연결 식별자: 침수기록/공간객체 ID + 재난사건 ID
- 관련 요구사항: UFR-004-002-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-114-01 | `map_kind_frequency` | 지도종류·분할축·홍수빈도 | object{map_kind(하천범람 | 도시침수),partition(유역\|행정구역),return_period_yr}\|{"map_kind":"하… | 추가 협의 | 미회신(회신대기) |
| DQ-114-02 | `admin_basin_depth_grade` | 시군구/유역코드·침수심 등급코드 | object{sgg_code,basin_code,depth_grade_code} | {"sgg_code": "2647000000", "depth_grade_code": "(침수심 등급코드)"} | 추가 협의 | 미회신(회신대기) |
| DQ-114-03 | `source_file_spatial_ids` | 원천 파일 식별자·공간객체 ID·좌표계 | object{file_id,spatial_object_id,crs} | {"file_id": "(원천 파일 식별자)", "crs": "EPSG:5186"} | 추가 협의 | 미회신(회신대기) |

### DP-16 · 공간객체 공통메타(모든 지도 객체) — `spatial_object_common`

- 원문 조회대상: **모든 지도 객체** · 원천: 20260930 공간자료 및 각 유형별 원천의 객체·좌표 메타 (아이타이쿤 적재)
- 조회·연결 식별자: 대상유형 + 객체 ID + 공간객체 ID
- 관련 요구사항: UFR-004-001-02, UFR-004-002-01, UFR-004-002-02, UFR-006-001-02

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-068-01 | `object_name` | 객체명 | string | 온천천 하류 침수위험지구(A-03) | 원천값 요청 | 미회신(회신대기) |
| DQ-068-02 | `object_type_layer` | 객체유형·레이어 | object{entity_type,layer_id} | {"entity_type": "RISK_AREA", "layer_id": "(레이어 ID)"} | 원천값 요청 | 미회신(회신대기) |
| DQ-068-03 | `source_base_date` | 출처·기준일 | object{source_org,updated_on} | {"source_org": "부산광역시", "updated_on": "2021-12-28"} | 원천값 요청 | 미회신(회신대기) |
| DQ-068-04 | `quality_provision_status` | 품질·제공상태 | enum (확정 | 잠정\|미확보)\|확정 | 원천값 요청 | 미회신(회신대기) |
| DQ-069-01 | `admin_address` | 행정구역·주소 | object{admin_code,address} | {"admin_code": "2647010500", "address": "부산광역시 연제구 연산동"} | 원천값 요청 | 미회신(회신대기) |
| DQ-069-02 | `coordinates_geometry_type` | 좌표·geometry 유형 | object{geometry_type,coordinates | geometry,crs}\|{"geometry_type":"Polygon","crs":"EPSG:4326"} | 원천값 요청 | 미회신(회신대기) |
| DQ-070-01 | `disclosure_level` | 공개등급 | enum (공개 | 제한공개\|내부전용\|비공개; PRV-05)\|공개 | 원천값 요청 | 미회신(회신대기) |
| DQ-071-01 | `detail_target` | 연계 상세 조회 대상 | object{entity_type,entity_id} | {"entity_type": "RISK_AREA", "entity_id": "RA-BSN-01"} | 원천값 요청 | 미회신(회신대기) |
| DQ-071-02 | `spatial_object_id` | spatial_object_id | string | RA-BSN-01 | 원천값 요청 | 미회신(회신대기) |

### FIRE · 소방 신고·긴급구조정보(사건 연관) — `fire_emergency_report`

- 원문 조회대상: **소방 신고·긴급구조정보** · 원천: SRC-FIRE 소방긴급구조정보(표준).xls (예시 200행, 활용 확정·T3Q 구축 예정)
- 조회·연결 식별자: 재난사건 ID ↔ 원천 번호 ↔ 진행이력 ID(구축·정의 회신)
- 관련 요구사항: UFR-003-001-01~03

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-116-01 | `reported_at` | 신고 일시 | datetime | 2020-07-23T21:35:00+09:00 | 원천값 요청 | 미회신(회신대기) |
| DQ-116-02 | `situation_ended_at` | 상황 종료 일시 | datetime | null (원천 " --" → 결측, 진행 중으로 단정 금지) | 원천값 요청 | 미회신(회신대기) |
| DQ-117-01 | `agency_code` | 기관 코드 | object{code,name} | {"code": null, "name": "부산소방재난본부"} | 원천값 요청 | 미회신(회신대기) |
| DQ-117-02 | `report_area_name` | 신고 지역 명 | string | 부산광역시 동구 | 원천값 요청 | 미회신(회신대기) |
| DQ-117-03 | `rescue_location_1` | 긴급 구조 위치 1 | string | 초량 제1지하차도 | 원천값 요청 | 미회신(회신대기) |
| DQ-118-01 | `report_content` | 신고 내용 | string | 지하차도 차량 고립 | 원천값 요청 | 미회신(회신대기) |
| DQ-118-02 | `detail_description` | 상세 내역 | string | (상세 내역) | 원천값 요청 | 미회신(회신대기) |
| DQ-118-03 | `cause_name` | 원인 명 | string | 침수 | 원천값 요청 | 미회신(회신대기) |
| DQ-119-01 | `rescue_type_1` | 긴급 구조 유형 1 명칭 | string | 구조 | 원천값 요청 | 미회신(회신대기) |
| DQ-119-02 | `rescue_type_2` | 긴급 구조 유형 2 명칭 | string | 수난 | 원천값 요청 | 미회신(회신대기) |
| DQ-119-03 | `rescue_type_3` | 긴급 구조 유형 3 명칭 | string | (유형3) | 원천값 요청 | 미회신(회신대기) |
| DQ-119-04 | `disaster_scale_code` | 재난 규모 코드 | string | (코드) | 원천값 요청 | 미회신(회신대기) |
| DQ-119-05 | `disaster_scale` | 재난 규모 | string | (규모명) | 원천값 요청 | 미회신(회신대기) |
| DQ-120-01 | `progress_class_code` | 진행 상황 구분 코드 | string | (진행 상황 구분 코드) | 원천값 요청 | 미회신(회신대기) |
| DQ-120-02 | `progress_code` | 진행 상황 코드 | string | (진행 상황 코드) | 원천값 요청 | 미회신(회신대기) |
| DQ-120-03 | `control_situation_class` | 관제 상황 구분 | string | (관제 상황 구분) | 원천값 요청 | 미회신(회신대기) |
| DQ-120-04 | `progressed_at` | 진행 일시 | datetime | 2020-07-23T21:52:00+09:00 | 원천값 요청 | 미회신(회신대기) |
| DQ-121-01 | `officer_name` | 담당자 | string (개인정보, 비식별 처리 필요) | (마스킹) | 원천값 요청 | 미회신(회신대기) |
| DQ-121-02 | `officer_phone` | 담당자 전화번호 | string (개인정보, 비식별 처리 필요) | (마스킹) | 원천값 요청 | 미회신(회신대기) |
| DQ-122-01 | `source_record_no` | 번호 | string | (원천 번호) | 원천값 요청 | 미회신(회신대기) |
| DQ-122-02 | `dt_regt` | DT REGT | datetime (원천 등록일시) | 2020-07-23T21:36:10+09:00 | 원천값 요청 | 미회신(회신대기) |
| DQ-122-03 | `link_ids` | 재난사건 ID·신고기록 ID·진행이력 ID | object{event_master_id,report_record_id,progress_id} | {"event_master_id": "T10107-20200723-0001", "report_record_… | 필수 응답 | 미회신(회신대기) |
| DQ-122-04 | `event_link` | 사건 연관 유형·연결 근거·연결 상태 | object{relation_type,basis,status} | {"relation_type": "RELATED_REPORT", "basis": "시간·지역·구조유형", … | 필수 응답 | 미회신(회신대기) |
| DQ-122-05 | `selection_criteria_time` | 자연재난 관련 선별기준·원천 기준시각 | object{criteria,source_time} | {"criteria": "자연재난 관련 구조유형", "source_time": "2026-09"} | 필수 응답 | 미회신(회신대기) |

### AG · AI 모드 상황점검 응답 — `ai_mode_check`

- 원문 조회대상: **AI 모드 상황점검 응답** · 원천: UNE 전달 기준지역·기준시각·기상특보 + T3Q 구축데이터·매뉴얼
- 조회·연결 식별자: 점검 요청 ID + 기준지역·기준시각
- 관련 요구사항: UFR-001-001-04~07

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-123-01 | `check_context` | 점검 기준지역·기준시각·요청 식별자 | object{request_id,region{admin_code,name},reference_time,al… | {"request_id": "(점검 요청 ID)", "region": {"admin_code": "2600… | 필수 응답 | 미회신(회신대기) |
| DQ-123-02 | `priority_review_judgement` | 상황확인/대응착수 우선검토 판단 | object{needs_review(boolean),review_type(상황확인 | 대응착수),summary,official_decision:false}\|{"needs_review":tru… | 필수 응답 | 미회신(회신대기) |
| DQ-123-03 | `judgement_evidence` | 판단 근거·참조 사건/문서/Passage | array<object{entity_type,entity_id,evidence_ref,passage_id}> | [{"entity_type": "EVENT", "entity_id": "T10107-20200723-000… | 필수 응답 | 미회신(회신대기) |
| DQ-123-04 | `check_items_missing_info` | 우선 확인사항·추가 확인이 필요한 정보 | object{priority_checks[],missing_info[]} | {"priority_checks": ["초량 제1지하차도 통제 기준 확인"], "missing_info":… | 필수 응답 | 미회신(회신대기) |
| DQ-124-01 | `per_alert_guidance` | 특보별 안내 | array<object{alert_type,alert_level,target_area,guidance}> … | [{"alert_type": "호우", "alert_level": "경보", "guidance": "202… | 원천값 요청 | 미회신(회신대기) |

### AG · 일반대화 후속 추천질문 — `follow_up_questions`

- 원문 조회대상: **일반대화 후속 추천질문** · 원천: T3Q Agent 응답 부가정보
- 조회·연결 식별자: 대화 ID + 응답 ID + 필요 시 관련 대상 ID
- 관련 요구사항: 관련 요구사항 대응 확인, 일반대화 이어서 질문하기

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-144-01 | `follow_up_questions` | 일반대화 후속 추천질문 목록 | array<object{question,entity_type?,entity_id?}> (없으면 빈 목록) | [{"question": "2020년 7월 사례 당시 대응조치를 시간순으로 보여줘", "entity_typ… | 필수 응답 | 미회신(회신대기) |

### COMMON · 상세조회 공통 응답(식별·제공상태·출처) — `detail_common`

- 원문 조회대상: **상세조회 공통 응답** · 원천: 모든 상세조회 응답
- 조회·연결 식별자: Agent 반환 ID ↔ 상세조회 ID ↔ 원천 식별자
- 관련 요구사항: UFR-005-001-01, UFR-008-001-01

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| DQ-125-01 | `target_ids` | 대상유형·대상 ID·관련 ID 목록 | object{target_type,target_id,related_ids[]} | {"target_type": "RISK_AREA", "target_id": "RA-BSN-01", "rel… | 필수 응답 | 미회신(회신대기) |
| DQ-125-02 | `result_status` | 조회결과 상태·빈값/미구축 사유 | object{status(SUCCESS | NO_RESULT\|DATA_NOT_AVAILABLE\|PARTIAL_SUCCESS\|FORBIDDEN\|… | 필수 응답 | 미회신(회신대기) |
| DQ-125-03 | `source_meta` | 출처·자료 기준시점·원천/가공 구분 | object{source,as_of,raw_or_derived(원천 | 가공)}\|{"source":"T3Q","as_of":"2026-09-09T09:00:00+09:00","… | 필수 응답 | 미회신(회신대기) |

### DP-09 / AI-01 · 기상특보 현황(현재, 기준지역) — `weather_alert_current`

- 원문 조회대상: **기상특보(UNE 직접 연계)** · 원천: 기상청 기상특보 조회서비스·특보구역정보 조회서비스·특보 조회 서비스(공공데이터포털) — UNE 직접 호출(기본 1분 주기, 운영설정)
- 관련 요구사항: UFR-001-001-03, UFR-001-001-05, UFR-001-001-06

| reqId | key | 라벨 | dtype | 예시 | 기준 | T3Q |
|---|---|---|---|---|---|---|
| UFR-001-001-03 | `alert_type` | 특보종류 | enum (호우\|태풍\|강풍\|홍수 등) | 호우 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `alert_level` | 특보단계 | enum (예비특보\|주의보\|경보) | 경보 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `target_area` | 대상지역 | object{area_code,name} | {"area_code": "(특보구역코드)", "name": "부산"} | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `announced_at` | 발표시각 | datetime | 2026-09-09T08:00:00+09:00 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `effective_at` | 발효시각 | datetime | 2026-09-09T08:00:00+09:00 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `release_status` | 해제상태(제공 시) | enum (발효\|변경\|해제) | 발효 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `current_state` | 현재 상태 | enum (발효중\|특보없음\|조회실패) | 발효중 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `source` | 출처 | string | 기상청 | - | 해당없음(UNE 직접 연계) |
| UFR-001-001-03 | `last_updated_at` | 최종 갱신시각 | datetime | 2026-09-09T09:01:00+09:00 | - | 해당없음(UNE 직접 연계) |

## 4. 공통 규칙 (commonRules)

1. T3Q 2차 검토회신표(155개 조회묶음/417개 세부요청)의 T3Q 회신 열(N~S: 제공여부·확정 API/필드·자료형/단위/빈값·연결키·제공시점·의견)은 현재 전부 공란 — 모든 항목 t3qStatus='미회신(회신대기)'. 본 문서는 프로젝트 지시에 따라 전 항목 제공(assumedProvided=true)을 가정한다.
2. 응답 요청 기준: '필수 응답'(T3Q 필수 제공, 미제공 시 연계 미이행으로 관리) / '원천값 요청'(원천에 있는 값 그대로) / '추가 협의'(제공 방식 미정).
3. key·dtype·example은 UNE 설계용 제안값이다. 신규 응답 필드명은 협의안이며 확정 API 명세가 아니다(회신표 A4). 예시값은 1차 API 요청서(부산 seed)·패널활용예시·원문 이미지 기반으로 인용 금지.
4. 모든 상세조회 응답은 공통으로 대상유형·대상 ID·관련 ID 목록, 조회결과 상태·빈값/미구축 사유, 출처·자료 기준시점·원천/가공 구분을 포함한다(DQ-125).
5. 조회 0건·미수집·미구축·연계실패를 구분한다. 값 누락을 0으로 대체하지 않는다(null=미제공/미수집, 0=실제 0).
6. 시각은 ISO 8601 + offset. 원천에 timezone이 없으면 임의 변환하지 않고 source_time_raw를 함께 제공한다.
7. event_master_id·object_id 등은 opaque 연결키. UNE는 ID 문자열을 재난유형·날짜·지역으로 파싱하지 않는다(재난 마스터 ID에서 지역코드 삭제 확정, T-24/T-25).
8. 계획값(자연재해저감종합계획·하천기본계획·소하천정비종합계획)은 수립/조사 기준시점과 함께 표기하며 현재 상태로 해석하지 않는다. 현행화 불명 시 current_status=UNKNOWN(LLM 추론 금지).
9. 정비·점검·작동 정보는 '자료 기준일 당시' 값이다. 현재 가동·개방·수용가능 여부로 표현하지 않는다(지하차도 설비, 대피소 운영상태, 매뉴얼 인력·장비 등).
10. UNE는 위험등급·유사도·일치도·가중치·여유고·위험도지수 등을 재계산·재산정하지 않는다(제공값 그대로 표·그래프).
11. 공간정보: 제공된 Point/Line/Polygon/GeoJSON(EPSG:4326, [경도,위도])만 사용. 지오코딩·대표점 산정·Geometry 생성·좌표변환 금지. 위치 미제공 객체는 상세만 표시하고 '위치정보 미제공' 안내.
12. 관계: 명시적 관계(relation_basis=DOCUMENT_STATED|DATA_LINKED)만 연결. 좌표 근접·명칭 일치로 관계를 만들지 않는다.
13. 공개등급: T3Q 재난메타 PRV-05 4종(공개/제한공개/내부전용/비공개) vs 1차 공통규약 3종(PUBLIC/INTERNAL/RESTRICTED) 코드 대응 미확정. v1.71 기준 두 사용자 유형(지자체 공무원·시스템 운영자) 모두 지역·자료 조회 제한 없음. 비공개는 목록에도 미노출, 열람 제한 시 Passage만 표시.
14. 개인정보: 담당자 성명·전화번호(소방 DQ-121, 지하차도 담당자 등)는 비식별/마스킹 처리 협의 대상. 민원 신고 사진은 비식별.
15. 현재 기상·수문 관측값 자동 조회·반영은 제외(v1.71: 주관기관이 실시간 기상수문 API 미제공 결정). 기상·수문 조건은 사용자 수동 입력, 기상특보만 UNE가 기상청 API로 직접 조회. 과거 사건 관측값(DQ-115)은 사건 근거자료로 별도.
16. 매뉴얼 절차: 프로세스 단계·위기수준·비상근무 단계를 별도 필드로 보존. 매뉴얼 지시(normative)/Agent 권고(recommended)/실제 조치(observed) 구분. 원문번호는 유일키가 아님. 자동 발동규칙·자동 명령 생성 금지.
17. 소방 신고정보(FIRE): 활용 확정, T3Q 재난사건 연결 구축 예정 — 연결 기준·1:N 관계 회신 대기. UNE 임의 연결 금지.
18. DP-09/10(기상관측·수문)은 조건입력 보조로 독립 결과목록을 만들지 않는다. 현재 기상특보는 UNE 직접 연계(weather_alert_current).

## 5. 데이터 구축회신(원시데이터 327행) 관련 메모

- `데이터 구축회신` 시트의 T3Q 회신 열(O~T: 수집·구축 상태, 구축 테이블·메타 ID, 사건/객체 연결키, 조회 API·제공 여부, 제공 시점, 의견)도 **전부 공란**.
- 원천 변경구분 `제외`로 표기된 원천: SRC-003 긴급재난문자(CBS), SRC-014~019 CCTV관리기관·국민안전처CCTV·자동감시망·자동우량경보·자동음성통보·재해문자전광판, SRC-032 현장CP관리, SRC-082 산사태우려지역, SRC-085 인명피해우려지역(공유플랫폼본; SRC-325 별도본으로 대체), SRC-097·098 하천범람지도 일부, SRC-111·116 지역 산사태위험, SRC-124~126 하천정보/경계/중심선(공유플랫폼본), SRC-140 관광공사 야영장, SRC-144 물놀이 사고, SRC-148 헬기장, SRC-152 승강기, SRC-228·229 재해연보·침수흔적도(영상GeoAI 목록본).
- `추가`된 원천: SRC-056~063(복구확정 피해내역·보험금 주소조인), SRC-072, SRC-084, SRC-099~101(홍수취약지구), SRC-230~242(영상GeoAI), SRC-310~327(하천 국가기본도·권역, 관제진행상황·소방출동 등), SRC-FIRE.
- 원천 분류(SRC)와 DP 조회분류는 다대다. 일대일 대응·API 개수를 확정하지 않음(T3Q 연결관계 회신 대상).
