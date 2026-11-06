// @vitest-environment jsdom
// 브리핑 현황판 칸(briefCell) — 재사용 표시가 답 카드의 재사용 주의 줄(D5)과 같은 받은 시각(receivedAt)·같은 표기(fmtAgo)인지.
// 받은 시각을 모르면 「재사용」만(답의 meta.base_time 으로 메우지 않음). npx vitest run harness/explore
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Turn } from "@/lib/session";
import type { JobFull, JobSummary } from "@/lib/jobTypes";

const h = vi.hoisted(() => ({ sess: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => h.sess }));

import BriefBoard, { briefCell } from "@/components/explore/BriefBoard";

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
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBeNull(); // 재사용 표시 끔(사용자 지시 2026-11-02 — 시연)
  });
  it("요약에 없고 상세에만 원래 받은 시각이 있어도 같은 값", () => {
    const j = job({ source_finished_at: undefined });
    const f = { ...full(j), source_finished_at: "2026-10-28T01:00:40+09:00" };
    expect(briefCell(turn, 0, j, f, NOW).reuse).toBeNull();
  });
  it("원래 받은 시각을 모르면 「재사용」만 — 답의 기준 시각(base_time)으로 메우지 않는다", () => {
    const j = job({ source_finished_at: null });
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBeNull();
  });
  it("재사용이 아니면 재사용 표시 없음", () => {
    const j = job({ cached_from: null, source_finished_at: null });
    expect(briefCell(turn, 0, j, full(j), NOW).reuse).toBeNull();
  });
});

// 항목 카드 머리(개발 서버 BriefingItemCard 이식) — 진행 중 [취소] · 오류·취소됨 [다시 시도] · 답 [크게 보기](그 항목 하나만 펼침)
describe("브리핑 항목 카드 — 취소 · 다시 시도 · 크게 보기", () => {
  afterEach(cleanup);
  const mk = (id: string, no: number, label: string): Turn =>
    ({ id, q: `${label} 질문`, source: "BRIEFING", at: "2026-10-28T03:00:00+09:00", jobId: `job-${id}`, group: { id: "g", no, total: 3, title: "현재 상황 브리핑", label } }) as Turn;
  const turns = [mk("a", 1, "기상"), mk("b", 2, "피해"), mk("c", 3, "대피")];
  const setup = (states: JobSummary["state"][]) => {
    const jobs: Record<string, JobSummary> = {};
    const fulls: Record<string, JobFull> = {};
    turns.forEach((t, i) => {
      const j = job({ id: t.jobId, state: states[i], cached_from: null, created_at: "2026-10-28T03:00:00+09:00" });
      jobs[j.id] = j;
      if (states[i] === "DONE") fulls[j.id] = full(j);
    });
    const cancel = vi.fn(async () => {});
    const toast = vi.fn();
    h.sess = { jobs, full: fulls, cancel, toast };
    const onRetry = vi.fn();
    const body = vi.fn((t: Turn, large?: boolean) => <div data-testid={`body-${t.id}`}>{large ? "크게" : "작게"}</div>);
    render(<BriefBoard turns={turns} regionName="부산광역시" renderBody={body} onRetry={onRetry} />);
    const item = (id: string) => document.querySelector<HTMLElement>(`[data-brief-item="${id}"]`)!;
    return { cancel, onRetry, body, item };
  };

  it("상태마다 머리 단추 하나 — 생성 중 = 취소, 오류 = 다시 시도, 완료 = 크게 보기", () => {
    const { item } = setup(["RUNNING", "FAILED", "DONE"]);
    expect(within(item("a")).getByRole("button", { name: "1번 기상 취소" })).toBeTruthy();
    expect(within(item("a")).queryByRole("button", { name: /다시 시도|크게 보기/ })).toBeNull();
    expect(within(item("b")).getByRole("button", { name: "2번 피해 다시 시도" })).toBeTruthy();
    expect(within(item("b")).queryByRole("button", { name: /취소|크게 보기/ })).toBeNull();
    expect(within(item("c")).getByRole("button", { name: "3번 대피 크게 보기" })).toBeTruthy();
    // 일부만 실패하면 머리의 「모두 다시 시도」는 없다
    expect(document.querySelector(".brief-card-row .btn")).toBeNull();
  });

  it("취소·다시 시도는 그 항목 하나만", () => {
    const { cancel, onRetry } = setup(["RUNNING", "CANCELLED", "RUNNING"]);
    fireEvent.click(screen.getByRole("button", { name: "1번 기상 취소" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("job-a");
    fireEvent.click(screen.getByRole("button", { name: "2번 피해 다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].id).toBe("b");
  });

  it("크게 보기 — 그 항목만 크게(본문 large), 현황판·다른 항목은 숨김, 「브리핑 전체 보기」로 돌아온다", () => {
    const { item, body } = setup(["DONE", "DONE", "DONE"]);
    expect(screen.getByTestId("body-b").textContent).toBe("작게");
    fireEvent.click(screen.getByRole("button", { name: "2번 피해 크게 보기" }));
    expect(screen.getByTestId("body-b").textContent).toBe("크게");
    expect(body).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c" }), false);
    expect(item("a").hidden).toBe(true);
    expect(item("c").hidden).toBe(true);
    expect(item("b").hidden).toBe(false);
    expect(document.querySelector<HTMLElement>(".bb")!.hidden).toBe(true);
    expect(within(item("b")).queryByRole("button", { name: /크게 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /브리핑 전체 보기/ }));
    expect(screen.getByTestId("body-b").textContent).toBe("작게");
    expect(item("a").hidden).toBe(false);
    expect(document.querySelector<HTMLElement>(".bb")!.hidden).toBe(false);
  });

  it("모두 실패하면 머리에 「다시 시도」 — 실패한 항목 모두 다시 보낸다", () => {
    const { onRetry } = setup(["FAILED", "TIMEOUT", "CANCELLED"]);
    fireEvent.click(within(document.querySelector<HTMLElement>(".brief-card-row")!).getByRole("button", { name: "다시 시도" }));
    expect(onRetry.mock.calls.map((c) => c[0].id)).toEqual(["a", "b", "c"]);
  });

  it("현황판 칸의 상태 표시는 그대로", () => {
    setup(["DONE", "RUNNING", "FAILED"]);
    const cells = screen.getByRole("list", { name: "브리핑 현황" });
    expect(within(cells).getByText("완료")).toBeTruthy();
    expect(within(cells).getByText("생성 중")).toBeTruthy();
    expect(within(cells).getByText("오류")).toBeTruthy();
  });
});
