"use client";
import type { ReactNode } from "react";

/**
 * 인포그래픽 공통 조각 — 기사·행안부 그래픽 문법(사용자가 준 참고 그림 2026-11-02): 띠 제목(알약) · 큰 숫자 헤드라인 · 아이콘+숫자 타일.
 * 값은 부르는 쪽이 받은 그대로 넘긴다. 빨강 없음(색은 viz.css 계열색).
 */
export function Fig({ title, src, label, children, foot, tone = "a" }: { title: string; src: string; label: string; children: ReactNode; foot?: ReactNode; tone?: "a" | "b" | "c" }) {
  return (
    <figure className="di-fig" role="img" aria-label={label}>
      <figcaption className="di-cap">
        <span className={`di-pill t-${tone}`}>{title}</span>
        <span className="xs muted">{src}</span>
      </figcaption>
      {children}
      {foot && <div className="di-foot xs muted">{foot}</div>}
    </figure>
  );
}

/** 큰 숫자 헤드라인 — 값(큰 글자)·단위·설명 */
export function Headline({ items }: { items: { v: string; unit?: string; lb: string; icon?: ReactNode; tone?: "warn" | "cond" | "" }[] }) {
  return (
    <div className="di-head" role="list">
      {items.map((h, i) => (
        <div key={i} className={`di-head-item ${h.tone ?? ""}`} role="listitem">
          {h.icon && <span className="di-head-ic">{h.icon}</span>}
          <span className="di-head-v"><b>{h.v}</b>{h.unit && <small>{h.unit}</small>}</span>
          <span className="di-head-lb">{h.lb}</span>
        </div>
      ))}
    </div>
  );
}
