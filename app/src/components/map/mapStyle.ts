/**
 * 지도 표식 정의 — 범례(LEGEND) · 핀 그림 · T3Q 코드의 한글 이름.
 *
 * - DOM·OpenLayers 를 쓰지 않는다 → 범례 컴포넌트(서버 렌더 가능)와 MapView 가 함께 쓴다.
 * - 색은 KRDS 토큰: primary #256EF4 · secondary/70(남색) #063A74 · warning/50(황토) #9E6A00
 *   · information/50 #0B78CB · danger #DE3412 · gray-50 #6D7882 · text #1E2124
 * - 표식 모양은 Figma map_marker(물방울 핀 + 흰 기호): 사례 = 남색 문서 핀, 위험·취약 = 황토 경고 핀.
 *   map_area: 위험·취약지역은 빨간 테두리 + 빗금, 침수흔적은 반투명 파랑.
 */

export const MAP_COLOR = {
  primary: "#256EF4",
  navy: "#063A74",
  text: "#1E2124",
  sub: "#464C53",
  mute: "#6D7882",
  gray60: "#58616A",
  gray40: "#8A949E",
  ochre: "#9E6A00",
  ochreDk: "#8A5C00",
  info: "#0B78CB",
  danger: "#DE3412",
  purple: "#6F4BD8",
  teal: "#0F9D8A",
  river: "#0A7FA3",
} as const;

/** 핀 머리 안의 흰 기호 */
export type Glyph = "doc" | "warn" | "drop" | "wave" | "dot" | "square" | "flag";

export interface LegendEntry {
  id: string;
  /** 범례 이름 */
  label: string;
  /** 이 항목에 들어가는 T3Q entity_type */
  types: readonly string[];
  /** 핀 머리 색 */
  pin: string;
  /** 선 · 면 테두리 색 */
  stroke: string;
  /** 면 채움(반투명) */
  fill: string;
  glyph: Glyph;
  /** 면을 빗금으로 채움 (Figma map_area — 위험·취약지역) */
  hatch?: boolean;
}

const C = MAP_COLOR;

/** 범례 — 순서가 곧 범례 표시 순서. 마지막 `other` 는 정의에 없는 유형을 받는다. */
export const LEGEND: readonly LegendEntry[] = [
  { id: "event", label: "유사재난 사례", types: ["EVENT"], pin: C.navy, stroke: C.navy, fill: "rgba(6,58,116,0.16)", glyph: "doc" },
  { id: "riskArea", label: "위험·취약지역", types: ["RISK_AREA"], pin: C.ochre, stroke: C.ochreDk, fill: "rgba(158,106,0,0.12)", glyph: "warn", hatch: true }, // 빨강 미사용(사용자 지시) — 황토 + 빗금
  { id: "facility", label: "잠재 위험요소·취약시설", types: ["FACILITY", "RISK_FACTOR"], pin: C.ochre, stroke: C.ochreDk, fill: "rgba(158,106,0,0.16)", glyph: "warn" },
  { id: "floodTrace", label: "침수흔적", types: ["FLOOD_TRACE"], pin: C.info, stroke: C.info, fill: "rgba(11,120,203,0.28)", glyph: "drop" },
  { id: "floodMap", label: "침수지도 구역", types: ["FLOOD_MAP"], pin: C.purple, stroke: C.purple, fill: "rgba(111,75,216,0.18)", glyph: "wave" },
  { id: "river", label: "하천", types: ["RIVER"], pin: C.river, stroke: C.river, fill: "rgba(10,127,163,0.22)", glyph: "wave" },
  { id: "plan", label: "계획 대상", types: ["PLAN"], pin: C.teal, stroke: C.teal, fill: "rgba(15,157,138,0.16)", glyph: "flag" },
  { id: "parcel", label: "필지", types: ["PARCEL"], pin: C.gray60, stroke: C.gray60, fill: "rgba(88,97,106,0.14)", glyph: "square" },
  { id: "region", label: "행정구역·지점", types: ["REGION", "POINT"], pin: C.mute, stroke: C.gray60, fill: "rgba(109,120,130,0.12)", glyph: "dot" },
  { id: "other", label: "기타 대상", types: [], pin: C.gray40, stroke: C.gray40, fill: "rgba(138,148,158,0.14)", glyph: "dot" },
];

const OTHER = LEGEND[LEGEND.length - 1];
const BY_TYPE = new Map<string, LegendEntry>(LEGEND.flatMap((e) => e.types.map((t) => [t, e] as const)));

/** entity_type → 범례 항목 (모르는 유형은 `other`) */
export function legendOf(entityType: string | null | undefined): LegendEntry {
  return (entityType && BY_TYPE.get(entityType)) || OTHER;
}

/** T3Q entity_type 한글 (툴팁용). 모르는 코드는 원래 값을 그대로 보인다. */
export const ENTITY_TYPE_KO: Readonly<Record<string, string>> = {
  EVENT: "재난사건",
  RISK_AREA: "위험·취약지역",
  FACILITY: "취약시설",
  RISK_FACTOR: "잠재 위험요소",
  FLOOD_TRACE: "침수흔적",
  FLOOD_MAP: "침수지도 구역",
  RIVER: "하천",
  REGION: "행정구역",
  POINT: "지점",
  PARCEL: "필지",
  PLAN: "계획",
};
export function entityTypeKo(t: string | null | undefined): string {
  if (!t) return "유형 미제공";
  return ENTITY_TYPE_KO[t] ?? t;
}

/** EXT-01 properties.precision 한글 (설명서 6.2) */
export const PRECISION_KO: Readonly<Record<string, string>> = {
  exact: "원천 도형",
  bbox: "범위(사각형)",
  bbox_unchecked: "범위(사각형·미검증)", // 개발 서버 실측 값 — 설명서에는 없음
  centroid_only: "중심점",
  building_center: "건축물 중심",
  dong_center: "동 중심(근사)",
  emd_center: "읍면동 중심(근사)",
  sigungu_center: "시군구 중심(근사)",
};

/** 근사 정도 — 0 원천 위치 · 1 동/읍면동 중심 · 2 시군구 중심. building_center 는 근사로 보지 않는다. */
export function approxLevel(p: string | null | undefined): 0 | 1 | 2 {
  if (!p || !p.endsWith("_center") || p === "building_center") return 0;
  return p === "sigungu_center" ? 2 : 1;
}
export const isApproxPrecision = (p: string | null | undefined) => approxLevel(p) > 0;
/** 범위 사각형(원천 도형 아님) */
export const isRangePrecision = (p: string | null | undefined) => !!p && p.startsWith("bbox");

export function precisionKo(p: string | null | undefined): string | null {
  if (!p) return null;
  return PRECISION_KO[p] ?? (isRangePrecision(p) ? "범위(사각형)" : approxLevel(p) ? "행정구역 중심(근사)" : `정밀도 ${p}`);
}

/** "#RRGGBB" → rgba() */
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ─── 핀 그림 (SVG) ───────────────────────────────────────────────────────
 * viewBox 32×42 · 머리 원 중심 (16,15) 반지름 13 · 끝점 (16,40).
 * 실제 그림 크기는 2배(64×84)로 잡아 고해상도 화면에서도 또렷하게 한다.
 */
export const PIN = {
  /** SVG 고유 크기(px) — Icon scale 계산용 */
  srcW: 64,
  srcH: 84,
  /** 끝점 위치(세로 비율) — Icon anchor */
  tipY: 40 / 42,
  /** 끝점에서 머리 중심까지 높이 = 폭 × headK */
  headK: 25 / 32,
  /** 끝점에서 핀 꼭대기까지 높이 = 폭 × topK */
  topK: 40 / 32,
} as const;

const PIN_PATH = "M16 40C16 40 3 26.5 3 15A13 13 0 1 1 29 15C29 26.5 16 40 16 40Z";

function glyphSvg(g: Glyph, c: string): string {
  switch (g) {
    case "doc":
      return `<path d="M-4.5-6.5h6l3.5 3.5v9.5h-9.5z" fill="#fff"/><path d="M1.5-6.5v3.5h3.5" fill="none" stroke="${c}" stroke-width="1.1"/><path d="M-2.5 0h5M-2.5 3h5" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>`;
    case "warn":
      return `<path d="M0-7.2L7.6 6H-7.6Z" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M0-2.6v4.2" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/><circle cy="3.9" r="1.1" fill="${c}"/>`;
    case "drop":
      return `<path d="M0-7.5C0-7.5-5.6-1-5.6 2.4a5.6 5.6 0 0 0 11.2 0C5.6-1 0-7.5 0-7.5z" fill="#fff"/>`;
    case "wave":
      return `<path d="M-6.5-2.5c1.5-1.8 2.9-1.8 4.3 0s2.8 1.8 4.3 0 2.9-1.8 4.4 0M-6.5 2.8c1.5-1.8 2.9-1.8 4.3 0s2.8 1.8 4.3 0 2.9-1.8 4.4 0" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>`;
    case "square":
      return `<rect x="-4.6" y="-4.6" width="9.2" height="9.2" rx="1.2" fill="#fff"/>`;
    case "flag":
      return `<path d="M-4-6.5v13" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M-4-6.5h8.5l-2.2 3 2.2 3H-4z" fill="#fff"/>`;
    default:
      return `<circle r="4.2" fill="#fff"/>`;
  }
}

/** 물방울 핀 SVG 문자열 (흰 테두리 + 흰 기호) */
export function pinSvg(e: Pick<LegendEntry, "pin" | "glyph">): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN.srcW}" height="${PIN.srcH}" viewBox="0 0 32 42">` +
    `<path d="${PIN_PATH}" fill="${e.pin}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
    `<g transform="translate(16 15)">${glyphSvg(e.glyph, e.pin)}</g></svg>`
  );
}

const uriCache = new Map<string, string>();
/** 핀 그림 data URI — OpenLayers Icon · 범례 CSS background 공용 */
export function pinDataUri(e: Pick<LegendEntry, "pin" | "glyph">): string {
  const k = `${e.pin}|${e.glyph}`;
  let u = uriCache.get(k);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(e))}`;
    uriCache.set(k, u);
  }
  return u;
}
