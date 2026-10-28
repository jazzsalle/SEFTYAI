"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useSession } from "@/lib/session";
import type { PanelTab } from "./ExploreCtx";
import { useExplore } from "./ExploreCtx";
import { DEFAULT_LAYERS, type Basemap, type MapFeature, type MapLayers, zoomBy } from "../map/MapView";
import { MapLegend } from "../map/MapLegend";
import SopPane from "../sop/SopPane";
import { DocPane } from "../sop/DocPane";
import DetailPane from "./DetailPane";
import { IcExpand, IcPushpin, IcX } from "../Icons";

const MapView = dynamic(() => import("../map/MapView"), { ssr: false, loading: () => <div className="olmap" /> });

/** 우측 패널 (Figma 201005·207001) — 지도 · 대응절차(지자체 고정) · 상세 · 매뉴얼 원문 */
interface Props {
  tabs: PanelTab[];
  active: string;
  setActive: (k: string) => void;
  close: (k: string) => void;
  closeAll: () => void;
  features: MapFeature[];
  activeJobId: string | null;
  focusToken: number;
  areaToken?: number;
  sopFocus?: { id: string; n: number };
}

export default function RightPanel(p: Props) {
  const tab = p.tabs.find((t) => t.key === p.active) ?? p.tabs[0];
  return (
    <aside className="rpanel" aria-label="우측 패널">
      <div className="rtabs" role="tablist">
        {p.tabs.map((t) => (
          <div key={t.key} className={`rtab ${t.key === tab?.key ? "on" : ""} ${t.pinned ? "pinned" : ""}`} role="tab" aria-selected={t.key === tab?.key}>
            <button className="rtab-b" onClick={() => p.setActive(t.key)}>
              {t.pinned && <IcPushpin size={13} />}
              <span className="tl2">{t.title}</span>
            </button>
            {!t.pinned && t.kind !== "map" && <button className="x" onClick={() => p.close(t.key)} aria-label={`${t.title} 닫기`}><IcX size={13} /></button>}
          </div>
        ))}
        <span className="sp" />
        <button className="lnk s" style={{ alignSelf: "center", marginRight: 8 }} onClick={p.closeAll} title="패널 접기">패널 접기 <IcExpand size={14} /></button>
      </div>
      {/* 지도는 탭을 바꿔도 상태 유지 */}
      <div className={`rbody map ${tab?.kind === "map" ? "" : "hide"}`}>
        <MapPanel {...p} />
      </div>
      {tab && tab.kind !== "map" && (
        <div className="rbody" key={tab.key}>
          {tab.kind === "sop" && <SopPane focus={p.sopFocus} />}
          {tab.kind === "doc" && tab.citation && <DocPane c={tab.citation} />}
          {tab.kind === "detail" && tab.detail && <DetailPane apiId={tab.detail.api} id={tab.detail.id} label={tab.detail.label} ctx={tab.detail.ctx} />}
        </div>
      )}
    </aside>
  );
}

function MapPanel(p: Props) {
  const { cond } = useSession();
  const x = useExplore();
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("Base");
  const [tile, setTile] = useState<"vworld" | "osm">("vworld");
  const [lp, setLp] = useState(false);
  const shown = p.features.filter((f) => f.jobId === p.activeJobId);
  return (
    <div className="mapwrap">
      <MapView
        region={cond.region}
        areaToken={p.areaToken}
        features={p.features}
        activeJobId={p.activeJobId}
        selectedKey={x.selectedKey}
        focusToken={p.focusToken}
        basemap={basemap}
        layers={layers}
        onSelect={(k) => {
          const [jobId, ref] = k.split(":");
          x.showOnMap(jobId, ref);
        }}
        onTileStatus={setTile}
      />
      {tile === "osm" && <div className="map-note">배경지도(VWorld)를 불러오지 못해 OpenStreetMap 으로 표시합니다.</div>}
      <div className="map-tools">
        <button className="btn sm" onClick={() => setLp((v) => !v)} aria-expanded={lp}>지도 표시</button>
        {lp && (
          <div className="map-layerpanel">
            <div className="xs b">배경지도</div>
            {(["Base", "Satellite", "gray"] as Basemap[]).map((b) => (
              <label key={b} className="xs"><input type="radio" checked={basemap === b} onChange={() => setBasemap(b)} /> {b === "Base" ? "일반" : b === "Satellite" ? "영상" : "회색"}</label>
            ))}
            <div className="xs b" style={{ marginTop: 6 }}>레이어</div>
            <label className="xs"><input type="checkbox" checked={layers.boundary} onChange={() => setLayers((l) => ({ ...l, boundary: !l.boundary }))} /> 행정경계(VWorld)</label>
            <label className="xs"><input type="checkbox" checked={layers.features} onChange={() => setLayers((l) => ({ ...l, features: !l.features }))} /> 답변 대상(T3Q)</label>
          </div>
        )}
      </div>
      <div className="map-zoom">
        <button className="btn sm" onClick={() => zoomBy(1)} aria-label="확대">＋</button>
        <button className="btn sm" onClick={() => zoomBy(-1)} aria-label="축소">－</button>
      </div>
      {/* 범례만(표시한 대상이 있을 때) — 유엔이가 센 곳 수·위치 없음 수·설명 문구는 두지 않는다(R25) */}
      {shown.length > 0 && (
        <div className="map-foot">
          <MapLegend features={shown} />
        </div>
      )}
    </div>
  );
}
