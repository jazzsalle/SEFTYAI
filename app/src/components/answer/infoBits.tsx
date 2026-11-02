"use client";
import type { ReactNode } from "react";

/**
 * 인포그래픽 공통 조각 — 기사·행안부 그래픽 문법(사용자가 준 참고 그림 2026-11-02): 띠 제목(알약) · 큰 숫자 헤드라인 · 아이콘+숫자 타일.
 * 값은 부르는 쪽이 받은 그대로 넘긴다. 빨강 없음(색은 viz.css 계열색).
 * 그림 틀(11/2 디자인 개편): 위 굵은 색 줄 → 알약(제목 앞부분) + 큰 제목(「 — 」 뒤) → 본문 → 가는 줄 아래 각주·출처. 제목 글자는 그대로 나눠 놓기만 한다.
 */
export function Fig({ title, src, label, children, foot, tone = "a" }: { title: string; src: string; label: string; children: ReactNode; foot?: ReactNode; tone?: "a" | "b" | "c" }) {
  const cut = title.indexOf(" — ");
  const lead = cut > 0 ? title.slice(0, cut) : title;
  const rest = cut > 0 ? title.slice(cut + 3) : "";
  return (
    <figure className={`di-fig t-${tone}`} role="img" aria-label={label}>
      <figcaption className="di-cap">
        <span className={`di-pill t-${tone}`}>{lead}</span>
        {rest && <span className="di-title">{rest}</span>}
      </figcaption>
      <div className="di-fig-body">{children}</div>
      <div className="di-foot">
        {foot && <div className="di-foot-note">{foot}</div>}
        <div className="di-src">{src}</div>
      </div>
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
