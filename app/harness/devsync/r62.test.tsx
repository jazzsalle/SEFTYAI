// @vitest-environment jsdom
// R62 — 대화 흐름을 개발서버(kjw 256e5ec·352a97c·1390a0f)대로:
//  · 대화 문맥·만료 7일 · 기준지역 답변 중 변경 허용(같은 시·도 안 = 대화 유지 + 구분선, 시·도 변경 = 중지 안내 뒤 새 대화)
//  · 대화 전환 중지 안내창 문구 · 새 대화 기본 제목(첫 질문 앞 30자) · 예전 대화 조건 되살리기 · 질문 현황(이름·최근 20개)
//  · 추천 후속질문(이어서 물어보기 1~3개) · 질문 모음은 재난상황 조건 없이 질문 문장 그대로
// npx vitest run harness/devsync/r62
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import type { JobSource, JobState, JobSummary } from "@/lib/jobTypes";
import type { BaseRegion } from "@/lib/baseRegion";
import {
  activityOf, ASK_LIST_MAX, BARE_COND, baseFromSaved, DEFAULT_TITLE_LENGTH, defaultTitleOf, isSameProvince, LEAVE_OK, LEAVE_TITLE, leaveMessage,
  openConvBus, recentDone, REGION_BREAK_EVENT, regionBreakText, restoreCond,
} from "@/lib/dialogue";
import { CONTEXT_TTL_MS, isExpired } from "@/lib/convList";
import { submitBody, type Cond } from "@/lib/session";
import FollowUps, { followUpsOf } from "@/components/answer/FollowUps";

afterEach(() => cleanup());

const BUSAN: BaseRegion = { sido: { code: "26", name: "부산광역시" } };
const DONGNAE: BaseRegion = { sido: { code: "26", name: "부산광역시" }, sigungu: { code: "26260", name: "동래구" } };
const SEOUL: BaseRegion = { sido: { code: "11", name: "서울특별시" } };

describe("규칙 함수(lib/dialogue — 개발서버 search/lib/dialogue.ts 글자 그대로)", () => {
  it("중지 안내창 본문 — 상황별 셋, 둘 다 0이면 빈 글 · 제목·단추", () => {
    expect(leaveMessage(2, 3)).toBe("답변 생성 중인 질문 2개는 중단되고, 대기 중인 질문 3개는 보내지 않습니다.");
    expect(leaveMessage(1, 0)).toBe("답변 생성 중인 질문 1개는 중단됩니다.");
    expect(leaveMessage(0, 4)).toBe("대기 중인 질문 4개는 보내지 않습니다.");
    expect(leaveMessage(0, 0)).toBe("");
    expect(LEAVE_TITLE).toEqual({ new: "새 대화를 시작하시겠습니까?", open: "다른 대화를 여시겠습니까?" });
    expect(LEAVE_OK).toEqual({ new: "새 대화 시작", open: "대화 열기" });
  });

  it("새 대화 기본 제목 = 첫 질문 앞 30자(넘으면 …) · 빈칸은 하나로", () => {
    expect(DEFAULT_TITLE_LENGTH).toBe(30);
    expect(defaultTitleOf("  부산   침수   위험  ")).toBe("부산 침수 위험");
    const long = "가".repeat(31);
    expect(defaultTitleOf(long)).toBe(`${"가".repeat(30)}…`);
    expect(defaultTitleOf("가".repeat(30))).toBe("가".repeat(30));
    expect(defaultTitleOf(undefined)).toBe("");
  });

  it("같은 시·도 안인지 — 전국이 끼면 늘 다른 시·도", () => {
    expect(isSameProvince(BUSAN, DONGNAE)).toBe(true);
    expect(isSameProvince(DONGNAE, BUSAN)).toBe(true);
    expect(isSameProvince(BUSAN, SEOUL)).toBe(false);
    expect(isSameProvince(null, BUSAN)).toBe(false);
    expect(isSameProvince(null, null)).toBe(false);
  });

  it("구분선 글 「기준지역이 변경되었습니다 · 이전 → 새 지역 · HH:MM」", () => {
    expect(regionBreakText("부산광역시", "부산광역시 동래구", new Date(2026, 10, 18, 9, 5))).toBe("기준지역이 변경되었습니다 · 부산광역시 → 부산광역시 동래구 · 09:05");
  });

  it("질문 현황 최근 20개 — 도는 질문만큼 끝난 질문 자리를 줄인다", () => {
    expect(ASK_LIST_MAX).toBe(20);
    const done = Array.from({ length: 25 }, (_, i) => i);
    expect(recentDone(done, 0)).toEqual(done.slice(0, 20));
    expect(recentDone(done, 3)).toHaveLength(17);
    expect(recentDone(done, 3, 20, false)).toEqual(done.slice(8));
    expect(recentDone(done.slice(0, 5), 2)).toHaveLength(5);
  });

  it("대화의 진행 상황 — 답변 생성 중(SUBMITTED·RUNNING) · 대기(QUEUED·보내는 중) · 끝난 것·접수 실패는 세지 않는다", () => {
    const st: Record<string, string> = { a: "RUNNING", b: "SUBMITTED", c: "QUEUED", d: "DONE", e: "CANCELLED" };
    const act = activityOf(
      [{ jobId: "a" }, { jobId: "b" }, { jobId: "c" }, { jobId: "d" }, { jobId: "e" }, { jobId: "", pending: true }, { jobId: "", error: "x" }],
      (id) => st[id],
    );
    expect(act).toEqual({ running: 2, waiting: 2, jobIds: ["a", "b", "c"] });
  });

  it("예전 대화의 기준지역 되살리기 — 코드 2·5·8자리 + 시·도부터 이은 이름, 「」 = 전국, 코드 없음 = 바꾸지 않음", () => {
    expect(baseFromSaved("26", "부산광역시")).toEqual(BUSAN);
    expect(baseFromSaved("26260", "부산광역시 동래구")).toEqual(DONGNAE);
    expect(baseFromSaved("26260510", "부산광역시 동래구 온천1동")).toEqual({ ...DONGNAE, emd: { code: "26260510", name: "온천1동" } });
    expect(baseFromSaved("", "전국")).toBeNull();
    expect(baseFromSaved(undefined, "부산광역시")).toBeUndefined();
  });

  it("예전 대화의 재난유형·발생기간 — 마지막 답을 받을 때 보낸 query_context 에서, 없으면 비움", () => {
    expect(restoreCond({ disaster_types: ["호우"], period: { from: "2020-07-23", to: "2020-07-25" } })).toEqual({ disasterType: "호우", periodFrom: "2020-07-23", periodTo: "2020-07-25" });
    expect(restoreCond({ disaster_types: [], period: { from: "x", to: "2020-07-25" } })).toEqual({ disasterType: undefined, periodFrom: undefined, periodTo: undefined });
    expect(restoreCond(null)).toEqual({ disasterType: undefined, periodFrom: undefined, periodTo: undefined });
  });
});

describe("대화 문맥·만료 7일(개발서버 256e5ec ContextTtl — 전 24시간)", () => {
  it("7일 · 24시간 지난 대화는 아직 이어 묻는다", () => {
    expect(CONTEXT_TTL_MS).toBe(7 * 24 * 3600_000);
    const now = Date.now();
    const conv = (ago: number) => ({ id: "c", title: "t", region: "busan" as const, createdAt: "", updatedAt: "", turns: [{ id: "t", jobId: "j", q: "q", source: "USER" as const, at: new Date(now - ago).toISOString() }] });
    expect(isExpired(conv(25 * 3600_000), now)).toBe(false);
    expect(isExpired(conv(7 * 24 * 3600_000 + 1000), now)).toBe(true);
  });
});

describe("질문 모음 — 재난상황 조건 없이 질문 문장 그대로(BARE_COND · 개발서버 bareConditions)", () => {
  it("세션의 재난유형·발생기간·특보·키워드·기상수문 값을 싣지 않고 기준지역·기준시각만 남긴다. 세션 조건은 그대로", () => {
    const c: Cond = {
      base: BUSAN, region: "busan", disasterType: "호우", referenceTime: "2026-11-18T09:00", periodFrom: "2026-11-01", periodTo: "2026-11-18",
      warningKind: "호우", warningLevel: "경보", keywords: ["지하차도"], conditions: [{ item: "RAIN_1H", value: 30 }],
    };
    const body = submitBody(c, { question: "q", source: "LIBRARY", condPatch: BARE_COND });
    expect(body.condition).toEqual({
      base: { code: "26", name: "부산광역시", level: "SIDO" }, disasterTypes: [], referenceTime: "2026-11-18T09:00", period: null,
      warningKind: null, warningLevel: null, keywords: [], conditions: [],
    });
    expect("condPatch" in body).toBe(false);
    expect(c.disasterType).toBe("호우");
    // 직접 쓴 질문은 지금처럼 세션 조건을 싣는다
    expect(submitBody(c, { question: "q", source: "USER" }).condition.disasterTypes).toEqual(["호우"]);
  });
});

describe("이어서 물어보기 — 추천 후속질문 1~3개(개발서버 AnswerPanel followUpsOf)", () => {
  it("글이 있는 것만 받은 순서대로 앞의 3개 · 칸이 없거나 비면 아무것도 그리지 않는다", () => {
    const list = [{ question_id: "q1", text: " 첫째 " }, { text: "" }, { question_id: "q2", text: "둘째" }, { text: "셋째" }, { text: "넷째" }, "x", null];
    expect(followUpsOf(list)).toEqual([{ id: "q1", text: "첫째" }, { id: "q2", text: "둘째" }, { id: "fu-2", text: "셋째" }]);
    expect(followUpsOf(undefined)).toEqual([]);
    const { container, rerender } = render(<FollowUps list={[]} onAsk={() => {}} />);
    expect(container.innerHTML).toBe("");
    rerender(<FollowUps list={list} />);
    expect(container.innerHTML).toBe(""); // 물을 길이 없으면(브리핑 항목) 보이지 않는다
  });

  it("「이어서 물어보기」 제목 · 누르면 그 글 그대로 묻는다", () => {
    const ask = vi.fn();
    render(<FollowUps list={[{ text: "피해 이력도 알려줘" }]} onAsk={ask} />);
    expect(screen.getByRole("heading", { name: "이어서 물어보기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "피해 이력도 알려줘" }));
    expect(ask).toHaveBeenCalledWith("피해 이력도 알려줘");
  });
});

// ── 실제 SessionProvider + 머리줄 기준지역 고르기 + 질문 현황 — 서버 응답만 흉내 낸다 ──
const ACC = ACCOUNTS.find((a) => a.id === "busan")!;
const srv = vi.hoisted(() => ({ jobs: [] as unknown[], cancels: [] as string[] }));
const job = (id: string, source: JobSource, state: JobState, at = new Date().toISOString()): JobSummary => ({
  id, account_id: ACC.id, conv_id: null, turn_no: null, source, library_id: null, question_user: `질문 ${id}`, question_sent: "q", state, t3q_status: state === "DONE" ? "SUCCESS" : null, http_status: null,
  cached_from: null, retry_of: null, error_code: null, created_at: at, submitted_at: null, finished_at: state === "DONE" || state === "CANCELLED" ? at : null, elapsed_ms: 1000, t3q_conversation_id: null,
});
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  srv.jobs = [];
  srv.cancels = [];
  openConvBus.reset();
  vi.stubGlobal("fetch", async (path: string, init?: { method?: string }) => {
    const u = String(path);
    if (u === "/api/auth/me") return reply({ account: ACC });
    if (u === "/api/weather") return reply({ mode: "live", status: { ok: true, fetchedAt: new Date().toISOString(), message: "" }, advisories: [], preliminary: [], accountId: ACC.id });
    if (u === "/api/t3q/health") return reply({ ok: true });
    if (u === "/api/conversations") return reply([]);
    if (u === "/api/checks") return reply({});
    if (u.startsWith("/api/regions?level=sigungu")) return reply({ items: [{ code: "26260", name: "동래구" }] });
    if (u.startsWith("/api/regions")) return reply({ items: [{ code: "26", name: "부산광역시" }, { code: "11", name: "서울특별시" }] });
    if (u.startsWith("/api/agent/jobs?")) return reply({ jobs: srv.jobs, medianMs: null });
    if (u.startsWith("/api/ai-mode")) return reply(null, 204);
    const cx = u.match(/^\/api\/agent\/jobs\/([^/?]+)\/cancel$/);
    if (cx && init?.method === "POST") {
      srv.cancels.push(cx[1]);
      return reply({ job: { ...(srv.jobs as JobSummary[]).find((j) => j.id === cx[1]), state: "CANCELLED" } });
    }
    const one = u.match(/^\/api\/agent\/jobs\/([^/?]+)/);
    if (one) return reply({ job: (srv.jobs as JobSummary[]).find((j) => j.id === one[1]) });
    return reply({ error: u }, 404);
  });
});
afterEach(() => vi.unstubAllGlobals());

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (p: string) => nav.pushed.push(p), replace: () => {} }), usePathname: () => "/explore" }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefItems: () => [], useBriefingSet: () => ({ items: [], checked: [], loaded: true }) }));

import { SessionProvider, useSession } from "@/lib/session";
import BasePicker from "@/components/BasePicker";
import QueuePanel from "@/components/queue/QueuePanel";

let S: ReturnType<typeof useSession>;
function Probe() {
  S = useSession();
  return null;
}
const mount = async (extra?: React.ReactNode) => {
  render(
    <SessionProvider>
      <Probe />
      <BasePicker />
      {extra}
    </SessionProvider>,
  );
  await waitFor(() => expect(S?.account?.id).toBe(ACC.id));
  await waitFor(() => expect(Object.keys(S.jobs)).toHaveLength(srv.jobs.length));
};
const combo = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;

describe("기준지역 — 답변 중에도 바꾼다(FUN-UFR-101002 · 전 R60 ⑦ 잠금 대체)", () => {
  it("같은 시·도 안(부산광역시 → 동래구)은 답변 중이어도 묻지 않고 바꾸고, 대화에 구분선을 알린다", async () => {
    srv.jobs = [job("u1", "USER", "RUNNING")];
    await mount();
    openConvBus.set({ convId: "c1", turns: [{ jobId: "u1" }] });
    const heard: unknown[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent).detail);
    window.addEventListener(REGION_BREAK_EVENT, on);
    await waitFor(() => expect([...combo("기준지역 시·군·구").options].some((o) => o.textContent === "동래구")).toBe(true));
    expect(combo("기준지역 시·군·구").disabled).toBe(false);
    fireEvent.change(combo("기준지역 시·군·구"), { target: { value: "26260" } });
    window.removeEventListener(REGION_BREAK_EVENT, on);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(S.cond.base?.sigungu?.name).toBe("동래구");
    expect(heard).toEqual([{ from: "부산광역시", to: "부산광역시 동래구" }]);
    expect(srv.cancels).toEqual([]); // 같은 시·도 안은 질문을 멈추지 않는다
  });

  it("시·도가 바뀌면 확인 창에 중지 안내 한 줄 — [새 대화로 시작]이면 도는 질문을 멈추고 바꾼 뒤 새 대화로", async () => {
    srv.jobs = [job("u1", "USER", "RUNNING"), job("u2", "USER", "QUEUED"), job("d1", "USER", "DONE")];
    await mount();
    openConvBus.set({ convId: "c1", turns: [{ jobId: "u1" }, { jobId: "u2" }, { jobId: "d1" }] });
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    await waitFor(() => expect([...combo("기준지역 시·도").options].some((o) => o.textContent === "서울특별시")).toBe(true));
    fireEvent.change(combo("기준지역 시·도"), { target: { value: "11" } });
    const dlg = screen.getByRole("alertdialog", { name: "기준지역 변경" });
    expect(dlg.textContent).toContain("기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.");
    expect(dlg.textContent).toContain("답변 생성 중인 질문 1개는 중단되고, 대기 중인 질문 1개는 보내지 않습니다.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "새 대화로 시작" }));
    });
    window.removeEventListener("sa:new-conv", newConv);
    expect(S.cond.base).toEqual(SEOUL);
    expect(newConv).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(srv.cancels.sort()).toEqual(["u1", "u2"]));
    expect(openConvBus.isLeft("c1")).toBe(true);
  });

  it("AI 모드를 켠 채 같은 시·도 안에서 바꾸면 AI 모드 종료 한 줄만 — [기준지역 변경], 대화는 유지(새 대화 없음)", async () => {
    await mount();
    act(() => S.setAimOn(true));
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    await waitFor(() => expect([...combo("기준지역 시·군·구").options].some((o) => o.textContent === "동래구")).toBe(true));
    fireEvent.change(combo("기준지역 시·군·구"), { target: { value: "26260" } });
    const dlg = screen.getByRole("alertdialog", { name: "기준지역 변경" });
    expect(dlg.textContent).toContain("기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.");
    expect(dlg.textContent).not.toContain("새 대화로 시작");
    fireEvent.click(screen.getByRole("button", { name: "기준지역 변경" }));
    window.removeEventListener("sa:new-conv", newConv);
    expect(S.cond.base?.sigungu?.name).toBe("동래구");
    expect(S.aimOn).toBe(false);
    expect(newConv).not.toHaveBeenCalled();
  });
});

describe("질문 현황(FUN-UFR-301010 — 개발서버 AskList)", () => {
  it("이름 「질문 현황」 · 끝난 질문은 도는 질문을 합쳐 최근 20개까지 · 중단은 「중단」", async () => {
    const t0 = Date.now();
    srv.jobs = [
      job("r1", "USER", "RUNNING"),
      job("r2", "USER", "RUNNING"),
      job("x1", "USER", "CANCELLED", new Date(t0 - 1000).toISOString()),
      ...Array.from({ length: 24 }, (_, i) => job(`d${i}`, "USER", "DONE", new Date(t0 - (i + 2) * 60_000).toISOString())),
    ];
    await mount(<QueuePanel open setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    const panel = screen.getByRole("complementary", { name: "질문 현황" });
    expect(panel.querySelector(".qp-h b")?.textContent).toBe("질문 현황");
    expect(screen.getByRole("button", { name: "질문 현황 접기" })).toBeTruthy();
    expect(panel.querySelectorAll(".qp-item.act")).toHaveLength(2);
    const done = [...panel.querySelectorAll(".qp-item:not(.act)")];
    expect(done).toHaveLength(ASK_LIST_MAX - 2);
    expect(done[0].textContent).toContain("질문 x1");
    expect(done[0].textContent).toContain("중단");
    expect(done.map((d) => d.querySelector(".qp-q")?.textContent)).not.toContain("질문 d23"); // 오래된 것부터 목록에서만 뺀다
  });
});
