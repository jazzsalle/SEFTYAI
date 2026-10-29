// 하네스 — 질의 작업 엔진의 실제 SQL 을 메모리 Postgres(PGlite)에서, T3Q 는 녹화본 재생(replay)으로 돌린다.
// 2026-10-28 독립 검토: sweepAny 의 SQL 따옴표 누락이 아무 시험에도 걸리지 않았던 것을 막기 위함.
// npx vitest run harness/jobs
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// D5 — 기상청 특보 조회(kma.ts)를 흉내 낸다: 부산에만 호우경보 발효 중, 인제는 특보 없음. calls = 기상청을 부른 횟수
const wx = vi.hoisted(() => ({
  calls: 0,
  result: {
    ok: true,
    message: "발효 특보 1건",
    advisories: [{ id: "KMA-호우경보-부산", type: "호우", level: "경보", area: "부산", regionId: "busan", issuedAt: "2026-10-28T06:00:00+09:00", status: "발효" }],
    preliminary: [],
  } as { ok: boolean; message: string; advisories: Record<string, unknown>[]; preliminary: unknown[] },
}));
vi.mock("@/lib/server/kma", () => ({
  fetchLiveAdvisories: async () => {
    wx.calls++;
    return wx.result;
  },
}));

process.env.DATABASE_URL = "pglite:memory://";
process.env.T3Q_MODE = "replay";
process.env.T3Q_MAX_GLOBAL = "8";

type Jobs = typeof import("@/lib/server/jobs");
type Account = import("@/lib/config").Account;
let J: Jobs;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
let busan: Account;
let inje: Account;
let central: Account;

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  J = await import("@/lib/server/jobs");
  const { ACCOUNTS } = await import("@/lib/config");
  busan = ACCOUNTS.find((a) => a.id === "bs_safety01")!;
  inje = ACCOUNTS.find((a) => a.id === "ij_safety01")!;
  central = ACCOUNTS.find((a) => a.id === "mois_dsd01")!;
});

const stale = (id: string) => sql.query("update sa_agent_jobs set last_polled_at = now() - interval '5 minutes' where id = $1", [id]);
const row = async (id: string) => (await sql.query("select * from sa_agent_jobs where id = $1", [id]))[0];

describe("질의 작업 엔진", () => {
  it("병렬 접수에도 계정당 동시 한도(4)를 넘지 않는다", async () => {
    const jobs = await Promise.all(Array.from({ length: 6 }, (_, i) => J.submitJob(busan, { question: `병렬 시험 ${i}`, source: "USER", queryContext: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } } })));
    const states = await Promise.all(jobs.map((j) => row(j.id).then((r) => r.state as string)));
    const running = states.filter((s) => s === "SUBMITTED" || s === "RUNNING").length;
    expect(running).toBeLessThanOrEqual(4);
    expect(states.filter((s) => s === "QUEUED").length).toBe(6 - running);
  });

  it("sweepAny 의 SQL 이 실행되고 방치된 작업을 진행한다", async () => {
    const j = await J.submitJob(inje, { question: "방치 시험", source: "USER", noCache: true });
    await stale(j.id);
    const before = await row(j.id);
    const n = await J.sweepAny(10, 20000);
    expect(n).toBeGreaterThan(0);
    const after = await row(j.id);
    expect(String(after.last_polled_at) !== String(before.last_polled_at) || after.state !== before.state).toBe(true);
  });

  it("폴링을 거듭하면 녹화된 답으로 끝나고 원응답을 그대로 저장한다 — 그때 발효 중인 특보 목록도(C9·D5)", async () => {
    const j = await J.submitJob(inje, { question: "완료 시험", source: "USER", noCache: true });
    for (let i = 0; i < 6; i++) {
      await stale(j.id);
      const got = await J.getJob(inje, j.id);
      if (got?.state === "DONE") break;
    }
    const r = await row(j.id);
    expect(r.state).toBe("DONE");
    expect((r.raw as { result?: { answer?: string } }).result?.answer?.length).toBeGreaterThan(0);
    // 답을 받은 때 발효 중이던 기상청 특보 — 지역을 가리지 않고 받은 값 그대로(화면의 「답변을 받은 뒤 특보」는 이 목록에 없던 것만)
    const seen = [{ id: "KMA-호우경보-부산", type: "호우", level: "경보", regionId: "busan" }];
    expect(r.wx_seen).toEqual(seen);
    const got = await J.getJob(inje, j.id);
    expect(got?.wx_seen).toEqual(seen);
    expect(J.jobSummary(got!).wx_seen).toEqual(seen);
    expect(got?.source_wx_seen).toBeNull();
  });

  it("끝난 작업은 늦게 온 취소·완료가 덮지 않는다(상태 조건)", async () => {
    const j = await J.submitJob(inje, { question: "완료 시험", source: "USER" }); // 캐시로 즉시 완료
    expect((await row(j.id)).state).toBe("DONE");
    const c = await J.cancelJob(inje, j.id);
    expect(c?.state).toBe("DONE");
  });

  it("T3Q 가 작업을 잃으면(NOT_FOUND) 같은 작업 행으로 한 번 다시 보낸다", async () => {
    const j = await J.submitJob(inje, { question: "유실 시험", source: "USER", noCache: true });
    // T3Q 가 모르는 요청 ID 로 바꿔 유실을 흉내 낸다
    await sql.query("update sa_agent_jobs set t3q_request_id = 'lost-request-id', state = 'RUNNING' where id = $1", [j.id]);
    await stale(j.id);
    await J.getJob(inje, j.id);
    const r = await row(j.id);
    expect(r.retries).toBe(1);
    expect(["QUEUED", "SUBMITTED", "RUNNING"]).toContain(r.state);
    expect(r.t3q_request_id).not.toBe("lost-request-id");
  });

  it("다시 질의는 같은 요청(문맥 포함)으로 새 작업을 만든다", async () => {
    const j = await J.submitJob(inje, { question: "다시 질의 시험", source: "BRIEFING", briefing: { item_no: 2, item_total: 4 }, noCache: true });
    const again = await J.retryJob(inje, j.id);
    expect(again?.id).not.toBe(j.id);
    const a = await row(again!.id), o = await row(j.id);
    expect(JSON.stringify(a.request)).toBe(JSON.stringify(o.request));
    expect(a.retry_of).toBe(j.id);
  });
});

describe("재사용 기준(D5) — 원래 받은 시각 기준 24시간, 접수 때 그 지역 특보 발효 중이면 1시간", () => {
  const QC = {
    busan: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } },
    busanGu: { region: { admin_code: "2635000000", level: "SIGUNGU", name: "부산광역시 해운대구" } },
    inje: { region: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" } },
    national: {},
  };
  const RAW = { status: "SUCCESS", result: { answer: "재사용 시험 답" }, meta: { base_time: "2026-10-28T06:00:00+09:00" } };
  const ACTIVE = ["QUEUED", "SUBMITTED", "RUNNING"];
  const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime());
  /** 원래 받은 답 하나 — 같은 키로 접수해 두고 완료 상태와 받은 시각만 정한다(T3Q 슬롯 상황과 무관하게) */
  const answered = async (acc: Account, question: string, qc: Record<string, unknown>, ago: string) => {
    const j = await J.submitJob(acc, { question, source: "USER", queryContext: qc, noCache: true });
    await sql.query(
      "update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() - $3::interval where id = $1",
      [j.id, JSON.stringify(RAW), ago],
    );
    return row(j.id);
  };
  const ask = (acc: Account, question: string, qc: Record<string, unknown>) => J.submitJob(acc, { question, source: "USER", queryContext: qc });

  it("특보가 없는 지역(인제)은 2시간 전 답을 다시 쓴다(24시간 안)", async () => {
    const src = await answered(inje, "재사용 시험 특보 없음", QC.inje, "2 hours");
    const j = await ask(inje, "재사용 시험 특보 없음", QC.inje);
    expect(j.state).toBe("DONE");
    expect(j.cached_from).toBe(src.id);
    expect(JSON.stringify((await row(j.id)).raw)).toBe(JSON.stringify(src.raw));
  });

  it("특보가 없어도 24시간이 지난 답은 다시 쓰지 않는다", async () => {
    await answered(inje, "재사용 시험 25시간", QC.inje, "25 hours");
    const j = await ask(inje, "재사용 시험 25시간", QC.inje);
    expect(j.cached_from).toBeNull();
    expect(ACTIVE).toContain(j.state);
  });

  it("특보 발효 중인 지역(부산)은 2시간 전 답을 다시 쓰지 않고 새로 묻는다", async () => {
    const src = await answered(busan, "재사용 시험 특보 발효", QC.busan, "2 hours");
    const j = await ask(busan, "재사용 시험 특보 발효", QC.busan);
    expect(j.id).not.toBe(src.id);
    expect(j.cached_from).toBeNull();
    expect(j.source_finished_at).toBeNull();
    expect(ACTIVE).toContain(j.state);
  });

  it("부산 아래 구를 고른 질문도 부산 특보로 본다", async () => {
    await answered(busan, "재사용 시험 해운대구", QC.busanGu, "2 hours");
    const j = await ask(busan, "재사용 시험 해운대구", QC.busanGu);
    expect(j.cached_from).toBeNull();
  });

  it("전국 질문은 어느 지역이든 특보가 발효 중이면 1시간 기준", async () => {
    await answered(central, "재사용 시험 전국", QC.national, "2 hours");
    const j = await ask(central, "재사용 시험 전국", QC.national);
    expect(j.cached_from).toBeNull();
  });

  it("특보 발효 중이어도 1시간 안에 받은 답은 다시 쓴다", async () => {
    const src = await answered(busan, "재사용 시험 30분", QC.busan, "30 minutes");
    const j = await ask(busan, "재사용 시험 30분", QC.busan);
    expect(j.state).toBe("DONE");
    expect(j.cached_from).toBe(src.id);
  });

  it("다시 쓴 사본의 시각으로 기간이 늘지 않는다 — 원래 받은 시각으로 판단", async () => {
    const src = await answered(busan, "재사용 시험 사본", QC.busan, "30 minutes");
    const copy = await ask(busan, "재사용 시험 사본", QC.busan);
    expect(copy.cached_from).toBe(src.id); // 방금 만든 사본(finished_at = 지금)
    await sql.query("update sa_agent_jobs set finished_at = now() - interval '2 hours' where id = $1", [src.id]);
    const j = await ask(busan, "재사용 시험 사본", QC.busan);
    expect(j.cached_from).toBeNull();
  });

  it("재사용 작업은 원래 답을 받은 시각을 요약·상세·목록에 함께 준다(재사용이 아니면 null)", async () => {
    const src = await answered(inje, "재사용 시험 받은 시각", QC.inje, "3 hours");
    const j = await ask(inje, "재사용 시험 받은 시각", QC.inje);
    const want = ms(src.finished_at);
    expect(j.cached_from).toBe(src.id);
    expect(ms(j.source_finished_at)).toBe(want);
    expect(ms(J.jobSummary(j).source_finished_at)).toBe(want);
    expect(ms((await J.getJob(inje, j.id))?.source_finished_at)).toBe(want);
    expect(ms((await J.listJobs(inje)).find((x) => x.id === j.id)?.source_finished_at)).toBe(want);
    expect(ms((await J.setPreview(j.id, []))?.source_finished_at)).toBe(want);
    // 재사용 작업의 finished_at 은 다시 쓴 시각 — 원래 받은 시각과 다르다
    expect(ms(j.finished_at)! - want!).toBeGreaterThan(2 * 3600_000);
    expect((await J.getJob(inje, String(src.id)))?.source_finished_at).toBeNull();
    expect((await J.listJobs(inje)).find((x) => x.id === src.id)?.source_finished_at).toBeNull();
  });

  it("재사용 작업은 원래 답을 받은 때의 특보 목록을 요약·상세·목록에 함께 준다(재사용이 아니면 null)", async () => {
    const src = await answered(inje, "재사용 시험 특보 목록", QC.inje, "3 hours");
    const seen = [{ id: "KMA-호우주의보-부산", type: "호우", level: "주의보", regionId: "busan" }];
    await sql.query("update sa_agent_jobs set wx_seen = $2::jsonb where id = $1", [src.id, JSON.stringify(seen)]);
    const j = await ask(inje, "재사용 시험 특보 목록", QC.inje);
    expect(j.cached_from).toBe(src.id);
    expect(j.source_wx_seen).toEqual(seen);
    expect(j.wx_seen).toBeNull(); // 사본 자신의 목록은 없다 — 원래 답의 것을 쓴다
    expect(J.jobSummary(j).source_wx_seen).toEqual(seen);
    expect((await J.getJob(inje, j.id))?.source_wx_seen).toEqual(seen);
    expect((await J.listJobs(inje)).find((x) => x.id === j.id)?.source_wx_seen).toEqual(seen);
    expect((await J.setPreview(j.id, []))?.source_wx_seen).toEqual(seen);
    expect((await J.getJob(inje, String(src.id)))?.source_wx_seen).toBeNull();
  });

  it("특보 조회는 /api/weather 처럼 60초 캐시 — 잇달아 접수해도 기상청은 한 번까지만 부른다", async () => {
    const before = wx.calls;
    for (const n of [1, 2, 3]) {
      await answered(inje, `재사용 시험 캐시 ${n}`, QC.inje, "2 hours");
      expect((await ask(inje, `재사용 시험 캐시 ${n}`, QC.inje)).state).toBe("DONE");
    }
    expect(wx.calls - before).toBeLessThanOrEqual(1);
    expect(wx.calls).toBeGreaterThan(0);
  });

  it("시연 시나리오 특보가 켜져 있어도 D5 는 기상청 실시간만 본다 — 인제(기상청 특보 없음)는 시나리오 특보를 실은 2시간 전 답도 다시 쓴다(R43)", async () => {
    const { ACCOUNTS } = await import("@/lib/config");
    const { scenarioSet } = await import("@/lib/server/scenario");
    const { scenarioAdvisories, scenarioLive } = await import("@/lib/scenario");
    const { warningsPayload } = await import("@/lib/wxref");
    const admin = ACCOUNTS.find((a) => a.id === "admin01")!;
    const st = await scenarioSet(admin, { on: true, until: new Date(Date.now() + 4 * 3_600_000).toISOString() });
    try {
      expect(scenarioLive(st)).toBe(true);
      const scn = scenarioAdvisories(st, inje.id);
      expect(scn.map((a) => a.id)).toEqual(["SCN-IJ-1"]);
      // 브리핑처럼 시나리오 특보를 weather_warnings 로 싣는다(재사용 열쇠에 SCN-IJ-1 이 든다)
      const ww = warningsPayload({ mode: "live", status: { ok: true, fetchedAt: new Date().toISOString(), message: "" }, advisories: scn, preliminary: [] }, scn);
      const first = await J.submitJob(inje, { question: "재사용 시험 시나리오", source: "BRIEFING", queryContext: QC.inje, weatherWarnings: ww, noCache: true });
      await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() - interval '2 hours' where id = $1", [first.id, JSON.stringify(RAW)]);
      const j = await J.submitJob(inje, { question: "재사용 시험 시나리오", source: "BRIEFING", queryContext: QC.inje, weatherWarnings: ww });
      expect(j.cached_from).toBe(first.id);
      expect(j.state).toBe("DONE");
    } finally {
      await scenarioSet(admin, { on: false });
    }
    // 작업 엔진은 시나리오(lib/scenario · server/scenario · server/weather)를 읽지 않는다 — D5·답을 받은 때 특보(wx_seen)는 kma.ts 만
    const src = (await import("node:fs")).readFileSync(new URL("../../src/lib/server/jobs.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "[^"]*(scenario|server\/weather|\.\/weather)"/);
    expect(src).toMatch(/import \{ fetchLiveAdvisories \} from "\.\/kma";/);
  });

  // 마지막에 둔다 — 새 모듈(빈 특보 캐시)로 조회 실패를 흉내 낸다. DB 는 같은 PGlite
  it("특보 조회가 안 되면 24시간 기준 그대로(부산이어도 2시간 전 답을 다시 쓴다)", async () => {
    const saved = wx.result;
    wx.result = { ok: false, message: "기상청 API 연결 실패", advisories: [], preliminary: [] };
    try {
      vi.resetModules();
      const fresh: Jobs = await import("@/lib/server/jobs");
      const src = await answered(busan, "재사용 시험 조회 실패", QC.busan, "2 hours");
      const before = wx.calls;
      const j = await fresh.submitJob(busan, { question: "재사용 시험 조회 실패", source: "USER", queryContext: QC.busan });
      expect(wx.calls).toBe(before + 1);
      expect(j.cached_from).toBe(src.id);
      expect(ms(j.source_finished_at)).toBe(ms(src.finished_at));
      // 답을 받을 때 특보 조회가 안 되면 그때의 특보 목록은 null(모름) — 「없었음」(빈 목록)과 다르다. 앞 시험의 진행 작업은 비워 슬롯을 연다
      await sql.query("update sa_agent_jobs set state = 'CANCELLED', finished_at = now() - interval '10 minutes' where state in ('QUEUED','SUBMITTED','RUNNING')");
      const k = await fresh.submitJob(central, { question: "특보 목록 모름 시험", source: "USER", noCache: true });
      for (let i = 0; i < 6; i++) {
        await stale(k.id);
        if ((await fresh.getJob(central, k.id))?.state === "DONE") break;
      }
      const kr = await row(k.id);
      expect(kr.state).toBe("DONE");
      expect(kr.wx_seen).toBeNull();
    } finally {
      wx.result = saved;
    }
  });
});

describe("AI 모드 점검(R39) — 같은 계정 같은 10분 구간이면 새 행 없이 원래 점검 작업", () => {
  const QC = { region: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" } };
  const RAW = { status: "SUCCESS", result: { answer: "점검 시험 답" }, meta: { base_time: "2026-10-28T06:00:00+09:00" } };
  const aim = (acc: Account, question: string) =>
    J.submitJob(acc, { question, source: "AI_MODE", queryContext: QC, weatherWarnings: { items: [] }, aiMode: { trigger: "START", interval_min: 10 } });
  const done = (id: string) =>
    sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() where id = $1", [id, JSON.stringify(RAW)]);
  const count = async (key: unknown) => (await sql.query("select count(*)::int as n from sa_agent_jobs where cache_key = $1", [key]))[0].n as number;
  // 10분 구간 경계에 걸리지 않게 — 날짜만 지금 구간의 가운데로(DB 시각·타이머는 그대로)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Math.floor(Date.now() / 600_000) * 600_000 + 300_000);
  });
  afterEach(() => vi.useRealTimers());

  it("같은 계정이 다시 보내면(새로 고침·새 탭) 사본 행 없이 원래 점검 작업을 그대로 돌려준다", async () => {
    const first = await aim(inje, "AI 모드 점검 시험 1");
    await done(first.id);
    const key = (await row(first.id)).cache_key;
    const n = await count(key);
    for (let i = 0; i < 3; i++) {
      const again = await aim(inje, "AI 모드 점검 시험 1");
      expect(again.id).toBe(first.id);
      expect(again.cached_from).toBeNull();
      expect(again.source_finished_at).toBeNull();
      expect(again.state).toBe("DONE");
    }
    expect(await count(key)).toBe(n);
  });

  it("진행 중인 점검도 같은 작업에 합류한다", async () => {
    const first = await aim(inje, "AI 모드 점검 시험 진행");
    await sql.query("update sa_agent_jobs set state = 'RUNNING' where id = $1", [first.id]);
    const again = await aim(inje, "AI 모드 점검 시험 진행");
    expect(again.id).toBe(first.id);
  });

  it("다른 계정의 원래 답이면 지금처럼 재사용 사본", async () => {
    const first = await aim(inje, "AI 모드 점검 시험 2");
    await done(first.id);
    const key = (await row(first.id)).cache_key;
    const n = await count(key);
    const other = await aim(central, "AI 모드 점검 시험 2");
    expect(other.id).not.toBe(first.id);
    expect(other.cached_from).toBe(first.id);
    expect(other.account_id).toBe(central.id);
    expect(await count(key)).toBe(n + 1);
  });

  it("같은 구간에 다른 계정의 더 새 원래 답이 있어도 자기 원래 점검 작업을 돌려준다", async () => {
    const mine = await aim(inje, "AI 모드 점검 시험 3");
    await done(mine.id);
    const theirs = await J.submitJob(central, { question: "AI 모드 점검 시험 3", source: "AI_MODE", queryContext: QC, weatherWarnings: { items: [] }, noCache: true });
    await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() + interval '1 minute' where id = $1", [theirs.id, JSON.stringify(RAW)]);
    expect((await aim(inje, "AI 모드 점검 시험 3")).id).toBe(mine.id);
  });

  it("AI 모드가 아닌 질문은 같은 계정이어도 지금처럼 사본", async () => {
    const first = await J.submitJob(inje, { question: "AI 모드 아닌 시험", source: "USER", queryContext: QC, noCache: true });
    await done(first.id);
    const again = await J.submitJob(inje, { question: "AI 모드 아닌 시험", source: "USER", queryContext: QC });
    expect(again.id).not.toBe(first.id);
    expect(again.cached_from).toBe(first.id);
  });
});
