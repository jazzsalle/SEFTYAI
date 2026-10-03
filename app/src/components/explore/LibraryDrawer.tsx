"use client";
/** 추천 질문 · 조건 시나리오 · 연속 질의 시연 (역량질문 CQ 기반) */
import { useEffect, useState } from "react";
import type { RegionId } from "@/lib/contract/agent";
import type { ScenarioItem } from "./Composer";
import { IcX } from "../Icons";

interface LibItem { id: string; stage: string; q: string; cq: string[]; preset?: string }
interface Flow { id: string; title: string; desc: string; steps: string[]; scenarioId?: string; wx?: { type: string; level: string; regionId: RegionId } }
const ORDER = ["평시 점검", "사전대비(예비특보)", "초기대응(주의보)", "비상대응(경보)", "피해·신고 대응", "수습·복구", "재발방지·계획", "과거 재난·유사사례", "위험·취약지역 지식"];

export default function LibraryDrawer(p: { region: RegionId; onClose: () => void; onAsk: (q: string, preset?: string) => void; onScenario: (s: ScenarioItem) => void; onFlow: (steps: string[], scenario?: ScenarioItem, wx?: Flow["wx"]) => void }) {
  const [tab, setTab] = useState<"q" | "s" | "f">("q");
  const [d, setD] = useState<{ library: LibItem[]; conditions: ScenarioItem[]; flows: Flow[] } | null>(null);
  useEffect(() => {
    fetch(`/api/scenarios?region=${p.region}`).then((r) => r.json()).then(setD).catch(() => setD(null));
  }, [p.region]);
  return (
    <>
      <div className="ovl" style={{ background: "rgba(19,20,22,.2)" }} onClick={p.onClose} />
      <aside className="drawer" role="dialog" aria-label="추천 질문">
        <div className="hd">
          <h2 style={{ fontSize: 19 }}>추천 질문</h2>
          <span className="sp" />
          <button className="iconbtn" onClick={p.onClose} aria-label="닫기"><IcX size={18} /></button>
        </div>
        <div style={{ padding: "0 22px" }}>
          <div className="subtabs" style={{ marginTop: 0 }}>
            <button className={tab === "q" ? "on" : ""} onClick={() => setTab("q")}>업무 단계별 질문</button>
            <button className={tab === "s" ? "on" : ""} onClick={() => setTab("s")}>조건 시나리오</button>
            <button className={tab === "f" ? "on" : ""} onClick={() => setTab("f")}>연속 질의</button>
          </div>
        </div>
        <div className="bd">
          {!d && <div className="typing"><i /><i /><i /></div>}
          {d && tab === "q" && ORDER.map((g) => {
            const items = d.library.filter((x) => x.stage === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <h4>{g}</h4>
                {items.map((it) => <button key={it.id} className="qitem" onClick={() => { p.onClose(); p.onAsk(it.q, it.preset); }}>{it.q}<span className="cq">{it.cq.slice(0, 2).join(" ")}</span></button>)}
              </div>
            );
          })}
          {d && tab === "s" && (
            <>
              <p className="xs muted">실시간 수문 API를 연결하지 않으므로, 담당자가 입력할 기상·수문 조건을 미리 묶어 두었습니다. 선택하면 조건이 적용되고 바로 질의합니다.</p>
              {ORDER.map((g) => {
                const items = d.conditions.filter((x) => x.stage === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <h4>{g}</h4>
                    {items.map((s) => (
                      <button key={s.id} className="qitem" style={{ flexDirection: "column", alignItems: "flex-start" }} onClick={() => { p.onClose(); p.onScenario(s); }}>
                        <b>{s.title}</b>
                        <span className="mute2">{s.summary}</span>
                        <span style={{ color: "var(--c-primary-dk)" }}>→ {s.question}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
          {d && tab === "f" && (
            <>
              <p className="xs muted">이어서 질문하기 흐름을 자동으로 이어 질의합니다. 앞 답변의 사건·객체를 다음 질문이 이어받습니다.</p>
              {d.flows.map((f) => (
                <button key={f.id} className="qitem" style={{ flexDirection: "column", alignItems: "flex-start" }} onClick={() => { p.onClose(); p.onFlow(f.steps, d.conditions.find((c) => c.id === f.scenarioId), f.wx); }}>
                  <b>{f.title}</b>
                  <span className="mute2">{f.desc}</span>
                  <ol style={{ listStyle: "decimal", paddingLeft: 16, color: "var(--c-sub)" }}>{f.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
