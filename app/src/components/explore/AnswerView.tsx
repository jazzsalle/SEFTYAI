"use client";
/**
 * Agent 답변 카드 (목업 SCR-UNE-102001 형식)
 * 결론 → 근거 칩 → 결과 목록 탭 → 이어서 질문. 판단·절차는 핵심만, 나머지는 '자세히' 또는 우측 패널로.
 */
import { useState } from "react";
import type { AgentResponse, AnswerBlock, EntityRef } from "@/lib/contract/agent";
import { useSession } from "@/lib/session";
import { useExplore } from "./ExploreCtx";
import { RichText } from "./RichText";
import { IcChevR, IcDoc, IcMap, IcPrint } from "../Icons";

/** 판단형 질의만 판단 요약 행을 보여 준다 */
const DECISION_INTENTS = new Set(["assess", "control", "evacuation", "check", "recovery", "weather", "compare", "event-recovery", "event-risks", "event-response", "repeat", "river"]);
const TITLE: Record<string, string> = { briefing: "현재 상황 브리핑", check: "AI 상황 점검", assess: "상황 판단", manual: "행동매뉴얼 대응절차", control: "통제 판단", evacuation: "대피 판단", message: "주민 안내 메시지" };

type Tab = { key: string; label: string; items: EntityRef[]; total: number; similar?: Extract<AnswerBlock, { kind: "similar" }>["items"] };

function ResultTabs({ tabs }: { tabs: Tab[] }) {
  const x = useExplore();
  const [i, setI] = useState(0);
  const t = tabs[i];
  if (!t) return null;
  return (
    <div className="ablk">
      <div className="restabs">
        {tabs.map((tb, k) => (
          <button key={tb.key} className={k === i ? "on" : ""} onClick={() => setI(k)}>{tb.label} {tb.total}</button>
        ))}
        <span className="sp" />
        {t.items.some((e) => e.lon != null) && (
          <button onClick={() => x.openMap(t.items.map((e) => e.id), t.items)}><IcMap size={13} /> 지도에서 보기</button>
        )}
      </div>
      <ul className="reslist">
        {t.items.slice(0, 5).map((it, k) => {
          const sim = t.similar?.find((s) => s.eventId === it.id);
          return (
            <li key={it.id} className={x.selectedId === it.id ? "on" : ""} onMouseEnter={() => x.hover(it.id)} onMouseLeave={() => x.hover(null)} onClick={() => x.openDetail(it, sim ? "sim" : undefined)}>
              <span className="i">{k + 1}</span>
              {it.level && !sim && <span className={`dot ${it.level}`} />}
              <span className="col" style={{ minWidth: 0 }}>
                <span className="nm">{it.name}</span>
                {it.summary && <span className="sm">{it.summary}</span>}
              </span>
              <span className="mt">{sim ? <>유사도 <b>{sim.score}</b></> : it.metric}</span>
              <IcChevR size={14} />
            </li>
          );
        })}
      </ul>
      {t.total > 5 && <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => x.openList(t.label, t.key, t.items)}>{t.label} 전체 {t.total}건 보기 <IcChevR size={13} /></button>}
    </div>
  );
}

export default function AnswerView({ res, onReport, baseLabel }: { res: AgentResponse; onReport?: () => void; baseLabel?: string }) {
  const x = useExplore();
  const { checks, toggleCheck } = useSession();
  const [more, setMore] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  const [allCites, setAllCites] = useState(false);
  const [fb, setFb] = useState<string | null>(null);
  const at = new Date(res.answeredAt);
  const B = <K extends AnswerBlock["kind"]>(k: K) => res.blocks.filter((b): b is Extract<AnswerBlock, { kind: K }> => b.kind === k);
  const headline = B("headline")[0];
  const facts = B("facts")[0];
  const actions = B("actions")[0];
  const briefing = B("briefing")[0];
  const warn = B("notice").filter((n) => n.tone !== "info");
  const details = res.blocks.filter((b) => b.kind === "narrative" || b.kind === "timeline" || (b.kind === "notice" && b.tone === "info") || (b.kind === "facts" && !DECISION_INTENTS.has(res.intent)));
  const tabs: Tab[] = [
    ...B("similar").map((s) => ({ key: "similar", label: "유사재난 사례", total: s.items.length, similar: s.items, items: s.items.map((it) => x.entityById(it.eventId) ?? { type: "event" as const, id: it.eventId, name: it.title, summary: it.summary }) })),
    ...B("results").flatMap((r) => r.groups.map((g) => ({ key: g.key, label: g.label, total: g.total, items: g.items }))),
  ];
  const cites = allCites ? res.citations : res.citations.slice(0, 4);
  const steps = actions ? (allSteps ? actions.items : actions.items.slice(0, 4)) : [];

  return (
    <div className="acard fadein">
      <div className="acard-hd">
        <h3>{TITLE[res.intent] ?? "조회 결과"}</h3>
        {res.status === "clarify" && <span className="badge info">질문 구체화 필요</span>}
        <span className="t">{baseLabel ?? at.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {headline && <div className="headline"><RichText text={headline.text} /></div>}

      {facts && DECISION_INTENTS.has(res.intent) && (
        <div className="ablk">
          <ul className="judge">
            {facts.items.slice(0, res.intent === "event-response" ? 8 : 5).map((f, i) => (
              <li key={i} className={f.tone ?? ""}>
                <span className="l">{f.label}</span>
                {f.value && <b>{f.value}{f.unit}</b>}
                {f.note && <span className="n"><RichText text={f.note} /></span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing && (
        <div className="ablk">
          <ul className="reslist">
            {briefing.items.map((it, i) => (
              <li key={it.key} onClick={() => x.ask(it.question, it.key)}>
                <span className="i">{i + 1}</span>
                <span className="nm" style={{ width: 120, flex: "none" }}>{it.label}</span>
                <span className="sm" style={{ flex: 1 }}>{it.status === "fail" ? "조회하지 못했습니다" : <RichText text={it.summary} />}</span>
                <span className="mt"><b>{it.count}</b></span>
                <IcChevR size={14} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions && (
        <div className="ablk actions">
          <h4>{actions.title}<span className="badge danger sq">{actions.stage.name}</span>{actions.stage.level && <span className="badge warn sq">{actions.stage.level}</span>}</h4>
          <ol>
            {steps.map((it) => {
              const k = `${actions.manualId ?? res.requestId}:${it.seq}`;
              const c = it.cite?.[0] ? x.citationById(it.cite[0]) : undefined;
              return (
                <li key={it.seq} className={checks[k] ? "done" : ""}>
                  <input type="checkbox" checked={!!checks[k]} onChange={() => toggleCheck(k)} aria-label="완료" />
                  <div>
                    <div className="tx">{it.task.split(" — ")[0]}</div>
                    {(it.owner || c) && <div className="own">{it.owner?.split(" (")[0]}{c?.page && <button className="pg" onClick={() => x.openCitation(c)}>p.{c.page}</button>}</div>}
                  </div>
                  {it.due && <span className="due">{it.due.replace(/^경보 발표\s*/, "")}</span>}
                </li>
              );
            })}
          </ol>
          {actions.items.length > 4 && <button className="btn xs ghost" onClick={() => setAllSteps((v) => !v)}>{allSteps ? "접기" : `전체 ${actions.items.length}단계 보기`}</button>}
        </div>
      )}

      {warn.map((n, i) => <div key={i} className="ablk"><div className={`notice ${n.tone}`}><RichText text={n.text} /></div></div>)}

      {tabs.length > 0 && <ResultTabs tabs={tabs} />}

      {res.citations.length > 0 && (
        <div className="ablk">
          <div className="cites">
            <span className="xs muted b" style={{ marginRight: 4 }}>근거</span>
            {cites.map((c) => (
              <button key={c.id} className="citechip" onClick={() => x.openCitation(c)} title={c.quote}>
                <IcDoc size={12} /><b>{c.title}</b>{c.page ? ` p.${c.page}` : ""}
              </button>
            ))}
            {res.citations.length > 4 && <button className="btn xs ghost" onClick={() => setAllCites((v) => !v)}>{allCites ? "접기" : `+${res.citations.length - 4}`}</button>}
          </div>
        </div>
      )}

      {details.length > 0 && (
        <div className="ablk">
          <button className="btn xs ghost" onClick={() => setMore((v) => !v)}>{more ? "자세히 접기 ▲" : "자세히 보기 ▼"}</button>
          {more && (
            <div className="narr" style={{ marginTop: 8 }}>
              {details.map((b, i) =>
                b.kind === "narrative" ? (
                  <div key={i} style={{ marginBottom: 10 }}>{b.title && <h4 className="xs muted" style={{ margin: "0 0 4px" }}>{b.title}</h4>}{b.paragraphs.map((p, j) => <p key={j} className="xs"><RichText text={p} /></p>)}</div>
                ) : b.kind === "timeline" ? (
                  <div key={i} style={{ marginBottom: 10 }}><h4 className="xs muted" style={{ margin: "0 0 4px" }}>{b.title}</h4>{b.items.slice(0, 8).map((t, j) => <p key={j} className="xs"><span className="mute2">{t.at}</span> {t.label} · <RichText text={t.text} /></p>)}</div>
                ) : b.kind === "notice" ? (
                  <p key={i} className="xs mute2"><RichText text={b.text} /></p>
                ) : b.kind === "facts" ? (
                  <ul key={i} className="judge">{b.items.map((f, j) => <li key={j}><span className="l">{f.label}</span><b>{f.value}{f.unit}</b>{f.note && <span className="n"><RichText text={f.note} /></span>}</li>)}</ul>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      {res.followUps.length > 0 && (
        <div className="ablk">
          <div className="followups">
            {res.followUps.map((f) => <button key={f} className="chip" onClick={() => x.ask(f)}>{f} <IcChevR size={12} /></button>)}
          </div>
        </div>
      )}
      <div className="ablk feedback">
        이 답변이 도움이 됐나요?
        <button className={`chip ${fb === "y" ? "on" : ""}`} style={{ height: 28 }} onClick={() => setFb("y")}>도움이 됐어요</button>
        <button className={`chip ${fb === "n" ? "on" : ""}`} style={{ height: 28 }} onClick={() => setFb("n")}>아쉬워요</button>
        <span className="sp" />
        {onReport && <button className="btn xs ghost" onClick={onReport}><IcPrint size={12} /> 보고서</button>}
      </div>
    </div>
  );
}

export const TL_COLOR: Record<string, string> = {
  특보: "#de3412", 기상: "#de3412", 신고: "#e5590b", "119": "#e5590b", 피해: "#bd2c0f", 대응: "#256ef4", 통제: "#256ef4", 보고: "#6f4bd8", 복구: "#228738", 해제: "#228738",
};
