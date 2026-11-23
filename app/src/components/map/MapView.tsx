"use client";
/**
 * 지도 — VWorld 배경지도 + VWorld 행정경계(WMS) + T3Q 공간정보만 그린다.
 *
 * - 그리는 도형은 T3Q `POST /spatial-objects/geometry`(EXT-01) 응답 geometry 그대로(EPSG:4326 → 3857 투영만).
 *   좌표 추정·ID 파싱은 하지 않는다. 선·면이 화면에서 너무 작으면 그 도형 위의 대표점(선 중간·면 안쪽 점)에
 *   핀을 함께 그려 보이게 한다 — 받은 도형에서 구한 점이다.
 * - 이름은 T3Q display_name 그대로. 위치 정밀도(precision)가 행정구역 중심이면 점선 원으로 «근사 위치» 표시.
 * - 행정경계는 VWorld WMS. 실패하면 경계 없이 배경지도만 보인다.
 * - 배경지도 VWorld WMTS 가 연속 실패하면 개발서버 MapPane 처럼 대체 지도 없이 회색 바탕에 알림 「배경지도를 불러오지 못했습니다.」
 *   (표식·확대·축소는 그대로). 타일이 다시 오면 알림을 거둔다.
 * - 위성 단추(개발 서버 MapPane .map-sat, onBasemap 을 줄 때) — 확대·축소 묶음 맨 위, 아이콘만. 위성은 VWorld Satellite(jpeg) + 이름 겹 Hybrid(png).
 *   위성 타일이 연속 실패하면 일반지도로 돌아오고 알림 「위성지도를 불러오지 못해 일반지도로 돌아왔습니다.」(다시 위성을 켤 때까지).
 * - 짜임(개발서버 MapPane): 알림 → 범례(top) → 지도 칸(.mapwrap = .map-canvas-wrap) → 지도 대체정보. 감싸는 쪽(.map-pane)이 세로로 쌓는다.
 * - 설명서 7.5-2: activeJobId 의 대상은 진하게, 다른 답변의 대상은 흐리게.
 * - 범례 거르기(filter): 그 종류만 그리고 그 범위로 맞춤. 선택한 대상은 거르기와 상관없이 보인다.
 * - 선택한 대상은 말풍선 카드(MapPopup)로 — 받은 유형·이름·위치 정밀도만, 동작은 이미 있는 것(답변 목록으로 이동·확대·같은 종류만)만.
 * - 개발 서버 MapPane 이식(2026-11-06): 「객체 참조」(켜면 누르기 = 집기, 말풍선 없음, 집은 것은 파랑 고리·점선) ·
 *   점 묶음(화면 56px, 16줌부터 해제, 고른 것·집은 것은 낱개) · 근사 위치 확대 규칙(lib/mapRef focusZoomOf) ·
 *   처음 맞춤은 무리에서 먼 것을 빼고(coreIndices), 사람이 지도를 움직인 뒤에는 새 답이 와도 다시 잡지 않음 ·
 *   누른 핀은 배율 그대로 가운데로 · 말풍선 「상세 보기」는 상세가 있을 때만 · 행정경계 실패 알림 · 지도 대체정보 목록(누르면 선택).
 */
import "./map.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import TileWMS from "ol/source/TileWMS";
import TileState from "ol/TileState";
import type ImageTile from "ol/ImageTile";
import Point from "ol/geom/Point";
import MultiPoint from "ol/geom/MultiPoint";
import LineString from "ol/geom/LineString";
import MultiLineString from "ol/geom/MultiLineString";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import GeometryCollection from "ol/geom/GeometryCollection";
import type Geometry from "ol/geom/Geometry";
import { fromLonLat, get as getProjection, toLonLat } from "ol/proj";
import { createXYZ } from "ol/tilegrid";
import { createEmpty, extend as extendExtent, getCenter, getHeight, getWidth, isEmpty as isEmptyExtent } from "ol/extent";
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import { defaults as defaultControls } from "ol/control";
import { defaults as defaultInteractions } from "ol/interaction";
import type { RegionId } from "@/lib/contract/agent";
import { REGIONS } from "@/lib/config";
import { CLUSTER_UNTIL_ZOOM, SYMBOL_NAMES, type RefLike, centerLabel, clusterPoints, coreIndices, focusZoomOf, pointZoom, symbolOf } from "@/lib/mapRef";
import {
  MAP_COLOR, PIN, approxLevel, entityTypeKo, isRangePrecision, lookOf, matchFilter, pinDataUri, precisionKo, rgba, shade,
  type LegendEntry, type Look,
} from "./mapStyle";
import MapPopup from "./MapPopup";
import { sigunguShapes } from "../summary/MapSummary";
import MapBrowserEvent from "ol/MapBrowserEvent";
import { MAP_CLICK_EVENT, MAP_FIND_EVENT, type MapHit, type MapQuery } from "@/lib/autoDemoMap";
import { currentScale, onScaleChange, scaledPx } from "@/lib/fontScale";

/** 배경지도 타일·경계는 서버가 대신 받는다 — 인증키를 브라우저에 두지 않는다(개발서버 MapController tiles · app/api/map/tiles·wms) */
const VW_TILE_URL = "/api/map/tiles";

/**
 * VWorld 2D 데이터 API — WMS 행정경계 (GetCapabilities 2026-10-28 확인)
 * - 레이어: lt_c_adsido(광역시도) · lt_c_adsigg(시군구) · lt_c_ademd(읍면동, 큰 축척에서만 그려짐). 스타일 이름 = 레이어 이름.
 * - CRS EPSG:3857 이면 BBOX 는 xmin,ymin,xmax,ymax (OpenLayers 가 맞춰 보냄). 한 번에 최대 4개 레이어.
 * - 응답에 CORS 헤더가 없다 → crossOrigin 을 주지 않는다(주면 이미지가 막힘).
 * - 인증은 Referer(등록 도메인)로 된다. DOMAIN 파라미터를 붙이면 응답이 INCORRECT_KEY 와 섞여 나와(같은 요청 반복 시험) 넣지 않는다.
 * - 2026-11-07 부터 서버(/api/map/wms)가 KEY 를 붙이고 등록 주소를 Referer 로 보내 대신 받는다(같은 출처라 CORS 걱정 없음).
 */
const VW_WMS_URL = "/api/map/wms";
const VW_WMS_LAYERS = "lt_c_adsido,lt_c_adsigg,lt_c_ademd";

export type Basemap = "Base" | "Satellite";
/** 행정경계 상태 — 개발서버 useMapLayers BoundaryStatus(idle 은 우리 경계가 늘 전국 WMS 라 없음) */
export type BoundaryStatus = "loading" | "ok" | "nokey" | "failed" | "denied";

/** 지도에 그릴 T3Q 대상 하나 = refs[] 한 건 + EXT-01 도형 */
/** 답이 가리켰으나 도형을 못 받은 대상 */
export interface MissingItem {
  key: string;
  jobId: string;
  name: string;
  entityType: string;
}

export interface MapFeature {
  key: string; // 화면 고유키 `${jobId}:${ref}`
  ref: string; // T3Q ref (r3)
  jobId: string;
  entityType: string | null;
  displayName: string | null; // T3Q display_name 그대로(가공 금지)
  draw: string | null; // T3Q map.draw
  precision: string | null; // EXT-01 properties.precision
  geometry: { type: string; coordinates: unknown }; // EXT-01 geometry 그대로 (EPSG:4326)
  /** 여러 답을 건너 같은 대상을 가리는 열쇠(lib/mapRef entityKey — 지도 열쇠 key:value). 집기·요약 구 거르기가 쓴다. 없으면 key */
  eid?: string;
  /** T3Q map.value 그대로 — 행정구역 중심점 이름 찾기(adminCenterCode) */
  mapValue?: string | null;
  /** 받은 ref 그대로 — 말풍선 상세 유무(T3Q-15)·요약 이름 누르기가 쓴다 */
  t3qRef?: RefLike;
}
export interface MapLayers { boundary: boolean; features: boolean }
export const DEFAULT_LAYERS: MapLayers = { boundary: true, features: true };

interface Props {
  region: RegionId; // 초기 중심: lib/config REGIONS[region].center/zoom
  areaToken?: number; // 바뀌면 region 중심으로 이동
  /** 기준지역 코드(시·도 2자리 · 시·군·구 5자리) — 바뀌면 그 행정경계에 지도를 맞춘다(개발서버 MapPane fitRegion) */
  baseCode?: string;
  features: MapFeature[];
  activeJobId?: string | null; // 이 작업의 feature 는 진하게, 나머지는 흐리게(설명서 7.5-2)
  selectedKey?: string | null; // 선택 강조 + 라벨
  focusToken?: number; // 바뀌면 selectedKey(있으면) 또는 activeJob features 범위로 fit
  basemap: Basemap;
  layers: MapLayers;
  onSelect?: (key: string) => void;
  /** 범례 거르기 열쇠(mapStyle filterKey) — 주면 그 종류만 그린다. null/없음 = 모두 */
  filter?: string | null;
  /** 말풍선의 「답변에서 보기」 — 그 대상이 든 답변으로 이동 */
  onLocate?: (f: MapFeature) => void;
  /** 주면 확대·축소 묶음 맨 위에 위성 단추를 둔다(위성 실패 시 "Base" 로 되돌림) */
  onBasemap?: (b: Basemap) => void;
  /** 「객체 참조」 켬 — 지도 누르기가 집기가 된다(말풍선·선택 없음, 개발 서버 MapPane picking) */
  picking?: boolean;
  /** 집어 둔 대상 열쇠(eid) — 파랑 고리·점선으로, 묶지 않는다 */
  pickedIds?: ReadonlySet<string>;
  onTogglePick?: (f: MapFeature) => void;
  /** 요약 보기에서 고른 구 — 이 열쇠(eid)의 대상만 그린다 */
  areaIds?: ReadonlySet<string> | null;
  /** 요약 보기 켬 — 핀을 거두고 하천 띠만 남긴다(시군구 색칠이 주인공) */
  summaryOn?: boolean;
  /** 지금 그리는 답(턴·브리핑)의 열쇠 — 바뀌면 사람이 옮긴 자리를 놓고 새 대상 범위로 맞춘다 */
  scope?: string;
  /** 행정구역 중심점 코드 → 지역 이름(「인제군 중심」) */
  adminNames?: ReadonlyMap<string, string>;
  /** 말풍선 「상세 보기」 — detailOf 가 참일 때만 눌린다(상세 없음이면 회색) */
  detailOf?: (f: MapFeature) => Promise<boolean>;
  onDetail?: (f: MapFeature) => void;
  /** 답이 가리켰으나 도형을 못 받은 대상 수(지도 대체정보에 적는다) */
  missing?: number;
  /** 그 대상들(이름·종류) — 지도 대체정보에 「· 공간정보 없음」으로 적는다(개발서버 MapAlt) */
  missingItems?: MissingItem[];
  /** 조회결과 위치(EXT-01) 상태 — 실패·받는 중 알림 */
  resultStatus?: "loading" | "failed" | null;
  /** OpenLayers 지도 — 요약 보기(MapSummary)가 겹을 얹는다 */
  onMap?: (m: OlMap | null) => void;
  /** 지도 칸 위에 얹는 것(요약 보기 단추·카드 · 구 거르기 칩 · 「지도 표시」 · 「객체 참조」) */
  children?: ReactNode;
  /** 알림 아래·지도 칸 위에 세우는 것(개발서버 MapPane 범례 띠 자리) */
  top?: ReactNode;
}

/** 위성지도 단추 기호 (개발 서버 MapPane SatIcon) */
function SatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── 표식 스타일 ─────────────────────────────────────────────────────────── */

type Kind = "point" | "line" | "area";
type St = "dim" | "base" | "hover" | "sel";

interface Rec {
  mf: MapFeature;
  kind: Kind;
  entry: LegendEntry;
  /** 범례 항목 + 이름 낱말로 고른 세부 종류·기호 */
  look: Look;
  /** 대표점 — 점이면 그 점, 선은 길이 중간, 면은 안쪽 점 (라벨·축소 핀 자리) */
  anchor: Point;
  /** 도형 범위의 긴 변 (지도 단위) */
  size: number;
  approx: 0 | 1 | 2;
  /** bbox 계열 — 범위 사각형 */
  range: boolean;
  /** GeometryCollection 을 나눴을 때 첫 조각만 라벨·축소 핀 */
  primary: boolean;
}

const FONT = `"Pretendard GOV", "Noto Sans KR", "Malgun Gothic", sans-serif`;
/** 핀 폭(px) — 기본 · 호버 · 선택(커진 핀) · 흐림 */
const PIN_W: Record<St, number> = { dim: 24, base: 30, hover: 32, sel: 40 };
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
const patCache = new Map<string, CanvasPattern | string>();
const geoFormat = new GeoJSON();

/** 작은 캔버스 무늬 (실패하면 반투명 단색) */
function pattern(k: string, size: number, draw: (g: CanvasRenderingContext2D) => void, fallback: string): CanvasPattern | string {
  const hit = patCache.get(k);
  if (hit) return hit;
  let pat: CanvasPattern | null = null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    draw(g);
    pat = g.createPattern(c, "repeat");
  }
  const out = pat ?? fallback;
  patCache.set(k, out);
  return out;
}

/** 빗금 채움 (Figma map_area — 위험·취약지역). strong = 호버·선택 */
function hatch(color: string, strong = false): CanvasPattern | string {
  return pattern(`h|${color}|${strong ? 1 : 0}`, 10, (g) => {
    g.fillStyle = rgba(color, strong ? 0.16 : 0.08);
    g.fillRect(0, 0, 10, 10);
    g.strokeStyle = rgba(color, strong ? 0.75 : 0.55);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-2, 12); g.lineTo(12, -2);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(8, 12); g.lineTo(12, 8);
    g.stroke();
  }, rgba(color, 0.14));
}

/** 점무늬 채움 (침수지도 구역) */
function dots(color: string, strong = false): CanvasPattern | string {
  return pattern(`d|${color}|${strong ? 1 : 0}`, 10, (g) => {
    g.fillStyle = rgba(color, strong ? 0.18 : 0.1);
    g.fillRect(0, 0, 10, 10);
    g.fillStyle = rgba(color, strong ? 0.7 : 0.5);
    for (const [x, y] of [[2.5, 2.5], [7.5, 7.5]]) {
      g.beginPath();
      g.arc(x, y, 1.25, 0, Math.PI * 2);
      g.fill();
    }
  }, rgba(color, 0.14));
}

/** 핀 (+ 근사 위치 점선 원 · 호버/선택 후광 · 선택 바닥 고리). onAnchor = 선·면의 대표점에 그림 */
/** 집어 둔 대상의 색 — 개발 서버 map-pin--held(#0b50d0) */
const HELD = "#0b50d0";

function pinStyles(look: Look, st: St, approx: 0 | 1 | 2, onAnchor: boolean, held = false): Style[] {
  const e = look.entry;
  const k = `p|${e.id}|${look.glyph}|${st}|${approx}|${onAnchor ? 1 : 0}|${held ? 1 : 0}`;
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
        radius: approx === 2 ? 28 : 20,
        fill: new Fill({ color: st === "dim" ? "rgba(255,255,255,0.18)" : rgba(MAP_COLOR.ring, 0.1) }),
        stroke: new Stroke({ color: st === "dim" ? rgba(MAP_COLOR.ring, 0.45) : MAP_COLOR.ring, width: 2.5, lineDash: [5, 4] }),
      }),
    }));
  }
  if (st === "sel") {
    // 바닥 고리 — 핀 끝이 가리키는 자리
    out.push(new Style({
      geometry,
      zIndex: z,
      image: new CircleStyle({ radius: 9, fill: new Fill({ color: rgba(e.pin, 0.22) }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
    }));
  }
  if (st === "hover" || st === "sel") {
    out.push(new Style({
      geometry,
      zIndex: z + 1,
      image: new CircleStyle({
        radius: st === "sel" ? 27 : 21,
        displacement: [0, w * PIN.headK],
        fill: new Fill({ color: rgba(e.pin, st === "sel" ? 0.2 : 0.14) }),
        stroke: st === "sel" ? new Stroke({ color: rgba(e.pin, 0.5), width: 1.5 }) : undefined,
      }),
    }));
  }
  if (held) {
    // 집은 것 — 핀 머리에 파랑 고리. 고름은 하나(지금 보는 것), 집음은 여럿(질문에 딸려 갈 것)이라 얼굴을 달리한다
    out.push(new Style({
      geometry,
      zIndex: z + 3,
      image: new CircleStyle({ radius: Math.round(w * 0.62), displacement: [0, w * PIN.headK], stroke: new Stroke({ color: HELD, width: 3 }) }),
    }));
  }
  out.push(new Style({
    geometry,
    zIndex: z + 2,
    image: new Icon({
      src: pinDataUri({ pin: e.pin, glyph: look.glyph, shape: e.shape }),
      anchor: [0.5, PIN.tipY],
      scale: w / PIN.srcW,
      opacity: st === "dim" ? 0.5 : 1,
    }),
  }));
  styleCache.set(k, out);
  return out;
}

function lineStyles(e: LegendEntry, st: St, range: boolean, held = false): Style[] {
  const k = `l|${e.id}|${st}|${range ? 1 : 0}|${held ? 1 : 0}`;
  const hit = styleCache.get(k);
  if (hit) return hit;
  const w = st === "dim" ? 2.5 : st === "base" ? 4 : st === "hover" ? 5 : 6;
  const z = Z[st];
  const cap = { lineCap: "round", lineJoin: "round" } as const;
  const out: Style[] = [];
  const c = held ? HELD : e.stroke;
  const strong = st === "sel" || held;
  if (strong || st === "hover") {
    out.push(new Style({ zIndex: z, stroke: new Stroke({ color: rgba(c, strong ? 0.28 : 0.16), width: w + (strong ? 12 : 8), ...cap }) }));
  }
  out.push(new Style({ zIndex: z + 1, stroke: new Stroke({ color: st === "dim" ? "rgba(255,255,255,0.55)" : "#fff", width: w + 3.5, ...cap }) }));
  out.push(new Style({
    zIndex: z + 2,
    stroke: new Stroke({ color: st === "dim" ? rgba(c, 0.5) : c, width: w, lineDash: range || held ? [8, 6] : undefined, ...cap }),
  }));
  // 물길은 가운데 밝은 줄 — 흐르는 물처럼
  if (st !== "dim" && !range && (e.id === "river" || e.id === "floodTrace")) {
    out.push(new Style({ zIndex: z + 3, stroke: new Stroke({ color: rgba(shade(e.stroke, 0.55), 0.9), width: Math.max(1, w * 0.3), lineDash: [10, 8], ...cap }) }));
  }
  styleCache.set(k, out);
  return out;
}

function areaFill(e: LegendEntry, st: St): CanvasPattern | string {
  if (st === "dim") return rgba(e.stroke, 0.05);
  const strong = st !== "base";
  const pat = e.pattern ?? (e.hatch ? "hatch" : "soft");
  if (pat === "hatch") return hatch(e.stroke, strong);
  if (pat === "dots") return dots(e.stroke, strong);
  return e.fill;
}

function areaStyles(e: LegendEntry, st: St, range: boolean, held = false): Style[] {
  const k = `a|${e.id}|${st}|${range ? 1 : 0}|${held ? 1 : 0}`;
  const hit = styleCache.get(k);
  if (hit) return hit;
  const w = st === "dim" ? 1.5 : st === "base" ? 2.2 : st === "hover" ? 3 : 3.5;
  const z = Z[st];
  const dash = range || held ? [8, 6] : undefined;
  const out: Style[] = [];
  if (held) out.push(new Style({ zIndex: z, stroke: new Stroke({ color: rgba(HELD, 0.28), width: w + 10, lineJoin: "round" }) }));
  if (st === "sel") out.push(new Style({ zIndex: z, stroke: new Stroke({ color: rgba(e.stroke, 0.26), width: w + 10, lineJoin: "round" }) }));
  if (st !== "dim") out.push(new Style({ zIndex: z + 1, stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: w + 3, lineJoin: "round" }) }));
  // 무늬 없는 면은 호버·선택 때 한 겹 더 채워 진하게
  if ((st === "sel" || st === "hover") && !(e.pattern ?? (e.hatch ? "hatch" : ""))) {
    out.push(new Style({ zIndex: z + 1, fill: new Fill({ color: rgba(e.stroke, st === "sel" ? 0.14 : 0.08) }) }));
  }
  out.push(new Style({
    zIndex: z + 2,
    fill: new Fill({ color: areaFill(e, st) }),
    stroke: new Stroke({ color: held ? HELD : st === "dim" ? rgba(e.stroke, 0.45) : e.stroke, width: w, lineDash: dash, lineJoin: "round" }),
  }));
  styleCache.set(k, out);
  return out;
}

/** 상시 이름표 — display_name 그대로(행정구역 중심점이면 그 지역 이름), 대표점 아래. 지역 이름이 늦게 오면 글이 바뀌므로 글마다 하나.
 *  글자 크기는 [글자 크기] 배율을 따른다(R58) — 배율마다 따로 담아 둔다 */
const labelCache = new Map<string, Style>();
function labelStyle(text: string): Style {
  const sc = currentScale();
  const key = `${sc}|${text}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const st = new Style({
    geometry: anchorOf,
    text: new Text({
      text,
      font: `700 ${scaledPx(12, sc)}px ${FONT}`,
      fill: new Fill({ color: MAP_COLOR.navyDk }),
      stroke: new Stroke({ color: "rgba(255,255,255,0.96)", width: 4 }),
      textBaseline: "top",
      offsetY: 7,
    }),
  });
  labelCache.set(key, st);
  return st;
}

/** 묶음 원 — 개수만큼 크게(개발 서버 map-cluster 34·40·48px), 개수 글자 */
function clusterStyle(n: number): Style {
  const sc = currentScale();
  const k = `c|${n}|${sc}`;
  const hit = styleCache.get(k);
  if (hit) return hit[0];
  const size = n >= 50 ? 48 : n >= 10 ? 40 : 34;
  const st = new Style({
    zIndex: 60,
    image: new CircleStyle({ radius: size / 2, fill: new Fill({ color: "rgba(86,70,194,0.92)" }), stroke: new Stroke({ color: "rgba(86,70,194,0.22)", width: 10 }) }),
    text: new Text({ text: String(n), font: `800 ${scaledPx(13, sc)}px ${FONT}`, fill: new Fill({ color: "#fff" }) }),
  });
  styleCache.set(k, [st]);
  return st;
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
  const look = lookOf(mf.entityType, mf.displayName);
  const entry = look.entry;
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
    recs.set(f, { mf, kind, entry, look, anchor, size: Math.max(getWidth(ext), getHeight(ext)), approx, range, primary: out.length === 0 });
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
  toBase(code: string, onlyIfEmpty?: boolean): void;
  /** 거르기가 바뀜 → 다시 그리고 그 범위로 맞춤 */
  applyFilter(): void;
  /** 말풍선 자리 다시 잡기 (닫기·다시 열기) */
  placePop(pan?: boolean): void;
  /** 한 대상으로 확대 */
  zoomTo(key: string): void;
  /** 그리는 대상 전체로 물러남(말풍선 「전체 보기」) */
  fitAll(): void;
  /** 사람이 옮긴 자리를 놓고 다시 맞춤(답·요약 보기·고른 구가 바뀜) */
  refit(): void;
}

const EMPTY_NAMES: ReadonlyMap<string, string> = new Map();

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  const api = useRef<Api | null>(null);
  const focusSeen = useRef<{ token?: number } | null>(null);
  const areaSeen = useRef<{ token?: number } | null>(null);
  const [ready, setReady] = useState(false);
  // 선택 말풍선 — OpenLayers 오버레이 요소에 React 로 그린다 · 닫아 둔 대상 키
  const [popEl, setPopEl] = useState<HTMLDivElement | null>(null);
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const closedRef = useRef<string | null>(null);
  closedRef.current = closedKey;
  // 배경지도 타일을 못 받음(개발서버 tilesBroken) · 위성지도를 못 불러와 일반지도로 돌아옴
  const [tilesBroken, setTilesBroken] = useState(false);
  const [satFailed, setSatFailed] = useState(false);
  // 행정경계 상태(개발서버 useMapLayers BoundaryStatus) — 받는 중 · 받음 · 못 받음 · 서버에 키 없음 · 기준지역 밖이라 거절
  const [bnd, setBnd] = useState<BoundaryStatus>("loading");
  /**
   * 지금 가까이 보고 있는 대상(mf.key) — 말풍선 단추가 이것을 보고 「가까이 보기」↔「전체 보기」로 바뀐다(개발서버 MapPane nearId · e9f6fd2).
   * 이름·[가까이 보기]로 그 대상에 당겨 둔 뒤 같은 단추만 있으면 눌러도 아무 일이 없어 보였다. 사람이 지도를 움직이거나 답이 바뀌면 풀린다
   */
  const [nearKey, setNearKey] = useState<string | null>(null);

  // 초기화 (한 번)
  useEffect(() => {
    const target = el.current;
    if (!target) return;
    const P0 = propsRef.current;
    const r0 = REGIONS[P0.region] ?? REGIONS.national;

    // ── 배경지도: VWorld WMTS (일반·영상+하이브리드) · 실패하면 대체 없이 회색 바탕 + 알림(개발서버)
    const vw = (layer: string, ext: string, maxZoom = 19) =>
      new XYZ({ url: `${VW_TILE_URL}/${layer}/{z}/{y}/{x}.${ext}`, crossOrigin: "anonymous", maxZoom });
    const base = new TileLayer({ source: vw("Base", "png"), zIndex: 0 });
    const sat = new TileLayer({ source: vw("Satellite", "jpeg"), zIndex: 0, visible: false });
    const hyb = new TileLayer({ source: vw("Hybrid", "png"), zIndex: 1, visible: false });
    let broken = false; // 배경지도 고장 — 처음 6장 연속 실패 · 실패가 성공의 2배를 넘음. 타일이 다시 오면 푼다
    let tileOk = 0;
    let tileErr = 0;
    // 위성 타일 — 따로 센다. 위성만 안 오면 일반지도로 돌아간다
    let satOk = 0;
    let satErr = 0;
    let satGaveUp = false;
    let lastBasemap: Basemap | null = null;

    // ── 행정경계: VWorld WMS (실패하면 숨김 → 배경지도만)
    const wms = new TileWMS({
      url: VW_WMS_URL,
      params: { VERSION: "1.3.0", LAYERS: VW_WMS_LAYERS, STYLES: VW_WMS_LAYERS, FORMAT: "image/png", TRANSPARENT: "TRUE" },
      tileGrid: createXYZ({ extent: getProjection("EPSG:3857")!.getExtent(), tileSize: 512, maxZoom: 19 }),
      wrapX: false,
    });
    const bnd = new TileLayer({ source: wms, zIndex: 5, visible: false });
    let wmsFailed = false;
    let wmsOk = 0;
    let wmsErr = 0;
    /**
     * 경계 상태 — 우리 경계는 WMS 타일이라 한 번에 받는 개발서버(boundary API)와 달리 타일마다 온다. 그래서
     * 받는 중 = 지도를 처음 열거나 기준지역을 옮긴 뒤 그 화면의 타일이 다 그려질 때까지(rendercomplete),
     * 못 받음 = 이미지 오류 수(처음 4장 연속 · 또는 12장 넘게 오류가 성공보다 많음),
     * 키 없음 · 거절 = 서버 대리(/api/map/wms)의 응답(x-map-status: nokey · 403)으로 가린다 — 타일을 fetch 로 받아 응답 코드를 본다.
     */
    let bndState: BoundaryStatus = "loading";
    const setBndState = (next: BoundaryStatus) => {
      if (bndState === next) return;
      bndState = next;
      setBnd(next);
    };
    const bndStop = (next: "failed" | "nokey" | "denied") => {
      if (wmsFailed) return;
      wmsFailed = true;
      bnd.setVisible(false);
      setBndState(next);
    };
    wms.setTileLoadFunction((tile, src) => {
      const img = (tile as ImageTile).getImage() as HTMLImageElement;
      fetch(src, { credentials: "same-origin" })
        .then((r) => {
          if (r.status === 403) bndStop("denied");
          else if (r.headers.get("x-map-status") === "nokey") bndStop("nokey");
          if (!r.ok) throw new Error(String(r.status));
          return r.blob();
        })
        .then((b) => {
          const url = URL.createObjectURL(b);
          img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
          img.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
          img.src = url;
        })
        .catch(() => tile.setState(TileState.ERROR));
    });

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
    const eidOf = (r: Rec) => r.mf.eid ?? r.mf.key;
    const heldRec = (r: Rec) => !!propsRef.current.pickedIds?.has(eidOf(r));
    /**
     * 그릴 대상인가 — 요약 보기 중이면 하천만(띠), 요약에서 고른 구가 있으면 그 구의 대상만,
     * 범례 거르기(선택한 대상은 거르기와 상관없이 보인다). 「지도 표시」 갈래 끄기는 뺐다(개발서버 e9f6fd2)
     */
    const shownRec = (r: Rec): boolean => {
      const P = propsRef.current;
      if (P.summaryOn) return r.entry.id === "river";
      if (P.areaIds && !P.areaIds.has(eidOf(r))) return false;
      return matchFilter(P.filter, r.look) || (!!P.selectedKey && r.mf.key === P.selectedKey);
    };
    /** 점 묶음에 든 대상(mf.key) — 핀·이름표를 숨기고 묶음 원 하나로 */
    const clustered = new Set<string>();
    /** 이름표 글 — 행정구역 중심점이면 그 지역 이름 */
    const nameOf = (r: Rec) => centerLabel(r.mf.displayName, r.mf.precision, r.mf.mapValue, propsRef.current.adminNames ?? EMPTY_NAMES);
    /** 선·면의 대표점에 핀을 세우는가 — 선택·draw=pin·화면에서 너무 작음 */
    const anchorPinned = (r: Rec, st: St, res: number) => r.primary && (st === "sel" || r.mf.draw === "pin" || r.size / res < SMALL_PX);
    const area = new VectorLayer({
      source: src,
      zIndex: 20,
      style: (f) => {
        const r = recs.get(f);
        return r?.kind === "area" && shownRec(r) ? areaStyles(r.entry, stateOf(r), r.range, heldRec(r)) : undefined;
      },
    });
    const line = new VectorLayer({
      source: src,
      zIndex: 21,
      style: (f) => {
        const r = recs.get(f);
        return r?.kind === "line" && shownRec(r) ? lineStyles(r.entry, stateOf(r), r.range, heldRec(r)) : undefined;
      },
    });
    const pin = new VectorLayer({
      source: src,
      zIndex: 22,
      style: (f, res) => {
        const r = recs.get(f);
        // 요약 보기 중에는 핀 없이 도형(하천 띠)만
        if (!r || !shownRec(r) || propsRef.current.summaryOn || clustered.has(r.mf.key)) return undefined;
        const st = stateOf(r);
        if (r.kind === "point") return pinStyles(r.look, st, r.approx, false, heldRec(r));
        if (anchorPinned(r, st, res)) return pinStyles(r.look, st, r.approx, true, heldRec(r));
        return undefined;
      },
    });
    const label = new VectorLayer({
      source: src,
      zIndex: 23,
      declutter: true,
      style: (f, res) => {
        const r = recs.get(f);
        if (!r || !r.primary || !r.mf.displayName || res > LABEL_MAX_RES || !shownRec(r) || propsRef.current.summaryOn || clustered.has(r.mf.key)) return undefined;
        const st = stateOf(r);
        return st === "sel" || st === "dim" ? undefined : labelStyle(nameOf(r) ?? ""); // 선택은 말풍선 카드(오버레이)
      },
    });
    // 점 묶음 원 — 겹치는 핀을 개수 원 하나로(개발 서버 recluster). 누르면 그 점들이 다 보이게 확대
    const clSrc = new VectorSource();
    const clLayer = new VectorLayer({ source: clSrc, zIndex: 24, style: (f) => clusterStyle(Number(f.get("n")) || 0) });
    const vecSet = new Set<unknown>([area, line, pin, label]);

    const m = new OlMap({
      target,
      layers: [base, sat, hyb, bnd, area, line, pin, label, clLayer],
      view: new View({ center: fromLonLat(r0.center), zoom: r0.zoom, minZoom: 6, maxZoom: 19 }),
      // 확대·축소는 우리 단추가, 출처 띠·축척 막대는 두지 않는다(개발서버 zoomControl·attributionControl false)
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    });

    // ── 툴팁(호버) · 선택 말풍선 — React 밖에서 만든 요소 (OpenLayers 가 옮겨 붙임)
    const tipEl = document.createElement("div");
    tipEl.className = "sa-map-tip";
    const tip = new Overlay({ element: tipEl, positioning: "bottom-center", offset: [0, -16], stopEvent: false });
    const popBox = document.createElement("div");
    popBox.className = "sa-map-pop";
    const pop = new Overlay({ element: popBox, positioning: "bottom-center", offset: [0, -Math.round(PIN_W.sel * PIN.topK + 8)], stopEvent: true });
    m.addOverlay(tip);
    m.addOverlay(pop);

    let tipKey: string | null = null;
    const hideTip = () => {
      tip.setPosition(undefined);
      tipKey = null;
    };
    const showTip = (r: Rec, at: number[]) => {
      if (tipKey !== r.mf.key) {
        tipKey = r.mf.key;
        tipEl.style.setProperty("--c", r.entry.pin);
        const name = document.createElement("b");
        name.textContent = nameOf(r) ?? "이름 미제공";
        if (!r.mf.displayName) name.className = "none";
        const meta = document.createElement("span");
        meta.className = "meta";
        const dot = document.createElement("i");
        dot.setAttribute("aria-hidden", "true");
        // 세부 종류(지하차도 등 — 받은 이름 낱말)가 있으면 그것, 없으면 받은 유형(개발 서버 툴팁)
        meta.append(dot, r.look.sub?.label ?? entityTypeKo(r.mf.entityType));
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
    const panPop = () => {
      if (pop.getPosition()) pop.panIntoView({ animation: { duration: 250 }, margin: 16 });
    };
    const placePop = (pan = false) => {
      const P = propsRef.current;
      const fs = P.selectedKey ? byKey.get(P.selectedKey) : undefined;
      const r = fs?.length ? recs.get(fs[0]) : undefined;
      if (!r || !P.layers.features || closedRef.current === r.mf.key) {
        pop.setPosition(undefined);
        return;
      }
      pop.setPosition(r.anchor.getCoordinates());
      if (pan) requestAnimationFrame(panPop);
    };
    const restyle = () => src.changed();

    const applyLayers = () => {
      const P = propsRef.current;
      if (P.basemap !== lastBasemap) {
        lastBasemap = P.basemap;
        // 위성을 다시 켜면 처음부터 다시 센다
        if (P.basemap === "Satellite") {
          satOk = 0;
          satErr = 0;
          satGaveUp = false;
        }
      }
      base.setVisible(P.basemap !== "Satellite");
      sat.setVisible(P.basemap === "Satellite");
      hyb.setVisible(P.basemap === "Satellite");
      bnd.setVisible(P.layers.boundary && !wmsFailed);
      for (const l of [area, line, pin, label]) l.setVisible(P.layers.features);
      if (!P.layers.features) hideTip();
      placePop();
    };

    // 배경지도 실패 → 알림(처음 6장 연속 실패, 또는 실패가 성공의 2배를 넘을 때). 대체 지도로 바꾸지 않는다(개발서버)
    const onTileErr = () => {
      tileErr += 1;
      if (!broken && ((tileOk === 0 && tileErr >= 6) || (tileErr >= 20 && tileErr > tileOk * 2))) {
        broken = true;
        setTilesBroken(true);
      }
    };
    // 위성 실패 → 일반지도로 (처음 6장 연속 실패, 또는 실패가 성공의 2배를 넘을 때). 되돌릴 길(onBasemap)이 없으면 배경지도 실패로 센다
    const onSatErr = () => {
      const P = propsRef.current;
      if (!P.onBasemap) return onTileErr();
      if (satGaveUp || P.basemap !== "Satellite") return;
      satErr += 1;
      if ((satOk === 0 && satErr >= 6) || (satErr >= 20 && satErr > satOk * 2)) {
        satGaveUp = true;
        setSatFailed(true);
        P.onBasemap("Base");
      }
    };
    const onTileOk = () => {
      tileOk += 1;
      if (broken) {
        broken = false;
        tileErr = 0;
        setTilesBroken(false);
      }
    };
    base.getSource()?.on("tileloaderror", onTileErr);
    base.getSource()?.on("tileloadend", onTileOk);
    sat.getSource()?.on("tileloaderror", onSatErr);
    sat.getSource()?.on("tileloadend", () => {
      satOk += 1;
      onTileOk();
    });
    // 행정경계 실패 → 숨김 (VWorld 는 키 오류도 HTTP 200 + XML 이라 이미지 오류로 잡힌다)
    wms.on("tileloadend", () => {
      wmsOk += 1;
    });
    wms.on("tileloaderror", () => {
      wmsErr += 1;
      // 배경지도(타일)는 멀쩡하고 행정경계만 못 받은 경우 — 배경지도 고장과 따로 알린다(개발 서버 boundaryStatus failed)
      if ((wmsOk === 0 && wmsErr >= 4) || (wmsErr >= 12 && wmsErr > wmsOk)) bndStop("failed");
    });

    // ── 범위 맞춤
    let waitUntil = 0; // 대상 도형이 아직 없음 → 오면 다시 맞춤
    let waitSize = false; // 지도가 숨겨져 크기가 0 → 보이면 다시 맞춤
    /**
     * 사람이 지도를 움직였는가(끌기·휠·확대 단추). 움직인 뒤에는 새 답이 와도 다시 잡지 않는다 — 핀을 확대해 보던 사람이
     * 답이 올 때마다 처음 자리로 끌려가면 읽고 있는 것을 빼앗는 셈이다(개발 서버 moved). 답(scope)이 바뀌면 푼다.
     */
    let moved = false;
    /** 마지막으로 맞춘 대상 묶음(열쇠를 이은 글자) — 같은 것이 다시 와도 다시 잡지 않는다 */
    let fitted: string | null = null;
    const sizeOk = () => {
      const size = m.getSize();
      if (!size || size[0] < 8 || size[1] < 8) {
        waitSize = true;
        return null;
      }
      return size;
    };
    /** 범위로 맞춤 — maxZoom 은 한 건 확대(정밀도 규칙)·여럿(16) */
    const fitExt = (ext: number[], maxZoom: number, duration: number, done?: () => void): boolean => {
      const size = sizeOk();
      if (!size || isEmptyExtent(ext)) return false;
      const pad = Math.round(Math.max(16, Math.min(56, Math.min(size[0], size[1]) * 0.12)));
      const v = m.getView();
      v.cancelAnimations();
      v.fit(ext, {
        padding: [pad + 36, pad, pad, pad], // 위쪽은 핀 높이만큼 더
        maxZoom,
        duration: duration || undefined, // 0 이면 즉시
        callback: done ? (ok) => { if (ok) done(); } : undefined,
      });
      return true;
    };
    /**
     * 한 대상으로 옮겨 감 — 얼마나 당길지는 좌표의 정밀도가 정한다(lib/mapRef focusZoomOf, 개발 서버 moveTo).
     * 점: 정확하면 지금 배율이 더 가까울 때 그대로, 근사(dong_center 14 · sigungu_center 11)면 그 칸까지 물러난다. 선·면: 범위로, 최대 그 칸.
     */
    const moveTo = (fs: Feature[], duration: number, done?: () => void): boolean => {
      const r = recs.get(fs[0]);
      if (!r || !sizeOk()) return false;
      const v = m.getView();
      if (r.kind === "point") {
        v.cancelAnimations();
        v.animate({ center: r.anchor.getCoordinates(), zoom: pointZoom(r.mf.precision, v.getZoom() ?? 0), duration: duration || 0 }, (ok) => { if (ok && done) done(); });
        return true;
      }
      const ext = createEmpty();
      for (const f of fs) {
        const g = f.getGeometry();
        if (g) extendExtent(ext, g.getExtent());
      }
      return fitExt(ext, focusZoomOf(r.mf.precision), duration, done);
    };
    /** 이 작업(없으면 전체)의 그릴 대상 — 열쇠별 도형 */
    const jobGroups = (keep: (r: Rec) => boolean = () => true): Feature[][] => {
      const P = propsRef.current;
      const out: Feature[][] = [];
      byKey.forEach((arr) => {
        const r = recs.get(arr[0]);
        if (r && (!P.activeJobId || r.mf.jobId === P.activeJobId) && shownRec(r) && keep(r)) out.push(arr);
      });
      return out;
    };
    /** 여럿에 맞춤 — 무리에서 멀리 떨어진 것(바다 위 좌표 등)은 맞출 범위에서만 뺀다(lib/mapRef coreIndices), 최대 16 */
    const fitCore = (groups: Feature[][], duration: number): boolean => {
      if (!groups.length) return false;
      const at = groups.map((g) => toLonLat(recs.get(g[0])!.anchor.getCoordinates()) as [number, number]);
      const ext = createEmpty();
      for (const i of coreIndices(at)) for (const f of groups[i]) {
        const g = f.getGeometry();
        if (g) extendExtent(ext, g.getExtent());
      }
      return fitExt(ext, 16, duration);
    };
    const sigOf = (groups: Feature[][]) => groups.map((g) => recs.get(g[0])?.mf.key ?? "").join("|");
    /** 답이 바뀌어 대상이 새로 온 때만, 그리고 사람이 지도를 움직이기 전에만 맞춘다. 요약 보기 중에는 색칠한 시군구 쪽이 범위를 잡는다 */
    const autoFit = (duration: number) => {
      const P = propsRef.current;
      if (moved || P.summaryOn || waitUntil > Date.now()) return;
      const groups = jobGroups();
      const sig = sigOf(groups);
      if (!groups.length || sig === fitted) return;
      if (fitCore(groups, duration)) fitted = sig;
    };
    const focus = (duration: number) => {
      const P = propsRef.current;
      let ok = false;
      let wait = false;
      const sel = P.selectedKey ? byKey.get(P.selectedKey) : undefined;
      if (sel?.length) {
        ok = moveTo(sel, duration, panPop);
        // 사람이 고른 자리다 — 다음 답이 와도 빼앗지 않는다
        if (ok) {
          moved = true;
          setNearKey(P.selectedKey ?? null);
        }
      } else {
        if (P.selectedKey) wait = true; // 선택 대상 도형이 아직 오지 않음
        const groups = jobGroups();
        ok = fitCore(groups, duration);
        if (ok) fitted = sigOf(groups);
      }
      waitUntil = !ok || wait ? Date.now() + FOCUS_WAIT_MS : 0;
    };
    let lastFilter: string | null = P0.filter ?? null;
    const applyFilter = () => {
      const f = propsRef.current.filter ?? null;
      if (f === lastFilter) return;
      lastFilter = f;
      restyle();
      hideTip();
      // 거른 종류(없으면 이 작업 전체) 범위로 맞춤
      const groups = jobGroups((r) => matchFilter(f, r.look));
      if (groups.length) fitCore(groups, 450);
      recluster();
    };
    const toRegion = () => {
      const r = REGIONS[propsRef.current.region] ?? REGIONS.national;
      // 기준지역을 옮기면 그 지역 경계를 다시 받는다(개발서버 adminCode 가 바뀌면 loading)
      if (bndState === "ok") setBndState("loading");
      waitUntil = 0;
      waitSize = false;
      const v = m.getView();
      v.cancelAnimations();
      v.animate({ center: fromLonLat(r.center), zoom: r.zoom, duration: 450 });
    };
    /**
     * 기준지역 행정경계로 맞춤 — 개발서버는 기준지역을 바꾸면 그 경계를 받아 fitRegion 한다(MapPane).
     * 우리 경계는 WMS 타일이라 모양이 없어, 요약 보기가 쓰는 시·군·구 경계(/api/map/sigungu)를 받아 범위를 잡는다.
     * 먼 섬 조각(가장 큰 덩어리의 5% 미만)은 범위에서 뺀다. 못 받으면 시범 지역 중심(toRegion)으로.
     */
    const toBase = (code: string, onlyIfEmpty = false) => {
      const sido = code.slice(0, 2);
      if (!/^\d{2}$/.test(sido)) return toRegion();
      void sigunguShapes(sido).then((list) => {
        if (propsRef.current.baseCode !== code) return;
        // 위치 없는 답이라 경계로 돌아가려던 참에 그 답의 대상이 그려졌으면 그대로 둔다
        const P = propsRef.current;
        if (onlyIfEmpty && P.features.some((f) => f.jobId === P.activeJobId)) return;
        const pick = code.length >= 5 ? (list ?? []).filter((x) => x.code.startsWith(code.slice(0, 5))) : (list ?? []);
        if (!pick.length) return toRegion();
        const fmt = new GeoJSON();
        const polys: Polygon[] = [];
        for (const x of pick) {
          const g = fmt.readGeometry(x.geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
          if (g instanceof MultiPolygon) polys.push(...g.getPolygons());
          else if (g instanceof Polygon) polys.push(g);
        }
        const big = Math.max(0, ...polys.map((q) => q.getArea()));
        const ext = createEmpty();
        for (const q of polys) if (q.getArea() >= big * 0.05) extendExtent(ext, q.getExtent());
        if (bndState === "ok") setBndState("loading");
        waitUntil = 0;
        waitSize = false;
        if (!fitExt(ext, 13, 450)) toRegion();
      });
    };
    const zoomTo = (key: string) => {
      const fs = byKey.get(key);
      if (fs?.length && moveTo(fs, 450, panPop)) {
        moved = true;
        setNearKey(key);
      }
    };
    /** 말풍선 「전체 보기」 — 지금 그리는 대상 전체가 들어오게 물러난다(개발서버 allBounds). 사람이 고른 자리로 두어 다음 답이 빼앗지 않는다 */
    const fitAll = () => {
      const groups = jobGroups();
      if (groups.length && fitCore(groups, 450)) {
        moved = true;
        setNearKey(null);
      }
    };

    /**
     * 점 묶기(개발 서버 recluster) — 화면에서 56px 안에 겹치는 핀을 개수 원 하나로. 줌을 바꿀 때마다 다시 묶고, 16줌부터 모두 낱개.
     * 고른 것·집은 것은 묶지 않는다(사람이 찾는 그 한 곳이 숨으면 안 된다). 선·면은 그 위에 선 대표 핀만 묶이고 도형은 그대로.
     */
    let lastRes = 0;
    const recluster = () => {
      const P = propsRef.current;
      const v = m.getView();
      const res = v.getResolution() ?? 0;
      lastRes = res;
      const had = clustered.size > 0;
      clustered.clear();
      clSrc.clear(true);
      if (res > 0 && (v.getZoom() ?? 0) < CLUSTER_UNTIL_ZOOM && !P.summaryOn && P.layers.features) {
        const free: { key: string; c: number[] }[] = [];
        byKey.forEach((fs, key) => {
          const r = recs.get(fs[0]);
          if (!r || !shownRec(r) || key === P.selectedKey || heldRec(r)) return;
          if (r.kind !== "point" && !anchorPinned(r, stateOf(r), res)) return;
          free.push({ key, c: r.anchor.getCoordinates() });
        });
        for (const g of clusterPoints(free.map((p) => ({ x: p.c[0] / res, y: p.c[1] / res })))) {
          if (g.length < 2) continue;
          const ext = createEmpty();
          for (const i of g) {
            clustered.add(free[i].key);
            extendExtent(ext, [free[i].c[0], free[i].c[1], free[i].c[0], free[i].c[1]]);
          }
          const f = new Feature({ geometry: new Point(getCenter(ext)) });
          f.set("n", g.length);
          f.set("ext", ext);
          clSrc.addFeature(f);
        }
      }
      if (had || clustered.size) src.changed();
    };
    m.on("moveend", () => {
      if ((m.getView().getResolution() ?? 0) !== lastRes) recluster();
    });

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
      // 답이 바뀌면 「가까이 보는 중」을 푼다(개발서버 layers.objects → setNearId(null))
      setNearKey(null);
      src.clear(true);
      src.addFeatures(all);
      if (hoverKey && !next.has(hoverKey)) hoverKey = null;
      if (tipKey && !next.has(tipKey)) hideTip();
      placePop();
      // 볼 것이 없어지면(새 대화·새 브리핑) 다시 잡아도 되는 상태로
      if (!next.size) {
        moved = false;
        fitted = null;
      }
      if (waitUntil > Date.now()) focus(450);
      else autoFit(0);
      recluster();
    };
    /** 답이 바뀜(scope) · 요약 보기 켜고 끔 · 요약에서 고른 구 — 사람이 옮긴 자리를 놓고 새로 맞춘다 */
    const refit = () => {
      moved = false;
      fitted = null;
      setNearKey(null);
      restyle();
      autoFit(0);
      recluster();
    };

    // ── 마우스: 호버 툴팁 · 클릭 선택(객체 참조 중에는 집기) · 묶음 확대
    const hitRec = (pixel: number[]): Rec | undefined =>
      m.forEachFeatureAtPixel(pixel, (f) => recs.get(f), { hitTolerance: 4, layerFilter: (l) => vecSet.has(l) });
    const hitCluster = (pixel: number[]): Feature | undefined =>
      m.forEachFeatureAtPixel(pixel, (f) => f as Feature, { hitTolerance: 2, layerFilter: (l) => l === clLayer });
    m.on("pointermove", (e) => {
      if (e.dragging || !propsRef.current.layers.features) {
        if (tipKey) hideTip();
        return;
      }
      if (hitCluster(e.pixel)) {
        target.style.cursor = "pointer";
        if (tipKey) hideTip();
        return;
      }
      const r = hitRec(e.pixel);
      const k = r?.mf.key ?? null;
      if (k !== hoverKey) {
        hoverKey = k;
        restyle();
      }
      target.style.cursor = r ? (propsRef.current.picking ? "copy" : "pointer") : "";
      // 말풍선이 열린 대상에는 툴팁을 겹쳐 띄우지 않는다
      if (r && !(r.mf.key === propsRef.current.selectedKey && pop.getPosition())) showTip(r, e.coordinate);
      else if (tipKey) hideTip();
    });
    // 사람이 지도를 움직이면(끌기·휠·확대 단추·묶음 확대) 「가까이 보는 중」을 푼다(개발서버 onMove → setNearId(null))
    m.on("pointerdrag", () => {
      moved = true;
      setNearKey(null);
    });
    m.on("singleclick", (e) => {
      const P = propsRef.current;
      if (!P.layers.features) return;
      const cl = hitCluster(e.pixel);
      if (cl) {
        // 묶음 — 그 점들이 다 보이게 확대(한 자리에 포개진 것이면 두 칸 당김, 최대 16)
        const ext = cl.get("ext") as number[];
        const v = m.getView();
        if (getWidth(ext) === 0 && getHeight(ext) === 0) v.animate({ center: getCenter(ext), zoom: Math.min((v.getZoom() ?? 0) + 2, CLUSTER_UNTIL_ZOOM), duration: 300 });
        else fitExt(ext, CLUSTER_UNTIL_ZOOM, 300);
        moved = true;
        setNearKey(null);
        return;
      }
      const r = hitRec(e.pixel);
      if (r) {
        hideTip();
        // 객체 참조 중 — 누르기 = 집기(놓기). 상세·말풍선은 열지 않는다
        if (P.picking) return P.onTogglePick?.(r.mf);
        if (r.mf.key === P.selectedKey) {
          // 이미 고른 대상 — 닫아 둔 말풍선만 다시 연다
          closedRef.current = null;
          setClosedKey(null);
          placePop(true);
        } else {
          // 누른 핀을 지도 가운데로 — 배율은 그대로(보던 넓이를 빼앗지 않는다, 개발 서버 pick)
          const v = m.getView();
          v.cancelAnimations();
          v.animate({ center: r.anchor.getCoordinates(), duration: 250 });
          moved = true;
          P.onSelect?.(r.mf.key);
        }
      } else if (P.selectedKey && pop.getPosition()) {
        // 빈 곳을 누르면 말풍선만 닫는다 (선택 강조는 그대로)
        closedRef.current = P.selectedKey;
        setClosedKey(P.selectedKey);
        pop.setPosition(undefined);
      }
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
    const onWheel = () => {
      moved = true;
      setNearKey(null);
    };
    vp.addEventListener("pointerleave", onLeave);
    vp.addEventListener("wheel", onWheel, { passive: true });

    // 외부 확대/축소 버튼 (zoomBy)
    const onZoom = (ev: Event) => {
      const v = m.getView();
      moved = true;
      setNearKey(null);
      v.animate({ zoom: (v.getZoom() ?? 10) + Number((ev as CustomEvent<number>).detail || 0), duration: 200 });
    };
    window.addEventListener("sa-map-zoom", onZoom);
    // ── 자동 시연(R54 · lib/autoDemoMap) — 캔버스에 그린 묶음·점·구 이름표가 화면 어디에 있는지 알려 주고, 그 자리 누르기를 받는다
    const onDemoFind = (ev: Event) => {
      const { q, box } = (ev as CustomEvent<{ q: MapQuery; box: { hit: MapHit | null } }>).detail;
      if (box.hit) return;
      const size = m.getSize();
      const rect = m.getViewport().getBoundingClientRect();
      if (!size || rect.width === 0) return;
      const inView = (px: number[] | null | undefined): px is number[] => !!px && px[0] >= 8 && px[1] >= 8 && px[0] <= size[0] - 8 && px[1] <= size[1] - 8;
      const at = (px: number[], s: number, name: string): MapHit => ({ x: rect.left + px[0], y: rect.top + px[1], size: s, name });
      if (q.kind === "cluster") {
        let best: { px: number[]; n: number } | null = null;
        for (const f of clSrc.getFeatures()) {
          const g = f.getGeometry() as Point | undefined;
          const px = g ? m.getPixelFromCoordinate(g.getCoordinates()) : null;
          const n = Number(f.get("n")) || 0;
          if (inView(px) && (!best || n > best.n)) best = { px, n };
        }
        if (best) box.hit = at(best.px, 44, String(best.n));
        return;
      }
      if (q.kind === "pin") {
        const P = propsRef.current;
        if (!P.layers.features || P.summaryOn) return;
        for (const f of src.getFeatures()) {
          const r = recs.get(f);
          if (!r || !r.primary || !shownRec(r) || clustered.has(r.mf.key) || (q.exact && r.approx)) continue;
          const name = nameOf(r) ?? "";
          if (q.text && !name.includes(q.text) && !(r.mf.displayName ?? "").includes(q.text)) continue;
          const px = m.getPixelFromCoordinate(r.anchor.getCoordinates());
          if (inView(px)) {
            box.hit = at(px, 36, r.mf.displayName ?? name);
            return;
          }
        }
        return;
      }
      // 요약 보기의 구 이름표(MapSummary 가 얹은 겹 — 이름·곳 수·이름표 자리를 단 구 도형)
      for (const l of m.getLayers().getArray()) {
        if (!(l instanceof VectorLayer) || !l.getVisible()) continue;
        for (const f of (l.getSource() as VectorSource | null)?.getFeatures() ?? []) {
          const label = f.get("label") as Point | undefined;
          const name = f.get("name");
          if (!label || typeof name !== "string" || !(Number(f.get("n")) > 0) || (q.text && !name.includes(q.text))) continue;
          const px = m.getPixelFromCoordinate(label.getCoordinates());
          if (inView(px)) {
            box.hit = at(px, 40, name);
            return;
          }
        }
      }
    };
    const onDemoClick = (ev: Event) => {
      const { x, y } = (ev as CustomEvent<{ x: number; y: number }>).detail;
      const rect = m.getViewport().getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      const pe = new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true });
      m.dispatchEvent(new MapBrowserEvent("singleclick", m, pe));
    };
    window.addEventListener(MAP_FIND_EVENT, onDemoFind);
    window.addEventListener(MAP_CLICK_EVENT, onDemoClick);
    const ro = new ResizeObserver(() => {
      m.updateSize();
      const s = m.getSize();
      if (waitSize && s && s[0] >= 8 && s[1] >= 8) {
        waitSize = false;
        if (propsRef.current.focusToken !== undefined || waitUntil > Date.now()) focus(0);
        else autoFit(0);
      }
    });
    ro.observe(target);

    api.current = {
      applyLayers: () => {
        applyLayers();
        recluster();
      },
      setFeatures,
      restyle: () => {
        restyle();
        recluster();
        placePop();
      },
      focus,
      toRegion,
      toBase,
      applyFilter,
      placePop,
      zoomTo,
      fitAll,
      refit,
    };
    P0.onMap?.(m);
    // 경계 받는 중 → 그 화면의 타일이 다 그려지면 받음
    m.on("rendercomplete", () => {
      if (bndState === "loading") setBndState("ok");
    });
    applyLayers();
    setPopEl(popBox);
    setReady(true);
    // [글자 크기]를 바꾸면 캔버스 이름표·묶음 숫자를 새 크기로 다시 그린다(R58)
    const offScale = onScaleChange(() => {
      label.changed();
      clLayer.changed();
    });

    return () => {
      offScale();
      ro.disconnect();
      window.removeEventListener("sa-map-zoom", onZoom);
      window.removeEventListener(MAP_FIND_EVENT, onDemoFind);
      window.removeEventListener(MAP_CLICK_EVENT, onDemoClick);
      vp.removeEventListener("pointerleave", onLeave);
      vp.removeEventListener("wheel", onWheel);
      propsRef.current.onMap?.(null);
      m.setTarget(undefined);
      m.dispose();
      api.current = null;
      focusSeen.current = null;
      areaSeen.current = null;
      setPopEl(null);
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

  // 작업 강조 · 선택 · 집기 · 끈 갈래 · 지역 이름(이름표 글)
  useEffect(() => {
    api.current?.restyle();
  }, [p.activeJobId, p.selectedKey, p.pickedIds, p.adminNames, ready]);

  // 답이 바뀜 · 요약 보기 켜고 끔 · 요약에서 고른 구 → 사람이 옮긴 자리를 놓고 새로 맞춤(개발 서버 scope·onSummary·onRegion)
  const refitSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const k = `${p.scope ?? ""}|${p.summaryOn ? 1 : 0}|${p.areaIds ? [...p.areaIds].join(",") : ""}`;
    if (refitSeen.current === null) {
      refitSeen.current = k;
      return;
    }
    if (refitSeen.current === k) return;
    refitSeen.current = k;
    api.current?.refit();
  }, [p.scope, p.summaryOn, p.areaIds, ready]);

  // 범례 거르기
  useEffect(() => {
    api.current?.applyFilter();
  }, [p.filter, ready]);

  // 말풍선 닫기·다시 열기
  useEffect(() => {
    api.current?.placePop();
  }, [closedKey, ready]);

  // focusToken → 선택 대상(있으면) 또는 이 작업 대상 범위로 맞춤. 처음 붙을 때는 애니메이션 없이.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const first = focusSeen.current === null;
    if (!first && focusSeen.current?.token === p.focusToken) return;
    focusSeen.current = { token: p.focusToken };
    if (p.focusToken === undefined) return;
    // 같은 대상을 다시 보여 달라고 하면 닫아 둔 말풍선도 다시 연다
    closedRef.current = null;
    setClosedKey(null);
    a.placePop();
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

  // 기준지역이 바뀌면 그 행정경계로 맞춘다(개발서버 MapPane — 경계를 받으면 fitRegion). 처음 열 때는 답이 없을 때만
  const baseSeen = useRef<string | undefined | null>(null);
  useEffect(() => {
    const a = api.current;
    if (!a || p.baseCode === undefined) return;
    const first = baseSeen.current === null;
    if (!first && baseSeen.current === p.baseCode) return;
    baseSeen.current = p.baseCode;
    if (first && p.features.length) return;
    a.toBase(p.baseCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.baseCode, ready]);

  // 지금 답에 지도에 그릴 대상이 하나도 없으면 기준지역 경계로 돌아간다 — 앞 답에서 당겨 둔 화면(산속 침수흔적 등)이
  // 이 답과 상관없이 남아 있었다(11/19 대전 녹화 검수). 답마다 한 번만.
  const emptySeen = useRef<string | null>(null);
  useEffect(() => {
    const a = api.current;
    const j = p.activeJobId;
    if (!a || !j || p.resultStatus || !p.baseCode || emptySeen.current === j) return;
    emptySeen.current = j;
    if (p.features.some((f) => f.jobId === j)) return;
    a.toBase(p.baseCode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.activeJobId, p.resultStatus, ready]);

  const selFeature = p.selectedKey ? p.features.find((f) => f.key === p.selectedKey) : undefined;
  const satOn = p.basemap === "Satellite";
  // 집는 중·요약 보기 중에는 말풍선을 띄우지 않는다(개발 서버)
  const popOpen = !!selFeature && closedKey !== selFeature.key && p.layers.features && !p.picking && !p.summaryOn;

  // 말풍선 대상의 상세 유무 — 없으면 「상세 보기」를 회색으로(개발 서버 사용자 지시 49)
  const [detail, setDetail] = useState<{ key: string; v: "checking" | "yes" | "no" } | null>(null);
  const detailOf = p.detailOf;
  const popKey = popOpen ? selFeature?.key : undefined;
  useEffect(() => {
    if (!popKey || !detailOf || !selFeature) return;
    let alive = true;
    setDetail({ key: popKey, v: "checking" });
    detailOf(selFeature)
      .then((ok) => alive && setDetail({ key: popKey, v: ok ? "yes" : "no" }))
      .catch(() => alive && setDetail({ key: popKey, v: "no" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popKey, detailOf]);

  const basemapFailed = tilesBroken || bnd === "nokey";
  return (
    <>
      {/* 개발서버 MapPane(설계 슬라이드 58·59) — 알림은 지도 영역 맨 위, 범례 띠 위에 흐름대로 */}
      {p.resultStatus === "failed" && <Notice title="조회결과 위치를 불러오지 못했습니다.">잠시 후 같은 질문을 다시 보내세요.</Notice>}
      {basemapFailed && <Notice title="배경지도를 불러오지 못했습니다.">잠시 후 다시 확인하세요.</Notice>}
      {/* 배경지도(타일)는 멀쩡하고 행정경계만 못 받은 경우 */}
      {!basemapFailed && bnd === "failed" && <Notice title="행정경계를 불러오지 못했습니다.">배경지도와 표식은 그대로 볼 수 있습니다.</Notice>}
      {!basemapFailed && bnd === "denied" && (
        <Notice title="이 지역의 행정경계는 볼 수 없습니다.">로그인한 계정의 기준지역 밖이라 서버가 경계를 주지 않습니다. 배경지도와 표식은 그대로 볼 수 있습니다.</Notice>
      )}
      {satFailed && <Notice title="위성지도를 불러오지 못해 일반지도로 돌아왔습니다.">잠시 후 다시 확인하세요.</Notice>}
      {p.top}
      <div className="mapwrap">
        <div className="sa-map olmap" role="region" aria-label="지도">
          <div ref={el} className="sa-map-canvas" />
          {/* 설계 슬라이드 57 — 로딩 표출 */}
          {((bnd === "loading" && p.layers.boundary) || p.resultStatus === "loading") && <p className="sa-map-loading" role="status">지도를 불러오는 중입니다…</p>}
          {p.children}
          {/* 설계 6·7 확대·축소 — 맨 위는 위성 단추(한 칸 떼어 둠, 개발서버 .map-zoom .map-sat) */}
          <div className="map-zoom">
            {p.onBasemap && (
              <button
                type="button"
                className={`map-sat${satOn ? " is-on" : ""}`}
                aria-pressed={satOn}
                aria-label={satOn ? "일반지도로 보기" : "위성지도로 보기"}
                title={satOn ? "일반지도로 보기" : "위성지도로 보기"}
                onClick={() => {
                  setSatFailed(false);
                  p.onBasemap?.(satOn ? "Base" : "Satellite");
                }}
              >
                <SatIcon />
              </button>
            )}
            <button type="button" aria-label="확대" onClick={() => zoomBy(1)}>+</button>
            <button type="button" aria-label="축소" onClick={() => zoomBy(-1)}>−</button>
          </div>
          {popEl && popOpen && selFeature && createPortal(
            <MapPopup
              key={selFeature.key}
              f={selFeature}
              other={!!p.activeJobId && selFeature.jobId !== p.activeJobId}
              filter={p.filter ?? null}
              onClose={() => setClosedKey(selFeature.key)}
              onLocate={p.onLocate ? () => p.onLocate?.(selFeature) : undefined}
              // 「같은 종류만」은 뺐다(개발서버 e9f6fd2 — 범례 거르기와 겹치고, 같은 종류뿐이면 변화가 없어 고장처럼 보였다)
              zoomOut={nearKey === selFeature.key}
              onZoom={() => (nearKey === selFeature.key ? api.current?.fitAll() : api.current?.zoomTo(selFeature.key))}
              onDetail={p.onDetail && p.detailOf ? () => p.onDetail?.(selFeature) : undefined}
              detail={detail?.key === selFeature.key ? detail.v : "checking"}
            />,
            popEl,
          )}
        </div>
      </div>
      <MapAlt features={p.features} activeJobId={p.activeJobId ?? null} selectedKey={p.selectedKey ?? null} missing={p.missing ?? 0} missingItems={p.missingItems ?? []} onSelect={p.onSelect} />
    </>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sa-map-notice" role="status">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

/**
 * 지도 대체정보(개발 서버 MapAlt · 설계 ⑧) — 눈으로는 보이지 않지만 실제로 쓸 수 있는 목록이다. 누르면 그 대상이 지도에서도 선택된다.
 * 도형을 못 받은 수도 적고(「N건은 공간정보가 없어 표시하지 못했습니다」), 그 대상도 목록 끝에 「· 공간정보 없음」으로 둔다(개발서버 MapPane MapAlt, R60).
 */
function MapAlt({ features, activeJobId, selectedKey, missing, missingItems, onSelect }: { features: MapFeature[]; activeJobId: string | null; selectedKey: string | null; missing: number; missingItems: MissingItem[]; onSelect?: (key: string) => void }) {
  const list = activeJobId ? features.filter((f) => f.jobId === activeJobId) : features;
  const lost = activeJobId ? missingItems.filter((m) => m.jobId === activeJobId) : missingItems;
  return (
    <div className="sa-map-sr">
      <h3>지도 대체정보</h3>
      <p>지도에 초점이 있으면 방향키로 이동하고, 확대·축소 버튼으로 배율을 바꿉니다. 아래 목록에서 대상을 고르면 지도에서도 같은 대상이 선택됩니다.</p>
      {list.length + missing === 0 ? (
        <p>지도에 표시된 조회결과가 없습니다. 기준지역 경계만 보입니다.</p>
      ) : (
        <>
          <p>
            조회결과 {list.length + missing}건 가운데 {list.length}건을 지도에 표시했습니다.
            {missing > 0 && ` ${missing}건은 공간정보가 없어 표시하지 못했습니다.`}
          </p>
          <ul>
            {list.map((f) => (
              <li key={f.key}>
                <button type="button" aria-current={f.key === selectedKey} onClick={() => onSelect?.(f.key)}>{f.displayName ?? f.ref}</button>
                {` — ${SYMBOL_NAMES[symbolOf(f.entityType)]}${precisionKo(f.precision) ? ` · ${precisionKo(f.precision)}` : ""}`}
              </li>
            ))}
            {lost.map((m) => (
              <li key={m.key}>
                {m.name}
                {` — ${SYMBOL_NAMES[symbolOf(m.entityType)]} · 공간정보 없음`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 외부 확대/축소 버튼용 — window 이벤트로 MapView 에 전달 */
export function zoomBy(delta: number) {
  window.dispatchEvent(new CustomEvent("sa-map-zoom", { detail: delta }));
}
