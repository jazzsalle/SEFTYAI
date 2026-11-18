// @vitest-environment jsdom
// 시연 시나리오 특보 화면 표시(R43) — 특보 줄(WxBar: 첫 특보 · [특보로 질문]) · AI 모드 창에 「시연 시나리오」(점검 질의의 시나리오 특보는 harness/jobs/aiMode).
// 켠 동안 시연 계정은 기상청 실시간 특보를 받지 않는다(R45 — 서버가 시나리오 특보만 · realtimeCut): 갱신 칸 「HH:MM 켬 · 기상청 실시간 특보 끊음」,
// 기준지역이 시나리오 구역 밖이면 「특보 없음 · …에 발효 중인 기상특보가 없습니다」라고 하지 않고 끊김을 알린다(회색 — 갱신 칸 「기상청 실시간 특보 끊음」).
// 머리줄 AI 모드 단추 색(lib/wxref aimTone) — 끊긴 계정에 덮는 특보가 없으면 회색
// 보일지 말지는 서버(/api/weather)가 정한다(harness/region/scenarioRoute) — 화면은 받은 응답의 scenario·realtimeCut 표시만 따른다. 기상청 특보에는 표지가 없다
// npx vitest run harness/explore/scenarioWx
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { BaseRegion } from "@/lib/baseRegion";
import { SCN_REGIONS, scenarioWeather, type ScenarioState } from "@/lib/scenario";
import { aimTone } from "@/lib/wxref";
import { HELP_SECTIONS } from "@/lib/help";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefItems: () => [], useBriefingSet: () => ({ items: [], checked: [], loaded: true }) }));

import { WxBar } from "@/components/AppShell";
import AiModeModal from "@/components/explore/AiModeModal";

afterEach(() => cleanup());

const now = new Date().toISOString();
const ON: ScenarioState = { on: true, regions: SCN_REGIONS, startedAt: new Date(Date.now() - 600_000).toISOString(), until: new Date(Date.now() + 3_600_000).toISOString(), by: "시스템 운영자" };
const KMA: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: now, status: "발효" };
const live = (advisories: Advisory[] = [], ok = true): WeatherResponse => ({ mode: "live", status: { ok, fetchedAt: now, message: ok ? "기상청 06:00 발표" : "기상청 API 연결 실패" }, advisories, preliminary: [] });
const BUSAN: BaseRegion = { sido: { code: "26", name: "부산광역시" } };
const SEOUL: BaseRegion = { sido: { code: "11", name: "서울특별시" } };
/** 그 계정이 받는 끊긴 응답(서버 weatherFor 와 같은 계산) */
const cutOf = (id: string) => scenarioWeather(ON, id, Date.parse(now))!;
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const bar = (weather: WeatherResponse, base: BaseRegion | null = BUSAN, setWxRef: (a: Advisory | null) => void = () => {}) => {
  session.s = { weather, account: { id: "busan" }, cond: { base }, wxRef: null, setWxRef, aimOn: false };
  return render(<WxBar />).container.querySelector(".wxbar")!;
};

describe("특보 줄 — 시연 시나리오 특보도 표지 없이 진짜 특보처럼(개발서버 AlertBanner 가상 특보 override, 2026-11-19 「개발서버와 동일하게」)", () => {
  it("시나리오 특보 — 표지·「끊음」 없이 「{구역} {특보} 발표」(예비특보), 갱신 칸 = 「HH:MM 발표 · 기상청 HH:MM 갱신」", () => {
    const b = bar(cutOf("busan"));
    expect(b.querySelector(".tit")!.textContent).toBe("부산 호우예비특보 발표");
    expect(b.querySelector(".scn-tag")).toBeNull();
    expect(b.querySelector(".meta")!.textContent).toBe(`${hm(ON.startedAt!)} 발표 · 기상청 ${hm(now)} 갱신`);
    expect(b.textContent).not.toMatch(/시연 시나리오|끊음/);
  });

  it("기준지역을 시나리오 구역 밖으로 바꾸면 — 「특보 없음」 · 「발효 중인 기상특보가 없습니다」(표지 없음)", () => {
    const b = bar(cutOf("busan"), SEOUL);
    expect(b.querySelector(".tag")!.textContent).toBe("특보 없음");
    expect(b.querySelector(".tit")!.textContent).toBe("발효 중인 기상특보가 없습니다");
    expect(b.textContent).not.toMatch(/시연 시나리오|끊음/);
  });

  it("끊지 않은 계정(다른 계정·꺼짐 — 서버가 기상청 실시간 그대로)은 지금처럼 — 표지·끊음 없이 「기상청 HH:MM 갱신」 · 「특보 없음」", () => {
    const b = bar(live([KMA]));
    expect(b.textContent).not.toContain("시연 시나리오");
    expect(b.textContent).not.toContain("끊음");
    expect(b.querySelector(".meta")!.textContent).toMatch(/· 기상청 \d\d:\d\d 갱신$/);
    cleanup();
    const n = bar(live(), SEOUL);
    expect(n.querySelector(".tag")!.textContent).toBe("특보 없음");
    expect(n.querySelector(".tit")!.textContent).toBe("발효 중인 기상특보가 없습니다"); // 개발서버 AlertBanner — 지역 이름 없이
    cleanup();
    const f = bar(live([], false));
    expect(f.querySelector(".tag")!.textContent).toBe(" 특보"); // 개발서버 — 회색 「특보」 표지
    expect(f.querySelector(".tit")!.textContent).toBe("기상특보를 불러오지 못했습니다.");
  });

  it("인제·영천 — 시연 계정 기준지역에서 그 지역 시나리오가 보인다", () => {
    const b1 = bar(cutOf("inje"), { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } });
    expect(b1.querySelector(".tit")!.textContent).toBe("강원도(인제평지, 인제산지) 호우주의보 발효 중");
    expect(b1.querySelector(".meta")!.textContent).not.toContain("끊음");
    cleanup();
    const b2 = bar(cutOf("01000"), { sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } });
    expect(b2.querySelector(".tit")!.textContent).toBe("경상북도(영천) 호우경보 발효 중");
  });
});

const aimApi = vi.hoisted(() => ({ resp: null as unknown, calls: [] as string[] }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: async (path: string) => {
    aimApi.calls.push(path);
    return aimApi.resp;
  },
}));

describe("AI 모드 창 — 「시연 시나리오」 표지 · 끊김 표시(R45 · R52)", () => {
  const view = (warnings: unknown[]) => ({
    supported: true, managed: false, running: false,
    view: { checkId: "AIM-1", adminCode: "2600000000", regionName: "부산광역시", triggerType: "FIRST", status: "DONE", noWarningMessage: null,
      guides: [{ sortNo: 0, warningKey: "SCN-BS-PRE-1", kind: "호우", level: "예비특보", areaName: "부산", message: "하천변 산책로 통제를 확인하십시오." }],
      warnings, collectStatus: "SUCCESS", checkedDe: now, lastCheckDe: now, nextCheckDe: now },
  });
  it("시나리오 특보 카드 — 개발서버처럼 「시연 시나리오」 표지·「기상청 실시간 특보 끊음」 없이, AI 안내 = 그 특보 답", async () => {
    session.s = { weather: cutOf("busan"), account: { id: "busan" }, cond: { base: BUSAN }, setAimOn: () => {} };
    aimApi.resp = view([{ warningKey: "SCN-BS-PRE-1", kind: "호우", level: "예비특보", areaName: "부산", effectiveDe: ON.startedAt, changeType: null, scenario: true }]);
    const { container } = render(<AiModeModal open onClose={() => {}} />);
    await act(async () => {});
    expect(container.querySelector(".scn-tag")).toBeNull();
    expect(container.textContent).not.toContain("시연 시나리오");
    expect(container.querySelector(".aimx-when")!.textContent).not.toContain("끊음");
    expect(container.querySelector(".aimx-guide")!.textContent).toBe("하천변 산책로 통제를 확인하십시오.");
  });

  it("기상청 특보만이면(끊지 않은 계정) 표지·끊김 없음", async () => {
    session.s = { weather: live([KMA]), account: { id: "busan" }, cond: { base: BUSAN }, setAimOn: () => {} };
    aimApi.resp = view([{ warningKey: KMA.id, kind: "강풍", level: "주의보", areaName: "부산", effectiveDe: now, changeType: null }]);
    const { container } = render(<AiModeModal open onClose={() => {}} />);
    await act(async () => {});
    expect(container.querySelector(".scn-tag")).toBeNull();
    expect(container.textContent).not.toContain("끊음");
    expect(container.querySelector(".aimx-guide")!.textContent).toBe("이 특보에 대한 별도 안내가 없습니다.");
  });

  it("머리줄 AI 모드 단추 색 — 끊긴 계정에 덮는 특보가 없으면 녹색이 아니라 회색, 덮는 시나리오 특보가 있으면 단계 색", () => {
    const cut = cutOf("busan");
    expect(aimTone(cut, [])).toBe("gray");
    expect(aimTone(cut, cut.advisories)).toBe("yellow"); // 부산 호우 예비특보(2026-11-02)
    expect(aimTone(cutOf("inje"), cutOf("inje").advisories)).toBe("yellow"); // 인제 호우주의보
    // 끊지 않은 계정 — 지금 그대로(특보 없음 녹색 · 조회 실패 회색 · 아직 못 받음 녹색)
    expect(aimTone(live(), [])).toBe("green");
    expect(aimTone(live([KMA]), [KMA])).toBe("yellow");
    expect(aimTone(live([], false), [])).toBe("gray");
    expect(aimTone(null, [])).toBe("green");
  });
});

describe("도움말 — AI 모드(R46)", () => {
  it("도움말 — AI 모드 항목이 「모든 질문에 자동 반영」이라 하지 않는다(글은 개발서버 helpContent — R60)", () => {
    const text = HELP_SECTIONS.filter((t) => t.id === "aimode").flatMap((t) => t.lines).join(" ");
    expect(text).not.toContain("자동으로 반영");
    expect(text).toContain("기준지역의 기상특보를 10분마다 확인하고 상황을 안내합니다");
  });
});
