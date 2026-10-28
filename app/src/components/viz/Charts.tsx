"use client";
import "./viz.css";
import { useRef, useState } from "react";

/**
 * 시각화 부품 — T3Q Data API 값을 그대로 그린다(값 가공 없음, 축 눈금만 간추림). V1 반려, V2·V3 그대로(R25),
 * 보고 단계 묶음 막대는 표로 바꿔 지웠다(결함 7).
 * dataviz 방법: 단일 계열 = 한 색, 범주 = 고정 순서 슬롯, 막대 ≤24px·끝 4px 둥글게, 실선 헤어라인 축, 2계열 이상 범례,
 * 툴팁은 보조(값은 항상 표·글자로도 보임), 글자는 잉크 색(계열 색 아님).
 * 화면 숫자는 받은 값 그대로(fmtNum — 반올림 없음). 유엔이가 센 수는 두지 않는다(R25).
 */
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/**
 * 받은 숫자 그대로 + 정수 부분 천 단위 쉼표. 소수부는 받은 자릿수 그대로(toLocaleString 은 소수 3자리로 반올림하므로 쓰지 않음).
 * 지수 표기·NaN 등 쉼표를 넣을 수 없는 꼴은 글자 그대로.
 */
export function fmtNum(n: number): string {
  const s = String(n);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [int, frac] = s.split(".");
  return int.replace(/\B(?=(\d{3})+$)/g, ",") + (frac === undefined ? "" : `.${frac}`);
}

/** 축 눈금용 간추린 숫자(원 단위 큰 수) — 막대 끝 값 표기는 원값 그대로 */
export function compactKo(n: number) {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  if (a >= 1e8) return `${(n / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  if (a >= 1e4) return `${(n / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`;
  return n.toLocaleString("ko-KR");
}

type Tip = { x: number; y: number; value: string; label: string } | null;
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.PointerEvent | React.FocusEvent, value: string, label: string) => {
    const r = box.current?.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r) return;
    const x = "clientX" in e ? e.clientX - r.left + 12 : t.right - r.left + 8;
    const y = "clientY" in e ? e.clientY - r.top + 12 : t.top - r.top;
    setTip({ x: Math.min(x, r.width - 200), y, value, label });
  };
  const el = tip ? (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.value}</b>
      {tip.label}
    </div>
  ) : null;
  return { box, show, hide: () => setTip(null), el };
}

const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
/** 축 상한을 깔끔한 값으로(1·2·2.5·5 × 10^k 간격 4칸) — 값 자체는 바꾸지 않고 축만 */
export function niceMax(v: number, n = 4) {
  if (v <= 0) return 1;
  const raw = v / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? 10 * p;
  return step * n;
}

/** 가로 막대(단일 계열) — 이름·값을 원값 그대로 표기. max 를 주면 고정 축(예: 유사도 0~100) */
export function BarList({ title, sub, items, max, unit = "", fmt, axisFmt, ariaLabel }: {
  title: string;
  sub?: string;
  items: { label: string; value: number; hint?: string }[];
  max?: number;
  unit?: string;
  fmt?: (v: number) => string;
  axisFmt?: (v: number) => string;
  ariaLabel: string;
}) {
  const t = useTip();
  const top = max ?? niceMax(Math.max(1, ...items.map((i) => i.value)));
  const show = fmt ?? ((v: number) => (typeof v === "number" ? `${fmtNum(v)}${unit}` : "—"));
  return (
    <figure className="viz" ref={t.box} role="img" aria-label={ariaLabel}>
      <figcaption className="viz-title">{title}</figcaption>
      {sub && <div className="viz-sub">{sub}</div>}
      <div className="viz-bars">
        {items.map((it, i) => (
          <div key={i} style={{ display: "contents" }}>
            <span className="lb" title={it.label}>{it.label}</span>
            <div className="viz-track">
              <span className="grids">{ticks(top).slice(1, -1).map((g) => <span key={g} className="grid" style={{ left: `${(g / top) * 100}%` }} />)}</span>
              <span
                className="viz-bar"
                tabIndex={0}
                aria-label={`${it.label} ${show(it.value)}`}
                style={{ width: `${Math.max(0, Math.min(100, (it.value / top) * 100))}%` }}
                onPointerMove={(e) => t.show(e, show(it.value), [it.label, it.hint].filter(Boolean).join(" · "))}
                onPointerLeave={t.hide}
                onFocus={(e) => t.show(e, show(it.value), [it.label, it.hint].filter(Boolean).join(" · "))}
                onBlur={t.hide}
              />
              <span className="val">{show(it.value)}</span>
            </div>
          </div>
        ))}
        <span />
        <div className="viz-axis">{ticks(top).map((g) => <span key={g}>{(axisFmt ?? ((v: number) => v.toLocaleString("ko-KR")))(g)}</span>)}</div>
      </div>
      {t.el}
    </figure>
  );
}

/** 누적 가로 막대(부분→전체) — V2 요인군 기여(합 = 유사도 점수). 축은 scale 상한(0~100) 고정. 같은 이름이 두 번 와도 조각마다 따로 */
export function StackedBar({ title, sub, parts, max, total, ariaLabel }: {
  title: string;
  sub?: string;
  parts: { key: string; label: string; value: number; color: string; note?: string }[];
  max: number;
  total?: string;
  ariaLabel: string;
}) {
  const t = useTip();
  return (
    <figure className="viz" ref={t.box} role="img" aria-label={ariaLabel}>
      <figcaption className="viz-title">{title}{total ? <span className="viz-sub" style={{ marginLeft: 8 }}>{total}</span> : null}</figcaption>
      {sub && <div className="viz-sub">{sub}</div>}
      <div className="viz-stack">
        {parts.map((p, i) => (
          <span
            key={`${i}:${p.key}`}
            className="seg"
            tabIndex={0}
            aria-label={`${p.label} ${p.value}`}
            style={{ width: `${(p.value / max) * 100}%`, background: p.color }}
            onPointerMove={(e) => t.show(e, `${fmtNum(p.value)}점`, [p.label, p.note].filter(Boolean).join(" · "))}
            onPointerLeave={t.hide}
            onFocus={(e) => t.show(e, `${fmtNum(p.value)}점`, [p.label, p.note].filter(Boolean).join(" · "))}
            onBlur={t.hide}
          />
        ))}
        <span className="rest" aria-hidden />
      </div>
      <div className="viz-axis">{ticks(max).map((g) => <span key={g}>{g}</span>)}</div>
      <div className="viz-legend">
        {parts.map((p, i) => <span key={`${i}:${p.key}`}><span className="sw" style={{ background: p.color }} />{p.label}<b>{fmtNum(p.value)}</b>{p.note ? ` (${p.note})` : ""}</span>)}
      </div>
      {t.el}
    </figure>
  );
}

/** 시간축 점 타임라인 — V3 (범주별 줄, 점 = 기록 하나). 시각은 T3Q occurred_at 그대로 배치·표시. 줄 이름은 받은 분류 이름만(센 수 없음) */
export function Timeline({ title, sub, items, ariaLabel }: {
  title: string;
  sub?: string;
  items: { at: string; category: string; label: string; detail?: string }[];
  ariaLabel: string;
}) {
  const t = useTip();
  const ok = items.filter((i) => !Number.isNaN(Date.parse(i.at)));
  if (!ok.length) return null;
  const ts = ok.map((i) => Date.parse(i.at));
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const span = Math.max(1, hi - lo);
  const cats = [...new Set(ok.map((i) => i.category))];
  const pos = (at: string) => `${((Date.parse(at) - lo) / span) * 100}%`;
  const fmtT = (ms: number) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <figure className="viz viz-tl" ref={t.box} role="img" aria-label={ariaLabel}>
      <figcaption className="viz-title">{title}</figcaption>
      {sub && <div className="viz-sub">{sub}</div>}
      {cats.map((c, ci) => (
        <div key={c} className="lane">
          <span className="lane-lb">{c}</span>
          <div className="plot">
            {ok.filter((i) => i.category === c).map((i, k) => (
              <span
                key={k}
                className="dot"
                tabIndex={0}
                aria-label={`${i.at} ${i.label}`}
                style={{ left: pos(i.at), background: SERIES[ci % SERIES.length] }}
                onPointerMove={(e) => t.show(e, i.at, [i.label, i.detail].filter(Boolean).join(" · "))}
                onPointerLeave={t.hide}
                onFocus={(e) => t.show(e, i.at, [i.label, i.detail].filter(Boolean).join(" · "))}
                onBlur={t.hide}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="ticks">{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f} style={{ left: `${f * 100}%` }}>{fmtT(lo + span * f)}</span>)}</div>
      {cats.length > 1 && (
        <div className="viz-legend">{cats.map((c, ci) => <span key={c}><span className="sw" style={{ background: SERIES[ci % SERIES.length], borderRadius: "50%" }} />{c}</span>)}</div>
      )}
      {t.el}
    </figure>
  );
}
