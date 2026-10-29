// @vitest-environment jsdom
// 기준지역 잠금(R32)에서 AI 모드 점검 빼기(R44) — 대화 질의(그 밖의 출처)가 보내는 중·대기·제출·답변 생성 중일 때만 잠근다.
//  · 판정 함수(lib/jobTypes locksBase · sourceLocksBase)
//  · 실제 SessionProvider(lib/session — fetch 만 흉내): 진행 중 AI_MODE 작업만 있으면 asking false · setBase 허용 · 머리줄 고르기(BasePicker) 열림,
//    USER 작업이 있으면 막힘, AI_MODE 접수 중에는 보내는 중으로 세지 않음
//  · AI 모드 창: 접수를 기다리는 사이 기준지역이 바뀌면 돌아온 이전 지역 점검을 이 창의 점검으로 삼지 않고(진행 중이면 취소), 새 지역 START 점검이 나간다.
//    기준지역을 잇달아 바꾸면 마지막 지역 점검 하나만 나가고, 진행 중이던 이전 지역 점검은 취소된다(계정 동시 한도를 채우지 않게)
//  · 참조 특보 떼기 안내(R45) — 끊긴 계정의 기상청 특보 참조 · 시나리오 끔·만료 · 화면 쪽 조회 실패면 그대로
// npx vitest run harness/explore/baseLock
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));
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

// ── AI 모드 창 — 접수 중 기준지역이 바뀌면 이전 지역 점검은 버린다(진행 중이면 취소) ──
type Sent = { source: string; aiMode?: { trigger: string }; condition?: { base?: { name?: string } | null } };
const renderAim = async () => {
  const AiModeModal = (await import("@/components/explore/AiModeModal")).default;
  render(
    <SessionProvider>
      <Probe />
      <BasePicker />
      <AiModeModal />
    </SessionProvider>,
  );
};
/** 기준지역이 바뀐 뒤 새 지역 점검이 나가기까지(AiModeModal BASE_SETTLE_MS 1.5초) 넉넉히 */
const SETTLE = { timeout: 4000 };

describe("AI 모드 창 — 점검 접수 중 기준지역 변경", () => {
  it("돌아온 이전 지역 점검을 이 창의 점검으로 삼지 않고(진행 중이면 취소), 새 지역 START 점검의 답을 보인다 — 「점검 중」이 이전 작업에 묶이지 않음", async () => {
    const old = deferred<unknown>();
    const neu = deferred<unknown>();
    const sent: Sent[] = [];
    srv.post = (b) => {
      sent.push(b as never);
      return sent.length === 1 ? old.promise : neu.promise;
    };
    await renderAim();
    // 시험에서는 창이 계정을 받기 전에 그려져 기준지역이 전국 → 계정 기준지역으로 바뀐 것으로 센다(BASE_SETTLE_MS 뒤 START)
    await waitFor(() => expect(sent).toHaveLength(1), SETTLE);
    expect(sent[0].source).toBe("AI_MODE");
    expect(sent[0].aiMode?.trigger).toBe("START");
    expect(sent[0].condition?.base?.name).toBe("부산광역시");
    // 부산 점검 접수를 기다리는 사이 — 기준지역 고르기는 막히지 않고, 서울로 바꾸면 새 지역 START 점검이 나간다
    expect(S.asking).toBe(false);
    expect(sido().disabled).toBe(false);
    act(() => {
      expect(S.setBase(SEOUL)).toBe(true);
    });
    await waitFor(() => expect(sent).toHaveLength(2), SETTLE);
    expect(sent[1].aiMode?.trigger).toBe("START");
    expect(sent[1].condition?.base?.name).toBe("서울특별시");
    // 새 지역 점검이 먼저, 이전 지역 점검이 늦게 돌아와도
    const done = { ...job("new", "AI_MODE", "DONE"), finished_at: new Date().toISOString() };
    srv.jobs = [
      { ...done, request: {}, raw: { status: "SUCCESS", result: { answer: "서울특별시 점검 답" } }, preview: null, geo: null },
      job("old", "AI_MODE", "RUNNING"),
    ];
    await act(async () => {
      neu.resolve({ job: done });
      await neu.promise;
    });
    await act(async () => {
      old.resolve({ job: job("old", "AI_MODE", "RUNNING") });
      await old.promise;
    });
    await waitFor(() => expect(document.querySelector(".aim-card")!.textContent).toContain("서울특별시 점검 답"));
    const modal = document.querySelector(".modal.aim")!.textContent!;
    expect(modal).not.toContain("점검 중");
    expect(modal).not.toContain("점검 질의에 답을 기다리는 중");
    // 아무도 보지 않을 이전 지역 점검(진행 중)은 취소 — 새 지역 점검은 그대로
    await waitFor(() => expect(srv.cancels).toEqual(["old"]));
    await waitFor(() => expect(S.jobs.old?.state).toBe("CANCELLED"));
    expect(S.asking).toBe(false);
  });

  it("기준지역을 잇달아 바꾸면(시·도 → 시·군·구 → 다른 시·군·구) 마지막 지역 점검 하나만 나가고, 진행 중이던 이전 지역 점검은 취소된다", async () => {
    const sent: Sent[] = [];
    srv.post = async (b) => {
      sent.push(b as never);
      const j = job(`a${sent.length}`, "AI_MODE", sent.length === 1 ? "RUNNING" : "DONE");
      srv.jobs = [...(srv.jobs as JobSummary[]), j];
      return { job: j };
    };
    await renderAim();
    // 시험에서는 창이 계정을 받기 전에 그려져 기준지역이 전국 → 계정 기준지역으로 바뀐 것으로 센다(BASE_SETTLE_MS 뒤 START)
    await waitFor(() => expect(sent).toHaveLength(1), SETTLE);
    // 부산 점검(a1)이 도는 중
    await waitFor(() => expect(document.querySelector(".modal.aim")!.textContent).toContain("점검 중"));
    const gu = (code: string, name: string): BaseRegion => ({ sido: SEOUL.sido, sigungu: { code, name } });
    for (const b of [SEOUL, gu("11110", "종로구"), gu("11140", "중구")])
      act(() => {
        expect(S.setBase(b)).toBe(true);
      });
    // 진행 중이던 부산 점검은 기준지역이 바뀐 때 바로 취소
    await waitFor(() => expect(srv.cancels).toEqual(["a1"]));
    await waitFor(() => expect(sent).toHaveLength(2), SETTLE);
    expect(sent[1].aiMode?.trigger).toBe("START");
    expect(JSON.stringify(sent[1].condition)).toContain("중구");
    // 중간 지역(서울특별시 · 종로구) 점검은 나가지 않는다
    await new Promise((r) => setTimeout(r, 1800));
    expect(sent).toHaveLength(2);
    expect(sent.some((x) => JSON.stringify(x.condition).includes("종로구"))).toBe(false);
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
