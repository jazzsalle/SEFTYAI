"use client";
import { useBriefingSet } from "@/lib/briefing";
import { IcChevR } from "../Icons";

/**
 * 시작 화면 (Figma 201001) — 개발서버 StartGuide 그대로(R53): 인사말 · 현재 상황 브리핑 · 브리핑 항목 타일(등록 항목 전부 — 체크하지 않은 것도).
 * 타일을 누르면 바로 묻지 않고 질문 칸에 넣는다 — 바로 거는 자리는 [브리핑 시작]과 [브리핑 세트▾] 메뉴다.
 * (지역 질문 타일은 개발서버 시작 화면에 없어 뺐다 — 지역 질문은 [질문 목록 보기])
 */
export default function StartScreen({ regionName, onBriefing, onPick }: {
  regionName: string;
  onBriefing: () => void;
  /** q = 질문 칸에 넣을 글 */
  onPick: (q: string) => void;
}) {
  const { items: brief, checked, loaded } = useBriefingSet();
  return (
    <div className="start">
      <div className="start-eyebrow">재난안전 AI 에이전트</div>
      <h1 className="start-title">어떤 재난상황을 살펴볼까요?</h1>
      <div className="start-brief">
        <div>
          <b>현재 상황 브리핑</b>
          <div className="xs muted">브리핑 세트 {checked.length}개 항목을 지금 조건으로 한 번에 정리합니다.</div>
        </div>
        <button className="btn go lg" disabled={!checked.length} onClick={onBriefing}>브리핑 시작 <IcChevR size={16} /></button>
      </div>
      {!loaded ? (
        <p className="xs muted" style={{ textAlign: "center" }}>브리핑 항목을 불러오는 중입니다…</p>
      ) : !brief.length ? (
        <p className="xs muted" style={{ textAlign: "center" }}>등록된 브리핑 항목이 없습니다.</p>
      ) : (
        <div className="start-tiles">
          {brief.map((b) => {
            const q = b.question.replaceAll("{지역}", regionName);
            return (
              <button key={b.id} className="tile" title={q} onClick={() => onPick(q)}>
                <span className="tile-k">{b.label} <IcChevR size={14} /></span>
                <span className="tile-q">{q}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
