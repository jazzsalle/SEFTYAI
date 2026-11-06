"use client";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import type OlMap from "ol/Map";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import { SYMBOL_NAMES, detailIdOf, hasDetail, sameObject, symbolOf, type MapSymbol, type RefLike } from "@/lib/mapRef";
import type { PanelTab } from "./ExploreCtx";
import { useExplore } from "./ExploreCtx";
import { DEFAULT_LAYERS, type Basemap, type MapFeature, type MapLayers, zoomBy } from "../map/MapView";
import MapLegendPanel from "../map/MapLegendPanel";
import { useAdminNames } from "../map/useAdminNames";
import SopPane from "../sop/SopPane";
import { DocPane } from "../sop/DocPane";
import DetailPane from "./DetailPane";
import PosterSummary, { type SummarySource } from "../summary/PosterSummary";
import MapSummary from "../summary/MapSummary";
import { IcExpand, IcPushpin, IcX } from "../Icons";

const MapView = dynamic(() => import("../map/MapView"), { ssr: false, loading: () => <div className="olmap" /> });

/** 우측 패널 (Figma 201005·207001) — 지도 · 한눈 요약(개발 서버 시안 2) · 대응절차(지자체 고정) · 상세 · 매뉴얼 원문 */
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
  /** 지금 지도가 그리는 답(턴·브리핑)의 열쇠 — 바뀌면 거르기·구 거르기를 푼다 */
  mapScope?: string;
  /** 도형을 못 받은 대상 수 */
  missing?: number;
  /** 조회결과 위치 상태 */
  resultStatus?: "loading" | "failed" | null;
  /** 「한눈 요약」이 그릴 답 */
  summary?: SummarySource | null;
  /** 「객체 참조」 — 켜면 지도 누르기가 집기 */
  picking?: boolean;
  onPicking?: (on: boolean) => void;
  pickedIds?: ReadonlySet<string>;
  onTogglePick?: (f: MapFeature) => void;
}

export default function RightPanel(p: Props) {
  const x = useExplore();
  const tab = p.tabs.find((t) => t.key === p.active) ?? p.tabs[0];
  // 요약 이름을 누르면 지도에서 그 자리로(개발 서버 openEntity)
  const onEntity = (r: RefLike) => p.summary && x.showOnMap(p.summary.jobId, r.ref);
  return (
    <aside className="rpanel" aria-label="우측 패널">
      <div className="rtabs" role="tablist">
        {p.tabs.map((t) => (
          <div key={t.key} className={`rtab ${t.key === tab?.key ? "on" : ""} ${t.pinned ? "pinned" : ""}`} role="tab" aria-selected={t.key === tab?.key}>
            <button className="rtab-b" onClick={() => p.setActive(t.key)}>
              {t.pinned && <IcPushpin size={13} />}
              <span className="tl2">{t.title}</span>
            </button>
            {!t.pinned && t.kind !== "map" && t.kind !== "summary" && <button className="x" onClick={() => p.close(t.key)} aria-label={`${t.title} 닫기`}><IcX size={13} /></button>}
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
          {tab.kind === "summary" && <PosterSummary source={p.summary ?? null} onEntity={onEntity} />}
          {tab.kind === "sop" && <SopPane focus={p.sopFocus} />}
          {tab.kind === "doc" && tab.citation && <DocPane c={tab.citation} />}
          {tab.kind === "detail" && tab.detail && <DetailPane apiId={tab.detail.api} id={tab.detail.id} label={tab.detail.label} ctx={tab.detail.ctx} />}
        </div>
      )}
    </aside>
  );
}

/** 상세(T3Q-15) 유무 — 객체 ID 마다 한 번 묻는다. 못 물으면(통신 실패) 다음에 다시 */
const detailSeen = new Map<string, Promise<boolean>>();
function riskHasDetail(r: RefLike | undefined): Promise<boolean> {
  const id = r ? detailIdOf(r) : null;
  if (!id) return Promise.resolve(false);
  const hit = detailSeen.get(id);
  if (hit) return hit;
  const pending = api<{ envelope: { status?: string; result?: Record<string, unknown> | null } }>("/api/t3q/data", { method: "POST", json: { api: "T3Q-15", id } })
    .then(({ envelope: e }) => {
      const o = e?.result;
      if (!o || e.status !== "SUCCESS") return false;
      const risk = (o as { risk?: { name?: unknown } }).risk;
      return sameObject(r!.display_name, (o as { name?: unknown }).name ?? risk?.name) && hasDetail(o);
    })
    .catch(() => {
      detailSeen.delete(id);
      return false;
    });
  detailSeen.set(id, pending);
  return pending;
}

function MapPanel(p: Props) {
  const { cond } = useSession();
  const x = useExplore();
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("Base");
  const [tile, setTile] = useState<"vworld" | "osm">("vworld");
  const [lp, setLp] = useState(false);
  const scope = p.mapScope ?? p.activeJobId ?? "";
  // 범례 거르기·구 거르기 — 지도가 그리는 답이 바뀌면 풀린다(개발 서버)
  const [filt, setFilt] = useState<{ scope: string; key: string | null }>({ scope: "", key: null });
  const filter = filt.scope === scope ? filt.key : null;
  const setFilter = (key: string | null) => setFilt({ scope, key });
  const [areaPick, setAreaPick] = useState<{ scope: string; label: string; ids: ReadonlySet<string> } | null>(null);
  const area = areaPick?.scope === scope ? areaPick : null;
  // 「지도 표시」에서 끈 갈래(개발 서버 MapLayerPicker)
  const [hidden, setHidden] = useState<ReadonlySet<MapSymbol>>(new Set());
  const [olMap, setOlMap] = useState<OlMap | null>(null);
  const [summaryOn, setSummaryOn] = useState(false);
  const adminNames = useAdminNames(p.features);
  const shown = p.features;
  const symCounts = useMemo(() => {
    const m = new Map<MapSymbol, number>();
    for (const f of shown) m.set(symbolOf(f.entityType), (m.get(symbolOf(f.entityType)) ?? 0) + 1);
    return m;
  }, [shown]);
  const detailOf = useCallback((f: MapFeature) => riskHasDetail(f.t3qRef), []);
  const onDetail = useCallback((f: MapFeature) => {
    const id = f.t3qRef ? detailIdOf(f.t3qRef) : null;
    // 지도에서 연 대상 — 상세 머리 [지도에서 보기]가 이 점으로 돌아온다(개발서버 EntityTab onShowMap)
    if (id) x.openDetail("T3Q-15", id, f.displayName ?? id, { mapJob: f.jobId, mapRef: f.ref });
  }, [x]);
  // 말풍선 「답변에서 보기」 — 그 답변의 대상 목록(없으면 답변 머리)으로
  const locate = (f: MapFeature) => {
    const el = document.getElementById(`refs-${f.jobId}`) ?? document.getElementById(`job-${f.jobId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };
  const nPicked = p.pickedIds?.size ?? 0;
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
        onSelect={(k) => x.selectOnMap(k)}
        onTileStatus={setTile}
        filter={filter}
        onFilter={setFilter}
        onLocate={locate}
        onBasemap={setBasemap}
        picking={p.picking}
        pickedIds={p.pickedIds}
        onTogglePick={p.onTogglePick}
        hidden={hidden}
        areaIds={area?.ids ?? null}
        summaryOn={summaryOn}
        scope={scope}
        adminNames={adminNames}
        detailOf={detailOf}
        onDetail={onDetail}
        missing={p.missing}
        resultStatus={p.resultStatus}
        onMap={setOlMap}
      >
        <MapSummary
          map={olMap}
          source={p.summary ?? null}
          onActive={setSummaryOn}
          onRegion={(r) => setAreaPick({ scope, label: r.label, ids: new Set(r.ids) })}
        />
        {area && !summaryOn && (
          <div className="map-area-chip" role="status">
            {area.label}
            <button type="button" onClick={() => setAreaPick(null)} aria-label="구 거르기 풀기" title="구 거르기 풀기">×</button>
          </div>
        )}
      </MapView>
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
            {/* 갈래별 켜고 끄기 — 받은 대상이 있는 갈래만(개발 서버 MapLayerPicker) */}
            {symCounts.size > 0 && <div className="xs b" style={{ marginTop: 6 }}>대상 갈래</div>}
            {(Object.keys(SYMBOL_NAMES) as MapSymbol[]).filter((k) => symCounts.has(k)).map((k) => (
              <label key={k} className="xs map-layers-item">
                <input
                  type="checkbox"
                  checked={!hidden.has(k)}
                  disabled={!layers.features}
                  onChange={() => setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })}
                />
                {SYMBOL_NAMES[k]} {symCounts.get(k)}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="map-zoom">
        <button className="btn sm" onClick={() => zoomBy(1)} aria-label="확대">＋</button>
        <button className="btn sm" onClick={() => zoomBy(-1)} aria-label="축소">－</button>
      </div>
      {/* 「객체 참조」 — 켜면 지도에서 누른 대상을 다음 질문의 참조로 집는다(개발 서버 map-pickmode) */}
      {p.onPicking && (
        <label className={`map-pickmode${p.picking ? " is-on" : ""}`} title="켜면 지도에서 누른 대상을 다음 질문의 참조로 담습니다">
          <input type="checkbox" checked={!!p.picking} onChange={(e) => p.onPicking?.(e.target.checked)} />
          객체 참조
          {nPicked > 0 && <span className="map-pickmode-count">{nPicked}</span>}
        </label>
      )}
      {/* 지도 위 범례 카드(표시한 대상이 있을 때, 요약 보기 중에는 숨김) — 곳 수는 지도에 그린 대상을 종류별로 센 범례 표시(R25) */}
      {shown.length > 0 && layers.features && !summaryOn && (
        <MapLegendPanel features={shown} filter={filter} onFilter={setFilter} boundary={layers.boundary} dimOthers={false} />
      )}
    </div>
  );
}
