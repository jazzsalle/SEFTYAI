// 하네스 — 특보 줄의 발효 중 특보(lib/server/kma fetchLiveAdvisories) · 개발 서버 KmaClient·WarningLedger·WeatherService.GetStatusAsync 처럼
//  · 특보코드(getPwnCd) 장부의 구역마다 한 건 — 발효 시각(startTime)·발표 시각(tmFc)·구역코드·구역 이름·신규/변경을 따로
//  · 특보발효현황(getPwnStatus t6)에 없는 종류·단계는 닫는다 · 예비특보(t7)·발표 시각은 현황에서
//  · 특보코드를 받지 못하면 예전처럼 현황 글의 구역 묶음(구역코드 없음 — 화면 「미제공」), 둘 다 못 받으면 조회 실패
// 네트워크 없음 — fetch 를 바꿔 끼운다
// npx vitest run harness/weather/kmaLive
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seenArea, wxCovers } from "@/lib/wxMatch";

const NOW = Date.parse("2026-11-19T02:00:00+09:00");
const item = (areaCode: string, areaName: string, warnVar: number, warnStress: number, tmFc: number, start: number, end = 0, tmSeq = 1) =>
  ({ areaCode, areaName, warnVar, warnStress, command: start ? "1" : "2", startTime: start, endTime: end, tmFc, tmSeq, cancel: "0", stnId: "108", allEndTime: 0 });
// 2026-11 실응답 꼴 — 인제군산지 강풍주의보는 16일 01:30 발표 · 02:30 발효, 18일 경보로 격상. 경북남부앞바다 풍랑주의보는 해제
const PWN = [
  item("L1022920", "인제군산지", 1, 0, 202611160130, 202611160230, 0, 86),
  item("L1022920", "인제군산지", 1, 1, 202611181800, 202611182100, 0, 95),
  item("S1131200", "경북남부앞바다", 6, 0, 202611161200, 202611161300, 0, 89),
  item("S1131200", "경북남부앞바다", 6, 0, 202611171200, 0, 202611171400, 94),
  item("L1100100", "서울동남권", 3, 0, 202611181000, 202611181100, 0, 93),
  item("L1072100", "울릉도.독도", 1, 0, 202611180400, 202611180500, 0, 92),
];
// 한파주의보는 현황에 없다 — 서울동남권은 닫힌다(개발 서버 Reconcile)
const T6 = "o 강풍경보 : 강원도(인제산지)\r\no 강풍주의보 : 울릉도.독도";
let status: { ok: boolean; t6: string } = { ok: true, t6: T6 };
let pwnOk = true;
let calls: string[] = [];

let fetchLive: typeof import("@/lib/server/kma").fetchLiveAdvisories;
beforeEach(async () => {
  process.env.KMA_SERVICE_KEY = "test-key";
  status = { ok: true, t6: T6 };
  pwnOk = true;
  calls = [];
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    const op = url.pathname.split("/").pop()!;
    calls.push(op);
    if (op === "getPwnCd") return pwnOk ? Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: PWN } } } }) : new Response("오류", { status: 500 });
    if (op === "getPwnStatus") {
      if (!status.ok) return Response.json({ response: { header: { resultCode: "99", resultMsg: "오류" } } });
      return Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: [{ tmFc: 202611190130, tmEf: "202611190130", tmSeq: 1, t6: status.t6, t7: "(1) 풍랑 예비특보\r\no 11월 19일 새벽(00시~06시) : 동해남부앞바다", other: "" }] } } } });
    }
    return new Response("?", { status: 404 });
  });
  // 장부 캐시는 모듈에 있다 — 시험마다 새로 읽는다
  vi.resetModules();
  fetchLive = (await import("@/lib/server/kma")).fetchLiveAdvisories;
});
afterEach(() => vi.unstubAllGlobals());

describe("특보 줄의 발효 중 특보 — 특보코드(getPwnCd) 장부", () => {
  it("구역마다 한 건 — 발효·발표 시각·구역코드·구역 이름·신규/변경을 따로, 해제된 구역·현황에 없는 종류는 뺀다", async () => {
    const r = await fetchLive(NOW);
    expect(r.ok).toBe(true);
    expect(calls.sort()).toEqual(["getPwnCd", "getPwnStatus"]);
    expect(r.advisories.map((a) => [a.areaName, a.type + a.level])).toEqual([["울릉도.독도", "강풍주의보"], ["인제군산지", "강풍경보"]]);
    const inje = r.advisories.find((a) => a.areaName === "인제군산지")!;
    expect(inje).toMatchObject({
      areaCode: "L1022920",
      area: "강원도(인제군산지)",
      effectiveAt: "2026-11-18T21:00:00+09:00",
      announcedAt: "2026-11-18T18:00:00+09:00",
      // 줄 차례·「답을 받은 뒤 특보」 시각 = 발효 시각
      issuedAt: "2026-11-18T21:00:00+09:00",
      changeType: "변경",
      sea: false,
      status: "발효",
      regionId: "inje",
    });
    // 발효와 발표가 다른 시각으로 온다(예전에는 현황 한 장의 발표 시각 하나)
    expect(inje.effectiveAt).not.toBe(inje.announcedAt);
    // 특보 id 의 구역 글은 # 앞 — 답을 받은 때 특보(wx_seen)를 기준지역과 다시 맞출 수 있다
    expect(inje.id).toBe("KMA-강풍경보-강원도(인제군산지)#L1022920");
    expect(seenArea(inje)).toBe("강원도(인제군산지)");
    expect(wxCovers(inje.area, { sido: "강원특별자치도", sigungu: "인제군" })).toBe(true);
    expect(wxCovers(inje.area, { sido: "강원특별자치도", sigungu: "홍천군" })).toBe(false);
    expect(r.preliminary.map((p) => p.text)).toEqual(["(1) 풍랑 예비특보", "11월 19일 새벽(00시~06시) : 동해남부앞바다"]);
    expect(r.statusAt).toBe("2026-11-19T01:30:00+09:00");
  });
  it("특보발효현황을 받지 못하면 현황 맞추기 없이 장부 그대로(개발 서버 EffectiveSummary.Unreadable) — 조회 성공", async () => {
    status = { ok: false, t6: "" };
    const r = await fetchLive(NOW);
    expect(r.ok).toBe(true);
    expect(r.advisories.map((a) => a.areaName).sort()).toEqual(["서울동남권", "울릉도.독도", "인제군산지"]);
    expect(r.advisories.find((a) => a.areaName === "서울동남권")!.area).toBe("서울");
    expect(r.preliminary).toEqual([]);
  });
  it("특보코드를 받지 못하면 예전처럼 현황 글의 구역 묶음 — 구역코드·발효 시각 없음(화면 「미제공」)", async () => {
    pwnOk = false;
    const r = await fetchLive(NOW);
    expect(r.ok).toBe(true);
    expect(r.advisories.map((a) => a.area)).toEqual(["강원도(인제산지)", "울릉도.독도"]);
    expect(r.advisories[0].areaCode).toBeUndefined();
    expect(r.advisories[0].effectiveAt).toBeUndefined();
    expect(r.advisories[0].issuedAt).toBe("2026-11-19T01:30:00+09:00");
  });
  it("둘 다 받지 못하면 조회 실패(「특보 없음」과 섞지 않는다)", async () => {
    pwnOk = false;
    status = { ok: false, t6: "" };
    const r = await fetchLive(NOW);
    expect(r).toMatchObject({ ok: false, advisories: [] });
  });
});
