// @vitest-environment jsdom
// 질문 모음·시작 화면 — 시·도까지만 고른 기준지역에서도 인제·영천 질문(R48 — lib/baseRegion baseQuestionPilot).
// 강원특별자치도 = 인제, 경상북도 = 영천. 그 도의 다른 시·군(춘천시 등)은 지금처럼 지역 질문 없음. 보낼 때 기준지역은 화면 값 그대로(묶음 항목은 안내 줄)
// npx vitest run harness/explore/libraryPilot
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseName, basePilot, type BaseRegion } from "@/lib/baseRegion";
import { dayItemsFor, DEMO_SHOW, fillText, libById, type DemoItem, type LibraryQuestion } from "@/lib/library";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
// 받아 둔 답 — SH-1-1 · IG-IJ-02 만 있다고 둔다(개발서버 ai_demo_pin 의 received_at 자리)
const pins = vi.hoisted(() => ({ v: {} as Record<string, unknown> }));
vi.mock("@/lib/api", () => ({ api: async (path: string) => (path === "/api/demo-pins" ? { pins: pins.v } : {}) }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useBriefingSet: () => ({ items: [], checked: [], loaded: true }) }));

import LibraryDrawer from "@/components/explore/LibraryDrawer";
import StartScreen from "@/components/explore/StartScreen";

afterEach(() => cleanup());

const GANGWON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: null };
const INJE: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } };
const CHUNCHEON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51110", name: "춘천시" } };
const GYEONGBUK: BaseRegion = { sido: { code: "47", name: "경상북도" } };

const drawer = (base: BaseRegion, onAskDemo: (d: DemoItem) => void = () => {}, onAskShow?: (ds: DemoItem[]) => void) => {
  session.s = { cond: { base, region: basePilot(base) } };
  return render(<LibraryDrawer regionName={baseName(base)} onClose={() => {}} onAsk={() => {}} onAskMany={() => {}} onAskDemo={onAskDemo} onAskShow={onAskShow} />).container;
};
const dayTitles = (c: HTMLElement) => [...c.querySelectorAll(".day-btn b")].map((b) => b.textContent);
const libTexts = (c: HTMLElement) => [...c.querySelectorAll(".lib-q > button.lnk")].map((b) => b.textContent);

describe("질문 모음 — 시·도까지만 고른 기준지역(R48)", () => {
  it("강원특별자치도 → 인제 「한눈 요약 질의」 전부(개발서버 dayScript 와 같은 차례), 지역 질문에 인제 문항", () => {
    const ask = vi.fn();
    const c = drawer(GANGWON, ask);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual(dayItemsFor("inje").map((d) => d.title));
    expect(dayItemsFor("inje").map((d) => d.id)).toEqual(["IG-IJ-01", "IG-IJ-02", "IG-IJ-03", "IG-IJ-04", "IG-IJ-05", "IG-IJ-06", "IG-IJ-07", "DD-IJ-04", "DD-IJ-05", "DD-IJ-07-R"]);
    expect(c.textContent).not.toContain("한눈 요약 질의가 없습니다");
    fireEvent.click(c.querySelector(".day-btn")!);
    expect((ask.mock.calls[0][0] as DemoItem).id).toBe("IG-IJ-01"); // 받아 둔 답 없음 → 그 자리에서 묻는다

    fireEvent.click(screen.getByRole("tab", { name: "지역 질문" }));
    const texts = libTexts(c);
    expect(texts).toContain((libById("IJ-01") as LibraryQuestion).text); // 인제 문항(글에 「인제군」)
    expect(texts).toContain(fillText(libById("LB-RISK-01")!, "강원특별자치도")); // 공통 문항의 {지역} = 기준지역 이름 그대로
    expect(texts.some((t) => t?.includes("영천시") || t?.includes("부산광역시"))).toBe(false);
  });

  it("경상북도 → 영천 「한눈 요약 질의」 전부, 지역 질문에 영천 문항", () => {
    const c = drawer(GYEONGBUK);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual(dayItemsFor("yeongcheon").map((d) => d.title));
    fireEvent.click(screen.getByRole("tab", { name: "지역 질문" }));
    expect(libTexts(c)).toContain((libById("YC-01") as LibraryQuestion).text);
  });

  it("강원특별자치도 인제군 → 지금과 같음(안내 줄 없음) · 강원특별자치도 춘천시 → 지역 질문 없음(지금과 같음)", () => {
    let c = drawer(INJE);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual(dayItemsFor("inje").map((d) => d.title));
    cleanup();
    c = drawer(CHUNCHEON);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    expect(dayTitles(c)).toEqual([]);
    expect(c.textContent).toContain("이 기준지역의 한눈 요약 질의가 없습니다.");
    fireEvent.click(screen.getByRole("tab", { name: "지역 질문" }));
    expect(libTexts(c)).not.toContain((libById("IJ-01") as LibraryQuestion).text);
  });
});

describe("질문 모음 「시연」 — 받아 둔 답이 없는 질문은 회색(개발서버 QuestionLibrary 와 같게)", () => {
  it("SH-1-1 만 받아 둔 답 → 그것만 눌림 · 나머지 회색 · 받기 단추 없음 · 13개(개발서버 시연 13개)", async () => {
    pins.v = { "SH-1-1": { at: "2026-11-05T05:00:00.000Z", jobId: "j1", pending: null } };
    const show = vi.fn();
    const c = drawer({ sido: { code: "26", name: "부산광역시" }, sigungu: null }, () => {}, show);
    fireEvent.click(screen.getByRole("tab", { name: "시연" }));
    await screen.findByText(/저장된 답 · .* 받음/);
    const btns = [...c.querySelectorAll<HTMLButtonElement>(".day-btn")];
    expect(btns).toHaveLength(13);
    expect(btns.map((b) => b.querySelector("b")?.textContent)).toEqual(DEMO_SHOW.map((d) => d.title));
    expect(btns.filter((b) => !b.disabled)).toHaveLength(1);
    expect(c.textContent).not.toContain("다시 받기");
    fireEvent.click(btns[1]); // 회색 — 눌리지 않는다
    fireEvent.click(btns[0]);
    expect(show).toHaveBeenCalledTimes(1);
    expect((show.mock.calls[0][0] as DemoItem[]).map((d) => d.id)).toEqual(["SH-1-1"]);
    pins.v = {};
  });

  it("한눈 요약 질의 — 받아 둔 답이 있으면 그것을(onAskShow), 응답 n/m · 다시 받기·지우기", async () => {
    pins.v = { "IG-IJ-02": { at: "2026-11-05T05:00:00.000Z", jobId: "j2", pending: null } };
    const show = vi.fn();
    const live = vi.fn();
    const c = drawer(INJE, live, show);
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    await screen.findByText(`응답 1/${dayItemsFor("inje").length}`);
    expect(c.textContent).toContain("지우기");
    fireEvent.click(c.querySelectorAll(".day-btn")[1]);
    expect((show.mock.calls[0][0] as DemoItem[]).map((d) => d.id)).toEqual(["IG-IJ-02"]);
    expect(live).not.toHaveBeenCalled();
    pins.v = {};
  });
});

describe("시작 화면 질문 타일 — 시·도까지만 고른 기준지역(R48)", () => {
  const tiles = (base: BaseRegion) => {
    session.s = { cond: { base, region: basePilot(base) } };
    const c = render(<StartScreen regionName={baseName(base)} onBriefing={() => {}} onAskBrief={() => {}} onAskLib={() => {}} />).container;
    return [...c.querySelectorAll(".tile-q")].map((x) => x.textContent);
  };
  it("경상북도 → 영천 문항이 먼저, 강원특별자치도 → 인제 문항이 먼저", () => {
    expect(tiles(GYEONGBUK)[0]).toBe((libById("YC-03") as LibraryQuestion).text);
    cleanup();
    expect(tiles(GANGWON)[0]).toBe((libById("IJ-01") as LibraryQuestion).text);
  });
});
