// @vitest-environment jsdom
// 하네스 — 기상특보 상세 창(components/wx/WxDetailModal · 개발 서버 AlertDetailModal 을 옮김)
//  · 특보 줄 [특보 상세] → 창 · 발효 중 특보(줄과 같은 목록, 해상 표지) · 상태 이력(기준지역으로 거름) · 전국 발효 현황(종류·단계별 건수 칩 — 개발 서버와 같이, 2026-11-06) · 통보문 특보발효현황 막대 · 통보문(펼칠 때 본문)
//  · [조건에 반영] = 특보 종류·단계를 조건에 · [이 특보로 질의] = 그 특보가 걸린 행정구역으로(lib/wxAsk) · AI 모드에서는 막힘
//  · 오른쪽 서랍(개발서버 modal--alert) · 시연 시나리오 특보도 표지 없이 진짜 특보처럼(2026-11-19 「개발서버와 동일하게」)
// 네트워크 없음 — fetch 를 바꿔 끼운다
// npx vitest run harness/weather/wxDetailModal
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { BaseRegion } from "@/lib/baseRegion";
import { bulletinHead, bulletinSteps, countAdvisories, parseStatusBars, parseWrnMsg, type WxDetailResponse } from "@/lib/wxBulletin";
import { advLabel } from "@/lib/wxref";
import type { PwnChange } from "@/lib/wxPwn";
import sample from "./kma_wrnmsg_sample.json";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: () => {} }), usePathname: () => "/history" }));
const wxAsk = vi.hoisted(() => ({ req: vi.fn() }));
vi.mock("@/lib/wxAsk", async (orig) => ({ ...(await orig<typeof import("@/lib/wxAsk")>()), requestWxAsk: wxAsk.req }));

import { WxBar } from "@/components/AppShell";
import BulletinCard from "@/components/wx/BulletinCard";

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
let detailOverride: WxDetailResponse | null = null;
beforeEach(() => {
  fetched = [];
  detailOverride = null;
  nav.push.mockClear();
  wxAsk.req.mockClear();
  vi.stubGlobal("fetch", async (u: string) => {
    fetched.push(u);
    if (u.startsWith("/api/weather/detail")) return Response.json(detailOverride ?? DETAIL);
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
  session.s = { weather: weather(opts.advs ?? [HAN, SEA, BUSAN], opts.cut), account: { id: "inje" }, cond: { base: opts.base === undefined ? INJE : opts.base }, wxRef: null, setWxRef: () => {}, aimOn: !!opts.aimOn, setCond, toast, reloadWeather: () => {} };
  render(<WxBar />);
  await act(async () => fireEvent.click(document.querySelector(".wxbar .wxmore")!));
  const dlg = screen.getByRole("dialog", { name: "기상특보 상세" });
  const sec = (title: RegExp) => [...dlg.querySelectorAll(".wx-section")].find((x) => title.test(x.querySelector(".wx-section-title")!.textContent!)) as HTMLElement;
  return { dlg, sec, setCond, toast };
};

describe("기상특보 상세 창", () => {
  it("인제군 — 발효 중 특보는 줄과 같은 목록(기준지역을 덮는 것만), 상태 이력은 인제를 덮는 단계만, 전국은 종류·단계별 건수 칩", async () => {
    const { dlg, sec } = await open();
    expect(fetched[0]).toBe("/api/weather/detail?sido=51");
    expect(dlg.querySelector(".wx-region")!.textContent).toBe("강원특별자치도 인제군");
    expect(sec(/발효 중 특보/).querySelector(".wx-count")!.textContent).toBe("1건");
    expect([...sec(/발효 중 특보/).querySelectorAll(".wx-item-area")].map((x) => x.textContent)).toEqual(["강원도(인제평지, 인제산지)"]);
    // 상태이력 표 4칸 — 시각 · 상태 · 특보 · 구역(개발서버 AlertDetailModal wx-step)
    const step = sec(/상태이력/).querySelector(".wx-step")!;
    expect([...step.children].map((x) => x.className.split(" ")[0])).toEqual(["wx-step-at", "wx-state", "wx-step-label", "wx-step-area"]);
    expect([step.querySelector(".wx-state")!.textContent, step.querySelector(".wx-step-label")!.textContent]).toEqual(["발표", "한파주의보"]);
    expect(step.querySelector(".wx-step-at")!.textContent).toBe("11.06 11:00");
    expect(sec(/상태이력/).querySelector(".wx-count")!.textContent).toBe("1건");
    // 특보코드 셈(detail.counts)이 없으면 특보 현황 글로 — 건수가 같으면 종류 이름 순(개발 서버 Nationwide), 바다는 이름에 「(해상)」
    expect([...sec(/전국 발효 현황/).querySelectorAll(".wx-chip")].map((x) => x.textContent)).toEqual(["강풍주의보1", "풍랑경보(해상)1", "한파주의보1"]);
    expect(sec(/전국 발효 현황/).querySelector(".wx-count")!.textContent).toBe("3건");
  });

  it("전국 발효 현황 — 서버가 특보코드로 센 값(counts)이 오면 그것을 그대로(구역 코드마다, 해상 따로)", async () => {
    detailOverride = { ...DETAIL, counts: [{ type: "한파", level: "주의보", sea: false, count: 7 }, { type: "풍랑", level: "경보", sea: true, count: 3 }] };
    const { sec } = await open();
    expect([...sec(/전국 발효 현황/).querySelectorAll(".wx-chip")].map((x) => x.textContent)).toEqual(["한파주의보7", "풍랑경보(해상)3"]);
    expect(sec(/전국 발효 현황/).querySelector(".wx-count")!.textContent).toBe("10건");
  });

  it("통보문 — 누르면 그때 본문을 가져와 칸 그대로(내용이 비면 그 사실을 적는다), 다시 접고 펴도 다시 묻지 않는다", async () => {
    const { sec } = await open();
    const msgs = sec(/최근 통보문/);
    expect([...msgs.querySelectorAll(".wx-msg-title")].map((x) => x.textContent)).toEqual(["풍랑주의보 발표", "강풍주의보 발표·풍랑경보 변경·한파주의보 발표", "호우경보 해제"]);
    const head = msgs.querySelectorAll<HTMLButtonElement>(".wx-msg-head")[1];
    await act(async () => fireEvent.click(head));
    expect(fetched.filter((u) => u.startsWith("/api/weather/bulletin"))).toEqual([`/api/weather/bulletin?key=${encodeURIComponent("108|202611061100|34")}`]);
    const card = msgs.querySelector(".bc")!;
    expect(card.querySelector(".bc-title")!.textContent).toBe("강풍주의보 발표·풍랑경보 변경·한파주의보 발표");
    expect(card.textContent).toContain("기상청이 덧붙인 내용이 없습니다.");
    // 특보발효현황 「o 강풍주의보 : 서해5도」 → 종류별 구역 수 막대(적힌 구역을 세기만 한다)
    const bar = card.querySelector(".bc-bar")!;
    expect(bar.querySelector(".bc-kind")!.textContent).toBe("강풍주의보");
    expect(bar.querySelector(".bc-kind")!.className).not.toContain("alarm");
    expect(bar.querySelector(".bc-bar-value")!.textContent).toBe("1개 구역");
    expect(bar.querySelector(".bc-bar-areas")!.textContent).toBe("서해5도");
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
    const items = [...sec(/발효 중 특보/).querySelectorAll(".wx-item")];
    expect(items).toHaveLength(3); // 전국이면 모두
    const askOf = (i: number) => [...items[i].querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(askOf(0).title).toBe("한파주의보 기준으로 바로 묻습니다");
    fireEvent.click(askOf(0));
    expect(wxAsk.req).toHaveBeenCalledWith({ adv: HAN, base: INJE });
    expect(nav.push).toHaveBeenCalledWith("/explore");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("바다 구역 — 이름에 「(해상)」(개발 서버 WarningCodes.LabelOf), 기준지역을 정할 수 없어 지금 기준지역 그대로", async () => {
    const { sec } = await open({ base: null });
    const item = [...sec(/발효 중 특보/).querySelectorAll(".wx-item")][1];
    // 개발서버처럼 구역 옆에 「해상」 꼬리표
    expect(item.querySelector(".wx-item-area")!.textContent).toBe("동해중부안쪽먼바다해상");
    expect(item.querySelector(".wx-badge")!.textContent).toBe("풍랑경보(해상)");
    expect(item.querySelector(".wx-tag")!.textContent).toBe("해상");
    const ask = [...item.querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(ask.title).toBe("풍랑경보(해상) 기준으로 바로 묻습니다");
    fireEvent.click(ask);
    expect(wxAsk.req).toHaveBeenCalledWith({ adv: SEA });
  });

  it("AI 모드에서는 [이 특보로 질의]를 막는다", async () => {
    const { sec } = await open({ aimOn: true });
    const ask = [...sec(/발효 중 특보/).querySelectorAll("button")].find((b) => b.textContent === "이 특보로 질의")!;
    expect(ask.disabled).toBe(true);
  });

  it("시연 시나리오를 켠 시연 계정 — 표지·「끊음」 없이 진짜 특보처럼(개발서버 가상 특보와 같이)", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      fetched.push(u);
      return Response.json({ ...DETAIL, realtimeCut: true, bulletins: [], steps: [] });
    });
    const scn: Advisory = { id: "SCN-IJ-1", type: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: now, status: "발효", scenario: true };
    const { dlg, sec } = await open({ advs: [scn], cut: true });
    expect(sec(/발효 중 특보/).querySelector(".wx-item-area")!.textContent).toBe("강원도(인제평지, 인제산지)");
    expect(dlg.querySelector(".wx-source")!.textContent).toMatch(/^기상청 · 기상특보 조회서비스 · \d\d\.\d\d \d\d:\d\d 갱신$/);
    expect(dlg.textContent).not.toMatch(/시연 시나리오|끊음/);
  });

  // 2026-11-19 특보 시각 처리를 개발서버와 같게 — 특보코드(getPwnCd) 구역 단위 칸(lib/server/kma)
  const ZONE: Advisory = {
    id: "KMA-강풍경보-강원도(인제군산지)#L1022920", type: "강풍", level: "경보", area: "강원도(인제군산지)", regionId: "inje", status: "발효",
    issuedAt: "2026-11-18T21:00:00+09:00", effectiveAt: "2026-11-18T21:00:00+09:00", announcedAt: "2026-11-18T18:00:00+09:00",
    areaCode: "L1022920", areaName: "인제군산지", changeType: "변경", sea: false,
  };
  const step = (o: Partial<PwnChange>): PwnChange => ({ key: "k", areaCode: "L1022920", areaName: "인제군산지", area: "강원도(인제군산지)", kind: "강풍", level: "경보", sea: false, state: "발효", at: "2026-11-18T21:00:00+09:00", ...o });

  it("특보코드 구역 — 구역 이름·변경 표지, 발효(startTime)·발표(tmFc)·구역코드를 따로(개발서버 AlertDetailModal wx-fields)", async () => {
    const { sec } = await open({ advs: [ZONE, HAN] });
    const items = [...sec(/발효 중 특보/).querySelectorAll(".wx-item")];
    expect(items[0].querySelector(".wx-item-area")!.textContent).toBe("인제군산지변경");
    expect(items[0].querySelector(".wx-tag--change")!.textContent).toBe("변경");
    const dd = [...items[0].querySelectorAll(".wx-fields dd")].map((x) => x.textContent);
    expect(dd).toEqual(["11.18 21:00", "11.18 18:00", "기상청", "L1022920"]);
    // 특보 현황 글로만 받은 특보(특보코드를 받지 못했을 때) — 발효·구역코드는 「미제공」, 발표는 현황 한 장의 시각
    const old = [...items[1].querySelectorAll(".wx-fields dd")].map((x) => x.textContent);
    expect([old[0], old[3]]).toEqual(["미제공", "미제공"]);
    expect(old[1]).not.toBe("미제공");
  });

  it("특보 줄 — 구역 이름(areaName)과 발효 시각(effectiveAt) 「HH:MM 발효」", async () => {
    session.s = { weather: weather([ZONE]), account: { id: "inje" }, cond: { base: INJE }, wxRef: null, setWxRef: () => {}, aimOn: false, setCond: vi.fn(), toast: vi.fn(), reloadWeather: () => {} };
    render(<WxBar />);
    expect(document.querySelector(".wxbar .tit")!.textContent).toBe("인제군산지 강풍경보 발효 중");
    expect(document.querySelector(".wxbar .meta")!.textContent).toMatch(/^21:00 발효 · 기상청 \d\d:\d\d 갱신$/);
  });

  it("상태이력 — 특보코드 장부(recent)의 발효·변경·해제 단계를 기준지역으로 걸러 최신순으로(시각 · 상태 · 특보 · 구역), 바다는 「해상」", async () => {
    detailOverride = {
      ...DETAIL,
      recent: [
        step({ key: "a", state: "변경", at: "2026-11-18T21:00:00+09:00" }),
        step({ key: "b", areaCode: "L1022720", areaName: "홍천군산지", area: "강원도(홍천군산지)", state: "해제", at: "2026-11-18T20:00:00+09:00" }),
        step({ key: "c", state: "해제", level: "주의보", at: "2026-11-18T21:00:00+09:00" }),
        step({ key: "d", areaCode: "S1151200", areaName: "강원중부앞바다", area: "강원중부앞바다", kind: "풍랑", level: "주의보", sea: true, state: "발효", at: "2026-11-18T19:00:00+09:00" }),
      ],
    };
    const { sec } = await open({ advs: [ZONE] });
    const rowsOf = (s: HTMLElement) => [...s.querySelectorAll(".wx-step")].map((li) => [...li.children].map((x) => x.textContent));
    // 인제군 — 홍천군산지는 빠지고, 강원 바다 구역은 시·군 이름으로 시작하지 않아 빠진다(lib/wxMatch)
    expect(rowsOf(sec(/상태이력/))).toEqual([
      ["11.18 21:00", "변경", "강풍경보", "인제군산지"],
      ["11.18 21:00", "해제", "강풍주의보", "인제군산지"],
    ]);
    expect(sec(/상태이력/).querySelectorAll(".wx-state--changed")).toHaveLength(1);
    expect(sec(/상태이력/).querySelector(".wx-count")!.textContent).toBe("2건");
    cleanup();
    const all = await open({ advs: [ZONE], base: null });
    expect(rowsOf(all.sec(/상태이력/))).toHaveLength(4);
    expect(rowsOf(all.sec(/상태이력/))[3]).toEqual(["11.18 19:00", "발효", "풍랑주의보(해상)", "강원중부앞바다해상"]);
  });

  it("시연 특보(가상) — 장부에 없는 특보도 켠 시각의 「발효」 단계로 상태이력에 싣는다(진짜 특보처럼)", async () => {
    detailOverride = { ...DETAIL, recent: [] };
    const scn: Advisory = {
      id: "SCN-IJ-1", type: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: "2026-11-19T09:00:00+09:00", status: "발효", scenario: true,
      areaCode: "5181000000", areaName: "강원도(인제평지, 인제산지)", effectiveAt: "2026-11-19T09:00:00+09:00", announcedAt: "2026-11-19T09:00:00+09:00", changeType: "신규", sea: false,
    };
    const { sec } = await open({ advs: [scn] });
    const it0 = sec(/발효 중 특보/).querySelector(".wx-item")!;
    expect([...it0.querySelectorAll(".wx-fields dd")].map((x) => x.textContent)).toEqual(["11.19 09:00", "11.19 09:00", "기상청", "5181000000"]);
    expect(it0.querySelector(".wx-tag--change")!.textContent).toBe("신규");
    expect([...sec(/상태이력/).querySelectorAll(".wx-step")].map((li) => [...li.children].map((x) => x.textContent))).toEqual([
      ["11.19 09:00", "발효", "호우주의보", "강원도(인제평지, 인제산지)"],
    ]);
  });

  it("받지 못하면 — 서랍 위에 실패 안내(wx-alarm), 특보가 없다고 하지 않는다", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      fetched.push(u);
      return Response.json({}, { status: 500 });
    });
    const { dlg } = await open();
    expect(dlg.querySelector(".wx-alarm")!.textContent).toBe("특보를 불러오지 못했습니다. 잠시 뒤 [새로고침] 을 눌러 주세요.");
  });
});

describe("특보 상세 창 집계(lib/wxBulletin — 개발 서버 AlertDetailModal·BulletinCard)", () => {
  it("countAdvisories — 종류·단계·뭍/바다별, 많은 것부터(같으면 종류 이름 순), 해제는 세지 않음, 시연 시나리오는 따로", () => {
    const a = (type: string, level: Advisory["level"], area: string, over: Partial<Advisory> = {}): Advisory => ({ id: `${type}${level}${area}`, type, level, area, issuedAt: now, status: "발효", ...over });
    const c = countAdvisories([
      a("강풍", "주의보", "부산"), a("호우", "경보", "부산"), a("호우", "경보", "울산"), a("강풍", "주의보", "남해동부앞바다"),
      a("호우", "경보", "경상남도(김해, 양산)"), a("한파", "주의보", "서울", { status: "해제" }), a("호우", "경보", "부산", { scenario: true, id: "SCN" }),
    ]);
    expect(c.map((x) => [advLabel(x), x.sea, x.scenario, x.count])).toEqual([
      ["호우경보", false, false, 3], ["강풍주의보", false, false, 1], ["강풍주의보", true, false, 1], ["호우경보", false, true, 1],
    ]);
  });

  it("parseStatusBars — 「o 종류 : 구역, 구역」 줄마다, 이어진 줄은 앞 줄에, 괄호 하나가 구역 하나. 그 꼴이 아니면 빈 목록", () => {
    const t = (sample as { response: { body: { items: { item: { t6: string }[] } } } }).response.body.items.item[0].t6;
    expect(parseStatusBars(t).map((r) => [r.kind, r.areas.length])).toEqual([["강풍주의보", 2], ["풍랑경보", 2], ["한파주의보", 2]]);
    expect(parseStatusBars("o 호우경보 : 부산,\n 울산, 경상남도(김해, 양산)")[0].areas).toEqual(["부산", "울산", "경상남도(김해, 양산)"]);
    expect(parseStatusBars("o 없음")).toEqual([]);
    expect(parseStatusBars("")).toEqual([]);
  });

  it("통보문 카드 — 경보 종류 이름만 빨강(alarm), 막대 길이는 가장 많은 종류 기준", () => {
    const b = { ...rows[0], statusText: "o 호우경보 : 부산, 울산\no 강풍주의보 : 부산" };
    const { container } = render(<BulletinCard b={b} />);
    const bars = [...container.querySelectorAll(".bc-bar")];
    expect(bars.map((x) => x.querySelector(".bc-kind")!.className)).toEqual(["bc-kind bc-kind--alarm", "bc-kind"]);
    expect(bars.map((x) => (x.querySelector(".bc-bar-fill") as HTMLElement).style.width)).toEqual(["100%", "50%"]);
  });
});
