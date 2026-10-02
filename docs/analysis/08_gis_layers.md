# 08. GIS 레이어 (시범지역 하천·행정구역)

- 작성일: 2026-10-03
- 대상 지역: 부산광역시(16개 구·군), 경상북도 영천시, 강원특별자치도 인제군
- 결과물 위치: `data/geo/` (모든 GeoJSON은 **EPSG:4326 lon/lat**, 좌표는 소수점 6자리 반올림, OpenLayers에서는 `dataProjection: 'EPSG:4326'`, `featureProjection: 'EPSG:3857'`로 읽으면 됨)

## 1. 원천 데이터와 CRS

| 원천 | 파일 | 원본 CRS (.prj 확인) | 비고 |
|---|---|---|---|
| SGIS 행정동 경계 | `09.../002. 행정동_GIS정보/BND_ADM_DONG_PG.shp` (3,559개, 2025-06-30) | **EPSG:5186** (KGD2002 Central Belt 2010, FE 200000 / FN 600000). 예상과 달리 5179가 아님 | DBF 인코딩 cp949. 필드 `BASE_DATE, ADM_CD(8자리 SGIS 코드), ADM_NM` |
| 행정동-법정동 연계 | `001.../국가데이터처_법정동 연계정보_20250602.csv` | - | cp949. `행정구역코드`(SGIS 8자리) → `법정동코드`(10자리) 연계에 사용 |
| 국가기본도 하천중심선 | `TN_RIVER_CTLN` (3,224,769개, zip 내 단일 shp ≈1GB, DBF ≈830MB) | **EPSG:5179** (Korea 2000 Unified CS) | 도엽/시도 분할 없음 |
| 국가기본도 실폭하천 | `TN_RIVER_BT` (28,262 polygon) | EPSG:5179 | 속성에 하천명 없음 (NF_ID, 측량정보만) |
| 국가기본도 하천경계 | `TN_RIVER_BNDRY` (140,851 polygon) | EPSG:5179 | 속성에 하천명 없음 → 이번 산출물에는 미사용 (실폭하천으로 대체) |
| 소하천구역(연속주제) | `LSMD_CONT_UJ301_5174_{부산(26),경북(47),강원특별자치도(51)}` | **EPSG:5174** (Bessel, Modified Central Belt) | 변환 시 `+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43` 적용. 결과를 국가기본도 중심선과 교차 검증(이름 일치 22건 모두 중심선과 교차, 오차 ≈0 m) |
| 전국하천표준데이터 | `전국하천표준데이터.csv` (2,557행, cp949) | 시점/종점 위경도(일부만) | **인제군 행 없음**(강원은 동해시만 제공), 부산 49행, 영천 25행. 유역면적 필드는 없음 |

## 2. 코드 체계

| 지역 | SGIS 코드(행정동 shp) | 법정 시군구 코드(산출물 `code`) |
|---|---|---|
| 부산광역시 | `21xxx` (기장군은 `21510`) | `26xxx` (예: 해운대구 26350, 기장군 26710) |
| 영천시 | `37070` | `47230` |
| 인제군 | `32590` | `51810` (소하천구역에 구코드 `42810`이 오면 51810으로 치환) |

산출물의 시군구 `code`는 법정 5자리, `sgisCode`는 SGIS 5자리를 함께 둠. 행정동 `code`는 SGIS 8자리 `ADM_CD`.

## 3. 테이블정의서 필드 매핑

- 하천중심선: `NF_ID`(고유ID), `RIVER_NO`(하천번호), `RIVER_NM`(하천명), `RIVER_SE`(하천구분: RVC001 국가하천 / RVC002 지방하천 / RVC003 소하천 / RVC004 기타하천 / RVC005 세류), `MESRMTH_SE`(P 사진측량 / F 현황측량 / C 지적측량), 일시 필드.
- 실폭하천·하천경계: `NF_ID` + 측량/등록 메타만 존재 (하천명 없음).
- LSMD_CONT(용도지역지구도 표준): `MNUM`(관리번호), `ALIAS`(별칭=소하천명), `REMARK`(비고, ALIAS가 비면 이름으로 사용), `NTFDATE`(고시일자), `SGG_OID`, `COL_ADM_SE`(원천 시군구 법정코드 5자리).
- 표준데이터: 하천코드, 하천명, 제1/2지류명, 하천구분명, 지정근거, 시점/종점(주소·위경도), 하천길이(km), 계획홍수량/홍수위/하폭, 관리기관 등.

## 4. 처리 과정

1. 행정동 shp에서 3개 지역 행정동(228개: 부산 206, 영천 16, 인제 6)을 추출, `buffer(0)` 정리 후 시군구별 dissolve(18개).
2. 지역 경계를 5179로 변환해 각 하천 레이어를 bbox 필터 + 정밀 교차로 추출(중심선: 부산 20,956 / 영천 31,853 / 인제 69,264 세그먼트).
3. 중심선: **하천명(RIVER_NM)이 있는 세그먼트만** 사용(무명 세류·소하천 세그먼트는 지도 노출 대상에서 제외). 지역 경계로 clip → 같은 이름끼리 `linemerge` → 1.5 km 이상 떨어진 같은 이름 조각은 별개 하천으로 분리(단, 같은 RIVER_NO를 공유하면 저수지/복개 구간으로 보고 하나로 유지). 150 m 미만 경계 조각(인접 지역 하천의 끝)은 제거.
4. 등급: 중심선 RIVER_SE 길이 비중(국가/지방/소하천이 20% 이상이면 우선) → 표준데이터 `하천구분명`이 더 상위 등급이면 표준데이터 우선(예: 수영강은 기본도상 지방하천 구간이 많지만 표준데이터상 국가하천). 기본도 기준 등급은 `gradeMap`으로 보존.
5. riverId: `RV-{BS|YC|IJ}-NNNN`, 지역별로 등급(국가→지방→소하천) → 길이 내림차순 → 이름 순으로 부여(동일 원천이면 재실행 시 동일).
6. 표준데이터 조인: 하천명(+별칭 `신령천↔신녕천`) 일치 & 제공기관/관리기관/시점·종점 주소에 지역명(부산/영천/인제) 포함. 후보 여러 개면 제공기관에 지역명이 있는 행, 채워진 필드가 많은 행 우선. `standardMatches`에 후보 수 기록.
7. 실폭하천: 지역 clip 후 중심선과 교차 길이가 가장 긴 하천의 riverId 부여. 두 개 이상 하천이 각각 200 m 이상 지나는 합류부 폴리곤(예: 낙동강+서낙동강, 소양강+내린천+인북천)은 중심선 40 m 간격 시드의 Voronoi로 분할(`split:true`). 하천과 매칭 안 되는 2,000 m² 미만 폴리곤(연못 등)은 제거, 그 이상은 `riverId:null`로 유지.
8. 소하천구역: `COL_ADM_SE`로 지역 필터, 5174→5179(단순화)→4326. 이름이 같은 지역 중심선이 있으면 `riverId` 연결(22건).

### 단순화(Douglas–Peucker, 투영좌표계 미터 단위)

| 레이어 | 투영 CRS | 허용오차 |
|---|---|---|
| admin_emd | 5186 | 10 m (topology 보존) |
| admin_sigungu | 5186 | 15 m (topology 보존) |
| rivers_centerline | 5179 | 8 m |
| rivers_area | 5179 | 12 m (topology 보존) |
| small_river_zones | 5179 | 8 m (topology 보존) |

## 5. 산출물

| 파일 | 피처 수 | 크기 | 주요 속성 |
|---|---|---|---|
| `admin_sigungu.geojson` | 18 (부산 16 + 영천 + 인제) | 0.22 MB | code(법정5), sgisCode, sido, sigungu, center[lon,lat], emdCount |
| `admin_emd.geojson` | 228 | 0.70 MB | code(SGIS8), sido, sigungu, sigunguCode, emd, center |
| `rivers_centerline.geojson` | 186 (부산 37 / 영천 48 / 인제 101) | 0.27 MB | riverId, name, label(동명 하천 구분용, 유일), grade, gradeMap, region, regionName, sigungu[], sigunguCodes[], length_km, riverNo, std_* (표준데이터 요약) |
| `rivers_area.geojson` | 881 (부산 338 / 영천 313 / 인제 230) | 1.37 MB | id(RA-..), nfId, riverId, name, otherRiverIds, split, region, sigungu[], area_m2 |
| `small_river_zones.geojson` | 808 (부산 50 / 영천 115 / 인제 643), 이름 있음 763 | 0.74 MB | id(SR-{MNUM}), mnum, name, sigungu, sigunguCode, region, ntfDate, riverId, area_m2 |
| `rivers_index.json` | 186 | 0.09 MB | riverId, name, label, grade, region, regionName, sigungu[], bbox, center, length_km, aliases, standardAttrs, standardMatches, hasArea, smallRiverZoneIds |
| `regions.json` | 3 | 5 KB | id, name, fullName, code, sgisCode, bbox, center, zoom, riverCount, sigungu[{code,name,center,bbox}] |

등급 분포: 부산 국가 5·지방 32 / 영천 국가 1·지방 23·소하천 24 / 인제 국가 1·지방 17·소하천 83. 표준데이터 매칭 46/186(부산·영천 지방·국가하천 대부분, 인제 0).

## 6. 지역별 주요 하천 (riverId)

- 부산: 서낙동강 RV-BS-0001, 낙동강 0002, 평강천 0003, 맥도강 0004, 수영강 0005(국가), 온천천 0007, 좌광천, 장안천, 철마천, 대천천, 석대천, 동천, 춘천, 학장천, 삼락천. 송정천은 3개 별개 하천(해운대·기장 / 기장·금정 / 강서구)으로 분리되어 `label`로 구분.
- 영천: 금호강 RV-YC-0001(국가), 신령천 0002(표준데이터·질의 표기 "신녕천" → `aliases`), 고현천, 자호천, 임고천, 고촌천, 북안천, 대창천.
- 인제: 소양강 RV-IJ-0001(국가), 내린천 0002, 방태천, 인북천, 북천 0005, 우각천, 영실천, 한계천.

## 7. 연동 가이드 (채팅 ↔ 지도)

- 채팅 에이전트는 `rivers_index.json`의 `name`/`aliases`/`label`로 엔티티를 인식하고 `riverId`를 응답 메타에 포함.
- 지도는 `rivers_centerline`과 `rivers_area`의 `riverId`로 동시 하이라이트, `bbox`로 `view.fit`, 소하천구역은 `smallRiverZoneIds` 또는 `riverId`로 연결.
- 동명이 하천(예: 송정천)은 지역+시군구로 모호성 해소, `label` 사용 권장.

## 8. 한계 / 후속

- 하천경계(TN_RIVER_BNDRY)는 하천명이 없어 이번에는 미사용(필요 시 실폭하천과 동일한 공간 매칭으로 추가 가능).
- 무명 세류/소하천 중심선은 제외 → 소하천구역 레이어로 보완.
- 표준데이터에 인제군·유역면적 정보 없음 → 인제 하천 속성은 국가기본도 값(등급, 길이)만 제공.
- 처리 스크립트: 세션 scratchpad `gis/step1.py`(추출), `gis/build.py`(산출) — 임시 위치이므로 재현이 필요하면 프로젝트 `scripts/`로 이관 필요. 압축 해제 원본(약 2.6 GB)은 작업 후 삭제함.
