"use client";
import { useEffect, useRef, useState } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Overlay from "ol/Overlay";
import { fromLonLat, transformExtent } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style, Text, RegularShape } from "ol/style";
import { defaults as defaultControls, ScaleLine } from "ol/control";
import type { FeatureLike } from "ol/Feature";
import type { EntityRef, RegionId } from "@/lib/contract/agent";
import { REGIONS, catStyle } from "@/lib/config";

const VW_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? "";

export type Basemap = "Base" | "Satellite" | "gray";
export interface LayerState {
  admin: boolean;
  emd: boolean;
  rivers: boolean;
  riverArea: boolean;
  smallRiver: boolean;
  points: boolean;
}
export const DEFAULT_LAYERS: LayerState = { admin: true, emd: false, rivers: true, riverArea: true, smallRiver: false, points: true };

interface Props {
  region: RegionId;
  points: EntityRef[];
  highlightIds?: string[];
  selectedId?: string | null;
  riverHighlight?: string[];
  layers: LayerState;
  basemap: Basemap;
  focusToken?: number; // 변경 시 points/선택 범위로 이동
  onSelect?: (e: EntityRef) => void;
  onTileStatus?: (s: "vworld" | "osm") => void;
}

const geo = new GeoJSON({ featureProjection: "EPSG:3857" });
async function loadGeo(url: string) {
  const r = await fetch(url);
  return geo.readFeatures(await r.json());
}

function pointStyle(f: FeatureLike, res: number, hl: Set<string>, sel: string | null | undefined) {
  const cat = f.get("category") as string;
  const id = f.get("id") as string;
  const { color } = catStyle(cat);
  const isSel = sel === id;
  const isHl = hl.has(id);
  const big = isSel || isHl;
  const shape =
    cat === "지하차도"
      ? new RegularShape({ points: 3, radius: big ? 11 : 8, rotation: Math.PI, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) })
      : cat === "재난사건"
        ? new RegularShape({ points: 4, radius: big ? 12 : 9, angle: Math.PI / 4, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) })
        : new CircleStyle({ radius: big ? 10 : 7, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) });
  const showLabel = big || res < 12;
  const styles = [
    new Style({
      image: shape,
      zIndex: big ? 100 : 10,
      text: showLabel
        ? new Text({
            text: (f.get("name") as string) + (f.get("tag") ? `\n${f.get("tag")}` : ""),
            font: `${big ? 700 : 600} 12px Pretendard, sans-serif`,
            offsetY: big ? -28 : -22,
            fill: new Fill({ color: big ? "#fff" : "#1e2124" }),
            backgroundFill: new Fill({ color: big ? "#063a74" : "rgba(255,255,255,.94)" }),
            backgroundStroke: new Stroke({ color: big ? "#063a74" : color, width: 1 }),
            padding: [3, 6, 2, 6],
            textBaseline: "bottom",
          })
        : undefined,
    }),
  ];
  if (isSel) styles.unshift(new Style({ image: new CircleStyle({ radius: 20, fill: new Fill({ color: "rgba(37,110,244,.18)" }), stroke: new Stroke({ color: "#256ef4", width: 2 }) }) }));
  return styles;
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<OlMap | null>(null);
  const L = useRef<Record<string, VectorLayer<VectorSource> | TileLayer<XYZ | OSM>>>({});
  const ptSrc = useRef(new VectorSource());
  const tipEl = useRef<HTMLDivElement>(null);
  const tipOv = useRef<Overlay | null>(null);
  const pulses = useRef<Overlay[]>([]);
  const propsRef = useRef(p);
  propsRef.current = p;
  const [ready, setReady] = useState(false);
  const tileErr = useRef(0);

  // 초기화
  useEffect(() => {
    if (!el.current) return;
    const r = REGIONS[p.region];
    const vw = (layer: string, ext: string) =>
      new XYZ({ url: `https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/${layer}/{z}/{y}/{x}.${ext}`, crossOrigin: "anonymous", maxZoom: 19 });
    const base = new TileLayer({ source: vw("Base", "png"), properties: { name: "base" } });
    if (!VW_KEY) tileErr.current = 5; // 키 미설정 → 첫 오류에서 OSM 폴백
    const sat = new TileLayer({ source: vw("Satellite", "jpeg"), visible: false });
    const hyb = new TileLayer({ source: vw("Hybrid", "png"), visible: false });
    const osm = new TileLayer({ source: new OSM(), visible: false });
    const onErr = () => {
      tileErr.current += 1;
      if (tileErr.current === 6) {
        // VWorld 키 도메인 미등록 등 → OSM 폴백
        base.setVisible(false);
        sat.setVisible(false);
        hyb.setVisible(false);
        osm.setVisible(true);
        propsRef.current.onTileStatus?.("osm");
      }
    };
    base.getSource()!.on("tileloaderror", onErr);
    sat.getSource()!.on("tileloaderror", onErr);

    const admin = new VectorLayer({
      source: new VectorSource(),
      style: (f) =>
        new Style({
          stroke: new Stroke({ color: "#063a74", width: 1.6, lineDash: [6, 4] }),
          fill: new Fill({ color: "rgba(23,34,59,0.02)" }),
          text: new Text({ text: f.get("sigungu"), font: "700 13px Pretendard, sans-serif", fill: new Fill({ color: "#063a74" }), stroke: new Stroke({ color: "#fff", width: 3.5 }), overflow: true }),
        }),
      zIndex: 3,
    });
    const emd = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      minZoom: 11.5,
      style: (f) =>
        new Style({
          stroke: new Stroke({ color: "rgba(70,76,83,.55)", width: 0.8 }),
          text: new Text({ text: f.get("emd"), font: "500 11px Pretendard, sans-serif", fill: new Fill({ color: "#464c53" }), stroke: new Stroke({ color: "#fff", width: 3 }) }),
        }),
      zIndex: 2,
    });
    const riverArea = new VectorLayer({
      source: new VectorSource(),
      style: (f) => {
        const hl = propsRef.current.riverHighlight?.includes(f.get("riverId"));
        return new Style({ fill: new Fill({ color: hl ? "rgba(37,110,244,.55)" : "rgba(64,150,230,.32)" }), stroke: new Stroke({ color: hl ? "#0b50d0" : "rgba(30,120,210,.5)", width: hl ? 1.5 : 0.6 }) });
      },
      zIndex: 4,
    });
    const smallRiver = new VectorLayer({
      source: new VectorSource(),
      visible: false,
      style: new Style({ fill: new Fill({ color: "rgba(15,157,138,.25)" }), stroke: new Stroke({ color: "#0f9d8a", width: 0.8 }) }),
      zIndex: 4,
    });
    const rivers = new VectorLayer({
      source: new VectorSource(),
      style: (f, res) => {
        const hl = propsRef.current.riverHighlight?.includes(f.get("riverId"));
        const g = f.get("grade") as string;
        const w = hl ? 6 : g === "국가하천" ? 3 : g === "지방하천" ? 2 : 1.2;
        return [
          ...(hl ? [new Style({ stroke: new Stroke({ color: "rgba(37,110,244,.25)", width: 14 }) })] : []),
          new Style({
            stroke: new Stroke({ color: hl ? "#0b50d0" : "#2b83d6", width: w }),
            text:
              hl || res < (g === "국가하천" ? 120 : 45)
                ? new Text({ text: f.get("label") || f.get("name"), placement: "line", font: `${hl ? 800 : 600} ${hl ? 14 : 12}px Pretendard, sans-serif`, fill: new Fill({ color: hl ? "#0b50d0" : "#0a5a9e" }), stroke: new Stroke({ color: "#fff", width: 4 }) })
                : undefined,
          }),
        ];
      },
      zIndex: 5,
    });
    const pts = new VectorLayer({
      source: ptSrc.current,
      style: (f, res) => pointStyle(f, res, new Set(propsRef.current.highlightIds ?? []), propsRef.current.selectedId),
      zIndex: 10,
      declutter: false,
    });
    L.current = { base, sat, hyb, osm, admin, emd, riverArea, smallRiver, rivers, pts };

    const m = new OlMap({
      target: el.current,
      layers: [base, sat, hyb, osm, emd, admin, riverArea, smallRiver, rivers, pts],
      view: new View({ center: fromLonLat(r.center), zoom: r.zoom, minZoom: 6, maxZoom: 19 }),
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }).extend([new ScaleLine({ bar: false })]),
    });
    map.current = m;
    tipOv.current = new Overlay({ element: tipEl.current!, positioning: "bottom-center", stopEvent: false });
    m.addOverlay(tipOv.current);

    m.on("pointermove", (e) => {
      if (e.dragging) return;
      const hit = m.forEachFeatureAtPixel(e.pixel, (f, layer) => ({ f, layer }), { hitTolerance: 5, layerFilter: (l) => l === pts || l === rivers || l === riverArea });
      const t = tipEl.current!;
      if (hit) {
        const f = hit.f as Feature;
        const nm = f.get("name") || f.get("label");
        if (!nm) { t.style.display = "none"; m.getTargetElement().style.cursor = ""; return; }
        t.textContent = hit.layer === pts ? `${f.get("category") ?? ""} · ${nm}` : `하천 · ${nm}${f.get("grade") ? ` (${f.get("grade")})` : ""}`;
        t.style.display = "block";
        tipOv.current!.setPosition(e.coordinate);
        m.getTargetElement().style.cursor = "pointer";
      } else {
        t.style.display = "none";
        m.getTargetElement().style.cursor = "";
      }
    });
    m.on("singleclick", (e) => {
      const hit = m.forEachFeatureAtPixel(e.pixel, (f, layer) => ({ f, layer }), { hitTolerance: 5, layerFilter: (l) => l === pts || l === rivers || l === riverArea });
      if (!hit) return;
      const f = hit.f as Feature;
      if (hit.layer === pts) {
        propsRef.current.onSelect?.(f.get("ref") as EntityRef);
      } else if (f.get("riverId")) {
        propsRef.current.onSelect?.({ type: "river", id: f.get("riverId"), name: f.get("label") || f.get("name") || "하천", category: "하천" });
      }
    });

    Promise.all([
      loadGeo("/data/admin_sigungu.geojson").then((fs) => (admin.getSource() as VectorSource).addFeatures(fs)),
      loadGeo("/data/admin_emd.geojson").then((fs) => (emd.getSource() as VectorSource).addFeatures(fs)),
      loadGeo("/data/rivers_area.geojson").then((fs) => (riverArea.getSource() as VectorSource).addFeatures(fs)),
      loadGeo("/data/rivers_centerline.geojson").then((fs) => (rivers.getSource() as VectorSource).addFeatures(fs)),
      loadGeo("/data/small_river_zones.geojson").then((fs) => (smallRiver.getSource() as VectorSource).addFeatures(fs)),
    ])
      .catch(() => {})
      .finally(() => setReady(true));

    const onZoom = (ev: Event) => {
      const v = m.getView();
      v.animate({ zoom: (v.getZoom() ?? 10) + (ev as CustomEvent<number>).detail, duration: 200 });
    };
    window.addEventListener("sa-map-zoom", onZoom);
    const ro = new ResizeObserver(() => m.updateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      window.removeEventListener("sa-map-zoom", onZoom);
      m.setTarget(undefined);
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 베이스맵·레이어 표시
  useEffect(() => {
    const l = L.current;
    if (!l.base) return;
    const osmMode = l.osm.getVisible() && tileErr.current >= 6;
    if (!osmMode) {
      l.base.setVisible(p.basemap === "Base" || p.basemap === "gray");
      l.sat.setVisible(p.basemap === "Satellite");
      l.hyb.setVisible(p.basemap === "Satellite");
    }
    (l.base as TileLayer<XYZ>).setOpacity(p.basemap === "gray" ? 0.55 : 1);
    l.admin.setVisible(p.layers.admin);
    l.emd.setVisible(p.layers.emd);
    l.rivers.setVisible(p.layers.rivers);
    l.riverArea.setVisible(p.layers.riverArea);
    l.smallRiver.setVisible(p.layers.smallRiver);
    l.pts.setVisible(p.layers.points);
  }, [p.basemap, p.layers]);

  // 포인트 갱신
  useEffect(() => {
    const src = ptSrc.current;
    src.clear();
    src.addFeatures(
      p.points
        .filter((e) => e.lon != null && e.lat != null)
        .map((e) => {
          const f = new Feature({ geometry: new Point(fromLonLat([e.lon!, e.lat!])) });
          f.setProperties({ id: e.id, name: e.name, category: e.category ?? (e.type === "event" ? "재난사건" : e.type === "report119" ? "119신고" : ""), tag: e.metric, ref: e });
          return f;
        }),
    );
  }, [p.points]);

  // 하이라이트·선택 → 다시 그리기 + 펄스
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    L.current.pts?.changed();
    L.current.rivers?.changed();
    L.current.riverArea?.changed();
    pulses.current.forEach((o) => m.removeOverlay(o));
    pulses.current = [];
    const ids = new Set([...(p.highlightIds ?? []), ...(p.selectedId ? [p.selectedId] : [])]);
    p.points
      .filter((e) => ids.has(e.id) && e.lon != null)
      .slice(0, 12)
      .forEach((e) => {
        const d = document.createElement("div");
        d.className = "map-pulse";
        const o = new Overlay({ element: d, position: fromLonLat([e.lon!, e.lat!]), positioning: "center-center", stopEvent: false });
        m.addOverlay(o);
        pulses.current.push(o);
      });
  }, [p.highlightIds, p.selectedId, p.riverHighlight, p.points, ready]);

  // 영역 이동
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const v = m.getView();
    const sel = p.selectedId ? p.points.find((x) => x.id === p.selectedId) : null;
    if (sel && sel.lon != null) {
      v.animate({ center: fromLonLat([sel.lon, sel.lat!]), zoom: Math.max(v.getZoom() ?? 12, 14), duration: 450 });
      return;
    }
    if (p.riverHighlight?.length) {
      const src = L.current.rivers?.getSource() as VectorSource | undefined;
      const fs = src?.getFeatures().filter((f) => p.riverHighlight!.includes(f.get("riverId"))) ?? [];
      if (fs.length) {
        const ext = fs[0].getGeometry()!.getExtent().slice();
        fs.forEach((f) => {
          const e = f.getGeometry()!.getExtent();
          ext[0] = Math.min(ext[0], e[0]); ext[1] = Math.min(ext[1], e[1]); ext[2] = Math.max(ext[2], e[2]); ext[3] = Math.max(ext[3], e[3]);
        });
        v.fit(ext, { padding: [70, 90, 70, 70], duration: 450, maxZoom: 15 });
        return;
      }
    }
    const pts = p.points.filter((x) => x.lon != null && (!(p.highlightIds?.length) || p.highlightIds.includes(x.id)));
    if (pts.length >= 2) {
      const lons = pts.map((x) => x.lon!), lats = pts.map((x) => x.lat!);
      const ext = transformExtent([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], "EPSG:4326", "EPSG:3857");
      v.fit(ext, { padding: [80, 100, 80, 80], duration: 450, maxZoom: 14 });
    } else if (pts.length === 1) {
      v.animate({ center: fromLonLat([pts[0].lon!, pts[0].lat!]), zoom: 14, duration: 450 });
    } else {
      const r = REGIONS[p.region];
      v.animate({ center: fromLonLat(r.center), zoom: r.zoom, duration: 450 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusToken, p.selectedId, p.region, ready]);

  return (
    <>
      <div ref={el} className="olmap" />
      <div ref={tipEl} className="ol-tip" style={{ display: "none" }} />
    </>
  );
}

export function zoomBy(delta: number) {
  // 외부 확대/축소 버튼용 — MapPanel에서 window 이벤트로 전달
  window.dispatchEvent(new CustomEvent("sa-map-zoom", { detail: delta }));
}
