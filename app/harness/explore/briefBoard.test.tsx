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

  it("크게 보기 — 그 항목만 크게(본문 large), 현황판·다른 항목은 숨김, 「브리핑 전체 보기」로 돌아온다(다시 첫 문단 한 줄)", () => {
    const { item, body } = setup(["DONE", "DONE", "DONE"]);
    // 처음에는 본문 없이 첫 문단 한 줄(답 글이 비면 「답변이 비어 있습니다.」)
    expect(screen.queryByTestId("body-b")).toBeNull();
    expect(item("b").querySelector(".brief-item-summary")!.textContent).toBe("답변이 비어 있습니다.");
    fireEvent.click(screen.getByRole("button", { name: "2번 피해 크게 보기" }));
    expect(screen.getByTestId("body-b").textContent).toBe("크게");
    expect(item("b").querySelector(".brief-item-summary")).toBeNull();
    expect(body).toHaveBeenCalledTimes(1);
    expect(item("a").hidden).toBe(true);
    expect(item("c").hidden).toBe(true);
    expect(item("b").hidden).toBe(false);
    expect(document.querySelector<HTMLElement>(".bb")!.hidden).toBe(true);
    expect(within(item("b")).queryByRole("button", { name: /크게 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /브리핑 전체 보기/ }));
    expect(screen.queryByTestId("body-b")).toBeNull();
    expect(item("b").querySelector(".brief-item-summary")).not.toBeNull();
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

// 일부 제공(PARTIAL_SUCCESS) 등 SUCCESS 가 아닌 응답 — 개발 서버 useBriefing(isSuccess)처럼 받지 못한 답(오류 · 다시 시도, 크게 보기 없음)
describe("브리핑 — SUCCESS 가 아닌 응답은 받지 못한 답", () => {
  it.each(["PARTIAL_SUCCESS", "NO_RESULT", "DATA_NOT_AVAILABLE"])("%s → 「오류」, 답이 온 것으로 치지 않는다", (st) => {
    const j = job({ cached_from: null, t3q_status: st });
    const c = briefCell(turn, 0, j, { ...full(j), raw: { status: st, result: { answer: "일부 글" } } }, NOW);
    expect([c.kind, c.text, c.answered]).toEqual(["err", "오류", false]);
  });
  it("상태가 없거나 SUCCESS 면 완료", () => {
    const j = job({ cached_from: null, t3q_status: null });
    expect(briefCell(turn, 0, j, { ...full(j), raw: { result: { answer: "글" } } }, NOW).kind).toBe("done");
  });
});

// 첫 문단 미리보기 · 더보기/접기(개발 서버 BriefingItemCard)
describe("브리핑 항목 카드 — 첫 문단 한 줄 · 더보기 · 접기", () => {
  afterEach(cleanup);
  const ANS = "### 결론\n\n부산 **도심 저지대**는 [초량제1지하차도](#ref:r1)부터 점검합니다.<br>추가\n\n- 둘째 줄";
  const setup = (answer: string, refs: unknown[] = []) => {
    const t = { ...turn, id: "a", jobId: "job-a", group: { id: "g", no: 1, total: 1, title: "현재 상황 브리핑", label: "기상" } } as Turn;
    const j = job({ id: "job-a", cached_from: null });
    h.sess = { jobs: { [j.id]: j }, full: { [j.id]: { ...full(j), raw: { status: "SUCCESS", result: { answer, refs } } } }, cancel: vi.fn(), toast: vi.fn() };
    const body = vi.fn((x: Turn, large?: boolean) => <div data-testid={`body-${x.id}`}>{large ? "크게" : "작게"}</div>);
    render(<BriefBoard turns={[t]} regionName="부산광역시" renderBody={body} onRetry={vi.fn()} />);
    return document.querySelector<HTMLElement>('[data-brief-item="a"]')!;
  };

  it("처음에는 제목을 건너뛴 첫 문단 한 줄만 — 마크다운 표식 없이 글자만, 본문은 그리지 않는다", () => {
    const item = setup(ANS);
    expect(item.querySelector(".brief-item-summary")!.textContent).toBe("부산 도심 저지대는 초량제1지하차도부터 점검합니다. 추가");
    expect(screen.queryByTestId("body-a")).toBeNull();
  });

  it("[더보기] → 본문 전체(미리보기 줄은 거둔다) · [접기] → 다시 한 줄", () => {
    const item = setup(ANS);
    fireEvent.click(within(item).getByRole("button", { name: "더보기" }));
    expect(screen.getByTestId("body-a").textContent).toBe("작게");
    expect(item.querySelector(".brief-item-summary")).toBeNull();
    const fold = within(item).getByRole("button", { name: "접기" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fold);
    expect(screen.queryByTestId("body-a")).toBeNull();
    expect(item.querySelector(".brief-item-summary")).not.toBeNull();
  });

  it("답변 대상이 있으면 「n건 더보기」", () => {
    const item = setup(ANS, [{ ref: "r1" }, { ref: "r2" }]);
    expect(within(item).getByRole("button", { name: "2건 더보기" })).toBeTruthy();
  });

  it("더 보여 줄 것이 없으면(한 문단뿐) [더보기] 없음", () => {
    const item = setup("한 줄 답입니다.");
    expect(item.querySelector(".brief-item-summary")!.textContent).toBe("한 줄 답입니다.");
    expect(within(item).queryByRole("button", { name: /더보기/ })).toBeNull();
  });
});
