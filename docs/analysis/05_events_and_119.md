# 05. 재난 이벤트(재난마스터)·119 신고·상황보고 시드 — 스키마와 출처

작성: 2026-10-03 · 산출물 위치: `D:\VIBECODING\SafetyAI\data\seed\` · 재생성 스크립트: `scripts/build_events/` (중간 추출물은 `_work/`)

## 1. 산출물 요약

| 파일 | 건수 | 실/가상 | 내용 |
|---|---|---|---|
| `disaster_codes.json` | 47개 코드 | 실제 | NDMS 재난유형코드(02.재난코드 정보) 전체. 시범범위 표시(core/related/out)와 재난마스터 ID 규칙, 사건동일성 규칙 포함 |
| `events.json` | 33개 사건 / 57개 지역 레코드 | 실 30 · 가상 2 · 훈련 1 | 사건 단위로 특보·강우, 지역별 피해·복구·침수흔적·119·상황보고·조치를 묶음. 현재 사건에는 유사사례 상위 5건 포함 |
| `reports_119.json` | 87건 | 전부 가상(스키마는 실제) | 소방긴급구조정보(표준) 21개 컬럼 + `ext` 가공필드 |
| `situation_reports.json` | 31건 | 실 5 · 가상 26 | 재난상황보고서(별지 제1호서식) 구조 + 영천 NDMS 대처상황 입력 항목 + 상황전파 메시지 |
| `similar_case_rules.md` | — | — | 연계·유사도 규칙(별도 문서) |

- 지역 레코드: 부산 24, 인제 18, 영천 15.
- 재해대장이 연결된 사건 25건, 침수흔적도가 연결된 사건 18건(455개소). 강우값이 있는 실제 사건은 3건이다.

## 2. 출처와 쓰임새

| 출처(seed_data) | 쓰임 | 비고 |
|---|---|---|
| 09/27 `02.재난코드 정보.xlsx` | typeCode, 코드표 | 1001 호우, 1005 태풍, 1008 태풍ㆍ호우, 1015 산사태, 1016 홍수 등 |
| 09/27 `TDR_SDR_OCCR_NATURE.xlsx` (1,268행) | `ndmsKey`(연도·유형·일련번호), 발생일, 우심 여부 | 2020.7.23 부산 = 2020/1001/23 '7.23.~25. 호우, 강풍, 풍랑' |
| 09/27 SDR 테이블 정의서 | ID 규칙 근거(DSTR_YEAR+DSTR_TY_CD+DSTR_SN PK, DSTR_RGST_TP 0/1/2/3/9) | |
| 09/27 상황전파 테이블정의서 | TSD_EVT(사고)에 DSTR_YEAR/TY_CD/SN이 있어 재난마스터와 결속 가능함을 확인. TSD_EVT_DETL·TSD_TLN(타임라인) 구조를 상황전파 레코드에 반영 | NDMS 회신: 해당 테이블 '자료없음(미사용)' |
| 09/27 국가재난조사 TB_DIMS_ACDNT_I (10,114행) | 스키마만 참고(인적·물적 피해, 원인, 대응문제점 필드) | 전부 사회재난(유형 200). 3개 지역 풍수해 0건 |
| 09/9 재해대장 2010~2025 (115,563행) | `damages.publicFacilityLedger`, `recovery` | 3개 지역 실매칭 행만 사용. 단위 천원, 중앙확정값 우선 |
| 09/16 공공시설 피해내역(침수 한정) | `publicFloodItems`(주소·시설·개요·금액) | 3개 지역 59행 |
| 09/16 사유시설 피해내역(146만 행) | `privateFacility`(주택 침수 동수, 구·읍면동별) | 3개 지역 44,392행 추출. 세대 주소는 집계 후 버림 |
| 09/16 풍수해보험(주택·소상공인, 침수 한정) | `insurance`(일자·구별 건수·지급액) | 성명·증권번호·주소 제거 |
| 09/16 Raw `침수흔적도(위선)_조인현황.xlsx` (127,135행) | `floodTraces`(지구명·원인·침수심·면적·중심좌표) | EPSG:5179를 WGS84로 변환. 영천은 0건 |
| 09/30 `소방긴급구조정보(표준).xls` (2026-09-29 200행 스냅샷) | 119 레코드 스키마·값 도메인(관제상황구분 12종, 재난규모코드, 번호 형식) | 스냅샷에는 풍수해 신고가 없고 신고내용은 '-'로 마스킹됨 |
| 09/30 hwpx(국조실 협업과제)·메일 | 소방청이 '26.12까지 태풍·집중호우 관련 침수·범람 신고 이력을 공유할 예정임을 확인 | 공동이용 담당 연락처는 원문 참조 |
| 07/3 (인제) NDMS 상황보고서 hwp 8건 | 실제 상황보고 5건(풍수해 관련 4 + 훈련 1). 나머지 산불·화재 보고는 서식(제N보, 조치 타임라인, 동원 현황) 참고용 | olefile+zlib로 HWP5 본문 추출. 성명·전화번호 마스킹 |
| 07/3 (영천) 대처상황 NDMS 입력 사항.xlsx | 중간보고 `ndmsCopingStatus` 항목 구조(14개 시트) | 양식만 있고 값은 없음 → 가상값 |
| seedkit 02/07/10, 도출용 seed 샘플 3종 | 기존 목업 ID(E-BS-2020 등)와 사건 대응, 유사도 요인군, D-15 사건동일성 '미합의' 이슈 | |

## 3. events.json 스키마(요약)

```jsonc
{ "eventId": "1001-20200723-01", "aliasId": "RAIN-20200723-01",
  "typeCode": "1001", "typeName": "호우", "startDate": "2020-07-23", "endDate": "2020-07-25", "status": "종료|진행중",
  "title": "...", "summary": "...(지역별 핵심 수치 문장)", "registerType": "실재난|우심재난|9:훈련재난",
  "ndmsKey": {"DSTR_YEAR","DSTR_TY_CD","DSTR_SN","DSTR_NM","RM"},
  "weather": {"advisories":[{"type","level","issuedAt","area","status|verified"}], "maxHourlyRain_mm","totalRain_mm","station","rainfallSource",
              "byRegion": {"BS": {"hourly":[{"t","mm"}], "hydro":[...], "tide":{...}}}},   // 현재 사건만
  "regions": [{ "regionRecordId","sido","sigungu","admCode","terrain","period","crisisLevel","weatherLocal","summary","damageTags",
      "damages": {"publicFacilityLedger":{facilityCount,damage_krw_thousand,recovery_krw_thousand,byFacilityType,bySigungu|byEmd,topFacilities[]},
                  "publicFloodItems":{count,items[]}, "privateFacility":{recordCount,housing{flooded,bySigungu|byEmd,byCause}},
                  "insurance":{house,sme}, "human":{dead,missing,injured,source}},
      "recovery": {"cost_krw","damage_krw","recoveryTypes"}, "floodTraces": {count,totalArea_m2,maxDepth_m,districts,causes,records[{traceId,admCode,begin,end,district,cause,avgDepth_m,area_m2,centroid}]},
      "reports119":[ids], "situationReports":[ids], "actions":[{time,action,source}], "facts":[{fact,source}], "note" }],
  "totals": {...}, "places": ["동구 초량동", "초량1지구", ...], "facts": [...], "sources": [{key,path,kind}],
  "dataQuality": {...}, "synthetic": false, "training": false, "similarCases": {regionRecordId: [top5]} }
```

## 4. reports_119.json 스키마

- **원천 표준 컬럼 21개를 그대로 둠**: 신고일시, 상황종료일시, 기관코드, 신고지역명, 신고내용(`-`), 긴급구조위치1(`-`), 긴급구조유형1~3명칭, 상세내역, 원인명, 재난규모코드(0050001/0050002), 재난규모, 진행상황구분코드, 진행상황코드, 관제상황구분, 담당자·전화(비움), 진행일시, 번호(`1W`+10자리), DT_REGT.
- **`ext` 가공 필드**: accidentType(지하차도침수·차량고립·토사유출·낙석·하천범람우려 등), locationDetail, coord(WGS84, 동·시설 단위 근사), rescueeCount, dispatchUnit, result, callSummary, groundedOn(근거로 삼은 실데이터 행).
- 87건 구성: 현재 사건 28건(부산 12, 영천 8, 인제 8). 나머지 59건은 과거 사건 21개에 배분했고 각 신고는 실제 피해 위치에 근거한다(예: 초량1지구 침수흔적, 삼락생태공원 침수차량 81대, 고촌천 범람으로 지방도925호선 침수, 인제 상황보고서의 낙석 지점).

## 5. situation_reports.json 스키마

`reportId, eventId, regionRecordId, reportKind(초기|중간|최종|상황전파|훈련), reportNo, form, title, submittedAt, receivedAt, sender(마스킹), receiver, occurredAt, location, overview, damage{human,property,other}, actions[{time,action}], mobilization, support, outlook, weatherAtReport, ndmsCopingStatus(영천 양식), linkedReports119[], message(상황전파), synthetic, sourceType(REAL_NDMS_REPORT|SYNTHETIC|SYNTHETIC_FROM_REAL_AGGREGATES), sourceFile`

- 실제 5건: 2023.7.13 국도31호선 낙석(1보), 2023.7.24 미시령옛길 낙석(2보), 2023.10.8 미시령 정상부 낙석(2보, 강우 13mm·특보 없음), 2026.8.17 인제읍 남북리 도로 물고임(종료), 2026.7.28 집중호우 훈련(1보).
- 가상 26건: 현재 사건 초기·중간 7건, 상황전파 메시지 9건, 과거 사건 최종보고 10건. 최종보고 문장은 가상이지만 피해 수치는 실데이터 집계값이다.
- 상황전파 메시지는 "시각+장소+강우(누적)+피해+조치"를 한 줄로 묶는다. 예: `[인제군 상황실] 10-03 06:30 인제군 상남면 내린천변 야영장 — 하천고립우려(요구조자 12명) / 인제(211) ASOS 누적 144.0mm·호우특보 발효 중 / 조치: 야영객 12명 대피 유도`

## 6. 사건 목록(주요)

| eventId | 사건 | 지역 | 연결된 실데이터 |
|---|---|---|---|
| 1001-20140825-01 | 2014 8.25 부산 집중호우 | 부산·인제 | 재해대장 831건(피해 904억원), 침수흔적 87개소 |
| 1005-20161003-01 | 태풍 차바 | 부산 | 재해대장 267건, 사유시설 2,771건(주택 침수 388) |
| 1005-20191001-01 | 태풍 미탁 | 부산 | 재해대장 14건(복구비 140억원), 삼락생태공원 침수차량 |
| 1001-20200723-01 | 7.23 부산(초량 제1지하차도) | 부산 | 재해대장 미등재. 공공 28건, 사유 2,731건(주택 침수 823), 침수흔적 64개소(초량1지구 평균침수심 2.675m) |
| 1001-20200728-01 | 7.28~8.11 호우 | 인제·영천·부산 | 재해대장 154건, 침수흔적 85개소(인제) |
| 1005-20200901-01 | 마이삭·하이선 | 부산·인제·영천 | 재해대장 436건, 사유 7,240건 |
| 1005-20220903-01 | 힌남노 | 부산·영천·인제 | 영천 고촌천 범람(지방도925호선), 광안리 해일 침수 |
| 1001-20240708-01 | 7.8~19 호우 | 영천·인제 | 영천 66건, 죽림사 산사태·삼매리 진입로 유실 |
| 1001-20240919-01 | 9.19~21 부산 호우 | 부산·인제 | 사유 2,610건, 침수흔적 52개소, 조만강 제방 파손 |
| 1001-20261002-01 | [시연] 남부 호우(진행중) | 부산·영천 | 가상. 과거 피해 지점 위주로 신고 배치 |
| 1001-20261002-02 | [시연] 강원 영서 호우(진행중) | 인제 | 가상. 같은 날·같은 유형이므로 순번 02 |

## 7. 실제와 가상의 비율, 주의사항

- **사건**: 실제 30(91%) / 가상 2 / 훈련 1. 실제 사건의 피해·복구·흔적 수치는 모두 원자료 집계값이다.
- **119**: 87건 모두 가상이다(`synthetic: true`). 위치와 피해 양상은 실데이터 행에 근거하고, 근거는 `ext.groundedOn`에 적었다.
- **상황보고**: 실제 5 / 가상 26.
- **강우·특보**: 실제 사건 대부분이 미상이다(`rainfallSource: "강우자료 미확보…"`). 2014.8.25(구포 시간 130mm)와 2020.7.23(부산 81.6mm)은 "공개자료 기반 추정(검증필요)"이라 검증 전에는 인용하면 안 된다. 특보 `issuedAt`은 날짜만 넣었고 `verified:false`다.
- **인명피해**(초량 3명, 우장춘로 2명, 구평동 4명)는 공개 보도에 기반한 값이며 검증 필요 표시를 달았다.
- **개인정보**: 보고서의 성명·휴대전화, 보험의 성명·증권번호, 사유시설 세대 주소는 출력물에 넣지 않았다.

## 8. 공백(Gap)과 다음 요청

1. 기상청 ASOS/AWS 시간강우와 특보 이력: 사건 기간별 1·3·6·12·24h 최대값(부산 159, 영천 281, 인제 211)이 필요하다.
2. 소방청 119 실데이터('26.12 예정): 풍수해 유형2 코드값, 신고내용 마스킹 해제 범위, 좌표 제공 여부를 확인해야 한다.
3. NDMS 상황전파(TSD_EVT/DETL/TLN)는 '미사용 테이블'로 회신되었다. 실제 상황보고는 지자체 HWP 원문뿐이어서 NDMS 상황보고서 목록·첨부 일괄 추출을 요청해야 한다.
4. 영천 침수흔적도 0건, 영천 상황보고 원문 0건: 영천시에 실제 대처상황 입력 이력을 요청해야 한다.
5. 재난명 별칭 테이블(재해대장 ↔ 피해내역 ↔ 흔적도) T3Q 합의가 필요하다(D-15).
6. 침수흔적도 `AVG_FLDWTL` 단위가 섞여 있다(m/cm). 지금은 10 초과값을 cm로 보고 변환했으며 원자료 확인이 필요하다.
