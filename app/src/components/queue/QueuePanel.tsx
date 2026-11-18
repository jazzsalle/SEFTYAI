"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { askBad, askElapsed, askEntriesOf, QUEUE_EMPTY, QUEUE_FILTERS, type AskEntry, type AskTurn, type QueueFilter } from "@/lib/queueList";
import { recentDone } from "@/lib/dialogue";
import "./queue.css";

/**
 * 질문 현황 패널 (개발서버 AskList·useAskList — 정의서 v1.75 UFR-006-001-10 · FUN-UFR-301010) — 좌측, 접을 수 있다.
 * <b>지금 대화의 질문만</b> 올린다(개발서버처럼 — 전에는 계정의 작업 전체였다). 지난 질문을 다시 보는 자리는 「대화 이력」.
 * 최근 20개까지 — 도는 질문은 늘 보이고, 넘으면 오래된 끝난 질문부터 목록에서만 뺀다(대화에는 남는다). 끝난 줄은 먼저 끝난 것이 위.
 * 상태 칩(전체·진행 중·완료·실패·중단 — 칩마다 건수, 누르면 그 상태만·칩별 빈 문구), 맨 위 「(브리핑 이름) 전체 보기」 줄(브리핑을 걸었으면).
 * 답변 생성 중인 대화 질문은 눌러 그 질문 위치로 간다. 도는 브리핑 항목은 누를 수 없다(아직 보일 답이 없다 — 단추 대신 글).
 * 접힌 탭에는 진행(파랑) · 새로 끝남(초록) · 새로 실패·중단(빨강)을 따로 센다 — 펼쳐서 본 것·골라 본 것은 «본 것».
 * 모양은 개발서버 AskList 그대로(머리 h2 + 「진행 n」 · [접기 ‹] · 상태 칩 · 묶음 제목 h3 · 줄) — 개발서버에 없는 연결 끊김 안내 줄은 두지 않는다(2026-11-19).
 */
export default function QueuePanel({ open, setOpen, turns, selectedId, onPick, briefing }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** 지금 대화의 턴 */
  turns: readonly AskTurn[];
  /** 지금 가운데에서 고른 줄(턴 id) */
  selectedId?: string | null;
  onPick: (e: AskEntry) => void;
  /** 지금 대화에 브리핑이 있으면 그 이름과 그 묶음으로 가는 길 · shown = 지금 브리핑 전체가 보이는지 */
  briefing?: { title: string; onShow: () => void; shown?: boolean } | null;
}) {
  const s = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<QueueFilter>("all");
  const { running, done: allDone } = useMemo(() => askEntriesOf(turns, (id) => s.jobs[id], now), [turns, s.jobs, now]);
  const done = useMemo(() => recentDone(allDone, running.length, undefined, false), [allDone, running.length]);

  // 펼쳐서 본 것 · 골라 본 것은 «본 것»
  useEffect(() => {
    if (!open) return;
    setSeen((p) => (done.every((e) => p.has(e.id)) ? p : new Set([...p, ...done.map((e) => e.id)])));
  }, [open, done]);
  useEffect(() => {
    if (selectedId) setSeen((p) => (p.has(selectedId) ? p : new Set(p).add(selectedId)));
  }, [selectedId]);
  const fresh = done.filter((e) => !seen.has(e.id));
  const freshBad = fresh.filter(askBad).length;
  const freshOk = fresh.length - freshBad;
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running.length]);

  if (!open)
    // 화면 왼쪽 가장자리에 세로 글씨 탭 하나만 남는다(개발서버 ask-reopen)
    return (
      <button
        type="button"
        className="qp-tab"
        onClick={() => setOpen(true)}
        aria-label={["질문 현황 펼치기", running.length > 0 && `진행 중 ${running.length}건`, freshOk > 0 && `새로 끝난 답 ${freshOk}건`, freshBad > 0 && `실패·중단 ${freshBad}건`].filter(Boolean).join(" — ")}
      >
        <span className="qp-tab-t">질문 현황</span>
        {running.length > 0 && <span className="qp-badge run" aria-hidden="true">{running.length}</span>}
        {freshOk > 0 && <span className="qp-badge ok" aria-hidden="true">{freshOk}</span>}
        {freshBad > 0 && <span className="qp-badge bad" aria-hidden="true">{freshBad}</span>}
      </button>
    );

  const badN = done.filter(askBad).length;
  const counts: Record<QueueFilter, number> = { all: running.length + done.length, running: running.length, done: done.length - badN, bad: badN };
  const shownDone = filter === "done" ? done.filter((e) => !askBad(e)) : filter === "bad" ? done.filter(askBad) : done;
  const runText = (e: AskEntry) => (
    <>
      <span className="answer-spinner" aria-hidden="true" />
      <span className="qp-txt">
        <span className="qp-q">{e.question}</span>
        <span className="qp-m">{e.origin} · {askElapsed(e.elapsedMs)}</span>
      </span>
    </>
  );
  return (
    <nav className="qpanel" aria-label="질문 현황">
      <div className="qp-h">
        <h2>
          질문 현황
          <span className="qp-count">진행 {running.length}</span>
        </h2>
        <button type="button" className="qp-fold" onClick={() => setOpen(false)}>
          접기
          <ChevronLeft />
        </button>
      </div>
      <div className="qp-filter" role="group" aria-label="질문 상태로 거르기">
        {QUEUE_FILTERS.map((f) => (
          <button key={f.key} type="button" className="qp-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} {counts[f.key]}
          </button>
        ))}
      </div>
      <div className="qp-body">
        {/* 브리핑을 걸었으면 그 묶음 전체로 가는 줄을 맨 위에(개발서버 ask-briefing-all) */}
        {briefing && (
          <button type="button" className={`qp-brief-all${briefing.shown ? " cur" : ""}`} aria-current={briefing.shown ? "true" : undefined} onClick={briefing.onShow}>
            {briefing.title} 전체 보기
          </button>
        )}
        {(filter === "all" || filter === "running") && (
          <section className="qp-group">
            <h3 className="qp-sec">답변 생성 중</h3>
            {running.length === 0 ? (
              <p className="qp-empty">{QUEUE_EMPTY.running}</p>
            ) : (
              <ul>
                {running.map((e) => (
                  <li key={e.id}>
                    {/* 대화의 질문은 답변 생성 중이어도 누르면 그 질문 위치로 간다(FUN-UFR-301010). 도는 브리핑 항목은 글로 둔다 */}
                    {e.kind === "turn" ? (
                      <button type="button" className="qp-item act" onClick={() => onPick(e)}>{runText(e)}</button>
                    ) : (
                      <div className="qp-item act">{runText(e)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {filter !== "running" && (
          <section className="qp-group">
            <h3 className="qp-sec">{filter === "bad" ? "실패·중단" : "완료"}</h3>
            {shownDone.length === 0 ? (
              <p className="qp-empty">{filter === "bad" ? QUEUE_EMPTY.bad : QUEUE_EMPTY.done}</p>
            ) : (
              <ul>
                {shownDone.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`qp-item ${askBad(e) ? "bad" : "ok"}${e.id === selectedId ? " cur" : ""}`}
                      aria-current={e.id === selectedId}
                      onClick={() => {
                        setSeen((p) => new Set(p).add(e.id));
                        onPick(e);
                      }}
                    >
                      {e.failed ? <WarnIcon /> : e.cancelled ? <StopIcon /> : <CheckIcon />}
                      <span className="qp-txt">
                        <span className="qp-q">{e.question}</span>
                        <span className="qp-m">
                          {e.origin}
                          {e.failed ? " · 실패" : e.cancelled ? " · 중단" : ` · ${askElapsed(e.elapsedMs)}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </nav>
  );
}

/** [접기] 왼쪽 꺾쇠(개발서버 AskList ChevronIcon left) */
function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m10 3.5-5 4.5 5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 그만둔 줄의 표 — 실패(경고)와도 완료(체크)와도 다른 얼굴(개발서버 AskList StopIcon) */
function StopIcon() {
  return (
    <svg className="qp-st" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="7.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6 9h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="qp-st ok" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3 8.5 3.5 3.5L13 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg className="qp-st bad" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6v4M8 11v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
