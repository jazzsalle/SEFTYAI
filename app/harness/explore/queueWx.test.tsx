// @vitest-environment jsdom
// 질문 목록(QueuePanel)·특보 줄(WxBar) — R39·R40
//  · 질문 목록에 AI 모드 점검(source AI_MODE)이 보이지 않는다(진행 중·완료·배지 수 모두)
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
import { advLabel } from "@/lib/wxref";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));

import QueuePanel from "@/components/queue/QueuePanel";
import { WX_ROTATE_MAX, WX_ROTATE_MS, WxBar, wxRotation } from "@/components/AppShell";

afterEach(() => cleanup());

const now = new Date().toISOString();
const job = (id: string, source: JobSummary["source"], state: JobSummary["state"], q: string): JobSummary => ({
  id, account_id: "admin01", conv_id: null, turn_no: 1, source, library_id: null, question_user: q, question_sent: q, state,
  t3q_status: state === "DONE" ? "SUCCESS" : null, http_status: null, cached_from: null, retry_of: null, error_code: null,
  created_at: now, submitted_at: now, finished_at: state === "DONE" ? now : null, elapsed_ms: state === "DONE" ? 9000 : null, t3q_conversation_id: null,
});

describe("질문 목록 — AI 모드 점검 빼기(R39)", () => {
  const jobs = [
    job("u1", "USER", "RUNNING", "부산 침수 위험지구는?"),
    job("a1", "AI_MODE", "RUNNING", "제공된 기상특보 정보를 기준으로 점검 중"),
    job("u2", "USER", "DONE", "인제 산사태 이력은?"),
    job("a2", "AI_MODE", "DONE", "제공된 기상특보 정보를 기준으로 점검 끝"),
  ];
  const set = () => {
    session.s = { jobOrder: jobs.map((j) => j.id), jobs: Object.fromEntries(jobs.map((j) => [j.id, j])), t3qOk: true };
  };

  it("펼친 목록 — 진행 중·완료 어디에도 점검이 없고, 진행 수도 점검을 세지 않는다", () => {
    set();
    const { container } = render(<QueuePanel open setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("부산 침수 위험지구는?");
    expect(text).toContain("인제 산사태 이력은?");
    expect(text).not.toContain("기상특보 정보를 기준으로");
    expect(container.querySelectorAll(".qp-item")).toHaveLength(2);
    expect(text).toContain("진행 1");
  });

  it("접힌 탭 — 배지 수에 점검이 들지 않는다", () => {
    set();
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    expect([...container.querySelectorAll(".qp-badge")].map((b) => b.textContent)).toEqual(["1", "1"]);
  });

  it("점검만 있으면 빈 목록", () => {
    session.s = { jobOrder: ["a1", "a2"], jobs: { a1: jobs[1], a2: jobs[3] }, t3qOk: true };
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
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
    session.s = { weather, account: { id: "admin01" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
    return render(<WxBar />).container;
  };
  const mine = (base: BaseRegion | null) => gale.filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, baseTarget(base)));

  it("전국(특보 여럿) — 「특보 N건 발효 중 · 구역 특보」 · 「1 / 5」, 경보 먼저·최근 발표 순 최대 5건(나머지 이름을 잇던 줄은 없음)", () => {
    expect(mine(null).length).toBeGreaterThan(5);
    const c = show(null);
    const bar = c.querySelector(".wxbar")!;
    const order = wxRotation(mine(null));
    expect(order).toHaveLength(WX_ROTATE_MAX);
    expect(bar.querySelector(".tit")!.textContent).toBe(`특보 ${mine(null).length}건 발효 중 · ${order[0].area} ${advLabel(order[0])}`);
    expect(bar.querySelector(".wxat")!.textContent).toBe("1 / 5");
    expect(bar.querySelector(".more")).toBeNull();
  });

  it("[모두 보기] — 발효 특보 전체를 받은 구역·이름 그대로(받은 순서)", () => {
    show(null);
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
    const list = screen.getByRole("list", { name: "발효 중인 특보" });
    const rows = list.querySelectorAll("[role=listitem]");
    expect(rows).toHaveLength(mine(null).length);
    // 받은 순서 그대로(유엔이가 다시 늘어세우지 않음)
    expect([...rows].map((r) => r.querySelector(".ar")!.textContent)).toEqual(mine(null).map((a) => a.area));
    expect([...rows].map((r) => r.querySelector(".lvb")!.textContent)).toEqual(mine(null).map(advLabel));
    expect(list.querySelector(".hd")!.textContent).toBe("발효 중인 특보");
  });

  it("기준지역(제주특별자치도)이면 그 지역을 덮는 특보만", () => {
    const base: BaseRegion = { sido: { code: "50", name: "제주특별자치도" } };
    const m = mine(base);
    expect(m.length).toBeGreaterThan(0);
    const c = show(base);
    expect(c.querySelector(".wxbar")!.textContent).not.toContain("외 ");
    if (m.length > 1) {
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      expect(screen.getByRole("list", { name: "발효 중인 특보" }).querySelectorAll("[role=listitem]")).toHaveLength(m.length);
    } else expect(c.querySelector(".wxstop")).toBeNull();
  });

  describe("[모두 보기] 닫기", () => {
    const list = () => screen.queryByRole("list", { name: "발효 중인 특보" });
    const at = (w: WeatherResponse, base: BaseRegion | null = null) => {
      session.s = { weather: w, account: { id: "admin01" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
    };
    const openAll = () => {
      at(weather);
      const r = render(<WxBar />);
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      expect(list()).not.toBeNull();
      return r;
    };

    it("Esc · 바깥 누르기로 닫힌다(목록 안을 누르면 그대로)", () => {
      openAll();
      fireEvent.mouseDown(list()!);
      expect(list()).not.toBeNull();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(list()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      fireEvent.mouseDown(document.body);
      expect(list()).toBeNull();
    });

    it("기준지역이 바뀌면 닫힌다", () => {
      const r = openAll();
      at(weather, { sido: { code: "50", name: "제주특별자치도" } });
      r.rerender(<WxBar />);
      expect(list()).toBeNull();
    });

    it("특보가 1건·0건·조회 실패가 되었다가 다시 여럿이 되어도 저절로 펼쳐지지 않는다", () => {
      for (const w of [
        { ...weather, advisories: gale.slice(0, 1) },
        { ...weather, advisories: [] },
        { ...weather, status: { ok: false, fetchedAt: now, message: "기상청 응답 없음" }, advisories: [] },
      ] as WeatherResponse[]) {
        const r = openAll();
        at(w);
        r.rerender(<WxBar />);
        expect(list()).toBeNull();
        at(weather);
        r.rerender(<WxBar />);
        expect(screen.getByRole("button", { name: "모두 보기" })).toBeTruthy();
        expect(list()).toBeNull();
        cleanup();
      }
    });
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
    session.s = { weather: w(advisories), account: { id: "admin01" }, cond: { base: null }, wxRef: null, setWxRef: () => {}, aimOn: false };
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
    fireEvent.focus(screen.getByRole("button", { name: "특보 상세" }));
    tick(2);
    expect(pos()).toBe("2 / 5");
    fireEvent.blur(screen.getByRole("button", { name: "특보 상세" }));
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
