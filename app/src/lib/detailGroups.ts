/**
 * 대상 상세(T3Q-15) 밖의 상세 — 계획문서(T3Q-17)·하천 계획지식(T3Q-16) 등 — 를 개발서버 EntityTab 의 묶음 화면 규칙으로 나눈다(R59).
 * 개발서버 우측 패널에는 이 상세들의 탭이 없고(상세는 EntityTab·사건 EventPane 둘뿐), 상세는 모두 EntityTab 문법으로 선다 —
 * 머리(아이콘·갈래 · ID·이름) → 칩 → 「출처 · 자료 기준」 → 알약 제목 묶음(기본정보 · 받은 묶음마다 한 칸) → 원본 항목 전체 보기.
 * 규칙도 EntityTab 그대로: 받은 것만 그린다(값은 받은 글자 그대로 — 숫자만 천 단위 쉼표), 내용 없는 묶음은 세우지 않는다,
 * 상류가 «없다»(status NOT_PROVIDED)고 밝힌 칸만 「해당 정보가 제공되지 않습니다.」. 칸 이름은 필드 사전(lib/labels)으로.
 * 화면(components/explore/GroupedDetail)과 시험이 함께 쓰는 순수 함수만 둔다.
 */
import { fieldKo, QUALITY_KO } from "./labels";
import { fmtValue } from "./format";
import { NOT_PROVIDED, text, type Row } from "./riskObject";

/** 한 칸 — 표·나무로 그릴 것(rows 로 못 펴는 목록)은 tree */
export interface DetailGroup {
  title: string;
  rows: Row[];
  tree?: unknown;
}

export interface GroupedDetail {
  name: string | null;
  objectId: string | null;
  /** 머리 칩 — 갈래(계획 종류·분류) · 지역 · 기준 연도 */
  kind: string | null;
  area: string | null;
  year: string | null;
  groups: DetailGroup[];
}

/** 머리·칩이 가져가는 칸(기본정보에 다시 적지 않음) */
const ID_KEYS = ["plan_id", "object_id", "river_id", "event_master_id", "document_id"];
const NAME_KEYS = ["name", "river_name", "display_name", "title"];
const KIND_KEYS = ["plan_type", "category", "type", "river_type", "knowledge_type"];
const AREA_KEYS = ["target_area", "admin_name"];
const YEAR_KEYS = ["base_year"];

const isScalar = (v: unknown) => v === null || v === undefined || typeof v !== "object";
const isScalarList = (v: unknown): v is unknown[] => Array.isArray(v) && v.every(isScalar);
/** 값 하나 → 글자(받은 그대로, 숫자만 쉼표 — 번호·연도 열은 그대로). 비면 null */
export function valueText(key: string, v: unknown): string | null {
  // 상류 품질 코드는 사람이 읽는 말로(예전 받은 값 나무의 머리 줄과 같은 사전) — 모르는 코드는 그대로
  if (key === "quality_status" && typeof v === "string") return QUALITY_KO[v] ?? v;
  if (typeof v === "number") return Number.isFinite(v) ? fmtValue(key, v) : String(v);
  if (typeof v === "boolean") return v ? "예" : "아니요";
  if (isScalarList(v)) {
    const parts = v.map((x) => valueText(key, x)).filter((x): x is string => x !== null);
    return parts.length ? parts.join(", ") : null;
  }
  return text(v);
}

/** {value, status} 꼴(상류의 «제공 여부» 칸) — NOT_PROVIDED 면 그 사실을 적는다 */
function provided(v: unknown): { value: string | null; missing: boolean } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!("status" in o) || Object.keys(o).some((k) => k !== "value" && k !== "status")) return null;
  if (o.status === "NOT_PROVIDED") return { value: NOT_PROVIDED, missing: true };
  return { value: valueText("value", o.value), missing: false };
}

const first = (o: Record<string, unknown>, keys: string[]): [string, string] | null => {
  for (const k of keys) {
    const t = valueText(k, o[k]);
    if (t !== null) return [k, t];
  }
  return null;
};

/** {label, value} 목록인가(type_specific_items.items · 속성 목록) */
const isLabelList = (v: unknown): v is { label?: unknown; key?: unknown; value?: unknown }[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => !!x && typeof x === "object" && !Array.isArray(x) && "value" in x && ("label" in x || "key" in x));
/** {section, items:[{label,value}]} 목록인가(T3Q-17 type_specific_items) */
const isSectionList = (v: unknown): v is { section?: unknown; items?: unknown }[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => !!x && typeof x === "object" && !Array.isArray(x) && "section" in x && isLabelList((x as { items?: unknown }).items ?? []));

function labelRows(items: { label?: unknown; key?: unknown; value?: unknown }[]): Row[] {
  return items.map((it, i) => {
    const p = provided(it.value);
    const label = text(it.label) ?? (typeof it.key === "string" ? fieldKo(it.key) : `항목 ${i + 1}`);
    return p ? { label, value: p.value, missing: p.missing } : { label, value: valueText(typeof it.key === "string" ? it.key : "value", it.value) };
  });
}

/** 객체 하나의 단순 칸 → 줄. 묶음 안의 묶음(객체·객체 목록)은 나무로 남긴다 */
function objectRows(o: Record<string, unknown>, skip: ReadonlySet<string> = new Set()): { rows: Row[]; rest: Record<string, unknown> } {
  const rows: Row[] = [];
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (skip.has(k)) continue;
    const p = provided(v);
    if (p) rows.push({ label: fieldKo(k), value: p.value, missing: p.missing });
    else if (isScalar(v) || isScalarList(v)) rows.push({ label: fieldKo(k), value: valueText(k, v) });
    else if (v && typeof v === "object" && (!Array.isArray(v) || v.length > 0)) rest[k] = v;
  }
  return { rows, rest };
}

const hasRows = (g: DetailGroup) => g.rows.some((r) => r.value !== null) || g.tree !== undefined;

/** 받은 상세(result) → 머리·묶음. 결과가 객체가 아니면 null */
export function groupDetail(result: unknown): GroupedDetail | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const o = result as Record<string, unknown>;
  const name = first(o, NAME_KEYS);
  const id = first(o, ID_KEYS);
  const kind = first(o, KIND_KEYS);
  const area = first(o, AREA_KEYS);
  const year = first(o, YEAR_KEYS);
  const head = new Set([name?.[0], id?.[0], kind?.[0], area?.[0], year?.[0]].filter((k): k is string => !!k));

  const basic = objectRows(o, head);
  const groups: DetailGroup[] = [{ title: "기본정보", rows: basic.rows }];
  for (const [k, v] of Object.entries(basic.rest)) {
    if (isSectionList(v)) {
      // 상류가 묶어 보낸 칸(문서 · 구간·수계 · 수문 …) — 묶음마다 한 칸, 이름은 받은 그대로
      v.forEach((sec, i) => groups.push({ title: text(sec.section) ?? `${fieldKo(k)} ${i + 1}`, rows: labelRows((sec.items ?? []) as { label?: unknown; value?: unknown }[]) }));
    } else if (isLabelList(v)) {
      groups.push({ title: fieldKo(k), rows: labelRows(v) });
    } else if (Array.isArray(v)) {
      groups.push({ title: fieldKo(k), rows: [], tree: v });
    } else {
      const inner = objectRows(v as Record<string, unknown>);
      const g: DetailGroup = { title: fieldKo(k), rows: inner.rows };
      if (Object.keys(inner.rest).length) g.tree = inner.rest;
      groups.push(g);
    }
  }
  return {
    name: name?.[1] ?? null,
    objectId: id?.[1] ?? null,
    kind: kind?.[1] ?? null,
    area: area?.[1] ?? null,
    year: year?.[1] ?? null,
    groups: groups.filter(hasRows),
  };
}

/** 받아 본 결과 — EntityTab 예외 문구(none · failed)를 쓴다. 일부 제공(PARTIAL_SUCCESS)도 받은 칸은 그린다 */
export type GroupedState = { kind: "loading" } | { kind: "ok"; detail: GroupedDetail } | { kind: "none" } | { kind: "failed" };

export function groupedStateOf(q: { state: "loading" | "ok" | "error"; data: { status?: string; result?: unknown } | null }): GroupedState {
  if (q.state === "loading") return { kind: "loading" };
  if (q.state === "error" || !q.data) return { kind: "failed" };
  const st = q.data.status;
  if (st !== "SUCCESS" && st !== "PARTIAL_SUCCESS") return { kind: "none" };
  const d = groupDetail(q.data.result);
  return d ? { kind: "ok", detail: d } : { kind: "none" };
}
