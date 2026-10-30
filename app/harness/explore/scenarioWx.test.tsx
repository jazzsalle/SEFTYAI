// @vitest-environment jsdom
// 시연 시나리오 특보 화면 표시(R43) — 특보 줄(WxBar: 첫 특보 · [특보로 질문]) · AI 모드 창 · AI 모드 띠에 「시연 시나리오」.
// 켠 동안 시연 계정은 기상청 실시간 특보를 받지 않는다(R45 — 서버가 시나리오 특보만 · realtimeCut): 갱신 칸 「HH:MM 켬 · 기상청 실시간 특보 끊음」,
// 기준지역이 시나리오 구역 밖이면 「특보 없음 · …에 발효 중인 기상특보가 없습니다」라고 하지 않고 끊김을 알린다(회색 — 갱신 칸 「기상청 실시간 특보 끊음」).
// 머리줄 AI 모드 단추 색(lib/wxref aimTone) — 끊긴 계정에 덮는 특보가 없으면 회색
// 보일지 말지는 서버(/api/weather)가 정한다(harness/region/scenarioRoute) — 화면은 받은 응답의 scenario·realtimeCut 표시만 따른다. 기상청 특보에는 표지가 없다
// npx vitest run harness/explore/scenarioWx
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { BaseRegion } from "@/lib/baseRegion";
import { SCN_REGIONS, SCN_SOURCE, scenarioWeather, type ScenarioState } from "@/lib/scenario";
import { aimTone } from "@/lib/wxref";
import { HELP_TOPICS } from "@/lib/help";

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
const SEOUL: BaseRegion = { sido: { code: "11", name: "서울특별시" } };
/** 그 계정이 받는 끊긴 응답(서버 weatherFor 와 같은 계산) */
const cutOf = (id: string) => scenarioWeather(ON, id, Date.parse(now))!;
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const bar = (weather: WeatherResponse, base: BaseRegion | null = BUSAN, setWxRef: (a: Advisory | null) => void = () => {}) => {
  session.s = { weather, account: { id: "bs_safety01" }, cond: { base }, wxRef: null, setWxRef, aimOn: false };
  return render(<WxBar />).container.querySelector(".wxbar")!;
};

describe("특보 줄 — 「시연 시나리오」 표지 · 기상청 실시간 특보 끊음(R45)", () => {
  it("시나리오 특보 — 이름 옆에 「시연 시나리오」, 갱신 칸 = 「HH:MM 켬 · 기상청 실시간 특보 끊음」(기상청 시각 없음)", () => {
    const b = bar(cutOf("bs_safety01"));
    expect(b.querySelector(".tit")!.textContent).toBe("부산 호우경보 발효 중 시연 시나리오");
    expect(b.querySelector(".tit .scn-tag")!.textContent).toBe("시연 시나리오");
    expect(b.querySelector(".meta")!.textContent).toBe(`${hm(ON.startedAt!)} 켬 · 기상청 실시간 특보 끊음`);
    expect(b.textContent).not.toMatch(/기상청 \d\d:\d\d (갱신|발표)|조회 \d\d:\d\d/);
  });

  it("[특보로 질문] — 시나리오 특보 하나를 바로 참조로 건다", () => {
    const set = vi.fn();
    bar(cutOf("bs_safety01"), BUSAN, set);
    fireEvent.click(screen.getByRole("button", { name: /특보로 질문/ }));
    expect(set).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0][0] as Advisory).id).toBe("SCN-BS-1");
  });

  it("기준지역을 시나리오 구역 밖으로 바꾸면 — 「실시간 끊음」(회색) · 「…에는 시연 시나리오 특보가 없습니다」 · 「특보 없음」·「발효 중인 기상특보가 없습니다」 없음", () => {
    const b = bar(cutOf("bs_safety01"), SEOUL);
    const tag = b.querySelector(".tag")!;
    expect(tag.textContent).toBe("실시간 끊음");
    expect(tag.className).toBe("tag fail"); // 회색(빨강·녹색 아님)
    expect(b.querySelector(".tit")!.textContent).toBe("서울특별시에는 시연 시나리오 특보가 없습니다");
    // 이 줄에는 특보가 없어 「HH:MM 켬」을 붙이지 않는다(무엇을 켰는지 읽히지 않음)
    expect(b.querySelector(".meta")!.textContent).toBe("기상청 실시간 특보 끊음");
    expect(b.textContent).not.toContain("특보 없음");
    expect(b.textContent).not.toContain("발효 중인 기상특보가 없습니다");
    expect(b.querySelector(".scn-tag")).toBeNull();
  });

  it("끊지 않은 계정(다른 계정·꺼짐 — 서버가 기상청 실시간 그대로)은 지금처럼 — 표지·끊음 없이 「기상청 HH:MM 갱신」 · 「특보 없음」", () => {
    const b = bar(live([KMA]));
    expect(b.textContent).not.toContain("시연 시나리오");
    expect(b.textContent).not.toContain("끊음");
    expect(b.querySelector(".meta")!.textContent).toMatch(/· 기상청 \d\d:\d\d 갱신$/);
    cleanup();
    const n = bar(live(), SEOUL);
    expect(n.querySelector(".tag")!.textContent).toBe("특보 없음");
    expect(n.querySelector(".tit")!.textContent).toBe("서울특별시에 발효 중인 기상특보가 없습니다");
    cleanup();
    const f = bar(live([], false));
    expect(f.querySelector(".tag")!.textContent).toBe("조회 실패");
  });

  it("인제·영천 — 시연 계정 기준지역에서 그 지역 시나리오가 보인다", () => {
    const b1 = bar(cutOf("ij_safety01"), { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } });
    expect(b1.querySelector(".tit")!.textContent).toBe("강원도(인제평지, 인제산지) 호우주의보 발효 중 시연 시나리오");
    expect(b1.querySelector(".meta")!.textContent).toContain("기상청 실시간 특보 끊음");
    cleanup();
    const b2 = bar(cutOf("yc_safety02"), { sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } });
    expect(b2.querySelector(".tit")!.textContent).toBe("경상북도(영천) 호우경보 발효 중 시연 시나리오");
  });
});

const aimSession = (weather: WeatherResponse, base: BaseRegion, submit = vi.fn(async () => ({ id: "j1", created_at: now }))) => {
  session.s = { weather, account: { id: "bs_safety01" }, cond: { base }, submit, jobs: {}, full: {}, loadFull: () => {}, toast: () => {}, setAimOn: () => {} };
  return submit;
};
type AimArg = { question: string; source: string; warnings: { source: string; collect_status: string; collected_at: string; items: { warning_key: string }[] } };

describe("AI 모드 창·띠 — 「시연 시나리오」, 점검 질의에는 시나리오 출처 · 끊김 표시(R45)", () => {
  it("창의 특보 이름 옆 표지 · 「켬 · 시연 시나리오 · 기상청 실시간 특보 끊음」 · 점검 질의 weather_warnings · 접은 띠의 이름·끊김", async () => {
    const submit = aimSession(cutOf("bs_safety01"), BUSAN);
    const { container } = render(<AiModeModal />);
    await act(async () => {});
    const card = container.querySelector(".aim-card")!;
    expect(card.querySelector(".scn-tag")!.textContent).toBe("시연 시나리오");
    expect(card.textContent).toContain("켬 · 시연 시나리오 · 기상청 실시간 특보 끊음");
    expect(card.textContent).not.toContain("발표 · 기상청");
    expect(submit).toHaveBeenCalledTimes(1);
    const arg = (submit.mock.calls[0] as unknown as [AimArg])[0];
    expect(arg.source).toBe("AI_MODE");
    expect(arg.question.startsWith("제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오.")).toBe(true); // 점검 질의 글 그대로(R36)
    expect(arg.warnings.source).toBe(SCN_SOURCE);
    expect(arg.warnings.collect_status).toBe("COLLECTED");
    expect(arg.warnings.collected_at).toBe(now); // 수집 시각 = 특보 응답을 받은 시각(발표·발효 시각 = 켠 시각)
    expect(arg.warnings.items[0]).toMatchObject({ announced_at: ON.startedAt, effective_at: ON.startedAt });
    expect(arg.warnings.items.map((i) => i.warning_key)).toEqual(["SCN-BS-1"]);
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(container.querySelector(".aim-bar .aim-w")!.textContent).toBe("호우경보 (시연 시나리오)");
    expect(container.querySelector(".aim-bar .aim-t")!.textContent).toMatch(/^기상청 실시간 특보 끊음 · /);
  });

  it("끊긴 계정이 기준지역을 구역 밖으로 — 「서울특별시 시연 시나리오 특보 없음」 · 끊김 · 회색 점, 「발효 특보 없음」 없음 · 질의는 시나리오 출처 빈 목록", async () => {
    const submit = aimSession(cutOf("bs_safety01"), SEOUL);
    const { container } = render(<AiModeModal />);
    await act(async () => {});
    const card = container.querySelector(".aim-card")!;
    expect(card.querySelector("b")!.textContent).toBe("서울특별시 시연 시나리오 특보 없음");
    expect(card.textContent).toContain("기상청 실시간 특보 끊음");
    expect(container.textContent).not.toContain("발효 특보 없음");
    const arg = (submit.mock.calls[0] as unknown as [AimArg])[0];
    expect(arg.warnings).toEqual({ collect_status: "COLLECTED", collected_at: now, source: SCN_SOURCE, items: [] });
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(container.querySelector(".aim-bar .aim-w")!.textContent).toBe("서울특별시 시연 시나리오 특보 없음");
    expect(container.querySelector(".aim-bar .aim-dot")!.className).toContain("st-gray");
  });

  it("머리줄 AI 모드 단추 색 — 끊긴 계정에 덮는 특보가 없으면 녹색이 아니라 회색, 덮는 시나리오 특보가 있으면 단계 색", () => {
    const cut = cutOf("bs_safety01");
    expect(aimTone(cut, [])).toBe("gray");
    expect(aimTone(cut, cut.advisories)).toBe("red"); // 부산 호우경보
    expect(aimTone(cutOf("ij_safety01"), cutOf("ij_safety01").advisories)).toBe("yellow"); // 인제 호우주의보
    // 끊지 않은 계정 — 지금 그대로(특보 없음 녹색 · 조회 실패 회색 · 아직 못 받음 녹색)
    expect(aimTone(live(), [])).toBe("green");
    expect(aimTone(live([KMA]), [KMA])).toBe("yellow");
    expect(aimTone(live([], false), [])).toBe("gray");
    expect(aimTone(null, [])).toBe("green");
  });

  it("기상청 특보만이면(끊지 않은 계정) 표지·끊김 없이 「발표 · 기상청」", async () => {
    aimSession(live([KMA]), BUSAN, vi.fn(async () => ({ id: "j2", created_at: now })));
    const { container } = render(<AiModeModal />);
    await act(async () => {});
    expect(container.querySelector(".scn-tag")).toBeNull();
    expect(container.querySelector(".aim-card")!.textContent).toContain("발표 · 기상청");
    expect(container.textContent).not.toContain("끊음");
  });
});

describe("특보 줄 — AI 모드를 켠 동안 [특보로 질문] 자리(R46 — 표기를 동작에 맞춤)", () => {
  it("「AI 모드 · 브리핑에 특보 반영」 · 누를 수 없음 · 말풍선 = 브리핑 질문에만 특보(「자동 반영」이라 하지 않음)", () => {
    session.s = { weather: cutOf("bs_safety01"), account: { id: "bs_safety01" }, cond: { base: BUSAN }, wxRef: null, setWxRef: () => {}, aimOn: true };
    const { container } = render(<WxBar />);
    const b = screen.getByRole("button", { name: /AI 모드 · 브리핑에 특보 반영/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("AI 모드에서는 브리핑 질문에 현재 특보가 함께 전달됩니다. 직접 쓴 질문에 특보를 걸려면 AI 모드를 끄고 [특보로 질문]을 쓰세요.");
    expect(container.textContent).not.toContain("자동 반영");
  });

  it("도움말 — AI 모드·특보로 질문 항목이 「모든 질문에 자동 반영」이라 하지 않는다", () => {
    const text = HELP_TOPICS.filter((t) => t.id === "aim" || t.id === "wxref").flatMap((t) => t.body).join(" ");
    expect(text).not.toContain("자동으로 반영");
    expect(text).toContain("브리핑 질문에 현재 발효 중인 특보가 함께 전달됩니다");
  });
});
