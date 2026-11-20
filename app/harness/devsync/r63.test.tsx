// @vitest-environment jsdom
// R63 — 개발서버(kjw origin/dev) 따라잡기: 스트리밍 표시(b818af0) · 브리핑 카드 배경(abb23d6) · 유사사례 전체 이어받기(256e5ec·d387e02) · AI 모드 켬/끔 기록(d39f8d8·844333a).
// npx vitest run harness/devsync/r63
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import type { BaseRegion } from "@/lib/baseRegion";
import type { JobFull, JobSummary } from "@/lib/jobTypes";
import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";
import { collectSimilarPages, similarPageBody, SIMILAR_MAX_PAGES, SIMILAR_PAGE_SIZE } from "@/lib/similarPages";
import { AIM_LOG_MAX_REGION, safeAimRegion } from "@/lib/aiModeLog";

const SRC = join(__dirname, "..", "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ── ① 스트리밍 표시(개발서버 AnswerPanel·BriefingItemCard b818af0) ── */
const sess = vi.hoisted(() => ({ on: false, live: {} as Record<string, unknown>, toast: () => {}, cancel: () => Promise.resolve(), weather: null }));
vi.mock("@/lib/session", async (orig) => {
  const real = await orig<typeof import("@/lib/session")>();
  return { ...real, useSession: () => (sess.on ? sess : real.useSession()) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));

import AnswerCard from "@/components/answer/AnswerCard";
import { SessionProvider, useSession } from "@/lib/session";

const local = (h: number, m: number, s = 0) => new Date(2026, 10, 18, h, m, s).toISOString();
const running = (over: Partial<JobSummary> = {}): JobSummary => ({
  id: "j1", account_id: "a", conv_id: "c", turn_no: 1, source: "USER", library_id: null, question_user: "q", question_sent: "q",
  state: "RUNNING", t3q_status: null, http_status: null, cached_from: null, retry_of: null, error_code: null,
  created_at: local(9, 0), submitted_at: local(9, 0), finished_at: null, elapsed_ms: null, t3q_conversation_id: null, wx_seen: null,
  ...over,
} as JobSummary);
const x: ExploreApi = { openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), openEntity: vi.fn(), selectOnMap: vi.fn(), showSummary: vi.fn(), selectedKey: null, openEvidence: vi.fn(), activeEvidence: null, retry: vi.fn() };
const wrap = (ui: ReactNode) => render(<ExploreContext.Provider value={x}>{ui}</ExploreContext.Provider>);

describe("① 스트리밍 — 진행 단계와 자라는 글(개발서버 글자 그대로)", () => {
  beforeEach(() => {
    sess.on = true;
    sess.live = {};
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 9, 1, 5));
  });
  afterEach(() => {
    sess.on = false;
  });

  it("글이 오기 전: 「답변을 만들고 있습니다… 1분 5초 · {진행 단계}」 + [취소] — 개발서버 answer-running 한 줄(머리줄·카드 없음)", () => {
    sess.live = { j1: { text: "", stage: "데이터 조회", refs: [] } };
    const { container } = wrap(<AnswerCard job={running()} full={undefined} />);
    const card = container.querySelector(".answer-running")!;
    expect(card.querySelector("p")!.textContent).toBe("답변을 만들고 있습니다… 1분 5초 · 데이터 조회");
    expect(card.querySelector("p strong")!.textContent).toBe("1분 5초");
    expect(card.querySelector(".answer-stage")!.textContent).toBe(" · 데이터 조회");
    // 순서: 도는 고리 → 글 → [취소](줄 오른쪽 끝)
    expect([...card.children].map((c) => c.className || c.tagName)).toEqual(["answer-spinner", "P", "answer-cancel"]);
    expect(container.querySelector(".answer-streaming")).toBeNull();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    expect(container.querySelector(".acard")).toBeNull();
    expect(container.textContent).not.toContain("재난안전 AI");
    expect(card.textContent).not.toContain("째");
  });

  it("글이 흘러오면: 「답변을 작성하고 있습니다…」 · 진행 단계는 감춤 · 받은 글 그대로 aria-live 칸에(답변 대상 이름 연결 없음 — 개발서버)", () => {
    sess.live = { j1: { text: "### 결론\n\n부산 [[저지대]](ref:r1) **저지대**", stage: "데이터 조회", refs: [{ ref: "r1", display_name: "저지대", entity_type: "RISK_AREA" }] } };
    const { container } = wrap(<AnswerCard job={running()} full={undefined} />);
    const line = container.querySelector(".answer-running")!;
    expect(line.textContent).toContain("답변을 작성하고 있습니다… 1분 5초");
    expect(line.querySelector(".answer-stage")).toBeNull();
    // 흐르는 글 칸은 기다리는 줄 아래(형제) — 완성 답 카드와 같은 틀(article)
    const body = line.nextElementSibling!;
    expect(body.tagName).toBe("ARTICLE");
    expect(body.classList.contains("answer-streaming")).toBe(true);
    expect(body.getAttribute("aria-live")).toBe("polite");
    expect(body.textContent).toContain("부산");
    expect(body.querySelector("button")).toBeNull(); // 이름을 눌러 상세로 가는 연결이 없다
  });

  it("브리핑 항목: 「확인하고 있습니다…」 · [취소]는 그 줄 안(개발서버 briefing-cancel) · 흘러오는 글은 .briefing-item-streaming", () => {
    sess.live = { j1: { text: "", stage: "데이터 조회", refs: [] } };
    const { container, rerender } = wrap(<AnswerCard job={running({ source: "BRIEFING" })} full={undefined} brief noActions />);
    const line = container.querySelector("p.briefing-item-wait")!;
    expect(line.textContent).toBe("확인하고 있습니다… 1분 5초 · 데이터 조회취소");
    expect(line.querySelector("button.briefing-cancel")?.textContent).toBe("취소");
    expect(container.querySelector(".acard")).toBeNull();
    // 그만두는 것은 이 항목 하나
    const cancel = vi.spyOn(sess, "cancel");
    fireEvent.click(line.querySelector("button.briefing-cancel")!);
    expect(cancel).toHaveBeenCalledWith("j1");
    cancel.mockRestore();
    sess.live = { j1: { text: "강수 50mm", stage: "데이터 조회", refs: [] } };
    rerender(<ExploreContext.Provider value={x}><AnswerCard job={running({ source: "BRIEFING" })} full={{ ...running(), request: {}, raw: null, preview: null, geo: null } as JobFull} brief noActions /></ExploreContext.Provider>);
    expect(container.textContent).toContain("확인하고 있습니다… 1분 5초");
    expect(container.querySelector(".answer-stage")).toBeNull();
    expect(container.querySelector(".briefing-item-streaming")!.textContent).toContain("강수 50mm");
  });

  it("스타일: .answer-stage · .answer-streaming · .briefing-item-streaming(개발서버 index.css)", () => {
    const css = read("app/renewal.css");
    expect(css).toMatch(/\.answer-stage \{[^}]*font-weight: 400/);
    expect(css).toMatch(/\.answer-streaming \{ margin-top: 8px; \}/);
    expect(css).toMatch(/\.briefing-item-streaming \{ margin-top: 8px; opacity: \.92; \}/);
  });
});

/* ── ② 브리핑 카드 배경(abb23d6) — 우리 브리핑 카드는 구르는 칸 안 보통 흐름이라 줄어들지 않는다 ── */
describe("② 브리핑 카드가 길어져도 흰 배경이 함께 구른다", () => {
  it(".brief-card 에 높이를 줄이는 규칙(flex 1 · min-height 0 · 높이 상한)이 없다 · 구르는 칸(.thread)은 flex 줄이 아니다", () => {
    const rules = ["app/globals.css", "app/renewal.css", "components/explore/brief.css"].flatMap((f) => [...read(f).matchAll(/(^|\n)\s*([^{}\n]*\.brief-card(?![-\w])[^{}]*)\{([^}]*)\}/g)].map((m) => m[3]));
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      expect(body).not.toMatch(/(^|;|\s)flex:\s*1(\s|;|$)/);
      expect(body).not.toMatch(/min-height:\s*0/);
      expect(body).not.toMatch(/(^|;|\s)(max-)?height:/);
    }
    const thread = read("app/renewal.css").match(/\.ex-main \.thread \{([^}]*)\}/)![1];
    expect(thread).not.toMatch(/display:\s*flex/);
    expect(thread).toMatch(/overflow-y: auto/);
  });
});

/* ── ③ 유사사례 전체 이어받기(개발서버 similarApi collectSimilarPages) ── */
type Env = { status?: string; result?: { total_count?: number; items?: unknown[] } | null };
const pageOf = (total: number, page: number, size = SIMILAR_PAGE_SIZE): Env => {
  const from = (page - 1) * size;
  const n = Math.max(0, Math.min(size, total - from));
  return { status: "SUCCESS", result: { total_count: total, items: Array.from({ length: n }, (_, i) => ({ event_master_id: `E${from + i + 1}` })) } };
};

describe("③ 유사사례 — 100건씩 total_count 만큼", () => {
  it("한 쪽 100건 · 20쪽 한도 · 본문의 다른 칸은 그대로 page 만 바꾼다", () => {
    expect(SIMILAR_PAGE_SIZE).toBe(100);
    expect(SIMILAR_MAX_PAGES).toBe(20);
    expect(similarPageBody({ query_context: { a: 1 }, page: { page: 1, size: 20 } }, 3)).toEqual({ query_context: { a: 1 }, page: { page: 3, size: 100 } });
  });
  it("250건이면 세 쪽을 이어받아 한 목록 · total_count 는 받은 값 그대로", async () => {
    const asked: number[] = [];
    const env = await collectSimilarPages(async (p) => (asked.push(p), pageOf(250, p)));
    expect(asked).toEqual([1, 2, 3]);
    expect(env.result!.items).toHaveLength(250);
    expect(env.result!.total_count).toBe(250);
    expect(env.status).toBe("SUCCESS");
  });
  it("한 쪽에 다 오면 더 묻지 않는다 · total_count 가 숫자가 아니면 첫 쪽만", async () => {
    const asked: number[] = [];
    await collectSimilarPages(async (p) => (asked.push(p), pageOf(40, p)));
    expect(asked).toEqual([1]);
    const asked2: number[] = [];
    await collectSimilarPages(async (p) => (asked2.push(p), { result: { items: [{}] } }));
    expect(asked2).toEqual([1]);
  });
  it("결과 없는 응답(result 없음)은 그대로 — 0건으로 바꾸지 않는다", async () => {
    const none = { status: "NOT_AVAILABLE", result: null, warnings: [{ code: "X", message: "m" }] };
    expect(await collectSimilarPages(async () => none)).toBe(none);
  });
  it("이어받다 실패하면 받은 만큼 · 빈 쪽이 오면 멈춘다 · 20쪽에서 멈춘다", async () => {
    const failed = await collectSimilarPages(async (p) => {
      if (p === 3) throw new Error("x");
      return pageOf(500, p);
    });
    expect(failed.result!.items).toHaveLength(200);
    const empty = await collectSimilarPages(async (p) => (p === 2 ? { result: { total_count: 300, items: [] } } : pageOf(300, p)));
    expect(empty.result!.items).toHaveLength(100);
    const asked: number[] = [];
    const big = await collectSimilarPages(async (p) => (asked.push(p), pageOf(5000, p)));
    expect(asked.at(-1)).toBe(20);
    expect(big.result!.items).toHaveLength(2000);
  });
  it("화면 프록시가 이어받기를 쓴다 · 자동 조회(우리 카드)는 첫 쪽 20건만(접수 30초 한도) · 유사사례 한눈 요약은 100건 쪽으로 묻는다", () => {
    expect(read("app/api/t3q/data/route.ts")).toMatch(/b!\.api === "T3Q-04" \? await t3qSimilarAll\(/);
    const preview = read("lib/server/preview.ts");
    expect(preview).not.toMatch(/t3qSimilarAll/);
    expect(preview).toMatch(/SIMILAR_EVENT: \{[^\n]*query_context: qc, page: \{ page: 1, size: 20 \}/);
    expect(read("components/summary/SimilarSummary.tsx")).toContain("page: { page: 1, size: SIMILAR_PAGE_SIZE }");
  });
});

/* ── ④ AI 모드 켬/끔 기록(FUN-UFR-907002 — 개발서버 AiModeLogRules·useAiMode) ── */
describe("④ AI 모드 켬/끔 기록", () => {
  it("기준지역은 숫자 행정구역 코드만(10자리까지), 아니면 「-」(개발서버 AiModeLogRulesTests 그대로)", () => {
    expect(safeAimRegion("2600000000")).toBe("2600000000");
    expect(safeAimRegion("26")).toBe("26");
    for (const v of [null, undefined, "", "   ", "1".repeat(AIM_LOG_MAX_REGION + 1), "26\nAI 모드 켬 사용자 1", "abc", "26 00", "26;DROP", 26]) expect(safeAimRegion(v)).toBe("-");
  });
  it("서버: POST /api/ai-mode/switch — 운영 기록 표(audit)에 「AI 모드 켬/끔」과 걸러 낸 기준지역만, 204", () => {
    const src = read("app/api/ai-mode/switch/route.ts");
    expect(src).toContain('on ? "AI 모드 켬" : "AI 모드 끔", { region }');
    expect(src).toContain("const region = safeAimRegion(b?.region);");
    expect(src).toContain("status: 204");
  });

  const ACC = ACCOUNTS.find((a) => a.id === "busan")!;
  const SEOUL: BaseRegion = { sido: { code: "11", name: "서울특별시" } };
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  let S: ReturnType<typeof useSession>;
  function Probe() {
    S = useSession();
    return null;
  }

  it("켤 때·끌 때 한 번씩(같은 상태는 다시 알리지 않음) · 기준지역을 바꿔 꺼지는 것도 바뀌기 전 지역으로 「끔」", async () => {
    const sw: unknown[] = [];
    const posted: { stream?: boolean; source?: string }[] = [];
    vi.stubGlobal("fetch", async (path: string, init?: { method?: string; body?: string }) => {
      const u = String(path);
      if (u === "/api/auth/me") return reply({ account: ACC });
      if (u === "/api/ai-mode/switch") return sw.push(JSON.parse(init!.body!)), reply(null, 204);
      if (u.startsWith("/api/agent/jobs?")) return reply({ jobs: [], medianMs: null });
      if (u === "/api/agent/jobs" && init?.method === "POST") {
        posted.push(JSON.parse(init.body!));
        return reply({ job: { ...running({ id: `p${posted.length}` }), state: "DONE" } });
      }
      if (u === "/api/weather") return reply({ mode: "live", status: { ok: true, fetchedAt: "", message: "" }, advisories: [], preliminary: [], accountId: ACC.id });
      if (u === "/api/t3q/health") return reply({ ok: true });
      if (u === "/api/conversations") return reply([]);
      if (u === "/api/checks") return reply({});
      if (u.startsWith("/api/ai-mode")) return reply({ supported: true, managed: false, running: true, view: null });
      return reply({}, 404);
    });
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(S?.account?.id).toBe(ACC.id));

    act(() => S.setAimOn(true));
    act(() => S.setAimOn(true));
    await waitFor(() => expect(sw).toEqual([{ on: true, region: "26" }]));
    act(() => S.setAimOn(false));
    act(() => S.setAimOn(false));
    await waitFor(() => expect(sw).toHaveLength(2));
    expect(sw[1]).toEqual({ on: false, region: "26" });

    act(() => S.setAimOn(true));
    act(() => {
      S.setBase(SEOUL);
    });
    await waitFor(() => expect(sw).toHaveLength(4));
    expect(sw.slice(2)).toEqual([{ on: true, region: "26" }, { on: false, region: "26" }]);
    act(() => S.setAimOn(false)); // 이미 「끔」으로 알렸다
    act(() => S.setAimOn(true));
    await waitFor(() => expect(sw).toHaveLength(5));
    expect(sw[4]).toEqual({ on: true, region: "11" });

    // 스트리밍은 대화 질의만 — AI 모드 점검·시연 고정 질문은 기존 ASYNC(개발서버 b818af0)
    await act(async () => {
      await S.submit({ question: "q", source: "USER" });
      await S.submit({ question: "q", source: "QUICK", pinId: "SH-1-3" });
      await S.submit({ question: "q", source: "AI_MODE" });
    });
    expect(posted.map((p) => p.stream)).toEqual([true, false, false]);
  });
});
