"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession, type Turn } from "@/lib/session";
import { isActive, receivedAt, type JobFull, type JobState, type JobSummary } from "@/lib/jobTypes";
import { libById } from "@/lib/library";
import { headlineOf, isAnswerOk } from "@/lib/answerText";
import { fmtAgo, fmtElapsed, fmtRunning } from "@/lib/format";
import { SCN_SENT_LABEL, sentWithScenario } from "@/lib/scenario";
import { IcChevD } from "../Icons";
import "./brief.css";

/**
 * 현재 상황 브리핑 카드 — 현황판(D1) + 항목(질문 순서, 답은 접지 않음).
 * 현황판 칸: 번호 · 항목 이름 / 상태(기호 + 글) · 처리 시간(제공처 meta.elapsed_ms) 또는 진행 중 시계(「n분 n초째」) /
 *   「정보 부족 있음」(답 data_gaps 있음) · 「경고 있음」(답 warnings 있음) · 「재사용 · n시간 전」(원래 답을 받은 시각 기준 — 답 카드와 같은 receivedAt·fmtAgo) / 「새로 도착」(D2).
 * 상태는 작업 상태를 합치지 않고 그대로(대기 중·보내는 중·생성 중·완료·오류·시간 초과·유실·취소됨·접수 실패). 응답 상태가 SUCCESS 가 아니면(일부 제공 등)
 *   답이 와도 「오류」 — 받지 못한 답으로 본다(개발서버 useBriefing isSuccess, 2026-11-06).
 * 유엔이가 센 값·설명 문구·핵심 결과 한 줄·공통 한계 줄 없음(R25).
 * 칸을 누르면 그 항목으로 간다. 현황판이 위로 지나가면 40px 한 줄이 붙는다. 답이 오면 aria-live 로 한 번 알린다.
 * 항목 카드 머리(개발 서버 BriefingItemCard 이식) — 진행 중이면 [취소](그 항목 하나만), 오류·취소됨이면 [다시 시도](그 항목 하나만),
 *   답이 오면 [크게 보기] — 그 항목 하나만 펼쳐 읽는 자리(개발 서버 BriefingAnswer).
 *   답은 처음에 첫 문단 한 줄만(개발 서버 BriefingItemCard — 「초기 브리핑 결과에는 상세를 과도하게 표출하지 않음」), 더 있으면 [더보기]·[n건 더보기](답변 대상 수)로
 *   카드 전체(AnswerCard)를 펴고 [접기]로 다시 한 줄. 펼치면 미리보기 줄을 거둔다(첫 줄이 두 번 보이지 않게).
 *   모든 항목이 실패하면 머리에 [다시 시도](실패한 것 모두 — 개발 서버 BriefingPanel).
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
  /** 답(완료 작업)이 왔는가 — 「새로 도착」 대상 */
  answered: boolean;
}

const RUN_TEXT: Partial<Record<JobState, string>> = { QUEUED: "대기 중", SUBMITTED: "보내는 중", RUNNING: "생성 중" };
const END_TEXT: Partial<Record<JobState, string>> = { FAILED: "오류", TIMEOUT: "시간 초과", LOST: "유실", CANCELLED: "취소됨" };
/** 끝난 답의 처리 시간·「재사용」 — 끔(사용자 지시 2026-11-02 — 시연) */
const SHOW_DONE_META = false;

/** 한 항목의 칸 — 턴(접수 전·접수 실패)·작업 요약·원응답에서 받은 값만 */
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
  // 재사용 답을 받은 시각 — 답 카드의 재사용 주의 줄(D5)과 같은 값·같은 표기(모르면 「재사용」만)
  const at = job.cached_from ? receivedAt(job, full) : null;
  const ago = at ? fmtAgo(now - Date.parse(at)) : null;
  // 끝난 답의 처리 시간·「재사용」 표시는 보이지 않는다(사용자 지시 2026-11-02 — 시연). 진행 중 시계는 그대로
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

// 대화를 바꿨다 돌아와도 도착·새로 도착을 놓치지 않게 — 턴별 마지막 단계와 아직 안 본 도착
type Phase = "run" | "wait" | "end";
const phaseOf = (k: Kind): Phase => (k === "run" ? "run" : k === "wait" ? "wait" : "end");
const phaseMem = new Map<string, Phase>();
const freshMem = new Set<string>();

/**
 * 그 항목을 지금 보고 있는가 — 창이 보이고, 붙은 한 줄 아래(48px)부터 대화 상자 아래 35% 위까지에
 * 120px 이상(짧은 항목은 절반 이상) 들어와 있을 때. 가장자리만 닿은 것은 보지 않은 것으로 본다
 */
function inView(el: HTMLElement | undefined, root: HTMLElement | null | undefined) {
  if (!el || !root || document.visibilityState === "hidden") return false;
  const r = el.getBoundingClientRect();
  const v = root.getBoundingClientRect();
  const overlap = Math.min(r.bottom, v.bottom - v.height * 0.35) - Math.max(r.top, v.top + 48);
  return overlap >= Math.min(120, r.height / 2);
}

const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="bb-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
function StIcon({ kind }: { kind: Kind }) {
  if (kind === "run" || kind === "wait") return <span className="bb-spin" aria-hidden="true" />;
  if (kind === "done") return <Svg><path d="m3 8.5 3.2 3.2L13 5" /></Svg>;
  if (kind === "off") return <Svg><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></Svg>;
  return <Svg><path d="M8 2.2 14.3 13H1.7z" /><path d="M8 6.4v3.1M8 11.3v.1" /></Svg>;
}

function Marks({ c }: { c: BriefCell }) {
  if (!c.gaps && !c.warns && !c.reuse) return null;
  return (
    <>
      {c.gaps && <span className="bb-mark">정보 부족 있음</span>}
      {c.gaps && (c.warns || c.reuse) && " "}
      {c.warns && <span className="bb-mark">경고 있음</span>}
      {c.warns && c.reuse && " "}
      {c.reuse && <span className="bb-mark">{c.reuse}</span>}
    </>
  );
}

interface BoardProps {
  turns: Turn[];
  regionName: string;
  /** 항목 본문 — large = 「크게 보기」로 그 항목 하나만 펼쳐 볼 때 */
  renderBody: (t: Turn, large?: boolean) => ReactNode;
  /** 그 항목만 다시 보내기(접수 실패·오류·시간 초과·유실·취소됨). 없으면 머리의 [다시 시도]를 두지 않는다 */
  onRetry?: (t: Turn) => void;
}

/** 머리에서 다시 보낼 수 있는 상태 — 오류 계열·취소됨 */
const retryable = (k: Kind) => k === "err" || k === "off";

export default function BriefBoard({ turns, regionName, renderBody, onRetry }: BoardProps) {
  const s = useSession();
  // 「크게 보기」로 연 항목(턴 ID) — 그 항목이 묶음에서 빠지면 저절로 풀린다
  const [bigId, setBigId] = useState<string | null>(null);
  // [더보기]로 편 항목(턴 ID) — 처음에는 모두 접혀 첫 문단 한 줄만
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const big = bigId ? turns.find((t) => t.id === bigId) ?? null : null;
  const [now, setNow] = useState(() => Date.now());
  const [stuck, setStuck] = useState(false);
  const [ovf, setOvf] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set(turns.filter((t) => freshMem.has(t.id)).map((t) => t.id)));
  const [live, setLive] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const miniIn = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
  const checkSeen = useRef<() => void>(() => {});

  const cells = useMemo(
    () => turns.map((t, i) => briefCell(t, i, t.jobId ? s.jobs[t.jobId] : undefined, t.jobId ? s.full[t.jobId] : undefined, now)),
    [turns, s.jobs, s.full, now],
  );
  const running = cells.some((c) => c.kind === "run");
  const summary = briefSummary(cells);

  // 시계 — 진행 중이면 1초, 아니면 30초(재사용 「n시간 전」)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), running ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [running]);

  // 도착 — 진행 중이던 항목이 끝나면 한 번 알리고, 그 항목이 화면 밖이면 「새로 도착」
  useEffect(() => {
    const arrived: BriefCell[] = [];
    for (const c of cells) {
      const ph = phaseOf(c.kind);
      if (phaseMem.get(c.id) === "run" && ph === "end") arrived.push(c);
      phaseMem.set(c.id, ph);
    }
    if (!arrived.length) return;
    setLive(arrived.map((c) => `${c.no}번${c.label ? ` ${c.label}` : ""} ${c.text}`).join(", "));
    const root = boardRef.current?.closest<HTMLElement>(".thread");
    const add = arrived.filter((c) => c.answered && !inView(items.current.get(c.id), root)).map((c) => c.id);
    if (!add.length) return;
    for (const id of add) freshMem.add(id);
    setFresh((p) => new Set([...p, ...add]));
  }, [cells]);

  // 본 항목 — 「새로 도착」을 뗀다. 대화를 굴리거나·창 크기가 바뀌거나·이 창으로 돌아오거나·내용이 바뀔 때 잰다
  useEffect(() => {
    const root = boardRef.current?.closest<HTMLElement>(".thread");
    if (!root) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const hit = [...items.current.keys()].filter((id) => freshMem.has(id) && inView(items.current.get(id), root));
      if (!hit.length) return;
      for (const id of hit) freshMem.delete(id);
      setFresh((p) => {
        const n = new Set(p);
        for (const id of hit) n.delete(id);
        return n;
      });
    };
    const later = () => {
      if (!raf) raf = window.requestAnimationFrame(check);
    };
    checkSeen.current = later;
    root.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    document.addEventListener("visibilitychange", later);
    return () => {
      window.cancelAnimationFrame(raf);
      root.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
      document.removeEventListener("visibilitychange", later);
    };
  }, []);
  useEffect(() => {
    checkSeen.current();
  }, [cells]);

  // 현황판이 위로 지나가면(아래 끝이 붙는 줄 높이 위로) 접힌 한 줄을 보인다
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        const top = e.rootBounds?.top ?? 0;
        setStuck(!e.isIntersecting && e.boundingClientRect.bottom <= top + 1);
      },
      { root: board.closest<HTMLElement>(".thread"), rootMargin: "-40px 0px 0px 0px" },
    );
    io.observe(board);
    return () => io.disconnect();
  }, []);

  // 접힌 한 줄이 넘치면 오른쪽 끝을 흐리게(옆으로 밀어 볼 수 있음)
  const checkOvf = useRef<() => void>(() => {});
  useEffect(() => {
    const el = miniIn.current;
    if (!el) return;
    const check = () => setOvf(el.scrollWidth - el.scrollLeft - el.clientWidth > 1);
    checkOvf.current = check;
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  useEffect(() => {
    checkOvf.current();
  }, [cells, stuck]);

  const go = (id: string) => {
    const el = items.current.get(id);
    if (!el) return;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>(".brief-item-h")?.focus({ preventScroll: true });
  };

  const cellOf = (id: string) => cells.find((c) => c.id === id);
  // 모든 항목이 실패(진행 중 없음·답 없음) — 실패한 것 모두 다시 보내기(개발 서버 BriefingPanel 의 allFailed)
  const allFailed = !!onRetry && cells.length > 0 && cells.every((c) => retryable(c.kind));
  const retryAll = () => {
    if (!onRetry) return;
    for (const t of turns) if (retryable(cellOf(t.id)?.kind ?? "wait")) onRetry(t);
  };
  const cancel = (jobId: string) => s.cancel(jobId).catch(() => s.toast("취소하지 못했습니다."));
  const open = (id: string | null) => {
    const back = bigId;
    setBigId(id);
    // 열면 그 항목 머리로, 닫으면 보던 항목으로 — 화면이 엉뚱한 자리에 남지 않게
    window.requestAnimationFrame(() => {
      const el = items.current.get(id ?? back ?? "");
      el?.scrollIntoView({ block: "start" });
      el?.querySelector<HTMLElement>(".brief-item-h")?.focus({ preventScroll: true });
    });
  };

  /** 받은 답 글(완료 항목) — 미리보기 줄·더보기에 쓴다. 원응답을 아직 못 받았으면 null */
  const answerOf = (t: Turn): string | null => {
    const raw = t.jobId ? s.full[t.jobId]?.raw : undefined;
    if (!raw) return null;
    return typeof raw.result?.answer === "string" ? raw.result.answer.trim() : "";
  };
  const refCount = (t: Turn) => (t.jobId ? (s.full[t.jobId]?.raw?.result?.refs?.length ?? 0) : 0);
  const toggle = (id: string) =>
    setOpened((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 항목 머리 오른쪽 단추 — 상태마다 하나(개발 서버 BriefingItemCard) + 답이 길면 [더보기]·[접기] */
  const tools = (t: Turn) => {
    const c = cellOf(t.id);
    if (!c) return null;
    const job = t.jobId ? s.jobs[t.jobId] : undefined;
    const label = `${c.no}번${c.label ? ` ${c.label}` : ""}`;
    const text = c.answered ? answerOf(t) : null;
    const more = !!text && big?.id !== t.id && headlineOf(text).rest.length > 0;
    const isOpen = opened.has(t.id);
    return (
      <span className="brief-item-tools">
        {c.kind === "run" && job && isActive(job.state) && (
          <button type="button" className="btn xs" onClick={() => cancel(job.id)} aria-label={`${label} 취소`}>취소</button>
        )}
        {retryable(c.kind) && onRetry && (
          <button type="button" className="btn xs pri" onClick={() => onRetry(t)} aria-label={`${label} 다시 시도`}>다시 시도</button>
        )}
        {c.answered && big?.id !== t.id && (
          <button type="button" className="btn xs line" onClick={() => open(t.id)} aria-label={`${label} 크게 보기`}>크게 보기</button>
        )}
        {more && (
          <button type="button" className="btn xs brief-more" aria-expanded={isOpen} onClick={() => toggle(t.id)}>
            {isOpen ? "접기" : refCount(t) > 0 ? `${refCount(t)}건 더보기` : "더보기"}
            <IcChevD size={12} className={isOpen ? "up" : undefined} />
          </button>
        )}
      </span>
    );
  };

  /** 접힌 완료 항목의 첫 문단 한 줄 — 크게 보기·[더보기]로 편 항목·원응답을 아직 못 받은 항목은 null(본문을 그린다) */
  const preview = (t: Turn) => {
    if (big?.id === t.id || opened.has(t.id) || !cellOf(t.id)?.answered) return null;
    const text = answerOf(t);
    if (text === null) return null;
    return <p className="brief-item-summary">{headlineOf(text).headline || "답변이 비어 있습니다."}</p>;
  };

  return (
    <div className={`brief-card${big ? " is-big" : ""}`}>
      <div className="brief-card-h">
        <div className="brief-card-row">
          <h2>현재 상황 브리핑</h2>
          {allFailed && !big && <button type="button" className="btn sm pri" onClick={retryAll}>다시 시도</button>}
        </div>
        <div className="xs muted">
          기준지역 <b>{groupOf(turns[0])?.region ?? regionName}</b>
          {turns.some((t) => t.jobId && sentWithScenario(s.full[t.jobId]?.request)) && ` · ${SCN_SENT_LABEL}`}
        </div>
        {/* 개발서버 BriefingPanel — 「재난안전 AI · {시각} 기준」 + 센 것만 적은 머리말 */}
        <div className="brief-ai xs">
          <b>재난안전 AI</b>
          {briefStamp(turns[0]?.at) && <span className="muted"> {briefStamp(turns[0]?.at)} 기준</span>}
        </div>
        {summary !== null ? (
          <p className="brief-summary s" aria-live="polite">{summary}</p>
        ) : (
          <p className="brief-summary err s" role="alert">브리핑 결과를 불러오지 못했습니다.</p>
        )}
      </div>
      {/* 「크게 보기」 — 그 항목 하나만. 묶음으로 돌아가는 길을 머리에 둔다(개발 서버 BriefingAnswer 의 「← 브리핑」) */}
      {big && (
        <div className="brief-big-bar">
          <button type="button" className="btn sm" onClick={() => open(null)}>
            <span aria-hidden="true">←</span> 브리핑 전체 보기
          </button>
          <span className="xs muted">{cellOf(big.id)?.no}번{cellOf(big.id)?.label ? ` ${cellOf(big.id)?.label}` : ""} 크게 보기</span>
        </div>
      )}
      <div className="bb" ref={boardRef} hidden={!!big}>
        <ul className="bb-cells" role="list" aria-label="브리핑 현황">
          {cells.map((c) => (
            <li key={c.id}>
              {/* 칸 사이 " " 는 읽기 도구·복사용 띄어쓰기(세로 flex 라 화면 배치는 그대로) */}
              <button type="button" className={`bb-cell${fresh.has(c.id) ? " new" : ""}`} onClick={() => go(c.id)}>
                <span className="bb-head">
                  <span className="bb-no">{c.no}<span className="sr-only">번 </span></span>
                  {c.label && <span className="bb-lab">{c.label}</span>}
                </span>{" "}
                {fresh.has(c.id) && <><span className="bb-new">새로 도착</span>{" "}</>}
                <span className={`bb-st ${c.kind}`}>
                  <StIcon kind={c.kind} />
                  {c.text}
                  {c.time && <span className="bb-t"> · {c.time}</span>}
                </span>
                {(c.gaps || c.warns || c.reuse) && <>{" "}<span className="bb-marks"><Marks c={c} /></span></>}
              </button>
            </li>
          ))}
        </ul>
        <div className="sr-only" aria-live="polite" aria-atomic="true">{live}</div>
      </div>
      {/* 접힌 한 줄 — 현황판과 같은 내용의 마우스용 바로가기(읽기 도구는 위 현황판을 읽는다) */}
      <div className={`bb-mini${stuck && !big ? " on" : ""}${ovf ? " ovf" : ""}`} aria-hidden="true">
        <b className="bb-mini-lab">브리핑</b>
        <div className="bb-mini-in" ref={miniIn}>
          {cells.map((c) => (
            <button key={c.id} type="button" tabIndex={-1} className={`bb-pill${fresh.has(c.id) ? " new" : ""}`} onClick={() => go(c.id)}>
              <span className="bb-no">{c.no}</span>
              <span className={`bb-st ${c.kind}`}>
                <StIcon kind={c.kind} />
                {c.text}
                {c.kind === "run" && c.time && <span className="bb-t"> {c.time}</span>}
              </span>
              {fresh.has(c.id) && <span className="bb-new-t">새로 도착</span>}
              <Marks c={c} />
            </button>
          ))}
        </div>
      </div>
      {turns.map((t) => (
        <div
          key={t.id}
          hidden={!!big && big.id !== t.id}
          className={`brief-item${big?.id === t.id ? " big" : ""}`}
          id={t.jobId ? `job-${t.jobId}` : undefined}
          data-brief-item={t.id}
          ref={(el) => {
            if (el) items.current.set(t.id, el);
            else items.current.delete(t.id);
          }}
        >
          <div className="brief-item-h" tabIndex={-1}>
            <span className="num">{t.group?.no}</span> <b>{t.q}</b>
            {tools(t)}
          </div>
          {preview(t) ?? renderBody(t, big?.id === t.id)}
        </div>
      ))}
    </div>
  );
}
