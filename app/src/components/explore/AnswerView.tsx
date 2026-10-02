"use client";
import { useState } from "react";
import type { AgentResponse, AnswerBlock, EntityRef } from "@/lib/contract/agent";
import { useSession } from "@/lib/session";
import { useExplore } from "./ExploreCtx";
import { RichText } from "./RichText";
import RainChart from "../charts/RainChart";
import { IcChevR, IcDoc, IcMap, IcPrint } from "../Icons";

const SIM_COLORS = { weather: "#256ef4", space: "#0f9d8a", damage: "#e5590b", response: "#6f4bd8" };
const SIM_LABEL = { weather: "기상·수문", space: "공간·취약", damage: "피해양상", response: "대응" };

function Results({ b }: { b: Extract<AnswerBlock, { kind: "results" }> }) {
  const x = useExplore();
  const [g, setG] = useState(0);
  const grp = b.groups[g];
  if (!grp) return null;
  return (
    <div className="ablk">
      <div className="restabs">
        {b.groups.map((gr, i) => (
          <button key={gr.key} className={i === g ? "on" : ""} onClick={() => setG(i)}>
            {gr.label} {gr.total}
          </button>
        ))}
        <span className="sp" />
        <button onClick={() => x.openMap(grp.items.map((i) => i.id), grp.items)} title="지도에서 보기">
          <IcMap size={13} /> 지도에서 {grp.items.filter((i) => i.lon != null).length}곳 보기
        </button>
      </div>
      <ul className="reslist">
        {grp.items.slice(0, 5).map((it, i) => (
          <li key={it.id} className={x.selectedId === it.id ? "on" : ""} onMouseEnter={() => x.hover(it.id)} onMouseLeave={() => x.hover(null)} onClick={() => x.openDetail(it)}>
            <span className="i">{i + 1}</span>
            {it.level && <span className={`dot ${it.level}`} />}
            <span className="col" style={{ minWidth: 0 }}>
              <span className="nm">{it.name}{it.category && <span className="mute2" style={{ fontWeight: 400 }}> · {it.category}</span>}</span>
              {it.summary && <span className="sm">{it.summary}</span>}
            </span>
            {it.metric && <span className="mt">{it.metric}</span>}
            <IcChevR size={14} />
          </li>
        ))}
      </ul>
      {grp.total > 5 && (
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => x.openList(grp.label, grp.key, grp.items)}>
          {grp.label} 전체 {grp.total}건 보기 <IcChevR size={13} />
        </button>
      )}
    </div>
  );
}

function Actions({ b, rid }: { b: Extract<AnswerBlock, { kind: "actions" }>; rid: string }) {
  const { checks, toggleCheck } = useSession();
  const x = useExplore();
  const done = b.items.filter((it) => checks[`${b.manualId ?? rid}:${it.seq}`]).length;
  return (
    <div className="ablk actions">
      <h4>
        {b.title}
        <span className="badge danger sq">{b.stage.name}</span>
        {b.stage.level && <span className="badge warn sq">{b.stage.level}</span>}
        <span className="sp" />
        <span className="xs mute2">완료 {done}/{b.items.length}</span>
      </h4>
      {b.stage.trigger && <div className="xs muted" style={{ margin: "-4px 0 8px" }}>발동 기준 : {b.stage.trigger}</div>}
      <ol>
        {b.items.map((it) => {
          const k = `${b.manualId ?? rid}:${it.seq}`;
          return (
            <li key={it.seq} className={checks[k] ? "done" : ""}>
              <input type="checkbox" checked={!!checks[k]} onChange={() => toggleCheck(k)} aria-label={`${it.seq}번 조치 완료`} />
              <div>
                <div className="tx"><RichText text={it.task} />{it.cite?.map((c) => { const cc = x.citationById(c); return cc ? <button key={c} className="cite" onClick={() => x.openCitation(cc)}>{c.slice(1)}</button> : null; })}</div>
                {it.owner && <div className="own">담당 : {it.owner}</div>}
              </div>
              {it.due && <span className="due">{it.due}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Block({ b, res }: { b: AnswerBlock; res: AgentResponse }) {
  const x = useExplore();
  switch (b.kind) {
    case "headline":
      return <div className="headline"><RichText text={b.text} /></div>;
    case "facts":
      return (
        <div className="ablk">
          {b.title && <h4>{b.title}</h4>}
          <div className="facts">
            {b.items.map((f, i) => (
              <div key={i} className={`fact ${f.tone ?? ""}`}>
                <div className="l">{f.label}</div>
                <div className="v">{f.value}{f.unit && <small>{f.unit}</small>}</div>
                {f.note && <div className="n"><RichText text={f.note} />{f.cite?.map((c) => { const cc = x.citationById(c); return cc ? <button key={c} className="cite" onClick={() => x.openCitation(cc)}>{c.slice(1)}</button> : null; })}</div>}
              </div>
            ))}
          </div>
        </div>
      );
    case "narrative":
      return (
        <div className="ablk narr">
          {b.title && <h4>{b.title}</h4>}
          {b.paragraphs.map((p, i) => <p key={i}><RichText text={p} /></p>)}
        </div>
      );
    case "actions":
      return <Actions b={b} rid={res.requestId} />;
    case "results":
      return <Results b={b} />;
    case "similar":
      return (
        <div className="ablk">
          <h4>과거 유사사례 <span className="mute2" style={{ fontWeight: 400 }}>· 유사도는 피해 예측값이 아닌 조건 일치도입니다</span></h4>
          <ul className="reslist">
            {b.items.map((s, i) => {
              const e: EntityRef = x.entityById(s.eventId) ?? { type: "event", id: s.eventId, name: s.title };
              return (
                <li key={s.eventId} onClick={() => x.openDetail(e, "sim")} onMouseEnter={() => x.hover(s.eventId)} onMouseLeave={() => x.hover(null)}>
                  <span className="i">{i + 1}</span>
                  <span className="col" style={{ minWidth: 0, flex: 1 }}>
                    <span className="nm">{s.title}</span>
                    <span className="sm">{s.summary}</span>
                    <span className="simbar" style={{ marginTop: 6, maxWidth: 360 }}>
                      {(Object.keys(SIM_COLORS) as (keyof typeof SIM_COLORS)[]).map((k) => (
                        <i key={k} style={{ width: `${s.breakdown[k]}%`, background: SIM_COLORS[k] }} title={`${SIM_LABEL[k]} ${s.breakdown[k]}`} />
                      ))}
                    </span>
                  </span>
                  <span className="mt">유사도 <b>{s.score}</b></span>
                  <IcChevR size={14} />
                </li>
              );
            })}
          </ul>
          <div className="simlegend">
            {(Object.keys(SIM_COLORS) as (keyof typeof SIM_COLORS)[]).map((k) => (
              <span key={k} style={{ ["--k" as string]: SIM_COLORS[k] }}>{SIM_LABEL[k]}</span>
            ))}
          </div>
        </div>
      );
    case "timeline":
      return (
        <div className="ablk">
          <h4>{b.title}</h4>
          <ul className="tl">
            {b.items.map((t, i) => (
              <li key={i} style={{ ["--k" as string]: TL_COLOR[t.kind] ?? "#256ef4" }}>
                <span className="at">{t.at}</span>
                <span className="lb">{t.label}</span>
                <div className="tx"><RichText text={t.text} /></div>
              </li>
            ))}
          </ul>
        </div>
      );
    case "rainChart":
      return (
        <div className="ablk">
          <h4>{b.title}</h4>
          <RainChart series={b.current.series} thresholds={b.thresholds} label={b.current.label} />
        </div>
      );
    case "notice":
      return <div className="ablk"><div className={`notice ${b.tone}`}><RichText text={b.text} /></div></div>;
    case "briefing":
      return (
        <div className="ablk">
          <ul className="reslist">
            {b.items.map((it, i) => (
              <li key={it.key} onClick={() => it.status === "ok" && x.ask(it.question, it.key)}>
                <span className="i">{i + 1}</span>
                <span className="nm" style={{ width: 130, flex: "none" }}>{it.label}</span>
                <span className="sm" style={{ flex: 1, color: it.status === "fail" ? "var(--c-dang)" : undefined }}>
                  {it.status === "fail" ? "조회하지 못했습니다" : <RichText text={it.summary} />}
                </span>
                <span className="mt"><b>{it.count}</b></span>
                <IcChevR size={14} />
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

export const TL_COLOR: Record<string, string> = {
  특보: "#de3412", 기상: "#de3412", 신고: "#e5590b", "119": "#e5590b", 피해: "#a5271b", 대응: "#256ef4", 통제: "#256ef4", 보고: "#6f4bd8", 복구: "#228738", 해제: "#228738",
};

export default function AnswerView({ res, onReport, baseLabel }: { res: AgentResponse; onReport?: () => void; baseLabel?: string }) {
  const x = useExplore();
  const at = new Date(res.answeredAt);
  const [fb, setFb] = useState<string | null>(null);
  const [allCites, setAllCites] = useState(false);
  const cites = allCites ? res.citations : res.citations.slice(0, 6);
  return (
    <div className="acard fadein">
      <div className="acard-hd">
        <h3>{res.intent === "briefing" ? "현재 상황 브리핑" : "조회 결과"}</h3>
        {res.status === "partial" && <span className="badge warn">일부 조회 실패</span>}
        {res.status === "clarify" && <span className="badge info">질문 구체화 필요</span>}
        <span className="t">{baseLabel ?? `${at.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 생성`}</span>
      </div>
      {res.blocks.map((b, i) => <Block key={i} b={b} res={res} />)}
      {cites.length > 0 && (
        <div className="ablk">
          <div className="cites">
            <span className="xs muted b" style={{ marginRight: 4 }}>근거</span>
            {cites.map((c) => (
              <button key={c.id} className="citechip" onClick={() => x.openCitation(c)} title={c.quote}>
                <span className="k">{c.id.slice(1)}</span>
                <IcDoc size={12} />
                <b>{c.title}</b>
                {c.page ? `p.${c.page}` : c.locator ? `· ${c.locator}` : ""}
                {c.dataset && <span className="badge star" style={{ height: 18, fontSize: 10 }}>★ {c.dataset}</span>}
              </button>
            ))}
            {res.citations.length > 6 && (
              <button className="btn xs ghost" onClick={() => setAllCites((v) => !v)}>{allCites ? "접기" : `근거 ${res.citations.length - 6}건 더보기`}</button>
            )}
          </div>
        </div>
      )}
      {res.followUps.length > 0 && (
        <div className="ablk">
          <div className="followups">
            {res.followUps.map((f) => (
              <button key={f} className="chip" onClick={() => x.ask(f)}>{f} <IcChevR size={12} /></button>
            ))}
          </div>
        </div>
      )}
      <div className="ablk feedback">
        이 답변이 도움이 됐나요?
        <button className={`chip ${fb === "y" ? "on" : ""}`} style={{ height: 28 }} onClick={() => setFb("y")}>도움이 됐어요</button>
        <button className={`chip ${fb === "n" ? "on" : ""}`} style={{ height: 28 }} onClick={() => setFb("n")}>아쉬워요</button>
        <span className="sp" />
        <span className="mute2" title={res.trace.datasets.join(", ")}>조회 데이터 {res.trace.datasets.length}종 · {(res.trace.elapsedMs / 1000).toFixed(1)}초</span>
        {onReport && <button className="btn xs" onClick={onReport}><IcPrint size={12} /> 보고서</button>}
      </div>
    </div>
  );
}
