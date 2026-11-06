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
  template?: string;
}

/**
 * 지역 질문 — 개발서버 질문 모음(data/questionLibrary.ts QuestionLibraryItems)과 글자·순서까지 같게(R51, 2026-11-06).
 * 개발서버처럼 문항 재난유형을 싣지 않는다(조건 = 세션 조건 그대로). 연속질의 질문(앞 질문을 받아 이어 묻는 글)·브리핑 문항은 개발서버에 없어 뺐다.
 * preview(자동 조회)·template(역량질문 틀)은 우리 쪽 기능이라 그대로 둔다
 */
export const LIBRARY: LibraryQuestion[] = [
  // ── 공통(지역 이름만 바뀜) ──
  { id: "LB-RISK-01", category: "위험·취약지역", stage: "평시", text: "{지역}에 지정된 재난 위험지구·산사태취약지역·급경사지·지하차도 목록을 종류별 개수로 먼저 보여줘.", preview: ["RISK_AREA"], template: "T02" },
  { id: "LB-SLOPE-01", category: "급경사지 위험", stage: "평시", text: "{지역} 급경사지 가운데 최신 위험등급 D·E인 곳부터 점검 우선순위로 보여줘.", preview: ["RISK_AREA"], template: "T03" },
  { id: "LB-SLOPE-02", category: "급경사지 위험", stage: "평시", text: "{지역}의 급경사지 산사태 위험 지역 현황 — 급경사지 등급, 산사태취약지역, 붕괴위험지구 지정 상태를 정리해줘.", preview: ["RISK_AREA"], template: "T01" },
  { id: "LB-FT-01", category: "침수 이력", stage: "평시", text: "{지역}에서 과거에 침수됐던 곳을 연도별로 보여줘.", preview: ["FLOOD_TRACE"], template: "T10" },
  { id: "LB-FT-02", category: "침수 이력", stage: "평시", text: "{지역}의 저지대 침수 위험 지역은 어디야? 상습침수 필지 수와 저지대 원인 침수흔적이 난 법정동을 같이 보여줘.", preview: ["RISK_AREA", "FLOOD_TRACE"], template: "T12" },
  { id: "LB-FT-03", category: "침수 이력", stage: "평시", text: "{지역} 자연재해위험개선지구가 있는 읍면 가운데 실제로 침수흔적이 남은 적이 있는 곳은 어디고, 몇 년도에?", preview: ["RISK_AREA", "FLOOD_TRACE"], template: "T13" },
  { id: "LB-PLAN-01", category: "계획·정비", stage: "평시", text: "{지역}의 자연재해위험개선지구 정비사업 내용·기간·시행기관을 정리해줘.", preview: ["PLAN", "RISK_AREA"], template: "T25" },
  { id: "LB-WARN-01", category: "통제·대피 대상", stage: "특보", text: "{지역}에 호우경보가 발효되면 먼저 확인할 대상 — 하천 500m 안 지하차도, D·E 급경사지, 지정 중인 개선지구를 알려줘.", preview: ["RISK_FACILITY", "RISK_AREA"], template: "T07" },
  { id: "LB-MSG-01", category: "특보·문자", stage: "특보", text: "{지역}에 보낸 긴급재난문자를 재난 상황 단위로 묶으면 몇 건이고, 대피(통제) 안내가 들어간 상황은 몇 건이야?", template: "T21" },
  { id: "LB-EV-01", category: "과거 피해 이력", stage: "복구", text: "{지역}에서 과거 호우로 피해가 컸던 사례와 시설유형별 피해·복구 내역은?", preview: ["SIMILAR_EVENT"], template: "T15" },

  // ── 부산 ──
  { id: "BS-03", category: "위험·취약지역", stage: "평시", regions: ["busan"], text: "부산광역시의 자연재해위험개선지구 중 «가» 등급 지구는 어디인가요?", preview: ["RISK_AREA"] },
  { id: "BS-01", category: "통제·대피 대상", stage: "특보", regions: ["busan"], text: "부산광역시 지하차도 가운데 하천 500m 안에 있는 곳을 재해위험등급과 함께 보여줘.", preview: ["RISK_FACILITY"], template: "T06" },
  { id: "BS-02", category: "과거 피해 이력", stage: "복구", regions: ["busan"], text: "2020년 7월 부산 집중호우 때 부산광역시 침수흔적을 법정동별 건수와 침수면적 합으로 보여줘.", preview: ["FLOOD_TRACE"], template: "T11" },

  // ── 인제 ──
  { id: "IJ-01", category: "급경사지 위험", stage: "평시", regions: ["inje"], text: "인제군의 급경사지 가운데 위험등급이 높은 곳은 어디인가요?", preview: ["RISK_AREA"], template: "T03" },
  { id: "IJ-02", category: "급경사지 위험", stage: "평시", regions: ["inje"], text: "인제군에서 토석류 위험 산사태취약지역이 많은 읍면 순으로 알려줘.", preview: ["RISK_AREA"], template: "T05" },
  { id: "IJ-03", category: "침수 이력", stage: "평시", regions: ["inje"], text: "인제군에서 과거에 침수됐던 곳을 연도별로 보여줘.", preview: ["FLOOD_TRACE"], template: "T10" },

  // ── 영천 ──
  { id: "YC-03", category: "급경사지 위험", stage: "평시", regions: ["yeongcheon"], text: "영천시 급경사지 가운데 최신 위험등급 D·E인 곳부터 점검 우선순위로 보여줘.", preview: ["RISK_AREA"], template: "T03" },
  { id: "YC-01", category: "과거 피해 이력", stage: "복구", regions: ["yeongcheon"], text: "2022년 태풍 힌남노 때 영천시 공공시설 복구 항목을 시설유형별로 정리해줘.", preview: ["SIMILAR_EVENT"], template: "T15" },
  { id: "YC-02", category: "과거 피해 이력", stage: "복구", regions: ["yeongcheon"], text: "영천시에서 과거 호우로 피해가 컸던 사례는?", preview: ["SIMILAR_EVENT"] },
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

export type PilotRegion = "busan" | "inje" | "yeongcheon";

/**
 * 질문 모음 묶음 항목(「시연」·「한눈 요약 질의」) — 질문 글은 개발서버(DemoPinSeed · dayScript) 글자 그대로({지역} 자리 없음).
 * 보낼 때 출처는 질문 모음(LIBRARY)과 같고 cond 가 그 질문에만 실린다. base = 그 질문의 기준지역(계정 기본과 다를 때 — 화면에서는 진행자가 머리줄에서 바꾼다)
 */
export interface DemoItem extends LibraryQuestion {
  regions: [PilotRegion];
  /** 장면 번호 */
  scene: string;
  /** 항목 이름 */
  title: string;
  cond: CondPreset;
  base?: { sido: { code: string; name: string }; sigungu?: { code: string; name: string } | null };
}

/**
 * 질문 모음 「시연」 탭(사용자 지시 2026-11-02 — 행안부 보고 시연) — 항목마다 미리 받은 답을 고정해 두고 누르면 바로 보인다(lib/server/jobs demoPins).
 * ① 호우 예비특보 가정 · AI 모드 브리핑 세트 4문 ② 온천천 시간당 30mm 집중호우 — 조건은 1시간 강우량 30mm만. 질문 글은 사용자가 준 원문 그대로
 */
export interface ShowItem extends DemoItem {
  group: 1 | 2;
  /** 이 질문에 싣는 가정 특보(weather_warnings) — ① 묶음은 호우 예비특보 */
  warnings?: Record<string, unknown>;
}
/** ① 묶음 가정 특보 — 사용자가 준 가상 시연 데이터 그대로(부산광역시 · 호우 · 예비특보 발표, 주의보 발표 예상 · 3시간 이내 가정) */
export const SHOW_PRE_WARNING = {
  collect_status: "COLLECTED",
  collected_at: null,
  source: "시연 시나리오(가상 특보 · 기상청 발표 아님)",
  items: [{ warning_key: "SCN-BS-PRE-1", kind: "호우", level: "예비특보", area: "부산광역시", announced_at: null, effective_at: null, change: "예비특보 발표(주의보 발표 예상 · 시연 기준시각 이후 3시간 이내 가정 · 침수·범람 발생 여부 미확인)" }],
};
export const SHOW_GROUPS: { group: 1 | 2; title: string; note: string }[] = [
  { group: 1, title: "1. 호우 예비특보 — AI 모드 브리핑", note: "부산광역시 호우 예비특보(주의보 발표 예상) 가정 · 강우 조건 입력 없음" },
  { group: 2, title: "2. 온천천 시간당 30mm 집중호우", note: "기준지역 부산광역시 · 조건은 1시간 강우량 30mm 만" },
];
// ②묶음 순서·장면 번호는 사용자 지시(2026-11-02)대로 — 항목 id(SH-2-x)는 고정 답 열쇠라 그대로 둔다. 2-3 은 질문 둘(과거 유사재난 사례 · 침수흔적도)
export const DEMO_SHOW: ShowItem[] = [
  { id: "SH-1-1", group: 1, regions: ["busan"], scene: "1-1", title: "특보 상황·관측정보·경계 기준", category: "특보·문자", stage: "특보",
    text: "온천천 유역의 기상특보 상황을 요약하고, 하천 수위 및 강우량 등 중점적으로 확인해야 할 관측정보와 관련 경계 기준을 알려주세요.", cond: {}, warnings: SHOW_PRE_WARNING, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-1-2", group: 1, regions: ["busan"], scene: "1-2", preview: ["RISK_AREA"], title: "저감종합계획 침수·범람 취약지역", category: "위험·취약지역", stage: "특보",
    text: "자연재해저감종합계획과 관련 위험지역 자료에 지정된 침수·범람 취약지역은 어디이며, 각 지역의 주요 위험요인과 지정 근거는 무엇입니까?", cond: {}, warnings: SHOW_PRE_WARNING, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-1-3", group: 1, regions: ["busan"], scene: "1-3", preview: ["SIMILAR_EVENT"], title: "과거 침수·범람 피해 사례", category: "과거 피해 이력", stage: "특보",
    text: "온천천과 주변 지역에서 과거 집중호우로 침수·범람 피해가 발생한 주요 사례는 무엇이며, 당시 강우량, 피해지역 및 피해 원인을 요약해 주세요.", cond: {}, warnings: SHOW_PRE_WARNING, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-1-4", group: 1, regions: ["busan"], scene: "1-4", title: "하천기본계획 수리·수문 정보", category: "계획·정비", stage: "특보",
    text: "온천천 하천기본계획에 수록된 계획홍수량, 계획홍수위, 제방고 및 여유고 등 주요 수리·수문 정보를 확인하고, 계획 당시 분석된 홍수 취약요인과 관련 구간을 알려주세요. 근거 문서와 수립연도도 함께 제시해 주세요", cond: {}, warnings: SHOW_PRE_WARNING, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-1", group: 2, regions: ["busan"], scene: "2-1", preview: ["RISK_AREA"], title: "침수 우선지역", category: "위험·취약지역", stage: "비상",
    text: "온천천 주변에서 과거 침수 이력과 재해위험지구 지정 현황을 기준으로 가장 먼저 확인해야 할 침수 취약지역은 어디입니까?", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-5", group: 2, regions: ["busan"], scene: "2-2", preview: ["RISK_FACILITY"], title: "침수·산사태 취약지역", category: "위험·취약지역", stage: "비상",
    text: "온천천 주변의 저지대·지하차도 등 침수 취약지역과 인접 급경사지의 붕괴·산사태 취약지역을 구분하여 알려주세요.", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-6", group: 2, regions: ["busan"], scene: "2-3", preview: ["SIMILAR_EVENT"], title: "과거 유사재난 사례", category: "과거 피해 이력", stage: "비상",
    text: "온천천과 주변 지역에서 과거 집중호우로 침수 또는 하천 범람 피해가 발생한 사례는 무엇이며, 당시 강우량과 피해지역, 대응조치는 어떠했습니까?", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-7", group: 2, regions: ["busan"], scene: "2-3", preview: ["FLOOD_TRACE"], title: "2020년 7월 23일 침수흔적도", category: "침수 이력", stage: "비상",
    text: "2020년 7월 23일 집중호우 당시 침수흔적도를 보여줘", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-2", group: 2, regions: ["busan"], scene: "2-4", title: "하천·관측소 모니터링", category: "통제·대피 대상", stage: "비상",
    text: "온천천의 범람 위험을 확인하기 위해 집중 모니터링해야 할 수위관측소와 강우관측소는 어디이며, 관련 수위 기준은 무엇입니까?", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-3", group: 2, regions: ["busan"], scene: "2-5", title: "범람·침수 발생 시점", category: "위험·취약지역", stage: "비상",
    text: "범람·침수 위험을 판단하기 위해 추가로 확인해야 할 누적강우량, 하천 수위 변화, 선행강우 및 하천시설 관련 정보는 무엇입니까? 과거 재난기록과 하천기본계획을 근거로 설명해 주세요.", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-4", group: 2, regions: ["busan"], scene: "2-6", title: "주민 대피", category: "통제·대피 대상", stage: "비상",
    text: "온천천 주변에서 우선적으로 주민 대피를 검토해야 할 지역은 어디이며, 대피 시점과 대피장소를 결정할 때 참고해야 할 기준과 행동매뉴얼은 무엇입니까?", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-8", group: 2, regions: ["busan"], scene: "2-7", title: "재난대응 절차", category: "행동매뉴얼", stage: "비상",
    text: "부산시 재난안전 담당 공무원이 온천천 주변 침수와 범람 피해를 예방하기 위해 우선 확인하고 조치해야 할 대응절차를 행동매뉴얼을 기준으로 알려주세요.", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
  { id: "SH-2-9", group: 2, regions: ["busan"], scene: "2-8", title: "상황보고서 작성", category: "행동매뉴얼", stage: "비상",
    text: "온천천 주변의 침수 취약지역, 과거 피해사례, 주요 점검대상 및 대응조치 계획을 포함하여 재난상황보고서 초안을 작성해 주세요. 확인되지 않은 실제 피해나 조치사항은 미확인으로 표시해 주세요.", cond: { conditions: [{ item: "RAIN_1H", value: 30 }] }, base: { sido: { code: "26", name: "부산광역시" } } },
];

/* ───────── 질문 모음 「한눈 요약 질의」 (개발서버 dayScript DayItems · DemoPinSeed 묶음 3~5와 글자까지 같게, 2026-11-06) ───────── */

/**
 * 한눈 요약 질의 — 답이 한눈 요약 블록으로 그려지는 질문 묶음(개발서버가 「재난담당자의 하루」 자리에 둔 것).
 * 질문마다 제 조건을 달고 다닌다(그 질문에만 — 세션 조건은 그대로). 개발서버의 noPeriod(발생기간 없음)는 우리 프리셋의 기본(periodFrom 없음 = 발생기간 안 실음)과 같다.
 * id = 개발서버 시연 고정 답(ai_demo_pin.pin_id)과 같은 열쇠 — 받아 둔 답(sa_demo_pins)도 이 id 로 짝짓는다. DD-·LB-·BR-·YC- 는 POC 문항 id 를 개발서버가 그대로 쓴 것이라
 * libById 가 POC 문항(같은 글·자동 조회)을 먼저 찾는다. similar = 개발서버 「한눈 요약 · 유사사례」 자리 → 우리는 유사사례 자동 조회(SIMILAR_EVENT)
 */
export interface DayItem extends DemoItem {
  similar?: true;
}
type DayRow = [id: string, region: PilotRegion, scene: string, stage: Stage, category: LibraryQuestion["category"], title: string, text: string, cond: CondPreset, similar?: true];
const DAY_ROWS: DayRow[] = [
  // ── 부산 — 도심 침수 ──
  ["IG-BS-01", "busan", "1", "평시", "위험·취약지역", "온천천 종합 (SH-2-8) — 홍수취약지구·침수흔적·지하차도·급경사지", "온천천 주변 침수 취약지역과 과거 침수흔적, 주요 점검대상(지하차도·급경사지)을 함께 보여줘.", {}],
  ["IG-BS-02", "busan", "2", "평시", "위험·취약지역", "동래·연제·금정 법정 취약지역 (P07-01) — 개선지구·지하차도·산사태·급경사지", "부산 동래구·연제구·금정구에 지정된 자연재해위험개선지구·인명피해우려지역·산사태취약지역·급경사지 목록을 보여줘.", {}],
  ["IG-BS-03", "busan", "3", "특보", "침수 이력", "하천 산책로·하상도로 주변 (P09-02) — 홍수취약지구·지하차도·침수흔적", "부산 온천천 하천 산책로·하상도로 주변의 침수 위험 지역은?", {}],
  ["IG-BS-04", "busan", "4", "복구", "침수 이력", "2020년 7월 23일 집중호우 (PT-01) — 침수흔적 일자별·면적", "2020년 7월 23일 부산 집중호우 때 온천천·동천 일대 침수흔적을 보여줘.", { disasterType: "호우", periodFrom: "2020-07-23", periodTo: "2020-07-25" }],
  ["IG-BS-05", "busan", "5", "복구", "침수 이력", "2023년 9월 16일 호우 (PT-01) — 침수흔적 일자별·면적", "2023년 9월 16일 부산 호우 때 침수흔적을 지구 이름·면적과 함께 보여줘.", { disasterType: "호우", periodFrom: "2023-09-16", periodTo: "2023-09-16" }],
  ["IG-BS-06", "busan", "6", "평시", "침수 이력", "동래·연제 과거 침수지역 (A-05) — 침수흔적·개선지구", "부산 동래구·연제구의 과거 침수지역은 어디야?", {}],
  ["IG-BS-07", "busan", "7", "특보", "통제·대피 대상", "침수구역 안 지하차도 (P09-01) — 지하차도 점검표", "부산 지하차도 가운데 침수흔적이나 상습침수 구역 안에 있는 곳은 어디야?", {}],
  ["IG-BS-08", "busan", "8", "특보", "통제·대피 대상", "온천천 대응수위 (C-06) — 홍수취약지구 대응수위·지하차도", "온천천 주변 홍수취약지구와 특보지점, 대응수위를 알려줘.", {}],
  ["IG-BS-09", "busan", "9", "특보", "통제·대피 대상", "동천 대응수위 (C-06) — 홍수취약지구 대응수위·개선지구", "동천 주변 홍수취약지구와 특보지점, 대응수위를 알려줘.", {}],
  ["IG-BS-10", "busan", "10", "평시", "침수 이력", "저지대 침수 위험 (A-02) — 개선지구·정비지구 사업기간", "부산에서 저지대라 비가 오면 물이 먼저 찰 만한 곳을 상습침수 지역과 과거 침수흔적 기준으로 알려줘.", {}],
  ["IG-BS-11", "busan", "11", "평시", "급경사지 위험", "점검 우선순위 (P07-04) — 급경사지 점수", "부산 위험지구를 위험등급과 안전점검 결과에 따라 점검 우선순위로 정리해줘.", {}],
  ["IG-BS-12", "busan", "12", "평시", "위험·취약지역", "온천천 하천 제원 (C-08) — 하천 값 카드", "온천천 하천 기본정보(하천 종류·수계·길이·유역면적)를 알려줘.", {}],
  // ── 인제 — 산사태·계곡 ──
  ["IG-IJ-01", "inje", "1", "특보", "통제·대피 대상", "진동리 계곡 숙박·야영장 주변 (P09-04) — 급경사지·산사태취약지역", "인제군 기린면 진동리 계곡 옆 숙박시설·야영장 주변의 급경사지와 산사태취약지역은?", {}],
  ["IG-IJ-02", "inje", "2", "평시", "급경사지 위험", "급경사지 D·E등급 (P07-04) — 급경사지 점수", "인제군 급경사지 가운데 위험등급 D·E인 곳과 최근 안전점검 결과를 보여줘.", {}],
  ["IG-IJ-03", "inje", "3", "평시", "급경사지 위험", "산사태 위험 급경사지 (A-03) — 급경사지 점수", "인제군에서 급경사지로 산사태 위험이 있는 지역은 어디야?", {}],
  ["IG-IJ-04", "inje", "4", "평시", "급경사지 위험", "산사태취약지역 (P07-01) — 등급별 개수·이름 목록", "인제군 산사태취약지역 목록을 보여줘.", {}],
  ["IG-IJ-05", "inje", "5", "복구", "침수 이력", "2020년 9월 태풍 마이삭·하이선 (PT-01) — 침수흔적 일자별·면적", "2020년 9월 태풍 마이삭·하이선 때 인제군 침수흔적을 보여줘.", { disasterType: "태풍", periodFrom: "2020-09-01", periodTo: "2020-09-07" }],
  ["IG-IJ-06", "inje", "6", "평시", "계획·정비", "개선지구 사업기간 (P07-01) — 개선지구·정비지구 간트", "인제군 자연재해위험개선지구를 사업기간·해제 여부·위험등급과 함께 보여줘.", {}],
  ["IG-IJ-07", "inje", "7", "평시", "위험·취약지역", "내린천·인북천 하천 제원 (C-08) — 하천 길이·유역면적 막대", "내린천과 인북천의 하천 종류·수계·길이·유역면적을 알려줘.", {}],
  // ── 영천 — 소하천·저수지 ──
  ["IG-YC-01", "yeongcheon", "1", "특보", "통제·대피 대상", "재해위험저수지 하류 인구 (A-14) — 저수지 하류 거주인구 막대", "영천시 재해위험저수지 가운데 하류에 주택·인구가 많은 곳은?", {}],
  ["IG-YC-02", "yeongcheon", "2", "특보", "통제·대피 대상", "금호강 대응수위 (C-06) — 홍수취약지구 대응수위", "영천시 금호강 주변 홍수취약지구와 대응수위를 알려줘.", {}],
  ["IG-YC-03", "yeongcheon", "3", "평시", "위험·취약지역", "소하천 제방 주변 위험지구 (A-14) — 개선지구·정비지구 간트", "영천시 소하천 제방 주변 자연재해위험개선지구와 과거 침수흔적을 함께 보여줘.", {}],
  ["IG-YC-04", "yeongcheon", "4", "평시", "계획·정비", "미해제 개선·정비지구 (P07-01) — 사업기간 간트", "영천시 자연재해위험개선지구와 풍수해생활권 종합정비지구 가운데 해제되지 않은 곳을 사업기간과 함께 보여줘.", {}],
  ["IG-YC-05", "yeongcheon", "5", "복구", "침수 이력", "위험지구 ∩ 침수흔적 (P08-03) — 개선지구·정비지구 간트", "영천시 계획상 위험지구 가운데 실제 침수흔적과 겹치는 곳은?", {}],
  ["IG-YC-06", "yeongcheon", "6", "평시", "위험·취약지역", "붕괴위험지역 (P07-01) — 위험도 점수·거주가구 값 카드", "영천시 붕괴위험지역을 위험도 점수·거주가구·거주인구와 함께 보여줘.", {}],
  ["IG-YC-07", "yeongcheon", "7", "평시", "위험·취약지역", "중복 지정 (P07-02) — 개선지구·붕괴위험지역", "영천시에서 같은 지점이 여러 법정 제도에 중복 지정된 곳은 어디야?", {}],
  ["IG-YC-08", "yeongcheon", "8", "평시", "급경사지 위험", "급경사지 (A-03) — 급경사지 점수", "영천시 급경사지를 위험등급·점수·최근 안전점검 결과와 함께 보여줘.", {}],
  ["IG-YC-09", "yeongcheon", "9", "특보", "통제·대피 대상", "침수 위험 지하차도 (P09-01) — 지하차도 점검표", "영천시 지하차도 가운데 침수 위험이 있는 곳은?", {}],
  // ── 유사사례 질의(개발서버 사용자 지시 57 — POC SIMILAR_EVENT 문항) · 브리핑 세트 · 조건 질의 ──
  ["DD-BS-05", "busan", "S1", "복구", "과거 피해 이력", "2020년 7월 집중호우 — 재해연보 쪽·특보·문자", "2020년 7월 23일~25일 부산 집중호우 사건이 재해연보 몇 쪽에 실렸는지와, 그때 부산에 내려진 홍수특보·긴급재난문자를 시간순으로 보여줘.", { disasterType: "호우", periodFrom: "2020-07-23", periodTo: "2020-07-25" }, true],
  ["DD-BS-06", "busan", "S2", "복구", "특보·문자", "2023년 9월 16일 호우경보 — 대피·통제 문자", "2023년 9월 16일 부산 호우경보 때 부산에 보낸 긴급재난문자 가운데 대피·통제 안내를 시간순으로 보여주고, 그 호우가 재해연보 몇 쪽에 실렸는지도 알려줘.", { disasterType: "호우", periodFrom: "2023-09-16", periodTo: "2023-09-16" }, true],
  ["SIM-SH-1-3", "busan", "S3", "특보", "과거 피해 이력", "과거 침수·범람 피해 사례", "온천천과 주변 지역에서 과거 집중호우로 침수·범람 피해가 발생한 주요 사례는 무엇이며, 당시 강우량, 피해지역 및 피해 원인을 요약해 주세요.", { disasterType: "호우" }, true],
  ["SIM-SH-2-6", "busan", "S4", "비상", "과거 피해 이력", "과거 유사재난 사례 — 3시간 누적 강우 60mm", "온천천과 주변 지역에서 과거 집중호우로 침수 또는 하천 범람 피해가 발생한 사례는 무엇이며, 당시 강우량과 피해지역, 대응조치는 어떠했습니까?", { disasterType: "호우", conditions: [{ item: "RAIN_3H", value: 60 }] }, true],
  ["LB-EV-01", "busan", "S5", "복구", "과거 피해 이력", "과거 호우 피해 큰 사례 — 시설유형별 피해·복구", "부산광역시에서 과거 호우로 피해가 컸던 사례와 시설유형별 피해·복구 내역은?", { disasterType: "호우" }, true],
  ["BR-02", "busan", "S6", "평시", "과거 피해 이력", "위험·취약지역 중 실제 피해가 났던 곳", "부산광역시 위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?", { disasterType: "호우" }, true],
  ["BF-BS-01", "busan", "B1", "특보", "위험·취약지역", "브리핑 — 위험·취약지역", "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?", {}],
  ["BF-BS-02", "busan", "B2", "특보", "과거 피해 이력", "브리핑 — 과거 피해 이력", "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?", {}],
  ["BF-BS-03", "busan", "B3", "특보", "통제·대피 대상", "브리핑 — 통제·대피 대상", "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?", {}],
  ["BF-BS-04", "busan", "B4", "특보", "통제·대피 대상", "브리핑 — 홍수취약지구", "우리 지역 하천의 홍수취약지구와 특보지점, 대응수위를 알려줘", {}],
  ["CQ-BS-01", "busan", "C1", "비상", "위험·취약지역", "조건 질의 — 3시간 70mm · 지하차도 우선 위험지역", "재난상황 조건에서 가장 먼저 확인해야 할 우선 위험지역은?", { disasterType: "호우", keywords: ["지하차도"], conditions: [{ item: "RAIN_3H", value: 70 }] }],
  ["CQ-BS-02", "busan", "C2", "비상", "과거 피해 이력", "이어 묻기 — 초량제1지하차도 당시 피해", "당시 발생한 피해내용은?", { disasterType: "호우", keywords: ["지하차도"], conditions: [{ item: "RAIN_3H", value: 70 }] }],
  ["DD-IJ-04", "inje", "S1", "복구", "과거 피해 이력", "진동리 과거 호우·태풍 피해", "인제군 기린면 진동리(설피골천·진동계곡 일원)에서 과거 호우·태풍 때 난 공공시설·산사태 피해를 연도별로 피해 내용·피해액과 함께 보여줘.", { disasterType: "호우" }, true],
  ["DD-IJ-05", "inje", "S2", "복구", "특보·문자", "2020년 9월 태풍 때 특보·문자", "2020년 9월 1일~7일 태풍 마이삭·하이선 때 인제군에 발령된 홍수특보·기상특보와 통제·대피 안내 긴급재난문자를 시간순으로 보여줘.", { disasterType: "태풍", periodFrom: "2020-09-01", periodTo: "2020-09-07" }, true],
  ["DD-IJ-07-R", "inje", "S3", "복구", "과거 피해 이력", "2020년 9월 태풍 피해액·복구비 합계와 근거 쪽", "2020년 9월 1일~7일 태풍 마이삭·하이선(T10105-20200901-0001) 때 인제군 공공시설 피해액·복구비 합계와 근거 문서 이름·쪽을 알려줘.", { disasterType: "태풍" }, true],
  ["YC-02", "yeongcheon", "S1", "복구", "과거 피해 이력", "과거 호우 피해 큰 사례", "영천시에서 과거 호우로 피해가 컸던 사례는?", { disasterType: "호우" }, true],
  ["DD-YC-04", "yeongcheon", "S2", "복구", "과거 피해 이력", "힌남노 때 북안면 피해·복구", "2022년 태풍 힌남노 때 영천시 북안면 공공시설 피해·복구 항목을 시설유형별로 정리하고, 당리 대평지와 명주리 북안명주 지구 일대에 피해가 있었는지도 알려줘.", { disasterType: "태풍" }, true],
  ["DD-YC-05", "yeongcheon", "S3", "복구", "특보·문자", "힌남노 때 홍수특보·문자", "2022년 태풍 힌남노 때 영천시에 내려진 홍수특보와 긴급재난문자를 시간순으로 보여줘.", { disasterType: "태풍" }, true],
  ["DD-YC-06", "yeongcheon", "S4", "복구", "특보·문자", "2024년 7월 10일 홍수특보 시간표", "2024년 7월 10일 호우 때 영천시 단포교·영동교·금창교에 내려진 홍수특보를 하천별로 발령·해제 시각과 함께 보여줘.", { disasterType: "호우", periodFrom: "2024-07-10", periodTo: "2024-07-10" }, true],
];
export const DAY_ITEMS: DayItem[] = DAY_ROWS.map(([id, region, scene, stage, category, title, text, cond, similar]) => ({
  id, regions: [region], scene, stage, category, title, text, cond,
  ...(cond.disasterType ? { disasterTypes: [cond.disasterType] } : {}),
  ...(similar ? { similar, preview: ["SIMILAR_EVENT"] as PreviewApi[] } : {}),
}));
/** 그 지역의 한눈 요약 질의(시범 지역이 아니면 빈 목록) */
export const dayItemsFor = (region: string) => DAY_ITEMS.filter((d) => d.regions[0] === region);

/** 묶음 항목을 보낼 모양 — 질문 모음 「시연」·「한눈 요약 질의」. 출처는 질문 모음과 같다(LIBRARY → T3Q SUGGEST) */
export const demoAsk = (d: DemoItem) => ({ question: d.text, source: "LIBRARY" as const, libraryId: d.id, quickQueryId: d.quickQueryId ?? null, cond: d.cond });

export const libById = (id: string): LibraryQuestion | undefined =>
  LIBRARY.find((q) => q.id === id) ?? DEMO_SHOW.find((q) => q.id === id) ?? DAY_ITEMS.find((q) => q.id === id);

/** 지역 이름을 채운 질문 글 */
export function fillText(q: LibraryQuestion, regionName: string) {
  return q.text.replaceAll("{지역}", regionName);
}

/** 기준지역에서 쓸 수 있는 지역 질문 (시범 지역이 아니면 공통 질문만) */
export function libraryFor(region: string) {
  return LIBRARY.filter((q) => !q.regions || q.regions.includes(region as never));
}

/**
 * 브리핑 세트 한 항목을 보낼 모양 — 화면 [브리핑 시작](explore startBriefing). 개발서버처럼 질의문 그대로(문항·자동 조회 없음, 출처 BRIEFING).
 * briefing 칸은 재사용 열쇠에 들어가지 않는다
 */
export function briefRequest(it: { id: string; question: string }, i: number, total: number, regionName: string) {
  return {
    question: it.question.replaceAll("{지역}", regionName),
    libraryId: null,
    quickQueryId: null,
    briefing: { preset_id: "MY-BRIEFING", briefing_item_id: it.id, item_no: i + 1, item_total: total },
  };
}
