// @vitest-environment jsdom
// 질문 모음 「추천 질문」 갈피 — T3Q-03 이 기준지역(시·도)에 맞춰 준 질문을 받은 그대로(T3Q v0.4.9 · 2026-11-20).
// npx vitest run harness/explore/suggestTab
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseName, basePilot, type BaseRegion } from "@/lib/baseRegion";
import { countMasks, splitMasks } from "@/lib/piiMask";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
const net = vi.hoisted(() => ({ calls: [] as string[], body: {} as unknown, fail: "" }));
vi.mock("@/lib/api", () => ({
  api: async (path: string) => {
    net.calls.push(path);
    if (path.startsWith("/api/t3q/suggested")) {
      if (net.fail) throw new Error(net.fail);
      return net.body;
    }
    return {};
  },
}));

import LibraryDrawer, { suggestGroups } from "@/components/explore/LibraryDrawer";

afterEach(() => {
  cleanup();
  net.calls = [];
  net.fail = "";
});

const SEOGU: BaseRegion = { sido: { code: "30", name: "대전광역시" }, sigungu: { code: "30170", name: "서구" } };
const ITEMS = [
  { question_id: "SQ-RISK-01", group: "RISK_AREA", group_label: "위험·취약지역", data_api: "T3Q-05", text: "대전광역시의 자연재해위험개선지구 중 «가» 등급 지구는 어디인가요?" },
  { question_id: "SQ-FT-01", group: "FLOOD_TRACE", group_label: "침수흔적", data_api: "T3Q-30", text: "2020년 대전광역시의 침수흔적은 어디에 있었나요?" },
  { question_id: "SQ-RISK-02", group: "RISK_AREA", group_label: "위험·취약지역", data_api: "T3Q-05", text: "대전광역시의 급경사지 가운데 붕괴위험지역으로 지정된 곳은?" },
  { question_id: "SQ-X", group: "X", group_label: "빈 글", data_api: "T3Q-05", text: "  " },
];
const drawer = (base: BaseRegion | null, onAskSuggest?: (t: string) => void) => {
  session.s = { cond: { base, region: basePilot(base) } };
  return render(<LibraryDrawer regionName={baseName(base)} onClose={() => {}} onAskDemo={() => {}} onAskSuggest={onAskSuggest} />).container;
};

describe("질문 모음 「추천 질문」", () => {
  it("받은 차례대로 묶음 이름별로 모으고 빈 글은 뺀다", () => {
    expect(suggestGroups(ITEMS).map((g) => [g.label, g.items.map((q) => q.question_id)])).toEqual([
      ["위험·취약지역", ["SQ-RISK-01", "SQ-RISK-02"]],
      ["침수흔적", ["SQ-FT-01"]],
    ]);
  });

  it("갈피를 열면 기준지역 코드를 넘겨 받고, 누르면 받은 글 그대로 묻는다", async () => {
    net.body = { envelope: { result: { capability_set_version: "CQS-152-v0.3", items: ITEMS } } };
    const ask = vi.fn();
    const c = drawer(SEOGU, ask);
    expect(net.calls.some((p) => p.startsWith("/api/t3q/suggested"))).toBe(false); // 열기 전에는 부르지 않는다
    fireEvent.click(screen.getByRole("tab", { name: "추천 질문" }));
    await waitFor(() => expect(c.querySelectorAll(".qlib-q")).toHaveLength(3));
    expect(net.calls).toContain("/api/t3q/suggested?region=30170");
    expect([...c.querySelectorAll(".qlib-stage")].map((h) => h.textContent)).toEqual(["위험·취약지역", "침수흔적"]);
    expect(c.querySelector(".qlib-note")?.textContent).toContain("대전광역시 기준으로 받은 추천 질문");
    fireEvent.click(c.querySelectorAll(".qlib-q")[1]);
    expect(ask).toHaveBeenCalledWith("대전광역시의 급경사지 가운데 붕괴위험지역으로 지정된 곳은?");
  });

  it("기준지역이 전국이면 지역 코드 없이 받는다", async () => {
    net.body = { envelope: { result: { items: ITEMS.slice(0, 1) } } };
    const c = drawer(null, () => {});
    fireEvent.click(screen.getByRole("tab", { name: "추천 질문" }));
    await waitFor(() => expect(c.querySelectorAll(".qlib-q")).toHaveLength(1));
    expect(net.calls).toContain("/api/t3q/suggested");
    expect(c.querySelector(".qlib-note")?.textContent).toContain("전국 기준");
    expect(c.querySelector(".qlib-foot")).toBeNull();
  });

  it("못 받으면 그 사유를, 빈 목록이면 없다고 알린다", async () => {
    net.fail = "추천 질문을 불러오지 못했습니다.";
    const c = drawer(SEOGU, () => {});
    fireEvent.click(screen.getByRole("tab", { name: "추천 질문" }));
    await waitFor(() => expect(c.querySelector(".qlib-empty")?.textContent).toBe("추천 질문을 불러오지 못했습니다."));
    cleanup();
    net.fail = "";
    net.body = {};
    const c2 = drawer(SEOGU, () => {});
    fireEvent.click(screen.getByRole("tab", { name: "추천 질문" }));
    await waitFor(() => expect(c2.querySelector(".qlib-empty")?.textContent).toContain("추천 질문이 없습니다"));
  });

  it("보낼 길(onAskSuggest)이 없으면 갈피를 내지 않는다", () => {
    drawer(SEOGU);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["한눈 요약 질의"]);
  });
});

describe("재난문자 제목의 가림(T3Q 11/20 — «실종유괴(***)»)", () => {
  it("제목·본문·주소 꼬리의 *** 를 모두 가림으로 센다", () => {
    expect(countMasks("실종유괴(***)")).toBe(1);
    expect(countMasks("실종유괴2(***)")).toBe(1);
    expect(splitMasks("관악구에서 주민인 ***(***)을 찾습니다 - *** vo.la/*** /☎182")).toHaveLength(5);
  });
});
