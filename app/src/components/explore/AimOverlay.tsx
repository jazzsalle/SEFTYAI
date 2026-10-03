"use client";
/**
 * AI 모드 — 기상특보 기반 상황 점검 전광판 (목업 v165 special-alert 보드)
 * 모달이 아닌 오버레이 : 배경을 가리지 않고, 질문을 시작하면 상단 전광판 띠로 접혀 대화는 평소처럼 진행
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Advisory, RegionId, WeatherMode } from "@/lib/contract/agent";
import { REGIONS } from "@/lib/config";

interface AimAlert extends Advisory { mine: boolean; message: string; questions: { t: string; q: string; preset?: string }[] }
interface AimData { state: "red" | "yellow" | "green" | "gray"; ok: boolean; message: string; lastCheck: string; nextCheck: string; alerts: AimAlert[]; checks: { at: string; label: string; state: string }[] }

const ST = {
  red: { t: "즉시 상황확인·대응 검토 필요", lv: "적색 · 위험" },
  yellow: { t: "기상 변화 주시 필요", lv: "황색 · 주의" },
  green: { t: "AI 모드 작동 중", lv: "녹색 · 평시" },
  gray: { t: "확인 중 · 판단 불가", lv: "회색 · 확인 중" },
} as const;
const CALM_Q = [
  { t: "평시 점검", q: "평시에 점검해야 할 위험·취약지역은 어디인가요?" },
  { t: "반복 피해", q: "과거 피해가 반복된 곳 중 아직 정비되지 않은 위험지구는?" },
  { t: "복합 위험", q: "침수와 산사태 위험이 동시에 존재하는 지역은 어디인가요?" },
  { t: "사전 대비", q: "호우 예비특보가 나왔습니다. 미리 점검해야 할 곳과 준비할 일은?" },
  { t: "과거 사례", q: "관련 과거 사례를 보여줘" },
];
const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

function Light({ c }: { c: "red" | "amber" | "green" | "gray" }) {
  return (
    <span className="aim-light" aria-hidden>
      <span className={`lamp ${c}`} />
    </span>
  );
}

export default function AimOverlay(p: {
  region: RegionId;
  mode: WeatherMode;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onAsk: (q: string, preset?: string, region?: RegionId) => void;
  onCheck: (at: string, prev?: string) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<AimData | null>(null);
  const [pg, setPg] = useState(0);
  // 전광판 위치 이동 (끌어서 옮기고 대화는 그대로 이어감 · 더블클릭 = 원위치 · 브라우저별 기억)
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  useEffect(() => {
    try { const j = JSON.parse(localStorage.getItem("sa.aimpos") ?? "null"); if (j && typeof j.x === "number") setOff(j); } catch {}
  }, []);
  const savePos = (v: { x: number; y: number }) => { setOff(v); try { localStorage.setItem("sa.aimpos", JSON.stringify(v)); } catch {} };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g) return;
    const W = window.innerWidth, H = window.innerHeight;
    setOff({ x: Math.max(-W * 0.7, Math.min(W * 0.7, g.ox + e.clientX - g.sx)), y: Math.max(-10, Math.min(H - 160, g.oy + e.clientY - g.sy)) });
  };
  const onUp = () => { if (drag.current) { drag.current = null; savePos(off); } };
  const load = useCallback(() => {
    fetch(`/api/aim?region=${p.region}&mode=${p.mode}`).then((r) => r.json()).then((j: AimData) => { setD(j); setPg(0); }).catch(() => setD(null));
  }, [p.region, p.mode]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 10 * 60e3); // ⑥ 정기 재점검 (10분)
    return () => window.clearInterval(t);
  }, [load]);

  if (!d) return null;
  const a = d.alerts[pg];
  const lamp = d.state === "red" ? "red" : d.state === "yellow" ? "amber" : d.state === "gray" ? "gray" : "green";
  const tone = a ? (a.level === "경보" ? "red" : "yellow") : d.state === "gray" ? "gray" : "green";
  const qs = a ? a.questions : CALM_Q;
  const rid = (a?.regionId && a.regionId !== "national" ? a.regionId : p.region) as RegionId;

  if (p.collapsed)
    return (
      <div className={`aim-strip ${d.state}`} role="status" aria-live="polite">
        <span className={`dot ${lamp}`} />
        <b>{a ? `${a.area} ${a.type}${a.level}` : ST[d.state].t}</b>
        <span className="lv">{ST[d.state].lv}</span>
        {d.alerts.length > 1 && <span className="mute2">외 {d.alerts.length - 1}건</span>}
        <span className="mute2">· 점검 {hm(d.lastCheck)} · 다음 {hm(d.nextCheck)}</span>
        <span className="sp" />
        <button className="btn xs" onClick={() => p.setCollapsed(false)}>전광판 펼치기</button>
      </div>
    );

  return (
    <div className={`aim-board t-${tone}`} role="region" aria-label="AI 모드 상황 점검 전광판" style={{ translate: `${off.x}px ${off.y}px` }}>
      <div className="aim-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => savePos({ x: 0, y: 0 })} title="끌어서 옮기기 · 더블클릭하면 제자리">
        <span className="grip" />
        <span className="xs">끌어서 옮길 수 있습니다 · 전광판을 띄운 채로 아래 입력창에서 일반 대화를 계속할 수 있습니다</span>
      </div>
      <div className="aim-top">
        <Light c={a ? (a.level === "경보" ? "red" : "amber") : lamp} />
        <div className="aim-main">
          <div className="row" style={{ gap: 8 }}>
            {a ? <span className={`badge sq ${a.level === "경보" ? "solid-danger" : "solid-warn"}`}>{a.level}</span> : <span className="badge sq ok">{ST[d.state].lv}</span>}
            <b>{a ? a.area : REGIONS[p.region].name}</b>
            {a && <span className="mute2 xs">발생일시 {kst(a.issuedAt)}</span>}
          </div>
          <h2>{a ? <>{a.type}<em>{a.level}</em></> : ST[d.state].t}</h2>
          <p>{a ? a.message : d.state === "gray" ? "기상특보를 조회하지 못해 판단할 수 없습니다. 잠시 후 다시 점검합니다." : `제공된 특보와 근거에서 즉시 대응 검토가 필요한 사유를 확인하지 못했습니다. ${d.message}`}</p>
        </div>
        <div className="aim-side">
          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
            <button className="btn xs" onClick={() => p.setCollapsed(true)} title="전광판 띠로 접기">접기 ▲</button>
            <button className="btn xs" onClick={p.onClose}>⏻ AI 모드 종료</button>
          </div>
          {a && (
            <div className="aim-stage">
              <span className="xs mute2">특보 단계</span>
              <div className="bars"><i className="on y" /><i className={a.level === "경보" ? "on r" : ""} /></div>
              <div className="lbs"><span className={a.level !== "경보" ? "b" : ""}>주의보</span><span className={a.level === "경보" ? "b r" : ""}>경보</span></div>
            </div>
          )}
          <button className="btn pri lg" onClick={() => { p.setCollapsed(true); p.onAsk("현재 상황을 요약해줘", "briefing", rid); }}>브리핑하기 ›</button>
        </div>
      </div>
      <div className="aim-q">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>추천 질문</b>
          <span className="xs mute2">선택하면 {a ? `${a.area} ${a.type}${a.level}` : REGIONS[p.region].name} 기준으로 답변합니다.</span>
        </div>
        <div className="aim-cards">
          {qs.map((x) => (
            <button key={x.q} onClick={() => { p.setCollapsed(true); p.onAsk(x.q, (x as { preset?: string }).preset, rid); }}>
              <span className="k">{x.t}</span>
              <span className="q">{x.q}</span>
              <span className="go">질문하기 <i>›</i></span>
            </button>
          ))}
        </div>
      </div>
      <div className="aim-ft">
        {d.alerts.length > 1 && (
          <span className="row" style={{ gap: 6 }}>
            <button className="iconbtn" onClick={() => setPg((pg - 1 + d.alerts.length) % d.alerts.length)} aria-label="이전 특보">‹</button>
            <b className="xs">{pg + 1} / {d.alerts.length}</b>
            <button className="iconbtn" onClick={() => setPg((pg + 1) % d.alerts.length)} aria-label="다음 특보">›</button>
          </span>
        )}
        <span className="xs mute2">자동 점검 이력</span>
        <span className="aim-log">
          {d.checks.map((c, i) => (
            <button key={c.at} title={c.label} onClick={() => { p.setCollapsed(true); p.onCheck(c.at, d.checks[i - 1]?.at); }}>
              <span className={`dot ${c.state === "red" ? "red" : c.state === "yellow" ? "amber" : "green"}`} />{hm(c.at)} {c.label.replace(/ 발표$/, "")}
            </button>
          ))}
        </span>
        <span className="sp" />
        <span className="xs mute2">마지막 점검 {hm(d.lastCheck)} · 다음 {hm(d.nextCheck)} (10분 주기 · 특보 변경 시 즉시)</span>
      </div>
    </div>
  );
}
