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
