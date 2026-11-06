/**
 * 지도 대상(T3Q refs) 열쇠·확대 규칙·점 묶기 — 개발 서버 MapPane·entityId·riskObjectId·adminCenter 이식(2026-11-06).
 * 화면·시험이 함께 쓰는 순수 함수만 둔다(브라우저 전용 코드 없음).
 */
import type { T3qRef } from "./jobTypes";

/** refs 한 건(받은 칸만) — entity_id·spatial_object_id 는 T3Q v0.4 부터 올 수 있다 */
export type RefLike = Pick<T3qRef, "ref" | "entity_type" | "display_name"> & {
  map?: { key: string | null; value: string; draw?: string | null } | null;
  entity_id?: string | null;
  spatial_object_id?: string | null;
};

/**
 * 객체 하나를 가리키는 화면 열쇠 — 지도 열쇠(key:value), 없으면 ref.
 * ref(r11)는 그 답 안에서만 통하므로 여러 답을 오가는 집기·선택은 이 열쇠로 가린다(개발 서버 entityId).
 */
export function entityKey(r: RefLike): string {
  const k = r.map?.key;
  const v = r.map?.value;
  return k && v ? `${k}:${v}` : `ref:${r.ref}`;
}

/**
 * 질의에 참조로 붙일 객체 ID(reference.object_ids) — entity_id → spatial_object_id → 지도 열쇠(key:value) 차례(개발 서버 objectId).
 * 아무것도 없으면 null — 그런 대상은 ID 없이 이름(키워드)만 간다. T3Q 와 규약 미합의(문의 목록 항목).
 */
export function objectIdOf(r: RefLike): string | null {
  const id = r.entity_id ?? r.spatial_object_id;
  if (id) return id;
  const k = r.map?.key;
  const v = r.map?.value;
  return k && v ? `${k}:${v}` : null;
}

/**
 * 상세(T3Q-15) object_id — 실측 표(개발 서버 riskObjectId, 상류 dev165 2026-10-29·11-03).
 * underpass_id=614 → UP-614 · slope_no → SL- · hazard_zone_id → HZ-. 표에 없는 열쇠는 지어 맞추지 않는다(null).
 */
const DETAIL_PREFIX: Record<string, string> = { underpass_id: "UP-", slope_no: "SL-", hazard_zone_id: "HZ-" };
const OBJECT_ID = /^[A-Z]{2,3}-\S+$/;
export function detailIdOf(r: RefLike): string | null {
  const given = r.entity_id?.trim();
  if (given && OBJECT_ID.test(given)) return given;
  const k = r.map?.key;
  const v = r.map?.value;
  if (!k || !v) return null;
  const p = DETAIL_PREFIX[k];
  return p ? p + v : null;
}

/** 받은 상세(T3Q-15 result)에 보여 줄 속성이 있는가 — 없으면 말풍선 「상세 보기」를 회색으로(개발 서버 hasDetail) */
export function hasDetail(o: unknown): boolean {
  const risk = (o as { risk?: Record<string, unknown> | null } | null)?.risk;
  if (!risk) return false;
  const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
  const attrs = risk.attributes as { value?: unknown }[] | undefined;
  if (attrs?.some((a) => filled(a?.value))) return true;
  return ["designation_reason", "key_risk_condition", "expected_damage", "vulnerability", "designated_at", "area_or_length"].some((k) => filled(risk[k]));
}

/** 받은 상세가 정말 그 객체인지 — 이름이 다르면 버린다(띄어쓰기만 다른 것은 같게). 견줄 이름이 없으면 막지 않는다 */
export function sameObject(askedName: string | null | undefined, gotName: unknown): boolean {
  if (!askedName || typeof gotName !== "string" || !gotName) return true;
  return askedName.replace(/\s+/g, "") === gotName.replace(/\s+/g, "");
}

/** 한 건만 확대해 볼 때의 최대 줌 — 더 당기면 배경지도 타일이 없다 */
export const FOCUS_ZOOM = 17;

/**
 * 이 좌표를 얼마나 당겨 보여 줄지 — 근사 위치일수록 멀리서(개발 서버 focusZoomOf).
 * sigungu_* → 11 · *_center(dong_center 등) → 14 · 그 밖 → 17. 보이는 넓이가 곧 「이 안 어딘가」라는 말이 된다.
 */
export function focusZoomOf(precision: string | null | undefined): number {
  const p = precision ?? "";
  if (p.startsWith("sigungu")) return 11;
  if (p.endsWith("_center")) return 14;
  return FOCUS_ZOOM;
}

/**
 * 점 하나로 옮겨 갈 줌 — 정확한 점은 지금 배율이 더 가까우면 그대로, 근사한 점은 그 칸까지 물러난다
 * (가까이 둔 채 점만 옮기면 정확도만 몰래 떨어진 꼴이 된다).
 */
export function pointZoom(precision: string | null | undefined, current: number): number {
  const z = focusZoomOf(precision);
  return z === FOCUS_ZOOM ? Math.max(current, z) : z;
}

/** 화면에서 이 거리(px) 안에 함께 든 점들을 하나로 묶는다 */
export const CLUSTER_PX = 56;
/** 이 줌부터는 묶지 않는다 — 건물 단위로 보는 거리 */
export const CLUSTER_UNTIL_ZOOM = 16;

/**
 * 거리 기준 묶기(개발 서버 recluster) — 아직 안 묶인 점 하나를 씨앗으로, 화면에서 px 안에 든 것을 모두 끌어들인다.
 * 이웃이 많은 점부터 씨앗이 된다. 격자로 자르면 칸 경계 양쪽 이웃이 따로 묶여 「3」「3」이 나란히 선다.
 * 입력 좌표는 화면 픽셀(또는 같은 축척의 평면 좌표 ÷ 해상도). 돌려주는 것은 묶음마다 입력 번호 목록(낱개 포함).
 */
export function clusterPoints(pts: { x: number; y: number }[], px = CLUSTER_PX): number[][] {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const near = pts.map((a) => pts.filter((b) => d(a, b) <= px).length);
  const order = pts.map((_, i) => i).sort((i, j) => near[j] - near[i] || i - j);
  const taken = new Set<number>();
  const out: number[][] = [];
  for (const i of order) {
    if (taken.has(i)) continue;
    const members = pts.map((_, j) => j).filter((j) => !taken.has(j) && d(pts[j], pts[i]) <= px);
    members.forEach((j) => taken.add(j));
    out.push(members);
  }
  return out;
}

/** 경위도 두 점 사이 거리(m) */
export function distM(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 처음 화면을 맞출 대상 — 무리에서 멀리 떨어진 것은 뺀다(개발 서버 coreBounds).
 * 가운데(경도·위도 중앙값)에서 떨어진 거리의 중앙값 4배(최소 5km)보다 먼 것은 맞출 범위에서만 뺀다 — 지도에는 남는다.
 * 상류 좌표가 가끔 바다 한가운데로 온다(만덕동 산118-1 이 부산 남쪽 바다 위). 입력 = 대상마다 대표점 [경도, 위도]. 돌려주는 것은 남길 번호.
 */
export function coreIndices(at: [number, number][]): number[] {
  if (at.length === 0) return [];
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const mid: [number, number] = [median(at.map((p) => p[0])), median(at.map((p) => p[1]))];
  const dist = at.map((p) => distM(mid, p));
  const limit = Math.max(5000, median(dist) * 4);
  const kept = at.map((_, i) => i).filter((i) => dist[i] <= limit);
  return kept.length ? kept : at.map((_, i) => i);
}

/**
 * 좌표가 행정구역 중심점인가(precision *_center) — 그 점은 대상의 자리가 아니라 그 지역의 한가운데다(개발 서버 adminCenter).
 * 열쇠가 행정코드(숫자 2·5·8자리, 또는 10자리 법정동)일 때만 어느 지역인지 안다 → 브이월드 코드(시·도 2 · 시·군·구 5 · 읍·면·동 8)로.
 */
export function adminCenterCode(precision: string | null | undefined, value: string | null | undefined): string | null {
  if (!(precision ?? "").endsWith("_center")) return null;
  const v = (value ?? "").trim();
  if (!/^\d+$/.test(v)) return null;
  if (v.length === 2 || v.length === 5 || v.length === 8) return v;
  if (v.length === 10) return v.endsWith("00000000") ? v.slice(0, 2) : v.endsWith("00000") ? v.slice(0, 5) : v.slice(0, 8);
  return null;
}

/** 중심점 코드 → /api/regions 로 이름을 물을 단계·상위 코드 */
export function adminLookupOf(code: string): { level: "sido" | "sigungu" | "emd"; parent: string } {
  if (code.length === 2) return { level: "sido", parent: "" };
  if (code.length === 5) return { level: "sigungu", parent: code.slice(0, 2) };
  return { level: "emd", parent: code.slice(0, 5) };
}

/**
 * 지도에 적을 이름 — 행정구역 중심점이면 그 지역 이름(「인제군 중심」). 이름을 못 받았으면 받은 이름에 「(행정구역 중심 좌표)」.
 * 지구 열넷이 번호 하나로 묶여 온 답에서 그중 한 이름을 적으면 나머지 열셋에게 거짓말이 된다.
 */
export function centerLabel(name: string | null, precision: string | null | undefined, value: string | null | undefined, names: ReadonlyMap<string, string>): string | null {
  if (!(precision ?? "").endsWith("_center")) return name;
  const code = adminCenterCode(precision, value);
  const area = code ? names.get(code) : undefined;
  if (area) return `${area} 중심`;
  return name ? `${name} (행정구역 중심 좌표)` : name;
}

/** 「지도 표시」 갈래 — 개발 서버 mapSymbols(설계 207002 범례 8) */
export type MapSymbol = "event" | "factor" | "area" | "plan" | "other";
export const SYMBOL_NAMES: Record<MapSymbol, string> = {
  event: "유사사례",
  factor: "잠재 위험요소·취약시설",
  area: "위험·취약지역",
  plan: "계획지식",
  other: "그 밖의 대상",
};
export function symbolOf(entityType: string | null | undefined): MapSymbol {
  switch (entityType) {
    case "EVENT": return "event";
    case "RISK_FACTOR":
    case "RISK_FACTOR_FACILITY": return "factor";
    case "RISK_AREA": return "area";
    case "PLAN": return "plan";
    default: return "other";
  }
}
