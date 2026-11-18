"use client";
import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession, type Turn } from "@/lib/session";
import { isActive, receivedAt, type JobFull, type JobState, type JobSummary, type T3qRef } from "@/lib/jobTypes";
import { libById } from "@/lib/library";
import { BRIEF_FAILED, headlineOf, isAnswerOk, mappable } from "@/lib/answerText";
import { fmtAgo, fmtElapsed, fmtRunning } from "@/lib/format";
import { openBriefingSettings } from "@/components/briefing/BriefingSettingsModal";
import { AnswerMarkdown } from "../answer/Markdown";
import AnswerFeedback from "../answer/AnswerFeedback";
import { ExploreContext } from "./ExploreCtx";
import "./brief.css";

/**
 * 현재 상황 브리핑 — 개발서버 BriefingPanel · BriefingItemCard · BriefingAnswer 그대로(2026-11-19 「개발서버와 동일하게」).
 * 머리: 제목 · [수정](브리핑 설정 창) / 「기준지역 ○○ · 기준시각 … · 재난유형 ○○(없으면 전체)」 / 「재난안전 AI  {시각} 기준」 / 센 것만 적은 머리말.
 * 모두 실패하면 빨간 상자 「브리핑 결과를 불러오지 못했습니다.」 + [다시 시도](실패한 것 모두), 항목 목록은 숨긴다.
 * 항목: 번호 · 항목 이름(질문 글이 아님) · 답이 오면 [크게 보기] · 더 있으면 [더보기 ▼]/[n건 더보기 ▼]/[접기 ▲].
 *   차례를 기다림·진행 중은 점선 상자(진행 중 줄·[취소]·흐르는 글은 renderBody — AnswerCard brief), 실패는 노란 줄 + [다시 시도], 그만둠은 「그만두었습니다.」 + [다시 시도].
 *   답은 처음에 첫 문단 한 줄만, [더보기]로 답 글만 편다(briefing-item-detail — 답 카드 전체가 아님).
 * 크게 보기: 대화창 같은 틀 — [← 브리핑 이름] · 항목 이름 · 「브리핑」 딱지 · [새 대화] / 질문 말풍선 / 답 카드(재난안전 AI · 시작 시각 기준 · 답 글 · 대상지역 n건 · 평가).
 * 응답 상태가 SUCCESS 가 아니면(일부 제공 등) 답이 와도 실패로 본다(개발서버 useBriefing isSuccess, 2026-11-06).
 */

/** 브리핑 턴의 묶음 — 보낼 때 항목 이름(브리핑 설정의 「항목 이름」)·기준지역 이름을 함께 둔다(화면 표시용, 보내는 요청에는 넣지 않음) */
export type BriefGroup = NonNullable<Turn["group"]> & { label?: string; region?: string };
const groupOf = (t: Turn | undefined) => t?.group as BriefGroup | undefined;

type Kind = "run" | "wait" | "done" | "err" | "off";
export interface BriefCell {
  /** 턴 ID */
  id: string;
  no: number;
  label: string | null;
  kind: Kind;
  /** 상태 글 */
  text: string;
  /** 처리 시간(완료 등) 또는 진행 중 시계 */
  time: string | null;
  gaps: boolean;
  warns: boolean;
  /** 「재사용 · n시간 전」 · 받은 시각을 모르면 「재사용」 */
  reuse: string | null;
  /** 답(완료 작업)이 왔는가 */
  answered: boolean;
}

const RUN_TEXT: Partial<Record<JobState, string>> = { QUEUED: "대기 중", SUBMITTED: "보내는 중", RUNNING: "생성 중" };
const END_TEXT: Partial<Record<JobState, string>> = { FAILED: "오류", TIMEOUT: "시간 초과", LOST: "유실", CANCELLED: "취소됨" };
/** 끝난 답의 처리 시간·「재사용」 — 끔(사용자 지시 2026-11-02 — 시연) */
const SHOW_DONE_META = false;

/** 한 항목의 상태 — 턴(접수 전·접수 실패)·작업 요약·원응답에서 받은 값만 */
export function briefCell(t: Turn, i: number, job: JobSummary | undefined, full: JobFull | undefined, now: number): BriefCell {
  const g = groupOf(t);
  const label = g?.label?.trim() || (t.libraryId ? libById(t.libraryId)?.category : undefined) || null;
  const base: BriefCell = { id: t.id, no: g?.no ?? i + 1, label, kind: "wait", text: "", time: null, gaps: false, warns: false, reuse: null, answered: false };
  if (t.error) return { ...base, kind: "err", text: "접수 실패" };
  if (t.pending || !t.jobId) return { ...base, kind: "run", text: "보내는 중", time: fmtRunning(now - Date.parse(t.at)) };
  if (!job) return { ...base, kind: "wait", text: "불러오는 중" };
  if (isActive(job.state)) return { ...base, kind: "run", text: RUN_TEXT[job.state] ?? job.state, time: fmtRunning(now - Date.parse(job.created_at)) };
  const raw = full?.raw ?? null;
  const ms = raw?.meta?.elapsed_ms;
  const at = job.cached_from ? receivedAt(job, full) : null;
  const ago = at ? fmtAgo(now - Date.parse(at)) : null;
  const got = {
    time: SHOW_DONE_META && typeof ms === "number" ? fmtElapsed(ms) : null,
    gaps: (raw?.data_gaps?.length ?? 0) > 0,
    warns: (raw?.warnings?.length ?? 0) > 0,
    reuse: SHOW_DONE_META && job.cached_from ? (ago ? `재사용 · ${ago}` : "재사용") : null,
  };
  if (job.state === "DONE") {
    if (isAnswerOk(job.t3q_status ?? raw?.status ?? null)) return { ...base, ...got, answered: true, kind: "done", text: "완료" };
    return { ...base, ...got, kind: "err", text: "오류" };
  }
  return { ...base, ...got, kind: job.state === "CANCELLED" ? "off" : "err", text: END_TEXT[job.state] ?? job.state };
}

/** 「…은/는」 — 앞 글자에 받침이 있으면 「은」, 한글이 아니면 「은(는)」(개발서버 BriefingPanel topicParticle) */
export function topicParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (!(last >= 0xac00 && last <= 0xd7a3)) return "은(는)";
  return (last - 0xac00) % 28 === 0 ? "는" : "은";
}

/**
 * 머리말 한 줄(개발서버 BriefingPanel summarize) — 세트 전체를 아우르는 글은 상류가 주지 않으므로 센 것만 적는다.
 * 진행 중 = 「결과를 확인하고 있습니다.」 · 다 됨 = 「브리핑 항목 N개를 정리했습니다.」 · 실패가 있으면 「… ○○은(는) 불러오지 못했습니다.」
 * 실패 = 오류 계열(취소됨은 빼고 — 개발서버 phase failed). 모두 실패(완료 0)면 null — 머리에 「브리핑 결과를 불러오지 못했습니다.」
 */
export function briefSummary(cells: Pick<BriefCell, "kind" | "label" | "no">[]): string | null {
  if (cells.some((c) => c.kind === "run" || c.kind === "wait")) return "결과를 확인하고 있습니다.";
  const done = cells.filter((c) => c.kind === "done").length;
  const failed = cells.filter((c) => c.kind === "err");
  if (!done && failed.length) return null;
  if (!failed.length) return `브리핑 항목 ${done}개를 정리했습니다.`;
  const names = failed.map((c) => c.label ?? `${c.no}번 항목`);
  return `브리핑 항목 ${done}개를 정리했습니다. ${names.join(", ")}${topicParticle(names[names.length - 1])} 불러오지 못했습니다.`;
}
/** 시안 표기 2026.08.25 16:00 — 읽지 못하면 null */
export function briefStamp(iso: string | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const BIG_EVT = "sa:brief-big";
/**
 * 바깥(질문 현황 등)에서 크게 보기를 열고 닫는다 — id = 턴 ID(그 항목 크게 보기), null = 브리핑 전체로(개발서버 asks.select · asks.clear).
 * 그 턴이 들어 있는 브리핑만 반응한다(null 은 모두 닫힌다)
 */
export const showBriefItem = (id: string | null) => window.dispatchEvent(new CustomEvent(BIG_EVT, { detail: { id } }));

/** 개발서버 항목 phase — 차례 기다림 · 진행 중 · 답 · 실패 · 그만둠 */
type Phase = "waiting" | "running" | "done" | "failed" | "cancelled";

interface BoardProps {
  turns: Turn[];
  regionName: string;
  /** 진행 중 항목 본문(기다리는 줄·[취소]·흐르는 글 — AnswerCard brief). 답·실패·그만둠은 이 카드가 그린다 */
  renderBody: (t: Turn, large?: boolean) => ReactNode;
  /** 그 항목만 다시 보내기(접수 실패·오류·시간 초과·유실·취소됨). 없으면 [다시 시도]를 두지 않는다 */
  onRetry?: (t: Turn) => void;
  /** 크게 보기의 [새 대화](개발서버 BriefingAnswer onReset). 없으면 단추를 두지 않는다 */
  onNew?: () => void;
  /** 재난유형 — 보낸 요청에 없을 때 쓴다(없으면 「전체」) */
  disasterType?: string | null;
}

/** 다시 보낼 수 있는 상태 — 오류 계열·취소됨 */
const retryable = (k: Kind) => k === "err" || k === "off";

/** 보낸 요청의 재난유형(query_context.disaster_types 첫째) */
function sentType(full: JobFull | undefined): string | null {
  const qc = (full?.request as { query_context?: { disaster_types?: unknown } | null } | undefined)?.query_context;
  const list = qc?.disaster_types;
  return Array.isArray(list) && typeof list[0] === "string" && list[0] ? list[0] : null;
}

export default function BriefBoard({ turns, regionName, renderBody, onRetry, onNew, disasterType }: BoardProps) {
  const s = useSession();
  const x = useContext(ExploreContext);
  // 「크게 보기」로 연 항목(턴 ID) — 그 항목이 묶음에서 빠지면 저절로 풀린다
  const [bigId, setBigId] = useState<string | null>(null);
  // [더보기]로 편 항목(턴 ID) — 처음에는 모두 접혀 첫 문단 한 줄만
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const big = bigId ? turns.find((t) => t.id === bigId) ?? null : null;
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id ?? null;
      if (id === null) setBigId(null);
      else if (turns.some((t) => t.id === id)) setBigId(id);
    };
    window.addEventListener(BIG_EVT, on);
    return () => window.removeEventListener(BIG_EVT, on);
  }, [turns]);
  // 상태만 쓴다 — 진행 시계는 진행 줄(renderBody)이 센다(now 는 쓰지 않으므로 0)
  const cells = useMemo(
    () => turns.map((t, i) => briefCell(t, i, t.jobId ? s.jobs[t.jobId] : undefined, t.jobId ? s.full[t.jobId] : undefined, 0)),
    [turns, s.jobs, s.full],
  );
  const summary = briefSummary(cells);
  const cellOf = (id: string) => cells.find((c) => c.id === id);

  const g0 = groupOf(turns[0]);
  const title = g0?.title?.trim() || "현재 상황 브리핑";
  const stamp = briefStamp(turns[0]?.at) ?? "";
  const firstFull = turns.map((t) => (t.jobId ? s.full[t.jobId] : undefined)).find(Boolean);
  const dtype = sentType(firstFull) ?? (disasterType && disasterType !== "전체" ? disasterType : null) ?? "전체";

  const phaseOf = (t: Turn): Phase => {
    const c = cellOf(t.id);
    if (!c) return "running";
    if (c.kind === "done") return "done";
    if (c.kind === "err") return "failed";
    if (c.kind === "off") return "cancelled";
    return t.jobId && s.jobs[t.jobId]?.state === "QUEUED" ? "waiting" : "running";
  };
  const nameOf = (t: Turn) => cellOf(t.id)?.label ?? t.q;
  const noOf = (t: Turn, i: number) => cellOf(t.id)?.no ?? i + 1;

  // 모든 항목이 실패(진행 중 없음·답 없음) — 개발서버 BriefingPanel allFailed(취소됨은 실패가 아니다)
  const allFailed = cells.length > 0 && !cells.some((c) => c.kind === "run" || c.kind === "wait") && !cells.some((c) => c.kind === "done") && cells.some((c) => c.kind === "err");
  const retryAll = () => {
    if (!onRetry) return;
    for (const t of turns) if (retryable(cellOf(t.id)?.kind ?? "wait")) onRetry(t);
  };
  const open = (id: string | null) => {
    const back = bigId;
    setBigId(id);
    // 열면 크게 보기 머리로, 닫으면 보던 항목으로 — 화면이 엉뚱한 자리에 남지 않게
    window.requestAnimationFrame(() => {
      const el = id ? document.querySelector<HTMLElement>(".brief-big") : document.querySelector<HTMLElement>(`[data-brief-item="${back ?? ""}"]`);
      el?.scrollIntoView?.({ block: "start" });
    });
  };

  /** 받은 답 글(완료 항목). 원응답을 아직 못 받았으면 null */
  const answerOf = (t: Turn): string | null => {
    const raw = t.jobId ? s.full[t.jobId]?.raw : undefined;
    if (!raw) return null;
    return typeof raw.result?.answer === "string" ? raw.result.answer.trim() : "";
  };
  const refsOf = (t: Turn): T3qRef[] => ((t.jobId ? s.full[t.jobId]?.raw?.result?.refs : undefined) ?? []) as T3qRef[];
  const toggle = (id: string) =>
    setOpened((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ── 크게 보기(개발서버 BriefingAnswer) ── */
  if (big) {
    const ph = phaseOf(big);
    const text = answerOf(big);
    const refs = refsOf(big);
    const n = refs.filter(mappable).length;
    const jobId = big.jobId;
    return (
      <section className="answer-panel brief-big" aria-label={`브리핑 항목 ${nameOf(big)}`}>
        <header className="answer-head">
          <button type="button" className="answer-back" onClick={() => open(null)}>
            <span aria-hidden="true">←</span> {title}
          </button>
          <h2 className="answer-title">{nameOf(big)}</h2>
          <span className="answer-origin">브리핑</span>
          {onNew && (
            <button type="button" className="answer-new" onClick={onNew}>
              <PlusIcon />새 대화
            </button>
          )}
        </header>
        <div className="answer-turns">
          <div className="answer-turn">
            <div className="answer-ask-row">
              <p className="answer-ask">{big.q}</p>
            </div>
            {ph === "cancelled" || ph === "failed" ? (
              <div className="answer-error" role={ph === "failed" ? "alert" : "status"}>
                <p className="answer-error-text">{ph === "cancelled" ? "그만두었습니다." : (big.error ?? BRIEF_FAILED)}</p>
                {onRetry && <button type="button" className="answer-retry" onClick={() => onRetry(big)}>다시 시도</button>}
              </div>
            ) : ph !== "done" || text === null ? (
              renderBody(big, true)
            ) : text ? (
              <article className="answer-card">
                <header className="answer-card-head">
                  <span className="answer-card-who">재난안전 AI</span>
                  <span className="answer-card-at">{stamp} 기준</span>
                </header>
                <AnswerMarkdown text={text} refs={refs} onRef={x && jobId ? (r) => x.openEntity(jobId, r) : undefined} />
                {n > 0 && (
                  <p className="answer-note">
                    <strong>대상지역</strong> {n}건
                  </p>
                )}
                {jobId && <AnswerFeedback jobId={jobId} />}
              </article>
            ) : (
              <p className="answer-error-text">답변이 비어 있습니다.</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ── 브리핑 결과(개발서버 BriefingPanel · BriefingItemCard) ── */
  return (
    <section className="briefing-panel" aria-live="polite">
      <header className="briefing-panel-head">
        <div className="briefing-panel-row">
          <h2 className="briefing-panel-title">{title}</h2>
          <button type="button" className="briefing-bar-edit" onClick={openBriefingSettings}>수정</button>
        </div>
        <p className="briefing-panel-meta">
          <span>기준지역 <strong>{g0?.region ?? regionName}</strong></span>
          <span className="cond-dot" aria-hidden="true">·</span>
          <span>기준시각 <strong>{stamp}</strong></span>
          <span className="cond-dot" aria-hidden="true">·</span>
          <span>재난유형 <strong>{dtype}</strong></span>
        </p>
      </header>

      <div className="briefing-ai">
        <span className="briefing-ai-name">재난안전 AI</span>
        <span className="briefing-ai-time">{stamp} 기준</span>
      </div>

      {allFailed ? (
        <>
          <p className="briefing-panel-error" role="alert">
            <ErrorIcon />
            브리핑 결과를 불러오지 못했습니다.
          </p>
          {onRetry && <button type="button" className="briefing-retry" onClick={retryAll}>다시 시도</button>}
        </>
      ) : (
        <p className="briefing-panel-summary">{summary}</p>
      )}

      {!allFailed && (
        <ol className="briefing-items">
          {turns.map((t, i) => {
            const ph = phaseOf(t);
            const no = noOf(t, i);
            const name = nameOf(t);
            const text = ph === "done" ? answerOf(t) : null;
            const { headline, rest } = headlineOf(text ?? "");
            const more = text !== null && rest.length > 0;
            const isOpen = opened.has(t.id);
            const refN = refsOf(t).length;
            return (
              <li key={t.id} className={`briefing-item is-${ph}`} id={t.jobId ? `job-${t.jobId}` : undefined} data-brief-item={t.id}>
                <div className="briefing-item-head">
                  <span className="briefing-item-no" aria-hidden="true">{no}</span>
                  <h3 className="briefing-item-label">{name}</h3>
                  {ph === "done" && (
                    <button type="button" className="briefing-item-open" aria-label={`${no}번 ${name} 크게 보기`} onClick={() => open(t.id)}>크게 보기</button>
                  )}
                  {ph === "done" && more && (
                    <button type="button" className="briefing-item-more" aria-expanded={isOpen} onClick={() => toggle(t.id)}>
                      {isOpen ? "접기" : refN > 0 ? `${refN}건 더보기` : "더보기"}
                      <Caret up={isOpen} />
                    </button>
                  )}
                </div>

                {ph === "waiting" && <p className="briefing-item-wait">{"차례를 기다리고 있습니다."}</p>}

                {ph === "running" && renderBody(t)}

                {ph === "cancelled" && (
                  <>
                    <p className="briefing-item-wait">{"그만두었습니다."}</p>
                    {onRetry && (
                      <button type="button" className="briefing-retry" aria-label={`${no}번 ${name} 다시 시도`} onClick={() => onRetry(t)}>
                        <RetryIcon />
                        다시 시도
                      </button>
                    )}
                  </>
                )}

                {ph === "failed" && (
                  <>
                    <p className="briefing-item-error" role="alert">
                      <WarningIcon />
                      {t.error ?? BRIEF_FAILED}
                    </p>
                    {/* 한 항목이 어긋났다고 브리핑을 처음부터 다시 돌릴 이유는 없다 */}
                    {onRetry && (
                      <button type="button" className="briefing-retry" aria-label={`${no}번 ${name} 다시 시도`} onClick={() => onRetry(t)}>
                        <RetryIcon />
                        다시 시도
                      </button>
                    )}
                  </>
                )}

                {ph === "done" &&
                  (text === null ? (
                    // 완료했지만 원응답을 아직 못 받음 — 불러오는 줄(AnswerCard brief)
                    renderBody(t)
                  ) : (
                    <>
                      {!isOpen && <p className="briefing-item-summary">{headline || "답변이 비어 있습니다."}</p>}
                      {/* 펼치면 답 글만(엔터티 링크 없음 — 개발서버 BriefingItemCard 는 onEntity 를 주지 않는다) */}
                      {isOpen && (
                        <div className="briefing-item-detail">
                          <AnswerMarkdown text={text} refs={refsOf(t)} />
                        </div>
                      )}
                    </>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** 시안의 ▼ — KRDS 더보기 단추는 채운 삼각형(개발서버 BriefingItemCard Caret) */
function Caret({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={up ? "M4 10.5h8L8 5.5z" : "M4 5.5h8L8 10.5z"} fill="currentColor" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 2.8 18.2 17H1.8L10 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 7.8v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.4 1.9v2.9h-2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7.2 7.2 5.6 5.6M12.8 7.2l-5.6 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
