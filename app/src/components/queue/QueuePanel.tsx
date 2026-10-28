"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { isActive, SOURCE_LABEL, STATE_LABEL, type JobSummary } from "@/lib/jobTypes";

/**
 * 질문 목록 패널 (R2, 사용자 아이디어 17) — 좌측 슬라이드, 숨김 가능.
 * 보낸 질문이 쌓이고, 진행 중은 로딩 표시·경과초, 끝난 것은 완료 순서대로 위에서부터.
 */
export default function QueuePanel({ open, setOpen, onPick, currentJobIds }: { open: boolean; setOpen: (v: boolean) => void; onPick: (j: JobSummary) => void; currentJobIds: Set<string> }) {
  const s = useSession();
  const [now, setNow] = useState(Date.now());
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const list = useMemo(() => s.jobOrder.map((id) => s.jobs[id]).filter(Boolean), [s.jobOrder, s.jobs]);
  const active = list.filter((j) => isActive(j.state));
  // 완료 순서(finished_at 최신 위)
  const done = list.filter((j) => !isActive(j.state)).sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at)).slice(0, 30);
  const fresh = done.filter((j) => !seen.has(j.id) && j.finished_at && Date.now() - new Date(j.finished_at).getTime() < 15 * 60_000 && !currentJobIds.has(j.id)).length;
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active.length]);
  const pick = (j: JobSummary) => {
    setSeen((p) => new Set(p).add(j.id));
    onPick(j);
  };
  if (!open)
    return (
      <button className="qp-tab" onClick={() => setOpen(true)} aria-label="질문 목록 열기">
        <span>질문 목록</span>
        {active.length > 0 && <span className="qp-badge spin-b">{active.length}</span>}
        {fresh > 0 && <span className="qp-badge new">{fresh}</span>}
      </button>
    );
  return (
    <aside className="qpanel" aria-label="질문 목록">
      <div className="qp-h">
        <b>질문 목록</b>
        <span className="xs muted">진행 {active.length}</span>
        <span className="sp" />
        <button className="lnk xs" onClick={() => setOpen(false)} aria-label="질문 목록 접기">접기 ‹</button>
      </div>
      {s.t3qOk === false && <div className="notice danger xs" style={{ margin: 8 }}>에이전트 서버에 연결할 수 없습니다. 보낸 질문은 연결되면 이어서 처리됩니다.</div>}
      <div className="qp-sec xs muted">답변 생성 중</div>
      {active.length === 0 && <div className="qp-empty xs">진행 중인 질문이 없습니다.</div>}
      {active.map((j) => {
        const sec = Math.round((now - new Date(j.created_at).getTime()) / 1000);
        return (
          <button key={j.id} className={`qp-item act ${currentJobIds.has(j.id) ? "cur" : ""}`} onClick={() => pick(j)}>
            <span className="ai-dot spin" />
            <span className="qp-q">{j.question_user}</span>
            <span className="qp-m xs">{SOURCE_LABEL[j.source]} · {STATE_LABEL[j.state]} · {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>
          </button>
        );
      })}
      <div className="qp-sec xs muted">완료(먼저 끝난 순서 아래로)</div>
      {done.length === 0 && <div className="qp-empty xs">아직 받은 답변이 없습니다.</div>}
      {done.map((j) => (
        <button key={j.id} className={`qp-item ${j.state === "DONE" ? "ok" : "bad"} ${currentJobIds.has(j.id) ? "cur" : ""}`} onClick={() => pick(j)}>
          <span className={`qp-st ${j.state === "DONE" ? "ok" : "bad"}`}>{j.state === "DONE" ? "✓" : "!"}</span>
          <span className="qp-q">{j.question_user}</span>
          <span className="qp-m xs">
            {SOURCE_LABEL[j.source]} · {j.state === "DONE" ? (j.cached_from ? "이전 답변" : `${Math.round((j.elapsed_ms ?? 0) / 1000)}초`) : STATE_LABEL[j.state]}
            {!seen.has(j.id) && !currentJobIds.has(j.id) && j.finished_at && Date.now() - new Date(j.finished_at).getTime() < 15 * 60_000 ? " · 새 답변" : ""}
          </span>
        </button>
      ))}
    </aside>
  );
}
