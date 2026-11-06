"use client";
import { useState } from "react";
import { api } from "@/lib/api";

/**
 * 답변 평가 — 개발서버 features/search/components/AnswerFeedback.tsx 그대로(R60).
 *  · 「아쉬워요」만 까닭을 묻는다(비워 두고 보낼 수 있음, 500자). 평가는 [바꾸기]로 고칠 수 있다(상류 T3Q-31 이 같은 response_id 를 덮어씀)
 *  · 평가한 답은 이 브라우저에 적어 둔다(sa.feedback — 개발서버 nia.feedback). 새로 고쳐도 「평가해 주셔서 고맙습니다」
 *  · 보내지 못하면 제자리에 알린다(토스트 아님)
 */
export const FEEDBACK_KEY = "sa.feedback";
export const FEEDBACK_MAX = 500;
type Rating = "GOOD" | "BAD";

export function readMark(jobId: string): Rating | null {
  try {
    const one = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? "{}")[jobId];
    return one === "GOOD" || one === "BAD" ? one : null;
  } catch {
    return null;
  }
}

function writeMark(jobId: string, rating: Rating) {
  try {
    const all = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? "{}");
    all[jobId] = rating;
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all));
  } catch {
    // 못 적어도 평가는 갔다. 이 화면에서만 다시 물을 뿐이다
  }
}

export default function AnswerFeedback({ jobId }: { jobId: string }) {
  const [done, setDone] = useState<Rating | null>(() => readMark(jobId));
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  function send(rating: Rating, text?: string) {
    setSending(true);
    setFailed(false);
    void api("/api/t3q/feedback", { method: "POST", json: { jobId, rating, comment: text } })
      .then(() => {
        writeMark(jobId, rating);
        setDone(rating);
        setAsking(false);
        setComment("");
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false));
  }

  if (done !== null && !asking) {
    return (
      <div className="answer-rate answer-rate--done">
        <span className="answer-rate-thanks">
          평가해 주셔서 고맙습니다 — <strong>{done === "GOOD" ? "도움이 됐어요" : "아쉬워요"}</strong>
        </span>
        <button type="button" className="answer-rate-again" onClick={() => setAsking(true)}>
          바꾸기
        </button>
      </div>
    );
  }

  return (
    <div className="answer-rate">
      <div className="answer-rate-ask">
        <span className="answer-rate-label">이 답변이 도움이 되었습니까?</span>
        <button type="button" className={`answer-rate-btn${done === "GOOD" ? " is-picked" : ""}`} disabled={sending} onClick={() => send("GOOD")}>
          도움이 됐어요
          <FaceIcon smile />
        </button>
        {/* 「아쉬워요」는 누르는 즉시 보내지 않는다 — 까닭 칸을 먼저 열고 거기서 보낸다 */}
        <button type="button" className={`answer-rate-btn${done === "BAD" ? " is-picked" : ""}`} disabled={sending} onClick={() => setAsking(true)}>
          아쉬워요
          <FaceIcon />
        </button>
      </div>

      {asking && (
        <div className="answer-rate-why">
          <label className="answer-rate-why-label" htmlFor={`why-${jobId}`}>
            아쉬웠던 까닭 <span className="answer-rate-why-opt">(적지 않아도 됩니다)</span>
          </label>
          <textarea
            id={`why-${jobId}`}
            className="answer-rate-why-input"
            rows={2}
            maxLength={FEEDBACK_MAX}
            value={comment}
            placeholder="예: 물어본 지역이 아닌 곳을 답했습니다."
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="answer-rate-why-foot">
            <button
              type="button"
              className="answer-rate-cancel"
              disabled={sending}
              onClick={() => {
                setAsking(false);
                setComment("");
                setFailed(false);
              }}
            >
              취소
            </button>
            <button type="button" className="answer-rate-send" disabled={sending} onClick={() => send("BAD", comment.trim())}>
              {sending ? "보내는 중…" : "보내기"}
            </button>
          </div>
        </div>
      )}

      {failed && (
        <p className="answer-rate-failed" role="alert">
          평가를 보내지 못했습니다. 잠시 뒤 다시 눌러 주십시오.
        </p>
      )}
    </div>
  );
}

/** KRDS icon/face_smile · icon/face_sad — 글 오른쪽 16 */
function FaceIcon({ smile = false }: { smile?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.8" cy="6.5" r="0.8" fill="currentColor" />
      <circle cx="10.2" cy="6.5" r="0.8" fill="currentColor" />
      <path
        d={smile ? "M5.3 9.5c.7 1 1.6 1.5 2.7 1.5s2-.5 2.7-1.5" : "M5.3 11c.7-1 1.6-1.5 2.7-1.5s2 .5 2.7 1.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
