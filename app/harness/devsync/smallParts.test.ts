// 개발서버 복제(2026-11-07) 작은 조각 — 근거 문서 줄 · 질문 목록 칩 · 브리핑 머리말 · 글자 크기 · 발생기간 표기 · 다시 연 대화 실패 문구 · 지도 타일 대리.
// npx vitest run harness/devsync
import { describe, expect, it } from "vitest";
import { docLabel, docLinks, docRows } from "@/lib/docRefs";
import { queueBad, queueCounts, queueFilter, QUEUE_EMPTY, QUEUE_FILTERS } from "@/lib/queueList";
import { failureText, REOPENED_FAILED } from "@/lib/answerText";
import { applyScale, currentScale, FONT_SCALES, readScaleKey, scaledPx } from "@/lib/fontScale";
import { tileUrl, wmsUrl } from "@/lib/server/vworldTiles";
import type { JobState } from "@/lib/jobTypes";

describe("근거 문서 줄(개발서버 DocRefs)", () => {
  it("doc_refs 를 줄로 — 같은 문서·같은 쪽은 한 번, http(s) 아닌 주소는 링크로 만들지 않음", () => {
    const rows = docRows(
      [
        { title: "2020 재해연보", page: 32, url: "https://t3q.example/preview?t=1", source: "행정안전부", highlight: ["부산", ""] },
        { title: "2020 재해연보", page: "32", url: "https://t3q.example/preview?t=2" },
        { title: "위험 문서", url: "javascript:alert(1)" },
        { title: "  " },
      ],
      "",
    );
    expect(rows.map((r) => [r.title, r.page, r.url])).toEqual([
      ["2020 재해연보", "32", "https://t3q.example/preview?t=1"],
      ["위험 문서", null, null],
    ]);
    expect(docLabel(rows[0])).toEqual({ label: "2020 재해연보 p.32", tip: "2020 재해연보 p.32 원문 보기 (새 창) — 행정안전부 · 강조: 부산" });
  });
  it("doc_refs 가 비면 답 글 안의 문서 링크로 대신(꺾쇠 주소도)", () => {
    const text = "근거는 [재해연보 p.12](<https://a.example/x>)와 [대장](https://b.example/y), [이름](#ref:r1).";
    expect(docLinks(text)).toEqual([{ label: "재해연보 p.12", url: "https://a.example/x" }, { label: "대장", url: "https://b.example/y" }]);
    expect(docRows([], text).map((r) => [r.title, r.page])).toEqual([["재해연보", "12"], ["대장", null]]);
    expect(docRows(undefined, null)).toEqual([]);
  });
});

describe("질문 목록 칩(개발서버 AskList)", () => {
  const j = (state: JobState, t3q_status: string | null = "SUCCESS") => ({ state, t3q_status });
  it("칩 넷 · 실패·중단 = 성공으로 끝나지 않았거나 응답이 SUCCESS 가 아닌 것", () => {
    expect(QUEUE_FILTERS.map((f) => f.label)).toEqual(["전체", "진행 중", "완료", "실패·중단"]);
    const done = [j("DONE"), j("DONE", "PARTIAL_SUCCESS"), j("CANCELLED"), j("TIMEOUT"), j("DONE", null)];
    expect(done.map(queueBad)).toEqual([false, true, true, true, false]);
    expect(queueCounts([j("RUNNING")], done)).toEqual({ all: 6, running: 1, done: 2, bad: 3 });
    expect(queueFilter(done, "bad")).toHaveLength(3);
    expect(queueFilter(done, "all")).toHaveLength(5);
  });
  it("칩별 빈 문구는 개발서버 글자 그대로", () => {
    expect(QUEUE_EMPTY).toEqual({ running: "진행 중인 질문이 없습니다.", done: "아직 끝난 질문이 없습니다.", bad: "실패하거나 중단한 질문이 없습니다." });
  });
});

describe("다시 연 대화의 실패 턴(개발서버 useConversation)", () => {
  it("화면을 열기 전에 끝난 실패는 까닭을 가르지 않고 한 문구", () => {
    expect(failureText("TIMEOUT", true)).toBe(REOPENED_FAILED);
    expect(REOPENED_FAILED).toBe("답변을 받지 못한 질문입니다.");
    expect(failureText("TIMEOUT")).toBe("질의가 제한 시간을 넘겼습니다. 조건을 좁혀 다시 시도하세요.");
  });
});

describe("글자 크기 5단계(개발서버 fontScale)", () => {
  const mem = (v: Record<string, string>) => ({ getItem: (k: string) => v[k] ?? null, setItem: (k: string, x: string) => void (v[k] = x) });
  it("90·100·110·130·150% · 기본 보통 · 예전 4단계 값을 잇는다", () => {
    expect(FONT_SCALES.map((s) => `${s.label} ${s.percent}`)).toEqual(["작게 90", "보통 100", "조금 크게 110", "크게 130", "가장 크게 150"]);
    expect(readScaleKey(mem({}))).toBe("normal");
    expect(readScaleKey(mem({ "sa.font-scale": "largest" }))).toBe("largest");
    expect(readScaleKey(mem({ "sa.font-scale": "huge" }))).toBe("normal");
    expect(readScaleKey(mem({ "sa.font": "xl" }))).toBe("larger");
  });
  it("루트 % 와 배율 변수(--fs-scale)를 같이 걸고, 보통이면 지운다(R58)", () => {
    const props = new Map<string, string>();
    const el = { style: { fontSize: "", setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k), getPropertyValue: (k: string) => props.get(k) ?? "" } } as unknown as HTMLElement;
    applyScale("larger", el);
    expect(el.style.fontSize).toBe("130%");
    expect(props.get("--fs-scale")).toBe("1.3");
    expect(currentScale(el)).toBe(1.3);
    expect(scaledPx(15, currentScale(el))).toBe(19.5); // 캔버스 글자(지도 이름표)
    applyScale("normal", el);
    expect(el.style.fontSize).toBe("");
    expect(props.size).toBe(0);
    expect(currentScale(el)).toBe(1);
    expect(scaledPx(12, 1)).toBe(12);
  });
});

describe("지도 타일·경계 대리(개발서버 MapController tiles)", () => {
  it("표에 있는 종류·범위 안의 칸만, 위성은 jpeg", () => {
    expect(tileUrl("K", "Satellite", "7", "49", "109")).toBe("https://api.vworld.kr/req/wmts/1.0.0/K/Satellite/7/49/109.jpeg");
    expect(tileUrl("K", "Base", "7", "49", "109")).toMatch(/\/Base\/7\/49\/109\.png$/);
    expect(tileUrl("K", "white", "19", "0", "0")).toBeNull(); // 회색지도는 18단계까지
    expect(tileUrl("K", "../x", "1", "0", "0")).toBeNull();
    expect(tileUrl("K", "Base", "2", "4", "0")).toBeNull();
    expect(tileUrl("", "Base", "1", "0", "0")).toBeNull();
  });
  it("WMS 는 경계 레이어만, 고른 칸만 옮기고 KEY 를 붙인다", () => {
    const q = new URLSearchParams("SERVICE=WMS&REQUEST=GetMap&LAYERS=lt_c_adsido,lt_c_adsigg&BBOX=1,2,3,4&evil=1");
    const u = new URL(wmsUrl("K", q)!);
    expect(u.searchParams.get("KEY")).toBe("K");
    expect(u.searchParams.get("evil")).toBeNull();
    expect(u.searchParams.get("BBOX")).toBe("1,2,3,4");
    expect(wmsUrl("K", new URLSearchParams("LAYERS=lt_c_secret"))).toBeNull();
  });
});
