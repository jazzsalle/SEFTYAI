import openpyxl,json
wb=openpyxl.load_workbook("D:/VIBECODING/SafetyAI/seed_data/09. 주관기관 데이터 수신/27. 재난이벤트 내용(재난안전데이터과)_내용 거의 없음_260824/1.재난관리시스템/02.재난코드 정보.xlsx",read_only=True)
rows=list(wb.active.iter_rows(values_only=True))[1:]
SCOPE={"1001":"core","1005":"core","1008":"core","1015":"core","1016":"core","1041":"core","1003":"related","1004":"related","1006":"related","1007":"related","1011":"related","1012":"related","1032":"related"}
ALIAS={"1001":"RAIN","1002":"SNOW","1003":"WAVE","1004":"WIND","1005":"TYPH","1006":"SURG","1007":"STRM","1008":"TYRN","1015":"LSLD","1016":"FLOD","1041":"WNDF","1099":"ETC"}
codes=[{"code":str(r[0]),"name":r[1],"description":r[2],"alias":ALIAS.get(str(r[0])),"pilotScope":SCOPE.get(str(r[0]),"out")} for r in rows if r[0]]
out={"_meta":{"source":"seed_data/09. 주관기관 데이터 수신/27. 재난이벤트 내용(재난안전데이터과)_내용 거의 없음_260824/1.재난관리시스템/02.재난코드 정보.xlsx",
  "table":"NDMS 재난관리시스템(SDR) — TDR_CDR_BASS·TDR_SDR_OCCR_NATURE의 DSTR_TY_CD(VARCHAR 6) 코드값","count":len(codes),
  "pilotScope":{"core":"풍수해(호우·태풍·태풍ㆍ호우·산사태·홍수·풍수해) — 시범서비스 대상","related":"풍랑·강풍·폭풍해일 등 — 복합 재난명에 동반, 보조 태그로만 사용","out":"범위 외"}},
 "masterIdRule":{
  "format":"{DSTR_TY_CD}-{YYYYMMDD}-{NN}",
  "example":["1001-20200723-01","1005-20220903-01","1001-20261002-02"],
  "alias":"{ALIAS}-{YYYYMMDD}-{NN} (예: RAIN-20200723-01) — 화면 표시용 별칭, 조인키는 eventId",
  "parts":{
   "DSTR_TY_CD":"02.재난코드 정보의 4자리 공식 코드. 복합 재난은 NDMS가 부여한 대표코드(예: '6.26~7.4 호우·제7호태풍' → 1008) 사용, 동반 유형은 regions[].damageTags·title로 보존",
   "YYYYMMDD":"발생일 = NDMS DSTR_BEGIN_DE(재난시작일자) 우선. NDMS 미등록 사건(국지 사건·현재 진행 사건)은 최초 특보 발효일 또는 최초 신고일",
   "NN":"같은 발생일·같은 유형 내 순번 01부터(같은날 같은유형 100건 이상이면 3자리). 90~99는 훈련재난(DSTR_RGST_TP=9) 전용"},
  "regionRecordId":"{eventId}-{시군구 행정코드 5자리} — NDMS 복구 입력처럼 사건 1건 아래 지역별 하위 레코드(부산은 광역 26000 단위 + 구·군 내역)",
  "ndmsKeyMapping":"eventId ↔ (DSTR_YEAR, DSTR_TY_CD, DSTR_SN) 1:1 매핑을 events[].ndmsKey에 저장. 상황전파 TSD_EVT도 DSTR_YEAR/DSTR_TY_CD/DSTR_SN 컬럼을 가지므로 같은 키로 결속 가능",
  "identityRules":["태풍은 태풍번호 1개 = 1사건(마이삭·하이선처럼 NDMS가 묶어 등록한 경우 NDMS 단위를 따름)",
   "호우는 NDMS 재난 등록 단위(기간) = 1사건. 재해대장·피해내역의 재난명 표기 차이(예: '7.28~8.11 호우(12차 전환)')는 별칭 테이블로 흡수",
   "재해대장에 재난명이 없는 사건(예: 2020.7.23 부산)은 공공·사유시설 피해내역·침수흔적도의 재난명/일자로 결속",
   "기간이 긴 장마형 사건(예: 2023.6.27~7.27) 안에서 발생한 지자체 개별 상황보고(낙석 등)는 해당 사건의 지역 레코드에 귀속"]}}
out["codes"]=codes
json.dump(out,open("D:/VIBECODING/SafetyAI/data/seed/disaster_codes.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(len(codes))
