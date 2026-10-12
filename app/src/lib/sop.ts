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
export interface SopOrgs { lead: string | null; support: string[] | null; collab: string[] | null }
/** 수정본에서 붙인 표시 — 원문 추출본 그대로면 없음 */
export type SopEditMark = "수정" | "추가";
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
  orgs: SopOrgs | null;
  /** 행동카드 id (SopManual.cards) */
  card: string | null;
  /** 프로세스 표에는 없고 행동카드에만 있어 단계 끝에 붙인 조치 */
  fromCard?: boolean | null;
  /** 인쇄 쪽 / PDF 쪽 (행동카드가 있으면 카드 쪽, 없으면 프로세스 표 쪽) */
  page: number;
  pdfPage: number;
  tablePage: number;
  tablePdfPage: number;
  edit?: SopEditMark;
  /** 편집 화면에서만 — 담당자가 지운 조치 (되살리기용) */
  deleted?: boolean;
}
export interface SopMission {
  id: string; code: string | null; name: string; step: SopStep; group: string; sub: string | null; condition: string | null; notes: string[] | null;
  /** 번호·소제목 없는 칸에 붙인 '{부서} 조치' — 머리를 따로 보이지 않음 */
  auto?: boolean | null;
  /** 프로세스 표에 없는 행동카드를 단계 끝에 붙인 묶음 */
  cardOnly?: boolean | null;
  edit?: SopEditMark;
  deleted?: boolean;
}
export interface SopGroup { id: string; name: string; kind: "초기대응부서" | "지휘부" | "협업부서" | "유관기관"; fn: string | null; pdf: number; page: number; mine: boolean; cardOnly?: boolean; edit?: SopEditMark }

/** 행동카드 본문 — 원문 순서대로 (번호 제목 · 글머리 · ※ 설명 · 표) */
export interface SopCardCell { t: string; rs?: number; cs?: number; h?: boolean }
export type SopTableRole = "std" | "prop" | "tpl" | "etc";
export type SopCardBlock =
  | { k: "h"; n: string; t: string; note?: string }
  | { k: "p"; lv: 0 | 1 | 2 | 3; t: string; sym?: string }
  | { k: "note"; t: string; sym?: string }
  | { k: "table"; role: SopTableRole; cols: number; rows: SopCardCell[][]; items?: SopTemplate[] };
export interface SopTemplate { kind?: string; text: string }
export interface SopPropagation { kind?: string; method?: string; target?: string; note?: string }
export interface SopCard {
  id: string;
  code: string;
  name: string;
  summary: string | null;
  phase: string | null;
  orgs: SopOrgs;
  /** 연계코드 (영천 협업기능형) */
  link: string | null;
  pdfPage: number;
  page: number;
  pdfPages: number[];
  blocks: SopCardBlock[];
  /** ③ 전파 표 (구분·전파방법·전파대상) · 표준문안 · 필요자원(전파 표 구분) */
  propagation: SopPropagation[] | null;
  templates: SopTemplate[] | null;
  resources: string[] | null;
  edit?: SopEditMark;
}
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
  cards: SopCard[];
  /** 담당자 수정본의 매뉴얼 개정 정보 */
  info?: SopEdits["info"];
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

/** 조치를 임무 순서대로 묶음 — 필요시 임무(condition)는 단계 끝 별도 묶음 (mapping.html ⑥).
 *  withEmpty: 편집 화면 — 조치가 없는 임무(새로 만든 임무 등)도 보여 줌 */
export function stepView(m: SopManual, step: SopStep, groupIds: Set<string>, withEmpty = false) {
  const acts = m.actions.filter((a) => a.step === step && groupIds.has(a.group));
  const flow = acts.filter((a) => !a.condition);
  const cond = acts.filter((a) => a.condition);
  const misById = new Map(m.missions.map((x) => [x.id, x]));
  type GB = { group: SopGroup; missions: { mission: SopMission; actions: SopAction[] }[] };
  const out: GB[] = [];
  const groupBlock = (gid: string) => {
    let gb = out.find((x) => x.group.id === gid);
    if (!gb) out.push((gb = { group: m.groups.find((x) => x.id === gid)!, missions: [] }));
    return gb;
  };
  for (const a of flow) {
    const gb = groupBlock(a.group);
    const mi = misById.get(a.mission)!;
    let mb = gb.missions.find((x) => x.mission.id === mi.id);
    if (!mb) gb.missions.push((mb = { mission: mi, actions: [] }));
    mb.actions.push(a);
  }
  if (withEmpty) {
    const inCond = new Set(cond.map((a) => a.mission));
    for (const mi of m.missions) {
      if (mi.step !== step || !groupIds.has(mi.group) || inCond.has(mi.id)) continue;
      const gb = groupBlock(mi.group);
      if (!gb.missions.some((x) => x.mission.id === mi.id)) gb.missions.push({ mission: mi, actions: [] });
    }
  }
  return { flow: out, cond, total: flow.filter((a) => !a.deleted).length };
}

/* ---------------------------------------------------------------- 행동카드 본문 ↔ 글 */
type TableBlock = Extract<SopCardBlock, { k: "table" }>;

/** 표 → 칸 격자. text: 합친 칸 자리는 빈칸(화면·편집용), fill: 합친 칸 글로 채움(전파 표·문안 구조용) */
export function tableGrid(b: TableBlock) {
  const own: SopCardCell[][] = [];
  b.rows.forEach((row, r) => {
    own[r] ??= [];
    let c = 0;
    for (const cell of row) {
      while (own[r][c] !== undefined) c++;
      const rs = cell.rs ?? 1;
      const cs = cell.cs ?? 1;
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (own[r + i] ??= [])[c + j] = cell;
      c += cs;
    }
  });
  const cols = Math.max(b.cols || 0, ...own.map((g) => g.length));
  let head = 0;
  while (head < b.rows.length && b.rows[head].every((c) => c.h)) head++;
  const seen = new Set<SopCardCell>();
  const text = own.map((g) => Array.from({ length: cols }, (_, i) => {
    const c = g[i];
    if (!c || seen.has(c)) return "";
    seen.add(c);
    return c.t;
  }));
  const fill = own.map((g) => Array.from({ length: cols }, (_, i) => g[i]?.t ?? ""));
  return { cols, head: Math.min(head, own.length), text, fill };
}

const tableRole = (head: string): SopTableRole => {
  const h = head.replace(/\s/g, "");
  if (h.includes("표준행동")) return "std";
  if (/전파방법|전파대상|전파수단/.test(h)) return "prop";
  if (h.includes("문안")) return "tpl";
  return "etc";
};

/** 전파 표 → 전파 목록, 표준문안 표 → 문안 (③) — 편집한 카드도 같은 규칙으로 다시 뽑음 */
function tableItems(b: TableBlock) {
  const g = tableGrid(b);
  const heads = Array.from({ length: g.cols }, (_, i) => g.fill.slice(0, g.head).map((r) => r[i]).join(" ").replace(/\s/g, ""));
  const col = (...keys: string[]) => heads.findIndex((h) => keys.some((k) => h.includes(k)));
  const body = g.fill.slice(g.head);
  const v = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  if (b.role === "prop") {
    const [kk, km, kt, kn] = [col("구분"), col("방법", "수단"), col("대상"), col("비고")];
    return {
      propagation: body
        .map((r) => Object.fromEntries(Object.entries({ kind: v(r, kk), method: v(r, km), target: v(r, kt), note: v(r, kn) }).filter(([, x]) => x)) as SopPropagation)
        .filter((p) => p.method || p.target),
    };
  }
  if (b.role === "tpl") {
    const kx = col("문안");
    const kk = heads.findIndex((h, i) => i !== kx && /구분|상황|매체|대상/.test(h));
    const items: SopTemplate[] = [];
    for (const r of body) {
      const text = v(r, kx);
      const kind = v(r, kk);
      if (!text) continue;
      const last = items[items.length - 1];
      if (last && last.text === text) {
        if (kind && !(last.kind ?? "").includes(kind)) last.kind = [last.kind, kind].filter(Boolean).join(" · ");
        continue;
      }
      items.push(kind ? { kind, text } : { text });
    }
    return { templates: items };
  }
  return {};
}

/** 카드 본문에서 전파 표·표준문안·필요자원 다시 뽑기 */
export function deriveCard(blocks: SopCardBlock[]): Pick<SopCard, "propagation" | "templates" | "resources"> {
  const prop: SopPropagation[] = [];
  const tpl: SopTemplate[] = [];
  for (const b of blocks) {
    if (b.k !== "table") continue;
    const it = tableItems(b);
    prop.push(...(it.propagation ?? []));
    tpl.push(...(b.items ?? it.templates ?? []));
  }
  const res = [...new Set(prop.map((p) => p.kind).filter((k): k is string => !!k))];
  return { propagation: prop.length ? prop : null, templates: tpl.length ? tpl : null, resources: res.length ? res : null };
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
const cellOut = (t: string) => t.replace(/\|/g, "｜").replace(/\s*\n\s*/g, " ⏎ ");

function tableLines(b: TableBlock): string[] {
  const g = tableGrid(b);
  const out = g.text.map((r) => `| ${r.map(cellOut).join(" | ")} |`);
  if (g.head > 0 && g.head < out.length) out.splice(g.head, 0, `|${" --- |".repeat(g.cols)}`);
  return out;
}

/** 카드 본문 → 편집용 글. 1. 제목 / ○ 항목 / - 하위 / · 세부 / ※ 설명 / | 표 칸 | (⏎ = 칸 안 줄바꿈) */
export function blocksToText(blocks: SopCardBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.k === "h") out.push(`${b.n}. ${oneLine(b.t)}${b.note ? ` ※ ${oneLine(b.note)}` : ""}`);
    else if (b.k === "p") out.push(`${b.sym ? `${b.sym} ` : ["", "○ ", "- ", "· "][b.lv]}${oneLine(b.t)}`);
    else if (b.k === "note") out.push(`${b.sym === "*" ? "*" : "※"} ${oneLine(b.t)}`);
    else out.push(...tableLines(b));
  }
  return out.join("\n");
}

const isTableLine = (s: string) => /^\s*\|/.test(s) || s.includes("\t");
const isSepLine = (s: string) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*$/.test(s);
const splitRow = (l: string) =>
  !/^\s*\|/.test(l) && l.includes("\t")
    ? l.split("\t").map((s) => s.trim())
    : l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim());
const normLines = (ls: string[]) => ls.map((l) => (isSepLine(l) ? "---" : splitRow(l).join("|"))).join("\n");

function linesToTable(tl: string[]): TableBlock {
  const sep = tl.findIndex(isSepLine);
  const rowsTxt = tl.filter((_, i) => i !== sep).map(splitRow);
  const head = sep > 0 ? sep : 1;
  const cols = Math.max(1, ...rowsTxt.map((r) => r.length));
  const rows: SopCardCell[][] = rowsTxt.map((r, ri) =>
    Array.from({ length: cols }, (_, ci) => {
      const t = (r[ci] ?? "").replace(/｜/g, "|").replace(/\s*⏎\s*/g, "\n");
      return ri < head ? { t, h: true } : { t };
    }),
  );
  const role = tableRole(rows.slice(0, head).flat().map((c) => c.t).join(" "));
  const b: TableBlock = { k: "table", role, cols, rows };
  if (role === "tpl") {
    const it = tableItems(b).templates;
    if (it?.length) b.items = it;
  }
  return b;
}

const B1 = "○◯❍ㅇ●◦∘•";
const B2 = "-–－‐";
const ARROWS = "⇨➡→▶▷⇒";

/** 편집용 글 → 카드 본문. 고치지 않은 표는 원래 표(합친 칸 포함)를 그대로 씀 */
export function textToBlocks(text: string, prev: SopCardBlock[] = []): SopCardBlock[] {
  const orig = new Map<string, SopCardBlock>();
  for (const b of prev) if (b.k === "table") orig.set(normLines(tableLines(b)), b);
  const lines = text.replace(/\r/g, "").split("\n");
  const out: SopCardBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isTableLine(lines[i])) {
      const tl: string[] = [];
      while (i < lines.length && lines[i].trim() && isTableLine(lines[i])) tl.push(lines[i++]);
      i--;
      out.push(orig.get(normLines(tl)) ?? linesToTable(tl));
      continue;
    }
    const h = t.match(/^(\d{1,2})\s*\.\s*([^\d\s].*)$/);
    if (h) {
      const [title, note] = h[2].split(/\s*※\s*/, 2);
      out.push(note ? { k: "h", n: h[1], t: title.trim(), note: note.trim() } : { k: "h", n: h[1], t: title.trim() });
      continue;
    }
    const c = t[0];
    const body = t.slice(1).trim();
    if (B1.includes(c) && !/^[○◯]\s*(?:[○◯]|월|일|시|분)/.test(t)) out.push({ k: "p", lv: 1, t: body });
    else if (B2.includes(c)) out.push({ k: "p", lv: 2, t: body });
    else if (c === "·") out.push({ k: "p", lv: 3, t: body });
    else if (ARROWS.includes(c)) out.push({ k: "p", lv: 2, t: body, sym: c });
    else if (c === "※") out.push({ k: "note", t: body });
    else if (c === "*" || c === "＊") out.push({ k: "note", t: body, sym: "*" });
    else out.push({ k: "p", lv: 0, t });
  }
  return out.filter((b) => b.k === "table" || b.t);
}

/** 근거 원문 뷰어·검토용 카드 본문 글 */
export function cardText(c: SopCard): string {
  const L: string[] = [];
  for (const b of c.blocks) {
    if (b.k === "h") L.push(`${b.n}. ${b.t}${b.note ? `  ※ ${b.note}` : ""}`);
    else if (b.k === "p") L.push(`${"  ".repeat(b.lv)}${b.sym ? `${b.sym} ` : ["", "○ ", "- ", "· "][b.lv]}${b.t}`);
    else if (b.k === "note") L.push(`  ${b.sym === "*" ? "*" : "※"} ${b.t}`);
    else {
      const g = tableGrid(b);
      g.text.forEach((r, i) => L.push(`  ${i < g.head ? "[" : "|"} ${r.map(oneLine).join(" | ")} ${i < g.head ? "]" : "|"}`));
    }
  }
  return L.join("\n");
}

/* ---------------------------------------------------------------- 담당자 수정본 (매뉴얼 개정 반영)
 * 원문 추출본(data/seed) 위에 덧씌우는 수정 내용. 조치 id 를 그대로 써서 체크 기록이 이어진다.
 * 시연 환경은 브라우저 저장(지역 매뉴얼별) — 운영 전환 시 서버 테이블(sop_edits)로 옮긴다. */
export interface SopActionPatch {
  code?: string | null;
  name?: string;
  condition?: string | null;
  details?: SopDetail[];
  /** 담당자가 세부행동을 직접 적으면 null (카드 본문을 따르지 않음) */
  detailsFrom?: "card" | null;
  notes?: string[] | null;
  orgs?: SopOrgs | null;
  card?: string | null;
  deleted?: boolean;
}
export interface SopCardPatch { code?: string; name?: string; summary?: string | null; blocks?: SopCardBlock[] }
export interface SopEditLog { at: string; by: string; what: string }
export interface SopEdits {
  kind: "safetyai.sop-edits";
  v: 1;
  manualId: string;
  /** 매뉴얼 개정 정보 (개정판 · 개정일 · 메모) */
  info?: { edition?: string; revisedAt?: string; memo?: string };
  actions?: Record<string, SopActionPatch>;
  added?: SopAction[];
  missions?: Record<string, { name?: string; code?: string | null; deleted?: boolean }>;
  addedMissions?: SopMission[];
  groups?: Record<string, { name?: string; mine?: boolean }>;
  /** 임무 id → 조치 id 순서 */
  order?: Record<string, string[]>;
  cards?: Record<string, SopCardPatch>;
  addedCards?: SopCard[];
  steps?: Partial<Record<SopStep, { goals?: string[] }>>;
  recommend?: Partial<Record<SopRecommend["level"], { step: SopStep; basis: string }>>;
  log: SopEditLog[];
}

export const emptyEdits = (m: Pick<SopManual, "id">): SopEdits => ({ kind: "safetyai.sop-edits", v: 1, manualId: m.id, log: [] });
export const newSopId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 수정한 곳 수 (조치·임무·부서·카드·단계 기준) */
export function editCount(e: SopEdits | null | undefined): number {
  if (!e) return 0;
  const n = (o?: object) => (o ? Object.keys(o).length : 0);
  return n(e.actions) + (e.added?.length ?? 0) + n(e.missions) + (e.addedMissions?.length ?? 0) + n(e.groups) + n(e.cards) + (e.addedCards?.length ?? 0) + n(e.steps) + n(e.recommend) + (e.info ? 1 : 0);
}

/**
 * 원문 추출본 + 수정본 → 화면에 쓰는 매뉴얼.
 * keepDeleted: 편집 화면 — 지운 조치·임무도 deleted 표시로 남겨 되살릴 수 있게 함
 */
export function applyEdits(m: SopManual, e: SopEdits | null | undefined, keepDeleted = false): SopManual {
  if (!e || e.manualId !== m.id) return m;
  const cardIds = new Set<string>();
  const cards = [...m.cards, ...(e.addedCards ?? [])].map((c) => {
    const p = e.cards?.[c.id];
    const added = e.addedCards?.some((x) => x.id === c.id);
    if (!p && !added) return c;
    cardIds.add(c.id);
    const blocks = p?.blocks ?? c.blocks;
    return { ...c, ...p, blocks, ...(p?.blocks ? deriveCard(blocks) : {}), edit: added ? "추가" : "수정" } as SopCard;
  });
  const groups = m.groups.map((g) => (e.groups?.[g.id] ? { ...g, ...e.groups[g.id], edit: "수정" as const } : g));
  const missions = [...m.missions, ...(e.addedMissions ?? []).map((x) => ({ ...x, edit: "추가" as const }))]
    .map((x) => {
      const p = e.missions?.[x.id];
      return p ? { ...x, ...p, edit: x.edit ?? ("수정" as const) } : x;
    })
    .filter((x) => keepDeleted || !x.deleted);
  const misIds = new Set(missions.map((x) => x.id));
  const acts = [...m.actions, ...(e.added ?? []).map((a) => ({ ...a, edit: "추가" as const }))]
    .map((a) => {
      const p = e.actions?.[a.id];
      const cardEdited = !!a.card && cardIds.has(a.card);
      if (!p && !cardEdited) return a;
      return { ...a, ...p, edit: a.edit ?? ("수정" as const) };
    })
    .filter((a) => misIds.has(a.mission) && (keepDeleted || !a.deleted))
    .map((a) => (missions.find((x) => x.id === a.mission)?.deleted ? { ...a, deleted: true } : a));
  // 임무 안 순서 (담당자가 바꾼 순서 → 없으면 원래 순서, 새 조치는 임무 끝)
  const byMission = new Map<string, SopAction[]>();
  for (const a of acts) (byMission.get(a.mission) ?? byMission.set(a.mission, []).get(a.mission)!).push(a);
  const actions: SopAction[] = [];
  for (const a of acts) {
    const list = byMission.get(a.mission);
    if (!list) continue;
    byMission.delete(a.mission);
    const ord = e.order?.[a.mission];
    if (ord) {
      const pos = new Map(ord.map((id, i) => [id, i]));
      list.sort((x, y) => (pos.get(x.id) ?? 1e6) - (pos.get(y.id) ?? 1e6));
    }
    actions.push(...list);
  }
  const steps = m.steps.map((s) => (e.steps?.[s.step] ? { ...s, ...e.steps[s.step] } : s));
  const recommend = m.recommend.map((r) => (e.recommend?.[r.level] ? { ...r, ...e.recommend[r.level] } : r));
  return { ...m, groups, missions, actions, cards, steps, recommend, info: e.info };
}
