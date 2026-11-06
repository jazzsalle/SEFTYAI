// 하네스 — /api/weather/detail · /api/weather/bulletin (서버가 기상청 통보문을 부르고 거른다)
//  · 기준지역 시·도를 맡는 지방청 + 본청만 부른다 · 최신순 · 24시간 밖은 뺀다 · 지점마다 60초 캐시
//  · 일부 지점 실패 = ok(받지 못한 지점 이름), 모두 실패 = ok false
//  · 특보마다 「이 특보로 질의」 기준지역(브이월드 목록 — 고정 자료)
//  · 시연 시나리오를 켠 시연 계정(R45 — weatherFor realtimeCut)은 기상청을 부르지 않는다(통보문 본문도 409)
// 네트워크 없음 — fetch 를 바꿔 끼운다
// npx vitest run harness/weather/wxDetailRoute
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/config";
import type { WeatherResponse } from "@/lib/contract/agent";
import type { WxBulletin, WxDetailResponse } from "@/lib/wxBulletin";
import { countPwn, parsePwnCd, replayPwn, type PwnRow } from "@/lib/wxPwn";
import sample from "./kma_wrnmsg_sample.json";

const who = vi.hoisted(() => ({ acc: null as Account | null }));
vi.mock("@/lib/server/who", async (orig) => ({ ...(await orig<typeof import("@/lib/server/who")>()), whoami: async () => who.acc }));
const wx = vi.hoisted(() => ({ w: null as WeatherResponse | null }));
vi.mock("@/lib/server/weather", () => ({ weatherFor: async () => wx.w }));
vi.mock("@/lib/server/vworldAdmin", () => ({
  adminAreas: async (level: string, parent = "") =>
    level === "sido"
      ? [{ code: "26", name: "부산광역시" }, { code: "51", name: "강원특별자치도" }]
      : parent === "51"
        ? [{ code: "51810", name: "인제군" }]
        : [],
}));

let detailGET: (req: Request) => Promise<Response>;
let bulletinGET: (req: Request) => Promise<Response>;
beforeAll(async () => {
  process.env.KMA_SERVICE_KEY = "test-key";
  detailGET = (await import("@/app/api/weather/detail/route")).GET;
  bulletinGET = (await import("@/app/api/weather/bulletin/route")).GET;
});

const ACC = { id: "mois01", role: "중앙정부" } as Account;
const NOW = Date.parse("2026-11-06T14:00:00+09:00");
const live: WeatherResponse = {
  mode: "live",
  status: { ok: true, fetchedAt: new Date(NOW).toISOString(), message: "기상청 12:00 발표" },
  advisories: [
    { id: "KMA-한파주의보-강원도(인제평지,인제산지)", type: "한파", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: "2026-11-06T11:00:00+09:00", status: "발효" },
    { id: "KMA-풍랑경보-동해중부안쪽먼바다", type: "풍랑", level: "경보", area: "동해중부안쪽먼바다", issuedAt: "2026-11-06T11:00:00+09:00", status: "발효" },
  ],
  preliminary: [],
};
let calls: string[] = [];
/** 특보코드조회(getPwnCd) 응답 — 따로 센다. pwnFail 이면 500 */
let pwnCalls: string[] = [];
let pwnFail = false;
const pwnItem = (areaCode: string, areaName: string, warnVar: number, warnStress: number, tmFc: number, start: number, end = 0, cancel = 0) =>
  ({ areaCode, areaName, warnVar, warnStress, command: start ? 1 : 3, startTime: start, endTime: end, tmFc, tmSeq: tmFc % 100, cancel });
const PWN = { response: { header: { resultCode: "00" }, body: { items: { item: [
  pwnItem("L1051000", "인제평지", 3, 0, 202611061100, 202611062100),
  pwnItem("L1051100", "인제산지", 3, 0, 202611061100, 202611062100),
  pwnItem("S1131100", "동해중부안쪽먼바다", 6, 1, 202611061100, 202611061100),
  // 해제된 구역 · 취소된 특보 · 현황(특보발효현황)에 없는 종류는 세지 않는다
  pwnItem("L1100100", "부산동부", 2, 0, 202611050900, 202611050900),
  pwnItem("L1100100", "부산동부", 2, 0, 202611051500, 0, 202611051500),
  pwnItem("L1100200", "부산서부", 1, 0, 202611061000, 202611061000, 0, 1),
  pwnItem("L1020100", "서울동남권", 12, 0, 202611061000, 202611061000),
] } } } };
const fetchOk = (stn: string) => (stn === "108" ? sample : { response: { header: { resultCode: "00" }, body: { items: { item: [{ stnId: stn, tmFc: 202611061330, tmSeq: 9, t1: `${stn} 강풍주의보 발표`, t2: "(1) 강풍주의보 발표 : 부산", t3: "(1) 강풍주의보 발표 : 2026년 11월 06일 14시 00분" }] } } } });
beforeEach(() => {
  calls = [];
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  who.acc = ACC;
  wx.w = live;
  pwnCalls = [];
  pwnFail = false;
  vi.stubGlobal("fetch", async (u: string) => {
    const url = new URL(u);
    if (url.pathname.endsWith("/getPwnCd")) {
      pwnCalls.push(`${url.searchParams.get("fromTmFc")}-${url.searchParams.get("toTmFc")}`);
      return pwnFail ? new Response("오류", { status: 500 }) : Response.json(PWN);
    }
    const stn = url.searchParams.get("stnId")!;
    calls.push(`${stn}:${url.searchParams.get("fromTmFc")}-${url.searchParams.get("toTmFc")}`);
    if (stn === "105") return new Response("오류", { status: 500 });
    return Response.json(fetchOk(stn));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const get = async (q = "") => {
  const r = await detailGET(new Request(`http://t/api/weather/detail${q}`));
  return { status: r.status, body: (await r.json()) as WxDetailResponse };
};

describe("GET /api/weather/detail", () => {
  it("로그인 필요 · 시·도 코드 검사", async () => {
    who.acc = null;
    expect((await get()).status).toBe(401);
    who.acc = ACC;
    expect((await get("?sido=abc")).status).toBe(400);
  });
  it("부산(26) — 본청·부산청만, 최신순, 목록에는 본문이 없다, 상태 이력 단계, 「이 특보로 질의」 기준지역", async () => {
    const { status, body } = await get("?sido=26");
    expect(status).toBe(200);
    expect(calls).toEqual(["108:20261105-20261106", "159:20261105-20261106"]);
    expect(body.ok).toBe(true);
    expect(body.failed).toEqual([]);
    expect(body.bulletins.map((b) => b.key)).toEqual(["159|202611061330|9", "108|202611061200|35", "108|202611061100|34", "108|202611060900|33"]);
    expect(body.bulletins[0]).not.toHaveProperty("body");
    expect(body.steps[0]).toMatchObject({ title: "강풍주의보 발표", areas: "부산", stnName: "부산", seq: 9 });
    expect(body.askRegions).toEqual({
      "KMA-한파주의보-강원도(인제평지,인제산지)": { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } },
      "KMA-풍랑경보-동해중부안쪽먼바다": null,
    });
  });
  it("지점마다 60초 캐시 — 같은 분 안에 다시 열면 기상청을 다시 부르지 않는다", async () => {
    await get("?sido=26");
    expect(calls).toEqual([]);
  });
  it("강원(51) — 강릉청 실패는 이름만 알리고 본청 것은 보인다", async () => {
    const { body } = await get("?sido=51");
    expect(body.ok).toBe(true);
    expect(body.failed).toEqual(["강릉(강원도)"]);
    expect(body.bulletins.every((b) => b.stnId === "108")).toBe(true);
  });
  it("시연 시나리오를 켠 시연 계정 — 기상청을 부르지 않는다(realtimeCut), 시나리오 특보의 기준지역은 싣는다", async () => {
    wx.w = {
      mode: "live", status: { ok: true, fetchedAt: new Date(NOW).toISOString(), message: "끊음" }, realtimeCut: true, preliminary: [],
      advisories: [{ id: "SCN-IJ-1", type: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)", issuedAt: new Date(NOW).toISOString(), status: "발효", scenario: true }],
    };
    const { body } = await get("?sido=11");
    expect(calls).toEqual([]);
    expect(body).toMatchObject({ ok: true, realtimeCut: true, bulletins: [], steps: [] });
    expect(body.askRegions["SCN-IJ-1"]?.sigungu?.name).toBe("인제군");
    const r = await bulletinGET(new Request("http://t/api/weather/bulletin?key=108%7C202611061200%7C35"));
    expect(r.status).toBe(409);
    expect(calls).toEqual([]);
    expect(pwnCalls).toEqual([]);
    expect(body.counts).toBeUndefined();
  });
});

// 전국 발효 현황 — 특보코드조회(getPwnCd)를 되짚어 (종류·단계·해상 여부)별 구역 수(개발 서버 WX_POLL·WarningLedger·Nationwide)
describe("GET /api/weather/detail — 특보코드 셈(counts)", () => {
  it("최근 60일 사건을 되짚는다 · 해제·취소·특보발효현황에 없는 종류는 빼고 · 해상은 따로 · 같은 분 안에는 다시 부르지 않는다", async () => {
    vi.setSystemTime(NOW + 10 * 60_000);
    const { body } = await get("?sido=26");
    expect(pwnCalls).toEqual(["20260908-20261106"]);
    expect(body.counts).toEqual([
      { type: "한파", level: "주의보", sea: false, count: 2 },
      { type: "풍랑", level: "경보", sea: true, count: 1 },
    ]);
    await get("?sido=51");
    expect(pwnCalls).toHaveLength(1);
  });
  it("부르지 못하면 counts 없이(화면이 특보 현황 글로 센다) — 통보문은 그대로", async () => {
    vi.setSystemTime(NOW + 20 * 60_000);
    pwnFail = true;
    const { body } = await get("?sido=26");
    expect(pwnCalls).toHaveLength(1);
    expect(body.counts).toBeUndefined();
    expect(body.ok).toBe(true);
  });
});

describe("특보코드 되짚기(lib/wxPwn)", () => {
  const row = (o: Partial<PwnRow>): PwnRow => ({ areaCode: "L1", areaName: "가", warnVar: 2, warnStress: 0, start: "202611060900", end: null, announced: "202611060900", seq: 1, cancelled: false, ...o });
  it("격상 — 같은 구역·종류에 단계가 바뀐 발표가 오면 앞의 것을 닫고 새로 연다", () => {
    const open = replayPwn([row({}), row({ warnStress: 1, announced: "202611061400", start: "202611061400", seq: 2 })], null);
    expect(open.map((w) => w.kind + w.level)).toEqual(["호우경보"]);
  });
  it("해제는 단계와 무관하게 그 구역·종류를 닫는다 · 시간순으로 되짚는다(받은 순서와 무관)", () => {
    const end = row({ start: null, end: "202611061500", announced: "202611061500", seq: 3 });
    expect(replayPwn([end, row({ warnStress: 1 })], null)).toEqual([]);
  });
  it("특보발효현황을 읽지 못했으면(understood 거짓) 닫지 않는다", () => {
    expect(replayPwn([row({})], { understood: false, labels: new Set() })).toHaveLength(1);
    expect(replayPwn([row({})], { understood: true, labels: new Set() })).toHaveLength(0);
  });
  it("모르는 코드는 지어내지 않는다 · 결과 코드 03(자료 없음)은 빈 목록, 그 밖은 던진다", () => {
    expect(countPwn(replayPwn([row({ warnVar: 99 })], null))).toEqual([{ type: "기타 특보(99)", level: "주의보", sea: false, count: 1 }]);
    expect(parsePwnCd({ response: { header: { resultCode: "03" } } })).toEqual([]);
    expect(() => parsePwnCd({ response: { header: { resultCode: "30" } } })).toThrow();
  });
});

describe("GET /api/weather/bulletin", () => {
  it("열쇠로 본문 한 장 — 칸 그대로", async () => {
    const r = await bulletinGET(new Request("http://t/api/weather/bulletin?key=108%7C202611061100%7C34"));
    expect(r.status).toBe(200);
    const b = (await r.json()) as WxBulletin;
    expect(b).toMatchObject({ key: "108|202611061100|34", title: "강풍주의보 발표·풍랑경보 변경·한파주의보 발표", statusText: "o 강풍주의보 : 서해5도" });
    expect(b.areas).toContain("(3) 한파주의보 발표 : 경기도(가평, 양평서부)");
  });
  it("잘못된 열쇠 400 · 없는 통보문 404", async () => {
    expect((await bulletinGET(new Request("http://t/api/weather/bulletin?key=../etc"))).status).toBe(400);
    expect((await bulletinGET(new Request("http://t/api/weather/bulletin?key=108%7C202611061100%7C99"))).status).toBe(404);
  });
});
