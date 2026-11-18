// @vitest-environment jsdom
// 질문 목록(QueuePanel)·특보 줄(WxBar) — R39·R40
//  · 질문 현황은 지금 대화의 질문만 — AI 모드 점검·다른 대화 작업이 보이지 않는다(진행 중·완료·배지 수 모두)
//  · 특보 줄 — 2건 이상이면 5초마다 한 건씩(개발 서버 AlertBanner: 최대 5건 · 정지/다시 시작 · 「i / N」 · 올림·초점 멈춤 · 움직임 줄이기 · 줄면 첫 건), [모두 보기] = 발효 특보 전체(기상청 실응답 원문으로)
// npx vitest run harness/explore/queueWx
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KMA from "../region/kma_t6_samples.json";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { JobSummary } from "@/lib/jobTypes";
import type { BaseRegion } from "@/lib/baseRegion";
import { parseStatusText } from "@/lib/server/kma";
import { wxCovers } from "@/lib/wxMatch";
import { baseTarget } from "@/lib/baseRegion";
import { wxLabel } from "@/lib/wxref";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));

import QueuePanel from "@/components/queue/QueuePanel";
import { WX_ROTATE_MAX, WX_ROTATE_MS, WxBar, wxRotation } from "@/components/AppShell";

afterEach(() => cleanup());

const now = new Date().toISOString();
const job = (id: string, source: JobSummary["source"], state: JobSummary["state"], q: string): JobSummary => ({
  id, account_id: "unes", conv_id: null, turn_no: 1, source, library_id: null, question_user: q, question_sent: q, state,
  t3q_status: state === "DONE" ? "SUCCESS" : null, http_status: null, cached_from: null, retry_of: null, error_code: null,
  created_at: now, submitted_at: now, finished_at: state === "DONE" ? now : null, elapsed_ms: state === "DONE" ? 9000 : null, t3q_conversation_id: null,
});

describe("질문 현황 — 지금 대화의 질문만(개발서버 useAskList — AI 모드 점검·계정의 다른 작업은 오르지 않는다)", () => {
  const jobs = [
    job("u1", "USER", "RUNNING", "부산 침수 위험지구는?"),
    job("a1", "AI_MODE", "RUNNING", "제공된 기상특보 정보를 기준으로 점검 중"),
    job("u2", "USER", "DONE", "인제 산사태 이력은?"),
    job("a2", "AI_MODE", "DONE", "제공된 기상특보 정보를 기준으로 점검 끝"),
    job("o1", "USER", "DONE", "다른 대화의 질문"),
  ];
  const set = () => {
    session.s = { jobOrder: jobs.map((j) => j.id), jobs: Object.fromEntries(jobs.map((j) => [j.id, j])), t3qOk: true };
  };
  // 지금 대화의 턴 — u1·u2 만
  const turns = [
    { id: "t1", jobId: "u1", q: "부산 침수 위험지구는?", source: "USER" as const, at: now },
    { id: "t2", jobId: "u2", q: "인제 산사태 이력은?", source: "FOLLOW_UP" as const, at: now },
  ];

  it("펼친 목록 — 이 대화의 질문만, 점검·다른 대화 작업은 없고 진행 수도 세지 않는다", () => {
    set();
    const { container } = render(<QueuePanel open setOpen={() => {}} turns={turns} onPick={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("부산 침수 위험지구는?");
    expect(text).toContain("인제 산사태 이력은?");
    expect(text).not.toContain("기상특보 정보를 기준으로");
    expect(text).not.toContain("다른 대화의 질문");
    expect(container.querySelectorAll(".qp-item")).toHaveLength(2);
    expect(text).toContain("진행 1");
  });

  it("접힌 탭 — 진행 1 · 새로 끝난 답 1", () => {
    set();
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} turns={turns} onPick={() => {}} />);
    expect([...container.querySelectorAll(".qp-badge")].map((b) => b.textContent)).toEqual(["1", "1"]);
  });

  it("대화에 질문이 없으면 빈 목록", () => {
    set();
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} turns={[]} onPick={() => {}} />);
    expect(container.querySelectorAll(".qp-badge")).toHaveLength(0);
  });
});

describe("특보 줄 — 5초 자동 넘김(개발 서버 AlertBanner, 2026-11-06) · [모두 보기]", () => {
  const S = Object.fromEntries(KMA.samples.map((s) => [s.key, s])) as unknown as Record<string, { tmFc: number; t6: string }>;
  const t = (v: number) => {
    const s = String(v);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  };
  const gale = parseStatusText(S.gale.t6, t(S.gale.tmFc)) as Advisory[];
  const weather: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: now, message: "기상청 06:00 발표" }, advisories: gale, preliminary: [] };
  const show = (base: BaseRegion | null) => {
    session.s = { weather, account: { id: "unes" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
    return render(<WxBar />).container;
  };
  const mine = (base: BaseRegion | null) => gale.filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, baseTarget(base)));

  it("전국(특보 여럿) — 「특보 N건 발효 중 · 구역 특보」 · 「1 / 5」, 경보 먼저·최근 발표 순 최대 5건(나머지 이름을 잇던 줄은 없음)", () => {
    expect(mine(null).length).toBeGreaterThan(5);
    const c = show(null);
    const bar = c.querySelector(".wxbar")!;
    const order = wxRotation(mine(null));
    expect(order).toHaveLength(WX_ROTATE_MAX);
    expect(bar.querySelector(".tit")!.textContent).toBe(`특보 ${mine(null).length}건 발효 중 · ${order[0].area} ${wxLabel(order[0])}`);
    expect(bar.querySelector(".wxat")!.textContent).toBe("1 / 5");
    expect(bar.querySelector(".more")).toBeNull();
  });

  it("오른쪽 단추 하나 — 여러 건이면 「특보 N건 목록 보기」(개발서버 alert-banner-more — 모두 보기·특보로 질문은 없다)", () => {
    show(null);
    expect(screen.getByRole("button", { name: `특보 ${mine(null).length}건 목록 보기` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "모두 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: /특보로 질문/ })).toBeNull();
  });

  it("기준지역(제주특별자치도)이면 그 지역을 덮는 특보만", () => {
    const base: BaseRegion = { sido: { code: "50", name: "제주특별자치도" } };
    const m = mine(base);
    expect(m.length).toBeGreaterThan(0);
    const c = show(base);
    expect(c.querySelector(".wxbar")!.textContent).not.toContain("외 ");
    if (m.length > 1) {
      expect(screen.getByRole("button", { name: `특보 ${m.length}건 목록 보기` })).toBeTruthy();
    } else expect(c.querySelector(".wxstop")).toBeNull();
  });

});

describe("특보 줄 — 자동 넘김 동작(개발 서버 AlertBanner AlertRotator)", () => {
  const adv = (i: number, level: Advisory["level"], at: string): Advisory => ({ id: `A${i}`, type: "강풍", level, area: `구역${i}`, issuedAt: at, status: "발효" });
  // 경보 먼저, 같으면 최근 발표 순 → A3(경보) · A2 · A1 · A0 · A5 · (A4 는 6번째라 빠짐)
  const list = [
    adv(0, "주의보", "2026-11-06T09:00:00+09:00"), adv(1, "주의보", "2026-11-06T10:00:00+09:00"), adv(2, "주의보", "2026-11-06T11:00:00+09:00"),
    adv(3, "경보", "2026-11-06T08:00:00+09:00"), adv(4, "주의보", "2026-11-06T06:00:00+09:00"), adv(5, "주의보", "2026-11-06T07:00:00+09:00"),
  ];
  const w = (advisories: Advisory[]): WeatherResponse => ({ mode: "live", status: { ok: true, fetchedAt: now, message: "" }, advisories, preliminary: [] });
  const at = (advisories: Advisory[]) => {
    session.s = { weather: w(advisories), account: { id: "unes" }, cond: { base: null }, wxRef: null, setWxRef: () => {}, aimOn: false };
  };
  const reduce = (on: boolean) => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  };
  const area = () => document.querySelector(".wxbar .tit")!.textContent!.split(" · ")[1];
  const pos = () => document.querySelector(".wxbar .wxat")!.textContent;
  const tick = (n = 1) => act(() => vi.advanceTimersByTime(WX_ROTATE_MS * n));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("경보 먼저·최근 발표 순, 최대 5건", () => {
    expect(wxRotation(list).map((a) => a.id)).toEqual(["A3", "A2", "A1", "A0", "A5"]);
  });

  it("5초마다 다음 건, 끝에서 처음으로 · 「i / N」", () => {
    vi.useFakeTimers();
    reduce(false);
    at(list);
    render(<WxBar />);
    expect([area(), pos()]).toEqual(["구역3 강풍경보", "1 / 5"]);
    tick();
    expect([area(), pos()]).toEqual(["구역2 강풍주의보", "2 / 5"]);
    tick(4);
    expect(pos()).toBe("1 / 5");
    // 경보가 하나라도 있으면 줄 전체가 경보 색
    expect(document.querySelector(".wxbar")!.className).toContain("danger");
  });

  it("[자동 넘김 정지] → 멈춤, [다시 시작] → 다시 돈다", () => {
    vi.useFakeTimers();
    reduce(false);
    at(list);
    render(<WxBar />);
    fireEvent.click(screen.getByRole("button", { name: "자동 넘김 정지" }));
    tick(3);
    expect(pos()).toBe("1 / 5");
    const play = screen.getByRole("button", { name: "자동 넘김 다시 시작" });
    expect(play.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(play);
    tick();
    expect(pos()).toBe("2 / 5");
  });

  it("마우스를 올리거나 초점이 들어가면 멈추고, 떼면 다시 돈다", () => {
    vi.useFakeTimers();
    reduce(false);
    at(list);
    render(<WxBar />);
    const bar = document.querySelector(".wxbar")!;
    fireEvent.mouseEnter(bar);
    tick(2);
    expect(pos()).toBe("1 / 5");
    fireEvent.mouseLeave(bar);
    tick();
    expect(pos()).toBe("2 / 5");
    fireEvent.focus(document.querySelector(".wxbar .wxmore")!);
    tick(2);
    expect(pos()).toBe("2 / 5");
    fireEvent.blur(document.querySelector(".wxbar .wxmore")!);
    tick();
    expect(pos()).toBe("3 / 5");
  });

  it("움직임 줄이기 설정이면 돌지 않는다", () => {
    vi.useFakeTimers();
    reduce(true);
    at(list);
    render(<WxBar />);
    tick(3);
    expect(pos()).toBe("1 / 5");
  });

  it("특보가 줄어 보던 자리가 목록 밖이면 첫 건으로 · 1건이 되면 넘김 없이 그 특보만", () => {
    vi.useFakeTimers();
    reduce(false);
    at(list);
    const r = render(<WxBar />);
    tick(4);
    expect(pos()).toBe("5 / 5");
    at(list.slice(0, 3));
    r.rerender(<WxBar />);
    expect(pos()).toBe("1 / 3");
    at(list.slice(0, 1));
    r.rerender(<WxBar />);
    expect(document.querySelector(".wxbar .wxat")).toBeNull();
    expect(screen.queryByRole("button", { name: /자동 넘김/ })).toBeNull();
    expect(document.querySelector(".wxbar .tit")!.textContent).toBe("구역0 강풍주의보 발효 중");
  });
});
