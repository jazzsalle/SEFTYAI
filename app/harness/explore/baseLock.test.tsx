// @vitest-environment jsdom
// 기준지역 잠금(R32)에서 AI 모드 점검 빼기(R44) — 대화 질의(그 밖의 출처)가 보내는 중·대기·제출·답변 생성 중일 때만 잠근다.
//  · 판정 함수(lib/jobTypes locksBase · sourceLocksBase)
//  · 실제 SessionProvider(lib/session — fetch 만 흉내): 진행 중 AI_MODE 작업만 있으면 asking false · setBase 허용 · 머리줄 고르기(BasePicker) 열림,
//    USER 작업이 있으면 막힘, AI_MODE 접수 중에는 보내는 중으로 세지 않음
//  · 기준지역을 바꾸면 AI 모드가 꺼진다(R47): 진행 중인 점검은 취소, 새 지역 점검은 나가지 않음, 접수를 기다리던 점검이 늦게 돌아와도 취소.
//    AI 모드 켜짐은 계정별로 저장. 머리줄 고르기는 바꿀 때마다 「기준지역 변경」 확인 창 — AI 모드를 켜 두었으면 두 줄(종료 안내 + 새 대화), 아니면 한 줄
//  · 참조 특보 떼기 안내(R45) — 끊긴 계정의 기상청 특보 참조 · 시나리오 끔·만료 · 화면 쪽 조회 실패면 그대로
// npx vitest run harness/explore/baseLock
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import { ACTIVE_STATES, locksBase, sourceLocksBase, type JobSource, type JobState, type JobSummary } from "@/lib/jobTypes";
import type { BaseRegion } from "@/lib/baseRegion";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";

afterEach(() => cleanup());

const SOURCES: JobSource[] = ["USER", "BRIEFING", "QUICK", "SUGGEST", "LIBRARY", "FOLLOW_UP", "AI_MODE"];
const STATES: JobState[] = ["QUEUED", "SUBMITTED", "RUNNING", "DONE", "FAILED", "CANCELLED", "LOST", "TIMEOUT"];

describe("판정 함수 — 진행 중이고 AI 모드 점검이 아닐 때만 잠근다", () => {
  it("모든 출처 × 상태", () => {
    for (const source of SOURCES)
      for (const state of STATES) expect(locksBase({ source, state }), `${source} ${state}`).toBe(source !== "AI_MODE" && ACTIVE_STATES.includes(state));
    expect(SOURCES.filter(sourceLocksBase)).toEqual(["USER", "BRIEFING", "QUICK", "SUGGEST", "LIBRARY", "FOLLOW_UP"]);
  });
});

// ── 실제 SessionProvider — 서버 응답만 흉내 낸다 ──
const ACC = ACCOUNTS.find((a) => a.id === "bs_safety01")!;
const srv = vi.hoisted(() => ({
  jobs: [] as unknown[],
  /** POST /api/agent/jobs — 시험이 정한다(기다리게 하려면 미룬 약속) */
  post: null as null | ((body: { source: string }) => Promise<unknown>),
  /** GET /api/weather 응답 — "fail" 이면 500 */
  wx: null as unknown,
  /** POST /api/agent/jobs/{id}/cancel 받은 작업 */
  cancels: [] as string[],
}));
const job = (id: string, source: JobSource, state: JobState): JobSummary => ({
  id, account_id: ACC.id, conv_id: null, turn_no: null, source, library_id: null, question_user: "q", question_sent: "q", state, t3q_status: null, http_status: null,
  cached_from: null, retry_of: null, error_code: null, created_at: new Date().toISOString(), submitted_at: null, finished_at: null, elapsed_ms: null, t3q_conversation_id: null,
});
const WX: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: new Date().toISOString(), message: "" }, advisories: [], preliminary: [], accountId: ACC.id };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  srv.jobs = [];
  srv.post = null;
  srv.wx = WX;
  srv.cancels = [];
  vi.stubGlobal("fetch", async (path: string, init?: { method?: string; body?: string }) => {
    const u = String(path);
    if (u === "/api/auth/me") return reply({ account: ACC });
    if (u === "/api/weather") return srv.wx === "fail" ? reply({ error: "x" }, 500) : reply(srv.wx);
    if (u === "/api/t3q/health") return reply({ ok: true });
    if (u === "/api/conversations") return reply([]);
    if (u === "/api/checks") return reply({});
    if (u.startsWith("/api/regions")) return reply({ items: [{ code: "26", name: "부산광역시" }, { code: "11", name: "서울특별시" }] });
    if (u.startsWith("/api/agent/jobs?")) return reply({ jobs: srv.jobs, medianMs: null });
    if (u === "/api/agent/jobs" && init?.method === "POST") return reply(await srv.post!(JSON.parse(init.body ?? "{}")));
    const cx = u.match(/^\/api\/agent\/jobs\/([^/?]+)\/cancel$/);
    if (cx && init?.method === "POST") {
      srv.cancels.push(cx[1]);
      return reply({ job: { ...((srv.jobs as JobSummary[]).find((j) => j.id === cx[1]) ?? job(cx[1], "AI_MODE", "RUNNING")), state: "CANCELLED" } });
    }
    const one = u.match(/^\/api\/agent\/jobs\/([^/?]+)/);
    if (one) return reply({ job: (srv.jobs as JobSummary[]).find((j) => j.id === one[1]) });
    return reply({ error: u }, 404);
  });
});
afterEach(() => vi.unstubAllGlobals());

const nav = vi.hoisted(() => ({ path: "/explore", pushed: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (p: string) => nav.pushed.push(p), replace: () => {} }), usePathname: () => nav.path }));
beforeEach(() => {
  nav.path = "/explore";
  nav.pushed = [];
  localStorage.clear();
});
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefItems: () => [] }));

import { SessionProvider, useSession } from "@/lib/session";
import BasePicker from "@/components/BasePicker";

let S: ReturnType<typeof useSession>;
function Probe() {
  S = useSession();
  return null;
}
const SEOUL: BaseRegion = { sido: { code: "11", name: "서울특별시" } };
const mount = async () => {
  render(
    <SessionProvider>
      <Probe />
      <BasePicker />
    </SessionProvider>,
  );
  await waitFor(() => expect(S?.account?.id).toBe(ACC.id));
  await waitFor(() => expect(Object.keys(S.jobs)).toHaveLength(srv.jobs.length));
};
const sido = () => screen.getByRole("combobox", { name: "기준지역 시·도" }) as HTMLSelectElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("SessionProvider — 기준지역 잠금(실제 session 코드)", () => {
  it("진행 중인 작업이 AI 모드 점검뿐이면 잠그지 않는다 — asking false · setBase 허용 · 고르기 열림", async () => {
    srv.jobs = [job("a1", "AI_MODE", "RUNNING"), job("a2", "AI_MODE", "QUEUED")];
    await mount();
    expect(S.asking).toBe(false);
    expect(sido().disabled).toBe(false);
    let ok = false;
    act(() => {
      ok = S.setBase(SEOUL);
    });
    expect(ok).toBe(true);
    expect(S.cond.base).toEqual(SEOUL);
  });

  it("대화 질의(USER)가 진행 중이면 잠근다 — asking true · setBase 막힘 · 고르기 막힘", async () => {
    srv.jobs = [job("a1", "AI_MODE", "RUNNING"), job("u1", "USER", "RUNNING")];
    await mount();
    expect(S.asking).toBe(true);
    expect(sido().disabled).toBe(true);
    let ok = true;
    act(() => {
      ok = S.setBase(SEOUL);
    });
    expect(ok).toBe(false);
    expect(S.cond.base).not.toEqual(SEOUL);
  });

  it("AI 모드 점검 접수 중에는 보내는 중으로 세지 않고, 대화 질의 접수 중에는 센다(끝나면 풀림)", async () => {
    await mount();
    expect(S.asking).toBe(false);
    // AI 모드 점검 접수 — 응답을 기다리는 동안에도 잠그지 않는다
    const aim = deferred<unknown>();
    srv.post = () => aim.promise;
    let p1!: Promise<JobSummary>;
    act(() => {
      p1 = S.submit({ question: "점검", source: "AI_MODE" });
    });
    await act(async () => {});
    expect(S.asking).toBe(false);
    expect(sido().disabled).toBe(false);
    let ok = false;
    act(() => {
      ok = S.setBase(SEOUL);
    });
    expect(ok).toBe(true);
    await act(async () => {
      aim.resolve({ job: job("a9", "AI_MODE", "DONE") });
      await p1;
    });
    expect(S.asking).toBe(false);
    // 대화 질의 접수 — 응답을 기다리는 동안 잠근다
    const ask = deferred<unknown>();
    srv.post = () => ask.promise;
    let p2!: Promise<JobSummary>;
    act(() => {
      p2 = S.submit({ question: "질문", source: "USER" });
    });
    await act(async () => {});
    expect(S.asking).toBe(true);
    expect(sido().disabled).toBe(true);
    act(() => {
      ok = S.setBase(null);
    });
    expect(ok).toBe(false);
    await act(async () => {
      ask.resolve({ job: job("u9", "USER", "DONE") });
      await p2;
    });
    // 보내는 중 수가 맞게 돌아온다(AI 모드 접수를 세지 않았으므로 음수로 가지 않음)
    expect(S.asking).toBe(false);
    expect(sido().disabled).toBe(false);
  });
});

// ── 기준지역을 바꾸면 AI 모드가 꺼진다(R47) — 진행 중 점검 취소 · 새 지역 점검 없음 · 늦게 돌아온 점검도 취소 · 계정별 켜짐 ──
type Sent = { source: string; aiMode?: { trigger: string }; condition?: { base?: { name?: string } | null } };
/** 머리줄(AppShell)처럼 AI 모드가 켜져 있을 때만 창을 그린다 */
const renderAim = async () => {
  const AiModeModal = (await import("@/components/explore/AiModeModal")).default;
  function AimHost() {
    return useSession().aimOn ? <AiModeModal /> : null;
  }
  render(
    <SessionProvider>
      <Probe />
      <BasePicker />
      <AimHost />
    </SessionProvider>,
  );
  await waitFor(() => expect(S?.account?.id).toBe(ACC.id));
  await waitFor(() => expect(S.weather).not.toBeNull());
};

describe("기준지역을 바꾸면 AI 모드가 꺼진다(R47)", () => {
  it("진행 중인 점검은 취소되고 새 지역 점검은 나가지 않는다 — 창이 닫히고 켜짐 저장도 꺼짐", async () => {
    const sent: Sent[] = [];
    srv.post = async (b) => {
      sent.push(b as never);
      const j = job(`a${sent.length}`, "AI_MODE", "RUNNING");
      srv.jobs = [...(srv.jobs as JobSummary[]), j];
      return { job: j };
    };
    await renderAim();
    act(() => S.setAimOn(true));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].aiMode?.trigger).toBe("START");
    expect(sent[0].condition?.base?.name).toBe("부산광역시");
    await waitFor(() => expect(document.querySelector(".modal.aim")!.textContent).toContain("점검 중"));
    expect(localStorage.getItem(`sa.aim.${ACC.id}`)).toBe("true");
    // 점검이 도는 동안에도 바꿀 수 있고(R44), 바꾸면 AI 모드가 꺼진다
    expect(S.asking).toBe(false);
    act(() => {
      expect(S.setBase(SEOUL)).toBe(true);
    });
    expect(S.aimOn).toBe(false);
    expect(localStorage.getItem(`sa.aim.${ACC.id}`)).toBe("false");
    await waitFor(() => expect(srv.cancels).toEqual(["a1"]));
    await waitFor(() => expect(document.querySelector(".modal.aim")).toBeNull());
    // 새 지역(서울특별시)으로 다시 점검하지 않는다
    await new Promise((r) => setTimeout(r, 1800));
    expect(sent).toHaveLength(1);
  });

  it("점검 접수를 기다리는 사이 바꾸면 — 늦게 돌아온 점검(진행 중)도 취소", async () => {
    const pend = deferred<unknown>();
    srv.post = () => pend.promise;
    await renderAim();
    act(() => S.setAimOn(true));
    await act(async () => {});
    act(() => {
      expect(S.setBase(SEOUL)).toBe(true);
    });
    expect(S.aimOn).toBe(false);
    await act(async () => {
      pend.resolve({ job: job("late", "AI_MODE", "RUNNING") });
      await pend.promise;
    });
    await waitFor(() => expect(srv.cancels).toEqual(["late"]));
  });

  it("AI 모드 켜짐은 계정별로 저장 — 같은 브라우저의 다른 계정 값은 이어지지 않는다", async () => {
    localStorage.setItem("sa.aim.ij_safety01", "true");
    localStorage.setItem("sa.aim", "true"); // 예전 판(브라우저 하나에 저장)의 값도 읽지 않는다
    await mount();
    expect(S.aimOn).toBe(false);
    cleanup();
    localStorage.setItem(`sa.aim.${ACC.id}`, "true");
    await mount();
    expect(S.aimOn).toBe(true);
  });
});

describe("머리줄 기준지역 고르기 — 바꿀 때마다 「기준지역 변경」 확인 창(R47)", () => {
  const dialog = () => screen.getByRole("alertdialog", { name: "기준지역 변경" });
  const pickSeoul = async () => {
    await waitFor(() => expect([...sido().options].some((o) => o.textContent === "서울특별시")).toBe(true));
    fireEvent.change(sido(), { target: { value: "11" } });
  };

  it("AI 모드가 꺼져 있으면 한 줄 — 대화가 비어도 띄우고, [취소]면 그대로", async () => {
    await mount();
    await pickSeoul();
    expect(dialog().textContent).toContain("기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.");
    expect(dialog().textContent).not.toContain("AI 모드");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(S.cond.base?.sido.name).toBe("부산광역시");
  });

  it("AI 모드가 켜져 있으면 두 줄 — [새 대화로 시작]이면 바꾸고 AI 모드를 끄고 새 대화로", async () => {
    await mount();
    act(() => S.setAimOn(true));
    await pickSeoul();
    const lines = [...dialog().querySelectorAll(".acm-desc > div")].map((d) => d.textContent);
    expect(lines).toEqual(["1. 기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.", "2. 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다."]);
    const newConv = vi.fn();
    window.addEventListener("sa:new-conv", newConv);
    fireEvent.click(screen.getByRole("button", { name: "새 대화로 시작" }));
    window.removeEventListener("sa:new-conv", newConv);
    expect(S.cond.base).toEqual(SEOUL);
    expect(S.aimOn).toBe(false);
    expect(newConv).toHaveBeenCalledTimes(1);
    expect(nav.pushed).toEqual([]);
  });

  it("통합 탐색 밖(대화 이력 등)에서 바꾸면 확인 뒤 통합 탐색 새 대화로 간다", async () => {
    nav.path = "/history";
    await mount();
    await pickSeoul();
    fireEvent.click(screen.getByRole("button", { name: "새 대화로 시작" }));
    expect(S.cond.base).toEqual(SEOUL);
    expect(nav.pushed).toEqual(["/explore"]);
  });
});

// ── 참조 특보 떼기 안내 — 실제 session 효과(R45) ──
const SCN_ADV: Advisory = { id: "SCN-BS-1", type: "호우", level: "경보", area: "부산", regionId: "busan", issuedAt: new Date().toISOString(), status: "발효", scenario: true };
const KMA_ADV: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: new Date().toISOString(), status: "발효" };
const CUT_WX: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: new Date().toISOString(), message: "시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다" }, advisories: [SCN_ADV], preliminary: [], realtimeCut: true, accountId: ACC.id };

describe("참조 특보 떼기 안내 — 끊김 · 시나리오 끝남 · 조회 실패", () => {
  const attach = async (a: Advisory) => {
    await mount();
    await waitFor(() => expect(S.weather).not.toBeNull());
    act(() => S.setWxRef(a));
    await act(async () => {});
  };

  it("끊긴 계정(R45)의 기상청 특보 참조 — 「기상청 실시간 특보를 끊어 특보 참조를 뗐습니다.」", async () => {
    srv.wx = CUT_WX;
    await attach(KMA_ADV);
    expect(S.wxRef).toBeNull();
    expect(S.toastMsg).toBe("기상청 실시간 특보를 끊어 특보 참조를 뗐습니다.");
  });

  it("끊긴 계정의 시나리오 특보 참조는 그대로(목록에 있음)", async () => {
    srv.wx = CUT_WX;
    await attach(SCN_ADV);
    expect(S.wxRef?.id).toBe("SCN-BS-1");
    expect(S.toastMsg).toBeNull();
  });

  it("시나리오를 끄거나 끝나는 시각이 지나 시나리오 특보가 사라지면 — 「시연 시나리오 특보가 끝나 특보 참조를 뗐습니다.」(서버가 답한 기상청 조회 실패여도)", async () => {
    srv.wx = WX;
    await attach(SCN_ADV);
    expect(S.wxRef).toBeNull();
    expect(S.toastMsg).toBe("시연 시나리오 특보가 끝나 특보 참조를 뗐습니다.");
    cleanup();
    srv.wx = { ...WX, status: { ok: false, fetchedAt: new Date().toISOString(), message: "기상청 API 연결 실패" } };
    await attach(SCN_ADV);
    expect(S.wxRef).toBeNull();
    expect(S.toastMsg).toBe("시연 시나리오 특보가 끝나 특보 참조를 뗐습니다.");
  });

  it("화면 쪽 조회 실패(응답을 못 받음)면 시나리오 특보 참조도 기상청 특보 참조도 그대로 — 꺼졌는지 모른다", async () => {
    srv.wx = "fail";
    await attach(SCN_ADV);
    expect(S.weather?.status.ok).toBe(false);
    expect(S.wxRef?.id).toBe("SCN-BS-1");
    act(() => S.setWxRef(KMA_ADV));
    await act(async () => {});
    expect(S.wxRef?.id).toBe(KMA_ADV.id);
    expect(S.toastMsg).toBeNull();
  });

  it("끊지 않은 계정의 기상청 특보 해제 — 지금 그대로 「참조한 특보가 해제되어 특보 참조를 뗐습니다.」", async () => {
    srv.wx = WX;
    await attach(KMA_ADV);
    expect(S.wxRef).toBeNull();
    expect(S.toastMsg).toBe("참조한 특보가 해제되어 특보 참조를 뗐습니다.");
  });
});
