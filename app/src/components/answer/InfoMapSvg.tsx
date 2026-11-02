"use client";
import { anchorOf, fitBox, mergePoints, pathD, projector, type MapShape } from "./infoMap";

/**
 * 정적 지도 SVG — 받은 도형(면·선·점)을 번호 표지와 함께 그린다. 타일 지도 없이 그리므로 빠르다.
 * 번호·이름·색은 부르는 쪽이 정한다(답 글 등장 순 등). 축척 막대 1km 와 북쪽 표시는 투영에서 계산.
 * 이름 글자는 오른쪽 가장자리에 가까우면 왼쪽에 쓰고, 양옆에 글자 여백(sidePad)을 둬 잘리지 않게 한다.
 */
export interface MapLabel { num: string; name: string; tone?: "a" | "b" | "c"; /** 말풍선 둘째 줄(받은 값 — 면적·통제 기준 등) */ sub?: string }
const SIDE = 96;
export default function InfoMapSvg({ shapes, labels, width = 320, maxH = 420, small, onPick, ariaHidden = true }: {
  shapes: MapShape[];
  labels: Map<string, MapLabel>;
  width?: number;
  maxH?: number;
  small?: boolean;
  onPick?: (ref: string) => void;
  ariaHidden?: boolean;
}) {
  const box = fitBox(shapes);
  if (!box) return null;
  const P = projector(box, width, maxH);
  const side = small ? 0 : SIDE;
  const areas = shapes.filter((s) => s.kind === "area");
  const lines = shapes.filter((s) => s.kind === "line");
  const points = mergePoints(shapes.filter((s) => s.kind === "point" && s.ref).flatMap((s) => s.paths.map((p) => ({ ref: s.ref!, c: p[0] }))));
  const r = small ? 8 : 11;
  const km = Math.min(P.kmPx, P.W * 0.4);
  const kmLabel = P.kmPx <= P.W * 0.4 ? "1km" : `${(km / P.kmPx).toFixed(1)}km`;
  const tone = (refs: string[]) => labels.get(refs[0])?.tone ?? "a";
  /** 번호 표지 + 이름(오른쪽, 가장자리면 왼쪽) + 둘째 줄 */
  const Mark = ({ x, y, nums, name, sub, t, pick }: { x: number; y: number; nums: string; name: string; sub?: string; t: string; pick?: () => void }) => {
    const wide = nums.length > 1;
    const w = wide ? 9 * nums.length + 10 : r * 2;
    const leftSide = x > P.W * 0.62;
    const tx = leftSide ? x - w / 2 - 3 : x + w / 2 + 3;
    const anchor = leftSide ? "end" : "start";
    return (
      <g className={`im-mk t-${t}`} onClick={pick}>
        {wide ? <rect x={x - w / 2} y={y - r} width={w} height={r * 2} rx={r} /> : <circle cx={x} cy={y} r={r} />}
        <text x={x} y={y + 4} textAnchor="middle">{nums}</text>
        {!small && name && <text x={tx} y={sub ? y + 1 : y + 4} textAnchor={anchor} className="im-name">{name}</text>}
        {!small && sub && <text x={tx} y={y + 12} textAnchor={anchor} className="im-sub">{sub}</text>}
      </g>
    );
  };
  return (
    <svg className={small ? "im-map small" : "im-map"} viewBox={`${-side} 0 ${(P.W + side * 2).toFixed(0)} ${P.H.toFixed(0)}`} style={{ width: small ? undefined : P.W + side * 2, maxWidth: "100%" }} aria-hidden={ariaHidden}>
      <rect x={0} y={0} width={P.W.toFixed(0)} height={P.H.toFixed(0)} className="im-ground" />
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
      {/* 면·선의 번호 — 꼭짓점 평균 자리 */}
      {[...areas, ...lines].map((s, i) => {
        const lb = s.ref ? labels.get(s.ref) : undefined;
        const a = anchorOf(s);
        if (!lb || !a) return null;
        const [x, y] = P.px(a);
        return <Mark key={`n${i}`} x={x} y={y} nums={lb.num} name={lb.name} sub={lb.sub} t={lb.tone ?? "a"} pick={onPick && s.ref ? () => onPick(s.ref!) : undefined} />;
      })}
      {points.map((mk, i) => {
        const nums = [...new Set(mk.refs.map((rf) => labels.get(rf)?.num).filter(Boolean) as string[])];
        if (!nums.length) return null;
        const [x, y] = P.px(mk.c);
        const names = mk.refs.map((rf) => labels.get(rf)?.name).filter(Boolean).join("·");
        const sub = mk.refs.map((rf) => labels.get(rf)?.sub).find(Boolean);
        return <Mark key={`p${i}`} x={x} y={y} nums={nums.join("")} name={names} sub={sub} t={tone(mk.refs) ?? "a"} pick={onPick ? () => onPick(mk.refs[0]) : undefined} />;
      })}
      {/* 축척·북쪽 */}
      <g className="im-scale" transform={`translate(8 ${(P.H - 10).toFixed(0)})`}>
        <line x1={0} y1={0} x2={km.toFixed(1)} y2={0} />
        <line x1={0} y1={-3} x2={0} y2={3} />
        <line x1={km.toFixed(1)} y1={-3} x2={km.toFixed(1)} y2={3} />
        <text x={(km / 2).toFixed(1)} y={-4} textAnchor="middle">{kmLabel}</text>
      </g>
      <text x={P.W - 8} y={14} textAnchor="end" className="im-north">북 ↑</text>
    </svg>
  );
}
