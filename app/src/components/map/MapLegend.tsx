/**
 * 지도 범례 (Figma 207001 — 지도 아래 · 읽기 전용 · 표시된 종류만 · 넘치면 줄바꿈)
 * features 에 실제로 있는 entity_type 범주만 보이고, 범주마다 핀 + (선·면이 있으면) 선·면 견본을 붙인다.
 * 훅·이벤트가 없어 서버/클라이언트 어디서나 쓸 수 있다. MapView 의 타입만 가져와 OpenLayers 를 끌어오지 않는다.
 */
import "./map.css";
import type { CSSProperties } from "react";
import type { MapFeature } from "./MapView";
import { LEGEND, isApproxPrecision, isRangePrecision, legendOf, pinDataUri } from "./mapStyle";

type Kinds = { point: boolean; line: boolean; area: boolean };

function collectKinds(g: unknown, k: Kinds): void {
  if (!g || typeof g !== "object") return;
  const t = (g as { type?: unknown }).type;
  if (typeof t !== "string") return;
  if (t === "GeometryCollection") {
    const parts = (g as { geometries?: unknown }).geometries;
    if (Array.isArray(parts)) parts.forEach((x) => collectKinds(x, k));
  } else if (t.endsWith("Point")) k.point = true;
  else if (t.endsWith("LineString")) k.line = true;
  else if (t.endsWith("Polygon")) k.area = true;
}

export interface MapLegendProps {
  features: MapFeature[];
  /** 주면 다른 작업(답변)의 흐린 표식 설명을 덧붙인다 */
  activeJobId?: string | null;
  /** VWorld 행정경계를 켜 두었으면 true */
  boundary?: boolean;
  className?: string;
}

export function MapLegend({ features, activeJobId, boundary, className }: MapLegendProps) {
  const found = new Map<string, Kinds>();
  let approx = false;
  let range = false;
  let dim = false;
  for (const f of features) {
    const id = legendOf(f.entityType).id;
    let k = found.get(id);
    if (!k) {
      k = { point: false, line: false, area: false };
      found.set(id, k);
    }
    collectKinds(f.geometry, k);
    approx ||= isApproxPrecision(f.precision);
    range ||= isRangePrecision(f.precision);
    dim ||= !!activeJobId && f.jobId !== activeJobId;
  }
  const entries = LEGEND.filter((e) => found.has(e.id));
  if (!entries.length) return null;

  return (
    <div className={`sa-map-legend${className ? ` ${className}` : ""}`} role="group" aria-label="지도 범례">
      <b>범례</b>
      <ul>
        {entries.map((e) => {
          const k = found.get(e.id)!;
          return (
            <li key={e.id} className="sa-lg-item">
              <i className="sa-lg-pin" style={{ backgroundImage: `url("${pinDataUri(e)}")` }} aria-hidden="true" />
              {k.line && <i className="sa-lg-line" style={{ "--c": e.stroke } as CSSProperties} aria-hidden="true" />}
              {k.area && (
                <i className={`sa-lg-area${e.hatch ? " hatch" : ""}`} style={{ "--c": e.stroke, "--f": e.fill } as CSSProperties} aria-hidden="true" />
              )}
              {e.label}
            </li>
          );
        })}
        {approx && (
          <li className="sa-lg-item"><i className="sa-lg-ring" aria-hidden="true" />근사 위치(행정구역 중심)</li>
        )}
        {range && (
          <li className="sa-lg-item"><i className="sa-lg-box" aria-hidden="true" />범위 사각형(원천 도형 아님)</li>
        )}
        {boundary && (
          <li className="sa-lg-item"><i className="sa-lg-bnd" aria-hidden="true" />행정경계</li>
        )}
        {dim && (
          <li className="sa-lg-item sa-lg-note">
            <i className="sa-lg-pin sa-lg-dim" style={{ backgroundImage: `url("${pinDataUri(entries[0])}")` }} aria-hidden="true" />
            흐린 표식은 다른 답변의 대상
          </li>
        )}
      </ul>
    </div>
  );
}

export default MapLegend;
