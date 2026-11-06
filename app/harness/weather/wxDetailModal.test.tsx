// @vitest-environment jsdom
// 하네스 — 기상특보 상세 창(components/wx/WxDetailModal · 개발 서버 AlertDetailModal 을 옮김)
//  · 특보 줄 [특보 상세] → 창 · 발효 중 특보(줄과 같은 목록, 해상 표지) · 상태 이력(기준지역으로 거름) · 전국 발효 현황(받은 그대로 — 건수 없음) · 통보문(펼칠 때 본문)
//  · [조건에 반영] = 특보 종류·단계를 조건에 · [이 특보로 질의] = 그 특보가 걸린 행정구역으로(lib/wxAsk) · AI 모드에서는 막힘
//  · 시연 시나리오를 켠 시연 계정(R45) — 통보문·상태 이력 자리에 「기상청 실시간 특보 끊음」
// 네트워크 없음 — fetch 를 바꿔 끼운다
// npx vitest run harness/weather/wxDetailModal
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { BaseRegion } from "@/lib/baseRegion";
import { bulletinHead, bulletinSteps, parseWrnMsg, type WxDetailResponse } from "@/lib/wxBulletin";
import sample from "./kma_wrnmsg_sample.json";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: () => {} }), usePathname: () => "/history" }));
const wxAsk = vi.hoisted(() => ({ req: vi.fn() }));
vi.mock("@/lib/wxAsk", async (orig) => ({ ...(await orig<typeof import("@/lib/wxAsk")>()), requestWxAsk: wxAsk.req }));

import { WxBar } from "@/components/AppShell";

const now = new Date().toISOString();
const INJE: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } };
const HAN: Advisory = { id: "KMA-한파주의보-강원도(인제평지,인제산지)", type: "한파", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: now, status: "발효" };
const SEA: Advisory = { id: "KMA-풍랑경보-동해중부안쪽먼바다", type: "풍랑", level: "경보", area: "동해중부안쪽먼바다", issuedAt: now, status: "발효" };
const BUSAN: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", issuedAt: now, status: "발효" };
const weather = (advisories: Advisory[], cut = false): WeatherResponse => ({ mode: "live", status: { ok: true, fetchedAt: now, message: "기상청 12:00 발표" }, advisories, preliminary: [], ...(cut ? { realtimeCut: true } : {}) });

const rows = parseWrnMsg(sample, "108");
const DETAIL: WxDetailResponse = {
  ok: true, fetchedAt: now, hours: 24, failed: [], bulletinsMore: false,
  bulletins: rows.map(bulletinHead),
  steps: rows.flatMap(bulletinSteps),
  askRegions: { [HAN.id]: INJE, [SEA.id]: null, [BUSAN.id]: { sido: { code: "26", name: "부산광역시" } } },
};
let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  nav.push.mockClear();
  wxAsk.req.mockClear();
  vi.stubGlobal("fetch", async (u: string) => {
    fetched.push(u);
    if (u.startsWith("/api/weather/detail")) return Response.json(DETAIL);
    if (u.startsWith("/api/weather/bulletin")) return Response.json(rows.find((b) => u.includes(encodeURIComponent(b.key)))!);
    return Response.json({}, { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async (opts: { advs?: Advisory[]; base?: BaseRegion | null; cut?: boolean; aimOn?: boolean } = {}) => {
  const setCond = vi.fn(), toast = vi.fn();
  session.s = { weather: weather(opts.advs ?? [HAN, SEA, BUSAN], opts.cut), account: { id: "ij_safety01" }, cond: { base: opts.base === undefined ? INJE : opts.base }, wxRef: null, setWxRef: () => {}, aimOn: !!opts.aimOn, setCond, toast, reloadWeather: () => {} };
  render(<WxBar />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "특보 상세" })));
  const dlg = screen.getByRole("dialog", { name: "기상특보 상세" });
  const sec = (title: RegExp) => [...dlg.querySelectorAll(".wxd-sec")].find((x) => title.test(x.querySelector("h3")!.textContent!)) as HTMLElement;
  return { dlg, sec, setCond, toast };
};

describe("기상특보 상세 창", () => {
  it("인제군 — 발효 중 특보는 줄과 같은 목록(기준지역을 덮는 것만), 상태 이력은 인제를 덮는 단계만, 전국은 받은 그대로", async () => {
    const { dlg, sec } = await open();
    expect(fetched[0]).toBe("/api/weather/detail?sido=51");
    expect(dlg.querySelector(".wxd-region")!.textContent).toBe("강원특별자치도 인제군");
    expect([...sec(/발효 중 특보/).querySelectorAll(".wxd-area")].map((x) => x.textContent)).toEqual(["강원도(인제평지, 인제산지)"]);
    expect([...sec(/상태 이력/).querySelectorAll(".wxd-state")].map((x) => x.textContent)).toEqual(["한파주의보 발표"]);
    expect(sec(/상태 이력/).querySelector(".wxd-step-at")!.textContent).toContain("2026년 11월 06일 21시 00분 · 서울 제34호");
    expect([...sec(/전국 발효 현황/).querySelectorAll("li")].map((x) => x.textContent)).toEqual(["한파주의보강원도(인제평지, 인제산지)", "풍랑경보동해중부안쪽먼바다해상", "강풍주의보부산"]);
    // 유엔이가 센 건수는 없다(R25)
    expect(dlg.textContent).not.toMatch(/\d+건/);
  });

  it("통보문 — 누르면 그때 본문을 가져와 칸 그대로(내용이 비면 그 사실을 적는다), 다시 접고 펴도 다시 묻지 않는다", async () => {
    const { sec } = await open();
    const msgs = sec(/최근 통보문/);
    expect([...msgs.querySelectorAll(".wxd-msg-title")].map((x) => x.textContent)).toEqual(["풍랑주의보 발표", "강풍주의보 발표·풍랑경보 변경·한파주의보 발표", "호우경보 해제"]);
    const head = msgs.querySelectorAll<HTMLButtonElement>(".wxd-msg-hd")[1];
    await act(async () => fireEvent.click(head));
    expect(fetched.filter((u) => u.startsWith("/api/weather/bulletin"))).toEqual([`/api/weather/bulletin?key=${encodeURIComponent("108|202611061100|34")}`]);
    const card = msgs.querySelector(".bc")!;
    expect(card.querySelector(".bc-title")!.textContent).toBe("강풍주의보 발표·풍랑경보 변경·한파주의보 발표");
    expect(card.textContent).toContain("기상청이 덧붙인 내용이 없습니다.");
    expect(card.textContent).toContain("o 강풍주의보 : 서해5도");
    await act(async () => fireEvent.click(head));
    await act(async () => fireEvent.click(head));
    expect(fetched.filter((u) => u.startsWith("/api/weather/bulletin"))).toHaveLength(1);
  });

  it("[조건에 반영] — 종류·단계를 조건에", async () => {
    const { sec, setCond, toast } = await open();
    fireEvent.click(sec(/발효 중 특보/).querySelector<HTMLButtonElement>("button")!);
    expect(setCond).toHaveBeenCalledWith({ warningKind: "한파", warningLevel: "주의보" });
    expect(toast).toHaveBeenCalledWith("한파주의보를 재난상황 조건에 넣었습니다.");
  });

  it("[이 특보로 질의] — 그 특보가 걸린 행정구역으로, 통합 탐색으로 옮겨 간다", async () => {
    const { sec } = await open({ base: null });
    const items = [...sec(/발효 중 특보/).querySelectorAll(".wxd-item")];
    expect(items).toHaveLength(3); // 전국이면 모두
    const askOf = (i: number) => [...items[i].querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(askOf(0).title).toBe("강원특별자치도 인제군 기준으로 바로 묻습니다");
    fireEvent.click(askOf(0));
    expect(wxAsk.req).toHaveBeenCalledWith({ adv: HAN, base: INJE });
    expect(nav.push).toHaveBeenCalledWith("/explore");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("바다 구역 — 「해상」 표지, 기준지역을 정할 수 없어 지금 기준지역 그대로", async () => {
    const { sec } = await open({ base: null });
    const item = [...sec(/발효 중 특보/).querySelectorAll(".wxd-item")][1];
    expect(item.querySelector(".wxd-area")!.textContent).toBe("동해중부안쪽먼바다해상");
    const ask = [...item.querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(ask.title).toBe("전국 기준으로 바로 묻습니다");
    fireEvent.click(ask);
    expect(wxAsk.req).toHaveBeenCalledWith({ adv: SEA });
  });

  it("AI 모드에서는 [이 특보로 질의]를 막는다", async () => {
    const { sec } = await open({ aimOn: true });
    const ask = [...sec(/발효 중 특보/).querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(ask.disabled).toBe(true);
  });

  it("시연 시나리오를 켠 시연 계정 — 통보문·상태 이력 자리에 「기상청 실시간 특보 끊음」(「없음」이라 하지 않는다)", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      fetched.push(u);
      return Response.json({ ...DETAIL, realtimeCut: true, bulletins: [], steps: [] });
    });
    const scn: Advisory = { id: "SCN-IJ-1", type: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: now, status: "발효", scenario: true };
    const { dlg, sec } = await open({ advs: [scn], cut: true });
    expect(sec(/발효 중 특보/).querySelector(".wxd-area")!.textContent).toBe("강원도(인제평지, 인제산지)시연 시나리오");
    expect(sec(/상태 이력/).textContent).toContain("기상청 실시간 특보 끊음");
    expect(sec(/최근 통보문/).textContent).toContain("기상청 실시간 특보 끊음");
    expect(dlg.querySelector(".wxd-src")!.textContent).toBe("기상청 실시간 특보 끊음");
    expect(dlg.textContent).not.toMatch(/받은 통보문이 없습니다|걸리거나 풀린 특보가 없습니다/);
  });
});
