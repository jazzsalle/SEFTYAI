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

/* ───────── 조건 프리셋 (R11 조건 시나리오) ───────── */

/** 조건 편집 창(Composer)의 수치 칸 — 항목·이름·단위(query_context.detail.conditions 에 이 글자 그대로) */
export const COND_ITEMS = [
  { item: "RAIN_1H", label: "1시간 강우", unit: "mm" },
  { item: "RAIN_3H", label: "3시간 누적 강우", unit: "mm" },
  { item: "RAIN_24H", label: "24시간 누적 강우", unit: "mm" },
  { item: "WATER_LEVEL", label: "하천 수위", unit: "m" },
  { item: "WIND_SPEED", label: "풍속", unit: "m/s" },
] as const;
export type CondItem = (typeof COND_ITEMS)[number]["item"];

/**
 * 질문별 조건 프리셋 — 조건 편집 창과 같은 칸(재난유형·발생기간·특보 종류·특보 단계·수치·키워드). 기준지역·기준시각은 넣지 않는다
 * (기준지역을 바꿔야 하는 장면은 진행자가 머리줄에서 바꾼다). 그 질문 요청에만 실리고 세션 조건(조건 편집 창 값)은 바꾸지 않는다.
 * 특보 종류·단계·강우는 가정 조건(source_type MANUAL)이다 — weather_warnings 는 만들지 않는다(R6)
 */
export interface CondPreset {
  disasterType?: string;
  periodFrom?: string;
  periodTo?: string;
  warningKind?: string;
  warningLevel?: "주의보" | "경보";
  keywords?: string[];
  conditions?: { item: CondItem; value: number }[];
}

/** 세션 조건의 칸(lib/session Cond 의 기준지역 밖 칸과 같은 이름) */
export interface CondFields {
  disasterType?: string;
  referenceTime?: string;
  periodFrom?: string;
  periodTo?: string;
  warningKind?: string;
  warningLevel?: string;
  keywords?: string[];
  conditions?: { item: string; label?: string; value: number; unit?: string }[];
}

/** 질의 접수 본문의 condition(서버 ClientCondition) — base = 기준지역(baseWire 값, 전국 null) */
export function wireCondition(base: unknown, c: CondFields) {
  return {
    base,
    disasterTypes: c.disasterType && c.disasterType !== "전체" ? [c.disasterType] : [],
    referenceTime: c.referenceTime || null,
    period: c.periodFrom || c.periodTo ? { from: c.periodFrom || null, to: c.periodTo || null } : null,
    warningKind: c.warningKind || null,
    warningLevel: c.warningLevel || null,
    keywords: c.keywords ?? [],
    conditions: c.conditions ?? [],
  };
}

/** 프리셋을 실은 condition — 기준지역만 세션 값, 나머지는 프리셋 값만(세션 조건과 섞지 않는다 — 누를 때마다·예열과 열쇠가 같게). 수치 칸 이름·단위는 조건 편집 창 글자 그대로 */
export function presetCondition(base: unknown, p: CondPreset) {
  const conditions = (p.conditions ?? []).map((x) => {
    const m = COND_ITEMS.find((i) => i.item === x.item)!;
    return { item: x.item, label: m.label, value: x.value, unit: m.unit };
  });
  return wireCondition(base, { ...p, conditions });
}

/** 가정 조건(특보 종류·단계·수치 — source_type MANUAL)이 있는가 — 있으면 조건 줄 끝에 입력창과 같은 「사용자 입력 조건」 표지를 붙인다(R6) */
export const presetManual = (p: CondPreset) => !!(p.warningKind || p.warningLevel || p.conditions?.length);

/** 질문 말풍선 「이 질문에 붙인 조건」 — 보낸 값 그대로(칸 이름은 조건 편집 창과 같게) */
export function presetLines(p: CondPreset): string[] {
  const out: string[] = [];
  if (p.disasterType) out.push(`재난유형 ${p.disasterType}`);
  if (p.periodFrom || p.periodTo) out.push(`발생기간 ${p.periodFrom ?? ""} ~ ${p.periodTo ?? ""}`);
  if (p.warningKind) out.push(`특보 종류 ${p.warningKind}`);
  if (p.warningLevel) out.push(`특보 단계 ${p.warningLevel}`);
  for (const x of p.conditions ?? []) {
    const m = COND_ITEMS.find((i) => i.item === x.item);
    out.push(`${m?.label ?? x.item} ${x.value}${m?.unit ?? ""}`);
  }
  if (p.keywords?.length) out.push(`피해·통제 키워드 ${p.keywords.join(", ")}`);
  return out;
}

/* ───────── 질문 모음 「재난담당자의 하루」 묶음 (시연 대본 v3 docs/renewal/design/11_demo_day_story.md §4·§7.3) ───────── */

export type PilotRegion = "busan" | "inje" | "yeongcheon";

/**
 * 묶음 항목 — 질문 글은 대본·녹화(harness/recordings/demo_chain_*·demo_v3) 글자 그대로({지역} 자리 없음).
 * 정의된 질문이라 자동 조회(preview)를 붙인다(R3). 보낼 때 출처는 질문 모음(LIBRARY)과 같고 cond 가 그 질문에만 실린다.
 * live = 실시간 장면(무대에서 처음 보냄 — 「시연 세트 예열」 대상 아님). base = 그 장면의 기준지역이 계정 기본과 다를 때(예열이 이 기준지역으로 보낸다 — 화면에서는 진행자가 머리줄에서 바꾼다)
 */
export interface DemoItem extends LibraryQuestion {
  regions: [PilotRegion];
  /** 대본 단계 번호 */
  scene: string;
  /** 항목 이름(대본 §7.3) */
  title: string;
  cond: CondPreset;
  live?: true;
  /** 대본의 선택 장면 */
  optional?: true;
  base?: { sido: { code: string; name: string }; sigungu?: { code: string; name: string } | null };
}

/** 장면 순서대로. 정비계획·공사를 묻는 질문은 넣지 않는다(사용자 결정 2026-10-29) */
export const DEMO_DAY: DemoItem[] = [
  // ── 부산 — 도심 침수 ──
  { id: "DD-BS-02", regions: ["busan"], scene: "5", title: "호우경보 때 지하차도 차단시설·설비", category: "통제·대피 대상", stage: "특보", live: true, preview: ["RISK_FACILITY"],
    text: "부산에 호우경보가 발효되면 동천·초량천 옆 문현지하차도·개금지하차도·초량제1지하차도의 진입차단시설 종류, 대응계획 수립 여부, 수위계측기·CCTV 같은 설비를 알려줘.",
    cond: { disasterType: "호우", warningKind: "호우", warningLevel: "경보", conditions: [{ item: "RAIN_1H", value: 50 }] } },
  { id: "DD-BS-04", regions: ["busan"], scene: "7", title: "초량동·문현동 침수흔적", category: "침수 이력", stage: "평시", preview: ["FLOOD_TRACE"],
    text: "부산 동구 초량동과 남구 문현동에 남은 침수흔적을 연도별로 지구 이름·침수 원인과 함께 보여줘.", cond: { disasterType: "호우" } },
  { id: "DD-BS-05", regions: ["busan"], scene: "8", title: "2020년 7월 집중호우 — 재해연보 쪽·특보·문자", category: "과거 피해 이력", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2020년 7월 23일~25일 부산 집중호우 사건이 재해연보 몇 쪽에 실렸는지와, 그때 부산에 내려진 홍수특보·긴급재난문자를 시간순으로 보여줘.",
    cond: { disasterType: "호우", periodFrom: "2020-07-23", periodTo: "2020-07-25" } },
  { id: "DD-BS-06", regions: ["busan"], scene: "9", title: "2023년 9월 16일 호우경보 — 대피·통제 문자", category: "특보·문자", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2023년 9월 16일 부산 호우경보 때 부산에 보낸 긴급재난문자 가운데 대피·통제 안내를 시간순으로 보여주고, 그 호우가 재해연보 몇 쪽에 실렸는지도 알려줘.",
    cond: { disasterType: "호우", periodFrom: "2023-09-16", periodTo: "2023-09-16" } },
  { id: "DD-BS-07", regions: ["busan"], scene: "10", title: "초량동 침수흔적 안 지하층 주택", category: "침수 이력", stage: "평시", preview: ["FLOOD_TRACE"],
    text: "부산 동구 초량동에서 지하층이 있는 주택 가운데 침수흔적 범위 안에 있는 집은 몇 동이고, 어느 침수흔적 지구에 속해?", cond: { disasterType: "호우" },
    base: { sido: { code: "26", name: "부산광역시" }, sigungu: { code: "26170", name: "동구" } } },
  // ── 인제 — 산사태·계곡 ──
  { id: "DD-IJ-01", regions: ["inje"], scene: "11", title: "급경사지 D·E등급과 안전점검", category: "급경사지 위험", stage: "평시", preview: ["RISK_AREA"],
    text: "인제군 급경사지 가운데 위험등급 D·E인 곳과 최근 안전점검 결과를 보여줘.", cond: { disasterType: "산사태" } },
  { id: "DD-IJ-02", regions: ["inje"], scene: "12", title: "호우주의보 때 진동리 숙박·야영장", category: "통제·대피 대상", stage: "특보",
    text: "호우주의보가 발효된 인제군 기린면 진동리에서 급경사지·산사태취약지역 200m 안에 있는 숙박시설·야영장은 어디야?",
    cond: { disasterType: "호우", warningKind: "호우", warningLevel: "주의보", conditions: [{ item: "RAIN_3H", value: 60 }] } },
  { id: "DD-IJ-04", regions: ["inje"], scene: "13-1", optional: true, title: "진동리 과거 호우·태풍 피해", category: "과거 피해 이력", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "인제군 기린면 진동리(설피골천·진동계곡 일원)에서 과거 호우·태풍 때 난 공공시설·산사태 피해를 연도별로 피해 내용·피해액과 함께 보여줘.", cond: { disasterType: "호우" } },
  { id: "DD-IJ-05", regions: ["inje"], scene: "14", optional: true, title: "2020년 9월 태풍 때 특보·문자", category: "특보·문자", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2020년 9월 1일~7일 태풍 마이삭·하이선 때 인제군에 발령된 홍수특보·기상특보와 통제·대피 안내 긴급재난문자를 시간순으로 보여줘.",
    cond: { disasterType: "태풍", periodFrom: "2020-09-01", periodTo: "2020-09-07" } },
  { id: "DD-IJ-05-R", regions: ["inje"], scene: "14", live: true, title: "2023년 9월 16일 이후 계곡·급경사지 통제 문자", category: "특보·문자", stage: "특보",
    text: "2023년 9월 16일 이후 인제군에 보낸 긴급재난문자 가운데 계곡·급경사지 출입 통제나 대피 안내가 들어간 문자를 날짜순으로 보여줘.", cond: { disasterType: "호우" } },
  { id: "DD-IJ-07-R", regions: ["inje"], scene: "15", title: "2020년 9월 태풍 피해액·복구비 합계와 근거 쪽", category: "과거 피해 이력", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2020년 9월 1일~7일 태풍 마이삭·하이선(T10105-20200901-0001) 때 인제군 공공시설 피해액·복구비 합계와 근거 문서 이름·쪽을 알려줘.", cond: { disasterType: "태풍" } },
  // ── 영천 — 소하천 범람·침수 (YC-01 예열 · YC-02 실시간 — 사용자 결정 2026-10-30: YC-01 새 질문 실측 136초라 YC-02(75초)를 무대에서 실시간으로) ──
  { id: "DD-YC-01", regions: ["yeongcheon"], scene: "16", title: "소하천이 있는 미해제 위험지구", category: "위험·취약지역", stage: "평시", preview: ["RISK_AREA"],
    text: "영천시 자연재해위험개선지구·풍수해생활권 종합정비지구 가운데 해제되지 않았고 소하천이 있는 지구를 지구명·읍면·위험등급·재해유형·지정일로 보여줘.",
    // 조건 없음 — 새 질문 글 실측(녹화 demo_v3/YC-01-v3)을 재난유형 없이 보냈다. 예열 답이 녹화(네 지구)와 같은 조건이 되게
    cond: {} },
  { id: "DD-YC-02", regions: ["yeongcheon"], scene: "17", live: true, title: "호우경보 때 북안면·신녕면·화북면 재해위험저수지", category: "통제·대피 대상", stage: "특보", preview: ["RISK_FACILITY"],
    text: "영천시에 호우경보가 발효되고 1시간 강우가 50mm일 때, 북안명주·신양·자천·오산 지구가 있는 북안면·신녕면·화북면에서 먼저 확인할 재해위험저수지를 안전등급·하류 주택 거리·하류 거주인구와 함께 알려줘.",
    cond: { disasterType: "호우", warningKind: "호우", warningLevel: "경보", conditions: [{ item: "RAIN_1H", value: 50 }] } },
  { id: "DD-YC-04", regions: ["yeongcheon"], scene: "18", title: "힌남노 때 북안면 피해·복구", category: "과거 피해 이력", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2022년 태풍 힌남노 때 영천시 북안면 공공시설 피해·복구 항목을 시설유형별로 정리하고, 당리 대평지와 명주리 북안명주 지구 일대에 피해가 있었는지도 알려줘.", cond: { disasterType: "태풍" } },
  { id: "DD-YC-05", regions: ["yeongcheon"], scene: "18-1", optional: true, title: "힌남노 때 홍수특보·문자", category: "특보·문자", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2022년 태풍 힌남노 때 영천시에 내려진 홍수특보와 긴급재난문자를 시간순으로 보여줘.", cond: { disasterType: "태풍" } },
  { id: "DD-YC-06", regions: ["yeongcheon"], scene: "18-1", optional: true, title: "2024년 7월 10일 홍수특보 시간표", category: "특보·문자", stage: "복구", preview: ["SIMILAR_EVENT"],
    text: "2024년 7월 10일 호우 때 영천시 단포교·영동교·금창교에 내려진 홍수특보를 하천별로 발령·해제 시각과 함께 보여줘.", cond: { disasterType: "호우" } },
  { id: "DD-YC-09", regions: ["yeongcheon"], scene: "19", title: "북안명주·대평지·용계리 소하천 비교 표", category: "위험·취약지역", stage: "평시", preview: ["RISK_AREA", "RISK_FACILITY"],
    text: "영천시 북안면 명주리 북안명주 지구, 당리 대평지, 용계리 소하천 제방 유실 구간(769-3 등)을 위험등급·위험지구 지정 여부·2022년 태풍 힌남노 피해액으로 비교해, 우선 점검할 구역 순서로 한 표로 정리해줘.", cond: { disasterType: "호우" } },
];
/** 브리핑 장면이 있는 지역 — 「시연 세트 예열」이 그 지역 담당자 계정의 브리핑 세트(설정 화면 「내 브리핑 항목」)도 보낸다 */
export const DEMO_DAY_BRIEFING: PilotRegion[] = ["busan"];

/** 지역 묶음(장면 순서) */
export const demoFor = (region: string) => DEMO_DAY.filter((d) => d.regions[0] === region);

/** 묶음 항목을 보낼 모양 — 화면(질문 모음 「재난담당자의 하루」)과 「시연 세트 예열」이 같이 쓴다. 출처는 질문 모음과 같다(LIBRARY → T3Q SUGGEST) */
export const demoAsk = (d: DemoItem) => ({ question: d.text, source: "LIBRARY" as const, libraryId: d.id, quickQueryId: d.quickQueryId ?? null, cond: d.cond });

export const libById = (id: string): LibraryQuestion | undefined => LIBRARY.find((q) => q.id === id) ?? DEMO_DAY.find((q) => q.id === id);

/** 지역 이름을 채운 질문 글 */
export function fillText(q: LibraryQuestion, regionName: string) {
  return q.text.replaceAll("{지역}", regionName);
}

/** 기준지역에서 쓸 수 있는 질문 (묶음 항목은 「재난담당자의 하루」 탭에만) */
export function libraryFor(region: string) {
  return LIBRARY.filter((q) => !q.id.startsWith("BR-") && (!q.regions || q.regions.includes(region as never)));
}

/**
 * 브리핑 세트 한 항목을 보낼 모양 — 화면 [브리핑 시작](explore startBriefing)과 「시연 세트 예열」이 같이 쓴다.
 * 질의문이 라이브러리 문항 그대로일 때만 문항으로(자동 조회·문항 재난유형). briefing 칸은 열쇠에 들어가지 않지만 화면과 같게 보낸다
 */
export function briefRequest(it: { key: string; q: string; preset?: string }, i: number, total: number, regionName: string) {
  const lib = it.preset ? libById(it.preset) : undefined;
  const useLib = !!lib && it.q === lib.text;
  return {
    question: it.q.replaceAll("{지역}", regionName),
    libraryId: useLib ? lib.id : null,
    quickQueryId: useLib ? lib.quickQueryId ?? null : null,
    briefing: { preset_id: "MY-BRIEFING", briefing_item_id: it.key, item_no: i + 1, item_total: total },
  };
}
