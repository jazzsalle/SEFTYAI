"use client";
/**
 * 이어서 물어보기 — 추천 후속질문 1~3개(개발서버 AnswerPanel followUpsOf · 정의서 UFR-001-002-01 · FUN-UFR-301003, R62).
 * T3Q 응답 result.follow_up_questions 의 text 를 받은 순서대로, 글이 있는 것만 앞의 3개. 하나도 없으면 이 자리를 아예 내지 않는다
 * (T3Q 가 채우는 것은 11/20 부터라 그 전에는 빈 배열). 누르면 그 글 그대로 이 대화에 이어 묻는다(출처 FOLLOW_UP)
 */
import "../explore/dialogue.css";

/** 추천 후속질문 최대 수(개발서버 FollowUpMax) */
export const FOLLOW_UP_MAX = 3;

export function followUpsOf(list: unknown): { id: string; text: string }[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((q): q is { question_id?: unknown; text: string } => !!q && typeof q === "object" && typeof (q as { text?: unknown }).text === "string" && (q as { text: string }).text.trim() !== "")
    .slice(0, FOLLOW_UP_MAX)
    .map((q, i) => ({ id: typeof q.question_id === "string" ? q.question_id : `fu-${i}`, text: q.text.trim() }));
}

export default function FollowUps({ list, onAsk }: { list: unknown; onAsk?: (text: string) => void }) {
  const items = followUpsOf(list);
  if (!onAsk || items.length === 0) return null;
  return (
    <section className="answer-followups" aria-label="이어서 물어보기">
      <h4>이어서 물어보기</h4>
      <ul>
        {items.map((q) => (
          <li key={q.id}>
            <button type="button" className="answer-followup" onClick={() => onAsk(q.text)}>
              {q.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
