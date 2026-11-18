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

// 항목 카드(개발서버 BriefingItemCard) — 진행 중 = renderBody(줄 안 [취소]) · 실패 = 노란 줄 + [다시 시도] · 그만둠 = 「그만두었습니다.」 + [다시 시도] · 답 = [크게 보기]
describe("브리핑 항목 카드 — 다시 시도 · 크게 보기", () => {
  afterEach(cleanup);
  const mk = (id: string, no: number, label: string): Turn =>
    ({ id, q: `${label} 질문`, source: "BRIEFING", at: "2026-10-28T03:00:00+09:00", jobId: `job-${id}`, group: { id: "g", no, total: 3, title: "현재 상황 브리핑", label } }) as Turn;
  const turns = [mk("a", 1, "기상"), mk("b", 2, "피해"), mk("c", 3, "대피")];
  const setup = (states: JobSummary["state"][], onNew?: () => void) => {
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
    render(<BriefBoard turns={turns} regionName="부산광역시" renderBody={body} onRetry={onRetry} onNew={onNew} />);
    const item = (id: string) => document.querySelector<HTMLElement>(`[data-brief-item="${id}"]`)!;
    return { cancel, onRetry, body, item };
  };

  it("항목 머리는 번호 · 항목 이름(질문 글이 아님) — 생성 중 = 단추 없음(점선), 오류 = 노란 줄 + 다시 시도, 완료 = 크게 보기", () => {
    const { item, body } = setup(["RUNNING", "FAILED", "DONE"]);
    expect(item("a").querySelector(".briefing-item-label")!.textContent).toBe("기상");
    expect(item("a").className).toContain("is-running");
    expect(within(item("a").querySelector<HTMLElement>(".briefing-item-head")!).queryByRole("button")).toBeNull();
    expect(body.mock.calls.map((c) => c[0].id)).toEqual(["a"]);
    expect(item("b").querySelector(".briefing-item-error")!.textContent).toBe("결과를 불러오지 못했습니다.");
    expect(within(item("b")).getByRole("button", { name: "2번 피해 다시 시도" })).toBeTruthy();
    expect(within(item("b")).queryByRole("button", { name: /크게 보기/ })).toBeNull();
    expect(within(item("c")).getByRole("button", { name: "3번 대피 크게 보기" })).toBeTruthy();
    // 일부만 실패하면 「모두 실패」 상자는 없다
    expect(document.querySelector(".briefing-panel-error")).toBeNull();
  });

  it("다시 시도는 그 항목 하나만 — 그만둔 항목은 「그만두었습니다.」", () => {
    const { cancel, onRetry, item } = setup(["RUNNING", "CANCELLED", "RUNNING"]);
    expect(cancel).not.toHaveBeenCalled();
    expect(item("b").querySelector(".briefing-item-wait")!.textContent).toBe("그만두었습니다.");
    fireEvent.click(screen.getByRole("button", { name: "2번 피해 다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].id).toBe("b");
  });

  it("크게 보기 — 대화창 같은 틀([← 브리핑 이름] · 항목 이름 · 「브리핑」 딱지 · [새 대화] · 질문 말풍선), [←]로 돌아온다", () => {
    const onNew = vi.fn();
    const { item } = setup(["DONE", "DONE", "DONE"], onNew);
    expect(item("b").querySelector(".briefing-item-summary")!.textContent).toBe("답변이 비어 있습니다.");
    fireEvent.click(screen.getByRole("button", { name: "2번 피해 크게 보기" }));
    const big = document.querySelector<HTMLElement>(".brief-big")!;
    expect(big.querySelector(".answer-title")!.textContent).toBe("피해");
    expect(big.querySelector(".answer-origin")!.textContent).toBe("브리핑");
    expect(big.querySelector(".answer-ask")!.textContent).toBe("피해 질문");
    expect(document.querySelector(".briefing-panel")).toBeNull();
    fireEvent.click(within(big).getByRole("button", { name: /새 대화/ }));
    expect(onNew).toHaveBeenCalledTimes(1);
    fireEvent.click(within(big).getByRole("button", { name: /현재 상황 브리핑/ }));
    expect(document.querySelector(".brief-big")).toBeNull();
    expect(item("a")).not.toBeNull();
  });

  it("모두 실패하면 빨간 상자 + [다시 시도](실패한 것 모두), 항목 목록은 숨긴다", () => {
    const { onRetry } = setup(["FAILED", "TIMEOUT", "FAILED"]);
    expect(document.querySelector(".briefing-panel-error")!.textContent).toBe("브리핑 결과를 불러오지 못했습니다.");
    expect(document.querySelector(".briefing-items")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry.mock.calls.map((c) => c[0].id)).toEqual(["a", "b", "c"]);
  });

  it("머리 — 제목 · 기준지역 · 기준시각 · 재난유형(없으면 전체) · 재난안전 AI, 현황판·표지는 없다", () => {
    setup(["DONE", "RUNNING", "FAILED"]);
    expect(document.querySelector(".briefing-panel-title")!.textContent).toBe("현재 상황 브리핑");
    const meta = document.querySelector(".briefing-panel-meta")!.textContent!;
    expect(meta).toContain("기준지역 부산광역시");
    expect(meta).toMatch(/기준시각 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2}/);
    expect(meta).toContain("재난유형 전체");
    expect(document.querySelector(".briefing-ai-name")!.textContent).toBe("재난안전 AI");
    expect(screen.queryByRole("list", { name: "브리핑 현황" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/새로 도착|정보 부족 있음|경고 있음/);
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
    expect(item.querySelector(".briefing-item-summary")!.textContent).toBe("부산 도심 저지대는 초량제1지하차도부터 점검합니다. 추가");
    expect(screen.queryByTestId("body-a")).toBeNull();
  });

  it("[더보기] → 답 글만(briefing-item-detail — 답 카드 전체가 아님, 미리보기 줄은 거둔다) · [접기] → 다시 한 줄", () => {
    const item = setup(ANS);
    fireEvent.click(within(item).getByRole("button", { name: "더보기" }));
    expect(screen.queryByTestId("body-a")).toBeNull();
    expect(item.querySelector(".briefing-item-detail")!.textContent).toContain("둘째 줄");
    expect(item.querySelector(".briefing-item-summary")).toBeNull();
    const fold = within(item).getByRole("button", { name: "접기" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fold);
    expect(item.querySelector(".briefing-item-detail")).toBeNull();
    expect(item.querySelector(".briefing-item-summary")).not.toBeNull();
  });

  it("답변 대상이 있으면 「n건 더보기」", () => {
    const item = setup(ANS, [{ ref: "r1" }, { ref: "r2" }]);
    expect(within(item).getByRole("button", { name: "2건 더보기" })).toBeTruthy();
  });

  it("더 보여 줄 것이 없으면(한 문단뿐) [더보기] 없음", () => {
    const item = setup("한 줄 답입니다.");
    expect(item.querySelector(".briefing-item-summary")!.textContent).toBe("한 줄 답입니다.");
    expect(within(item).queryByRole("button", { name: /더보기/ })).toBeNull();
  });
});
