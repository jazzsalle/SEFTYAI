"use client";
/**
 * 지도 선택 말풍선 카드 — MapView 가 OpenLayers 오버레이 요소에 그린다.
 *
 * - 보이는 값은 받은 것만: T3Q entity_type(한글) · display_name 그대로 · EXT-01 precision(한글).
 *   세부 종류 이름(지하차도 등)은 받은 display_name 에 그 낱말이 있을 때만 붙는다.
 * - 동작은 이미 있는 것만: 답변 목록으로 이동 · 이 대상으로 확대 · 같은 종류만 보기(범례 거르기) · 닫기.
 */
import type { CSSProperties } from "react";
import type { MapFeature } from "./MapView";
import {
  approxLevel, entityTypeKo, filterKey, glyphDataUri, isRangePrecision, lookOf, precisionKo, shade,
} from "./mapStyle";

interface Props {
  f: MapFeature;
  /** 다른 답변의 대상(흐리게 그려진 것) */
  other: boolean;
  filter: string | null;
  onClose: () => void;
  onLocate?: () => void;
  onFilter?: (key: string | null) => void;
  onZoom: () => void;
}

export default function MapPopup({ f, other, filter, onClose, onLocate, onFilter, onZoom }: Props) {
  const look = lookOf(f.entityType, f.displayName);
  const c = look.entry.pin;
  const pk = precisionKo(f.precision);
  const approx = approxLevel(f.precision) > 0;
  const range = isRangePrecision(f.precision);
  const myKey = filterKey(look.entry.id, look.sub ? look.sub.id : undefined);
  const filtered = filter === myKey;
  const style = { "--c": c, "--c2": shade(c, 0.25), "--cd": shade(c, -0.2) } as CSSProperties;

  return (
    <div className="mp-card" style={style} role="dialog" aria-label={`${f.displayName ?? "이름 미제공"} 정보`}>
      <div className="mp-hd">
        <span className="mp-ic" aria-hidden="true">
          <i style={{ backgroundImage: `url("${glyphDataUri(look.glyph, shade(c, -0.12))}")` }} />
        </span>
        <span className="mp-type">
          <b>{entityTypeKo(f.entityType)}</b>
          {look.sub && <em>{look.sub.label}</em>}
        </span>
        <button type="button" className="mp-x" onClick={onClose} aria-label="말풍선 닫기">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="mp-bd">
        <strong className={`mp-name${f.displayName ? "" : " none"}`}>{f.displayName ?? "이름 미제공"}</strong>
        {(pk || other) && (
          <div className="mp-badges">
            {pk && (
              <span className={`mp-bdg${approx ? " approx" : range ? " range" : ""}`}>
                <i aria-hidden="true" />
                {pk}
              </span>
            )}
            {other && <span className="mp-bdg other">다른 답변 대상</span>}
          </div>
        )}
      </div>
      <div className="mp-act">
        {onLocate && (
          <button type="button" className="mp-btn pri" onClick={onLocate}>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            답변에서 보기
          </button>
        )}
        <button type="button" className="mp-btn" onClick={onZoom}>
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M10.4 10.4L14 14M7 5v4M5 7h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          가까이 보기
        </button>
        {onFilter && (
          <button type="button" className={`mp-btn${filtered ? " on" : ""}`} aria-pressed={filtered} onClick={() => onFilter(filtered ? null : myKey)}>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h11l-4.2 5v4.5l-2.6 1.3V8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            {filtered ? "모두 보기" : "같은 종류만"}
          </button>
        )}
      </div>
    </div>
  );
}
