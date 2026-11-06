// @vitest-environment jsdom
// 하네스 — 답변 그림(자동 인포그래픽, LLM 없음): 정의된 질문(library_id)의 답에만 · 재료(공간정보·자동 조회)가 있을 때만 ·
// 번호 = 답 글 등장 순 · 같은 좌표는 표지 하나 · 유사사례 연대기는 없음(R59 — 개발서버 유사사례 한눈 요약이 그 자리) · 큰 숫자는 받은 값(조건·특보·전체 건수)만 · 영어 없음
// npx vitest run harness/render/autoInfographic
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoEnvelope, JobFull, JobSummary, PreviewItem, T3qRef } from "@/lib/jobTypes";
import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";
import AutoInfoPanel from "@/components/answer/AutoInfographic";
import { fitBox, mergePoints, projector, refOrder, shapesOf } from "@/components/answer/infoMap";

const refs: T3qRef[] = [
  { ref: "r1", entity_type: "RISK_AREA", display_name: "토곡", map: { key: "hazard_zone_id", value: "1582", draw: "pin" } },
  { ref: "r2", entity_type: "RIVER", display_name: "온천천", map: { key: "river_code", value: "2621060", draw: "layer" } },
  { ref: "r3", entity_type: "RISK_FACTOR", display_name: "내성지하차도", map: { key: "underpass_id", value: "636", draw: "pin" } },
  { ref: "r4", entity_type: "RISK_FACTOR", display_name: "우장춘지하차도", map: { key: "underpass_id", value: "638", draw: "pin" } },
  { ref: "r5", entity_type: "REGION", display_name: "좌표 없음", map: { key: "legal_dong_code", value: "1", draw: "pin" } },
];
const geo: GeoEnvelope = {
  status: "SUCCESS",
  result: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [129.089147, 35.182225] }, properties: { ref: "r1", precision: "dong_center" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[129.08, 35.19], [129.09, 35.19], [129.09, 35.27], [129.08, 35.27], [129.08, 35.19]]] }, properties: { ref: "r2", precision: "exact" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [129.072446, 35.208541] }, properties: { ref: "r3", precision: "dong_center" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [129.072446, 35.208541] }, properties: { ref: "r4", precision: "dong_center" } },
    ],
    missing: [{ ref: "r5", reason: "NO_GEOMETRY" }],
  },
};
// 답 글은 r3 → r2 → r1 순으로 언급(r4 는 글에 없음)
const ANSWER = "먼저 [내성지하차도](#ref:r3)를 보고, [온천천](#ref:r2) 수위와 [토곡](#ref:r1) 저지대를 점검.";
const similar: PreviewItem = {
  api: "SIMILAR_EVENT", apiId: "T3Q-04", label: "유사재난 사례", path: "/similar-events/search", request: { query_context: { region: { name: "부산광역시" } } }, http: 200, ms: 300,
  response: { status: "SUCCESS", result: { total_count: 7, items: [
    { event_master_id: "T10107-20200723-0001", display_name: "2020년 7.23 호우", started_at: "2020-07-23", ended_at: "2020-07-25", similarity: { rank: 1, score: 90.91 }, disaster_types: ["호우"] },
    { event_master_id: "T10107-20140825-0001", display_name: "2014년 8.25 호우", started_at: "2014-08-25", ended_at: "2014-08-25", similarity: { rank: 2, score: 80.5 }, representative_admin_area: { name: "부산 금정구" } },
    { event_master_id: "X", display_name: "날짜 없음", started_at: null, ended_at: null, similarity: { rank: 3, score: 1 } },
  ] } },
};
const facility: PreviewItem = {
  api: "RISK_FACILITY", apiId: "T3Q-05", label: "잠재 위험요소·취약시설 목록", path: "/risk-knowledge/search", request: {}, http: 200, ms: 200,
  response: { status: "SUCCESS", result: { total_count: 12, items: [
    { object_id: "UP-636", name: "내성지하차도", category: "지하차도", type: "U자형", grade: { value: "4등급" }, admin_name: "동래구 온천동" },
    { object_id: "UP-628", name: "구서지하차도", category: "지하차도", type: "U자형", grade: { value: "4등급" }, admin_name: "금정구 구서동" },
  ] } },
};

function makeJob(over: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "job-1", account_id: "a", conv_id: "c", turn_no: 1, source: "LIBRARY", library_id: "BS-01", question_user: "질문", question_sent: "질문",
    state: "DONE", t3q_status: "SUCCESS", http_status: 200, cached_from: null, retry_of: null, error_code: null,
    created_at: "2026-11-02T10:00:00Z", submitted_at: null, finished_at: "2026-11-02T10:01:00Z", elapsed_ms: 60_000, t3q_conversation_id: null, source_finished_at: null, wx_seen: [], source_wx_seen: null,
    ...over,
  };
}
const REQ = { query_context: { region: { name: "부산광역시" }, detail: { conditions: [{ item: "RAIN_1H", label: "1시간 강우", value: 30, unit: "mm", source_type: "MANUAL" }] } }, weather_warnings: { items: [{ kind: "호우", level: "예비특보", area: "부산광역시" }] } };
const makeFull = (job: JobSummary, over: Partial<JobFull> = {}): JobFull => ({ ...job, request: REQ, raw: { status: "SUCCESS", result: { answer: ANSWER, refs } }, preview: null, geo, ...over });

let x: ExploreApi;
const wrap = (ui: ReactNode) => render(<ExploreContext.Provider value={x}>{ui}</ExploreContext.Provider>);
beforeEach(() => { x = { openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), openEntity: vi.fn(), selectOnMap: vi.fn(), showSummary: vi.fn(), selectedKey: null, followUp: vi.fn(), retry: vi.fn() }; });
afterEach(cleanup);

describe("답변 그림 — 순수 계산(infoMap)", () => {
  it("도형: 점·면·선을 받은 좌표 그대로, 모르는 모양·좌표 없는 대상은 건너뜀", () => {
    const s = shapesOf(geo);
    expect(s.map((q) => [q.ref, q.kind])).toEqual([["r1", "point"], ["r2", "area"], ["r3", "point"], ["r4", "point"]]);
    expect(shapesOf({ result: { features: [{ type: "Feature", geometry: { type: "Weird", coordinates: [] }, properties: { ref: "z" } }] } })).toEqual([]);
    expect(shapesOf(null)).toEqual([]);
  });
  it("번호 순서 = 답 글에 처음 나온 순서, 글에 없는 대상은 refs 순으로 뒤에", () => {
    expect(refOrder(ANSWER, refs)).toEqual(["r3", "r2", "r1", "r4", "r5"]);
    expect(refOrder(null, refs)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
  });
  it("같은 좌표는 표지 하나(번호는 유지), 상자·투영은 위도 보정 · 1km 축척 px 계산", () => {
    expect(mergePoints([{ ref: "r3", c: [1, 2] }, { ref: "r4", c: [1, 2] }, { ref: "r1", c: [1, 3] }])).toEqual([{ c: [1, 2], refs: ["r3", "r4"] }, { c: [1, 3], refs: ["r1"] }]);
    const box = fitBox(shapesOf(geo))!;
    expect(box.minLon).toBeLessThan(129.072446);
    expect(box.maxLat).toBeGreaterThan(35.27);
    const P = projector(box, 300, 400);
    expect(P.W).toBeLessThanOrEqual(300);
    expect(P.H).toBeLessThanOrEqual(400);
    expect(P.kmPx).toBeGreaterThan(5);
    const [x0, y0] = P.px([box.minLon, box.maxLat]);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
  });
});

describe("답변 그림 — 패널", () => {
  it("정의된 질문(library_id)의 답에만 · 재료가 없으면 없음", () => {
    const free = makeJob({ library_id: null });
    expect(wrap(<AutoInfoPanel job={free} full={makeFull(free)} />).container.querySelector(".auto-info")).toBeNull();
    cleanup();
    const job = makeJob();
    expect(wrap(<AutoInfoPanel job={job} full={makeFull(job, { geo: null })} />).container.querySelector(".auto-info")).toBeNull();
    cleanup();
    expect(wrap(<AutoInfoPanel job={job} full={null} />).container.querySelector(".auto-info")).toBeNull();
  });

  it("지도: 번호는 글 등장 순(내성①·온천천②·토곡③·우장춘④) · 같은 동 중심은 표지 하나에 「①④」 · 좌표 없는 대상은 번호 없음 · 누르면 지도에서 보기", () => {
    const job = makeJob();
    const { container } = wrap(<AutoInfoPanel job={job} full={makeFull(job)} />);
    const panel = container.querySelector("details.auto-info") as HTMLDetailsElement;
    expect(panel.open).toBe(true);
    expect(panel.querySelector("summary")!.textContent).toContain("답변 그림");
    const legend = [...panel.querySelectorAll(".ai-targets li")].map((li) => li.textContent);
    expect(legend).toHaveLength(4);
    expect(legend[0]).toContain("내성지하차도");
    expect(legend[0]).toContain("근사");
    expect(legend[1]).toContain("온천천");
    expect(legend[1]).not.toContain("근사");
    expect(legend[3]).toContain("우장춘지하차도");
    expect(panel.textContent).not.toContain("좌표 없음");
    expect(panel.querySelector("svg.im-map")).toBeNull(); // 지도 형식 그림은 뺐다(2026-11-03)
    expect(panel.querySelector(".ai-targets li .ai-tg-num")!.textContent).toBe("1");
    fireEvent.click(panel.querySelector(".ai-targets li button")!);
    // 개발서버 openEntity — 상세 탭을 만들고 지도로(R59)
    expect(x.openEntity).toHaveBeenCalledWith("job-1", expect.objectContaining({ ref: "r3" }));
  });

  it("큰 숫자 타일: 함께 보낸 특보 · 요청 조건 · 받은 전체 건수만(센 값 없음)", () => {
    const job = makeJob();
    const { container } = wrap(<AutoInfoPanel job={job} full={makeFull(job, { preview: [similar, facility] })} />);
    const tiles = [...container.querySelectorAll(".ai-tile")].map((t) => t.textContent);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toContain("호우예비특보");
    expect(tiles[1]).toContain("30mm");
    expect(tiles[1]).toContain("1시간 강우");
    expect(tiles[2]).toContain("7건");
    expect(tiles[3]).toContain("12건");
    expect(container.textContent).not.toContain("4곳"); // 지도 대상 수를 세어 적지 않는다
  });

  it("유사사례 연대기는 그리지 않는다(R59 — 개발서버에 없는 그림, 그 자리는 답 카드의 유사사례 한눈 요약)", () => {
    const job = makeJob();
    const { container } = wrap(<AutoInfoPanel job={job} full={makeFull(job, { preview: [similar] })} />);
    expect(container.querySelector(".ai-chron")).toBeNull();
    expect(container.textContent).not.toContain("연대기");
  });

  it("시설 카드: 받은 항목 그대로(이름·분류·등급) · 누르면 시설 상세", () => {
    const job = makeJob();
    const { container } = wrap(<AutoInfoPanel job={job} full={makeFull(job, { geo: null, preview: [facility] })} />);
    const cards = [...container.querySelectorAll(".ai-cards li")];
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("내성지하차도");
    expect(cards[0].textContent).toContain("등급 4등급");
    fireEvent.click(cards[1].querySelector("button.lnk")!);
    expect(x.openDetail).toHaveBeenCalledWith("T3Q-15", "UP-628", "구서지하차도");
  });

  it("화면 글자에 영어 낱말이 없다", () => {
    const job = makeJob();
    wrap(<AutoInfoPanel job={job} full={makeFull(job, { preview: [similar, facility] })} />);
    const text = screen.getByText("답변 그림").closest("details")!.textContent ?? "";
    expect(text.replace(/mm\/h|mm|cm|km|\bm\b/g, "")).not.toMatch(/[A-Za-z]{2,}/);
  });
});
