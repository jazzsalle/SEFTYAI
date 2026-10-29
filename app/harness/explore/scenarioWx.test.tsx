// @vitest-environment jsdom
// 시연 시나리오 특보 화면 표시(R43) — 특보 줄(WxBar: 첫 특보 · 나머지 · [모두 보기] · [특보로 질문]) · AI 모드 창 · AI 모드 띠에 「시연 시나리오」.
// 보일지 말지는 서버(/api/weather)가 정한다(harness/region/scenarioRoute) — 화면은 받은 특보의 scenario 표시만 따른다. 기상청 특보에는 표지가 없다
// npx vitest run harness/explore/scenarioWx
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { BaseRegion } from "@/lib/baseRegion";
import { SCN_REGIONS, SCN_SOURCE, scenarioAdvisories, withScenario, type ScenarioState } from "@/lib/scenario";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefItems: () => [] }));

import { WxBar } from "@/components/AppShell";
import AiModeModal from "@/components/explore/AiModeModal";

afterEach(() => cleanup());

const now = new Date().toISOString();
const ON: ScenarioState = { on: true, regions: SCN_REGIONS, startedAt: new Date(Date.now() - 600_000).toISOString(), until: new Date(Date.now() + 3_600_000).toISOString(), by: "시스템 운영자" };
const KMA: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: now, status: "발효" };
const live = (advisories: Advisory[] = [], ok = true): WeatherResponse => ({ mode: "live", status: { ok, fetchedAt: now, message: ok ? "기상청 06:00 발표" : "기상청 API 연결 실패" }, advisories, preliminary: [] });
const BUSAN: BaseRegion = { sido: { code: "26", name: "부산광역시" } };
const scnFor = (id: string) => scenarioAdvisories(ON, id);

const bar = (weather: WeatherResponse, base: BaseRegion | null = BUSAN) => {
  session.s = { weather, account: { id: "bs_safety01" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
  return render(<WxBar />).container.querySelector(".wxbar")!;
};

describe("특보 줄 — 「시연 시나리오」 표지", () => {
  it("시나리오만 — 첫 특보 이름 옆에 「시연 시나리오」, 시각은 켠 시각", () => {
    const b = bar(withScenario(live(), scnFor("bs_safety01")));
    expect(b.querySelector(".tit")!.textContent).toBe("부산 호우경보 발효 중 시연 시나리오");
    expect(b.querySelector(".tit .scn-tag")!.textContent).toBe("시연 시나리오");
    expect(b.querySelector(".meta")!.textContent).toMatch(/^\d\d:\d\d 켬 · 기상청 \d\d:\d\d 갱신$/);
  });

  it("기상청 특보와 함께 — 나머지 글·[모두 보기]·[특보로 질문] 고르기에 시나리오만 표지", () => {
    const b = bar(withScenario(live([KMA]), scnFor("bs_safety01")));
    // 경보가 먼저(첫 특보 = 시나리오 호우경보), 나머지 = 기상청 강풍주의보(표지 없음)
    expect(b.querySelector(".tit .scn-tag")).not.toBeNull();
    expect(b.querySelector(".more")!.textContent).toBe("· 부산 강풍주의보");
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
    const rows = [...screen.getByRole("list", { name: "발효 중인 특보" }).querySelectorAll("[role=listitem]")];
    expect(rows.map((r) => r.querySelector(".ar")!.textContent)).toEqual(["부산", "부산 시연 시나리오"]);
    expect(rows.map((r) => r.querySelector(".t")!.textContent!.replace(/^.* /, ""))).toEqual(["발표", "켬"]);
    fireEvent.click(screen.getByRole("button", { name: /특보로 질문/ }));
    const menu = [...screen.getByRole("menu").querySelectorAll("[role=menuitem]")];
    expect(menu.map((m) => !!m.querySelector(".scn-tag"))).toEqual([true, false]);
  });

  it("나머지 글로 잇는 시나리오 특보는 「(시연 시나리오)」", () => {
    const strong: Advisory = { ...KMA, id: "KMA-태풍경보-부산", type: "태풍", level: "경보" };
    const b = bar(withScenario(live([strong]), scnFor("bs_safety01")));
    expect(b.querySelector(".tit .scn-tag")).toBeNull();
    expect(b.querySelector(".more")!.textContent).toBe("· 부산 호우경보 (시연 시나리오)");
  });

  it("기상청 조회 실패여도 시나리오는 보이고 실패는 갱신 줄에", () => {
    const b = bar(withScenario(live([], false), scnFor("bs_safety01")));
    expect(b.querySelector(".tag")!.textContent).not.toContain("조회 실패");
    expect(b.querySelector(".tit")!.textContent).toContain("시연 시나리오");
    expect(b.querySelector(".meta")!.textContent).toContain("기상청 API 연결 실패");
  });

  it("시나리오가 없으면(다른 계정·꺼짐 — 서버가 넣지 않음) 표지도 없다", () => {
    const b = bar(withScenario(live([KMA]), scenarioAdvisories(ON, "mois_dsd01")));
    expect(b.textContent).not.toContain("시연 시나리오");
    expect(b.querySelector(".scn-tag")).toBeNull();
  });

  it("인제·영천 — 시연 계정 기준지역에서 그 지역 시나리오가 보인다", () => {
    const b1 = bar(withScenario(live(), scnFor("ij_safety01")), { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } });
    expect(b1.querySelector(".tit")!.textContent).toBe("강원도(인제평지, 인제산지) 호우주의보 발효 중 시연 시나리오");
    cleanup();
    const b2 = bar(withScenario(live(), scnFor("yc_safety02")), { sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } });
    expect(b2.querySelector(".tit")!.textContent).toBe("경상북도(영천) 호우경보 발효 중 시연 시나리오");
  });
});

describe("AI 모드 창·띠 — 「시연 시나리오」, 점검 질의에는 시나리오 출처", () => {
  it("창의 특보 이름 옆 표지 · 「켬 · 시연 시나리오」 · 점검 질의 weather_warnings source · 접은 띠의 이름", async () => {
    const submit = vi.fn(async () => ({ id: "j1", created_at: now }));
    session.s = {
      weather: withScenario(live(), scnFor("bs_safety01")), account: { id: "bs_safety01" }, cond: { base: BUSAN },
      submit, jobs: {}, full: {}, loadFull: () => {}, toast: () => {}, setAimOn: () => {},
    };
    const { container } = render(<AiModeModal />);
    await act(async () => {});
    const card = container.querySelector(".aim-card")!;
    expect(card.querySelector(".scn-tag")!.textContent).toBe("시연 시나리오");
    expect(card.textContent).toContain("켬 · 시연 시나리오");
    expect(card.textContent).not.toContain("발표 · 기상청");
    expect(submit).toHaveBeenCalledTimes(1);
    const arg = (submit.mock.calls[0] as unknown as [{ question: string; source: string; warnings: { source: string; items: { warning_key: string }[] } }])[0];
    expect(arg.source).toBe("AI_MODE");
    expect(arg.question.startsWith("제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오.")).toBe(true); // 점검 질의 글 그대로(R36)
    expect(arg.warnings.source).toBe(SCN_SOURCE);
    expect(arg.warnings.items.map((i) => i.warning_key)).toEqual(["SCN-BS-1"]);
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(container.querySelector(".aim-bar .aim-w")!.textContent).toBe("호우경보 (시연 시나리오)");
  });

  it("기상청 특보만이면 표지 없이 「발표 · 기상청」", async () => {
    session.s = {
      weather: live([KMA]), account: { id: "bs_safety01" }, cond: { base: BUSAN },
      submit: vi.fn(async () => ({ id: "j2", created_at: now })), jobs: {}, full: {}, loadFull: () => {}, toast: () => {}, setAimOn: () => {},
    };
    const { container } = render(<AiModeModal />);
    await act(async () => {});
    expect(container.querySelector(".scn-tag")).toBeNull();
    expect(container.querySelector(".aim-card")!.textContent).toContain("발표 · 기상청");
  });
});
