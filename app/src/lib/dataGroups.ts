/**
 * 「데이터군 탭」의 재료 — T3Q result.result_groups[] 를 그대로 옮긴다(개발서버 features/search/lib/dataGroups.ts · conditionMatch.ts · similarCase.ts 이식, 2026-11-24).
 * 화면설계서 SCR-UNE-203001 9번 · FUN-UFR-303008 · FUN-UFR-302003 · FUN-UFR-401001 · T3Q 설명서 v0.4.8~.
 * 구분·이름·개수는 T3Q 가 준 값 그대로이고, object_ids 를 refs[].entity_id · doc_refs[].document_id 로 찾기만 한다.
 * 찾지 못한 ID 는 이름을 지어 내지 않고 목록에서 뺀다. 순서는 T3Q 가 준 object_ids 순서 그대로(유사사례는 T3Q 유사도 순위).
 */

/** 데이터군이 다루는 대상 — T3Q refs[] 한 줄(쓰는 칸만) */
export interface GroupRef {
  ref: string;
  entity_type?: string | null;
  entity_id?: string | null;
  display_name?: string | null;
  region?: { admin_code?: string | null; name?: string | null } | null;
  disaster_types?: string[] | null;
  similarity?: { score?: number | null } | null;
}

export interface GroupItem {
  /** 객체 ID(HZ-1585 · T10107-… · DOC-…) */
  key: string;
  name: string;
  /** 객체면 그 ref — 누르면 상세·지도로 */
  ref?: GroupRef;
  /** 문서면 그 주소(http(s) 또는 T3Q 쪽 본문 경로) */
  docUrl?: string;
  /** 문서면 그 근거 번호(doc_refs[].doc) — 누르면 우측 「근거 문서」 */
  doc?: string;
  /** 이름 아래 작은 글 — 지금은 유사도뿐 */
  meta: string[];
  /** 조건과 맞지 않아 구분 표시할 문구(「다른 지역 · 경기도」) */
  marks: string[];
}

export interface DataGroup {
  /** T3Q 구분 코드(SIMILAR_EVENT · RISK_AREA …) */
  key: string;
  /** 탭 이름 — T3Q 가 준 그대로 */
  label: string;
  /** T3Q 가 센 개수 */
  count: number;
  unit: string;
  items: GroupItem[];
}

/** 탭은 최대 4개(설계 9번 ②) */
export const MAX_GROUP_TABS = 4;
/** 처음 보이는 건수와 「N건 더보기」 한 번에 펼치는 건수(설계 12번 ⑥) */
export const GROUP_PAGE = 5;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const safeUrl = (u: unknown): string | undefined =>
  typeof u === "string" && (/^https?:\/\//i.test(u) || /^\/v1\/agent\/query\/[^/\s]+\/doc-refs\/[^/\s]+$/.test(u)) ? u : undefined;

function similarityMeta(ref: GroupRef): string[] {
  const score = ref.similarity?.score;
  return typeof score === "number" && Number.isFinite(score) ? [`유사도 ${Math.round(score)}`] : [];
}

interface DocLike {
  doc?: unknown;
  document_id?: unknown;
  title?: unknown;
  page?: unknown;
  url?: unknown;
}

/** result_groups → 탭 목록. 칸이 비었거나 꼴이 다르면 빈 배열(부르는 쪽이 종전 「답변 대상」 상자로) */
export function buildDataGroups(resultGroups: unknown, refs: unknown, docRefs: unknown, markOf?: (ref: GroupRef) => string[]): DataGroup[] {
  if (!Array.isArray(resultGroups)) return [];
  const byId = new Map<string, GroupRef>();
  for (const r of Array.isArray(refs) ? (refs as GroupRef[]) : []) {
    const id = typeof r?.entity_id === "string" ? r.entity_id.trim() : "";
    if (id && !byId.has(id)) byId.set(id, r);
  }
  const docById = new Map<string, DocLike>();
  for (const d of Array.isArray(docRefs) ? (docRefs as DocLike[]) : []) {
    const id = typeof d?.document_id === "string" ? d.document_id.trim() : "";
    if (id && !docById.has(id)) docById.set(id, d);
  }
  const out: DataGroup[] = [];
  for (const g of resultGroups) {
    if (!isObject(g)) continue;
    const key = typeof g.group === "string" ? g.group.trim() : "";
    if (!key) continue;
    const ids = Array.isArray(g.object_ids) ? g.object_ids.filter((o): o is string => typeof o === "string" && o !== "") : [];
    const items: GroupItem[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const ref = byId.get(id);
      if (ref) {
        const name = typeof ref.display_name === "string" ? ref.display_name.trim() : "";
        if (name) items.push({ key: id, name, ref, meta: similarityMeta(ref), marks: markOf?.(ref) ?? [] });
        continue;
      }
      const doc = docById.get(id);
      const title = typeof doc?.title === "string" ? doc.title.trim() : "";
      if (doc && title) {
        const hasPage = /p\.?\s*\d+\s*$/i.test(title) || doc.page === undefined || doc.page === null || doc.page === "";
        items.push({ key: id, name: hasPage ? title : `${title} p.${String(doc.page)}`, docUrl: safeUrl(doc.url), doc: typeof doc.doc === "string" ? doc.doc : undefined, meta: [], marks: [] });
      }
    }
    if (items.length === 0) continue;
    const label = typeof g.label === "string" && g.label.trim() ? g.label.trim() : key;
    const count = typeof g.count === "number" && Number.isFinite(g.count) && g.count >= 0 ? g.count : ids.length;
    const unit = typeof g.unit === "string" && g.unit.trim() ? g.unit.trim() : "건";
    out.push({ key, label, count, unit, items });
  }
  return out.slice(0, MAX_GROUP_TABS);
}

/**
 * 문서만 든 데이터군(T3Q DOCUMENT 군 — 「근거 문서」)을 뺀다 — 답 아래 근거 표가 같은 문서를 이미 보여 준다(개발서버 0be612a, 디자이너 결정 11-23).
 * 객체가 하나라도 든 군은 그대로, 남은 군의 차례도 그대로.
 */
export function withoutDocumentGroups(groups: DataGroup[]): DataGroup[] {
  return groups.filter((g) => g.items.some((it) => it.ref !== undefined));
}

// ── 지역·재난유형 불일치 구분 표시(FUN-UFR-302003) — 둘 다 알 때만 견준다 ──
export interface EffectiveCondition {
  /** 법정동 코드 10자리. 전국이면 null */
  regionCode: string | null;
  /** 재난유형. 전체면 빈 배열 */
  types: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : []);
const codeOf = (v: unknown): string | null => (typeof v === "string" && /^\d{10}$/.test(v) ? v : null);

/** 비교할 조건 — T3Q 가 질문에서 읽은 조건(interpreted_conditions)이 앞서고, 없으면 보낸 조건 */
export function effectiveCondition(interpreted: unknown, sent: Record<string, unknown> | null | undefined): EffectiveCondition {
  const i = isObject(interpreted) ? interpreted : {};
  const iRegion = isObject(i.region) ? codeOf(i.region.admin_code) : null;
  const sRegion = sent && isObject(sent.region) ? codeOf(sent.region.admin_code) : null;
  const iTypes = strings(i.disaster_types);
  return { regionCode: iRegion ?? sRegion, types: iTypes.length > 0 ? iTypes : strings(sent?.disaster_types) };
}

/** 코드가 가리키는 단위의 앞자리 길이 — 시도 2 · 시군구 5 · 읍면동 10 */
function prefixLength(code: string): number {
  if (code.slice(2) === "00000000") return 2;
  if (code.slice(5) === "00000") return 5;
  return 10;
}

function regionMark(ref: GroupRef, cond: EffectiveCondition): string | null {
  if (!cond.regionCode) return null;
  const refCode = codeOf(ref.region?.admin_code);
  if (!refCode) return null;
  const condLen = prefixLength(cond.regionCode);
  if (prefixLength(refCode) < condLen) return null;
  if (refCode.startsWith(cond.regionCode.slice(0, condLen))) return null;
  return (typeof ref.region?.name === "string" && ref.region.name.trim()) || null;
}

function typeMark(ref: GroupRef, cond: EffectiveCondition): string | null {
  if (ref.entity_type !== "EVENT" || cond.types.length === 0) return null;
  const own = strings(ref.disaster_types);
  if (own.length === 0) return null;
  return own.some((t) => cond.types.includes(t)) ? null : own.join("·");
}

/** 구분 표시 문구 — 없으면 빈 배열(문구는 개발서버 그대로 — 디자이너 확정 전 임시) */
export function mismatchMarks(ref: GroupRef, cond: EffectiveCondition | null | undefined): string[] {
  if (!cond) return [];
  const marks: string[] = [];
  const region = regionMark(ref, cond);
  if (region) marks.push(`다른 지역 · ${region}`);
  const type = typeMark(ref, cond);
  if (type) marks.push(`다른 유형 · ${type}`);
  return marks;
}

// ── 유사사례 한눈 요약 판단(FUN-UFR-401001) ──
export interface SimilarJudgement {
  /** T3Q 가 유사사례 순위를 매긴 답인가 */
  similar: boolean;
  /** T3Q 가 질문에서 읽은 재난유형 */
  disasterTypes: string[];
}

/** context_used 로 판단 — 아예 없는 옛 답은 null(부르는 쪽이 질문 낱말 판단으로) */
export function judgeSimilar(contextUsed: unknown): SimilarJudgement | null {
  if (!isObject(contextUsed)) return null;
  const ic = contextUsed.interpreted_conditions;
  const disasterTypes = isObject(ic) ? strings(ic.disaster_types) : [];
  const r = contextUsed.similarity_ranking;
  return { similar: typeof r === "object" && r !== null, disasterTypes };
}
