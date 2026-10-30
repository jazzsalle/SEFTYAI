"use client";
import { useMemo } from "react";
import { useRandomBrief } from "@/lib/briefing";
import { libraryFor, fillText, type LibraryQuestion } from "@/lib/library";
import { baseQuestionPilot } from "@/lib/baseRegion";
import { useSession } from "@/lib/session";
import { IcChevR } from "../Icons";

/** 시작 화면 (Figma 201001) — 현재 상황 브리핑 + 질문 타일(내 브리핑 무작위 4 + 지역 질문 4) */
export default function StartScreen({ regionName, onBriefing, onAskBrief, onAskLib }: {
  regionName: string;
  onBriefing: () => void;
  /** q = 브리핑 항목 질의문 원형({지역} 포함) */
  onAskBrief: (q: string, preset?: string) => void;
  onAskLib: (q: LibraryQuestion) => void;
}) {
  const s = useSession();
  const brief = useRandomBrief(4);
  const qr = baseQuestionPilot(s.cond.base); // 시·도까지만 골라도 인제·영천 질문(R48)
  const lib = useMemo(() => {
    const l = libraryFor(qr === "national" ? "" : qr).filter((q) => !q.after);
    return [...l.filter((q) => q.regions), ...l.filter((q) => !q.regions)].slice(0, 4);
  }, [qr]);
  return (
    <div className="start">
      <div className="start-eyebrow">재난안전 AI 에이전트</div>
      <h1 className="start-title">어떤 재난상황을 살펴볼까요?</h1>
      <div className="start-brief">
        <div>
          <b>현재 상황 브리핑</b>
        </div>
        <button className="btn primary lg" onClick={onBriefing}>브리핑 시작 <IcChevR size={16} /></button>
      </div>
      <div className="start-tiles">
        {brief.map((b) => (
          <button key={b.key} className="tile" onClick={() => onAskBrief(b.q, b.preset)}>
            <span className="tile-k">{b.label} <IcChevR size={14} /></span>
            <span className="tile-q">{b.q.replaceAll("{지역}", regionName)}</span>
          </button>
        ))}
        {lib.map((q) => (
          <button key={q.id} className="tile" onClick={() => onAskLib(q)}>
            <span className="tile-k">{q.category} <IcChevR size={14} /></span>
            <span className="tile-q">{fillText(q, regionName)}</span>
          </button>
        ))}
      </div>
      {!s.cond.base && <p className="xs muted" style={{ textAlign: "center" }}>기준지역이 전국이면 지역 질문 대신 기준지역을 먼저 고르세요(상단 기준지역).</p>}
    </div>
  );
}
