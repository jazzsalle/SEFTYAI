/**
 * 행동매뉴얼 대응절차(SOP) — 화면·서버 공용 타입과 규칙
 * 데이터: data/seed/sop_procedures.json (scripts/sop/build_sop.py 로 매뉴얼 PDF에서 추출, report4 mapping.html R1~R25)
 *  대응단계(4) → 임무 → 조치 → 세부행동. 부서 칸(R19) = 표의 행 묶음.
 */
import type { Advisory, RegionId } from "./contract/agent";

export type SopStep = "SIGN_DETECTION" | "INITIAL_RESPONSE" | "EMERGENCY_RESPONSE" | "RECOVERY";
export const SOP_STEPS: SopStep[] = ["SIGN_DETECTION", "INITIAL_RESPONSE", "EMERGENCY_RESPONSE", "RECOVERY"];
/** 4개 대응단계 공통 이름 (매뉴얼 원문 단계명은 SopStepInfo.phaseLabel) */
export const STEP_NAME: Record<SopStep, string> = {
  SIGN_DETECTION: "징후감지",
  INITIAL_RESPONSE: "초기대응",
  EMERGENCY_RESPONSE: "비상대응",
  RECOVERY: "수습·복구",
};

export interface SopDetail { seq: number; title: string; content?: string; note?: string }
export interface SopAction {
  id: string;
  code: string | null;
  name: string;
  mission: string;
  step: SopStep;
  group: string;
  sub: string | null;
  /** 조치 전체에 붙은 조건 (R8·R23) → 필요시 임무 */
  condition: string | null;
  notes: string[] | null;
  changed: boolean | null;
  details: SopDetail[];
  detailsFrom: "card" | null;
  summary: string | null;
  orgs: { lead: string | null; support: string[] | null; collab: string[] | null } | null;
  /** 인쇄 쪽 / PDF 쪽 (행동카드가 있으면 카드 쪽, 없으면 프로세스 표 쪽) */
  page: number;
  pdfPage: number;
  tablePage: number;
  tablePdfPage: number;
}
export interface SopMission {
  id: string; code: string | null; name: string; step: SopStep; group: string; sub: string | null; condition: string | null; notes: string[] | null;
  /** 번호·소제목 없는 칸에 붙인 '{부서} 조치' — 머리를 따로 보이지 않음 */
  auto?: boolean | null;
}
export interface SopGroup { id: string; name: string; kind: "초기대응부서" | "지휘부" | "협업부서" | "유관기관"; fn: string | null; pdf: number; page: number; mine: boolean }
export interface SopStepInfo { step: SopStep; no: number; phaseLabel: string; tablePdfPage: number; goals: string[]; goalPdfPage: number; goalPage: number }
export interface SopRecommend { level: "예비특보" | "주의보" | "경보" | "해제"; step: SopStep; basis: string; pdfPage: number; page: number }
export interface SopManual {
  id: string;
  region: Exclude<RegionId, "national">;
  manualId: string;
  title: string;
  short: string;
  file: string;
  offset: number;
  style: "bracket" | "function";
  mine: string;
  pageCount: number;
  steps: SopStepInfo[];
  recommend: SopRecommend[];
  groups: SopGroup[];
  missions: SopMission[];
  actions: SopAction[];
}

/** 영천(협업기능형)은 원문처럼 ①-2-3 으로 표시 (데이터는 R10 에 따라 숫자 1-2-3) */
export function codeLabel(m: Pick<SopManual, "style">, code: string | null): string {
  if (!code) return "";
  if (m.style !== "function") return code;
  return code
    .split(",")
    .map((c) => {
      const [f, ...rest] = c.split("-");
      const n = Number(f);
      return n >= 1 && n <= 20 ? [String.fromCharCode(0x2460 + n - 1), ...rest].join("-") : c;
    })
    .join(",");
}

export const sopCheckKey = (m: Pick<SopManual, "id">, a: Pick<SopAction, "id">) => `sop:${m.id}:${a.id}`;

/** 화면에 쓰는 단계 이름 = 매뉴얼 원문 단계명 (D19). '징후 감지'처럼 띄어 쓴 것만 공통 이름으로 붙여 씀 */
export function stepLabel(m: Pick<SopManual, "steps">, step: SopStep): string {
  const s = m.steps.find((x) => x.step === step);
  const raw = (s?.phaseLabel ?? "").trim();
  if (!raw || raw.replace(/\s/g, "") === STEP_NAME[step].replace(/\s/g, "")) return STEP_NAME[step];
  return raw;
}

/** 내 부서 행 (R19) — 계정 부서가 든 행 묶음 */
export const myGroupIds = (m: SopManual) => new Set(m.groups.filter((g) => g.mine).map((g) => g.id));

/** 단계별 진행 — 필요시 임무는 실행(체크)했을 때만 셈 */
export function stepProgress(m: SopManual, step: SopStep, groups: Set<string>, checks: Record<string, boolean>) {
  const acts = m.actions.filter((a) => a.step === step && groups.has(a.group));
  const flow = acts.filter((a) => !a.condition);
  const doneFlow = flow.filter((a) => checks[sopCheckKey(m, a)]).length;
  const doneCond = acts.filter((a) => a.condition && checks[sopCheckKey(m, a)]).length;
  return { done: doneFlow + doneCond, total: flow.length + doneCond, next: flow.filter((a) => !checks[sopCheckKey(m, a)]) };
}

export interface SopRec {
  step: SopStep;
  level: SopRecommend["level"];
  basis: string;
  page: number;
  pdfPage: number;
  advisory?: Advisory;
}

const LV_RANK: Record<string, number> = { 경보: 3, 주의보: 2, 예비특보: 1 };

/**
 * 특보 → 대응단계 추천. 추천일 뿐이고 사용자가 단계를 바꿀 수 있다.
 * 발효 중인 자기 지역 특보 중 가장 높은 단계 기준. 발효 특보는 없고 해제·변경만 있으면 수습·복구.
 * 특보가 전혀 없으면 null (평시).
 */
export function recommendStep(m: SopManual, advisories: Advisory[] | undefined): SopRec | null {
  const mine = (advisories ?? []).filter((a) => a.regionId === m.region);
  const live = mine.filter((a) => a.status === "발효" || a.status === "예비");
  const top = [...live].sort((a, b) => (LV_RANK[b.level] ?? 0) - (LV_RANK[a.level] ?? 0) || b.issuedAt.localeCompare(a.issuedAt))[0];
  const lv: SopRecommend["level"] | null = top ? (top.status === "예비" ? "예비특보" : top.level) : mine.some((a) => a.status === "해제") ? "해제" : null;
  if (!lv) return null;
  const r = m.recommend.find((x) => x.level === lv);
  if (!r) return null;
  return { step: r.step, level: lv, basis: r.basis, page: r.page, pdfPage: r.pdfPage, advisory: top };
}

/** 조치를 임무 순서대로 묶음 — 필요시 임무(condition)는 단계 끝 별도 묶음 (mapping.html ⑥) */
export function stepView(m: SopManual, step: SopStep, groupIds: Set<string>) {
  const acts = m.actions.filter((a) => a.step === step && groupIds.has(a.group));
  const flow = acts.filter((a) => !a.condition);
  const cond = acts.filter((a) => a.condition);
  const misById = new Map(m.missions.map((x) => [x.id, x]));
  const byGroup = (list: SopAction[]) => {
    const out: { group: SopGroup; missions: { mission: SopMission; actions: SopAction[] }[] }[] = [];
    for (const a of list) {
      const g = m.groups.find((x) => x.id === a.group)!;
      let gb = out.find((x) => x.group.id === g.id);
      if (!gb) out.push((gb = { group: g, missions: [] }));
      const mi = misById.get(a.mission)!;
      let mb = gb.missions.find((x) => x.mission.id === mi.id);
      if (!mb) gb.missions.push((mb = { mission: mi, actions: [] }));
      mb.actions.push(a);
    }
    return out;
  };
  return { flow: byGroup(flow), cond, total: flow.length };
}
