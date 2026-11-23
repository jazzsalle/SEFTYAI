// @vitest-environment jsdom
// 개발서버 11-23 우측 패널·지도 정리 이식 — npx vitest run harness/devsync
//  · 96c419a 상세 탭 정리(UFR-006-001-02): 최대 8개 · 같은 이름 가르기 · 붙박이 탭은 세지도 닫지도 않음
//  · e9f6fd2 지도 말풍선·범례·정밀도: 「가까이 보기」↔「전체 보기」 · 「같은 종류만」 없음 · 갈래 하나면 범례 거르기 막음 · 「기타」 · 정밀도 이름표
//  · a4cb228 침수흔적 상세(UFR-003-001-06): T3Q-30 으로 받아 받은 값 그대로, 빈 칸 「—」, 행정코드 숨김
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExploreContext, type ExploreApi, type PanelTab } from "@/components/explore/ExploreCtx";
import DetailPane from "@/components/explore/DetailPane";
import MapPopup from "@/components/map/MapPopup";
import MapLegendPanel from "@/components/map/MapLegendPanel";
import type { MapFeature } from "@/components/map/MapView";
import { precisionKo } from "@/components/map/mapStyle";
import { capDetailTabs, isClosable, MAX_DETAIL_TABS, tabTitles } from "@/lib/panelTabs";
import { floodTraceId, floodTraceItem, floodTraceRows, isFloodTrace } from "@/lib/floodTrace";

const h = vi.hoisted(() => ({ calls: [] as { api: string; id?: string; body?: unknown }[], envelope: null as unknown }));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    api: async (_p: string, init: { json?: { api: string; id?: string; body?: unknown } } = {}) => {
      const req = init.json ?? { api: "" };
      h.calls.push(req);
      if (req.api !== "T3Q-30") throw new ApiError(502, "정보를 불러오지 못했습니다.");
      return { api: req.api, http: 200, ms: 1, envelope: h.envelope };
    },
  };
});

afterEach(() => cleanup());

/* ── 96c419a 상세 탭 ─────────────────────────────── */
const MAP: PanelTab = { key: "map", kind: "map", title: "지도" };
const SOP: PanelTab = { key: "sop", kind: "sop", title: "대응절차", pinned: true };
const det = (key: string, title = key, entityType?: string, id?: string): PanelTab => ({
  key, kind: "detail", title, detail: { api: "T3Q-15", id: id ?? "", label: title, ctx: null, entityType: entityType ?? null },
});

describe("상세 탭 정리 — 개발서버 panelTabs(96c419a)", () => {
  it("닫을 수 있는 탭은 상세·근거 문서·원문뿐 — 지도·한눈 요약·대응절차는 붙박이", () => {
    expect(isClosable(MAP)).toBe(false);
    expect(isClosable(SOP)).toBe(false);
    const tab = (key: string, kind: PanelTab["kind"], title: string): PanelTab => ({ key, kind, title });
    expect(isClosable(tab("summary", "summary", "한눈 요약"))).toBe(false);
    expect(isClosable(det("a"))).toBe(true);
    expect(isClosable(tab("evidence", "evidence", "근거 문서"))).toBe(true);
    expect(isClosable(tab("doc:1", "doc", "원문"))).toBe(true);
  });
  it("최대 8개 — 넘치면 가장 먼저 연 상세 탭부터 닫고, 붙박이 탭은 세지 않는다", () => {
    const list = [MAP, ...Array.from({ length: MAX_DETAIL_TABS + 2 }, (_, i) => det(`t${i}`))];
    const keys = capDetailTabs(list, "t9").map((t) => t.key);
    expect(keys).toEqual(["map", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"]);
    const under = [MAP, ...Array.from({ length: MAX_DETAIL_TABS }, (_, i) => det(`t${i}`))];
    expect(capDetailTabs(under, "t7")).toBe(under);
  });
  it("막 연 탭은 오래됐어도 남긴다", () => {
    expect(capDetailTabs([det("a"), det("b"), det("c")], "a", 2).map((t) => t.key)).toEqual(["a", "c"]);
  });
  it("이름이 같으면 갈래를, 갈래도 같으면 T3Q 객체 ID 를 붙인다 — 모르는 갈래 코드는 내보이지 않는다", () => {
    const one = tabTitles([MAP, det("x", "좌천지구", "FLOOD_TRACE")]);
    expect(one.get("x")).toBe("좌천지구");
    const kinds = tabTitles([det("a", "부산광역시", "RISK_AREA"), det("b", "부산광역시", "FLOOD_TRACE")]);
    expect(kinds.get("a")).toBe("부산광역시 · 위험·취약지역");
    expect(kinds.get("b")).toBe("부산광역시 · 침수흔적");
    const ids = tabTitles([det("a", "부산광역시", "RISK_AREA", "HZ-1"), det("b", "부산광역시", "RISK_AREA", "HZ-2")]);
    expect(ids.get("a")).toBe("부산광역시 · 위험·취약지역 · HZ-1");
    const unknown = tabTitles([det("a", "부산광역시", "UNKNOWN_KIND", "X-1"), det("b", "부산광역시", "UNKNOWN_KIND", "X-2")]);
    expect(unknown.get("a")).toBe("부산광역시 · X-1");
  });
});

/* ── e9f6fd2 지도 말풍선·범례·정밀도 ─────────────── */
const feat = (over: Partial<MapFeature> = {}): MapFeature =>
  ({ key: "k1", jobId: "j1", ref: "r1", entityType: "RISK_AREA", displayName: "온천천", geometry: { type: "Point", coordinates: [129, 35] }, precision: "exact", ...over }) as MapFeature;

describe("지도 말풍선 — 개발서버 MapPopup(e9f6fd2)", () => {
  it("가까이 본 뒤에는 「전체 보기」, 「같은 종류만」은 지도에서 넘기지 않으면 없다", () => {
    const { rerender } = render(<MapPopup f={feat()} other={false} filter={null} onClose={() => {}} onZoom={() => {}} />);
    expect(screen.getByRole("button", { name: /가까이 보기/ })).toBeTruthy();
    expect(screen.queryByText("같은 종류만")).toBeNull();
    rerender(<MapPopup f={feat()} other={false} filter={null} onClose={() => {}} onZoom={() => {}} zoomOut />);
    expect(screen.getByRole("button", { name: /전체 보기/ })).toBeTruthy();
  });
});

describe("지도 범례 — 개발서버 MapLegendPanel(e9f6fd2)", () => {
  it("갈래가 하나뿐이면 갈래 줄은 누를 수 없다", () => {
    render(<MapLegendPanel features={[feat(), feat({ key: "k2" })]} filter={null} onFilter={() => {}} />);
    const row = document.querySelector<HTMLButtonElement>(".mlp-row");
    expect(row?.disabled).toBe(true);
    expect(row?.className).toContain("mlp-row--static");
  });
  it("갈래가 둘 이상이면 거를 수 있다", () => {
    render(<MapLegendPanel features={[feat(), feat({ key: "k2", entityType: "FLOOD_TRACE", displayName: "좌천1지구" })]} filter={null} onFilter={() => {}} />);
    const rows = [...document.querySelectorAll<HTMLButtonElement>(".mlp-row")];
    expect(rows.length).toBe(2);
    expect(rows.every((r) => !r.disabled)).toBe(true);
  });
});

describe("위치 정밀도 이름표 — 개발서버 precisionKo(e9f6fd2)", () => {
  it("설명서 밖 실측 값도 한글로", () => {
    expect(precisionKo("road_addr")).toBe("도로명주소 위치");
    expect(precisionKo("jibun")).toBe("지번 위치");
    expect(precisionKo("jibun_main")).toBe("지번(본번) 위치");
    expect(precisionKo("source_point")).toBe("원천 지점 좌표");
  });
  it("모르는 코드는 원문 대신 「위치 정밀도 미확인」, 범위·행정구역 중심 계열은 묶고, 없으면 null", () => {
    expect(precisionKo("brand_new_code")).toBe("위치 정밀도 미확인");
    expect(precisionKo("bbox_other")).toBe("범위(사각형)");
    expect(precisionKo("ri_center")).toBe("행정구역 중심(근사)");
    expect(precisionKo(null)).toBeNull();
  });
});

/* ── a4cb228 침수흔적 상세 ───────────────────────── */
// 개발서버 tests/floodTrace.test.ts 의 한 건(docs/t3q/samples/t3q/POST_v1_flood-traces_search.json)
const sample = {
  flood_trace_id: "FT-I_15857",
  district_name: "좌천1지구",
  admin_code: "2617010300",
  flood_event: { flood_event_id: "FE-855", name: "20년07월 장마철 집중호우" },
  flood_grade: null,
  max_depth_m: null,
  avg_flood_depth_raw: 2.087,
  avg_flood_depth_unit: "원천 단위 미표기(cm 로 보임)",
  avg_flood_level_m: null,
  area_m2: 16679.8,
  damage_amount_krw: null,
  flood_hours: 5,
  cause: "집중호우, 배수불량",
  flood_year: 2020,
  started_on: "2020-07-23",
  ended_on: "2020-07-24",
};
const value = (rows: { label: string; value: string | null }[], label: string) => rows.find((r) => r.label === label)?.value;

describe("침수흔적 상세 — 개발서버 floodTrace(a4cb228)", () => {
  it("갈래 FLOOD_TRACE 나 FT- 객체 ID 면 침수흔적, 조회 열쇠는 T3Q 가 준 FT- ID 만", () => {
    expect(isFloodTrace({ entity_type: "FLOOD_TRACE" })).toBe(true);
    expect(isFloodTrace({ entity_id: "FT-I_15857" })).toBe(true);
    expect(isFloodTrace({ entity_type: "RISK_AREA", entity_id: "HZ-212" })).toBe(false);
    expect(floodTraceId({ entity_id: " FT-I_15857 " })).toBe("FT-I_15857");
    expect(floodTraceId({})).toBeNull();
  });
  it("받은 값을 그대로 — 쉼표와 필드가 밝힌 단위만, 평균 침수심은 T3Q 단위 설명, 빈 칸 null, 행정코드 없음", () => {
    const { basic, scale } = floodTraceRows(sample);
    expect(value(basic, "재난명")).toBe("20년07월 장마철 집중호우");
    expect(value(basic, "침수 기간")).toBe("2020-07-23 ~ 2020-07-24");
    expect(value(scale, "침수 면적")).toBe("16,679.8 ㎡");
    expect(value(scale, "침수 시간")).toBe("5 시간");
    expect(value(scale, "평균 침수심")).toBe("2.087 (원천 단위 미표기(cm 로 보임))");
    expect(value(scale, "최대 침수심")).toBeNull();
    expect([...basic, ...scale].some((r) => r.value === "2617010300")).toBe(false);
    expect(value(floodTraceRows({ ...sample, ended_on: "2020-07-23" }).basic, "침수 기간")).toBe("2020-07-23");
  });
  it("다른 흔적이 섞여 오면 그 ID 의 것만", () => {
    expect(floodTraceItem({ items: [{ ...sample, flood_trace_id: "FT-X" }] }, "FT-I_15857")).toBeNull();
    expect(floodTraceItem({ items: [sample] }, "FT-I_15857")?.district_name).toBe("좌천1지구");
  });
  it("상세 탭 — T3Q-15 로 열린 FT- 탭도 T3Q-30 으로 받아 그린다(「상세 정보를 찾을 수 없습니다」 해소)", async () => {
    h.calls.length = 0;
    h.envelope = { status: "SUCCESS", result: { total_count: 1, items: [sample] } };
    const x = { showOnMap: vi.fn() } as unknown as ExploreApi;
    render(<ExploreContext.Provider value={x}><DetailPane apiId="T3Q-15" id="FT-I_15857" label="좌천1지구" ctx={{ mapJob: "j1", mapRef: "r1" }} hasGeometry={true} /></ExploreContext.Provider>);
    await screen.findByText("침수 규모");
    expect(screen.getByText("침수흔적 · FT-I_15857")).toBeTruthy();
    expect(screen.getByText("16,679.8 ㎡")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /지도에서 보기/ })).toBeTruthy();
    expect(screen.queryByText("상세 정보를 찾을 수 없습니다.")).toBeNull();
    expect(h.calls.every((c) => c.api === "T3Q-30")).toBe(true);
    expect(h.calls[0].body).toEqual({ flood_trace_ids: ["FT-I_15857"], page: { page: 1, size: 1 } });
  });
  it("그 ID 가 결과에 없으면 「상세 정보를 찾을 수 없습니다.」", async () => {
    h.envelope = { status: "SUCCESS", result: { total_count: 0, items: [] } };
    const x = { showOnMap: vi.fn() } as unknown as ExploreApi;
    render(<ExploreContext.Provider value={x}><DetailPane apiId="T3Q-30" id="FT-NONE" label="없는 지구" /></ExploreContext.Provider>);
    expect(await screen.findByText("상세 정보를 찾을 수 없습니다.")).toBeTruthy();
  });
});
