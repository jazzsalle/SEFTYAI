import type { GeoEnvelope, T3qRef } from "@/lib/jobTypes";

/**
 * 답변 그림용 정적 지도 계산 — 순수 함수(LLM 없음). 공간정보(EXT-01 geometry, EPSG:4326)를 받은 그대로 평면에 놓는다.
 * 투영은 위도 보정만 한 등거리(가로 = 경도 × cos(중심 위도)) — 수 km 범위의 그림용. 좌표를 옮기거나 더하지 않는다.
 */
export type Coord = [number, number];
export interface MapShape {
  ref: string | null;
  kind: "area" | "line" | "point";
  /** area·line = 경로들(area 는 바깥 고리만), point = 경로 하나에 점 하나 */
  paths: Coord[][];
  precision?: string | null;
}

type Feature = NonNullable<NonNullable<GeoEnvelope["result"]>["features"]>[number];

const isCoord = (c: unknown): c is Coord => Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number";
const ring = (r: unknown): Coord[] => (Array.isArray(r) ? r.filter(isCoord) : []);

/** geometry → 그림 도형. 모르는 모양은 건너뛴다 */
export function shapeOf(ref: string | null, geometry: { type: string; coordinates: unknown } | null | undefined, precision?: string | null): MapShape | null {
  if (!geometry) return null;
  const c = geometry.coordinates;
  switch (geometry.type) {
    case "Point": return isCoord(c) ? { ref, kind: "point", paths: [[c]], precision } : null;
    case "MultiPoint": return { ref, kind: "point", paths: ring(c).map((p) => [p]), precision };
    case "LineString": return { ref, kind: "line", paths: [ring(c)], precision };
    case "MultiLineString": return { ref, kind: "line", paths: Array.isArray(c) ? c.map(ring) : [], precision };
    case "Polygon": return { ref, kind: "area", paths: Array.isArray(c) && c.length ? [ring(c[0])] : [], precision };
    case "MultiPolygon": return { ref, kind: "area", paths: Array.isArray(c) ? c.map((p) => (Array.isArray(p) && p.length ? ring(p[0]) : [])) : [], precision };
    default: return null;
  }
}

export function shapesOf(geo: GeoEnvelope | null | undefined): MapShape[] {
  const feats: Feature[] = geo?.result?.features ?? [];
  return feats.map((f) => shapeOf(f.properties?.ref ?? null, f.geometry, f.properties?.precision)).filter((s): s is MapShape => !!s && s.paths.some((p) => p.length > 0));
}

export interface Box { minLon: number; maxLon: number; minLat: number; maxLat: number }
/** 도형 전체 범위 + 여백(비율). 점 하나뿐이면 1km 남짓 상자 */
export function fitBox(shapes: MapShape[], pad = 0.08): Box | null {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const s of shapes) for (const p of s.paths) for (const [x, y] of p) { minLon = Math.min(minLon, x); maxLon = Math.max(maxLon, x); minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y); }
  if (!Number.isFinite(minLon)) return null;
  const minSpan = 0.012;
  if (maxLon - minLon < minSpan) { const m = (minLon + maxLon) / 2; minLon = m - minSpan / 2; maxLon = m + minSpan / 2; }
  if (maxLat - minLat < minSpan) { const m = (minLat + maxLat) / 2; minLat = m - minSpan / 2; maxLat = m + minSpan / 2; }
  const dx = (maxLon - minLon) * pad, dy = (maxLat - minLat) * pad;
  return { minLon: minLon - dx, maxLon: maxLon + dx, minLat: minLat - dy, maxLat: maxLat + dy };
}

export interface Projector { W: number; H: number; px: (c: Coord) => [number, number]; kmPx: number }
/** 상자를 너비 W 의 그림에 — 높이는 위도 보정 비율로. kmPx = 1km 가 몇 px 인가(축척 막대) */
export function projector(box: Box, W = 320, maxH = 420): Projector {
  const midLat = ((box.minLat + box.maxLat) / 2) * (Math.PI / 180);
  const lonSpan = box.maxLon - box.minLon, latSpan = box.maxLat - box.minLat;
  let w = W;
  let H = (W * latSpan) / (lonSpan * Math.cos(midLat));
  if (H > maxH) { w = (W * maxH) / H; H = maxH; }
  const px = (c: Coord): [number, number] => [((c[0] - box.minLon) / lonSpan) * w, ((box.maxLat - c[1]) / latSpan) * H];
  const kmPx = w / lonSpan / (111.32 * Math.cos(midLat));
  return { W: w, H, px, kmPx };
}

export const pathD = (pts: Coord[], px: Projector["px"], close: boolean) =>
  pts.map((c, i) => { const [x, y] = px(c); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ") + (close ? " Z" : "");

/** 답 글에 처음 나온 순서(#ref:rN) → 그 뒤 나머지는 refs 순. 번호를 매기는 순서 */
export function refOrder(markdown: string | null | undefined, refs: Pick<T3qRef, "ref">[]): string[] {
  const seen: string[] = [];
  if (markdown) for (const m of markdown.matchAll(/#ref:(r\d+)/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  for (const r of refs) if (!seen.includes(r.ref)) seen.push(r.ref);
  return seen;
}

export interface Marker { c: Coord; refs: string[] }
/** 같은 좌표(동 중심 등)에 모이는 점은 표지 하나로 — 번호 순서는 유지 */
export function mergePoints(points: { ref: string; c: Coord }[]): Marker[] {
  const m = new Map<string, Marker>();
  for (const p of points) {
    const k = `${p.c[0]},${p.c[1]}`;
    const e = m.get(k);
    if (e) e.refs.push(p.ref); else m.set(k, { c: p.c, refs: [p.ref] });
  }
  return [...m.values()];
}

/** 선·면의 글자 자리 — 경로 꼭짓점 평균(받은 좌표의 평균, 그리기 위치용) */
export function anchorOf(s: MapShape): Coord | null {
  const pts = s.paths.flat();
  if (!pts.length) return null;
  if (s.kind === "point") return pts[0];
  return [pts.reduce((a, c) => a + c[0], 0) / pts.length, pts.reduce((a, c) => a + c[1], 0) / pts.length];
}
