"use client";
import { useId } from "react";
import { anchorOf, fitBox, mergePoints, pathD, projector, type MapShape } from "./infoMap";

/**
 * 정적 지도 SVG — 받은 도형(면·선·점)을 번호 표지와 함께 그린다. 타일 지도 없이 그리므로 빠르다.
 * 번호·이름·색은 부르는 쪽이 정한다(답 글 등장 순 등). 축척 막대 1km 와 북쪽 표시는 투영에서 계산.
 * 이름 글자는 오른쪽 가장자리에 가까우면 왼쪽에 쓰고, 양옆에 글자 여백(sidePad)을 둬 잘리지 않게 한다.
 */
export interface MapLabel { num: string; name: string; tone?: "a" | "b" | "c"; /** 말풍선 둘째 줄(받은 값 — 면적·통제 기준 등) */ sub?: string }
const SIDE = 110;
/** 말풍선 상자 너비 어림 — 한글은 글자 크기만큼, 그 밖(숫자·기호)은 0.6배 */
const textW = (s: string, fs: number) => [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.6), 0);
export default function InfoMapSvg({ shapes, labels, width = 320, maxH = 420, small, onPick, ariaHidden = true }: {
  shapes: MapShape[];
  labels: Map<string, MapLabel>;
  width?: number;
  maxH?: number;
  small?: boolean;
  onPick?: (ref: string) => void;
  ariaHidden?: boolean;
}) {
  const gid = `im-grid-${useId().replace(/:/g, "")}`;
  const box = fitBox(shapes);
  if (!box) return null;
  const P = projector(box, width, maxH);
  const areas = shapes.filter((s) => s.kind === "area");
  const lines = shapes.filter((s) => s.kind === "line");
  const points = mergePoints(shapes.filter((s) => s.kind === "point" && s.ref).flatMap((s) => s.paths.map((p) => ({ ref: s.ref!, c: p[0] }))));
  const r = small ? 8 : 11;
  const km = Math.min(P.kmPx, P.W * 0.4);
  const kmLabel = P.kmPx <= P.W * 0.4 ? "1km" : `${(km / P.kmPx).toFixed(1)}km`;
  const tone = (refs: string[]) => labels.get(refs[0])?.tone ?? "a";
  type MarkIn = { key: string; x: number; y: number; nums: string; name: string; sub?: string; t: string; pick?: () => void };
  const marks: MarkIn[] = [];
  // 면·선의 번호 — 꼭짓점 평균 자리
  [...areas, ...lines].forEach((s, i) => {
    const lb = s.ref ? labels.get(s.ref) : undefined;
    const a = anchorOf(s);
    if (!lb || !a) return;
    const [x, y] = P.px(a);
    marks.push({ key: `n${i}`, x, y, nums: lb.num, name: lb.name, sub: lb.sub, t: lb.tone ?? "a", pick: onPick && s.ref ? () => onPick(s.ref!) : undefined });
  });
  points.forEach((mk, i) => {
    const nums = [...new Set(mk.refs.map((rf) => labels.get(rf)?.num).filter(Boolean) as string[])];
    if (!nums.length) return;
    const [x, y] = P.px(mk.c);
    const names = mk.refs.map((rf) => labels.get(rf)?.name).filter(Boolean).join("·");
    const sub = mk.refs.map((rf) => labels.get(rf)?.sub).find(Boolean);
    marks.push({ key: `p${i}`, x, y, nums: nums.join(""), name: names, sub, t: tone(mk.refs) ?? "a", pick: onPick ? () => onPick(mk.refs[0]) : undefined });
  });
  /**
   * 말풍선 자리 정하기 — 기본은 오른쪽(가장자리면 왼쪽), 앞서 놓은 말풍선·표지와 겹치면 반대쪽 → 위아래로 비켜 놓는다(그리기 자리만, 값과 무관).
   * 상자 너비는 글자 수로 어림.
   */
  // 표지가 많으면(9곳 이상) 말풍선은 빼고 번호만 — 이름은 옆 범례에 있다. 여백도 그만큼 줄인다
  const calls = !small && marks.length <= 8;
  const side = small ? 0 : calls ? SIDE : 14;
  type Box2 = { x: number; y: number; w: number; h: number };
  const hit = (a: Box2, b: Box2) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const taken: Box2[] = !calls ? [] : marks.map((m) => { const w = m.nums.length > 1 ? 9 * m.nums.length + 10 : r * 2; return { x: m.x - w / 2, y: m.y - r, w, h: r * 2 }; });
  const placed = marks.map((m, mi) => {
    const w = m.nums.length > 1 ? 9 * m.nums.length + 10 : r * 2;
    if (!calls || !m.name) return { m, w, call: null };
    const bw = Math.max(textW(m.name, 10.5), m.sub ? textW(m.sub, 9.5) : 0) + 12;
    const bh = m.sub ? 30 : 18;
    const pref = m.x > P.W * 0.62 ? -1 : 1;
    const tries: [number, number][] = [[pref, 0], [-pref, 0], [pref, bh + 4], [pref, -(bh + 4)], [-pref, bh + 4], [-pref, -(bh + 4)], [pref, 2 * (bh + 4)], [pref, -2 * (bh + 4)]];
    const make = ([dir, dy]: [number, number]) => {
      const x0 = m.x + dir * (w / 2 + 1);
      const bx = dir < 0 ? x0 - 8 - bw : x0 + 8;
      const by = Math.min(Math.max(m.y + dy - bh / 2, 0), P.H - bh);
      return { dir, x0, b: { x: bx, y: by, w: bw, h: bh } };
    };
    const others = taken.filter((_, i) => i !== mi);
    const ok = (c: ReturnType<typeof make>) => c.b.x >= -side && c.b.x + c.b.w <= P.W + side && !others.some((o) => hit(o, c.b));
    const pickC = tries.map(make).find(ok) ?? make(tries[0]);
    taken.push(pickC.b);
    return { m, w, call: pickC };
  });
  /** 번호 표지 + 말풍선(흰 상자 + 지시선) */
  const Mark = ({ m, w, call }: (typeof placed)[number]) => {
    const { x, y, nums, name, sub, t, pick } = m;
    const wide = nums.length > 1;
    const left = call ? call.dir < 0 : false;
    const tx = call ? (left ? call.b.x + call.b.w - 6 : call.b.x + 6) : 0;
    const cy = call ? call.b.y + call.b.h / 2 : y;
    const anchor = left ? "end" : "start";
    return (
      <g className={`im-mk t-${t}`} onClick={pick}>
        {call && <line className="im-lead" x1={call.x0} y1={y} x2={left ? call.b.x + call.b.w : call.b.x} y2={cy} />}
        {call && <rect className="im-call" x={call.b.x} y={call.b.y} width={call.b.w} height={call.b.h} rx={4} />}
        {wide ? <rect x={x - w / 2} y={y - r} width={w} height={r * 2} rx={r} /> : <circle cx={x} cy={y} r={r} />}
        <text x={x} y={y + 4} textAnchor="middle">{nums}</text>
        {call && <text x={tx} y={sub ? cy - 2 : cy + 4} textAnchor={anchor} className="im-name">{name}</text>}
        {call && sub && <text x={tx} y={cy + 10} textAnchor={anchor} className="im-sub">{sub}</text>}
      </g>
    );
  };
  return (
    <svg className={small ? "im-map small" : "im-map"} viewBox={`${-side} 0 ${(P.W + side * 2).toFixed(0)} ${P.H.toFixed(0)}`} style={{ width: small ? undefined : P.W + side * 2, maxWidth: "100%" }} aria-hidden={ariaHidden}>
      {/* 바탕 — 옅은 땅색 + 가는 격자(꾸밈, 값 아님) */}
      <defs>
        <pattern id={gid} width={24} height={24} patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" className="im-grid" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={P.W.toFixed(0)} height={P.H.toFixed(0)} className="im-ground" />
      <rect x={0} y={0} width={P.W.toFixed(0)} height={P.H.toFixed(0)} fill={`url(#${gid})`} className="im-gridbox" />
      {areas.map((s, i) => (
        <g key={`a${i}`} className={`im-area ${s.ref && labels.has(s.ref) ? "on" : ""}`}>
          {s.paths.map((p, j) => <path key={j} d={pathD(p, P.px, true)} />)}
        </g>
      ))}
      {lines.map((s, i) => (
        <g key={`l${i}`} className="im-line">
          {s.paths.map((p, j) => <path key={j} d={pathD(p, P.px, false)} />)}
        </g>
      ))}
      {/* 축척·북쪽 — 표지 아래 층 */}
      <g className="im-scale" transform={`translate(8 ${(P.H - 10).toFixed(0)})`}>
        <rect className="im-scale-a" x={0} y={-2} width={(km / 2).toFixed(1)} height={4} />
        <rect className="im-scale-b" x={(km / 2).toFixed(1)} y={-2} width={(km / 2).toFixed(1)} height={4} />
        <text x={(km + 4).toFixed(1)} y={3.5} textAnchor="start">{kmLabel}</text>
      </g>
      {/* 방위 — 북쪽 화살촉 */}
      <g className="im-compass" transform={`translate(${(P.W - 14).toFixed(0)} 16)`}>
        <path d="M0 -9 L5 6 L0 3 L-5 6 Z" />
        <text x={0} y={18} textAnchor="middle" className="im-north">북</text>
      </g>
      {/* 표지마다 한 묶음(지시선·말풍선·번호) */}
      {placed.map((p) => <Mark key={p.m.key} {...p} />)}
    </svg>
  );
}
