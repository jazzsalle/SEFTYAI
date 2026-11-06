"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type OlMap from "ol/Map";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import VectorLayer from "ol/layer/Vector";
import TileLayer from "ol/layer/Tile";
import VectorSource from "ol/source/Vector";
import type Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import type Geometry from "ol/geom/Geometry";
import { createEmpty, extend as extendExtent, isEmpty as isEmptyExtent } from "ol/extent";
import { Fill, Stroke, Style, Text } from "ol/style";
import { api } from "@/lib/api";
import { onScaleChange, scaledPx } from "@/lib/fontScale";
import { entityKey } from "@/lib/mapRef";
import { districtCounts, districtLine, shortDate, sigunguOf, type SummaryGroup, type Tone } from "@/lib/summary";
import type { SummarySource } from "./PosterSummary";
import { useDistrictNames, useSummary } from "./useSummary";
import "./summary.css";

/** 구분 색 — summary.css 의 --sm-strong 과 같은 값(OpenLayers 는 CSS 변수를 못 읽는다) */
const TONE_HEX: Record<Tone, string> = {
  blue: "#256ef4", green: "#228738", yellow: "#ffb114", sky: "#0b78cb", red: "#de3412",
  purple: "#6f4bd8", teal: "#0f9d8a", brown: "#8a5a2b", navy: "#063a74", gray: "#6d7882",
};
/** 한 번에 칠하는 시도 수 — 넘으면 앞에서부터만(개발 서버 MaxSidos) */
const MAX_SIDOS = 4;
/** 한 구에서 가장 큰 덩어리의 이만큼보다 작은 조각(먼 섬)은 화면 맞춤에서 뺀다(개발 서버 IslandRatio) */
const ISLAND_RATIO = 0.05;

interface Shape { code: string; name: string; geometry: { type: string; coordinates: unknown } }
const shapes = new Map<string, Promise<Shape[] | null>>();
/** 시도 코드 → 시군구 경계(/api/map/sigungu). 한 번 받은 것은 다시 묻지 않는다(못 받으면 다음에 다시) */
function sigunguShapes(sido: string): Promise<Shape[] | null> {
  const hit = shapes.get(sido);
  if (hit) return hit;
  const pending = api<{ items: Shape[] }>(`/api/map/sigungu?sido=${sido}`).then((r) => r.items).catch(() => null);
  pending.then((v) => v === null && shapes.delete(sido));
  shapes.set(sido, pending);
  return pending;
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const partsOf = (g: Geometry | undefined): Polygon[] => (g instanceof MultiPolygon ? g.getPolygons() : g ? [g as Polygon] : []);

/**
 * 개발 서버 시안 3 — 지도 탭 「요약 보기」(OpenLayers 로 다시 씀).
 *
 * 켜면 떠 있는 카드에 구분별 개수가 선다. 카드를 누르면 그 구분이 시군구마다 몇 곳인지로 행정경계를 칠하고
 * 「금정구 3곳」 이름표를 단다(진하기 = 개수). 여러 시도에 걸치면 시도마다 경계를 받아 함께 칠한다.
 * 시군구를 모르는 구분(하천 등)은 지도의 표식으로 본다. 칠한 구를 누르면 지도 보기로 돌아가 그 구의 대상만 보인다
 */
export default function MapSummary({ map, source, onActive, onRegion }: {
  map: OlMap | null;
  source: SummarySource | null;
  /** 요약 보기를 켜고 끌 때 — 지도가 핀을 거두고 하천 띠만 남긴다 */
  onActive?: (on: boolean) => void;
  /** 칠한 구를 누름 — 그 구의 대상 열쇠(eid) */
  onRegion?: (pick: { label: string; ids: string[] }) => void;
}) {
  const [on, setOn] = useState(false);
  const regionRef = useRef(onRegion);
  regionRef.current = onRegion;
  const activeRef = useRef(onActive);
  activeRef.current = onActive;
  const [chosen, setChosen] = useState<string | null>(null);
  const state = useSummary(source?.refs);
  const summary = state.kind === "ok" ? state.summary : null;
  const names = useDistrictNames(summary);
  const groups = useMemo(() => summary?.groups ?? [], [summary]);
  const group = groups.find((g) => g.key === chosen) ?? null;

  // 답이 바뀌면 고른 구분을 놓는다
  useEffect(() => setChosen(null), [summary]);
  // 켜자마자 첫 구분(시군구를 아는 것)을 골라 둔다 — 시안 3 첫 화면
  useEffect(() => {
    if (!on || chosen !== null) return;
    const first = groups.find((g) => g.rows.some((r) => sigunguOf(r.adminCode)));
    if (first) setChosen(first.key);
  }, [on, chosen, groups]);

  // 켜면 배경지도를 옅게, 지도 쪽에 알린다. 끌 때·떠날 때 되돌린다
  const active = on && groups.length > 0;
  useEffect(() => {
    activeRef.current?.(active);
    if (!map || !active) return;
    const tiles = map.getLayers().getArray().filter((l): l is TileLayer => l instanceof TileLayer && (l.getZIndex() ?? 0) < 5);
    const was = tiles.map((l) => l.getOpacity());
    tiles.forEach((l) => l.setOpacity(0.55));
    return () => tiles.forEach((l, i) => l.setOpacity(was[i]));
  }, [active, map]);
  useEffect(() => () => activeRef.current?.(false), []);

  const counts = useMemo(() => (group ? districtCounts(group.rows) : []), [group]);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (!map || !on || !group || counts.length === 0) return;
    const bySig = new Map(counts.map(([code, n]) => [code.slice(0, 5), n]));
    const max = Math.max(...counts.map(([, n]) => n), 1);
    const sidos = [...new Set(counts.map(([code]) => code.slice(0, 2)))].slice(0, MAX_SIDOS);
    const color = TONE_HEX[group.tone];
    let layer: VectorLayer<VectorSource> | null = null;
    let off: (() => void) | null = null;
    let alive = true;
    setStatus("loading");
    Promise.all(sidos.map(sigunguShapes)).then((sets) => {
      if (!alive) return;
      const list = sets.flatMap((s) => s ?? []);
      if (!list.length) {
        setStatus("failed");
        return;
      }
      setStatus("idle");
      const fmt = new GeoJSON();
      const src = new VectorSource();
      const land = createEmpty();
      for (const s of list) {
        const n = bySig.get(s.code.slice(0, 5)) ?? 0;
        const f = fmt.readFeature({ type: "Feature", geometry: s.geometry, properties: {} }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as Feature<Geometry>;
        const parts = partsOf(f.getGeometry());
        const big = parts.reduce((a, b) => (b.getArea() > a.getArea() ? b : a), parts[0]);
        f.setProperties({ sig: s.code.slice(0, 5), name: s.name, n, label: big?.getInteriorPoint() });
        src.addFeature(f);
        // 구 경계에 딸린 먼 바다 섬까지 넣으면 화면이 바다로 넓어진다(사하구 — 개발 서버 지적 11-04) → 본토 쪽 덩어리만 맞춤에
        if (n > 0 && big) for (const p of parts) if (p.getArea() >= big.getArea() * ISLAND_RATIO) extendExtent(land, p.getExtent());
      }
      const style = (ft: FeatureLike) => {
        const n = Number(ft.get("n")) || 0;
        const out = [new Style({
          stroke: new Stroke({ color: n > 0 ? color : "#8a949e", width: n > 0 ? 1.6 : 0.8 }),
          fill: new Fill({ color: hexA(color, n > 0 ? 0.18 + (n / max) * 0.5 : 0.02) }),
        })];
        // 이름표는 가장 큰 조각(본토) 안쪽 점에 — 첫 조각이 먼 섬이면 바다 위에 뜬다(사하구)
        if (n > 0) out.push(new Style({
          geometry: ft.get("label"),
          text: new Text({
            text: `${ft.get("name")} ${n}곳`, font: `600 ${scaledPx(11)}px Pretendard, sans-serif`, fill: new Fill({ color: "#fff" }),
            backgroundFill: new Fill({ color: "rgba(19,20,22,0.78)" }), padding: [2, 6, 2, 6], overflow: true,
          }),
        }));
        return out;
      };
      layer = new VectorLayer({ source: src, zIndex: 15, style });
      map.addLayer(layer);
      const lyr = layer;
      const onClick = (e: { pixel: number[] }) => {
        const hit = map.forEachFeatureAtPixel(e.pixel, (ft) => ft, { layerFilter: (l) => l === lyr });
        const n = Number(hit?.get("n")) || 0;
        if (!hit || n <= 0) return;
        const sig = String(hit.get("sig"));
        const ids = group.rows.filter((r) => r.ref && sigunguOf(r.adminCode)?.slice(0, 5) === sig).map((r) => entityKey(r.ref!));
        setOn(false);
        regionRef.current?.({ label: `${hit.get("name") ?? sig} · ${group.short} ${n}곳`, ids });
      };
      const onMove = (e: { pixel: number[]; dragging?: boolean }) => {
        if (e.dragging) return;
        const hit = map.forEachFeatureAtPixel(e.pixel, (ft) => ft, { layerFilter: (l) => l === lyr });
        map.getTargetElement()?.classList.toggle("sm-hover", Number(hit?.get("n")) > 0);
      };
      map.on("singleclick", onClick);
      map.on("pointermove", onMove);
      const offScale = onScaleChange(() => lyr.changed()); // [글자 크기] 바꾸면 구 이름표 다시(R58)
      off = () => {
        offScale();
        map.un("singleclick", onClick);
        map.un("pointermove", onMove);
        map.getTargetElement()?.classList.remove("sm-hover");
      };
      if (!isEmptyExtent(land)) map.getView().fit(land, { padding: [24, 24, 24, 24], duration: 0 });
    });
    return () => {
      alive = false;
      off?.();
      if (layer) map.removeLayer(layer);
    };
  }, [map, on, group, counts]);

  if (!source || groups.length === 0) return null;
  const max = Math.max(...counts.map(([, n]) => n), 1);
  const hasRiver = groups.some((g) => g.block === "river");
  return (
    <>
      <div className="sm-map">
        <div className="sm-map-seg" role="group" aria-label="지도 보기 방식">
          <button type="button" className={`sm-map-toggle${!on ? " is-on" : ""}`} aria-pressed={!on} onClick={() => setOn(false)}>지도 보기</button>
          <button type="button" className={`sm-map-toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setOn(true)}>요약 보기</button>
        </div>
        {on && (
          <section className="sm-map-list" aria-label="구분별 요약">
            <p className="sm-map-list-h">{[source.regionName, source.basisAt && `${source.basisAt} 기준`].filter(Boolean).join(" · ")}</p>
            <div className="sm-map-cards" role="list">
              {groups.map((g) => (
                <MapCard key={g.key} group={g} line={districtLine(districtCounts(g.rows), names, 3)} selected={g.key === chosen} onPick={() => setChosen((was) => (was === g.key ? null : g.key))} />
              ))}
            </div>
          </section>
        )}
      </div>
      {/* 시안 3 범례 — 지도 아래 띠. 진하기 세 칸 + 하천 선 */}
      {on && (group || hasRiver) && (
        <div className="sm-map-legend sm-map-legend--bar" aria-label="범례">
          <b>범례</b>
          {group && (counts.length === 0 ? (
            <span>{group.short} — 시군구를 알 수 없어 지도의 표식으로 봅니다</span>
          ) : status === "failed" ? (
            <span>행정경계를 불러오지 못했습니다</span>
          ) : (
            <span className="sm-map-steps" style={{ ["--ramp" as string]: TONE_HEX[group.tone] }}>
              <i style={{ opacity: 0.35 }} />
              <i style={{ opacity: 0.65 }} />
              <i />
              {group.short} — 진할수록 그 구에 많음 (최대 {max}곳)
            </span>
          ))}
          {hasRiver && <span className="sm-map-riverkey"><i aria-hidden="true" />하천 (공간객체 도형)</span>}
        </div>
      )}
    </>
  );
}

function MapCard({ group, line, selected, onPick }: { group: SummaryGroup; line: string | null; selected: boolean; onPick: () => void }) {
  const located = group.rows.some((r) => sigunguOf(r.adminCode));
  return (
    <button type="button" role="listitem" className={`sm-map-card sm-tone--${group.tone}${selected ? " is-on" : ""}`} aria-pressed={selected} onClick={onPick}>
      <span className="sm-map-card-head">
        <span className="sm-count-dot" aria-hidden="true" />
        {group.short}
        <b>{group.count}곳</b>
      </span>
      <small>{group.block === "river" ? "구에 묶이지 않음 · 지도에 하천 띠로 표시" : (line ?? (located ? "지역 이름을 불러오는 중" : "지도의 표식으로 보기"))}</small>
      <CardDetail group={group} />
    </button>
  );
}

/** 카드 안 상세 줄(시안 3) — 한눈 요약이 이미 받은 값만 쓴다 */
export function CardDetail({ group }: { group: SummaryGroup }) {
  const rows = group.rows;
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? null : String(x));
  if (group.block === "trace") {
    const byDate = new Map<string, number>();
    for (const r of rows) {
      const d = shortDate(r.f.date as string | null);
      if (d) byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
    const list = [...byDate].sort((a, b) => b[1] - a[1]);
    if (!list.length) return null;
    return (
      <span className="sm-map-dates">
        {list.slice(0, 3).map(([d, n]) => <span key={d}><em>{d}</em>{n}곳</span>)}
        {list.length > 3 && <span className="sm-map-more">외 {list.length - 3}개 날짜</span>}
      </span>
    );
  }
  if (group.block === "river") {
    const r = rows[0];
    if (!r) return null;
    return <small>{[r.name, v(r.f.kind), v(r.f.length) && `길이 ${r.f.length}km`, v(r.f.catchment) && `유역 ${r.f.catchment}㎢`].filter(Boolean).join(" · ")}</small>;
  }
  if (group.block === "gauge") {
    const r = rows[0];
    if (!r) return null;
    return <small>{[v(r.f.station) ?? r.name, v(r.f.l07) && v(r.f.l09) ? `대응수위 0.7 ${r.f.l07} / 0.9 ${r.f.l09}` : null].filter(Boolean).join(" · ")}</small>;
  }
  // 등급이 있는 구분 — 등급별 곳 수
  const byGrade = new Map<string, number>();
  for (const r of rows) if (r.grade) byGrade.set(r.grade, (byGrade.get(r.grade) ?? 0) + 1);
  if (!byGrade.size) return null;
  return <small>{[...byGrade].sort((a, b) => a[0].localeCompare(b[0], "ko")).slice(0, 4).map(([g, n]) => `${gradeLabel(g)} · ${n}곳`).join(" / ")}</small>;
}

/** 「2」→「위험등급 2」, 「C」→「C등급」 — 숫자·글자 하나만 온 등급에 이름을 붙인다(개발 서버 그대로) */
export function gradeLabel(g: string): string {
  if (/^\d+$/.test(g)) return `위험등급 ${g}`;
  if (/^[A-Za-z가-힣]$/.test(g)) return `${g}등급`;
  return g;
}
