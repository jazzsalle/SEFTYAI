import "server-only";
import type { DisasterType, QueryContext, RegionId } from "../contract/agent";

/**
 * 재난상황 조건 시나리오 (수문정보 직접 입력 프리셋)
 * - 실시간 수문 API를 연결하지 않으므로, 담당자가 입력할 조건을 시연용으로 미리 묶어 둠
 * - 업무 단계(workflow)별로 정리 : 평시 → 사전대비 → 초기대응 → 비상대응 → 피해·신고 → 복구 → 재발방지
 */
export type WorkflowStage = "평시 점검" | "사전대비(예비특보)" | "초기대응(주의보)" | "비상대응(경보)" | "피해·신고 대응" | "수습·복구" | "재발방지·계획";

export interface ConditionScenario {
  id: string;
  region: Exclude<RegionId, "national"> | "national";
  stage: WorkflowStage;
  title: string;
  summary: string;
  disasterType: DisasterType;
  advisory?: { type: string; level: "경보" | "주의보" | "예비특보" };
  hydro: NonNullable<QueryContext["hydro"]>;
  keywords?: string[];
  /** 진행 중 시연 사건(119·상황보고)을 함께 쓰는지 */
  useEvent: boolean;
  question: string;
  chain: string[];
  cq: string[];
}

export const CONDITION_SCENARIOS: ConditionScenario[] = [
  {
    id: "BS-PREP", region: "busan", stage: "사전대비(예비특보)", title: "부산 · 호우 예비특보 · 내일 새벽 최대 60mm 예상",
    summary: "예비특보 발표 / 3시간 누적 예상 70mm / 만조 04시", disasterType: "호우", advisory: { type: "호우", level: "예비특보" },
    hydro: { rain3h: 70, rainTotal: 120, tide: true }, keywords: ["지하차도", "하천변"], useEvent: false,
    question: "호우 예비특보가 나왔습니다. 오늘 밤 미리 점검해야 할 곳과 준비할 일은?",
    chain: ["예비특보 단계에서 하천 진·출입은 언제 통제하나요?", "작년에 비슷한 예보 때 실제 피해가 있었나요?", "지금 상황에서 비상 몇 단계이고 대책본부를 가동해야 하나요?"],
    cq: ["KG-CQ-012", "CQ-RSP-004", "KG-CQ-093"],
  },
  {
    id: "BS-ALERT", region: "busan", stage: "비상대응(경보)", title: "부산 · 호우경보 · 시간당 58.5mm · 누적 196mm (진행 중 사건)",
    summary: "호우경보 02:30 · 03시 58.5mm/h · 119 신고 12건", disasterType: "호우", advisory: { type: "호우", level: "경보" },
    hydro: { rain1h: 58.5, rain3h: 93, rainTotal: 196.5 }, useEvent: true,
    question: "지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?",
    chain: ["지금 먼저 통제해야 할 도로와 지하차도는?", "대피가 필요한 지역과 대상은?", "비슷한 강우 때 과거에 어디가 침수됐나요?"],
    cq: ["KG-CQ-008", "KG-CQ-009", "KG-CQ-015", "KG-CQ-140"],
  },
  {
    id: "BS-EXTREME", region: "busan", stage: "비상대응(경보)", title: "부산 · 극한호우 · 1시간 80mm · 3시간 150mm",
    summary: "기상청 극한호우 기준(1h 50mm & 3h 90mm) 충족 · 직접 입력", disasterType: "호우", advisory: { type: "호우", level: "경보" },
    hydro: { rain1h: 80, rain3h: 150, rainTotal: 230 }, keywords: ["지하차도", "반지하"], useEvent: false,
    question: "이 조건이면 지하차도와 하상도로 중 무엇부터 통제해야 하나요?",
    chain: ["극한호우 수준인가요? 과거 어느 사건과 비슷한가요?", "지하공간 침수 가능성이 큰 곳은?", "대피가 필요한 지역은?"],
    cq: ["KG-CQ-006", "KG-CQ-090", "KG-CQ-054"],
  },
  {
    id: "BS-ONCHEON", region: "busan", stage: "초기대응(주의보)", title: "부산 · 온천천 세병교 수위 2.4m · 시간당 30mm",
    summary: "호우주의보 · 온천천 하상도로 통제기준(30mm/h) 도달 · 수위 직접 입력", disasterType: "호우", advisory: { type: "호우", level: "주의보" },
    hydro: { rain1h: 30, rainTotal: 85, waterLevel: 2.4, waterStation: "온천천 세병교" }, keywords: ["하상도로"], useEvent: false,
    question: "온천천 하상도로 통제 기준을 넘었나요? 지금 무엇을 해야 하나요?",
    chain: ["온천천 주변 과거 피해는?", "하천변 출입 통제가 필요한 다른 곳은?", "상황보고는 누구에게 언제 해야 하나요?"],
    cq: ["KG-CQ-086", "KG-CQ-138", "CQ-HYD-008"],
  },
  {
    id: "BS-TYPHOON", region: "busan", stage: "비상대응(경보)", title: "부산 · 태풍경보 · 만조 겹침 · 강풍",
    summary: "태풍경보 · 시간당 35mm · 만조 시각 강우 정점 · 해안 월파 우려", disasterType: "태풍", advisory: { type: "태풍", level: "경보" },
    hydro: { rain1h: 35, rainTotal: 210, tide: true }, keywords: ["월파", "해안"], useEvent: false,
    question: "태풍과 만조가 겹칩니다. 해안·저지대 중 어디를 먼저 통제해야 하나요?",
    chain: ["태풍 때 과거 부산 피해는? (힌남노·차바)", "복합 재난(침수+산사태) 위험이 겹치는 곳은?", "주민에게 어떤 메시지를 보내야 하나요?"],
    cq: ["CQ-CMP-007", "KG-CQ-013", "KG-CQ-143"],
  },
  {
    id: "YC-KUMHO", region: "yeongcheon", stage: "비상대응(경보)", title: "영천 · 금호강 수위 주의 · 누적 150mm",
    summary: "호우경보 · 금호강 영천 수위 3.2m(주의) · 직접 입력", disasterType: "홍수", advisory: { type: "호우", level: "경보" },
    hydro: { rain1h: 41, rainTotal: 150, waterLevel: 3.2, waterStation: "금호강 영천" }, useEvent: true,
    question: "금호강이 범람하면 영향받는 곳과 먼저 확인할 홍수취약지구는?",
    chain: ["금호강 주변 과거 피해는?", "둔치주차장·세월교 통제가 필요한가요?", "금호강 홍수취약지구는 어디고 대응수위는 얼마인가요?"],
    cq: ["KG-CQ-045", "KG-CQ-047", "KG-CQ-061"],
  },
  {
    id: "YC-3H95", region: "yeongcheon", stage: "초기대응(주의보)", title: "영천 · 3시간 95mm · 12시간 120mm (직접 입력)",
    summary: "CQ-CXT-002 검증 조건 · 호우주의보", disasterType: "호우", advisory: { type: "호우", level: "주의보" },
    hydro: { rain3h: 95, rain12h: 120, rain1h: 42 }, useEvent: false,
    question: "직접 입력한 3시간 95mm, 12시간 120mm 조건과 가장 비슷한 과거 사례는?",
    chain: ["그때 피해가 난 곳은 지금 어떻게 관리되나요?", "그때 복구는 어떻게 됐나요?", "이 조건이면 특보 기준상 경보 수준인가요?"],
    cq: ["CQ-CXT-002", "CQ-EVT-001", "CQ-CMP-001"],
  },
  {
    id: "YC-RESERVOIR", region: "yeongcheon", stage: "비상대응(경보)", title: "영천 · 일강우 150mm · 저수지 만수위",
    summary: "장기 강우로 저수율 급상승 · 위험저수지 EAP 검토", disasterType: "호우", advisory: { type: "호우", level: "경보" },
    hydro: { rain1h: 32, rainTotal: 165 }, keywords: ["저수지"], useEvent: false,
    question: "위험저수지 중 하류 주민 대피를 검토해야 할 곳은?",
    chain: ["대피 대상 인원은 몇 명인가요?", "저수지 정비사업은 어디까지 진행됐나요?", "대피 명령과 권고 중 어느 수준이 맞나요?"],
    cq: ["KG-CQ-070", "KG-CQ-071", "CQ-RSK-007"],
  },
  {
    id: "IJ-LANDSLIDE", region: "inje", stage: "비상대응(경보)", title: "인제 · 산사태주의보 · 누적 180mm",
    summary: "호우경보 + 산림청 산사태주의보 · 선행강우 많음", disasterType: "산사태", advisory: { type: "호우", level: "경보" },
    hydro: { rain1h: 37, rainTotal: 180 }, keywords: ["산사태"], useEvent: true,
    question: "산사태 위험지역 주민 사전대피가 필요한가요? 어디부터인가요?",
    chain: ["산사태 사례에서 선행강우와 취약지역을 비교해 주세요", "고립 예상 지역은?", "인명피해 우려지역 대피 절차는?"],
    cq: ["KG-CQ-049", "KG-CQ-077", "CQ-CMP-008"],
  },
  {
    id: "IJ-VALLEY", region: "inje", stage: "초기대응(주의보)", title: "인제 · 계곡 시간당 25mm (대피기준 20mm 초과)",
    summary: "호우주의보 · 내린천 계곡 야영장 체류객 · 직접 입력", disasterType: "호우", advisory: { type: "호우", level: "주의보" },
    hydro: { rain1h: 25, rain3h: 48, rainTotal: 60 }, keywords: ["계곡", "야영장"], useEvent: false,
    question: "계곡 야영객을 철수시켜야 하나요? 어느 야영장부터인가요?",
    chain: ["등산로·계곡 출입 통제가 필요한가요?", "내린천 주변 위험 구간은?", "주민에게 어떤 메시지를 보내야 하나요?"],
    cq: ["KG-CQ-087", "KG-CQ-070"],
  },
  {
    id: "IJ-RECOVERY", region: "inje", stage: "수습·복구", title: "인제 · 호우경보 해제 · 피해 집계 단계",
    summary: "특보 해제 · 119 신고 8건 처리 · 응급복구 판단", disasterType: "호우", advisory: undefined,
    hydro: { rainTotal: 148 }, useEvent: true,
    question: "특보가 해제됐습니다. 응급 대응을 종료하고 복구로 전환해도 되나요? 우선 복구 대상은?",
    chain: ["피해 규모는 얼마인가요?", "동일 피해 재발을 막으려면 어떤 개선이 필요한가요?", "과거 인제 호우 때 복구는 어떻게 됐나요?"],
    cq: ["KG-CQ-162", "KG-CQ-163", "KG-CQ-165", "KG-CQ-173"],
  },
  {
    id: "NAT-COMPARE", region: "national", stage: "비상대응(경보)", title: "시범 3개 지역 동시 호우경보 · 행안부 상황 판단",
    summary: "부산·영천·인제 동시 특보 · 지역 간 위험도 비교", disasterType: "호우", advisory: { type: "호우", level: "경보" },
    hydro: {}, useEvent: true,
    question: "시범 3개 지역 중 지금 어디가 가장 위험하고, 어느 읍면동을 먼저 봐야 하나요?",
    chain: ["이번 호우로 접수된 119 신고 현황은?", "시범 3개 지역 급경사지 현황을 비교해 주세요", "중앙 보고 대상 상황인가요?"],
    cq: ["KG-CQ-017", "KG-CQ-016"],
  },
  {
    id: "BS-PLAN", region: "busan", stage: "재발방지·계획", title: "부산 · 평시 · 정비사업 우선순위 검토",
    summary: "평시 · '26~'30 정비 중기계획과 과거 피해 연계", disasterType: "전체", advisory: undefined,
    hydro: {}, useEvent: false,
    question: "과거 피해가 반복된 곳 중 아직 정비되지 않은 위험지구는 어디인가요?",
    chain: ["정비 완료·추진·미정비 상태를 구분해 주세요", "계획상 위험지구와 실제 피해지역이 다른 곳은?", "동일 피해 재발을 막기 위해 어떤 개선이 필요한가요?"],
    cq: ["CQ-RSK-004", "CQ-RSK-007", "CQ-RSK-011", "CQ-PLN-008"],
  },
];

export const SCENARIO_BY_ID = new Map(CONDITION_SCENARIOS.map((s) => [s.id, s]));
