"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { isActive, SOURCE_LABEL, STATE_LABEL, type JobSummary } from "@/lib/jobTypes";
import { queueBad, queueCounts, queueFilter, QUEUE_EMPTY, QUEUE_FILTERS, type QueueFilter } from "@/lib/queueList";
import "./queue.css";

/** 새로 끝난 답으로 세는 시간 — 다시 들어왔을 때 옛 작업이 모두 「새 답」으로 서지 않게(우리 목록은 계정의 지난 작업도 싣는다) */
const FRESH_MS = 15 * 60_000;

/**
 * 질문 목록 패널 (R2, 사용자 아이디어 17 · 개발서버 AskList·asklist.css kjw 998facb) — 좌측 슬라이드, 숨김 가능.
 * 상태 칩(전체·진행 중·완료·실패·중단 — 칩마다 건수, 누르면 그 상태만·칩별 빈 문구), 맨 위 「(브리핑 이름) 전체 보기」 줄(브리핑을 걸었으면).
 * 접힌 탭에는 진행(파랑·도는 고리) · 새 답(초록) · 새 실패·중단(빨강)을 따로 센다 — 펼쳐서 본 것·골라 본 것은 «본 것».
 * AI 모드 점검(source AI_MODE)은 넣지 않는다(R39). 진행 중인 질문도 누를 수 있다(우리 기능 — 진행 상황 카드로 간다).
 */
export default function QueuePanel({ open, setOpen, onPick, currentJobIds, briefing }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (j: JobSummary) => void;
  currentJobIds: Set<string>;
  /** 지금 대화에 브리핑이 있으면 그 이름과 그 묶음으로 가는 길 */
  briefing?: { title: string; onShow: () => void } | null;
}) {
  const s = useSession();
  const [now, setNow] = useState(Date.now());
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<QueueFilter>("all");
  const list = useMemo(() => s.jobOrder.map((id) => s.jobs[id]).filter((j) => j && j.source !== "AI_MODE"), [s.jobOrder, s.jobs]);
  const active = list.filter((j) => isActive(j.state));
  // 완료 순서(finished_at 최신 위)
  const done = useMemo(
    () => list.filter((j) => !isActive(j.state)).sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at)).slice(0, 30),
    [list],
  );
  // 펼쳐 둔 동안 끝난 것은 본 것
  useEffect(() => {
    if (!open) return;
    setSeen((p) => (done.every((j) => p.has(j.id)) ? p : new Set([...p, ...done.map((j) => j.id)])));
  }, [open, done]);
  const fresh = done.filter((j) => !seen.has(j.id) && j.finished_at && now - new Date(j.finished_at).getTime() < FRESH_MS && !currentJobIds.has(j.id));
  const freshBad = fresh.filter(queueBad).length;
  const freshOk = fresh.length - freshBad;
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
      <button
        className="qp-tab"
        onClick={() => setOpen(true)}
        aria-label={["질문 목록 펼치기", active.length > 0 && `진행 중 ${active.length}건`, freshOk > 0 && `새로 끝난 답 ${freshOk}건`, freshBad > 0 && `실패·중단 ${freshBad}건`].filter(Boolean).join(" — ")}
      >
        <span>질문 목록</span>
        {active.length > 0 && <span className="qp-badge run" aria-hidden="true">{active.length}</span>}
        {freshOk > 0 && <span className="qp-badge ok" aria-hidden="true">{freshOk}</span>}
        {freshBad > 0 && <span className="qp-badge bad" aria-hidden="true">{freshBad}</span>}
      </button>
    );
  const counts = queueCounts(active, done);
  const shownDone = queueFilter(done, filter);
  return (
    <aside className="qpanel" aria-label="질문 목록">
      <div className="qp-h">
        <b>질문 목록</b>
        <span className="xs muted">진행 {active.length}</span>
        <span className="sp" />
        <button className="lnk xs" onClick={() => setOpen(false)} aria-label="질문 목록 접기">접기 ‹</button>
      </div>
      <div className="qp-filter" role="group" aria-label="질문 상태로 거르기">
        {QUEUE_FILTERS.map((f) => (
          <button key={f.key} type="button" className="qp-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} {counts[f.key]}
          </button>
        ))}
      </div>
      {s.t3qOk === false && <div className="notice danger xs" style={{ margin: 8 }}>에이전트 서버에 연결할 수 없습니다. 보낸 질문은 연결되면 이어서 처리됩니다.</div>}
      {briefing && <button type="button" className="qp-brief-all" onClick={briefing.onShow}>{briefing.title} 전체 보기</button>}
      {(filter === "all" || filter === "running") && (
        <>
          <div className="qp-sec xs muted">답변 생성 중</div>
          {active.length === 0 && <div className="qp-empty xs">{QUEUE_EMPTY.running}</div>}
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
        </>
      )}
      {filter !== "running" && (
        <>
          <div className="qp-sec xs muted">{filter === "bad" ? "실패·중단" : "완료"}</div>
          {shownDone.length === 0 && <div className="qp-empty xs">{filter === "bad" ? QUEUE_EMPTY.bad : QUEUE_EMPTY.done}</div>}
          {shownDone.map((j) => {
            const bad = queueBad(j);
            const isFresh = fresh.some((f) => f.id === j.id);
            return (
              <button key={j.id} className={`qp-item ${bad ? "bad" : "ok"} ${currentJobIds.has(j.id) ? "cur" : ""}`} onClick={() => pick(j)}>
                <span className={`qp-st ${bad ? "bad" : "ok"}`}>{bad ? "!" : "✓"}</span>
                <span className="qp-q">{j.question_user}</span>
                <span className="qp-m xs">
                  {SOURCE_LABEL[j.source]} · {j.state === "DONE" ? (bad ? "실패" : j.cached_from ? "이전 답변" : `${Math.round((j.elapsed_ms ?? 0) / 1000)}초`) : STATE_LABEL[j.state]}
                  {isFresh ? " · 새 답변" : ""}
                </span>
              </button>
            );
          })}
        </>
      )}
    </aside>
  );
}
