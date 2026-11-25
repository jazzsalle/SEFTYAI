// @vitest-environment jsdom
// 「비가 이만큼 오면」 강우 막대 샘플(김인건 서기관 제안 2026-11-25 — components/map/RainSlider, lib/rainMatch)
// 영천시만 단추가 보이고, 막대를 올리면 그 비보다 적게 와도 119 신고·피해가 있었던 날이 카드로 나온다. 숫자는 T3Q 답 그대로
// npx vitest run harness/map/rainSlider
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchCases, rainSampleFor, reportTotal } from "@/lib/rainMatch";

vi.mock("@/lib/api", () => ({ api: async () => ({ envelope: { result: { features: [] } } }) }));
import RainSlider from "@/components/map/RainSlider";

afterEach(() => cleanup());

describe("rainMatch — 영천 샘플", () => {
  const s = rainSampleFor("yeongcheon")!;
  it("영천만 샘플이 있다", () => {
    expect(s).not.toBeNull();
    expect(rainSampleFor("busan")).toBeNull();
    expect(rainSampleFor("inje")).toBeNull();
  });
  it("일강수량 이하인 날만, 적게 온 날부터", () => {
    expect(matchCases(s.cases, 30)).toEqual([]);
    expect(matchCases(s.cases, 80.8).map((c) => c.date)).toEqual(["2024-07-02", "2024-06-30", "2025-06-21", "2025-07-14", "2025-07-19"]);
    const all = matchCases(s.cases, s.max);
    expect(all).toHaveLength(s.cases.length);
    expect(all.map((c) => c.dayMm)).toEqual([...all.map((c) => c.dayMm)].sort((a, b) => a - b));
  });
  it("119 신고 합 — 2024.7.10.(96.1mm) 78건까지 넣으면 99건", () => {
    expect(reportTotal(matchCases(s.cases, 96.1))).toBe(2 + 1 + 1 + 2 + 15 + 78);
    expect(reportTotal(matchCases(s.cases, s.max))).toBe(2 + 1 + 1 + 2 + 15 + 78 + 2 + 3 + 21);
  });
  it("핀은 법정리 코드(10자리)가 있는 곳만 — 임고면(4723037…)", () => {
    const codes = s.cases.flatMap((c) => [...(c.reports?.pins ?? []), ...c.damages.flatMap((d) => (d.place ? [d.place] : []))]).map((p) => p.code);
    expect(codes.length).toBeGreaterThan(0);
    for (const c of codes) expect(c).toMatch(/^4723037\d{3}$/);
  });
});

describe("RainSlider — 지도 아래 막대", () => {
  it("영천이 아니면 아무것도 없다", () => {
    const { container } = render(<RainSlider map={null} region="busan" />);
    expect(container.textContent).toBe("");
  });
  it("영천 — [비가 이만큼 오면] 누르면 막대, 올리면 카드·합계", () => {
    const { container } = render(<RainSlider map={null} region="yeongcheon" />);
    fireEvent.click(screen.getByRole("button", { name: "비가 이만큼 오면" }));
    expect(container.textContent).toContain("샘플");
    expect(container.querySelector(".rain-sum")!.textContent).toContain("아직 없습니다");
    fireEvent.change(screen.getByRole("slider", { name: "일강수량(mm)" }), { target: { value: "100" } });
    expect(container.querySelector(".rain-sum")!.textContent).toContain("8일");
    expect(container.querySelector(".rain-sum")!.textContent).toContain("119 신고 101건");
    // 가장 가까운 날(2017.7.14. 96.5mm)이 맨 앞 · 진하게
    const cards = [...container.querySelectorAll(".rain-card")];
    expect(cards).toHaveLength(8);
    expect(cards[0].className).toContain("is-top");
    expect(cards[0].textContent).toContain("2017.7.14.");
    expect(container.textContent).toContain("임고면 삼매리 — 선원천 삼매제·선원천 제방 유실(7.20.)");
    expect(container.textContent).not.toMatch(/[A-Za-z]{3,}/); // 화면 글은 한국어만
  });
});
