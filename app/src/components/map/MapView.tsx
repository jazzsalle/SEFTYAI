"use client";
/**
 * 지도 — VWorld 배경지도 + VWorld 행정경계(WMS) + T3Q 공간정보만 그린다.
 *
 * - 그리는 도형은 T3Q `POST /spatial-objects/geometry`(EXT-01) 응답 geometry 그대로(EPSG:4326 → 3857 투영만).
 *   좌표 추정·ID 파싱은 하지 않는다. 선·면이 화면에서 너무 작으면 그 도형 위의 대표점(선 중간·면 안쪽 점)에
 *   핀을 함께 그려 보이게 한다 — 받은 도형에서 구한 점이다.
 * - 이름은 T3Q display_name 그대로. 위치 정밀도(precision)가 행정구역 중심이면 점선 원으로 «근사 위치» 표시.
 * - 행정경계는 VWorld WMS. 실패하면 경계 없이 배경지도만 보인다.
 * - 배경지도 VWorld WMTS 가 연속 실패하면 OSM 으로 바꾸고 onTileStatus("osm").
 * - 설명서 7.5-2: activeJobId 의 대상은 진하게, 다른 답변의 대상은 흐리게.
 */
import "./map.css";
import { useEffect, useMemo, useRef, useState } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import Overlay from "ol/Overlay";
import GeoJSON from "ol/format/GeoJSON";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import TileWMS from "ol/source/TileWMS";
import Point from "ol/geom/Point";
import MultiPoint from "ol/geom/MultiPoint";
import LineString from "ol/geom/LineString";
import MultiLineString from "ol/geom/MultiLineString";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import GeometryCollection from "ol/geom/GeometryCollection";
import type Geometry from "ol/geom/Geometry";
import { fromLonLat, get as getProjection } from "ol/proj";
import { createXYZ } from "ol/tilegrid";
import { createEmpty, extend as extendExtent, getCenter, getHeight, getWidth, isEmpty as isEmptyExtent } from "ol/extent";
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import { Attribution, ScaleLine, defaults as defaultControls } from "ol/control";
import { defaults as defaultInteractions } from "ol/interaction";
import type { RegionId } from "@/lib/contract/agent";
import { REGIONS } from "@/lib/config";
import {
  MAP_COLOR, PIN, approxLevel, entityTypeKo, isRangePrecision, legendOf, pinDataUri, precisionKo, rgba,
  type LegendEntry,
} from "./mapStyle";

const VW_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? "";

/**
 * VWorld 2D 데이터 API — WMS 행정경계 (GetCapabilities 2026-10-28 확인)
 * - 레이어: lt_c_adsido(광역시도) · lt_c_adsigg(시군구) · lt_c_ademd(읍면동, 큰 축척에서만 그려짐). 스타일 이름 = 레이어 이름.
 * - CRS EPSG:3857 이면 BBOX 는 xmin,ymin,xmax,ymax (OpenLayers 가 맞춰 보냄). 한 번에 최대 4개 레이어.
 * - 응답에 CORS 헤더가 없다 → crossOrigin 을 주지 않는다(주면 이미지가 막힘).
 * - 인증은 브라우저가 보내는 Referer(등록 도메인)로 된다. DOMAIN 파라미터를 붙이면 응답이 INCORRECT_KEY 와
 *   섞여 나와(같은 요청 반복 시험) 넣지 않는다.
 */
const VW_WMS_URL = "https://api.vworld.kr/req/wms";
const VW_WMS_LAYERS = "lt_c_adsido,lt_c_adsigg,lt_c_ademd";

export type Basemap = "Base" | "Satellite" | "gray";

/** 지도에 그릴 T3Q 대상 하나 = refs[] 한 건 + EXT-01 도형 */
export interface MapFeature {
  key: string; // 화면 고유키 `${jobId}:${ref}`
  ref: string; // T3Q ref (r3)
  jobId: string;
  entityType: string | null;
  displayName: string | null; // T3Q display_name 그대로(가공 금지)
  draw: string | null; // T3Q map.draw
  precision: string | null; // EXT-01 properties.precision
  geometry: { type: string; coordinates: unknown }; // EXT-01 geometry 그대로 (EPSG:4326)
}
export interface MapLayers { boundary: boolean; features: boolean }
export const DEFAULT_LAYERS: MapLayers = { boundary: true, features: true };

interface Props {
  region: RegionId; // 초기 중심: lib/config REGIONS[region].center/zoom
  areaToken?: number; // 바뀌면 region 중심으로 이동
  features: MapFeature[];
  activeJobId?: string | null; // 이 작업의 feature 는 진하게, 나머지는 흐리게(설명서 7.5-2)
  selectedKey?: string | null; // 선택 강조 + 라벨
  focusToken?: number; // 바뀌면 selectedKey(있으면) 또는 activeJob features 범위로 fit
  basemap: Basemap;
  layers: MapLayers;
  onSelect?: (key: string) => void;
  onTileStatus?: (s: "vworld" | "osm") => void;
}

/* ─── 표식 스타일 ─────────────────────────────────────────────────────────── */

type Kind = "point" | "line" | "area";
type St = "dim" | "base" | "hover" | "sel";

interface Rec {
  mf: MapFeature;
  kind: Kind;
  entry: LegendEntry;
  /** 대표점 — 점이면 그 점, 선은 길이 중간, 면은 안쪽 점 (라벨·축소 핀 자리) */
  anchor: Point;
  /** 도형 범위의 긴 변 (지도 단위) */
  size: number;
  approx: 0 | 1 | 2;
  /** bbox 계열 — 범위 사각형 */
  range: boolean;
  /** GeometryCollection 을 나눴을 때 첫 조각만 라벨·축소 핀 */
  primary: boolean;
  label?: Style;
}

const FONT = `Pretendard, "Pretendard Variable", "Noto Sans KR", "Malgun Gothic", sans-serif`;
/** 핀 폭(px) — 기본 · 호버 · 선택(커진 핀) · 흐림 */
const PIN_W: Record<St, number> = { dim: 21, base: 26, hover: 26, sel: 34 };
const Z: Record<St, number> = { dim: 10, base: 20, hover: 30, sel: 40 };
/** 선·면이 이 픽셀보다 작게 보이면 대표점에 핀을 함께 그림 */
const SMALL_PX = 22;
/** 이 해상도(m/px)보다 확대됐을 때만 상시 이름표 (≈ 줌 12.6) */
const LABEL_MAX_RES = 25;
/** 맞출 대상 도형이 아직 없을 때 기다리는 시간 */
const FOCUS_WAIT_MS = 10_000;

const recs = new WeakMap<FeatureLike, Rec>();
const anchorOf = (f: FeatureLike) => recs.get(f)?.anchor;
const styleCache = new Map<string, Style[]>();
const hatchCache = new Map<string, CanvasPattern | string>();
const geoFormat = new GeoJSON();

/** 빗금 채움 (Figma map_area — 위험·취약지역) */
function hatch(color: string): CanvasPattern | string {
  const hit = hatchCache.get(color);
  if (hit) return hit;
  let pat: CanvasPattern | null = null;
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = rgba(color, 0.08);
    g.fillRect(0, 0, 8, 8);
    g.strokeStyle = rgba(color, 0.6);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-2, 10); g.lineTo(10, -2);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    pat = g.createPattern(c, "repeat");
  }
  const out = pat ?? rgba(color, 0.14);
  hatchCache.set(color, out);
  return out;
}

/** 핀 (+ 근사 위치 점선 원 · 호버/선택 후광). onAnchor = 선·면의 대표점에 그림 */
function pinStyles(e: LegendEntry, st: St, approx: 0 | 1 | 2, onAnchor: boolean): Style[] {
  const k = `p|${e.id}|${st}|${approx}|${onAnchor ? 1 : 0}`;
  const hit = styleCache.get(k);
  if (hit) return hit;
  const w = PIN_W[st];
  const z = Z[st];
  const geometry = onAnchor ? anchorOf : undefined;
  const out: Style[] = [];
  if (approx) {
    out.push(new Style({
      geometry,
      zIndex: z,
      image: new CircleStyle({
        radius: approx === 2 ? 26 : 18,
        fill: new Fill({ color: st === "dim" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.4)" }),
        stroke: new Stroke({ color: st === "dim" ? rgba(MAP_COLOR.sub, 0.4) : MAP_COLOR.sub, width: 1.5, lineDash: [4, 3] }),
      }),
    }));
  }
  if (st === "hover" || st === "sel") {
    out.push(new Style({
      geometry,
      zIndex: z + 1,
      image: new CircleStyle({
        radius: st === "sel" ? 21 : 16,
        displacement: [0, w * PIN.headK],
        fill: new Fill({ color: rgba(e.pin, st === "sel" ? 0.3 : 0.16) }),
        stroke: st === "sel" ? new Stroke({ color: rgba(e.pin, 0.55), width: 1.5 }) : undefined,
      }),
    }));
  }
  out.push(new Style({
    geometry,
    zIndex: z + 2,
    image: new Icon({ src: pinDataUri(e), anchor: [0.5, PIN.tipY], scale: w / PIN.srcW, opacity: st === "dim" ? 0.5 : 1 }),
  }));
  styleCache.set(k, out);
  return out;
}

function lineStyles(e: LegendEntry, st: St, range: boolean): Style[] {
  const k = `l|${e.id}|${st}|${range ? 1 : 0}`;
  const hit = styleCache.get(k);
  if (hit) return hit;
  const w = st === "dim" ? 2.5 : st === "base" ? 3.5 : st === "hover" ? 4.5 : 5;
  const z = Z[st];
  const cap = { lineCap: "round", lineJoin: "round" } as const;
  const out: Style[] = [];
  if (st === "sel") out.push(new Style({ zIndex: z, stroke: new Stroke({ color: rgba(MAP_COLOR.primary, 0.3), width: w + 10, ...cap }) }));
  out.push(new Style({ zIndex: z + 1, stroke: new Stroke({ color: st === "dim" ? "rgba(255,255,255,0.55)" : "#fff", width: w + 3, ...cap }) }));
  out.push(new Style({
    zIndex: z + 2,
    stroke: new Stroke({ color: st === "dim" ? rgba(e.stroke, 0.5) : e.stroke, width: w, lineDash: range ? [8, 5] : undefined, ...cap }),
  }));
  styleCache.set(k, out);
  return out;
}

function areaStyles(e: LegendEntry, st: St, range: boolean): Style[] {
  const k = `a|${e.id}|${st}|${range ? 1 : 0}`;
  const hit = styleCache.get(k);
  if (hit) return hit;
  const w = st === "dim" ? 1.5 : st === "base" ? 2 : st === "hover" ? 3 : 3.5;
  const z = Z[st];
  const out: Style[] = [];
  if (st === "sel") out.push(new Style({ zIndex: z, stroke: new Stroke({ color: rgba(MAP_COLOR.primary, 0.35), width: w + 7 }) }));
  out.push(new Style({
    zIndex: z + 1,
    fill: new Fill({ color: st === "dim" ? rgba(e.stroke, 0.06) : e.hatch ? hatch(e.stroke) : e.fill }),
    stroke: new Stroke({ color: st === "dim" ? rgba(e.stroke, 0.45) : e.stroke, width: w, lineDash: range ? [8, 5] : undefined }),
  }));
  styleCache.set(k, out);
  return out;
}

/** 상시 이름표 — display_name 그대로, 대표점 아래 */
function labelStyle(r: Rec): Style {
  r.label ??= new Style({
    geometry: anchorOf,
    text: new Text({
      text: r.mf.displayName ?? "",
      font: `600 12px ${FONT}`,
      fill: new Fill({ color: MAP_COLOR.text }),
      stroke: new Stroke({ color: "#fff", width: 3.5 }),
      textBaseline: "top",
      offsetY: 6,
    }),
  });
  return r.label;
}

/* ─── EXT-01 geometry → OpenLayers 피처 ───────────────────────────────────── */

const kindOf = (g: Geometry): Kind | null =>
  g instanceof Point || g instanceof MultiPoint ? "point"
    : g instanceof LineString || g instanceof MultiLineString ? "line"
      : g instanceof Polygon || g instanceof MultiPolygon ? "area"
        : null;

/** 받은 도형 위의 대표점 (추정 위치가 아니라 도형에서 구한 점) */
function anchorPoint(g: Geometry): Point {
  if (g instanceof Point) return g;
  let c: number[] | null = null;
  if (g instanceof MultiPoint) c = g.getPoint(0).getCoordinates();
  else if (g instanceof LineString) c = g.getCoordinateAt(0.5);
  else if (g instanceof MultiLineString) {
    const long = g.getLineStrings().reduce((a, b) => (b.getLength() > a.getLength() ? b : a));
    c = long.getCoordinateAt(0.5);
  } else if (g instanceof Polygon) c = g.getInteriorPoint().getCoordinates();
  else if (g instanceof MultiPolygon) {
    const big = g.getPolygons().reduce((a, b) => (b.getArea() > a.getArea() ? b : a));
    c = big.getInteriorPoint().getCoordinates();
  }
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) c = getCenter(g.getExtent());
  return new Point([c[0], c[1]]);
}

function flatten(g: Geometry, out: Geometry[] = []): Geometry[] {
  if (g instanceof GeometryCollection) g.getGeometries().forEach((x) => flatten(x, out));
  else out.push(g);
  return out;
}

function toOlFeatures(mf: MapFeature): Feature[] {
  let g: Geometry;
  try {
    g = geoFormat.readGeometry(mf.geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
  } catch {
    return []; // 읽을 수 없는 도형은 그리지 않는다
  }
  const entry = legendOf(mf.entityType);
  const approx = approxLevel(mf.precision);
  const range = isRangePrecision(mf.precision);
  const out: Feature[] = [];
  for (const part of flatten(g)) {
    const kind = kindOf(part);
    if (!kind) continue;
    const ext = part.getExtent();
    if (!ext.every(Number.isFinite)) continue; // 빈 도형·잘못된 좌표
    let anchor: Point;
    try {
      anchor = anchorPoint(part);
    } catch {
      continue;
    }
    const f = new Feature({ geometry: part });
    f.setId(`${mf.key}#${out.length}`);
    recs.set(f, { mf, kind, entry, anchor, size: Math.max(getWidth(ext), getHeight(ext)), approx, range, primary: out.length === 0 });
    out.push(f);
  }
  return out;
}

/* ─── 컴포넌트 ───────────────────────────────────────────────────────────── */

interface Api {
  applyLayers(): void;
  setFeatures(list: MapFeature[]): void;
  restyle(): void;
  focus(duration: number): void;
  toRegion(): void;
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  const api = useRef<Api | null>(null);
  const focusSeen = useRef<{ token?: number } | null>(null);
  const areaSeen = useRef<{ token?: number } | null>(null);
  const [ready, setReady] = useState(false);

  // 초기화 (한 번)
  useEffect(() => {
    const target = el.current;
    if (!target) return;
    const P0 = propsRef.current;
    const r0 = REGIONS[P0.region] ?? REGIONS.national;

    // ── 배경지도: VWorld WMTS (일반·회색·영상+하이브리드) · 실패 시 OSM
    const vw = (layer: string, ext: string, maxZoom = 19) =>
      new XYZ({ url: `https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/${layer}/{z}/{y}/{x}.${ext}`, crossOrigin: "anonymous", maxZoom });
    const base = new TileLayer({ source: vw("Base", "png"), zIndex: 0 });
    const white = new TileLayer({ source: vw("white", "png", 18), zIndex: 0, visible: false }); // 회색지도는 18단계까지만 있음(19 는 오류 XML)
    const sat = new TileLayer({ source: vw("Satellite", "jpeg"), zIndex: 0, visible: false });
    const hyb = new TileLayer({ source: vw("Hybrid", "png"), zIndex: 1, visible: false });
    const osm = new TileLayer({ source: new OSM(), zIndex: 0, visible: false });
    let osmMode = !VW_KEY; // 키가 없으면 처음부터 OSM
    let tileOk = 0;
    let tileErr = 0;
    let vwReported = false;

    // ── 행정경계: VWorld WMS (실패하면 숨김 → 배경지도만)
    const wms = new TileWMS({
      url: VW_WMS_URL,
      params: { VERSION: "1.3.0", LAYERS: VW_WMS_LAYERS, STYLES: VW_WMS_LAYERS, FORMAT: "image/png", TRANSPARENT: "TRUE", KEY: VW_KEY },
      tileGrid: createXYZ({ extent: getProjection("EPSG:3857")!.getExtent(), tileSize: 512, maxZoom: 19 }),
      wrapX: false,
    });
    const bnd = new TileLayer({ source: wms, zIndex: 5, visible: false });
    let wmsFailed = !VW_KEY;
    let wmsOk = 0;
    let wmsErr = 0;

    // ── T3Q 공간정보: 면 < 선 < 핀 < 이름표
    const src = new VectorSource();
    let byKey = new Map<string, Feature[]>();
    let lastList: MapFeature[] | null = null;
    let hoverKey: string | null = null;
    const stateOf = (r: Rec): St => {
      const P = propsRef.current;
      if (P.selectedKey && r.mf.key === P.selectedKey) return "sel";
      if (hoverKey === r.mf.key) return "hover";
      if (P.activeJobId && r.mf.jobId !== P.activeJobId) return "dim";
      return "base";
    };
    const area = new VectorLayer({
      source: src,
      zIndex: 20,
      style: (f) => {
        const r = recs.get(f);
        return r?.kind === "area" ? areaStyles(r.entry, stateOf(r), r.range) : undefined;
      },
    });
    const line = new VectorLayer({
      source: src,
      zIndex: 21,
      style: (f) => {
        const r = recs.get(f);
        return r?.kind === "line" ? lineStyles(r.entry, stateOf(r), r.range) : undefined;
      },
    });
    const pin = new VectorLayer({
      source: src,
      zIndex: 22,
      style: (f, res) => {
        const r = recs.get(f);
        if (!r) return undefined;
        const st = stateOf(r);
        if (r.kind === "point") return pinStyles(r.entry, st, r.approx, false);
        // 선·면: 선택됐거나 draw=pin 이거나 화면에서 너무 작으면 대표점에 핀
        if (r.primary && (st === "sel" || r.mf.draw === "pin" || r.size / res < SMALL_PX)) return pinStyles(r.entry, st, r.approx, true);
        return undefined;
      },
    });
    const label = new VectorLayer({
      source: src,
      zIndex: 23,
      declutter: true,
      style: (f, res) => {
        const r = recs.get(f);
        if (!r || !r.primary || !r.mf.displayName || res > LABEL_MAX_RES) return undefined;
        const st = stateOf(r);
        return st === "sel" || st === "dim" ? undefined : labelStyle(r); // 선택은 말풍선 라벨(오버레이)
      },
    });
    const vecSet = new Set<unknown>([area, line, pin, label]);

    const m = new OlMap({
      target,
      layers: [base, white, sat, hyb, osm, bnd, area, line, pin, label],
      view: new View({ center: fromLonLat(r0.center), zoom: r0.zoom, minZoom: 6, maxZoom: 19 }),
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }).extend([
        new ScaleLine({ bar: false }),
        new Attribution({ collapsible: false }), // OSM 대체 시에만 출처가 뜸
      ]),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    });

    // ── 툴팁(호버) · 선택 라벨 — React 밖에서 만든 요소 (OpenLayers 가 옮겨 붙임)
    const tipEl = document.createElement("div");
    tipEl.className = "sa-map-tip";
    const tip = new Overlay({ element: tipEl, positioning: "bottom-center", offset: [0, -14], stopEvent: false });
    const lblEl = document.createElement("div");
    lblEl.className = "sa-map-label";
    const lbl = new Overlay({ element: lblEl, positioning: "bottom-center", offset: [0, -Math.round(PIN_W.sel * PIN.topK + 12)], stopEvent: false });
    m.addOverlay(tip);
    m.addOverlay(lbl);

    let tipKey: string | null = null;
    const hideTip = () => {
      tip.setPosition(undefined);
      tipKey = null;
    };
    const showTip = (r: Rec, at: number[]) => {
      if (tipKey !== r.mf.key) {
        tipKey = r.mf.key;
        const name = document.createElement("b");
        name.textContent = r.mf.displayName ?? "이름 미제공";
        if (!r.mf.displayName) name.className = "none";
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.append(entityTypeKo(r.mf.entityType));
        const pk = precisionKo(r.mf.precision);
        if (pk) {
          const s = document.createElement("span");
          s.textContent = pk;
          if (r.approx) s.className = "approx";
          meta.append(" · ", s);
        }
        tipEl.replaceChildren(name, meta);
      }
      tip.setPosition(at);
    };
    const placeLabel = () => {
      const P = propsRef.current;
      const fs = P.selectedKey ? byKey.get(P.selectedKey) : undefined;
      const r = fs?.length ? recs.get(fs[0]) : undefined;
      if (!r || !r.mf.displayName || !P.layers.features) {
        lbl.setPosition(undefined);
        return;
      }
      if (lblEl.textContent !== r.mf.displayName) lblEl.textContent = r.mf.displayName;
      lbl.setPosition(r.anchor.getCoordinates());
    };
    const restyle = () => src.changed();

    const applyLayers = () => {
      const P = propsRef.current;
      base.setVisible(!osmMode && P.basemap === "Base");
      white.setVisible(!osmMode && P.basemap === "gray");
      sat.setVisible(!osmMode && P.basemap === "Satellite");
      hyb.setVisible(!osmMode && P.basemap === "Satellite");
      osm.setVisible(osmMode);
      osm.setOpacity(P.basemap === "gray" ? 0.6 : 1);
      bnd.setVisible(P.layers.boundary && !wmsFailed);
      for (const l of [area, line, pin, label]) l.setVisible(P.layers.features);
      if (!P.layers.features) hideTip();
      placeLabel();
    };

    // 배경지도 실패 → OSM (처음 6장 연속 실패, 또는 실패가 성공의 2배를 넘을 때)
    const onTileErr = () => {
      if (osmMode) return;
      tileErr += 1;
      if ((tileOk === 0 && tileErr >= 6) || (tileErr >= 20 && tileErr > tileOk * 2)) {
        osmMode = true;
        applyLayers();
        propsRef.current.onTileStatus?.("osm");
      }
    };
    const onTileOk = () => {
      tileOk += 1;
      if (!vwReported && !osmMode) {
        vwReported = true;
        propsRef.current.onTileStatus?.("vworld");
      }
    };
    for (const l of [base, white, sat]) {
      const s = l.getSource();
      s?.on("tileloaderror", onTileErr);
      s?.on("tileloadend", onTileOk);
    }
    // 행정경계 실패 → 숨김 (VWorld 는 키 오류도 HTTP 200 + XML 이라 이미지 오류로 잡힌다)
    wms.on("tileloadend", () => {
      wmsOk += 1;
    });
    wms.on("tileloaderror", () => {
      wmsErr += 1;
      if (!wmsFailed && ((wmsOk === 0 && wmsErr >= 4) || (wmsErr >= 12 && wmsErr > wmsOk))) {
        wmsFailed = true;
        bnd.setVisible(false);
        console.warn("[MapView] VWorld 행정경계(WMS)를 불러오지 못해 경계 없이 배경지도만 표시합니다.");
      }
    });

    // ── 범위 맞춤
    let waitUntil = 0; // 대상 도형이 아직 없음 → 오면 다시 맞춤
    let waitSize = false; // 지도가 숨겨져 크기가 0 → 보이면 다시 맞춤
    const zoomCap = (r: Rec) =>
      r.kind !== "point" ? 17 : r.approx === 2 ? 12 : r.approx === 1 ? 14 : r.mf.precision === "centroid_only" ? 15 : 16;
    const fitTo = (fs: Feature[], duration: number): boolean => {
      const size = m.getSize();
      if (!size || size[0] < 8 || size[1] < 8) {
        waitSize = true;
        return false;
      }
      const ext = createEmpty();
      let cap = 0;
      for (const f of fs) {
        const r = recs.get(f);
        const g = f.getGeometry();
        if (!r || !g) continue;
        extendExtent(ext, g.getExtent());
        cap = Math.max(cap, zoomCap(r));
      }
      if (isEmptyExtent(ext)) return false;
      const pad = Math.round(Math.max(16, Math.min(56, Math.min(size[0], size[1]) * 0.12)));
      const v = m.getView();
      v.cancelAnimations();
      v.fit(ext, { padding: [pad + 36, pad, pad, pad], maxZoom: cap, duration: duration || undefined }); // 위쪽은 핀 높이만큼 더 · 0 이면 즉시
      return true;
    };
    const focus = (duration: number) => {
      const P = propsRef.current;
      let ok = false;
      let wait = false;
      const sel = P.selectedKey ? byKey.get(P.selectedKey) : undefined;
      if (sel?.length) ok = fitTo(sel, duration);
      else {
        if (P.selectedKey) wait = true; // 선택 대상 도형이 아직 오지 않음
        const fs: Feature[] = [];
        byKey.forEach((arr) => {
          const r = recs.get(arr[0]);
          if (r && (!P.activeJobId || r.mf.jobId === P.activeJobId)) fs.push(...arr);
        });
        ok = fs.length > 0 && fitTo(fs, duration);
      }
      waitUntil = !ok || wait ? Date.now() + FOCUS_WAIT_MS : 0;
    };
    const toRegion = () => {
      const r = REGIONS[propsRef.current.region] ?? REGIONS.national;
      waitUntil = 0;
      waitSize = false;
      const v = m.getView();
      v.cancelAnimations();
      v.animate({ center: fromLonLat(r.center), zoom: r.zoom, duration: 450 });
    };

    const setFeatures = (list: MapFeature[]) => {
      if (lastList && lastList.length === list.length && lastList.every((x, i) => x === list[i])) return;
      lastList = list;
      const next = new Map<string, Feature[]>();
      const all: Feature[] = [];
      for (const mf of list) {
        if (!mf?.key || !mf.geometry || next.has(mf.key)) continue;
        const fs = toOlFeatures(mf);
        if (!fs.length) continue;
        next.set(mf.key, fs);
        all.push(...fs);
      }
      byKey = next;
      src.clear(true);
      src.addFeatures(all);
      if (hoverKey && !next.has(hoverKey)) hoverKey = null;
      if (tipKey && !next.has(tipKey)) hideTip();
      placeLabel();
      if (waitUntil > Date.now()) focus(450);
    };

    // ── 마우스: 호버 툴팁 · 클릭 선택
    const hitRec = (pixel: number[]): Rec | undefined =>
      m.forEachFeatureAtPixel(pixel, (f) => recs.get(f), { hitTolerance: 4, layerFilter: (l) => vecSet.has(l) });
    m.on("pointermove", (e) => {
      if (e.dragging || !propsRef.current.layers.features) {
        if (tipKey) hideTip();
        return;
      }
      const r = hitRec(e.pixel);
      const k = r?.mf.key ?? null;
      if (k !== hoverKey) {
        hoverKey = k;
        restyle();
      }
      target.style.cursor = r ? "pointer" : "";
      if (r) showTip(r, e.coordinate);
      else if (tipKey) hideTip();
    });
    m.on("singleclick", (e) => {
      if (!propsRef.current.layers.features) return;
      const r = hitRec(e.pixel);
      if (r) propsRef.current.onSelect?.(r.mf.key);
    });
    const vp = m.getViewport();
    const onLeave = () => {
      hideTip();
      target.style.cursor = "";
      if (hoverKey) {
        hoverKey = null;
        restyle();
      }
    };
    vp.addEventListener("pointerleave", onLeave);

    // 외부 확대/축소 버튼 (zoomBy)
    const onZoom = (ev: Event) => {
      const v = m.getView();
      v.animate({ zoom: (v.getZoom() ?? 10) + Number((ev as CustomEvent<number>).detail || 0), duration: 200 });
    };
    window.addEventListener("sa-map-zoom", onZoom);
    const ro = new ResizeObserver(() => {
      m.updateSize();
      const s = m.getSize();
      if (waitSize && s && s[0] >= 8 && s[1] >= 8) {
        waitSize = false;
        focus(0);
      }
    });
    ro.observe(target);

    api.current = {
      applyLayers,
      setFeatures,
      restyle: () => {
        restyle();
        placeLabel();
      },
      focus,
      toRegion,
    };
    applyLayers();
    if (osmMode) P0.onTileStatus?.("osm");
    setReady(true);

    return () => {
      ro.disconnect();
      window.removeEventListener("sa-map-zoom", onZoom);
      vp.removeEventListener("pointerleave", onLeave);
      m.setTarget(undefined);
      m.dispose();
      api.current = null;
      focusSeen.current = null;
      areaSeen.current = null;
    };
  }, []);

  // 배경지도 · 레이어 표시
  useEffect(() => {
    api.current?.applyLayers();
  }, [p.basemap, p.layers.boundary, p.layers.features, ready]);

  // 대상 도형 (focus 보다 먼저 선언 — 같은 렌더에서 도형을 넣은 뒤 맞춤)
  useEffect(() => {
    api.current?.setFeatures(p.features);
  }, [p.features, ready]);

  // 작업 강조 · 선택
  useEffect(() => {
    api.current?.restyle();
  }, [p.activeJobId, p.selectedKey, ready]);

  // focusToken → 선택 대상(있으면) 또는 이 작업 대상 범위로 맞춤. 처음 붙을 때는 애니메이션 없이.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const first = focusSeen.current === null;
    if (!first && focusSeen.current?.token === p.focusToken) return;
    focusSeen.current = { token: p.focusToken };
    if (p.focusToken === undefined) return;
    a.focus(first ? 0 : 450);
  }, [p.focusToken, ready]);

  // areaToken → 기준지역 중심으로 이동 (처음 값은 초기 중심과 같으므로 건너뜀)
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    if (areaSeen.current === null) {
      areaSeen.current = { token: p.areaToken };
      return;
    }
    if (areaSeen.current.token === p.areaToken) return;
    areaSeen.current = { token: p.areaToken };
    a.toRegion();
  }, [p.areaToken, ready]);

  // 화면 낭독기용 지도 대체정보 (908001)
  const sr = useMemo(() => {
    const all = p.features;
    if (!all.length) return "지도에 표시된 대상이 없습니다.";
    const act = p.activeJobId ? all.filter((f) => f.jobId === p.activeJobId) : all;
    const list = act.length ? act : all;
    const names = list.slice(0, 12).map((f) => f.displayName ?? "이름 미제공");
    const sel = p.selectedKey ? all.find((f) => f.key === p.selectedKey) : undefined;
    const selText = sel
      ? ` 선택한 대상: ${sel.displayName ?? "이름 미제공"} (${entityTypeKo(sel.entityType)}${precisionKo(sel.precision) ? ` · ${precisionKo(sel.precision)}` : ""}).`
      : "";
    return `지도 표시 대상 ${list.length}건${list.length < all.length ? `(전체 ${all.length}건 중)` : ""}: ${names.join(", ")}${list.length > 12 ? " 외" : ""}.${selText}`;
  }, [p.features, p.activeJobId, p.selectedKey]);

  return (
    <div className="sa-map olmap" role="region" aria-label="지도">
      <div ref={el} className="sa-map-canvas" />
      <p className="sa-map-sr" aria-live="polite">{sr}</p>
    </div>
  );
}

/** 외부 확대/축소 버튼용 — window 이벤트로 MapView 에 전달 */
export function zoomBy(delta: number) {
  window.dispatchEvent(new CustomEvent("sa-map-zoom", { detail: delta }));
}
