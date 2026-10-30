// @vitest-environment jsdom
// 질문 모음·시작 화면 — 시·도까지만 고른 기준지역에서도 인제·영천 질문(R48 — lib/baseRegion baseQuestionPilot).
// 강원특별자치도 = 인제, 경상북도 = 영천. 그 도의 다른 시·군(춘천시 등)은 지금처럼 지역 질문 없음. 보낼 때 기준지역은 화면 값 그대로(묶음 항목은 안내 줄)
// npx vitest run harness/explore/libraryPilot
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseName, basePilot, type BaseRegion } from "@/lib/baseRegion";
import { demoFor, fillText, libById, type DemoItem, type LibraryQuestion } from "@/lib/library";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("@/lib/briefing", async (orig) => ({ ...(await orig<typeof import("@/lib/briefing")>()), useRandomBrief: () => [] }));

import LibraryDrawer from "@/components/explore/LibraryDrawer";
import StartScreen from "@/components/explore/StartScreen";

afterEach(() => cleanup());

const GANGWON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: null };
const INJE: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } };
const CHUNCHEON: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51110", name: "춘천시" } };
const GYEONGBUK: BaseRegion = { sido: { code: "47", name: "경상북도" } };

const drawer = (base: BaseRegion, onAskDemo: (d: DemoItem) => void = () => {}) => {
  session.s = { cond: { base, region: basePilot(base) } };
  return render(<LibraryDrawer regionName={baseName(base)} onClose={() => {}} onAsk={() => {}} onAskMany={() => {}} onAskT3q={() => {}} onAskDemo={onAskDemo} />).container;
};
const dayTitles = (c: HTMLElement) => [...c.querySelectorAll(".day-btn b")].map((b) => b.textContent);
const libTexts = (c: HTMLElement) => [...c.querySelectorAll(".lib-q > button.lnk")].map((b) => b.textContent);

describe("질문 모음 — 시·도까지만 고른 기준지역(R48)", () => {
  it("강원특별자치도 → 인제 「재난담당자의 하루」 전부 + 항목마다 기대 기준지역 안내, 지역 질문에 인제 문항", () => {
    const ask = vi.fn();
    const c = drawer(GANGWON, ask);
    fireEvent.click(screen.getByRole("button", { name: "재난담당자의 하루" }));
    expect(dayTitles(c)).toEqual(demoFor("inje").map((d) => d.title));
    expect(c.textContent).not.toContain("이 기준지역의 질문이 없습니다");
    const notes = [...c.querySelectorAll(".day-q .xs.muted")].map((x) => x.textContent).filter((t) => t?.startsWith("기준지역 "));
    expect(notes).toHaveLength(demoFor("inje").length);
    for (const t of notes) expect(t).toBe("기준지역 강원특별자치도 인제군에서 보내는 질문입니다. 지금 기준지역은 강원특별자치도입니다.");
    fireEvent.click(c.querySelector(".day-btn")!);
    expect((ask.mock.calls[0][0] as DemoItem).id).toBe("DD-IJ-01");

    fireEvent.click(screen.getByRole("button", { name: "지역 질문(업무단계)" }));
    const texts = libTexts(c);
    expect(texts).toContain((libById("IJ-01") as LibraryQuestion).text); // 인제 문항(글에 「인제군」)
    expect(texts).toContain(fillText(libById("LB-RISK-01")!, "강원특별자치도")); // 공통 문항의 {지역} = 기준지역 이름 그대로
    expect(texts.some((t) => t?.includes("영천시") || t?.includes("부산광역시"))).toBe(false);
  });

  it("경상북도 → 영천 「재난담당자의 하루」 전부, 지역 질문에 영천 문항", () => {
    const c = drawer(GYEONGBUK);
    fireEvent.click(screen.getByRole("button", { name: "재난담당자의 하루" }));
    expect(dayTitles(c)).toEqual(demoFor("yeongcheon").map((d) => d.title));
    fireEvent.click(screen.getByRole("button", { name: "지역 질문(업무단계)" }));
    expect(libTexts(c)).toContain((libById("YC-01") as LibraryQuestion).text);
  });

  it("강원특별자치도 인제군 → 지금과 같음(안내 줄 없음) · 강원특별자치도 춘천시 → 지역 질문 없음(지금과 같음)", () => {
    let c = drawer(INJE);
    fireEvent.click(screen.getByRole("button", { name: "재난담당자의 하루" }));
    expect(dayTitles(c)).toEqual(demoFor("inje").map((d) => d.title));
    expect(c.textContent).not.toContain("에서 보내는 질문입니다");
    cleanup();
    c = drawer(CHUNCHEON);
    fireEvent.click(screen.getByRole("button", { name: "재난담당자의 하루" }));
    expect(dayTitles(c)).toEqual([]);
    expect(c.textContent).toContain("이 기준지역의 질문이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "지역 질문(업무단계)" }));
    expect(libTexts(c)).not.toContain((libById("IJ-01") as LibraryQuestion).text);
  });
});

describe("시작 화면 질문 타일 — 시·도까지만 고른 기준지역(R48)", () => {
  const tiles = (base: BaseRegion) => {
    session.s = { cond: { base, region: basePilot(base) } };
    const c = render(<StartScreen regionName={baseName(base)} onBriefing={() => {}} onAskBrief={() => {}} onAskLib={() => {}} />).container;
    return [...c.querySelectorAll(".tile-q")].map((x) => x.textContent);
  };
  it("경상북도 → 영천 문항이 먼저, 강원특별자치도 → 인제 문항이 먼저", () => {
    expect(tiles(GYEONGBUK)[0]).toBe((libById("YC-01") as LibraryQuestion).text);
    cleanup();
    expect(tiles(GANGWON)[0]).toBe((libById("IJ-01") as LibraryQuestion).text);
  });
});
