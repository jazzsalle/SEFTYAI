// @vitest-environment jsdom
// 질문 모음 — 시·도까지만 고른 기준지역에서도 인제·영천 질문(R48 — lib/baseRegion baseQuestionPilot).
// 강원특별자치도 = 인제, 경상북도 = 영천. 그 도의 다른 시·군(춘천시 등)은 지금처럼 지역 질문 없음. 보낼 때 기준지역은 화면 값 그대로(묶음 항목은 안내 줄)
// npx vitest run harness/explore/libraryPilot
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseName, basePilot, type BaseRegion } from "@/lib/baseRegion";
import { dayItemsFor, libById, type DemoItem, type LibraryQuestion } from "@/lib/library";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
// 받아 둔 답 — SH-1-1 · IG-IJ-02 만 있다고 둔다(개발서버 ai_demo_pin 의 received_at 자리)
const pins = vi.hoisted(() => ({ v: {} as Record<string, unknown> }));
vi.mock("@/lib/api", () => ({ api: async (path: string) => (path === "/api/demo-pins" ? { pins: pins.v } : {}) }));
const brief = vi.hoisted(() => ({ v: [] as { id: string; label: string; question: string; checked: boolean }[] }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefingSet: () => ({ items: brief.v, checked: brief.v.filter((x) => x.checked), loaded: true }) }));

import LibraryDrawer from "@/components/explore/LibraryDrawer";
import StartScreen from "@/components/explore/StartScreen";

afterEach(() => cleanup());

const GANGWON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: null };
const INJE: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } };
const CHUNCHEON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51110", name: "춘천시" } };
const GYEONGBUK: BaseRegion = { sido: { code: "47", name: "경상북도" } };

const drawer = (base: BaseRegion, onAskDemo: (d: DemoItem) => void = () => {}) => {
  session.s = { cond: { base, region: basePilot(base) } };
  return render(<LibraryDrawer regionName={baseName(base)} onClose={() => {}} onAskDemo={onAskDemo} />).container;
};
const dayTitles = (c: HTMLElement) => [...c.querySelectorAll(".qlib-day-btn b")].map((b) => b.textContent);

describe("질문 모음 — 시·도까지만 고른 기준지역(R48)", () => {
  it("강원특별자치도 → 인제 「한눈 요약 질의」 전부(개발서버 dayScript 와 같은 차례 + 11/25 실장 보고 2문)", () => {
    const ask = vi.fn();
    const c = drawer(GANGWON, ask);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual(dayItemsFor("inje").map((d) => d.title));
    expect(dayItemsFor("inje").map((d) => d.id)).toEqual(["IG-IJ-01", "IG-IJ-02", "IG-IJ-03", "IG-IJ-04", "IG-IJ-05", "IG-IJ-06", "IG-IJ-07", "IG-IJ-08", "IG-IJ-09", "DD-IJ-04", "DD-IJ-05", "DD-IJ-07-R"]);
    expect(c.textContent).not.toContain("한눈 요약 질의가 없습니다");
    fireEvent.click(c.querySelector(".qlib-day-btn")!);
    expect((ask.mock.calls[0][0] as DemoItem).id).toBe("IG-IJ-01"); // 질문 글만 묻는다
  });

  it("경상북도 → 영천 「한눈 요약 질의」 전부", () => {
    const c = drawer(GYEONGBUK);
    expect(dayTitles(c)).toEqual(dayItemsFor("yeongcheon").map((d) => d.title));
  });

  it("서울특별시 → 서울 「한눈 요약 질의」(2026-11-25 실장 보고)", () => {
    const c = drawer({ sido: { code: "11", name: "서울특별시" } });
    expect(dayItemsFor("seoul").map((d) => d.id)).toEqual(["IG-SE-01", "IG-SE-02", "IG-SE-03", "IG-SE-04", "IG-SE-05"]);
    expect(dayTitles(c)).toEqual(dayItemsFor("seoul").map((d) => d.title));
  });

  it("강원특별자치도 인제군 → 지금과 같음(안내 줄 없음) · 강원특별자치도 춘천시 → 한눈 요약 질의 없음", () => {
    let c = drawer(INJE);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual(dayItemsFor("inje").map((d) => d.title));
    cleanup();
    c = drawer(CHUNCHEON);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual([]);
    expect(c.textContent).toContain("이 기준지역의 한눈 요약 질의가 없습니다.");
  });
});

describe("질문 모음 — 「시연」 갈피 없음 · 한눈 요약 질의는 질문 글만(R62 — 개발서버 256e5ec·352a97c)", () => {
  it("갈피는 「한눈 요약 질의」 하나(지역 질문 갈피는 사용자 지시 2026-11-24로 뺌) — 「시연」·[이 묶음 차례로 보내기] 없음", () => {
    drawer({ sido: { code: "26", name: "부산광역시" }, sigungu: null });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["한눈 요약 질의"]);
    expect(screen.queryByText("이 묶음 차례로 보내기")).toBeNull();
  });

  it("한눈 요약 질의 — 받아 둔 답이 있어도 질문만 묻는다(onAskDemo), 응답 n/m · 다시 받기·지우기는 그대로", async () => {
    pins.v = { "IG-IJ-02": { at: "2026-11-05T05:00:00.000Z", jobId: "j2", pending: null } };
    const live = vi.fn();
    const c = drawer(INJE, live);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    await screen.findByText(`응답 1/${dayItemsFor("inje").length}`);
    expect(c.textContent).toContain("지우기");
    expect(c.textContent).not.toContain("붙는 조건");
    fireEvent.click(c.querySelectorAll(".qlib-day-btn")[1]);
    expect((live.mock.calls[0][0] as DemoItem).id).toBe("IG-IJ-02");
    pins.v = {};
  });
});

describe("시작 화면 — 개발서버 StartGuide 그대로(R53)", () => {
  it("타일은 브리핑 항목만(지역 질문 타일 없음), 누르면 보내지 않고 질문 칸에 넣을 글을 넘긴다", () => {
    brief.v = [
      { id: "a", label: "위험·취약지역", question: "{지역}에서 먼저 점검할 곳은?", checked: true },
      { id: "b", label: "침수 이력", question: "최근 침수 이력은?", checked: false },
    ];
    session.s = { cond: { base: GYEONGBUK, region: basePilot(GYEONGBUK) } };
    const pick = vi.fn();
    const c = render(<StartScreen regionName={baseName(GYEONGBUK)} onBriefing={() => {}} onPick={pick} />).container;
    expect([...c.querySelectorAll(".tile-q")].map((x) => x.textContent)).toEqual(["{지역}에서 먼저 점검할 곳은?", "최근 침수 이력은?"]); // 개발서버 StartGuide — 등록한 글 그대로
    expect(c.textContent).not.toContain((libById("YC-03") as LibraryQuestion).text);
    fireEvent.click(c.querySelectorAll(".tile")[1]);
    expect(pick).toHaveBeenCalledWith("최근 침수 이력은?");
    expect(c.textContent).toContain("브리핑 세트 1개 항목");
    brief.v = [];
  });
  it("항목이 없으면 「등록된 브리핑 항목이 없습니다.」", () => {
    session.s = { cond: { base: GANGWON, region: basePilot(GANGWON) } };
    const c = render(<StartScreen regionName={baseName(GANGWON)} onBriefing={() => {}} onPick={() => {}} />).container;
    expect(c.textContent).toContain("등록된 브리핑 항목이 없습니다.");
  });
});
