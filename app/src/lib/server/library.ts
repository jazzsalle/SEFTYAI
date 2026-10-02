import "server-only";
import type { RegionId } from "../contract/agent";
import { CONDITION_SCENARIOS, type WorkflowStage } from "./scenarios";

/**
 * 추천 질의 라이브러리 — UNE_AI_Agent_역량질문(v1.1) 130 + 사업 CQ 173 중
 * 시범서비스 데이터로 답할 수 있는 질문을 업무 단계별로 재구성 (지역명 치환)
 */
export interface LibItem { id: string; stage: WorkflowStage | "과거 재난·유사사례" | "위험·취약지역 지식"; q: string; cq: string[]; preset?: string }
export interface DemoFlow { id: string; title: string; region: RegionId; desc: string; steps: string[]; scenarioId?: string }

const R: Record<Exclude<RegionId, "national">, { name: string; river: string; slope: string; extra: string[] }> = {
  busan: { name: "부산", river: "온천천", slope: "급경사지", extra: ["부산 지하차도 침수 이력과 통제 기준", "수영강 주변 위험 구간과 대응은?", "2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?", "태풍 힌남노 때 부산 피해는?"] },
  yeongcheon: { name: "영천", river: "금호강", slope: "급경사지", extra: ["영천 위험저수지는 어디 있고 왜 위험한가요?", "신녕천 주변 위험 구간은?", "태풍 힌남노 때 영천 피해는?", "2020년 7월 28일 최장 장마 때 영천 피해는?"] },
  inje: { name: "인제", river: "내린천", slope: "산사태 취약지역", extra: ["인제 계곡 야영장 중 먼저 철수시킬 곳은 어디인가요?", "소양강 주변 위험 구간은?", "2013년 7월 인제 호우 때 어떤 피해가 있었나요?", "미시령 낙석 사고 때 어떻게 대응했나요?"] },
};

export function library(region: RegionId): LibItem[] {
  const r = region === "national" ? null : R[region];
  const n = r?.name ?? "시범 3개 지역";
  const items: LibItem[] = [
    // 평시 · 사전대비
    { id: "L01", stage: "평시 점검", q: `${n} 평시에 점검해야 할 위험·취약지역은 어디인가요?`, cq: ["KG-CQ-016", "CQ-RSK-001"] },
    { id: "L02", stage: "평시 점검", q: `${n}에서 과거 피해가 반복된 곳 중 아직 정비되지 않은 위험지구는?`, cq: ["CQ-RSK-004", "CQ-RSK-007"] },
    { id: "L03", stage: "평시 점검", q: "침수와 산사태 위험이 동시에 존재하는 지역은 어디인가요?", cq: ["KG-CQ-030", "KG-CQ-134"] },
    { id: "L04", stage: "사전대비(예비특보)", q: "호우 예비특보가 나왔습니다. 미리 점검해야 할 곳과 준비할 일은?", cq: ["KG-CQ-012", "CQ-RSP-004"] },
    { id: "L05", stage: "사전대비(예비특보)", q: "현재 상황이 사전대비 단계인가요, 대응 단계인가요?", cq: ["KG-CQ-012"] },
    // 초기대응
    { id: "L06", stage: "초기대응(주의보)", q: "지금 우리 지역 기상특보와 강우 상황은 어떤가요?", cq: ["KG-CQ-002", "KG-CQ-003", "KG-CQ-005"], preset: "wx" },
    { id: "L07", stage: "초기대응(주의보)", q: "현재 강우는 위험 기준을 초과했나요? 상황이 확대되는 추세인가요?", cq: ["KG-CQ-001", "KG-CQ-011"] },
    { id: "L08", stage: "초기대응(주의보)", q: "하천변 출입 통제가 필요한가요?", cq: ["KG-CQ-086"] },
    { id: "L09", stage: "초기대응(주의보)", q: r ? `${r.river} 주변 위험 구간과 대응은?` : "내린천 주변 위험 구간과 대응은?", cq: ["CQ-HYD-001", "KG-CQ-048"] },
    // 비상대응
    { id: "L10", stage: "비상대응(경보)", q: "지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?", cq: ["KG-CQ-008", "KG-CQ-009", "KG-CQ-015", "KG-CQ-140"] },
    { id: "L11", stage: "비상대응(경보)", q: "호우경보가 발효됐는데 담당자인 제가 지금 해야 할 일은?", cq: ["CQ-RSP-004", "CQ-RSP-005"], preset: "manual" },
    { id: "L12", stage: "비상대응(경보)", q: "지금 먼저 통제해야 할 도로와 지하차도는?", cq: ["KG-CQ-083", "KG-CQ-090", "KG-CQ-093"] },
    { id: "L13", stage: "비상대응(경보)", q: "대피가 필요한 지역과 대상 인원은?", cq: ["KG-CQ-070", "KG-CQ-071"] },
    { id: "L14", stage: "비상대응(경보)", q: "인명피해 가능 단계인가요? 극한호우 수준인가요?", cq: ["KG-CQ-014", "KG-CQ-006"] },
    { id: "L15", stage: "비상대응(경보)", q: `${n}에서 어느 읍면동이 가장 위험한가요?`, cq: ["KG-CQ-017"] },
    { id: "L16", stage: "비상대응(경보)", q: "주민에게 어떤 메시지를 보내야 하나요?", cq: ["KG-CQ-143", "KG-CQ-103"] },
    { id: "L17", stage: "비상대응(경보)", q: "상황보고는 누구에게 언제 해야 하나요?", cq: ["KG-CQ-146", "KG-CQ-147"] },
    { id: "L18", stage: "비상대응(경보)", q: "등산로·계곡 출입 통제가 필요한가요?", cq: ["KG-CQ-087"] },
    // 피해·신고
    { id: "L19", stage: "피해·신고 대응", q: "이번 사건으로 접수된 119 신고 내용은 무엇인가요?", cq: ["KG-CQ-043"], preset: "report119" },
    { id: "L20", stage: "피해·신고 대응", q: "피해 신고가 들어오면 어떤 절차로 처리하나요?", cq: ["CQ-RSP-004"] },
    { id: "L21", stage: "피해·신고 대응", q: "고립된 주민이나 고립 예상 지역이 있나요?", cq: ["KG-CQ-056", "KG-CQ-072"] },
    // 복구 · 재발방지
    { id: "L22", stage: "수습·복구", q: "특보가 해제되면 응급 대응을 종료하고 복구로 전환해도 되나요? 우선 복구 대상은?", cq: ["KG-CQ-162", "KG-CQ-163", "KG-CQ-165"] },
    { id: "L23", stage: "재발방지·계획", q: "동일 피해 재발을 막기 위해 어떤 개선이 필요한가요?", cq: ["KG-CQ-173", "CQ-PLN-008"] },
    { id: "L24", stage: "재발방지·계획", q: "계획상 위험지구와 실제 피해지역이 다른 곳은?", cq: ["CQ-RSK-011", "CQ-PLN-006"] },
    { id: "L25", stage: "재발방지·계획", q: "정비 완료·추진·미정비 상태를 구분해 주세요", cq: ["CQ-RSK-007"] },
    // 과거 재난
    { id: "L26", stage: "과거 재난·유사사례", q: "비슷한 강우 때 과거에 어디가 침수됐나요?", cq: ["CQ-EVT-001", "CQ-EVT-009", "KG-CQ-007"], preset: "similar" },
    { id: "L27", stage: "과거 재난·유사사례", q: "시간당 70mm가 오면 과거 어떤 사건과 비슷한가요?", cq: ["CQ-CMP-001", "CQ-OBS-009"] },
    { id: "L28", stage: "과거 재난·유사사례", q: "과거 피해가 연결된 위험지구는 어디인가요?", cq: ["CQ-RSK-004", "CQ-KG-009"] },
    // 위험·취약지역 지식
    { id: "L29", stage: "위험·취약지역 지식", q: r ? `${n} ${r.slope}는 어디 있고, 왜·언제 위험한가요?` : "시범 3개 지역 급경사지 현황을 비교해 주세요", cq: ["KG-CQ-020", "CQ-RSK-002", "CQ-RSK-009"] },
    { id: "L30", stage: "위험·취약지역 지식", q: "지하공간 침수 가능성이 큰 곳은?", cq: ["KG-CQ-054", "KG-CQ-022"] },
    { id: "L31", stage: "위험·취약지역 지식", q: "홍수취약지구는 어디고 대응수위는 얼마인가요?", cq: ["CQ-HYD-008", "KG-CQ-034"] },
  ];
  const extra = (r?.extra ?? ["2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?", "태풍 힌남노 때 시범지역 피해는?", "이번 호우로 접수된 119 신고 현황은?"]).map((q, i) => ({ id: `LX${i}`, stage: (/때|사고/.test(q) ? "과거 재난·유사사례" : "위험·취약지역 지식") as LibItem["stage"], q, cq: [] }));
  return [...items, ...extra];
}

/** 연속 질의 시연 — 이어서 질문하기 흐름 (업무 흐름 기반) */
export function demoFlows(region: RegionId): DemoFlow[] {
  const base: DemoFlow[] = [
    { id: "F-WORK", title: "호우경보 발효 → 판단 → 통제 → 대피 → 보고", region, desc: "특보를 받은 담당자의 실제 업무 순서", steps: ["지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?", "지금 먼저 통제해야 할 도로와 지하차도는?", "대피가 필요한 지역과 대상 인원은?", "주민에게 어떤 메시지를 보내야 하나요?", "상황보고는 누구에게 언제 해야 하나요?"] },
    { id: "F-PAST", title: "유사사례 → 그때 피해지역의 지금 관리 상태 → 복구 → 재발방지", region, desc: "과거 재난과 산사태·급경사 등 취약지역·복구를 연결", steps: ["비슷한 강우 때 과거에 어디가 침수됐나요?", "그때 피해가 난 곳은 지금 어떻게 관리되나요?", "그때 복구는 어떻게 됐나요?", "동일 피해 재발을 막기 위해 어떤 개선이 필요한가요?"] },
    { id: "F-SLOPE", title: "급경사지 어디·왜·언제 → 무엇을", region, desc: "김인건 사무관 질의 흐름", steps: [region === "inje" ? "인제 산사태 취약지역은 어디고 언제 대피해야 하나요?" : `${region === "yeongcheon" ? "영천" : "부산"} 급경사지는 어디 있고, 왜·언제 위험한가요?`, "침수와 산사태 위험이 동시에 존재하는 지역은 어디인가요?", "대피가 필요한 지역과 대상 인원은?"] },
    { id: "F-RECOVER", title: "특보 해제 → 복구 전환 → 피해 규모 → 재발 방지", region, desc: "수습·복구 단계 업무", steps: ["특보가 해제되면 응급 대응을 종료하고 복구로 전환해도 되나요? 우선 복구 대상은?", "과거 피해가 반복된 곳 중 아직 정비되지 않은 위험지구는?", "계획상 위험지구와 실제 피해지역이 다른 곳은?"] },
  ];
  const sc = CONDITION_SCENARIOS.filter((s) => s.region === region).slice(0, 2).map((s) => ({ id: `F-${s.id}`, title: s.title, region, desc: `조건 시나리오 + 연속 질의 · ${s.stage}`, steps: [s.question, ...s.chain], scenarioId: s.id }));
  return [...base, ...sc];
}
