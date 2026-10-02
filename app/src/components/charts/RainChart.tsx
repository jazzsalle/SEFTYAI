"use client";
/**
 * 강우 vs 과거 피해 임계치 차트
 * 막대 = 현재 사건의 시간당 강우 (시계열), 점선 = 과거 사건에서 피해가 발생한 강우 수준
 */
interface Props {
  series: { t: string; mm: number }[];
  thresholds: { mm: number; label: string; basis: "1h" | "total" }[];
  label?: string;
  height?: number;
}

export default function RainChart({ series, thresholds, label = "시간당 강우량", height = 220 }: Props) {
  const W = 640, H = height, pl = 40, pr = 150, pt = 16, pb = 30;
  const th1 = thresholds.filter((t) => t.basis === "1h");
  const maxV = Math.max(10, ...series.map((s) => s.mm), ...th1.map((t) => t.mm)) * 1.12;
  const iw = W - pl - pr, ih = H - pt - pb;
  const bw = Math.max(4, iw / Math.max(series.length, 1) - 4);
  const y = (v: number) => pt + ih - (v / maxV) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round((maxV / 1.12) * k));
  const peak = series.reduce((a, b) => (b.mm > a.mm ? b : a), series[0] ?? { t: "", mm: 0 });
  const cross = th1.filter((t) => peak && peak.mm >= t.mm);

  return (
    <div className="rainchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 및 과거 피해 발생 강우 임계치`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="ax" strokeDasharray={v ? "2 3" : undefined} />
            <text x={pl - 6} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={pl - 6} y={pt - 4} textAnchor="end" style={{ fontSize: 10 }}>mm</text>
        {series.map((s, i) => {
          const x = pl + i * (iw / series.length) + 2;
          const over = th1.some((t) => s.mm >= t.mm);
          return (
            <g key={i}>
              <rect x={x} y={y(s.mm)} width={bw} height={pt + ih - y(s.mm)} rx={2} fill={over ? "#de3412" : s.mm >= 30 ? "#ffb114" : "#256ef4"} opacity={0.9}>
                <title>{`${s.t} · ${s.mm}mm`}</title>
              </rect>
              {(i % Math.ceil(series.length / 8) === 0 || i === series.length - 1) && (
                <text x={x + bw / 2} y={H - 10} textAnchor="middle">{s.t}</text>
              )}
            </g>
          );
        })}
        {th1.map((t, i) => (
          <g key={t.label}>
            <line x1={pl} x2={W - pr + 6} y1={y(t.mm)} y2={y(t.mm)} stroke={i === 0 ? "#a5271b" : "#6f4bd8"} strokeWidth={1.6} strokeDasharray="6 4" />
            <text x={W - pr + 10} y={y(t.mm) + 4} style={{ fontSize: 11, fontWeight: 700 }} fill={i === 0 ? "#a5271b" : "#6f4bd8"}>
              {t.mm}mm/h
            </text>
            <text x={W - pr + 10} y={y(t.mm) + 17} style={{ fontSize: 10 }}>
              {t.label.length > 18 ? t.label.slice(0, 18) + "…" : t.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="xs muted" style={{ marginTop: 4 }}>
        {peak && peak.mm > 0 ? (
          <>
            최대 <b style={{ color: "var(--c-dang-dk)" }}>{peak.mm}mm/h</b> ({peak.t})
            {cross.length > 0 ? <> — 과거 피해 발생 수준(<b>{cross.map((c) => c.label).join(", ")}</b>)을 넘었습니다.</> : <> — 과거 피해 발생 수준 미만입니다.</>}
          </>
        ) : (
          "강우 관측값 없음"
        )}
      </div>
    </div>
  );
}
