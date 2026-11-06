// @vitest-environment jsdom
// 위험·취약 대상 상세(EntityDetail) — 개발서버 EntityTab(kjw 998facb) 복제. 녹화한 T3Q-15(UP-609 대남지하차도)로 그려 본다.
// 갈래별 묶음 · 점검·정비 기록 표와 주의 · 다른 객체가 오면 버림 · 예외 문구 · 개인정보 연락처 숨김. npx vitest run harness/devsync
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";
import DetailPane from "@/components/explore/DetailPane";
import { NOT_PROVIDED, riskStateOf, sectionsWithContent, summaryTiles, UNAVAILABLE, type RiskObject } from "@/lib/riskObject";

const h = vi.hoisted(() => ({ env: new Map<string, { http: number; envelope: unknown }>() }));
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
    api: async (_p: string, init: { json?: { api: string; id?: string } } = {}) => {
      const req = init.json ?? { api: "" };
      const hit = h.env.get(`${req.api}:${req.id ?? ""}`);
      if (!hit) throw new ApiError(502, "정보를 불러오지 못했습니다.");
      return { api: req.api, http: hit.http, ms: 1, envelope: hit.envelope };
    },
  };
});

type Rec = { id: string; response: { result: RiskObject; status: string } };
const data = JSON.parse(readFileSync(join(__dirname, "..", "recordings", "data_2026-10-27T15-53-38-514Z.json"), "utf8")) as Rec[];
const up609 = data.find((x) => x.id === "T3Q-15")!.response;
// 점검 기록·관리정보(개인정보 연락처)·근거를 덧붙인 판
const rich = {
  ...up609,
  result: {
    ...up609.result,
    object_id: "UP-700",
    risk: { ...up609.result.risk, attributes: [...(up609.result.risk?.attributes ?? []), { key: "inspection_result", label: "최근 점검 결과", value: "양호" }] },
    management: { agency: "부산광역시 남구", department: "안전도시과", contact: "010-0000-0000", contains_pii: true },
    basis: { designation_basis: null, related_plans: [], related_documents: [{ title: "지하차도 현황", evidence_ref: "EV-1" }], past_events: [] },
    source: { name: "지하차도 현황", table: "지하차도_차단시설_현황", row_no: 275, as_of: "2026-06-10" },
  },
};
h.env.set("T3Q-15:UP-609", { http: 200, envelope: up609 });
h.env.set("T3Q-15:UP-700", { http: 200, envelope: rich });
h.env.set("T3Q-15:UP-404", { http: 404, envelope: { status: "NO_RESULT", result: null } });

const showOnMap = vi.fn();
const x = { showOnMap } as unknown as ExploreApi;
const view = (id: string, label: string, ctx?: Record<string, unknown>) =>
  render(<ExploreContext.Provider value={x}><DetailPane apiId="T3Q-15" id={id} label={label} ctx={ctx} /></ExploreContext.Provider>);

afterEach(() => cleanup());

describe("대상 상세 — 개발서버 EntityTab 그대로", () => {
  it("갈래별 묶음 — 기본정보·위험·취약정보, 등급 타일, 「자료 기준」 없음(출처 없는 응답)", async () => {
    view("UP-609", "대남지하차도");
    await screen.findByText("기본정보");
    expect(screen.getByText("위험·취약정보")).toBeTruthy();
    expect(screen.getByText("위험등급", { selector: ".di-head-lb" })).toBeTruthy();
    expect(screen.getByText("관리주체")).toBeTruthy();
    expect(screen.queryByText("피해 이력")).toBeNull(); // 내용 없는 영역은 세우지 않는다
    expect(screen.getByText("대상 원본 항목 전체 보기")).toBeTruthy();
  });
  it("점검·정비 기록은 따로 표로, 현재 상태가 아니라는 주의와 자료 기준", async () => {
    view("UP-700", "대남지하차도", { mapJob: "j1", mapRef: "r1" });
    await screen.findByText("점검·정비 기록");
    expect(screen.getByText("최근 점검 결과")).toBeTruthy();
    expect(screen.getByText("⚠ 출처 자료에 적힌 기록이며 현재 상태가 아닙니다 (자료 기준 2026-06-10).")).toBeTruthy();
    expect(screen.getByText("지하차도 현황 · 자료 기준 2026-06-10")).toBeTruthy();
    expect(screen.getByText("지하차도 현황 · 지하차도_차단시설_현황 · 275행")).toBeTruthy();
    // 개인정보 연락처는 내지 않는다(관리정보에 기관·부서만)
    expect(screen.getByText("관리정보")).toBeTruthy();
    expect(screen.queryByText("010-0000-0000")).toBeNull();
    fireEvent.click(screen.getByText("지도에서 보기"));
    expect(showOnMap).toHaveBeenCalledWith("j1", "r1");
    expect(screen.getByText("참조")).toBeTruthy();
  });
  it("이름이 다른 객체가 오면 버린다(띄어쓰기만 다른 것은 같게)", async () => {
    view("UP-609", "초량제1지하차도");
    await screen.findByText(UNAVAILABLE.mismatch);
    cleanup();
    view("UP-609", "대남 지하차도");
    await screen.findByText("기본정보");
  });
  it("예외 문구 — 없음·못 불러옴·열쇠 없음, 위치 없음", async () => {
    view("UP-404", "어딘가");
    await screen.findByText(UNAVAILABLE.none);
    cleanup();
    view("UP-500", "어딘가");
    await screen.findByText(UNAVAILABLE.failed);
    cleanup();
    view("UP-609", "대남지하차도", { hasGeometry: false });
    await screen.findByText("⚠ 위치정보가 제공되지 않아 지도에 표시할 수 없습니다.");
    expect(screen.queryByText("지도에서 보기")).toBeNull();
  });
});

describe("대상 상세 규칙(lib/riskObject)", () => {
  it("열쇠가 없으면 nokey, 성공이 아닌 봉투는 none", () => {
    expect(riskStateOf("", null, "x")).toEqual({ kind: "nokey" });
    expect(riskStateOf("UP-1", { state: "ok", data: { status: "PARTIAL_SUCCESS", result: { name: "x" } }, error: null }, "x")).toEqual({ kind: "none" });
  });
  it("상류가 «없다» 고 밝힌 등급은 적고, 칸이 안 오면 조용히 넘긴다", () => {
    expect(summaryTiles({ risk: { grade: { value: null, status: "NOT_PROVIDED" } } })).toEqual([{ key: "grade", v: NOT_PROVIDED, lb: "위험등급", missing: true }]);
    expect(summaryTiles({ risk: { grade: null } })).toEqual([]);
  });
  it("영역 유무 — 개인정보 연락처만 있으면 관리정보를 세우지 않는다", () => {
    expect(sectionsWithContent({ management: { contact: "010", contains_pii: true } }).manage).toBe(false);
    expect(sectionsWithContent({ management: { contact: "051", contains_pii: false } }).manage).toBe(true);
  });
});
