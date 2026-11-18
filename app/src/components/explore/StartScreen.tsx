"use client";
import { useBriefingSet } from "@/lib/briefing";
import { IcChevR } from "../Icons";

/**
 * 시작 화면 (Figma 201001) — 개발서버 StartGuide 그대로(R53): 인사말 · 현재 상황 브리핑 · 브리핑 항목 타일(등록 항목 전부 — 체크하지 않은 것도).
 * 타일을 누르면 바로 묻지 않고 질문 칸에 넣는다 — 바로 거는 자리는 [브리핑 시작]과 [브리핑 세트▾] 메뉴다.
 * (지역 질문 타일은 개발서버 시작 화면에 없어 뺐다 — 지역 질문은 [질문 모음 보기])
 * 타일 질의문은 개발서버처럼 등록한 글 그대로 보이고 그대로 넣는다({지역} 을 바꾸지 않는다 — 개발서버 StartGuide onPick · 2026-11-19).
 * 불러오기 오류가 있으면 빨간 글 한 줄(개발서버 tile-message--error) — 지금 브리핑 세트 훅은 실패해도 기본 항목을 돌려주므로 error 를 넘길 때만.
 */
export default function StartScreen({ onBriefing, onPick, error = null }: {
  /** 기준지역 이름 — 지금은 쓰지 않는다(개발서버 시작 화면은 질의문을 그대로 보인다). 부르는 쪽과 맞추려고 남겨 둔다 */
  regionName?: string;
  onBriefing: () => void;
  /** q = 질문 칸에 넣을 글 */
  onPick: (q: string) => void;
  /** 브리핑 항목을 불러오지 못한 까닭(개발서버 StartGuide error) */
  error?: string | null;
}) {
  const { items: brief, checked, loaded } = useBriefingSet();
  return (
    <section className="start" aria-labelledby="start-title">
      <div className="start-greet">
        <p className="start-eyebrow">재난안전 AI 에이전트</p>
        <h2 id="start-title" className="start-title">어떤 재난상황을 살펴볼까요?</h2>
      </div>
      <div className="start-area">
        <div className="start-brief">
          <div className="start-brief-desc">
            <p className="start-brief-t">현재 상황 브리핑</p>
            <p className="start-brief-s">브리핑 세트 {checked.length}개 항목을 지금 조건으로 한 번에 정리합니다.</p>
          </div>
          <button type="button" className="start-go" disabled={!checked.length} onClick={onBriefing}>브리핑 시작 <IcChevR size={24} /></button>
        </div>
        {error ? (
          <p className="tile-message tile-message--error" role="alert">{error}</p>
        ) : !loaded ? (
          <p className="tile-message">브리핑 항목을 불러오는 중입니다…</p>
        ) : !brief.length ? (
          <p className="tile-message">등록된 브리핑 항목이 없습니다.</p>
        ) : (
          <ul className="start-tiles">
            {brief.map((b) => (
              <li key={b.id}>
                {/* 질의문은 한 줄로 잘린다(개발서버 시안) — 전체는 title 에 */}
                <button type="button" className="tile" title={b.question} onClick={() => onPick(b.question)}>
                  <span className="tile-k">{b.label} <IcChevR size={20} /></span>
                  <span className="tile-q">{b.question}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
