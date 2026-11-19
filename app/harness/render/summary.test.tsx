// @vitest-environment jsdom
// 한눈 요약(개발 서버 summary/* 이식, 2026-11-06) — 답 refs → T3Q-05 분류 → 구분별 블록. 대화창 카드(CompactSummary)·패널 탭(PosterSummary).
// 받은 값만 쓰고, 묶을 대상이 없으면 카드를 내지 않는다. npx vitest run harness/render/summary
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompactSummary from "@/components/summary/CompactSummary";
import PosterSummary from "@/components/summary/PosterSummary";
import { gradeLabel } from "@/components/summary/MapSummary";
import { basisTime, catalog, clearSummaryCache, districtCounts, districtLine, keyRefs, loadSummary, shortDate, sigunguOf } from "@/lib/summary";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls: { api?: string; id?: string; body?: unknown; url: string }[] = [];
const UP = (n: string, name: string) => ({ ref: `r${n}`, entity_type: "RISK_FACTOR", display_name: name, map: { key: "underpass_id", value: n } });

beforeEach(() => {
  clearSummaryCache();
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    const u = String(url);
    const b = init?.body ? JSON.parse(init.body) : {};
    calls.push({ ...b, url: u });
    if (u.startsWith("/api/regions")) return reply({ items: [{ code: "26260", name: "동래구" }, { code: "26470", name: "연제구" }] });
    if (u === "/api/t3q/data" && b.api === "T3Q-05") {
      return reply({ envelope: { status: "SUCCESS", result: { items: (b.body.object_ids as string[]).map((id, i) => ({ object_id: id, category: "지하차도", name: `지하차도${i + 1}`, admin_code: i ? "2647010100" : "2626010800", grade: null })) } } });
    }
    if (u === "/api/t3q/data" && b.api === "T3Q-15") {
      return reply({ envelope: { status: "SUCCESS", result: { risk: { attributes: [{ key: "u_shaped", value: "Y" }, { key: "control_depth_cm", value: 15 }] } } } });
    }
    return reply({ error: "없음" }, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("요약 모형(lib/summary)", () => {
  it("refs → 객체 ID(상세 ID 우선), 같은 객체는 한 번", () => {
    expect(keyRefs([UP("1", "a"), UP("1", "a"), UP("2", "b"), { ref: "x", entity_type: "EVENT", display_name: "사건" }]).map((k) => k.id)).toEqual(["UP-1", "UP-2"]);
  });
  it("분류 이름 → 블록·색·짧은 이름, 모르는 분류는 이름 목록", () => {
    expect(catalog("지하차도")).toEqual({ block: "check", tone: "yellow", short: "지하차도" });
    expect(catalog("자연재해위험개선지구").block).toBe("gantt");
    expect(catalog("처음 보는 분류")).toEqual({ block: "names", tone: "gray", short: "처음 보는 분류" });
  });
  it("시군구별 개수 · 「동래구 2 · 연제구 1」(이름 모르는 코드는 뺀다)", () => {
    const rows = ["2626010800", "2626010900", "2647010100", "9999"].map((c, i) => ({ id: String(i), name: "", adminCode: c, grade: null, f: {} }));
    expect(sigunguOf("2626010800")).toBe("26260");
    expect(sigunguOf("12")).toBeNull();
    const counts = districtCounts(rows);
    expect(counts).toEqual([["26260", 2], ["26470", 1]]);
    expect(districtLine(counts, new Map([["26260", "동래구"]]))).toBe("동래구 2");
    expect(districtLine(counts, new Map())).toBeNull();
  });
  it("날짜·기준 시각은 받은 값으로만(한국 시각)", () => {
    expect(shortDate("2024-09-21")).toBe("24.09.21");
    expect(shortDate(null)).toBe("—");
    expect(basisTime("2026-11-02T05:58:00Z")).toBe("2026.11.02 14:58");
    expect(basisTime(null)).toBe("");
  });
  it("등급 이름 붙이기(개발 서버 그대로)", () => {
    expect(gradeLabel("2")).toBe("위험등급 2");
    expect(gradeLabel("C")).toBe("C등급");
    expect(gradeLabel("관심")).toBe("관심");
    expect(gradeLabel("C등급 · 72점")).toBe("C등급 · 72점");
  });
  it("T3Q-05 는 object_ids 로 한 번, 같은 refs 는 다시 묻지 않는다", async () => {
    const refs = [UP("1", "a"), UP("2", "b")];
    const a = await loadSummary(refs);
    const b = await loadSummary(refs);
    expect(a).toBe(b);
    const list = calls.filter((c) => c.api === "T3Q-05");
    expect(list).toHaveLength(1);
    expect(list[0].body).toEqual({ object_ids: ["UP-1", "UP-2"], page: { page: 1, size: 100 } });
    expect(a?.total).toBe(2);
    expect(a?.groups[0].rows[0].f.control_depth_cm).toBe("15");
  });
});

describe("대화창 카드(CompactSummary)", () => {
  it("묶을 대상이 없으면 카드를 내지 않는다", () => {
    const { container } = render(<CompactSummary refs={[{ ref: "x", entity_type: "EVENT", display_name: "사건" }]} basisAt="" onEntity={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
  it("조건 줄·구분 개수·어디 줄, [패널에서 크게 보기]·이름 누르기", async () => {
    const onEntity = vi.fn();
    const onExpand = vi.fn();
    render(<CompactSummary refs={[UP("1", "a"), UP("2", "b")]} regionName="부산광역시" basisAt="2026.11.06 09:00" onEntity={onEntity} onExpand={onExpand} />);
    expect(await screen.findByText("부산광역시 · 대상 2곳 · 2026.11.06 09:00 기준")).toBeTruthy();
    expect(screen.getByLabelText("구분별 개수").textContent).toContain("지하차도2");
    await waitFor(() => expect(screen.getAllByText(/동래구 1 · 연제구 1/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("패널에서 크게 보기"));
    expect(onExpand).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "지하차도1" })[0]);
    expect(onEntity).toHaveBeenCalledWith(expect.objectContaining({ ref: "r1" }));
  });
});

describe("패널 탭(PosterSummary)", () => {
  it("답이 없으면 안내, 대상이 없으면 그 말, 있으면 큰 요약", async () => {
    const { rerender } = render(<PosterSummary source={null} onEntity={() => {}} />);
    expect(screen.getByText("질문에 답이 오면 그 답의 대상이 여기에 한눈 요약으로 나옵니다.")).toBeTruthy();
    rerender(<PosterSummary source={{ jobId: "j", refs: [], basisAt: "" }} onEntity={() => {}} />);
    expect(screen.getByText(/묶을 대상이 없습니다/)).toBeTruthy();
    rerender(<PosterSummary source={{ jobId: "j", refs: [UP("1", "a")], basisAt: "" }} onEntity={() => {}} />);
    expect(await screen.findByText("답변 한눈 요약")).toBeTruthy();
  });
});

// 2026-11-20 사용자 지시 — 「물 높이」 값(침수심·통제 수심·대응수위)은 구분이 달라도 같은 그림(물색 막대·눈금)으로
describe("물 높이 그림(침수심 · 통제 수심 · 대응수위)", () => {
  it("지하차도 — 통제 기준 수심을 물 높이 막대로(값은 받은 그대로 + cm)", async () => {
    const { container } = render(<CompactSummary refs={[UP("1", "a"), UP("2", "b")]} basisAt="" onEntity={() => {}} />);
    expect(await screen.findByText("통제 기준 수심")).toBeTruthy();
    await waitFor(() => expect(container.querySelectorAll(".sm-water .sm-water-fill").length).toBe(2));
    expect(container.querySelector(".sm-water")?.textContent).toContain("15cm");
  });
  it("침수흔적 — 평균 침수심 깊은 순, 단위 글은 받은 그대로 적는다", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      const b = init?.body ? JSON.parse(init.body) : {};
      if (String(url) === "/api/t3q/data" && b.api === "T3Q-30") {
        return reply({ envelope: { status: "SUCCESS", result: { items: [
          { flood_trace_id: "FT-1", district_name: "얕은 곳", admin_code: "3023010200", area_m2: 100, started_on: "2024-07-10", avg_flood_depth_raw: 20, avg_flood_depth_unit: "원천 단위 미표기(cm 로 보임)" },
          { flood_trace_id: "FT-2", district_name: "깊은 곳", admin_code: "3023010200", area_m2: 50, started_on: "2024-07-10", avg_flood_depth_raw: 80, avg_flood_depth_unit: "원천 단위 미표기(cm 로 보임)" },
          { flood_trace_id: "FT-3", district_name: "값 없는 곳", admin_code: "3023010200", area_m2: 10, started_on: "2024-07-10", avg_flood_depth_raw: null },
        ] } } });
      }
      return reply({ items: [] });
    });
    const FT = (n: string) => ({ ref: `f${n}`, entity_type: "FLOOD_TRACE", display_name: `흔적${n}`, entity_id: `FT-${n}` });
    const { container } = render(<CompactSummary refs={[FT("1"), FT("2"), FT("3")]} basisAt="" onEntity={() => {}} />);
    expect(await screen.findByText("침수흔적 평균 침수심")).toBeTruthy();
    const labels = [...container.querySelectorAll(".sm-water .sm-bar-label")].map((e) => e.textContent);
    expect(labels).toEqual(["깊은 곳", "얕은 곳"]);
    const fills = [...container.querySelectorAll<HTMLElement>(".sm-water .sm-water-fill")].map((e) => e.style.width);
    expect(fills).toEqual(["100%", "25%"]);
    expect(container.querySelector(".sm-water")?.textContent).toContain("80cm");
    expect(screen.getByText("단위 — 원천 단위 미표기(cm 로 보임)")).toBeTruthy();
  });
});
