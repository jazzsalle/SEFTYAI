// 하네스 — 시연 시나리오 특보(R43) 서버 판단: /api/weather 가 로그인 계정·켜짐·끝나는 시각으로 정한다(화면이 고르지 않는다)
//  · 운영관리 /api/admin/scenario(운영자만 바꿈) → kv system · demo_scenario(메모리 Postgres, PGlite)
//  · 켠 동안 시연 계정은 기상청 실시간 특보를 받지 않고(부르지도 않음) 그 지역 시나리오 하나만(R45) · 중앙정부·운영자는 기상청 그대로 · 끄면 · 끝나는 시각이 지나면 다시 실시간
//  · 「시연 세트 예열」 브리핑 특보(weatherFor)도 같은 값
// npx vitest run harness/region/scenarioRoute.test.ts
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/config";
import type { WeatherResponse } from "@/lib/contract/agent";
import type { AdminScenarioResponse } from "@/lib/adminTypes";

// 기상청 — 부산 강풍주의보 1건(실시간) · 예비특보 1건. calls = 기상청을 부른 횟수
const kma = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/server/kma", () => ({
  fetchLiveAdvisories: async () => {
    kma.calls++;
    return {
      ok: true,
      message: "기상청 08:00 발표",
      advisories: [{ id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: "2026-11-05T08:00:00+09:00", status: "발효" }],
      preliminary: [{ text: "o 강풍 예비특보 : 11월 5일 밤 : 부산", at: "2026-11-05T08:00:00+09:00" }],
    };
  },
}));
// 로그인 계정 — 시험이 정한다(세션 쿠키 대신)
const who = vi.hoisted(() => ({ acc: null as Account | null }));
vi.mock("@/lib/server/who", async (orig) => ({ ...(await orig<typeof import("@/lib/server/who")>()), whoami: async () => who.acc }));

process.env.DATABASE_URL = "pglite:memory://";

let ACC: Record<string, Account>;
let weatherGET: (req: Request) => Promise<Response>;
let scnGET: (req: Request) => Promise<Response>;
let scnPOST: (req: Request) => Promise<Response>;
let weatherFor: typeof import("@/lib/server/weather").weatherFor;

beforeAll(async () => {
  const { ACCOUNTS } = await import("@/lib/config");
  ACC = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));
  weatherGET = (await import("@/app/api/weather/route")).GET;
  const r = await import("@/app/api/admin/scenario/route");
  scnGET = r.GET;
  scnPOST = r.POST;
  weatherFor = (await import("@/lib/server/weather")).weatherFor;
});
afterEach(() => vi.useRealTimers());

const req = (body?: unknown) => new Request("http://t/api", body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const as = (id: string) => (who.acc = ACC[id]);
const ids = async (id: string) => {
  as(id);
  const r = await weatherGET(req());
  expect(r.status).toBe(200);
  const w = (await r.json()) as WeatherResponse;
  expect(w.accountId).toBe(id); // 화면(lib/session)이 자기 계정과 견주어 다르면 버린다
  return w.advisories.map((a) => `${a.id}${a.scenario ? "*" : ""}`);
};
const set = async (body: unknown) => {
  as("admin01");
  return scnPOST(req(body));
};
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe("시연 시나리오 특보 — 서버가 계정·켜짐·끝나는 시각으로 판단", () => {
  it("처음엔 꺼짐 — 모든 계정이 기상청 특보만", async () => {
    as("admin01");
    const g = (await (await scnGET(req())).json()) as AdminScenarioResponse;
    expect(g.live).toBe(false);
    for (const id of ["bs_safety01", "ij_safety01", "yc_safety02", "mois_dsd01", "admin01"]) expect(await ids(id)).toEqual(["KMA-강풍주의보-부산"]);
  });

  it("운영자만 켜고 끈다 — 지자체·중앙정부는 403 · 끝나는 시각이 없거나 지났거나 48시간 넘으면 400", async () => {
    for (const id of ["bs_safety01", "mois_dsd01"]) {
      as(id);
      expect((await scnPOST(req({ on: true, until: inHours(2) }))).status).toBe(403);
      expect((await scnGET(req())).status).toBe(403);
    }
    expect((await set({ on: true })).status).toBe(400);
    expect((await set({ on: true, until: inHours(-1) })).status).toBe(400);
    expect((await set({ on: true, until: inHours(49) })).status).toBe(400);
    expect((await set({ on: true, until: inHours(2), regions: [] })).status).toBe(400);
    expect((await set({ on: true, until: inHours(2), regions: ["seoul"] })).status).toBe(400);
    expect(await ids("bs_safety01")).toEqual(["KMA-강풍주의보-부산"]);
  });

  it("켜면 시연 계정 셋은 기상청 실시간을 끊고 그 지역 시나리오 하나만 — 중앙정부·운영자는 기상청 그대로", async () => {
    const r = await set({ on: true, until: inHours(4) });
    expect(r.status).toBe(200);
    const b = (await r.json()) as AdminScenarioResponse;
    expect(b.live).toBe(true);
    expect(b.state.regions).toEqual(["busan", "inje", "yeongcheon"]);
    expect(await ids("bs_safety01")).toEqual(["SCN-BS-1*"]);
    expect(await ids("ij_safety01")).toEqual(["SCN-IJ-1*"]);
    expect(await ids("yc_safety02")).toEqual(["SCN-YC-1*"]);
    expect(await ids("mois_dsd01")).toEqual(["KMA-강풍주의보-부산"]);
    expect(await ids("admin01")).toEqual(["KMA-강풍주의보-부산"]);
    // 예열의 브리핑 특보도 같은 값(계정 화면이 받는 특보)
    expect((await weatherFor(ACC.bs_safety01)).advisories.map((a) => a.id)).toEqual(["SCN-BS-1"]);
    expect((await weatherFor(ACC.admin01)).advisories.map((a) => a.id)).toEqual(["KMA-강풍주의보-부산"]);
  });

  it("끊긴 계정은 기상청을 부르지 않는다 — 예비특보 없음 · 상태 ok · 조회 시각 = 지금(특보 발표 시각 = 켠 시각) · 끊김 글 · realtimeCut. 끊지 않은 계정은 기상청 그대로(예비특보 포함)", async () => {
    as("admin01");
    const st = ((await (await scnGET(req())).json()) as AdminScenarioResponse).state;
    // 서버 기상청 캐시(60초)를 지나 — 이제 부르면 셀 수 있다
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    const before = kma.calls;
    for (const id of ["bs_safety01", "ij_safety01", "yc_safety02"]) {
      as(id);
      const w = (await (await weatherGET(req())).json()) as WeatherResponse;
      expect(w.realtimeCut).toBe(true);
      expect(w.status).toEqual({ ok: true, fetchedAt: new Date().toISOString(), message: "시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다" });
      expect(w.preliminary).toEqual([]);
      expect(w.advisories.every((a) => a.scenario && a.issuedAt === st.startedAt)).toBe(true);
      await weatherFor(ACC[id]);
    }
    expect(kma.calls).toBe(before); // 기상청 호출 0회
    as("mois_dsd01");
    const m = (await (await weatherGET(req())).json()) as WeatherResponse;
    expect(kma.calls).toBe(before + 1);
    expect(m.realtimeCut).toBeUndefined();
    expect(m.status.message).toBe("기상청 08:00 발표");
    expect(m.preliminary).toHaveLength(1);
  });

  it("켜 둔 채 지역·끝나는 시각을 바꾸면 켠 시각은 그대로, 고르지 않은 지역의 시연 계정은 다시 실시간", async () => {
    as("admin01");
    const before = ((await (await scnGET(req())).json()) as AdminScenarioResponse).state;
    const b = (await (await set({ on: true, until: inHours(6), regions: ["inje"] })).json()) as AdminScenarioResponse;
    expect(b.state.startedAt).toBe(before.startedAt);
    expect(b.state.regions).toEqual(["inje"]);
    expect(await ids("bs_safety01")).toEqual(["KMA-강풍주의보-부산"]);
    expect(await ids("ij_safety01")).toEqual(["SCN-IJ-1*"]);
  });

  it("끄면 다시 실시간", async () => {
    await set({ on: true, until: inHours(4) });
    expect(await ids("bs_safety01")).toEqual(["SCN-BS-1*"]);
    const r = await set({ on: false });
    expect(((await r.json()) as AdminScenarioResponse).live).toBe(false);
    for (const id of ["bs_safety01", "ij_safety01", "yc_safety02"]) expect(await ids(id)).toEqual(["KMA-강풍주의보-부산"]);
  });

  it("끝나는 시각이 지나면 저절로 다시 실시간(끄지 않아도)", async () => {
    await set({ on: true, until: inHours(1) });
    expect(await ids("yc_safety02")).toEqual(["SCN-YC-1*"]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60_000);
    expect(await ids("yc_safety02")).toEqual(["KMA-강풍주의보-부산"]);
    as("admin01");
    expect(((await (await scnGET(req())).json()) as AdminScenarioResponse).live).toBe(false);
  });
});
