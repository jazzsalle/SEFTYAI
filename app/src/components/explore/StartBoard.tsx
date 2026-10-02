"use client";
import { useEffect, useState } from "react";
import type { BoardResponse } from "@/lib/contract/board";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import { useExplore } from "./ExploreCtx";
import RainChart from "../charts/RainChart";
import { IcChevR, IcMap, IcPhone, IcSiren } from "../Icons";

export default function StartBoard({ onBriefing }: { onBriefing: () => void }) {
  const { cond, mode, account, checks, toggleCheck } = useSession();
  const x = useExplore();
  const [b, setB] = useState<BoardResponse | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setB(null);
    setErr(false);
    fetch(`/api/board?region=${cond.region}&mode=${mode}${cond.sigungu ? `&sigungu=${encodeURIComponent(cond.sigungu)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setB(j))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [cond.region, cond.sigungu, mode]);

  const rname = REGIONS[cond.region].name;
  const active = !!b?.advisory;

  return (
    <div className="start">
      <div className="hero">
        <div className="kicker">재난안전 AI 에이전트 · {account?.org}</div>
        <h1>{active ? "지금 무엇을 먼저 해야 할지 정리했습니다" : "어떤 재난상황을 살펴볼까요?"}</h1>
      </div>

      <section className={`board ${active ? "" : "calm"}`}>
        <div className="board-hd">
          {active ? <span className="badge solid-danger sq" style={{ height: 30, fontSize: 13 }}><IcSiren size={14} /> {b!.advisory!.type}{b!.advisory!.level}</span> : <span className="badge ok sq" style={{ height: 30 }}>평시</span>}
          <div style={{ minWidth: 0 }}>
            <h2>현재 상황 브리핑 · {rname}</h2>
            <p>
              {b ? (
                active ? <>{b.advisory!.area} {b.advisory!.type}{b.advisory!.level} {b.advisory!.status} · 기준 {new Date(b.baseTime).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}{b.scenarioLabel && <> · <span style={{ color: "#5b2a9c", fontWeight: 700 }}>{b.scenarioLabel}</span></>}</> : "발효 중인 특보가 없습니다. 평시 점검 항목과 취약지역 현황을 보여드립니다."
              ) : err ? "상황판을 불러오지 못했습니다." : "상황을 정리하고 있습니다…"}
            </p>
          </div>
          <span className="sp" />
          <button className="btn pri" onClick={onBriefing}>브리핑 시작 <IcChevR size={14} /></button>
        </div>

        {b && (
          <div className="board-grid">
            <div className="board-cell">
              <h3>① 비상 단계 · 행동매뉴얼 <span className="n">{b.stage?.manualTitle ?? ""}</span></h3>
              {b.stage ? (
                <>
                  <div className="stage">
                    <span className="lv">{b.stage.name}</span>
                    <span className="badge warn sq">{b.stage.level}</span>
                  </div>
                  <div className="stepper">
                    {b.stage.steps.map((s, i) => <span key={s} title={s} className={i <= b.stage!.step ? (i < 2 ? "on w" : "on") : ""} />)}
                  </div>
                  <div className="xs mute2" style={{ marginTop: 6 }}>{b.stage.steps.join(" → ")}</div>
                  <div className="xs muted" style={{ marginTop: 6 }}>발동 기준 : {b.stage.trigger}</div>
                </>
              ) : (
                <div className="xs muted">평시 단계 · 특보 발표 시 매뉴얼 단계가 자동 표시됩니다.</div>
              )}
            </div>
            <div className="board-cell">
              <h3>② {b.stage ? "지금 할 일" : "특보 대비 — 예비특보 시 할 일"} <span className="n">{b.todo.filter((t) => checks[`${b.stage?.manualId}:${t.seq}`]).length}/{b.todo.length} 완료</span></h3>
              <ul className="todo">
                {b.todo.map((t) => {
                  const k = `${b.stage?.manualId ?? "prep"}:${t.seq}`;
                  return (
                    <li key={t.seq} style={checks[k] ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                      <input type="checkbox" checked={!!checks[k]} onChange={() => toggleCheck(k)} style={{ accentColor: "var(--c-ok)" }} aria-label="완료" />
                      <span className="due">{t.due ?? "즉시"}</span>
                      <span>{t.task}{t.owner && <span className="mute2"> · {t.owner}</span>}</span>
                    </li>
                  );
                })}
              </ul>
              <button className="btn xs line" style={{ marginTop: 8 }} onClick={() => x.ask("지금 특보 단계에서 행동매뉴얼상 제가 해야 할 일은 무엇인가요?", "manual")}>전체 절차 보기</button>
            </div>
            <div className="board-cell">
              <h3>③ 먼저 볼 위험·취약지역 <span className="n">{b.counts.risk.toLocaleString()}곳 중 상위</span></h3>
              <ul className="toplist">
                {b.topRisks.map((r, i) => (
                  <li key={r.id} onClick={() => x.openDetail(r)} onMouseEnter={() => x.hover(r.id)} onMouseLeave={() => x.hover(null)}>
                    <span className="rk">{i + 1}</span>
                    <span className={`dot ${r.level ?? "info"}`} />
                    <span className="nm">{r.name}</span>
                    <span className="why">{r.category} · {r.summary}</span>
                  </li>
                ))}
              </ul>
              <button className="btn xs line" style={{ marginTop: 8 }} onClick={() => x.openMap(b.topRisks.map((r) => r.id), b.topRisks)}><IcMap size={12} /> 지도에서 보기</button>
            </div>
            <div className="board-cell">
              <h3>④ 119 신고 접수 {b.event && <span className="n">{b.counts.reports119}건 · {b.event.name}</span>}</h3>
              {b.feed119.length ? (
                <ul className="feed">
                  {b.feed119.slice(0, 5).map((f) => (
                    <li key={f.entity.id} style={{ cursor: "pointer" }} onClick={() => x.openDetail(f.entity)} onMouseEnter={() => x.hover(f.entity.id)} onMouseLeave={() => x.hover(null)}>
                      <span className="t">{f.t}</span>
                      <span><IcPhone size={11} /> {f.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="xs muted">접수된 풍수해 관련 신고가 없습니다.</div>
              )}
            </div>
            <div className="board-cell" style={{ gridColumn: "1 / -1", borderRight: 0 }}>
              <h3>⑤ 언제 위험해지나 — {b.rain.label} vs 과거 피해 발생 강우 {b.event && <span className="n" style={{ cursor: "pointer" }} onClick={() => x.openDetail(b.event!)}>재난마스터 {b.event.id} ›</span>}</h3>
              <RainChart series={b.rain.series} thresholds={b.rain.thresholds} />
            </div>
          </div>
        )}
        <div className="board-ft">
          <span className="xs muted b">포함 항목</span>
          <span className="xs">현재 기상상황 · 위험·취약지역 · 과거 유사사례 · 행동매뉴얼 대응절차 · 119 신고</span>
        </div>
      </section>

      <div className="sugg">
        <h3>추천 질문</h3>
        <div className="sugg-grid">
          {(b?.suggestions ?? []).map((s) => (
            <button key={s.q} className="sugg-card" onClick={() => x.ask(s.q, s.preset)}>
              <span className="col">
                <span className="k">{s.kicker}</span>
                <span className="q">{s.q}</span>
              </span>
              <span className="arr"><IcChevR /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
