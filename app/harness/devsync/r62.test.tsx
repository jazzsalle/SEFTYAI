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
  openConvBus, recentDone, REGION_BREAK_EVENT, regionBreakText, regionChangeDialog, regionChangeStep, restoreCond,
} from "@/lib/dialogue";
import { CONTEXT_TTL_MS, isExpired } from "@/lib/convList";
import { submitBody, type Cond } from "@/lib/session";
import { sourceLabel } from "@/lib/jobTypes";
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

  it("대화의 진행 상황(개발서버 activity) — 개별 질문은 대기 없이 모두 답변 생성 중, 차례가 오지 않은 브리핑 항목(보내는 중·QUEUED)만 대기 · 끝난 것·접수 실패는 세지 않는다", () => {
    const st: Record<string, string> = { a: "RUNNING", b: "SUBMITTED", c: "QUEUED", d: "DONE", e: "CANCELLED", f: "RUNNING", g: "QUEUED" };
    const G = { id: "b1" };
    const act = activityOf(
      [
        { jobId: "a" }, { jobId: "b" }, { jobId: "c" }, { jobId: "d" }, { jobId: "e" }, { jobId: "", pending: true }, { jobId: "", error: "x" },
        { jobId: "f", group: G }, { jobId: "g", group: G }, { jobId: "", pending: true, group: G }, { jobId: "", error: "x", group: G },
      ],
      (id) => st[id],
    );
    // 개별: a·b·c(QUEUED)·보내는 중 = 답변 생성 중 4 · 브리핑: f = 답변 생성 중, g(QUEUED)·보내는 중 = 대기 2
    expect(act).toEqual({ running: 5, waiting: 2, jobIds: ["a", "b", "c", "f", "g"] });
  });

  it("기준지역 변경 판정(개발서버 requestRegionChange) — 같은 시·도(AI 모드 꺼짐) 그대로 · 잃을 것 없으면 묻지 않음 · 그 밖에 확인 창", () => {
    expect(regionChangeStep({ same: true, aimOn: false, hasTurns: true })).toBe("same");
    expect(regionChangeStep({ same: false, aimOn: false, hasTurns: false })).toBe("apply");
    expect(regionChangeStep({ same: false, aimOn: false, hasTurns: true })).toBe("ask");
    expect(regionChangeStep({ same: true, aimOn: true, hasTurns: false })).toBe("ask");
    expect(regionChangeStep({ same: false, aimOn: true, hasTurns: false })).toBe("ask");
  });

  it("기준지역 변경 확인 창 글(개발서버 Modal 글자 그대로) — 제목 · 본문(없으면 없음) · 단추", () => {
    const NEW = "기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.";
    const AIM = "기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.";
    expect(regionChangeDialog({ same: false, aimOn: false, running: 0, waiting: 0 })).toEqual({ title: NEW, desc: undefined, ok: "새 대화로 시작" });
    expect(regionChangeDialog({ same: false, aimOn: false, running: 1, waiting: 2 })).toEqual({ title: NEW, desc: "답변 생성 중인 질문 1개는 중단되고, 대기 중인 질문 2개는 보내지 않습니다.", ok: "새 대화로 시작" });
    expect(regionChangeDialog({ same: false, aimOn: true, running: 1, waiting: 0 })).toEqual({ title: AIM, desc: "새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다. 답변 생성 중인 질문 1개는 중단됩니다.", ok: "새 대화로 시작" });
    expect(regionChangeDialog({ same: true, aimOn: true, running: 3, waiting: 1 })).toEqual({ title: AIM, desc: undefined, ok: "기준지역 변경" });
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
    const body = submitBody(c, { question: "q", source: "QUICK", condPatch: BARE_COND });
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

describe("질문 모음 출처 QUICK(개발서버 askLibrary · askDay · DemoPinService — 전 LIBRARY)", () => {
  it("이름 — QUICK 에 질문 모음 문항 번호가 있으면 「지역 질문」, 없으면 「특보 질문」 · 예전 LIBRARY 행은 그대로 「지역 질문」", () => {
    expect(sourceLabel("QUICK", "BS-01")).toBe("지역 질문");
    expect(sourceLabel("QUICK", null)).toBe("특보 질문");
    expect(sourceLabel("LIBRARY", null)).toBe("지역 질문");
    expect(sourceLabel("USER", "BS-01")).toBe("직접 질문");
  });
  it("묶음 항목(시연·한눈 요약 질의)도 QUICK · 서버는 새 LIBRARY 접수를 받지 않는다(예전 행 다시 질의는 그 출처 그대로 → T3Q SUGGEST)", async () => {
    const { DAY_ITEMS, demoAsk } = await import("@/lib/library");
    expect(demoAsk(DAY_ITEMS[0]).source).toBe("QUICK");
    const fs = await import("node:fs");
    const route = fs.readFileSync("src/app/api/agent/jobs/route.ts", "utf8");
    expect(route).toMatch(/const SOURCES: JobSource\[\] = \["USER", "BRIEFING", "QUICK", "SUGGEST", "FOLLOW_UP", "AI_MODE"\];/);
    const jobs = fs.readFileSync("src/lib/server/jobs.ts", "utf8");
    expect(jobs).toMatch(/QUICK: "QUICK", SUGGEST: "SUGGEST", LIBRARY: "SUGGEST"/);
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
const srv = vi.hoisted(() => ({ jobs: [] as unknown[], cancels: [] as string[], posts: [] as { question: string; source: string; libraryId?: string | null }[] }));
const job = (id: string, source: JobSource, state: JobState, at = new Date().toISOString()): JobSummary => ({
  id, account_id: ACC.id, conv_id: null, turn_no: null, source, library_id: null, question_user: `질문 ${id}`, question_sent: "q", state, t3q_status: state === "DONE" ? "SUCCESS" : null, http_status: null,
  cached_from: null, retry_of: null, error_code: null, created_at: at, submitted_at: null, finished_at: state === "DONE" || state === "CANCELLED" ? at : null, elapsed_ms: 1000, t3q_conversation_id: null,
});
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  srv.jobs = [];
  srv.cancels = [];
  srv.posts = [];
  nav.pushed = [];
  nav.sp = new URLSearchParams();
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
    // 질문 접수 — 바로 답변 생성 중인 작업으로(스트리밍 없이)
    if (u === "/api/agent/jobs" && init?.method === "POST") {
      const b = JSON.parse(String((init as { body?: string }).body ?? "{}")) as { question: string; source: JobSource; libraryId?: string | null };
      const j = { ...job(`n${srv.jobs.length + 1}`, b.source, "RUNNING"), question_user: b.question, library_id: b.libraryId ?? null };
      srv.jobs.push(j);
      srv.posts.push(b);
      return reply({ job: j }, 201);
    }
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

const nav = vi.hoisted(() => ({ pushed: [] as string[], sp: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (p: string) => nav.pushed.push(p), replace: () => { nav.sp = new URLSearchParams(); } }),
  usePathname: () => "/explore",
  useSearchParams: () => nav.sp,
}));
// 통합 탐색 화면을 통째로 그릴 때 — 지도 패널·대응절차·자동 시연은 이 시험의 대상이 아니라 비운다
vi.mock("@/components/explore/RightPanel", () => ({ default: () => null }));
vi.mock("@/lib/sopState", () => ({ useSop: () => ({ openReq: null, enabled: false, clearOpen: () => {} }) }));
vi.mock("@/components/autodemo/useExploreAutoDemo", () => ({ useExploreAutoDemo: () => ({ phase: "idle" }) }));
vi.mock("@/components/autodemo/AutoDemoBar", () => ({ AutoDemoBar: () => null }));
vi.mock("@/components/autodemo/AimPrep", () => ({ default: () => null }));
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
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(S.cond.base?.sigungu?.name).toBe("동래구");
    expect(heard).toEqual([{ from: "부산광역시", to: "부산광역시 동래구" }]);
    expect(srv.cancels).toEqual([]); // 같은 시·도 안은 질문을 멈추지 않는다
  });

  it("시·도가 바뀌면 확인 창(개발서버 Modal) — 제목 새 대화 안내 · 본문 중지 안내 · [새 대화로 시작]이면 도는 질문을 멈추고 바꾼 뒤 새 대화로", async () => {
    srv.jobs = [job("u1", "USER", "RUNNING"), job("b1", "BRIEFING", "RUNNING"), job("b2", "BRIEFING", "QUEUED"), job("d1", "USER", "DONE")];
    await mount();
    const G = { id: "g1" };
    openConvBus.set({ convId: "c1", turns: [{ jobId: "u1" }, { jobId: "b1", group: G }, { jobId: "b2", group: G }, { jobId: "d1" }] });
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    await waitFor(() => expect([...combo("기준지역 시·도").options].some((o) => o.textContent === "서울특별시")).toBe(true));
    fireEvent.change(combo("기준지역 시·도"), { target: { value: "11" } });
    const dlg = screen.getByRole("dialog", { name: "기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다." });
    expect(dlg.querySelector(".acm-desc")?.textContent).toBe("답변 생성 중인 질문 2개는 중단되고, 대기 중인 질문 1개는 보내지 않습니다.");
    expect([...dlg.querySelectorAll(".acm-ft button")].map((b) => b.textContent)).toEqual(["취소", "새 대화로 시작"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "새 대화로 시작" }));
    });
    window.removeEventListener("sa:new-conv", newConv);
    expect(S.cond.base).toEqual(SEOUL);
    expect(newConv).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(srv.cancels.sort()).toEqual(["b1", "b2", "u1"]));
    expect(openConvBus.isLeft("c1")).toBe(true);
    expect(openConvBus.get().turns).toEqual([]);
  });

  it("잃을 것이 없으면(지금 대화에 질문 없음 · AI 모드 꺼짐) 시·도가 바뀌어도 묻지 않고 바꾼다(개발서버 requestRegionChange)", async () => {
    await mount();
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    await waitFor(() => expect([...combo("기준지역 시·도").options].some((o) => o.textContent === "서울특별시")).toBe(true));
    fireEvent.change(combo("기준지역 시·도"), { target: { value: "11" } });
    window.removeEventListener("sa:new-conv", newConv);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(S.cond.base).toEqual(SEOUL);
    expect(newConv).toHaveBeenCalledTimes(1);
    expect(nav.pushed).toEqual([]);
  });

  it("질문이 없어도 AI 모드가 켜져 있으면 묻는다 — 제목 AI 모드 종료 · 본문 새 대화 한 마디", async () => {
    await mount();
    act(() => S.setAimOn(true));
    await waitFor(() => expect([...combo("기준지역 시·도").options].some((o) => o.textContent === "서울특별시")).toBe(true));
    fireEvent.change(combo("기준지역 시·도"), { target: { value: "11" } });
    const dlg = screen.getByRole("dialog", { name: "기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오." });
    expect(dlg.querySelector(".acm-desc")?.textContent).toBe("새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(S.cond.base?.sido.code).toBe("26");
    expect(S.aimOn).toBe(true);
  });

  it("AI 모드를 켠 채 같은 시·도 안에서 바꾸면 AI 모드 종료 한 줄만 — [기준지역 변경], 대화는 유지(새 대화 없음)", async () => {
    await mount();
    act(() => S.setAimOn(true));
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    await waitFor(() => expect([...combo("기준지역 시·군·구").options].some((o) => o.textContent === "동래구")).toBe(true));
    fireEvent.change(combo("기준지역 시·군·구"), { target: { value: "26260" } });
    const dlg = screen.getByRole("dialog", { name: "기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오." });
    expect(dlg.querySelector(".acm-desc")).toBeNull(); // 본문 없음 — 같은 시·도 안은 대화를 옮기지 않는다
    expect(dlg.textContent).not.toContain("새 대화로 시작");
    fireEvent.click(screen.getByRole("button", { name: "기준지역 변경" }));
    window.removeEventListener("sa:new-conv", newConv);
    expect(S.cond.base?.sigungu?.name).toBe("동래구");
    expect(S.aimOn).toBe(false);
    expect(newConv).not.toHaveBeenCalled();
  });
});

describe("질문 현황(FUN-UFR-301010 — 개발서버 AskList · useAskList)", () => {
  type T = import("@/lib/queueList").AskTurn;
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  const G = { id: "g1" };

  it("지금 대화의 질문만 · 끝난 질문은 도는 질문을 합쳐 최근 20개까지(먼저 끝난 것이 위 · 오래된 것부터 뺀다) · 출처 이름 · 중단·실패", async () => {
    srv.jobs = [
      job("r1", "USER", "RUNNING"),
      job("b1", "BRIEFING", "RUNNING"),
      job("x1", "BRIEFING", "CANCELLED", at(1000)),
      job("y1", "USER", "CANCELLED", at(2000)),
      ...Array.from({ length: 24 }, (_, i) => job(`d${i}`, "USER", "DONE", at((i + 2) * 60_000))),
      job("other", "USER", "DONE"), // 다른 대화(계정의 다른 작업) — 오르지 않는다
    ];
    const turns: T[] = [
      { id: "tb1", jobId: "b1", q: "질문 b1", source: "BRIEFING", at: at(0), group: G },
      { id: "tx1", jobId: "x1", q: "질문 x1", source: "BRIEFING", at: at(0), group: G },
      { id: "tr1", jobId: "r1", q: "질문 r1", source: "USER", at: at(0) },
      { id: "ty1", jobId: "y1", q: "질문 y1", source: "FOLLOW_UP", at: at(0) },
      ...Array.from({ length: 24 }, (_, i): T => ({ id: `td${i}`, jobId: `d${i}`, q: `질문 d${i}`, source: "FOLLOW_UP", at: at(0) })),
    ];
    const pick = vi.fn();
    await mount(<QueuePanel open setOpen={() => {}} turns={turns} onPick={pick} />);
    const panel = screen.getByRole("navigation", { name: "질문 현황" });
    expect(panel.querySelector(".qp-h h2")?.firstChild?.textContent).toBe("질문 현황");
    expect(panel.textContent).not.toContain("질문 other");
    const running = [...panel.querySelectorAll(".qp-item.act")];
    expect(running.map((r) => r.querySelector(".qp-q")?.textContent)).toEqual(["질문 b1", "질문 r1"]);
    // 도는 브리핑 항목은 누를 수 없고(글), 대화 질문은 눌러 그 위치로 간다
    expect(running[0].tagName).toBe("DIV");
    expect(running[0].querySelector(".qp-m")?.textContent).toMatch(/^브리핑 · \d+초$/);
    expect(running[1].tagName).toBe("BUTTON");
    expect(running[1].querySelector(".qp-m")?.textContent).toMatch(/^직접 질문 · \d+초$/);
    fireEvent.click(running[1]);
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: "tr1", jobId: "r1", kind: "turn" }));
    const done = [...panel.querySelectorAll(".qp-item:not(.act)")];
    expect(done).toHaveLength(ASK_LIST_MAX - 2);
    const qs = done.map((d) => d.querySelector(".qp-q")?.textContent);
    expect(qs).not.toContain("질문 d23"); // 오래된 것부터 목록에서만 뺀다
    expect(qs[qs.length - 1]).toBe("질문 x1"); // 먼저 끝난 것이 위 — 막 그만둔 것이 맨 아래
    expect(done[done.length - 1].querySelector(".qp-m")?.textContent).toBe("브리핑 · 중단");
    // 대화 질문을 그만둔 것은 개발서버처럼 실패로 센다
    expect(done[done.length - 2].querySelector(".qp-m")?.textContent).toBe("이어서 묻기 · 실패");
    expect(done[0].querySelector(".qp-m")?.textContent).toBe("이어서 묻기 · 1초");
    expect([...panel.querySelectorAll(".qp-chip")].map((c) => c.textContent)).toEqual(["전체 20", "진행 중 2", "완료 16", "실패·중단 2"]);
  });

  it("출처 이름 — 브리핑 한 항목만 물은 질문은 「브리핑 항목」, 대화의 첫 질문은 「직접 질문」, 그다음은 「이어서 묻기」(개발서버 originOf)", async () => {
    srv.jobs = [job("a", "BRIEFING", "DONE"), job("b", "USER", "DONE"), job("c", "QUICK", "DONE")];
    const turns: T[] = [
      { id: "ta", jobId: "a", q: "질문 a", source: "BRIEFING", at: at(0) },
      { id: "tb", jobId: "b", q: "질문 b", source: "USER", at: at(0) },
      { id: "tc", jobId: "c", q: "질문 c", source: "QUICK", at: at(0) },
    ];
    await mount(<QueuePanel open setOpen={() => {}} turns={turns} onPick={() => {}} />);
    const rows = [...screen.getByRole("navigation", { name: "질문 현황" }).querySelectorAll(".qp-item .qp-m")].map((m) => m.textContent?.split(" · ")[0]);
    expect(rows).toEqual(["브리핑 항목", "이어서 묻기", "이어서 묻기"]);
  });
});

describe("통합 탐색 화면 흐름 — 질문 현황은 지금 대화만 · [새 대화] 중지 안내창(FUN-UFR-306004 · 개발서버 SearchSessionProvider)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {}; // jsdom 에 없다
  });
  const mountExplore = async () => {
    const { default: ExplorePage } = await import("@/app/(main)/explore/page");
    await mount(<ExplorePage />);
  };
  /** 질문 현황 — 접힌 채 시작하므로(개발서버 asksOpen false) 탭을 눌러 편다. 이 탭 메모리에 남으므로 이미 펼쳤으면 그대로 */
  const openAsks = async () => {
    const tab = await screen.findByRole("button", { name: /^질문 현황 펼치기/ }).catch(() => null);
    if (tab) fireEvent.click(tab);
    return screen.findByRole("navigation", { name: "질문 현황" });
  };

  it("질문이 없으면 질문 현황을 내지 않고, 물으면 그 대화의 질문만 — 진행 중 질문을 눌러도 창이 뜨지 않는다", async () => {
    srv.jobs = [job("old", "USER", "DONE")]; // 계정의 지난 작업 — 지금 대화가 아니다
    await mountExplore();
    expect(screen.queryByRole("navigation", { name: "질문 현황" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^질문 현황 펼치기/ })).toBeNull();
    nav.sp = new URLSearchParams("q=부산 침수 위험지구는?");
    cleanup();
    await mountExplore();
    // 접힌 채 시작 — 탭에 진행 1
    const tab = await screen.findByRole("button", { name: /^질문 현황 펼치기 — 진행 중 1건/ });
    expect(screen.queryByRole("navigation", { name: "질문 현황" })).toBeNull();
    fireEvent.click(tab);
    const panel = await screen.findByRole("navigation", { name: "질문 현황" });
    await waitFor(() => expect(panel.querySelectorAll(".qp-item.act")).toHaveLength(1));
    expect(panel.textContent).toContain("부산 침수 위험지구는?");
    expect(panel.textContent).not.toContain("질문 old");
    fireEvent.click(panel.querySelector(".qp-item.act")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[＋ 새 대화] — 답변 생성 중인 질문이 있으면 중지 안내창(개발서버 Modal 글자) · [새 대화 시작]이면 멈추고 빈 대화로", async () => {
    nav.sp = new URLSearchParams("q=부산 침수 위험지구는?");
    await mountExplore();
    await openAsks();
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "새 대화" }));
    const dlg = screen.getByRole("dialog", { name: "새 대화를 시작하시겠습니까?" });
    expect(dlg.querySelector(".acm-desc")?.textContent).toBe("답변 생성 중인 질문 1개는 중단됩니다.");
    expect([...dlg.querySelectorAll(".acm-ft button")].map((b) => b.textContent)).toEqual(["취소", "새 대화 시작"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "새 대화 시작" }));
    });
    await waitFor(() => expect(srv.cancels).toEqual(["n1"]));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "질문 현황" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^질문 현황 펼치기/ })).toBeNull();
  });

  it("질문 모음에서 보낸 질문은 출처 QUICK(개발서버 askLibrary — 전 LIBRARY) · 질문 말풍선은 질문 글만(출처 줄 없음 — 개발서버 answer-ask)", async () => {
    await mountExplore();
    fireEvent.click(await screen.findByRole("button", { name: "질문 모음 보기" }));
    const drawer = await screen.findByRole("dialog", { name: "질문 모음" });
    fireEvent.click(drawer.querySelector<HTMLButtonElement>(".qlib-q")!);
    await waitFor(() => expect(srv.posts.length).toBeGreaterThan(0));
    expect(srv.posts[0].source).toBe("QUICK");
    expect(srv.posts[0].libraryId).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".answer-ask-row .qbubble")).not.toBeNull());
    expect(document.querySelector(".qb-meta")).toBeNull();
    expect(document.querySelector(".answer-ask-row .qbubble")!.textContent).toBe(srv.posts[0].question);
  });
});
