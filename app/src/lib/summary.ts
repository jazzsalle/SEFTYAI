/**
 * 답변 한눈 요약의 재료 — 개발 서버 features/search/summary/model.ts 이식(2026-11-06, 새 Figma 「템플릿 정의 (11-03)」).
 *
 * 원칙: 값은 T3Q 응답 그대로. 가공·추정·LLM 요약을 하지 않는다. 그래프는 받은 값의 크기·순서·기간만 그린다.
 * 규칙은 모두 값의 유무·개수·순서로만 가른다.
 *  ① 조건 줄 — 기준지역 · 대상 개수 · 기준 시각  ② 구분별 개수 — 응답에 나온 구분 순서
 *  ③ 구분별 블록 — 구분마다 카탈로그의 블록 하나, 앞 3개 펼침 · 한 블록 최대 8곳  ④ 표로 보기 — 블록에 쓴 원본 값 전체, 값 없는 칸은 「—」
 *
 * 답(T3Q-01)의 refs 에는 분류·속성이 없다. 템플릿이 쓰는 고정 칸을 얻으려고 그 객체 ID 로 데이터 API 를 한 번 더 묻는다
 * (개발 서버 사용자 지시 21 — 재호출 허용): 위험지구·급경사지·산사태·지하차도는 T3Q-05(분류·등급) + 앞 8곳의 T3Q-15(속성),
 * 침수흔적은 T3Q-30, 하천은 T3Q-16. 모두 /api/t3q/data 를 거친다. 실패한 묶음은 빼고 그린다.
 */
import { api } from "./api";
import { detailIdOf, type RefLike } from "./mapRef";

export type BlockKind = "trace" | "gantt" | "check" | "gauge" | "score" | "collapse" | "river" | "reservoir" | "names";
/** 구분 색(KRDS 의미색) — 값의 좋고 나쁨을 뜻하지 않는다 */
export type Tone = "blue" | "green" | "yellow" | "sky" | "red" | "purple" | "teal" | "brown" | "navy" | "gray";

export interface SummaryRow {
  id: string;
  name: string;
  ref?: RefLike;
  /** 법정동 코드(받은 그대로). 시군구별 개수·지도 색칠에 앞 5자리를 쓴다 */
  adminCode: string | null;
  grade: string | null;
  /** 블록마다 쓰는 값 — 키는 BLOCK_COLUMNS 와 같다 */
  f: Record<string, string | number | null>;
}
export interface SummaryGroup {
  key: string;
  /** 상류 분류 이름 그대로(「자연재해위험개선지구」) */
  name: string;
  /** 짧은 이름(「개선지구」) */
  short: string;
  tone: Tone;
  block: BlockKind;
  /** 이 구분의 전체 개수 — 블록은 그중 앞 MAX_ROWS 곳만 */
  count: number;
  rows: SummaryRow[];
  /** 응답 refs 에서 처음 나온 자리 — 구분 순서 */
  order: number;
}
export interface AnswerSummary {
  total: number;
  groups: SummaryGroup[];
  /** 상세가 없는 대상(지구 통합 ZN- 등)의 이름 목록 */
  others: SummaryRow[];
}

/** 한 블록이 그리는 최대 곳 수 */
export const MAX_ROWS = 8;
/** 처음부터 펼쳐 두는 구분 수 — 4번째부터 접는다 */
export const OPEN_GROUPS = 3;

/** 표로 보기 칸 — 블록에 쓴 값 그대로 */
export const BLOCK_COLUMNS: Record<BlockKind, { key: string; label: string }[]> = {
  trace: [{ key: "date", label: "호우 일자" }, { key: "area", label: "면적(㎡)" }, { key: "event", label: "재해" }, { key: "cause", label: "원인" }],
  gantt: [{ key: "from", label: "사업 시작" }, { key: "to", label: "사업 종료" }, { key: "released", label: "해제일" }, { key: "type", label: "재해유형" }],
  check: [
    { key: "u_shaped", label: "U형" },
    { key: "near_river_500m", label: "하천 500m 이내" },
    { key: "casualty_risk_area", label: "인명피해우려" },
    { key: "barrier_form", label: "차단시설" },
    { key: "control_depth_cm", label: "통제 수심(cm)" },
  ],
  gauge: [{ key: "river", label: "하천명" }, { key: "station", label: "특보지점" }, { key: "l07", label: "대응수위 0.7" }, { key: "l09", label: "대응수위 0.9" }],
  score: [{ key: "score", label: "점수" }, { key: "inspected", label: "최근 점검일" }, { key: "result", label: "점검 결과" }],
  collapse: [{ key: "score", label: "위험도 점수" }, { key: "households", label: "거주가구" }, { key: "residents", label: "거주인구" }],
  river: [{ key: "kind", label: "하천 종류" }, { key: "system", label: "수계" }, { key: "length", label: "길이(km)" }, { key: "catchment", label: "유역면적(㎢)" }],
  reservoir: [
    { key: "safety", label: "안전등급" },
    { key: "people", label: "하류 거주인구" },
    { key: "distance", label: "하류 주택 거리(m)" },
    { key: "storage", label: "저수량(천㎥)" },
    { key: "released", label: "해제일" },
  ],
  names: [{ key: "type", label: "유형" }],
};

/** 상류 분류 이름 → 블록·색·짧은 이름. 모르는 분류는 이름 목록 */
export function catalog(category: string): { block: BlockKind; tone: Tone; short: string } {
  if (category.includes("자연재해위험개선지구")) return { block: "gantt", tone: "green", short: "개선지구" };
  if (category.includes("풍수해생활권")) return { block: "gantt", tone: "green", short: "정비지구" };
  if (category.includes("지하차도")) return { block: "check", tone: "yellow", short: "지하차도" };
  if (category.includes("홍수취약")) return { block: "gauge", tone: "red", short: "홍수취약지구" };
  if (category === "급경사지") return { block: "score", tone: "purple", short: "급경사지" };
  if (category.includes("붕괴위험")) return { block: "collapse", tone: "brown", short: "붕괴위험지역" };
  if (category.includes("산사태")) return { block: "names", tone: "teal", short: "산사태취약지역" };
  if (category.includes("저수지")) return { block: "reservoir", tone: "navy", short: "저수지" };
  return { block: "names", tone: "gray", short: category };
}

/** 상세(T3Q-15)가 있어야 그릴 수 있는 블록 */
const NEEDS_DETAIL: BlockKind[] = ["gantt", "check", "gauge", "score", "collapse", "reservoir"];

// ── 불러오기 ────────────────────────────────────────────────────────────────

type Env<T> = { status?: string; result?: T | null };
/** /api/t3q/data 를 부른다 — 봉투 그대로 */
async function data<T>(apiId: string, o: { id?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<Env<T>> {
  const r = await api<{ envelope: Env<T> }>("/api/t3q/data", { method: "POST", json: { api: apiId, ...o } });
  return r.envelope ?? {};
}

const cache = new Map<string, Promise<AnswerSummary | null>>();

interface KeyedRef { id: string; prefix: string; ref: RefLike; order: number }

/** refs → 객체 ID. 같은 객체는 한 번만, 처음 나온 자리를 기억한다 */
export function keyRefs(refs: RefLike[]): KeyedRef[] {
  const seen = new Map<string, KeyedRef>();
  refs.forEach((ref, order) => {
    const id = detailIdOf(ref) ?? ref.entity_id?.trim() ?? (ref.map?.key === "spatial_object_id" ? ref.map.value : null) ?? null;
    if (!id || seen.has(id)) return;
    seen.set(id, { id, prefix: id.split("-")[0] ?? "", ref, order });
  });
  return [...seen.values()];
}

/** 답 하나의 요약 — 같은 refs 면 다시 묻지 않는다(대화창 카드·패널 탭·지도 탭이 함께 그려도 한 번) */
export function loadSummary(refs: RefLike[]): Promise<AnswerSummary | null> {
  const keyed = keyRefs(refs);
  if (!keyed.length) return Promise.resolve(null);
  const key = keyed.map((k) => k.id).join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = build(keyed);
  pending.catch(() => cache.delete(key));
  cache.set(key, pending);
  return pending;
}
/** 시험용 — 받아 둔 요약 비우기 */
export function clearSummaryCache() {
  cache.clear();
  details.clear();
}

const RISK = ["HZ", "SL", "LS", "UP"];

async function build(keyed: KeyedRef[]): Promise<AnswerSummary | null> {
  const risk = keyed.filter((k) => RISK.includes(k.prefix));
  const traces = keyed.filter((k) => k.prefix === "FT");
  const rivers = keyed.filter((k) => k.prefix === "RV");
  const rest = keyed.filter((k) => ![...RISK, "FT", "RV"].includes(k.prefix));
  const [riskGroups, traceGroup, riverGroup] = await Promise.all([
    risk.length ? riskPart(risk).catch(() => []) : Promise.resolve([]),
    traces.length ? tracePart(traces).catch(() => null) : Promise.resolve(null),
    rivers.length ? riverPart(rivers).catch(() => null) : Promise.resolve(null),
  ]);
  const groups = [...riskGroups, traceGroup, riverGroup].filter((g): g is SummaryGroup => g !== null && g.count > 0).sort((a, b) => a.order - b.order);
  const others: SummaryRow[] = rest.map((k) => ({ id: k.id, name: k.ref.display_name ?? k.id, ref: k.ref, adminCode: null, grade: null, f: { type: k.ref.entity_type ?? null } }));
  if (!groups.length && !others.length) return null;
  return { total: groups.reduce((s, g) => s + g.count, 0) + others.length, groups, others };
}

interface RiskListItem { object_id: string; category?: string | null; type?: string | null; name?: string | null; grade?: { value?: string | number | null; status?: string } | null; admin_code?: string | null }

/** T3Q-05 로 분류를 받고, 블록이 쓰는 속성은 T3Q-15 로 앞 8곳만 */
async function riskPart(keyed: KeyedRef[]): Promise<SummaryGroup[]> {
  const byId = new Map(keyed.map((k) => [k.id, k]));
  const items: RiskListItem[] = [];
  for (let i = 0; i < keyed.length; i += 100) {
    const e = await data<{ items?: RiskListItem[] }>("T3Q-05", { body: { object_ids: keyed.slice(i, i + 100).map((k) => k.id), page: { page: 1, size: 100 } } });
    items.push(...(e.result?.items ?? []));
  }
  const groups = new Map<string, SummaryGroup>();
  for (const item of items) {
    const category = text(item.category) ?? "그 밖의 대상";
    const k = byId.get(item.object_id);
    let g = groups.get(category);
    if (!g) {
      const c = catalog(category);
      g = { key: category, name: category, short: c.short, tone: c.tone, block: c.block, count: 0, rows: [], order: k?.order ?? 1e9 };
      groups.set(category, g);
    }
    g.count += 1;
    g.order = Math.min(g.order, k?.order ?? 1e9);
    g.rows.push({
      id: item.object_id,
      name: text(item.name) ?? item.object_id,
      ref: k?.ref,
      adminCode: item.admin_code ?? null,
      grade: item.grade?.status && item.grade.status !== "PROVIDED" ? null : text(item.grade?.value),
      f: { type: text(item.type) },
    });
  }
  // 응답 순서대로 줄을 세운다(답 글이 먼저 말한 곳이 위)
  for (const g of groups.values()) {
    g.rows.sort((a, b) => (byId.get(a.id)?.order ?? 0) - (byId.get(b.id)?.order ?? 0));
    if (NEEDS_DETAIL.includes(g.block)) await fillDetails(g);
  }
  return [...groups.values()];
}

type RiskObject = { type?: string | null; risk?: { grade?: { value?: unknown } | null; attributes?: { key?: string; value?: unknown }[] | null; risk_score_detail?: unknown } | null };

/*
 * 상세(T3Q-15)는 객체 ID 로 바로 부른다 — 이름 견줌을 하지 않는다(개발 서버). 실측(2026-11-03)에서 Agent 는 이름을 제 말로 바꿔 붙였고
 * (SL-2632000064 「만덕1지구」 ↔ 상류 「만덕동 산100」), 여기 ID 는 T3Q-05 가 같은 ID 로 이미 확인해 준 것이라 견줄 까닭이 없다.
 */
const details = new Map<string, Promise<RiskObject | null>>();
function detailOf(id: string): Promise<RiskObject | null> {
  const hit = details.get(id);
  if (hit) return hit;
  const pending = data<RiskObject>("T3Q-15", { id })
    .then((e) => (e.status === "SUCCESS" && e.result ? e.result : null))
    .catch(() => null);
  pending.then((o) => o === null && details.delete(id));
  details.set(id, pending);
  return pending;
}

async function fillDetails(g: SummaryGroup) {
  const head = g.rows.slice(0, MAX_ROWS);
  const objects = await Promise.all(head.map((r) => detailOf(r.id)));
  head.forEach((row, i) => {
    const o = objects[i];
    if (!o) return;
    const attr = (key: string) => text(o.risk?.attributes?.find((a) => a.key === key)?.value);
    const grade = text(o.risk?.grade?.value);
    if (grade) row.grade = grade;
    switch (g.block) {
      case "gantt":
        row.f.from = num(attr("project_start_year"));
        row.f.to = num(attr("project_end_year"));
        row.f.released = attr("released_on");
        row.f.type = row.f.type ?? text(o.type);
        break;
      case "check":
        for (const key of ["u_shaped", "near_river_500m", "casualty_risk_area", "barrier_form", "control_depth_cm"]) row.f[key] = attr(key);
        break;
      case "gauge":
        row.f.river = attr("river_name");
        row.f.station = attr("warning_station");
        row.f.l07 = num(attr("response_level_07"));
        row.f.l09 = num(attr("response_level_09"));
        break;
      case "score": {
        // 상류가 등급 칸에 「C등급 · 72점」 처럼 점수를 함께 적어 보낸다 — 그 숫자만 읽는다
        const m = /([\d.]+)\s*점/.exec(grade ?? "");
        row.f.score = m ? Number(m[1]) : null;
        row.grade = grade ? grade.replace(/\s*·.*$/, "") : row.grade;
        row.f.inspected = attr("latest_inspection_date");
        row.f.result = attr("latest_inspection_result");
        break;
      }
      case "reservoir":
        row.f.safety = attr("safety_grade");
        row.f.people = num(attr("downstream_people"));
        row.f.distance = num(attr("house_distance_m"));
        row.f.storage = num(attr("storage_kt"));
        row.f.released = attr("released_on");
        break;
      case "collapse": {
        const d = o.risk?.risk_score_detail as { score?: unknown } | null | undefined;
        row.f.score = d && typeof d === "object" && typeof d.score === "number" ? d.score : null;
        row.f.households = num(attr("households"));
        row.f.residents = num(attr("residents"));
        break;
      }
    }
  });
}

interface FloodTraceItem { flood_trace_id: string; district_name?: string | null; admin_code?: string | null; area_m2?: number | null; started_on?: string | null; cause?: string | null; flood_event?: { name?: string | null } | null }

/** T3Q-30 — 침수흔적 ID 로 한 번(최대 100) */
async function tracePart(keyed: KeyedRef[]): Promise<SummaryGroup | null> {
  const byId = new Map(keyed.map((k) => [k.id, k]));
  const ids = keyed.slice(0, 100).map((k) => k.id);
  const e = await data<{ items?: FloodTraceItem[] }>("T3Q-30", { body: { flood_trace_ids: ids, page: { page: 1, size: Math.min(100, Math.max(ids.length, 1)) } } });
  const items = e.result?.items ?? [];
  if (!items.length) return null;
  const rows: SummaryRow[] = items.map((t) => {
    const k = byId.get(t.flood_trace_id);
    return {
      id: t.flood_trace_id,
      name: text(t.district_name) ?? k?.ref.display_name ?? t.flood_trace_id,
      ref: k?.ref,
      adminCode: t.admin_code ?? null,
      grade: null,
      f: { date: text(t.started_on), area: typeof t.area_m2 === "number" ? t.area_m2 : null, event: text(t.flood_event?.name), cause: text(t.cause) },
    };
  });
  return { key: "침수흔적", name: "침수흔적", short: "침수흔적", tone: "blue", block: "trace", count: Math.max(items.length, keyed.length), rows, order: Math.min(...keyed.map((k) => k.order)) };
}

interface RiverKnowledge { river_name?: string | null; river_basic?: { river_type?: string | null; water_system?: string | null; river_length_km?: number | null; catchment_km2?: number | null } | null }

/** T3Q-16 — 하천마다(최대 6) */
async function riverPart(keyed: KeyedRef[]): Promise<SummaryGroup | null> {
  const list = await Promise.all(
    keyed.slice(0, 6).map((k) =>
      data<RiverKnowledge>("T3Q-16", { id: k.id, query: { station_limit: "1" } })
        .then((e) => [k, e.result ?? null] as const)
        .catch(() => [k, null] as const),
    ),
  );
  const rows: SummaryRow[] = list.map(([k, r]) => ({
    id: k.id,
    name: text(r?.river_name) ?? k.ref.display_name ?? k.id,
    ref: k.ref,
    adminCode: null,
    grade: null,
    f: {
      kind: text(r?.river_basic?.river_type),
      system: text(r?.river_basic?.water_system),
      length: typeof r?.river_basic?.river_length_km === "number" ? r.river_basic.river_length_km : null,
      catchment: typeof r?.river_basic?.catchment_km2 === "number" ? r.river_basic.catchment_km2 : null,
    },
  }));
  return { key: "하천", name: "하천", short: "하천", tone: "sky", block: "river", count: keyed.length, rows, order: Math.min(...keyed.map((k) => k.order)) };
}

// ── 도우미 ──────────────────────────────────────────────────────────────────

export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}
function num(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 법정동 코드 → 시군구 코드(앞 5자리, 브이월드 sig_cd 와 같은 체계). 모르면 null */
export function sigunguOf(adminCode: string | null): string | null {
  if (!adminCode || adminCode.length < 5 || !/^\d+$/.test(adminCode)) return null;
  return adminCode.slice(0, 5);
}

/** 구분 안의 시군구별 개수 — 많은 순 */
export function districtCounts(rows: SummaryRow[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = sigunguOf(r.adminCode);
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** 「연제구 2 · 동래구 1」 — 이름을 모르는 코드는 뺀다 */
export function districtLine(counts: [string, number][], names: ReadonlyMap<string, string>, max = 4): string | null {
  const known = counts.filter(([c]) => names.has(c));
  if (!known.length) return null;
  const rest = known.length - max;
  return known.slice(0, max).map(([c, n]) => `${names.get(c)} ${n}`).join(" · ") + (rest > 0 ? ` · 그 밖 ${rest}개 구` : "");
}

/** 「2024-09-21」 → 「24.09.21」 */
export function shortDate(value: string | number | null | undefined): string {
  const s = text(value);
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
}

/** 표 칸 값 — 없으면 「—」, 숫자는 천 단위 쉼표 */
export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? value.toLocaleString("ko-KR") : value;
}

/** 답 기준 시각 「2026.11.02 14:58」(한국 시각) — 간트의 기준선이 이 글에서 날짜를 읽는다 */
export function basisTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}
