// @vitest-environment jsdom
// 하네스 — 시간 표기(lib/format.ts)와 T3Q 데이터 받기 도구(lib/t3qData.ts):
// 열쇠 · 보내는 중 함께 기다리기 · 저장(2xx 만, 10분) · 실패는 다시 보냄 · 그만두기 · 여러 건 동시에 · 화면 훅
// npx vitest run harness/format
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { fmtAgo, fmtElapsed, fmtRunning } from "@/lib/format";
import {
  createT3qDataStore,
  fetchT3qMany,
  isAbortError,
  stableJson,
  t3qKey,
  t3qReqOfKey,
  useT3qData,
  useT3qDataMany,
  type T3qDataReq,
  type T3qDataResponse,
} from "@/lib/t3qData";

describe("시간 표기", () => {
  it("처리 시간 — 초 단위 반올림, 「n분 n초」·「n초」", () => {
    expect(fmtElapsed(106_000)).toBe("1분 46초");
    expect(fmtElapsed(105_500)).toBe("1분 46초");
    expect(fmtElapsed(105_499)).toBe("1분 45초");
    expect(fmtElapsed(46_000)).toBe("46초");
    expect(fmtElapsed(59_600)).toBe("1분 0초");
    expect(fmtElapsed(120_000)).toBe("2분 0초");
    expect(fmtElapsed(3_725_000)).toBe("62분 5초");
    expect(fmtElapsed(0)).toBe("0초");
  });
  it("처리 시간 — 값이 없거나 숫자가 아니면 「—」", () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(fmtElapsed(v)).toBe("—");
  });
  it("진행 중 시계 — 지난 초만(내림) + 「째」", () => {
    expect(fmtRunning(105_999)).toBe("1분 45초째");
    expect(fmtRunning(105_000)).toBe("1분 45초째");
    expect(fmtRunning(45_000)).toBe("45초째");
    expect(fmtRunning(60_000)).toBe("1분 0초째");
    expect(fmtRunning(999)).toBe("0초째");
  });
  it("진행 중 시계 — 시계 차이로 음수·숫자 아님이면 「0초째」", () => {
    expect(fmtRunning(-3_000)).toBe("0초째");
    expect(fmtRunning(Number.NaN)).toBe("0초째");
  });
  it("지난 시간 — 「n초 전」·「n분 전」·「n시간 전」(내림), 재사용 주의 줄과 브리핑 칸이 같은 표기", () => {
    expect(fmtAgo(40_000)).toBe("40초 전");
    expect(fmtAgo(59_999)).toBe("59초 전");
    expect(fmtAgo(60_000)).toBe("1분 전");
    expect(fmtAgo(59 * 60_000 + 59_000)).toBe("59분 전");
    expect(fmtAgo(3600_000)).toBe("1시간 전");
    expect(fmtAgo(18 * 3600_000 + 5 * 60_000)).toBe("18시간 전");
    expect(fmtAgo(-5_000)).toBe("0초 전");
    expect(fmtAgo(Number.NaN)).toBeNull();
  });
});

describe("조회 열쇠", () => {
  it("내용이 같으면 같은 열쇠 — 객체 키 순서·undefined 칸 무관", () => {
    const a = t3qKey({ api: "T3Q-11", id: "E1", body: { query_context: { region: { name: "부산광역시", admin_code: "2600000000" }, disaster_types: ["호우"] } } });
    const b = t3qKey({ body: { query_context: { disaster_types: ["호우"], region: { admin_code: "2600000000", name: "부산광역시" } } }, id: "E1", api: "T3Q-11", query: undefined });
    expect(a).toBe(b);
    expect(t3qKey({ api: "T3Q-10", id: "E1" })).toBe(t3qKey({ api: "T3Q-10", id: "E1", body: undefined }));
  });
  it("다르면 다른 열쇠 — api·id·body·query·배열 순서", () => {
    const base: T3qDataReq = { api: "T3Q-10", id: "E1" };
    const keys = [
      base,
      { api: "T3Q-12", id: "E1" },
      { api: "T3Q-10", id: "E2" },
      { api: "T3Q-10", id: "E1", body: { a: 1 } },
      { api: "T3Q-10", id: "E1", query: { page: "2" } },
      { api: "T3Q-04", body: { disaster_types: ["호우", "태풍"] } },
      { api: "T3Q-04", body: { disaster_types: ["태풍", "호우"] } },
    ].map(t3qKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("배열 순서는 그대로, 객체 키만 정렬", () => {
    expect(stableJson({ b: [3, 1, { d: 1, c: 2 }], a: null })).toBe('{"a":null,"b":[3,1,{"c":2,"d":1}]}');
  });
  it("열쇠 → 보낼 요청: 받은 ID 그대로, 없는 칸은 보내지 않는다", () => {
    expect(t3qReqOfKey(t3qKey({ api: "T3Q-10", id: "T10107-20210825-0001" }))).toEqual({ api: "T3Q-10", id: "T10107-20210825-0001" });
    const req = { api: "T3Q-11", id: "E1", body: { query_context: { reference_time: "2026-08-25T16:00:00+09:00" } }, query: { page: "1" } };
    expect(t3qReqOfKey(t3qKey(req))).toEqual(req);
    expect(Object.keys(t3qReqOfKey(t3qKey({ api: "T3Q-18", body: {} })))).toEqual(["api", "body"]);
  });
});

/** 응답을 손으로 내주는 가짜 받기 */
function fake() {
  const calls: { req: T3qDataReq; resolve: (r: T3qDataResponse<unknown>) => void; reject: (e: unknown) => void }[] = [];
  const fetcher = (req: T3qDataReq) => new Promise<T3qDataResponse<unknown>>((resolve, reject) => calls.push({ req, resolve, reject }));
  return { calls, fetcher };
}
const res = (envelope: unknown, http = 200): T3qDataResponse<unknown> => ({ api: "T3Q-10", http, ms: 5, envelope });
const settle = () => new Promise((r) => setTimeout(r, 0));
const REQ: T3qDataReq = { api: "T3Q-10", id: "T10107-20210825-0001" };
const KEY = t3qKey(REQ);

describe("T3Q 데이터 받기 — 저장소", () => {
  it("보내는 중인 같은 조회는 한 번만 보내고, 모두 받은 봉투 그대로(같은 객체)를 받는다", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p1 = s.load(REQ);
    const p2 = s.load({ id: REQ.id, api: REQ.api });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].req).toEqual(REQ);
    const env = { status: "SUCCESS", result: { event_summary: "요약 원문" } };
    f.calls[0].resolve(res(env));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.envelope).toBe(env);
    expect(r2.envelope).toBe(env);
  });

  it("받은 2xx 봉투는 다시 쓴다 — 새로 보내지 않고, 상태는 같은 참조", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.load(REQ);
    const env = { status: "SUCCESS", result: {} };
    f.calls[0].resolve(res(env));
    await p;
    const snap = s.peek(KEY);
    expect(snap).toEqual({ state: "ok", data: env, error: null });
    expect((await s.load(REQ)).envelope).toBe(env);
    s.ensure(KEY);
    expect(f.calls).toHaveLength(1);
    expect(s.peek(KEY)).toBe(snap);
  });

  it("10분이 지나면 다시 받되, 받는 동안은 앞의 값을 그대로 보인다", async () => {
    let t = 0;
    const f = fake();
    const s = createT3qDataStore(f.fetcher, { now: () => t });
    const p = s.load(REQ);
    const env1 = { status: "SUCCESS", result: { v: 1 } };
    f.calls[0].resolve(res(env1));
    await p;
    t = 10 * 60_000 - 1;
    s.ensure(KEY);
    expect(f.calls).toHaveLength(1);
    t = 10 * 60_000 + 1;
    s.ensure(KEY);
    expect(f.calls).toHaveLength(2);
    expect(s.peek(KEY)).toMatchObject({ state: "ok", data: env1 });
    const env2 = { status: "SUCCESS", result: { v: 2 } };
    f.calls[1].resolve(res(env2));
    await settle();
    expect(s.peek(KEY)).toMatchObject({ state: "ok", data: env2 });
  });

  it("실패는 다시 쓰지 않는다 — 다음에 다시 보내고, 그동안은 loading", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.load(REQ);
    f.calls[0].reject(new ApiError(502, "T3Q 연결 실패", {}));
    await expect(p).rejects.toBeInstanceOf(ApiError);
    expect(s.peek(KEY)).toEqual({ state: "error", data: null, error: "T3Q 연결 실패" });
    s.ensure(KEY);
    expect(f.calls).toHaveLength(2);
    expect(s.peek(KEY).state).toBe("loading");
  });

  it("오류 글 — 브라우저 영문 오류는 한국어 한 가지 글로", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.load(REQ);
    f.calls[0].reject(new TypeError("Failed to fetch"));
    await expect(p).rejects.toBeInstanceOf(TypeError);
    expect(s.peek(KEY)).toEqual({ state: "error", data: null, error: "정보를 불러오지 못했습니다." });
  });

  it("봉투가 없는 응답은 받지 못한 것으로 — ok 이면 data 는 늘 봉투 객체", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.load(REQ);
    f.calls[0].resolve({ api: "T3Q-10", http: 200, ms: 1 } as unknown as T3qDataResponse<unknown>);
    await expect(p).rejects.toBeInstanceOf(ApiError);
    expect(s.peek(KEY)).toEqual({ state: "error", data: null, error: "정보를 불러오지 못했습니다." });
  });

  it("2xx 가 아닌 봉투도 받은 그대로 ok — 다만 다시 쓰지 않는다", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.load(REQ);
    const env = { status: "ERROR", result: null, warnings: [{ code: "NOT_FOUND", message: "사건을 찾을 수 없습니다" }] };
    f.calls[0].resolve(res(env, 404));
    await p;
    expect(s.peek(KEY)).toEqual({ state: "ok", data: env, error: null });
    void s.load(REQ);
    expect(f.calls).toHaveLength(2);
  });

  it("기다리던 쪽이 그만두면 그 쪽만 AbortError — 공용 요청은 끝까지 받아 저장한다", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const ac = new AbortController();
    const p1 = s.load(REQ, { signal: ac.signal });
    const p2 = s.load(REQ);
    ac.abort();
    expect(isAbortError(await p1.catch((e: unknown) => e))).toBe(true);
    const env = { status: "SUCCESS", result: {} };
    f.calls[0].resolve(res(env));
    expect((await p2).envelope).toBe(env);
    expect(s.peek(KEY)).toEqual({ state: "ok", data: env, error: null });
    expect(f.calls).toHaveLength(1);
  });

  it("이미 끊긴 signal 이면 보내지 않고 바로 AbortError", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const ac = new AbortController();
    ac.abort();
    expect(isAbortError(await s.load(REQ, { signal: ac.signal }).catch((e: unknown) => e))).toBe(true);
    expect(f.calls).toHaveLength(0);
  });

  it("여러 ID 를 한꺼번에 보낸다(하나도 받기 전에 모두 보냄) — ids 순서대로, 한 건 실패는 그 칸만", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.loadMany("T3Q-10", ["E1", "E2", "E3"]);
    expect(f.calls.map((c) => c.req)).toEqual([{ api: "T3Q-10", id: "E1" }, { api: "T3Q-10", id: "E2" }, { api: "T3Q-10", id: "E3" }]);
    const env1 = { status: "SUCCESS", result: { event_summary: "첫째" } };
    const env3 = { status: "SUCCESS", result: { event_summary: "셋째" } };
    f.calls[2].resolve(res(env3));
    f.calls[1].reject(new ApiError(502, "T3Q 응답 시간 초과", {}));
    f.calls[0].resolve(res(env1));
    expect(await p).toEqual([
      { state: "ok", data: env1, error: null },
      { state: "error", data: null, error: "T3Q 응답 시간 초과" },
      { state: "ok", data: env3, error: null },
    ]);
  });

  it("여러 건 — 같은 ID 가 두 번 있으면 한 번만 보내고 두 칸 모두 같은 값", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const p = s.loadMany("T3Q-10", ["E1", "E1"]);
    expect(f.calls).toHaveLength(1);
    const env = { status: "SUCCESS", result: {} };
    f.calls[0].resolve(res(env));
    const out = await p;
    expect(out[0]).toEqual({ state: "ok", data: env, error: null });
    expect(out[1]).toEqual(out[0]);
  });

  it("여러 건 — 그만두면 AbortError", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const ac = new AbortController();
    const p = s.loadMany("T3Q-10", ["E1", "E2"], { signal: ac.signal });
    ac.abort();
    expect(isAbortError(await p.catch((e: unknown) => e))).toBe(true);
  });

  it("구독한 열쇠가 바뀔 때만 알린다", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher);
    const k2 = t3qKey({ api: "T3Q-10", id: "E2" });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    s.subscribe([KEY], cb1);
    const un2 = s.subscribe([k2], cb2);
    s.ensure(KEY);
    f.calls[0].resolve(res({ status: "SUCCESS" }));
    await settle();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
    un2();
    s.ensure(k2);
    f.calls[1].resolve(res({ status: "SUCCESS" }));
    await settle();
    expect(cb2).not.toHaveBeenCalled();
  });

  it("상한을 넘으면 오래된 것부터 버리되, 보는 중·보내는 중인 것은 둔다", async () => {
    const f = fake();
    const s = createT3qDataStore(f.fetcher, { maxEntries: 2 });
    const k = (id: string) => t3qKey({ api: "T3Q-10", id });
    s.subscribe([k("A")], () => {});
    for (const id of ["A", "B", "C", "D"]) {
      const p = s.load({ api: "T3Q-10", id });
      f.calls.at(-1)!.resolve(res({ status: "SUCCESS", result: { id } }));
      await p;
    }
    expect(s.size()).toBe(2);
    expect(s.peek(k("A")).state).toBe("ok");
    expect(s.peek(k("D")).state).toBe("ok");
    expect(s.peek(k("B")).state).toBe("loading");
    expect(s.peek(k("C")).state).toBe("loading");
  });
});

/** api() 가 읽는 만큼만 흉내 낸 응답 */
const jsonRes = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;
const envOf = (id: string) => ({ status: "SUCCESS", result: { event_summary: `요약 ${id}` } });

describe("T3Q 데이터 받기 — 화면 훅", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  const stubFetch = () => {
    const fn = vi.fn(async (_url: string, init?: RequestInit) => {
      const { id } = JSON.parse(String(init?.body)) as { id: string };
      if (id.endsWith("ERR")) return jsonRes(502, { error: "T3Q 연결 실패" });
      return jsonRes(200, { api: "T3Q-10", http: 200, ms: 3, envelope: envOf(id) });
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("useT3qDataMany — 처음엔 모두 loading, 칸마다 따로 도착·실패, 같은 내용의 새 배열로 다시 그려도 다시 보내지 않음", async () => {
    const fetchFn = stubFetch();
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useT3qDataMany("T3Q-10", ids), { initialProps: { ids: ["M-1", "M-ERR", "M-2"] } });
    expect(result.current.map((x) => x.state)).toEqual(["loading", "loading", "loading"]);
    await waitFor(() => expect(result.current.every((x) => x.state !== "loading")).toBe(true));
    expect(result.current).toEqual([
      { state: "ok", data: envOf("M-1"), error: null },
      { state: "error", data: null, error: "T3Q 연결 실패" },
      { state: "ok", data: envOf("M-2"), error: null },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls.map((c) => [c[0], JSON.parse(String(c[1]?.body))])).toEqual([
      ["/api/t3q/data", { api: "T3Q-10", id: "M-1" }],
      ["/api/t3q/data", { api: "T3Q-10", id: "M-ERR" }],
      ["/api/t3q/data", { api: "T3Q-10", id: "M-2" }],
    ]);
    const before = result.current;
    rerender({ ids: ["M-1", "M-ERR", "M-2"] });
    expect(result.current).toBe(before);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("useT3qData — 같은 조회를 쓰는 두 화면은 한 번만 보낸다 · req 가 없으면 보내지 않는다", async () => {
    const fetchFn = stubFetch();
    const a = renderHook(() => useT3qData({ api: "T3Q-10", id: "S-1" }));
    const b = renderHook(() => useT3qData({ id: "S-1", api: "T3Q-10" }));
    const none = renderHook(() => useT3qData(null));
    await waitFor(() => expect(a.result.current.state).toBe("ok"));
    await waitFor(() => expect(b.result.current.state).toBe("ok"));
    expect(a.result.current.data).toEqual(envOf("S-1"));
    expect(b.result.current).toBe(a.result.current);
    expect(none.result.current.state).toBe("loading");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fetchT3qMany — 화면 훅과 같은 저장소(이미 받은 것은 다시 보내지 않음)", async () => {
    const fetchFn = stubFetch();
    const first = await fetchT3qMany("T3Q-10", ["F-1", "F-2"]);
    expect(first.map((x) => x.state)).toEqual(["ok", "ok"]);
    const { result } = renderHook(() => useT3qDataMany("T3Q-10", ["F-2", "F-1"]));
    expect(result.current.map((x) => x.data)).toEqual([envOf("F-2"), envOf("F-1")]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
