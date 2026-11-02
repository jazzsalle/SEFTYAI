/**
 * 지도 표식 정의 — 범례(LEGEND) · 핀 그림 · T3Q 코드의 한글 이름.
 *
 * - DOM·OpenLayers 를 쓰지 않는다 → 범례 컴포넌트(서버 렌더 가능)와 MapView 가 함께 쓴다.
 * - 색: 남색 중심 · 외수(하천·침수흔적) 파랑 · 내수(침수지도 구역) 보라 · 계획 청록 · 위험·취약 초록(사용자 지시 2026-11-02).
 *   빨강 계열은 쓰지 않는다.
 * - 표식 모양: 물방울 핀(장소) · 말풍선 배지(사례) + 흰 기호. 기호는 받은 entity_type 과
 *   받은 display_name 에 들어 있는 낱말(지하차도·펌프·수문 …)로만 고른다. 모르면 유형 기본 기호.
 */

export const MAP_COLOR = {
  primary: "#256EF4",
  navy: "#063A74",
  navyDk: "#032A55",
  text: "#1E2124",
  sub: "#464C53",
  mute: "#6D7882",
  gray60: "#58616A",
  gray40: "#8A949E",
  ochre: "#9E6A00",
  ochreDk: "#8A5C00",
  amber: "#C98A00",
  // 위험·취약지역·잠재 위험요소 핀 — 지도 위에서 잘 보이게 초록(사용자 지시 2026-11-02)
  hazard: "#12A150",
  hazardDk: "#0B7A3B",
  // 근사 위치 점선 원 — 하늘색(사용자 지시 2026-11-02)
  ring: "#00B7F1",
  info: "#0B78CB",
  danger: "#DE3412",
  purple: "#6F4BD8",
  teal: "#0F9D8A",
  river: "#0A7FA3",
} as const;

/** 핀 머리 안의 흰 기호 */
export type Glyph =
  | "doc" | "warn" | "drop" | "wave" | "dot" | "square" | "flag"
  | "floodzone" | "underpass" | "pump" | "gate" | "slope" | "camp" | "house" | "building" | "basin";

/** 핀 바깥 모양 — 물방울(장소) · 말풍선 배지(사례 문서) */
export type PinShape = "drop" | "badge";

/** 면 채움 무늬 */
export type AreaPattern = "hatch" | "dots" | "soft";

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
  shape?: PinShape;
  /** 면 채움 무늬 (없으면 soft) */
  pattern?: AreaPattern;
  /** 면을 빗금으로 채움 (Figma map_area — 위험·취약지역). pattern 이 우선 */
  hatch?: boolean;
}

const C = MAP_COLOR;

/** 범례 — 순서가 곧 범례 표시 순서. 마지막 `other` 는 정의에 없는 유형을 받는다. */
export const LEGEND: readonly LegendEntry[] = [
  { id: "event", label: "유사재난 사례", types: ["EVENT"], pin: C.navy, stroke: C.navy, fill: "rgba(6,58,116,0.14)", glyph: "doc", shape: "badge" },
  { id: "riskArea", label: "위험·취약지역", types: ["RISK_AREA"], pin: C.hazard, stroke: C.hazardDk, fill: "rgba(18,161,80,0.12)", glyph: "warn", pattern: "hatch", hatch: true },
  { id: "facility", label: "잠재 위험요소·취약시설", types: ["FACILITY", "RISK_FACTOR"], pin: C.hazard, stroke: C.hazardDk, fill: "rgba(18,161,80,0.14)", glyph: "warn" },
  { id: "floodTrace", label: "침수흔적", types: ["FLOOD_TRACE"], pin: C.info, stroke: C.info, fill: "rgba(11,120,203,0.24)", glyph: "drop" },
  { id: "floodMap", label: "침수지도 구역", types: ["FLOOD_MAP"], pin: C.purple, stroke: C.purple, fill: "rgba(111,75,216,0.14)", glyph: "floodzone", pattern: "dots" },
  { id: "river", label: "하천", types: ["RIVER"], pin: C.river, stroke: C.river, fill: "rgba(10,127,163,0.2)", glyph: "wave" },
  { id: "plan", label: "계획 대상", types: ["PLAN"], pin: C.teal, stroke: C.teal, fill: "rgba(15,157,138,0.14)", glyph: "flag" },
  { id: "parcel", label: "필지", types: ["PARCEL"], pin: C.gray60, stroke: C.gray60, fill: "rgba(88,97,106,0.12)", glyph: "square" },
  { id: "region", label: "행정구역·지점", types: ["REGION", "POINT"], pin: C.mute, stroke: C.gray60, fill: "rgba(109,120,130,0.1)", glyph: "dot" },
  { id: "other", label: "기타 대상", types: [], pin: C.gray40, stroke: C.gray40, fill: "rgba(138,148,158,0.12)", glyph: "dot" },
];

const OTHER = LEGEND[LEGEND.length - 1];
const BY_TYPE = new Map<string, LegendEntry>(LEGEND.flatMap((e) => e.types.map((t) => [t, e] as const)));

/** entity_type → 범례 항목 (모르는 유형은 `other`) */
export function legendOf(entityType: string | null | undefined): LegendEntry {
  return (entityType && BY_TYPE.get(entityType)) || OTHER;
}

export const legendById = (id: string): LegendEntry | undefined => LEGEND.find((e) => e.id === id);

/* ─── 세부 종류 — 받은 이름에 든 낱말로만 고른다 ─────────────────────────── */

export interface SubKind {
  id: string;
  /** 범례·말풍선에 보이는 이름 */
  label: string;
  glyph: Glyph;
  /** display_name 에 이 낱말이 있으면 */
  re: RegExp;
}

/** 순서대로 먼저 맞는 것 하나 */
export const SUB_KINDS: readonly SubKind[] = [
  { id: "underpass", label: "지하차도", glyph: "underpass", re: /지하보?차도|지하도로|지하보도|언더패스/ },
  { id: "pump", label: "펌프장", glyph: "pump", re: /펌프|배수장/ },
  { id: "gate", label: "수문", glyph: "gate", re: /수문|배수문|갑문|통문/ },
  { id: "slope", label: "급경사지", glyph: "slope", re: /급경사|사면|산사태|절개지|옹벽/ },
  { id: "camp", label: "캠핑장", glyph: "camp", re: /캠핑|야영/ },
  { id: "basin", label: "저수지·저류지", glyph: "basin", re: /저수지|저류지|유수지|댐/ },
  { id: "river", label: "하천", glyph: "wave", re: /하천|천변|강변|계곡|하구/ },
  { id: "house", label: "주택", glyph: "house", re: /주택|반지하|아파트|빌라/ },
  { id: "building", label: "건축물·시설", glyph: "building", re: /학교|병원|요양|복지|어린이집|경로당|센터/ },
];

/** 세부 종류를 이름으로 고르는 유형 (사례·행정구역·필지·침수 도면류는 유형 기호를 그대로 쓴다) */
const SUB_TYPES = new Set(["RISK_AREA", "RISK_FACTOR", "FACILITY", "PLAN", "POINT"]);
/** 세부 종류가 없을 때 유형별 기본 기호 (범례 항목 기호와 다를 때만) */
const TYPE_GLYPH: Readonly<Record<string, Glyph>> = { FACILITY: "building" };

export function subKindOf(entityType: string | null | undefined, name: string | null | undefined): SubKind | null {
  if (!name) return null;
  const known = !!entityType && BY_TYPE.has(entityType);
  if (known && !SUB_TYPES.has(entityType!)) return null;
  return SUB_KINDS.find((s) => s.re.test(name)) ?? null;
}

/** 표식 하나의 생김새 — 범례 항목 + 세부 종류 + 기호 */
export interface Look {
  entry: LegendEntry;
  sub: SubKind | null;
  glyph: Glyph;
}
export function lookOf(entityType: string | null | undefined, name: string | null | undefined): Look {
  const entry = legendOf(entityType);
  const sub = subKindOf(entityType, name);
  return { entry, sub, glyph: sub?.glyph ?? (entityType ? TYPE_GLYPH[entityType] : undefined) ?? entry.glyph };
}

/** 범례 거르기 열쇠 — 항목 전체 `riskArea` · 세부 종류 `facility/underpass` · 세부 종류 없음 `facility/_` */
export const filterKey = (entryId: string, subId?: string | null) => (subId === undefined ? entryId : `${entryId}/${subId ?? "_"}`);
export function matchFilter(filter: string | null | undefined, look: Look): boolean {
  if (!filter) return true;
  const [eid, sid] = filter.split("/");
  if (eid !== look.entry.id) return false;
  if (sid === undefined) return true;
  return sid === "_" ? !look.sub : look.sub?.id === sid;
}

/* ─── T3Q 코드 한글 ──────────────────────────────────────────────────────── */

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

/** 흰색(t>0) 또는 검정(t<0) 쪽으로 섞은 색 */
export function shade(hex: string, t: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.slice(0, 6), 16);
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const ch = (v: number) => Math.round(v + (to - v) * k).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/* ─── 핀 그림 (SVG) ───────────────────────────────────────────────────────
 * viewBox 36×48 · 머리 중심 (18,17) 반지름 14 · 끝점 (18,43) · 그 아래 바닥 그림자.
 * 실제 그림 크기는 2배(72×96)로 잡아 고해상도 화면에서도 또렷하게 한다.
 */
export const PIN = {
  /** SVG 고유 크기(px) — Icon scale 계산용 */
  srcW: 72,
  srcH: 96,
  /** 끝점 위치(세로 비율) — Icon anchor */
  tipY: 43 / 48,
  /** 끝점에서 머리 중심까지 높이 = 폭 × headK */
  headK: 26 / 36,
  /** 끝점에서 핀 꼭대기까지 높이 = 폭 × topK */
  topK: 41 / 36,
} as const;

const DROP_PATH = "M18 43C18 43 4 28.6 4 17A14 14 0 1 1 32 17C32 28.6 18 43 18 43Z";
const BADGE_PATH = "M13 3h10a9 9 0 0 1 9 9v10a9 9 0 0 1-9 9h-1.6L18 43l-3.4-12H13a9 9 0 0 1-9-9V12a9 9 0 0 1 9-9Z";

/** 흰 기호 (32×32 좌표 · 선 기호는 감싸는 g 의 흰 선을 따른다). c = 바탕색(기호 안 구멍) */
export function glyphMarkup(g: Glyph, c: string): string {
  const A = `fill="#fff" fill-opacity=".4" stroke="none"`;
  const W = `fill="#fff" stroke="none"`;
  const wave = (y: number) => `<path d="M3 ${y}c3-3 5 3 8 0s5 3 8 0 5 3 10 0"/>`;
  switch (g) {
    case "doc":
      return `<path d="M9 4h9.5L24 9.5V28H9z" ${W}/><path d="M18.5 4v5.5H24" stroke="${c}" stroke-width="1.8"/><path d="M12.5 16h8M12.5 21.5h8" stroke="${c}" stroke-width="2.6"/>`;
    case "warn":
      return `<path d="M16 4.5L3 27h26z" fill="#fff" stroke-width="2.6"/><path d="M16 12.5v6.5" stroke="${c}" stroke-width="3.2"/><circle cx="16" cy="23.2" r="1.9" fill="${c}" stroke="none"/>`;
    case "drop":
      return `<path d="M16 3S7 13.5 7 19.5a9 9 0 0 0 18 0C25 13.5 16 3 16 3z" ${W}/><path d="M11.8 20.5a4.4 4.4 0 0 0 4 4" stroke="${c}" stroke-width="2.2"/>`;
    case "wave":
      return wave(9) + wave(16) + wave(23);
    case "floodzone":
      return `<path d="M5 14L16 5l11 9"/><path d="M8.5 12v5.5M23.5 12v5.5"/><path d="M3 21.5c3-2.5 5 2.5 7 0s5 2.5 7 0 5 2.5 7 0 4 2.5 5 0"/><path d="M3 27.5c3-2.5 5 2.5 7 0s5 2.5 7 0 5 2.5 7 0 4 2.5 5 0"/>`;
    case "square":
      return `<rect x="5" y="5" width="22" height="22" rx="2.5" ${A}/><rect x="5" y="5" width="22" height="22" rx="2.5"/><path d="M5 16h22M16 5v22" stroke-width="2.4"/>`;
    case "flag":
      return `<path d="M9 29V4"/><path d="M9 5h15l-3.5 5 3.5 5H9z" ${W}/>`;
    case "underpass":
      return `<path d="M3 7h26"/><path d="M5 7v7c0 5.5 3.5 10.5 11 10.5S27 19.5 27 14V7"/><path d="M10.5 20v-3.5l2-2h7l2 2V20z" ${W}/>`;
    case "pump":
      return `<circle cx="12" cy="17" r="7.5"/><circle cx="12" cy="17" r="2.8" ${W}/><path d="M12 9.5V5.5h8.5"/><path d="M24.5 8.5c-1.6 2.2-2.2 3.3-2.2 4.4a2.2 2.2 0 0 0 4.4 0c0-1.1-.6-2.2-2.2-4.4z" ${W}/><path d="M7 28h10"/>`;
    case "gate":
      return `<path d="M5 28V5M27 28V5"/><rect x="5" y="9" width="22" height="10" rx="1" ${A}/><path d="M5 9h22v10H5z"/><path d="M10 9v10M16 9v10M22 9v10" stroke-width="2.2"/><path d="M5 25c3-2.2 5 2.2 7.3 0s5 2.2 7.3 0 4.6 2.2 7.4 0"/>`;
    case "slope":
      return `<path d="M3 27L19 6l10 21z" ${A}/><path d="M3 27L19 6l10 21z"/><circle cx="22.5" cy="19.5" r="2" ${W}/><circle cx="16.5" cy="23" r="1.6" ${W}/>`;
    case "camp":
      return `<path d="M3 26L16 6l13 20z" ${A}/><path d="M3 26L16 6l13 20z"/><path d="M16 14l-4.5 12h9z" ${W}/><path d="M2 26.5h28"/>`;
    case "house":
      return `<path d="M4 15L16 5l12 10"/><path d="M8 12.5V27h16V12.5"/><rect x="13" y="18.5" width="6" height="8.5" ${W}/>`;
    case "building":
      return `<rect x="6" y="5" width="13.5" height="22" rx="1.5" ${A}/><rect x="6" y="5" width="13.5" height="22" rx="1.5"/><path d="M19.5 13H26v14h-6.5"/><path d="M10 10.5h1.5M14 10.5h1.5M10 15.5h1.5M14 15.5h1.5M10 20.5h1.5M14 20.5h1.5" stroke-width="2.6"/><path d="M3 27h26"/>`;
    case "basin":
      return `<path d="M4 7v15a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V7"/><path d="M4 14.5c3-2.6 5 2.6 8 0s5 2.6 8 0 5 2.6 8 0"/><path d="M9.5 21h13" stroke-width="2.4"/>`;
    default:
      return `<circle cx="16" cy="16" r="10.5" stroke-width="2.6"/><circle cx="16" cy="16" r="4.8" ${W}/>`;
  }
}

/** 흰 선 묶음 — 32×32 기호를 핀 머리(지름 28) 안에 맞춘다 */
const glyphGroup = (g: Glyph, c: string, tf: string) =>
  `<g transform="${tf}" fill="none" stroke="#fff" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">${glyphMarkup(g, c)}</g>`;

export interface PinLook {
  pin: string;
  glyph: Glyph;
  shape?: PinShape;
}

/** 핀 SVG 문자열 — 위쪽이 밝은 색 머리 · 흰 테두리 · 그림자 · 흰 기호 */
export function pinSvg(e: PinLook): string {
  const top = shade(e.pin, 0.22);
  const bot = shade(e.pin, -0.12);
  const path = e.shape === "badge" ? BADGE_PATH : DROP_PATH;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN.srcW}" height="${PIN.srcH}" viewBox="0 0 36 48">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>` +
    `<filter id="s" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="1.1" stdDeviation="1.15" flood-color="#0B1E3A" flood-opacity="0.38"/></filter></defs>` +
    `<ellipse cx="18" cy="44.8" rx="5.4" ry="1.8" fill="#0B1E3A" opacity="0.22"/>` +
    `<path d="${path}" fill="url(#g)" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" filter="url(#s)"/>` +
    (e.shape === "badge"
      ? `<rect x="7" y="6" width="22" height="22" rx="6.5" fill="none" stroke="#fff" stroke-opacity=".28"/>`
      : `<circle cx="18" cy="17" r="11" fill="none" stroke="#fff" stroke-opacity=".28"/>`) +
    glyphGroup(e.glyph, bot, "translate(18 17) scale(.5) translate(-16 -16)") +
    `</svg>`
  );
}

const svgUri = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const uriCache = new Map<string, string>();

/** 핀 그림 data URI — OpenLayers Icon · 범례 CSS background 공용 */
export function pinDataUri(e: PinLook): string {
  const k = `p|${e.pin}|${e.glyph}|${e.shape ?? "drop"}`;
  let u = uriCache.get(k);
  if (!u) {
    u = svgUri(pinSvg(e));
    uriCache.set(k, u);
  }
  return u;
}

/** 흰 기호만 (바탕 투명) — 색 원·말풍선 머리 위에 얹는다. c = 바탕색 */
export function glyphDataUri(g: Glyph, c: string): string {
  const k = `g|${g}|${c}`;
  let u = uriCache.get(k);
  if (!u) {
    u = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">${glyphGroup(g, c, "")}</svg>`);
    uriCache.set(k, u);
  }
  return u;
}
