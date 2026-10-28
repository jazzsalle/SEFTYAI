/**
 * 질문 라이브러리 (R3·R11) — 부산·인제·영천용 질문을 역량질문 템플릿(harness/cq/templates.md)으로 만든 것.
 * 질문 글만 우리가 만든다. 답은 언제나 T3Q Agent 원문, 자동 조회 데이터는 T3Q Data API 원응답이다.
 * {지역} = 기준지역 이름으로 바꿔 보낸다. preview = 질문과 함께 먼저 부를 Data API (정의된 질문이라 분류가 확정적)
 */
export type PreviewApi = "RISK_AREA" | "RISK_FACILITY" | "FLOOD_TRACE" | "SIMILAR_EVENT" | "PLAN";
export type Stage = "평시" | "특보" | "비상" | "복구";

export interface LibraryQuestion {
  id: string;
  /** 시작 화면·브리핑 타일 분류(Figma) */
  category: "위험·취약지역" | "과거 피해 이력" | "통제·대피 대상" | "행동매뉴얼" | "침수 이력" | "급경사지 위험" | "계획·정비" | "특보·문자";
  stage: Stage;
  text: string;
  disasterTypes?: string[];
  preview?: PreviewApi[];
  /** T3Q 빠른질의 — QQ-03 = 행동매뉴얼 대응절차(T3Q-28) */
  quickQueryId?: string;
  /** 이 질문을 쓸 수 있는 지역(없으면 공통) */
  regions?: ("busan" | "inje" | "yeongcheon")[];
  /** 연속질의 — 앞 질문 id (이어서 묻기로 보낸다) */
  after?: string;
  template?: string;
}

/** 기본 브리핑 세트 4문항 — 상세기능요구사항 v1.72 UFR-006-001-05 [디폴트 세팅] 원문 그대로(순서 포함). 지역은 query_context 로 전달 */
export const DEFAULT_BRIEFING: string[] = ["BR-01", "BR-02", "BR-03", "BR-04"];

export const LIBRARY: LibraryQuestion[] = [
  // ── 브리핑 기본 세트 ──
  { id: "BR-01", category: "위험·취약지역", stage: "평시", text: "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?", disasterTypes: ["호우"], preview: ["RISK_AREA"], template: "T02" },
  { id: "BR-02", category: "과거 피해 이력", stage: "평시", text: "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?", disasterTypes: ["호우"], preview: ["SIMILAR_EVENT", "FLOOD_TRACE"], template: "T13" },
  { id: "BR-03", category: "통제·대피 대상", stage: "특보", text: "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?", disasterTypes: ["호우"], preview: ["RISK_FACILITY"], template: "T07" },
  { id: "BR-04", category: "행동매뉴얼", stage: "특보", text: "현장조치 행동매뉴얼상 지금 단계에서 해야 할 일은?", disasterTypes: ["호우"], quickQueryId: "QQ-03" },

  // ── 공통(지역 이름만 바뀜) ──
  { id: "LB-RISK-01", category: "위험·취약지역", stage: "평시", text: "{지역}에 지정된 재난 위험지구·산사태취약지역·급경사지·지하차도 목록을 종류별 개수로 먼저 보여줘.", disasterTypes: ["호우"], preview: ["RISK_AREA"], template: "T02" },
  { id: "LB-SLOPE-01", category: "급경사지 위험", stage: "평시", text: "{지역} 급경사지 가운데 최신 위험등급 D·E인 곳부터 점검 우선순위로 보여줘.", disasterTypes: ["산사태"], preview: ["RISK_AREA"], template: "T03" },
  { id: "LB-SLOPE-02", category: "급경사지 위험", stage: "평시", text: "{지역}의 급경사지 산사태 위험 지역 현황 — 급경사지 등급, 산사태취약지역, 붕괴위험지구 지정 상태를 정리해줘.", disasterTypes: ["산사태"], preview: ["RISK_AREA"], template: "T01" },
  { id: "LB-FT-01", category: "침수 이력", stage: "평시", text: "{지역}에서 과거에 침수됐던 곳을 연도별로 보여줘.", disasterTypes: ["호우"], preview: ["FLOOD_TRACE"], template: "T10" },
  { id: "LB-FT-02", category: "침수 이력", stage: "평시", text: "{지역}의 저지대 침수 위험 지역은 어디야? 상습침수 필지 수와 저지대 원인 침수흔적이 난 법정동을 같이 보여줘.", disasterTypes: ["호우"], preview: ["RISK_AREA", "FLOOD_TRACE"], template: "T12" },
  { id: "LB-FT-03", category: "침수 이력", stage: "평시", text: "{지역} 자연재해위험개선지구가 있는 읍면 가운데 실제로 침수흔적이 남은 적이 있는 곳은 어디고, 몇 년도에?", disasterTypes: ["호우"], preview: ["RISK_AREA", "FLOOD_TRACE"], template: "T13" },
  { id: "LB-EV-01", category: "과거 피해 이력", stage: "복구", text: "{지역}에서 과거 호우로 피해가 컸던 사례와 시설유형별 피해·복구 내역은?", disasterTypes: ["호우"], preview: ["SIMILAR_EVENT"], template: "T15" },
  { id: "LB-WARN-01", category: "통제·대피 대상", stage: "특보", text: "{지역}에 호우경보가 발효되면 먼저 확인할 대상 — 하천 500m 안 지하차도, D·E 급경사지, 지정 중인 개선지구를 알려줘.", disasterTypes: ["호우"], preview: ["RISK_FACILITY", "RISK_AREA"], template: "T07" },
  { id: "LB-PLAN-01", category: "계획·정비", stage: "평시", text: "{지역}의 자연재해위험개선지구 정비사업 내용·기간·시행기관을 정리해줘.", disasterTypes: ["호우"], preview: ["PLAN", "RISK_AREA"], template: "T25" },
  { id: "LB-MSG-01", category: "특보·문자", stage: "특보", text: "{지역}에 보낸 긴급재난문자를 재난 상황 단위로 묶으면 몇 건이고, 대피(통제) 안내가 들어간 상황은 몇 건이야?", disasterTypes: ["호우"], template: "T21" },

  // ── 부산 ──
  { id: "BS-01", category: "통제·대피 대상", stage: "특보", regions: ["busan"], text: "부산광역시 지하차도 가운데 하천 500m 안에 있는 곳을 재해위험등급과 함께 보여줘.", disasterTypes: ["호우"], preview: ["RISK_FACILITY"], template: "T06" },
  { id: "BS-02", category: "과거 피해 이력", stage: "복구", regions: ["busan"], text: "2020년 7월 부산 집중호우 때 부산광역시 침수흔적을 법정동별 건수와 침수면적 합으로 보여줘.", disasterTypes: ["호우"], preview: ["FLOOD_TRACE"], template: "T11" },
  { id: "BS-03", category: "위험·취약지역", stage: "평시", regions: ["busan"], text: "부산광역시의 자연재해위험개선지구 중 «가» 등급 지구는 어디인가요?", disasterTypes: ["호우"], preview: ["RISK_AREA"] },
  { id: "BS-04", category: "과거 피해 이력", stage: "복구", regions: ["busan"], after: "BS-02", text: "그때 부산에서 공공시설 복구 항목을 시설유형별로 정리해줘.", disasterTypes: ["호우"], template: "T16" },

  // ── 인제 ──
  { id: "IJ-01", category: "급경사지 위험", stage: "평시", regions: ["inje"], text: "인제군의 급경사지 가운데 위험등급이 높은 곳은 어디인가요?", disasterTypes: ["산사태"], preview: ["RISK_AREA"], template: "T03" },
  { id: "IJ-02", category: "급경사지 위험", stage: "평시", regions: ["inje"], text: "인제군에서 토석류 위험 산사태취약지역이 많은 읍면 순으로 알려줘.", disasterTypes: ["산사태"], preview: ["RISK_AREA"], template: "T05" },
  { id: "IJ-03", category: "침수 이력", stage: "평시", regions: ["inje"], text: "인제군에서 과거에 침수됐던 곳을 연도별로 보여줘.", disasterTypes: ["호우"], preview: ["FLOOD_TRACE"], template: "T10" },
  { id: "IJ-04", category: "급경사지 위험", stage: "평시", regions: ["inje"], after: "IJ-01", text: "그중 붕괴위험지구로 지정된 곳과 정비계획 대상은?", disasterTypes: ["산사태"], template: "T04" },

  // ── 영천 ──
  { id: "YC-01", category: "과거 피해 이력", stage: "복구", regions: ["yeongcheon"], text: "2022년 태풍 힌남노 때 영천시 공공시설 복구 항목을 시설유형별로 정리해줘.", disasterTypes: ["태풍"], preview: ["SIMILAR_EVENT"], template: "T15" },
  { id: "YC-02", category: "과거 피해 이력", stage: "복구", regions: ["yeongcheon"], text: "영천시에서 과거 호우로 피해가 컸던 사례는?", disasterTypes: ["호우"], preview: ["SIMILAR_EVENT"] },
  { id: "YC-03", category: "급경사지 위험", stage: "평시", regions: ["yeongcheon"], text: "영천시 급경사지 가운데 최신 위험등급 D·E인 곳부터 점검 우선순위로 보여줘.", disasterTypes: ["산사태"], preview: ["RISK_AREA"], template: "T03" },
  { id: "YC-04", category: "과거 피해 이력", stage: "복구", regions: ["yeongcheon"], after: "YC-02", text: "그 사례들 가운데 피해가 가장 컸던 읍면은 어디였어?", disasterTypes: ["호우"] },
];

export const libById = (id: string) => LIBRARY.find((q) => q.id === id);

/** 지역 이름을 채운 질문 글 */
export function fillText(q: LibraryQuestion, regionName: string) {
  return q.text.replaceAll("{지역}", regionName);
}

/** 기준지역에서 쓸 수 있는 질문 */
export function libraryFor(region: string) {
  return LIBRARY.filter((q) => !q.id.startsWith("BR-") && (!q.regions || q.regions.includes(region as never)));
}
