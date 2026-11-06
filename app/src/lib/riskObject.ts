/**
 * 위험·취약 대상 상세(T3Q-15) 화면 규칙 — 개발서버 features/panel EntityTab·useRiskObject·riskObjectId(kjw 998facb) 이식(2026-11-07).
 * 화면(components/explore/EntityDetail)과 시험이 함께 쓰는 순수 함수만 둔다.
 *  · 받은 것만 그린다 — 갈래마다 오는 칸이 다르고, 위험등급·지정사유·판단근거는 지어내지 않는다.
 *  · 상류가 «없다»(NOT_PROVIDED)고 밝힌 칸은 그 사실을 적는다 — 조용히 사라지면 등급이 낮은 줄로 읽힌다.
 *  · 받은 상세의 이름이 연 대상과 다르면 버린다(mismatch) — 엉뚱한 객체의 위험등급을 보이는 것은 아무것도 안 보이는 것보다 나쁘다.
 */
import type { T3qDataState, T3qEnvelope } from "./t3qData";
import { sameObject } from "./mapRef";

export interface ProvidedValue { value?: string | number | null; status?: string | null }
export interface RiskAttribute { key?: string | null; label?: string | null; value?: string | number | null }
export interface RiskDocument { title?: string | null; evidence_ref?: string | null; document_id?: string | null; document_type?: string | null }
export interface RiskObject {
  object_id?: string | null;
  data_group?: string | null;
  category?: string | null;
  type?: string | null;
  source_subtype?: string | null;
  name?: string | null;
  address?: string | null;
  admin_area?: { admin_code?: string | null; name?: string | null } | null;
  risk?: {
    grade?: ProvidedValue | null;
    designated_at?: string | null;
    designation_reason?: string | null;
    key_risk_condition?: string | null;
    expected_damage?: string | null;
    designation_no?: string | null;
    area_or_length?: string | number | null;
    risk_score_detail?: string | number | null;
    vulnerability?: string | null;
    attributes?: RiskAttribute[] | null;
  } | null;
  management?: { agency?: string | null; department?: string | null; contact?: string | null; contains_pii?: boolean | null } | null;
  basis?: { designation_basis?: string | null; related_plans?: RiskDocument[] | null; past_events?: RiskDocument[] | null; related_documents?: RiskDocument[] | null } | null;
  source?: { name?: string | null; table?: string | null; row_no?: string | number | null; as_of?: string | null } | null;
  [k: string]: unknown;
}

/** 상류 갈래 이름 → 사람이 읽는 말. 모르는 값은 내보내지 않는다(상류 코드가 글에 섞이면 안 됨) */
export const KIND_NAMES: Record<string, string> = {
  REGION: "위험·취약지역",
  RISK_AREA: "위험·취약지역",
  RISK_FACTOR: "잠재 위험요소·취약시설",
  RISK_FACTOR_FACILITY: "잠재 위험요소·취약시설",
  EVENT: "유사재난 사례",
  PLAN: "계획지식",
  MANUAL: "행동매뉴얼",
};

/** 예외 문구 — 개발서버와 글자까지 같다 */
export const NOT_PROVIDED = "해당 정보가 제공되지 않습니다.";
export const NO_GEOMETRY = "⚠ 위치정보가 제공되지 않아 지도에 표시할 수 없습니다.";
export const UNAVAILABLE: Record<"nokey" | "none" | "mismatch" | "failed", string> = {
  nokey: "이 대상은 지역 단위로 가리킨 것이라 객체 상세가 없습니다. 지도에서 위치를 볼 수 있습니다.",
  none: "상세 정보를 찾을 수 없습니다.",
  mismatch: "상세 정보가 이 대상과 일치하지 않아 표시하지 않습니다.",
  failed: "상세 정보를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.",
};
/** 점검·정비 기록 아래 주의 — 그때의 기록이라 「지금 안전함」으로 읽히면 안 된다 */
export const recordCaution = (asOf: string | null) => `⚠ 출처 자료에 적힌 기록이며 현재 상태가 아닙니다${asOf ? ` (자료 기준 ${asOf}).` : "."}`;

export type RiskTextField = "designation_reason" | "key_risk_condition" | "expected_damage" | "designation_no" | "area_or_length" | "risk_score_detail";
/** 위험·취약정보에 싣는 글자 칸(등급·지정일은 요약 타일이 먼저 가져간다) */
export const RISK_FIELDS: { key: RiskTextField; label: string }[] = [
  { key: "designation_reason", label: "지정사유" },
  { key: "key_risk_condition", label: "주요 위험조건" },
  { key: "expected_damage", label: "예상 피해" },
  { key: "designation_no", label: "지정번호" },
  { key: "area_or_length", label: "지정면적·연장" },
  { key: "risk_score_detail", label: "위험도 산정" },
];

/** 점검·정비 기록으로 읽어야 하는 속성(현행화를 확인할 수 없어 현재 상태로 보이지 않음) */
export const RECORD_KEY = /inspection|repair|maintenance|improve|점검|정비/i;

/** 빈 값을 하나로 — null·빈칸·공백만 있는 글자는 «없음» */
export function text(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === "object") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export interface Row { label: string; value: string | null; missing?: boolean }

export function attrRow(a: RiskAttribute, i: number): Row {
  return { label: text(a.label) ?? a.key ?? `항목 ${i + 1}`, value: text(a.value) };
}

export function joinTitles(items: RiskDocument[] | null | undefined): string | null {
  const titles = (items ?? []).map((d) => text(d.title) ?? text(d.evidence_ref)).filter(Boolean);
  return titles.length > 0 ? titles.join(" · ") : null;
}

/** 위험등급 한 칸 — 뜻은 풀지 않는다(자료마다 체계가 다름). 상류가 «없다» 고 밝힌 때만 그 사실을 적는다 */
export function gradeText(grade: ProvidedValue | null | undefined): { text: string; missing?: boolean } | null {
  const v = text(grade?.value);
  if (v) return { text: v };
  return grade?.status === "NOT_PROVIDED" ? { text: NOT_PROVIDED, missing: true } : null;
}

/** 「지하차도 현황(2026-06-10 기준) · 지하차도_차단시설_현황 · 275행」 */
export function sourceText(source: RiskObject["source"]): string | null {
  const parts = [text(source?.name), text(source?.table)];
  const row = text(source?.row_no);
  if (row) parts.push(`${row}행`);
  const joined = parts.filter(Boolean).join(" · ");
  return joined === "" ? null : joined;
}

/** 요약 타일(위험등급·지정일·지정면적·연장·취약속성) — 값 없는 타일은 내지 않는다 */
export function summaryTiles(o: RiskObject): { key: "grade" | "at" | "size" | "weak"; v: string; lb: string; missing?: boolean }[] {
  const out: { key: "grade" | "at" | "size" | "weak"; v: string; lb: string; missing?: boolean }[] = [];
  const g = gradeText(o.risk?.grade);
  if (g) out.push({ key: "grade", v: g.text, lb: "위험등급", missing: g.missing });
  const at = text(o.risk?.designated_at);
  if (at) out.push({ key: "at", v: at, lb: "지정일" });
  const size = text(o.risk?.area_or_length);
  if (size) out.push({ key: "size", v: size, lb: "지정면적·연장" });
  const weak = text(o.risk?.vulnerability);
  if (weak) out.push({ key: "weak", v: weak, lb: "취약속성" });
  return out;
}

/** 위험·취약정보 줄과 점검·정비 기록 줄을 가른다 */
export function riskRows(o: RiskObject): { rows: Row[]; records: Row[] } {
  const risk = o.risk;
  const attrs = risk?.attributes ?? [];
  const specs = attrs.filter((a) => !RECORD_KEY.test(a.key ?? ""));
  const records = attrs.filter((a) => RECORD_KEY.test(a.key ?? ""));
  const g = gradeText(risk?.grade);
  return {
    rows: [
      { label: "위험등급", value: g?.text ?? null, missing: g?.missing },
      { label: "지정일", value: text(risk?.designated_at) },
      ...RISK_FIELDS.map((f) => ({ label: f.label, value: text(risk?.[f.key]) })),
      { label: "취약속성", value: text(risk?.vulnerability) },
      ...specs.map(attrRow),
    ],
    records: records.map(attrRow),
  };
}

export const basicRows = (o: RiskObject): Row[] => [
  { label: "명칭", value: text(o.name) },
  { label: "분류", value: text(o.category) },
  { label: "유형", value: text(o.type) },
  { label: "세부 구분", value: text(o.source_subtype) },
  { label: "행정구역", value: text(o.admin_area?.name) },
  { label: "주소", value: text(o.address) },
];

/** 관리정보 — 개인정보가 섞인 연락처는 내보이지 않는다 */
export const manageRows = (o: RiskObject): Row[] => [
  { label: "관리기관", value: text(o.management?.agency) },
  { label: "담당부서", value: text(o.management?.department) },
  { label: "연락처", value: o.management?.contains_pii ? null : text(o.management?.contact) },
];

export const basisRows = (o: RiskObject): Row[] => [
  { label: "지정근거", value: text(o.basis?.designation_basis) },
  { label: "관련 계획", value: joinTitles(o.basis?.related_plans) },
  { label: "관련 문서", value: joinTitles(o.basis?.related_documents) },
  { label: "출처", value: sourceText(o.source) },
];

/** 영역마다 보여 줄 값이 하나라도 있는가 — 없는 영역은 세우지 않는다. 기본정보는 이름이 있어 늘 선다 */
export function sectionsWithContent(o: RiskObject) {
  const filled = (rows: Row[]) => rows.some((r) => r.value !== null);
  const r = riskRows(o);
  return {
    risk: filled(r.rows) || (o.risk?.attributes ?? []).some((a) => text(a.value) !== null),
    events: (o.basis?.past_events ?? []).length > 0,
    manage: filled(manageRows(o)),
    basis: filled(basisRows(o)),
  };
}

/** 원본 보기에서도 개인정보가 섞인 연락처는 뺀다 */
export function withoutPii(o: RiskObject): RiskObject {
  if (!o.management?.contains_pii) return o;
  return { ...o, management: { ...o.management, contact: null } };
}

/**
 * 받아 본 결과 — 네 가지 «없음» 을 갈라 둔다(담당자가 다음에 할 일이 다르다).
 * nokey = 부를 열쇠가 없음(지역 단위 대상) · none = 상류에 없음(성공이 아닌 봉투) · mismatch = 다른 객체가 옴 · failed = 못 불렀음
 */
export type RiskObjectState =
  | { kind: "nokey" }
  | { kind: "loading" }
  | { kind: "ok"; object: RiskObject }
  | { kind: "none" }
  | { kind: "mismatch" }
  | { kind: "failed" };

export function riskStateOf(id: string | null | undefined, q: T3qDataState<T3qEnvelope<RiskObject>> | null, askedName: string | null | undefined): RiskObjectState {
  if (!id?.trim()) return { kind: "nokey" };
  if (!q || q.state === "loading") return { kind: "loading" };
  if (q.state === "error") return { kind: "failed" };
  const env = q.data;
  const o = env?.result;
  if (!o || env.status !== "SUCCESS") return { kind: "none" };
  return sameObject(askedName, o.name) ? { kind: "ok", object: o } : { kind: "mismatch" };
}
