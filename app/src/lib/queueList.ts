/**
 * 질문 목록 상태 칩 규칙 — 개발서버 search/components/AskList(kjw 998facb) 이식(2026-11-07).
 * 칩 = 전체 · 진행 중 · 완료 · 실패·중단. 실패·중단 = 작업이 성공으로 끝나지 않았거나(실패·취소·유실·시간 초과),
 * 끝났어도 응답 상태가 SUCCESS 가 아닌 것(답 카드가 「답변을 불러오지 못했습니다」로 보이는 것 — lib/answerText isAnswerOk).
 */
import { isActive, type JobSummary } from "./jobTypes";
import { isAnswerOk } from "./answerText";

export type QueueFilter = "all" | "running" | "done" | "bad";
export const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "running", label: "진행 중" },
  { key: "done", label: "완료" },
  { key: "bad", label: "실패·중단" },
];
/** 칩별 빈 문구(개발서버 글자 그대로) */
export const QUEUE_EMPTY = {
  running: "진행 중인 질문이 없습니다.",
  done: "아직 끝난 질문이 없습니다.",
  bad: "실패하거나 중단한 질문이 없습니다.",
} as const;

type J = Pick<JobSummary, "state" | "t3q_status">;
/** 끝났지만 받지 못한 답(실패·중단) */
export const queueBad = (j: J) => !isActive(j.state) && (j.state !== "DONE" || !isAnswerOk(j.t3q_status));

export function queueCounts(active: readonly J[], done: readonly J[]): Record<QueueFilter, number> {
  const bad = done.filter(queueBad).length;
  return { all: active.length + done.length, running: active.length, done: done.length - bad, bad };
}

/** 끝난 목록을 칩으로 거른다(전체·진행 중이면 그대로) */
export function queueFilter<T extends J>(done: readonly T[], f: QueueFilter): T[] {
  if (f === "done") return done.filter((j) => !queueBad(j));
  if (f === "bad") return done.filter(queueBad);
  return [...done];
}

/* ── 질문 현황 = 지금 대화의 질문만(개발서버 useAskList — 계정 전체 작업 목록이 아님) ── */

/** 질문 현황이 읽는 턴의 모양(lib/session Turn 의 일부) */
export interface AskTurn {
  id: string;
  jobId: string;
  q: string;
  source: JobSummary["source"];
  at: string;
  pending?: boolean;
  error?: string;
  group?: { id: string } | null;
}

/** 질문 현황의 한 줄(개발서버 AskEntry) */
export interface AskEntry {
  /** 턴 id */
  id: string;
  /** 브리핑 세트의 항목이면 briefing-item(도는 동안 누를 수 없다), 대화 질문이면 turn */
  kind: "briefing-item" | "turn";
  question: string;
  /** 어디서 온 질문인지 — 「브리핑」 · 「브리핑 항목」 · 「직접 질문」 · 「이어서 묻기」(개발서버 originOf 글자 그대로) */
  origin: string;
  running: boolean;
  failed: boolean;
  /** 사람이 그만둔 브리핑 항목(대화 질문의 취소는 개발서버처럼 실패로 센다 — 그쪽은 「질의를 그만두었습니다」를 오류 글로 둔다) */
  cancelled: boolean;
  /** 걸린 시간(ms) — 도는 동안에도 센다 */
  elapsedMs: number;
  jobId: string | null;
  groupId: string | null;
  /** 끝난 때(먼저 끝난 것이 위 — 개발서버 seq 자리). 도는 줄은 0 */
  endedAt: number;
}

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * 지금 대화의 질문 현황(개발서버 useAskList build · originOf).
 * 브리핑 «세트» 자체는 올리지 않고 항목마다 한 줄. 끝난 줄은 먼저 끝난 것이 위다.
 */
export function askEntriesOf(turns: readonly AskTurn[], jobOf: (id: string) => Pick<JobSummary, "state" | "t3q_status" | "created_at" | "finished_at" | "elapsed_ms"> | undefined, now: number): { running: AskEntry[]; done: AskEntry[] } {
  const list: AskEntry[] = [];
  let talk = 0;
  for (const t of turns) {
    const brief = !!t.group;
    const kind = brief ? "briefing-item" : "turn";
    const origin = brief ? "브리핑" : t.source === "BRIEFING" ? "브리핑 항목" : talk === 0 ? "직접 질문" : "이어서 묻기";
    if (!brief) talk++;
    const base = { id: t.id, kind, question: t.q, origin, jobId: t.jobId || null, groupId: t.group?.id ?? null } as const;
    if (t.error) {
      list.push({ ...base, running: false, failed: true, cancelled: false, elapsedMs: 0, endedAt: ms(t.at) });
      continue;
    }
    const job = t.jobId ? jobOf(t.jobId) : undefined;
    if (t.pending || !t.jobId || !job || isActive(job.state)) {
      const from = job ? ms(job.created_at) : ms(t.at);
      list.push({ ...base, running: true, failed: false, cancelled: false, elapsedMs: Math.max(0, now - from), endedAt: 0 });
      continue;
    }
    const stopped = job.state === "CANCELLED";
    const bad = queueBad(job);
    list.push({
      ...base,
      running: false,
      failed: bad && !(stopped && brief),
      cancelled: stopped && brief,
      elapsedMs: job.elapsed_ms ?? Math.max(0, ms(job.finished_at) - ms(job.created_at)),
      endedAt: ms(job.finished_at ?? job.created_at),
    });
  }
  const order = new Map(list.map((e, i) => [e.id, i]));
  return {
    running: list.filter((e) => e.running),
    done: list.filter((e) => !e.running).sort((a, b) => a.endedAt - b.endedAt || order.get(a.id)! - order.get(b.id)!),
  };
}

/** 「1분 26초」. 분이 넘지 않으면 초만(개발서버 AskList formatElapsed) */
export function askElapsed(msv: number): string {
  const total = Math.max(0, Math.round(msv / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

/** 실패·중단 줄인지(개발서버 AskList isBad) */
export const askBad = (e: Pick<AskEntry, "failed" | "cancelled">) => e.failed || e.cancelled;
