"use client";
/**
 * 지도 위 범례 카드 — 종류마다 기호 · 이름 · 지도에 그린 곳 수, 누르면 그 종류만 보기(거르기).
 *
 * - 곳 수는 지도에 그린 대상(features)을 범례 항목별로 센 것 — 답의 값이 아니라 범례 표시다(「지도 표시 n곳」).
 * - 세부 종류(지하차도·펌프장 …)는 받은 display_name 에 그 낱말이 있을 때만 묶는다. 설명 문장은 두지 않는다.
 * - 좁은 지도(휴대폰)에서는 접힌 채로 시작 — 접으면 기호와 곳 수만 한 줄로.
 */
import "./map.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MapFeature } from "./MapView";
import {
  LEGEND, filterKey, glyphDataUri, isApproxPrecision, isRangePrecision, lookOf, pinDataUri, shade,
  type LegendEntry, type SubKind,
} from "./mapStyle";

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

interface Group {
  entry: LegendEntry;
  n: number;
  kinds: Kinds;
  /** 세부 종류별 곳 수 — 키 `_` 는 세부 종류를 고르지 못한 것 */
  subs: Map<string, { sub: SubKind | null; n: number }>;
}

export interface MapLegendPanelProps {
  /** 범례에 셀 대상 (보통 지금 답변의 대상) */
  features: MapFeature[];
  filter: string | null;
  onFilter: (key: string | null) => void;
  /** 행정경계를 켜 두었으면 true */
  boundary?: boolean;
  /** 다른 답변의 흐린 표식이 지도에 있으면 true */
  dimOthers?: boolean;
}

export default function MapLegendPanel({ features, filter, onFilter, boundary, dimOthers }: MapLegendPanelProps) {
  const box = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  // 좁은 지도에서는 접어서 시작 (처음 한 번)
  useEffect(() => {
    const w = box.current?.parentElement?.clientWidth ?? 0;
    if (w && w < 560) setOpen(false);
  }, []);

  const { groups, total, approx, range } = useMemo(() => {
    const byId = new Map<string, Group>();
    const seen = new Set<string>();
    let approx = false;
    let range = false;
    for (const f of features) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      const look = lookOf(f.entityType, f.displayName);
      let g = byId.get(look.entry.id);
      if (!g) {
        g = { entry: look.entry, n: 0, kinds: { point: false, line: false, area: false }, subs: new Map() };
        byId.set(look.entry.id, g);
      }
      g.n += 1;
      collectKinds(f.geometry, g.kinds);
      const sk = look.sub?.id ?? "_";
      const s = g.subs.get(sk);
      if (s) s.n += 1;
      else g.subs.set(sk, { sub: look.sub, n: 1 });
      approx ||= isApproxPrecision(f.precision);
      range ||= isRangePrecision(f.precision);
    }
    const groups = LEGEND.map((e) => byId.get(e.id)).filter((g): g is Group => !!g);
    return { groups, total: seen.size, approx, range };
  }, [features]);

  if (!groups.length) return null;
  const max = Math.max(...groups.map((g) => g.n));
  const activeId = filter?.split("/")[0] ?? null;
  const filterLabel = (() => {
    if (!filter) return null;
    const [eid, sid] = filter.split("/");
    const g = groups.find((x) => x.entry.id === eid);
    if (!g) return null;
    if (sid === undefined) return g.entry.label;
    return sid === "_" ? "그 밖" : (g.subs.get(sid)?.sub?.label ?? g.entry.label);
  })();
  const pick = (k: string) => onFilter(filter === k ? null : k);

  return (
    <section ref={box} className={`mlp${open ? "" : " folded"}`} aria-label="지도 범례">
      <header className="mlp-hd">
        <span className="mlp-ttl">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4l4-1.8 5 1.8 4-1.8v9.8l-4 1.8-5-1.8-4 1.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5.5 2.2v9.8M10.5 4v9.8" stroke="currentColor" strokeWidth="1.5" /></svg>
          지도 범례
        </span>
        <span className="mlp-total">지도 표시 <b>{total}</b>곳</span>
        <button type="button" className="mlp-fold" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "범례 접기" : "범례 펼치기"}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </header>

      {/* 접었을 때 — 기호와 곳 수만 한 줄 (눌러도 거르기) */}
      {!open && (
        <div className="mlp-strip" role="group" aria-label="종류별 지도 표시">
          {groups.map((g) => {
            const k = filterKey(g.entry.id);
            const on = activeId === g.entry.id;
            return (
              <button key={g.entry.id} type="button" className={`mlp-chip${on ? " on" : ""}${activeId && !on ? " off" : ""}`}
                style={{ "--c": g.entry.pin } as CSSProperties} aria-pressed={on} onClick={() => pick(k)}
                aria-label={`${g.entry.label} 지도 표시 ${g.n}곳${on ? " · 이 종류만 보는 중" : ""}`}>
                <i style={{ backgroundImage: `url("${pinDataUri({ pin: g.entry.pin, glyph: g.entry.glyph, shape: g.entry.shape })}")` }} aria-hidden="true" />
                <b>{g.n}</b>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <>
          {filterLabel && (
            <div className="mlp-filter" role="status">
              <span><b>{filterLabel}</b>만 보는 중</span>
              <button type="button" onClick={() => onFilter(null)}>모두 보기</button>
            </div>
          )}
          <ul className="mlp-list">
            {groups.map((g) => {
              const e = g.entry;
              const k = filterKey(e.id);
              const on = filter === k;
              const inGroup = activeId === e.id;
              const named = [...g.subs.values()].filter((s) => s.sub);
              const style = { "--c": e.pin, "--c2": shade(e.pin, 0.3), "--s": e.stroke, "--f": e.fill, "--w": `${Math.max(8, (g.n / max) * 100)}%` } as CSSProperties;
              return (
                <li key={e.id} className={`mlp-item${inGroup ? " on" : ""}${activeId && !inGroup ? " off" : ""}`} style={style}>
                  <button type="button" className="mlp-row" aria-pressed={on} onClick={() => pick(k)}
                    title={on ? "다시 누르면 모두 보기" : "이 종류만 보기"}>
                    <span className="mlp-badge" aria-hidden="true">
                      <i style={{ backgroundImage: `url("${glyphDataUri(e.glyph, shade(e.pin, -0.12))}")` }} />
                    </span>
                    <span className="mlp-txt">
                      <span className="mlp-lab">{e.label}</span>
                      <span className="mlp-sw" aria-hidden="true">
                        {g.kinds.point && <i className="sw-pin" style={{ backgroundImage: `url("${pinDataUri({ pin: e.pin, glyph: e.glyph, shape: e.shape })}")` }} />}
                        {g.kinds.line && <i className="sw-line" />}
                        {g.kinds.area && <i className={`sw-area p-${e.pattern ?? (e.hatch ? "hatch" : "soft")}`} />}
                      </span>
                    </span>
                    <span className="mlp-cnt"><b>{g.n}</b>곳</span>
                    <span className="mlp-bar" aria-hidden="true"><i /></span>
                  </button>
                  {named.length > 0 && (
                    <div className="mlp-subs" role="group" aria-label={`${e.label} 세부 종류`}>
                      {[...g.subs.entries()].map(([sid, s]) => {
                        const sk = filterKey(e.id, sid === "_" ? null : sid);
                        const son = filter === sk;
                        return (
                          <button key={sid} type="button" className={`mlp-sub${son ? " on" : ""}`} aria-pressed={son} onClick={() => pick(sk)}>
                            {s.sub ? <i style={{ backgroundImage: `url("${glyphDataUri(s.sub.glyph, shade(e.pin, -0.12))}")` }} aria-hidden="true" /> : <i className="etc" aria-hidden="true" />}
                            {s.sub ? s.sub.label : "그 밖"}
                            <b>{s.n}</b>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(approx || range || boundary || dimOthers) && (
            <footer className="mlp-keys">
              {approx && <span><i className="k-ring" aria-hidden="true" />근사 위치</span>}
              {range && <span><i className="k-box" aria-hidden="true" />범위 사각형</span>}
              {boundary && <span><i className="k-bnd" aria-hidden="true" />행정경계</span>}
              {dimOthers && <span><i className="k-dim" aria-hidden="true" />흐린 표식 = 다른 답변</span>}
            </footer>
          )}
        </>
      )}
    </section>
  );
}
