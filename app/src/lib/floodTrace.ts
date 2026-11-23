/**
 * 침수흔적 상세(UFR-003-001-06) — 개발서버 features/panel/lib/floodTrace(a4cb228, FUN-UFR-603001) 이식.
 *
 * 침수흔적(FLOOD_TRACE · FT-)은 위험·취약 대상 상세(T3Q-15 /risk-objects)에 없어 그쪽에 물으면 늘 「상세 정보를 찾을 수 없습니다」였다.
 * 속성은 침수흔적 조회(T3Q-30 POST /flood-traces/search · flood_trace_ids)가 준다. 값은 받은 그대로 — 계산·추정하지 않는다.
 */
import type { RefLike } from "./mapRef";

/** 침수흔적 한 건 — T3Q-30 result.items[]. 원천에 없는 칸(max_depth_m 등, data_gaps NOT_IN_SOURCE)은 null 로 온다 */
export interface FloodTraceDetail {
  flood_trace_id: string;
  spatial_object_id?: string | null;
  district_name?: string | null;
  admin_code?: string | null;
  flood_event?: { flood_event_id?: string | null; name?: string | null } | null;
  flood_grade?: string | number | null;
  max_depth_m?: number | null;
  avg_flood_depth_raw?: number | null;
  /** 원천에 단위가 없어 T3Q 가 적어 준 단위 설명(예: 「원천 단위 미표기(cm 로 보임)」) */
  avg_flood_depth_unit?: string | null;
  avg_flood_level_m?: number | null;
  area_m2?: number | null;
  damage_amount_krw?: number | null;
  flood_hours?: number | null;
  cause?: string | null;
  flood_year?: number | null;
  started_on?: string | null;
  ended_on?: string | null;
  has_geometry?: boolean | null;
}

const FT = /^FT-/;

/** 침수흔적 객체인가 — T3Q 갈래(FLOOD_TRACE)나 객체 ID 꼴(FT-, 상류 v0.4.0)로 가린다 */
export function isFloodTrace(r: Partial<Pick<RefLike, "entity_type" | "entity_id">>): boolean {
  if (r.entity_type === "FLOOD_TRACE") return true;
  return FT.test(r.entity_id?.trim() ?? "");
}

/** 객체 ID 만으로 — 상세 탭(T3Q-15 로 열린 것 포함)이 침수흔적인지 */
export const isFloodTraceId = (id: string | null | undefined): boolean => FT.test(id?.trim() ?? "");

/** T3Q-30 에 넘길 침수흔적 ID. 없으면 부르지 않는다(지어서 맞추지 않는다) */
export function floodTraceId(r: Pick<RefLike, "entity_id">): string | null {
  const id = r.entity_id?.trim();
  return id && FT.test(id) ? id : null;
}

/** T3Q-30 조회 본문 — 그 ID 한 건(개발서버 panelApi.floodTrace) */
export const floodTraceBody = (id: string) => ({ flood_trace_ids: [id], page: { page: 1, size: 1 } });

/** 받은 봉투에서 그 ID 의 것만 — 다른 흔적이 섞여 오면 엉뚱한 값을 보이는 것보다 없는 편이 낫다 */
export function floodTraceItem(result: unknown, id: string): FloodTraceDetail | null {
  const items = (result as { items?: FloodTraceDetail[] } | null | undefined)?.items;
  return items?.find((x) => x?.flood_trace_id === id) ?? null;
}

/** 상세 표의 한 줄. 값이 비어 오면 null — 화면이 「—」로 적는다 */
export interface FloodTraceRow {
  label: string;
  value: string | null;
}

/**
 * 침수흔적 상세 표의 줄들(UFR-003-001-06 — 갈래마다 제공되는 항목만).
 * 숫자에 천 단위 쉼표만 넣고, 단위는 필드 이름이 밝힌 것(area_m2 → ㎡, _m → m, _krw → 원, _hours → 시간)만 붙인다.
 * 평균 침수심은 원천에 단위가 없어 T3Q 가 적어 준 단위 설명(avg_flood_depth_unit)을 그대로 붙인다. 행정코드는 내보이지 않는다.
 */
export function floodTraceRows(item: FloodTraceDetail): { basic: FloodTraceRow[]; scale: FloodTraceRow[] } {
  const period =
    item.started_on || item.ended_on
      ? item.started_on && item.ended_on && item.started_on !== item.ended_on
        ? `${item.started_on} ~ ${item.ended_on}`
        : (item.started_on ?? item.ended_on ?? null)
      : null;

  const depth =
    item.avg_flood_depth_raw === null || item.avg_flood_depth_raw === undefined
      ? null
      : `${num(item.avg_flood_depth_raw)}${text(item.avg_flood_depth_unit) ? ` (${text(item.avg_flood_depth_unit)})` : ""}`;

  return {
    basic: [
      { label: "지구명", value: text(item.district_name) },
      { label: "재난명", value: text(item.flood_event?.name) },
      { label: "발생연도", value: item.flood_year === null || item.flood_year === undefined ? null : String(item.flood_year) },
      { label: "침수 기간", value: period },
      { label: "침수 원인", value: text(item.cause) },
    ],
    scale: [
      { label: "침수 면적", value: unit(item.area_m2, "㎡") },
      { label: "평균 침수심", value: depth },
      { label: "최대 침수심", value: unit(item.max_depth_m, "m") },
      { label: "평균 침수위", value: unit(item.avg_flood_level_m, "m") },
      { label: "침수 시간", value: unit(item.flood_hours, "시간") },
      { label: "침수 등급", value: text(item.flood_grade) },
      { label: "피해액", value: unit(item.damage_amount_krw, "원") },
    ],
  };
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: number | string): string {
  return typeof v === "number" ? v.toLocaleString("ko-KR", { maximumFractionDigits: 20 }) : v;
}

function unit(v: number | string | null | undefined, u: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  return `${num(v)} ${u}`;
}
