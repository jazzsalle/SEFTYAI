// @vitest-environment jsdom
// R59 — 개발서버(kjw 998facb)에 있는데 아직 옮기지 않았던 넷: ① 유사사례 한눈 요약(SimilarSummary · cases) ② 답 속 이름 = 상세 탭 + 지도(openEntity)
// ③ 대상 상세 밖 상세(계획 등)도 EntityTab 묶음 화면 ④ 행정경계 받는 중·못 받음·키 없음·거절 알림. npx vitest run harness/devsync/r59
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: new Map<string, { http: number; envelope: unknown }>(),
  calls: [] as { api: string; id?: string; body?: unknown }[],
  wms: [] as { setTileLoadFunction: unknown; getTileLoadFunction: () => (tile: unknown, src: string) => void; dispatchEvent: (t: string) => unknown }[],
}));
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
      const hit = h.env.get(`${req.api}:${req.id ?? ""}`);
      if (!hit) throw new ApiError(502, "정보를 불러오지 못했습니다.");
      return { api: req.api, http: hit.http, ms: 1, envelope: hit.envelope };
    },
  };
});
vi.mock("ol/source/TileWMS", async (orig) => {
  const Real = ((await orig()) as { default: new (o: object) => object }).default;
  class Spy extends Real {
    constructor(o: object) {
      super(o);
      h.wms.push(this as unknown as (typeof h.wms)[number]);
    }
  }
  return { default: Spy };
});

import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";
import DetailPane from "@/components/explore/DetailPane";
import { geometryKnown } from "@/components/explore/RightPanel";
import SimilarSummary, { won } from "@/components/summary/SimilarSummary";
import MapView, { DEFAULT_LAYERS } from "@/components/map/MapView";
import { groupDetail, groupedStateOf } from "@/lib/detailGroups";
import { isCaseQuestion, isSimilarQuestion, parseCases, wantsSimilarSummary, withDisasterType } from "@/lib/similarCases";
import { DAY_ITEMS } from "@/lib/library";
import { UNAVAILABLE } from "@/lib/riskObject";
import { fieldKo } from "@/lib/labels";
import type { MapFeature } from "@/components/map/MapView";
import type OlMap from "ol/Map";

const mockExplore = (): ExploreApi => ({ openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), openEntity: vi.fn(), selectOnMap: vi.fn(), showSummary: vi.fn(), selectedKey: null, followUp: vi.fn(), retry: vi.fn() });

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  h.calls.length = 0;
  h.wms.length = 0;
  vi.unstubAllGlobals();
});

/* ── ① 유사사례 한눈 요약 ───────────────────────────────────── */

const CASE_ANSWER = [
  "부산의 과거 유사사례입니다.",
  "",
  "| 사건명 | 발생기간 | 1시간 최대강우량 | 누적 강수량 |",
  "|---|---|---|---|",
  "| 2020년 7.23 호우 (직접 유사) | 2020.07.23~07.25 | 81.6mm | 234.5mm |",
  "| 2014년 8.25 호우 | 2014.08.25 | 130mm | 242mm |",
  "| 2009년 7.7 호우 | 2009.07.07 | 49.5mm | 310mm 이상 |",
].join("\n");

describe("① 유사사례 한눈 요약 — 개발서버 SimilarSummary·cases", () => {
  it("답 글 표에서 사례·막대 값을 읽는다(받은 숫자 그대로 · 직접 유사 표시)", () => {
    const set = parseCases(CASE_ANSWER)!;
    expect(set.cases.map((c) => c.name)).toEqual(["2020년 7.23 호우", "2014년 8.25 호우", "2009년 7.7 호우"]);
    expect(set.cases[0].direct).toBe(true);
    expect(set.cases.map((c) => c.year)).toEqual([2020, 2014, 2009]);
    const total = set.metrics.find((m) => m.key === "rainTotal")!;
    expect(total.values.map((v) => v?.shown)).toEqual(["234.5mm", "242mm", "310mm 이상"]);
    expect(set.metrics.find((m) => m.key === "rain1h")!.values[1]!.n).toBe(130);
  });

  it("붙일 답인가 — 질문 글이 사례를 묻고, 한눈 요약 질의의 유사사례 문항이거나 사례 답일 때만", () => {
    const sim = DAY_ITEMS.find((d) => d.similar && /유사|사례/.test(d.text))!;
    expect(isSimilarQuestion(sim.text)).toBe(true);
    expect(wantsSimilarSummary(sim.text, "답")).toBe(true);
    expect(wantsSimilarSummary("부산 과거 유사사례 알려줘", CASE_ANSWER)).toBe(true);
    expect(isCaseQuestion("2020년 7월 23일 피해", "답")).toBe(false);
    // 특정 날짜를 묻는 질문은 사례 글자가 없으면 붙이지 않는다
    expect(wantsSimilarSummary("2020년 7월 23~25일 부산 피해", CASE_ANSWER)).toBe(false);
  });

  it("재난유형이 조건에 없으면 질문에서 읽어 넣는다(있으면 그대로)", () => {
    expect(withDisasterType({ region: { name: "부산" } }, "집중호우 유사사례")).toEqual({ region: { name: "부산" }, disaster_types: ["호우"] });
    expect(withDisasterType({ disaster_types: ["태풍"] }, "호우 유사사례")).toEqual({ disaster_types: ["태풍"] });
  });

  it("순위·1위 사건(T3Q-04·10·13 받은 값)·답에 나온 수치 — 사건을 누르면 사건 상세(비교 조건 포함)", async () => {
    const ctx = { region: { name: "부산광역시" }, disaster_types: ["호우"] };
    h.env.set("T3Q-04:", {
      http: 200,
      envelope: {
        status: "SUCCESS",
        result: {
          total_count: 2,
          items: [
            { event_master_id: "EV-A", display_name: "2020년 7.23 호우", disaster_types: ["호우"], started_at: "2020-07-23", ended_at: "2020-07-25", similarity: { rank: 1, score: 90.9, scale: "0~100" }, representative_admin_area: { name: "부산광역시" }, lifecycle_status: "CLOSED" },
            { event_master_id: "EV-B", display_name: "2014년 8.25 호우", disaster_types: ["호우"], started_at: "2014-08-25", similarity: { rank: 2, score: 80.5 } },
          ],
        },
      },
    });
    h.env.set("T3Q-10:EV-A", { http: 200, envelope: { status: "SUCCESS", result: { event_summary: "초량제1지하차도 침수" } } });
    h.env.set("T3Q-13:EV-A", { http: 200, envelope: { status: "SUCCESS", result: { damage: { human: { displaced: 120 }, property: { property_damage_krw: 1234500000 }, facilities: { public: { record_count: 7 } } } } } });
    const onEvent = vi.fn();
    const { container } = render(<SimilarSummary ctx={ctx} answer={CASE_ANSWER} regionName="부산광역시" onEvent={onEvent} />);
    await waitFor(() => expect(container.querySelector(".sim-card")).not.toBeNull());
    const req = h.calls.find((c) => c.api === "T3Q-04")!;
    expect(req.body).toEqual({ query_context: ctx, page: { page: 1, size: 20 } });
    expect(container.querySelector(".sm-cond")!.textContent).toBe("부산광역시 · 유사사례 2건");
    expect(container.querySelector(".sm-counts")!.textContent).toBe("호우2");
    const rows = [...container.querySelectorAll(".sims-rank li")];
    expect(rows.map((r) => r.querySelector(".sim-rank-name")!.textContent)).toEqual(["2020년 7.23 호우2020-07-23", "2014년 8.25 호우2014-08-25"]);
    await waitFor(() => expect(container.querySelector(".sim-top-sum")?.textContent).toBe("초량제1지하차도 침수"));
    expect(container.querySelector(".sim-top-meta")!.textContent).toBe("2020-07-23 ~ 2020-07-25 · 부산광역시 · 종료");
    const vals = [...container.querySelectorAll(".sims-top .sm-value-num")].map((v) => v.textContent);
    expect(vals).toEqual(["90.9/100", "12.3억 원", "120명", "7건"]);
    expect(container.querySelector(".sim-sub-h")!.textContent).toBe("답에 나온 수치");
    fireEvent.click(rows[1].querySelector("button")!);
    expect(onEvent).toHaveBeenLastCalledWith({ id: "EV-B", label: "2014년 8.25 호우", ctx });
    fireEvent.click(container.querySelector(".sim-open")!);
    expect(onEvent).toHaveBeenLastCalledWith({ id: "EV-A", label: "2020년 7.23 호우", ctx });
  });

  it("금액은 억·만 원(개발서버 won)", () => {
    expect(won(1234500000)).toBe("12.3억 원");
    expect(won(56780000)).toBe("5,678만 원");
    expect(won(null)).toBe("—");
  });
});

/* ── ② 답 속 이름 → 상세 탭 + 지도 ───────────────────────── */

describe("② 답 속 이름 — 개발서버 openEntity(탭은 만들되 보이는 것은 지도)", () => {
  const feats = [{ jobId: "j1", ref: "r1" }, { jobId: "j1", ref: "r2" }] as MapFeature[];
  it("상세 탭의 위치 유무 — 그 답의 대상에 있으면 true, 그 답을 그렸는데 없으면 false, 받는 중·다른 답이면 모름", () => {
    expect(geometryKnown({ features: feats, resultStatus: null }, { mapJob: "j1", mapRef: "r1" })).toBe(true);
    expect(geometryKnown({ features: feats, resultStatus: null }, { mapJob: "j1", mapRef: "r9" })).toBe(false);
    expect(geometryKnown({ features: feats, resultStatus: "loading" }, { mapJob: "j1", mapRef: "r1" })).toBeNull();
    expect(geometryKnown({ features: feats, resultStatus: null }, { mapJob: "j2", mapRef: "r1" })).toBeNull();
    expect(geometryKnown({ features: feats, resultStatus: null }, null)).toBeNull();
  });

  it("열쇠가 없는 대상의 탭은 묻지 않고 「지역 단위」 문구, 위치를 알면 [지도에서 보기]", () => {
    const x = mockExplore();
    render(<ExploreContext.Provider value={x}><DetailPane apiId="T3Q-15" id="" label="인제군 중심" ctx={{ mapJob: "j1", mapRef: "r5" }} hasGeometry={true} /></ExploreContext.Provider>);
    expect(screen.getByText(UNAVAILABLE.nokey)).toBeTruthy();
    expect(h.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "지도에서 보기" }));
    expect(x.showOnMap).toHaveBeenCalledWith("j1", "r5");
  });

  it("위치가 없다고 알면 [지도에서 보기] 없이 위치 없음 주의", () => {
    render(<ExploreContext.Provider value={mockExplore()}><DetailPane apiId="T3Q-15" id="" label="좌표 없음" ctx={{ mapJob: "j1", mapRef: "r9" }} hasGeometry={false} /></ExploreContext.Provider>);
    expect(screen.queryByRole("button", { name: "지도에서 보기" })).toBeNull();
    expect(screen.getByText(/위치정보가 제공되지 않아/)).toBeTruthy();
  });

  it("자동 시연 대본 — R54 에 더한 「말풍선 [상세 보기]로 여는 걸음」이 없다(개발서버 걸음과 같음)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "components", "autodemo", "autoScript.ts"), "utf8");
    expect(src).not.toMatch(/sel: Tab, text: "[^"]+" \}, orElse/);
    expect(src).not.toMatch(/orElse: \[\{ click: \{ sel: PopDetail \} \}\]/);
    expect((src.match(/orElse:/g) ?? []).length).toBe(8);
    expect(src).toContain('const SimCard = `${LastTurn} .sim-card`');
  });
});

/* ── ③ 그 밖의 상세 — EntityTab 묶음 화면 ─────────────────── */

type Rec = { id: string; response: { status: string; result: Record<string, unknown> } };
const DATA = JSON.parse(readFileSync(join(__dirname, "..", "recordings", "data_2026-10-27T15-53-38-514Z.json"), "utf8")) as Rec[];
const PLAN = DATA.find((r) => r.id === "T3Q-17")!.response;

describe("③ 계획문서(T3Q-17) 등 — 대상 상세와 같은 묶음 화면", () => {
  it("머리·칩 · 기본정보 · 받은 묶음(문서·구간·수계·수문·하도·제방)마다 한 칸 · 값이 모두 빈 묶음(위험)·빈 칸은 세우지 않음", () => {
    const d = groupDetail(PLAN.result)!;
    expect(d.name).toContain("묵현천 하천기본계획");
    expect(d.objectId).toBe("RBP-1024180202010");
    expect([d.kind, d.area, d.year]).toEqual(["하천기본계획", "묵현천(1024180)", "2020"]);
    const titles = d.groups.map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(["기본정보", "문서", "구간·수계", "수문", "하도·제방"]));
    expect(titles).not.toContain("위험");
    expect(titles).not.toContain("내용"); // content 칸이 모두 null
    const basic = d.groups[0].rows.filter((r) => r.value !== null);
    expect(basic.map((r) => r.label)).toEqual(expect.arrayContaining(["판", "공개 등급"]));
    expect(basic.find((r) => r.label === fieldKo("quality_status"))?.value).toBe("검증됨");
    expect(d.groups.find((g) => g.title === "수문")!.rows).toEqual([{ label: "확률강우량", value: null }, { label: "계획홍수량", value: "470 ㎥/s (0)" }, { label: "계획홍수위", value: "측점 173곳" }]);
  });

  it("일부 제공도 받은 칸은 그리고, 결과 없음·못 받음은 EntityTab 예외 문구", () => {
    expect(groupedStateOf({ state: "ok", data: PLAN }).kind).toBe("ok");
    expect(groupedStateOf({ state: "ok", data: { status: "NO_RESULT", result: null } }).kind).toBe("none");
    expect(groupedStateOf({ state: "error", data: null }).kind).toBe("failed");
    expect(groupedStateOf({ state: "loading", data: null }).kind).toBe("loading");
  });

  it("화면 — 알약 제목 묶음 · 원본 항목 전체 보기 · 받은 값 나무(예전 GenericDetail)는 없음", async () => {
    h.env.set("T3Q-17:RBP-1024180202010", { http: 200, envelope: PLAN });
    const { container } = render(<ExploreContext.Provider value={mockExplore()}><DetailPane apiId="T3Q-17" id="RBP-1024180202010" label="묵현천" /></ExploreContext.Provider>);
    await waitFor(() => expect(container.querySelector(".ev-sec")).not.toBeNull());
    expect(container.querySelector(".entity-tab .evd-id")!.textContent).toBe("계획문서 상세 · RBP-1024180202010");
    expect([...container.querySelectorAll(".di-pill")].map((p) => p.textContent)).toEqual(expect.arrayContaining(["기본정보", "문서", "수문"]));
    expect(container.querySelector(".ev-chips")!.textContent).toContain("기준 2020");
    expect(screen.getByRole("button", { name: "상세 원본 항목 전체 보기" })).toBeTruthy();
    expect(container.querySelector(".gdp-hero")).toBeNull();
  });

  it("못 받으면 「상세 정보를 불러오지 못했습니다…」", async () => {
    render(<ExploreContext.Provider value={mockExplore()}><DetailPane apiId="T3Q-17" id="RBP-NONE" label="없는 계획" /></ExploreContext.Provider>);
    await waitFor(() => expect(screen.getByText(UNAVAILABLE.failed)).toBeTruthy());
  });
});

/* ── ④ 행정경계 상태 알림 ───────────────────────────────────── */

describe("④ 행정경계 받는 중·못 받음·키 없음·거절 — 개발서버 MapPane 문구·조건", () => {
  const view = (onMap?: (m: OlMap | null) => void, boundary = true) =>
    render(<MapView region="busan" features={[]} basemap="Base" layers={{ ...DEFAULT_LAYERS, boundary }} onMap={onMap} />);

  it("처음엔 「지도를 불러오는 중입니다…」 → 화면이 다 그려지면(rendercomplete) 사라진다 · 경계를 끄면 받는 중을 띄우지 않는다", () => {
    let map: OlMap | null = null;
    view((m) => (map = m ?? map));
    expect(screen.getByText("지도를 불러오는 중입니다…")).toBeTruthy();
    act(() => {
      map!.dispatchEvent("rendercomplete");
    });
    expect(screen.queryByText("지도를 불러오는 중입니다…")).toBeNull();
    cleanup();
    view(undefined, false);
    expect(screen.queryByText("지도를 불러오는 중입니다…")).toBeNull();
  });

  it("경계 타일이 처음 4장 연속 실패하면 「행정경계를 불러오지 못했습니다.」", () => {
    view();
    expect(screen.queryByText("행정경계를 불러오지 못했습니다.")).toBeNull();
    act(() => {
      for (let i = 0; i < 4; i++) h.wms[0].dispatchEvent("tileloaderror");
    });
    expect(screen.getByText("행정경계를 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("배경지도와 표식은 그대로 볼 수 있습니다.")).toBeTruthy();
  });

  const tileFor = () => ({ getImage: () => document.createElement("img"), setState: vi.fn() });
  it("서버 대리가 403 이면 「이 지역의 행정경계는 볼 수 없습니다.」", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    view();
    const tile = tileFor();
    await act(async () => {
      h.wms[0].getTileLoadFunction()(tile, "/api/map/wms?LAYERS=lt_c_adsido");
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText("이 지역의 행정경계는 볼 수 없습니다.")).toBeTruthy());
    expect(tile.setState).toHaveBeenCalled();
  });

  it("서버에 키가 없으면(x-map-status: nokey) 개발서버처럼 배경지도 고장 안내, 경계 실패 안내는 내지 않음", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404, headers: { "x-map-status": "nokey" } })));
    view();
    await act(async () => {
      h.wms[0].getTileLoadFunction()(tileFor(), "/api/map/wms?LAYERS=lt_c_adsido");
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText("배경지도를 불러오지 못했습니다.")).toBeTruthy());
    act(() => {
      for (let i = 0; i < 4; i++) h.wms[0].dispatchEvent("tileloaderror");
    });
    expect(screen.queryByText("행정경계를 불러오지 못했습니다.")).toBeNull();
  });

  it("/api/map/wms — 서버에 키가 없으면 404 + x-map-status: nokey", async () => {
    vi.stubEnv("VWORLD_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_VWORLD_KEY", "");
    const { GET } = await import("@/app/api/map/wms/route");
    const r = await GET(new Request("http://x/api/map/wms?LAYERS=lt_c_adsido"));
    expect(r.status).toBe(404);
    expect(r.headers.get("x-map-status")).toBe("nokey");
    vi.unstubAllEnvs();
  });
});
