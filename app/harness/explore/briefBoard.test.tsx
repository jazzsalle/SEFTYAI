// @vitest-environment jsdom
// 브리핑 현황판 칸(briefCell) — 재사용 표시가 답 카드의 재사용 주의 줄(D5)과 같은 받은 시각(receivedAt)·같은 표기(fmtAgo)인지.
// 받은 시각을 모르면 「재사용」만(답의 meta.base_time 으로 메우지 않음). npx vitest run harness/explore
import { describe, expect, it, vi } from "vitest";
import type { Turn } from "@/lib/session";
import type { JobFull, JobSummary } from "@/lib/jobTypes";

vi.mock("@/lib/session", () => ({ useSession: () => ({}) }));

import { briefCell } from "@/components/explore/BriefBoard";

const job = (over: Partial<JobSummary> = {}): JobSummary => ({
  id: "job-2", account_id: "a", conv_id: "c", turn_no: 1, source: "BRIEFING", library_id: null, question_user: "질문", question_sent: "질문",
  state: "DONE", t3q_status: "SUCCESS", http_status: 200, cached_from: "job-0", retry_of: null, error_code: null,
  created_at: "2026-10-28T03:00:30+09:00", submitted_at: null, finished_at: "2026-10-28T03:00:30+09:00", elapsed_ms: 0, t3q_conversation_id: null,
  source_finished_at: "2026-10-28T03:00:00+09:00",
  ...over,
});
const full = (j: JobSummary): JobFull => ({ ...j, request: {}, raw: { status: "SUCCESS", meta: { base_time: "2026-10-28T02:48:13+09:00", elapsed_ms: 106_000 } }, preview: null, geo: null });
const turn = { id: "t1", q: "질문", source: "BRIEFING", at: "2026-10-28T03:00:29+09:00", jobId: "job-2", group: { id: "g", no: 1, total: 4, title: "현재 상황 브리핑" } } as Turn;
const NOW = Date.parse("2026-10-28T03:00:40+09:00");

describe("브리핑 현황판 — 재사용 칸", () => {
  it("원래 답을 받은 시각 기준 — 1분 안이면 「n초 전」(답 카드와 같은 표기)", () => {
    const j = job();
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBe("재사용 · 40초 전");
  });
  it("요약에 없고 상세에만 원래 받은 시각이 있어도 같은 값", () => {
    const j = job({ source_finished_at: undefined });
    const f = { ...full(j), source_finished_at: "2026-10-28T01:00:40+09:00" };
    expect(briefCell(turn, 0, j, f, NOW).reuse).toBe("재사용 · 2시간 전");
  });
  it("원래 받은 시각을 모르면 「재사용」만 — 답의 기준 시각(base_time)으로 메우지 않는다", () => {
    const j = job({ source_finished_at: null });
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBe("재사용");
  });
  it("재사용이 아니면 재사용 표시 없음", () => {
    const j = job({ cached_from: null, source_finished_at: null });
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBeNull();
  });
});
