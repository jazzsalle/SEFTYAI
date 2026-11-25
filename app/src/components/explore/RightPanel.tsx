"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type OlMap from "ol/Map";
import { useSession } from "@/lib/session";
import { baseKey } from "@/lib/baseRegion";
import { api } from "@/lib/api";
import { detailIdOf, hasDetail, sameObject, type RefLike } from "@/lib/mapRef";
import { fetchT3qData } from "@/lib/t3qData";
import { floodTraceBody, floodTraceId, floodTraceItem, isFloodTrace } from "@/lib/floodTrace";
import { isClosable, tabTitles } from "@/lib/panelTabs";
import type { PanelTab } from "./ExploreCtx";
import { useExplore } from "./ExploreCtx";
import { DEFAULT_LAYERS, type Basemap, type MapFeature, type MissingItem } from "../map/MapView";
import { keepBasemap, keptBasemap } from "@/lib/mapMemory";
import MapLegendPanel from "../map/MapLegendPanel";
import { useAdminNames } from "../map/useAdminNames";
import SopPane from "../sop/SopPane";
import { DocPane } from "../sop/DocPane";
import DetailPane from "./DetailPane";
import EvidencePane from "./EvidencePane";
import PosterSummary, { type SummarySource } from "../summary/PosterSummary";
import MapSummary from "../summary/MapSummary";
import RainSlider from "../map/RainSlider";

const MapView = dynamic(() => import("../map/MapView"), { ssr: false, loading: () => <div className="olmap" /> });

/** 우측 패널 (Figma 201005·207001) — 지도 · 한눈 요약(개발 서버 시안 2) · 대응절차(지자체 고정) · 상세 · 매뉴얼 원문 */
interface Props {
  tabs: PanelTab[];
  active: string;
  setActive: (k: string) => void;
  close: (k: string) => void;
  closeAll: () => void;
  /** [모두 닫기] — 상세 탭을 한 번에 닫는다. 붙박이 탭은 남는다(개발서버 SidePanel onCloseAll) */
  closeTabs?: () => void;
  features: MapFeature[];
  activeJobId: string | null;
  focusToken: number;
  areaToken?: number;
  sopFocus?: { id: string; n: number };
  /** 지금 지도가 그리는 답(턴·브리핑)의 열쇠 — 바뀌면 거르기·구 거르기를 푼다 */
  mapScope?: string;
  /** 도형을 못 받은 대상 수 */
  missing?: number;
  /** 도형을 못 받은 대상(지도 대체정보 「· 공간정보 없음」 줄) */
  missingItems?: MissingItem[];
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
  // 요약 이름을 누르면 상세 탭을 만들고 지도에서 그 자리로(개발 서버 openEntity)
  const onEntity = (r: RefLike) => p.summary && x.openEntity(p.summary.jobId, r);
  // 고른 탭이 탭 목록 밖으로 밀려 있으면 보이게 민다 — 상세 탭이 많아진 뒤 [지도]·[한눈 요약]으로 돌아와도 그 탭이 보이게
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const l = list.current;
    const on = l?.querySelector<HTMLElement>(".rtab.on");
    if (!l || !on) return;
    const a = on.getBoundingClientRect().left - l.getBoundingClientRect().left + l.scrollLeft;
    if (a < l.scrollLeft) l.scrollLeft = a;
    else if (a + on.offsetWidth > l.scrollLeft + l.clientWidth) l.scrollLeft = a + on.offsetWidth - l.clientWidth;
  }, [tab?.key, p.tabs.length]);
  // 이름이 같은 탭은 갈래(없으면 객체 ID)를 붙여 가른다(개발서버 panelTabs.tabTitles)
  const titles = tabTitles(p.tabs);
  const closable = p.tabs.filter(isClosable);
  return (
    <aside className="rpanel" aria-label="우측 패널">
      {/* 개발서버 SidePanel panel-head — 탭이 넘치면 좌우로 밀어서 본다 · [모두 닫기]·[패널 접기]는 밖에 고정 */}
      <div className="rtabs">
        <div className="rtabs-list" role="tablist" aria-label="열린 탭" ref={list}>
          {p.tabs.map((t) => {
            const name = titles.get(t.key) ?? t.title;
            return (
              <div key={t.key} className={`rtab${t.key === tab?.key ? " on" : ""}`}>
                <button type="button" role="tab" aria-selected={t.key === tab?.key} className="rtab-b" title={name} onClick={() => p.setActive(t.key)}>
                  {name}
                </button>
                {/* 붙박이 탭(지도·한눈 요약·대응절차)은 닫지 않는다 */}
                {isClosable(t) && (
                  <button type="button" className="x" aria-label={`${name} 탭 닫기`} onClick={() => p.close(t.key)}>
                    <CloseIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* 닫을 수 있는 탭이 둘 이상일 때만 — 하나면 그 탭의 × 와 같다 */}
        {p.closeTabs && closable.length > 1 && (
          <button type="button" className="panel-collapse panel-close-all" onClick={p.closeTabs} title="상세 탭 모두 닫기(지도·한눈 요약은 남습니다)">
            모두 닫기
          </button>
        )}
        <button type="button" className="panel-collapse" onClick={p.closeAll} title="패널 접기">
          패널 접기
          <ChevronIcon dir="right" />
        </button>
      </div>
      {/* 지도는 탭을 바꿔도 상태 유지 */}
      <div className={`rbody map ${tab?.kind === "map" ? "" : "hide"}`}>
        <MapPanel {...p} />
      </div>
      {tab && tab.kind !== "map" && (
        <div className={`rbody ${tab.kind === "summary" ? "summary" : ""}`} key={tab.key}>
          {tab.kind === "summary" && <PosterSummary source={p.summary ?? null} onEntity={onEntity} />}
          {tab.kind === "sop" && <SopPane focus={p.sopFocus} />}
          {tab.kind === "doc" && tab.citation && <DocPane c={tab.citation} />}
          {tab.kind === "evidence" && tab.evidence && (
            <EvidencePane jobId={tab.evidence.jobId} row={tab.evidence.row} rows={tab.evidence.rows} view={tab.evidence.view} onPick={(r) => x.openEvidence(tab.evidence!.jobId, r, tab.evidence!.rows)} />
          )}
          {tab.kind === "detail" && tab.detail && <DetailPane apiId={tab.detail.api} id={tab.detail.id} label={tab.detail.label} ctx={tab.detail.ctx} hasGeometry={geometryKnown(p, tab.detail.ctx)} />}
        </div>
      )}
    </aside>
  );
}

/** 개발서버 SidePanel ChevronIcon — 16px 꺾쇠 */
export function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={dir === "right" ? "m6 3.5 5 4.5-5 4.5" : "m10 3.5-5 4.5 5 4.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 개발서버 SidePanel CloseIcon — 12px × */
function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 상세 탭의 대상이 지도에 찍히는지 — 개발서버 SidePanel geometryKnown: 위치를 받는 중·실패면 모름(null),
 * 지도가 그리는 그 답의 대상 가운데 있으면 true, 그 답의 대상은 그렸는데 이것만 없으면(도형 없음) false, 그 답을 안 그리면 모름
 */
export function geometryKnown(p: Pick<Props, "features" | "resultStatus">, ctx: Record<string, unknown> | null | undefined): boolean | null {
  const job = ctx?.mapJob;
  const ref = ctx?.mapRef;
  if (typeof job !== "string" || typeof ref !== "string" || p.resultStatus) return null;
  if (p.features.some((f) => f.jobId === job && f.ref === ref)) return true;
  return p.features.some((f) => f.jobId === job) ? false : null;
}

/** 상세(T3Q-15 · 침수흔적은 T3Q-30) 유무 — 객체 ID 마다 한 번 묻는다. 못 물으면(통신 실패) 다음에 다시 */
const detailSeen = new Map<string, Promise<boolean>>();
function riskHasDetail(r: RefLike | undefined): Promise<boolean> {
  const id = r ? detailIdOf(r) : null;
  if (!id) return Promise.resolve(false);
  // 침수흔적은 T3Q-30 결과로 가린다(개발서버 usePanel.selectFromMap · a4cb228) — 상세 탭과 같은 조회라 받은 것을 탭이 다시 쓴다
  if (isFloodTrace(r!)) {
    const ft = floodTraceId(r!);
    if (!ft) return Promise.resolve(false);
    return fetchT3qData<{ result?: unknown }>({ api: "T3Q-30", body: floodTraceBody(ft) })
      .then((e) => !!floodTraceItem(e?.result, ft))
      .catch(() => false);
  }
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
  // 위성·일반 — 패널을 접었다 펴도 그대로(lib/mapMemory, 2026-11-25)
  const [basemap, setBasemapState] = useState<Basemap>(keptBasemap);
  const setBasemap = (b: Basemap) => {
    keepBasemap(b);
    setBasemapState(b);
  };
  const scope = p.mapScope ?? p.activeJobId ?? "";
  // 범례 거르기·구 거르기 — 지도가 그리는 답이 바뀌면 풀린다(개발 서버)
  const [filt, setFilt] = useState<{ scope: string; key: string | null }>({ scope: "", key: null });
  const filter = filt.scope === scope ? filt.key : null;
  const setFilter = (key: string | null) => setFilt({ scope, key });
  const [areaPick, setAreaPick] = useState<{ scope: string; label: string; ids: ReadonlySet<string> } | null>(null);
  const area = areaPick?.scope === scope ? areaPick : null;
  // 「지도 표시」(SCR-UNE-207002) 갈래 켜고 끄기는 뺐다(개발서버 e9f6fd2 — 범례 거르기와 겹치고 옛 분류라 범례와 이름이 달랐다)
  const [olMap, setOlMap] = useState<OlMap | null>(null);
  const [summaryOn, setSummaryOn] = useState(false);
  const adminNames = useAdminNames(p.features);
  // 지도 위 가로 범례가 읽는 것 — 도형이 있는 대상(개발서버 legendFeatures)
  const legendFeatures = useMemo(() => p.features.filter((f) => f.geometry), [p.features]);
  const detailOf = useCallback((f: MapFeature) => riskHasDetail(f.t3qRef), []);
  const onDetail = useCallback((f: MapFeature) => {
    const id = f.t3qRef ? detailIdOf(f.t3qRef) : null;
    // 지도에서 연 대상 — 상세 머리 [지도에서 보기]가 이 점으로 돌아온다(개발서버 EntityTab onShowMap). 침수흔적은 T3Q-30(개발서버 a4cb228)
    const apiId = f.t3qRef && isFloodTrace(f.t3qRef) ? "T3Q-30" : "T3Q-15";
    if (id) x.openDetail(apiId, id, f.displayName ?? id, { mapJob: f.jobId, mapRef: f.ref, entityType: f.entityType ?? null });
  }, [x]);
  // 말풍선 「답변에서 보기」 — 그 답변의 대상 목록(없으면 답변 머리)으로
  const locate = (f: MapFeature) => {
    const el = document.getElementById(`refs-${f.jobId}`) ?? document.getElementById(`job-${f.jobId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };
  const nPicked = p.pickedIds?.size ?? 0;
  return (
    // 개발서버 MapPane .map-pane — 알림 → 범례 띠 → 지도 칸 → 지도 대체정보를 세로로 쌓는다(MapView 가 그린다)
    <div className="map-pane">
      <MapView
        region={cond.region}
        baseCode={baseKey(cond.base)}
        areaToken={p.areaToken}
        features={p.features}
        activeJobId={p.activeJobId}
        selectedKey={x.selectedKey}
        focusToken={p.focusToken}
        basemap={basemap}
        layers={DEFAULT_LAYERS}
        onSelect={(k) => x.selectOnMap(k)}
        filter={filter}
        onLocate={locate}
        onBasemap={setBasemap}
        picking={p.picking}
        pickedIds={p.pickedIds}
        onTogglePick={p.onTogglePick}
        areaIds={area?.ids ?? null}
        summaryOn={summaryOn}
        scope={scope}
        adminNames={adminNames}
        detailOf={detailOf}
        onDetail={onDetail}
        missing={p.missing}
        missingItems={p.missingItems}
        resultStatus={p.resultStatus}
        onMap={setOlMap}
        top={
          // 지도 범례 — 지도 위 가로 띠(개발서버 POC MapLegendPanel). 요약 보기 중에는 숨김
          !summaryOn && legendFeatures.length > 0 && (
            <MapLegendPanel features={legendFeatures} filter={filter} onFilter={setFilter} boundary={DEFAULT_LAYERS.boundary} dimOthers={false} />
          )
        }
      >
        <MapSummary
          map={olMap}
          source={p.summary ?? null}
          onActive={setSummaryOn}
          onRegion={(r) => setAreaPick({ scope, label: r.label, ids: new Set(r.ids) })}
        />
        {/* 「비가 이만큼 오면」 강우 막대 — 샘플이 있는 지역(영천)만(김인건 서기관 제안 2026-11-25) */}
        {!summaryOn && <RainSlider map={olMap} region={cond.region} />}
        {area && !summaryOn && (
          <p className="map-area-chip" role="status">
            {area.label}
            <button type="button" onClick={() => setAreaPick(null)} aria-label="구 거르기 풀기">×</button>
          </p>
        )}
        {/* 「객체 참조」 — 켜면 지도에서 누른 대상을 다음 질문의 참조로 집는다(개발 서버 map-pickmode) */}
        {p.onPicking && (
          <label className={`map-pickmode${p.picking ? " is-on" : ""}`}>
            <input type="checkbox" checked={!!p.picking} onChange={(e) => p.onPicking?.(e.target.checked)} />
            객체 참조
            {nPicked > 0 && <span className="map-pickmode-count">{nPicked}</span>}
          </label>
        )}
      </MapView>
    </div>
  );
}
