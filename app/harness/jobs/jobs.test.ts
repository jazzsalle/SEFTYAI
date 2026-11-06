// 하네스 — 질의 작업 엔진의 실제 SQL 을 메모리 Postgres(PGlite)에서, T3Q 는 녹화본 재생(replay)으로 돌린다.
// 2026-10-28 독립 검토: sweepAny 의 SQL 따옴표 누락이 아무 시험에도 걸리지 않았던 것을 막기 위함.
// npx vitest run harness/jobs
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// 답을 받은 때 특보(wx_seen) — 기상청 특보 조회(kma.ts)를 흉내 낸다: 부산에만 호우경보 발효 중, 인제는 특보 없음. calls = 기상청을 부른 횟수
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
  busan = ACCOUNTS.find((a) => a.id === "busan")!;
  inje = ACCOUNTS.find((a) => a.id === "inje")!;
  central = ACCOUNTS.find((a) => a.id === "hang")!;
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
    const j = await J.submitJob(inje, { question: "늦은 취소 시험", source: "USER", noCache: true });
    await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', finished_at = now() where id = $1", [j.id]);
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

describe("답 재사용(R52) — 시연 모드를 켠 동안만 · 켠 뒤 받은 답 · 12시간 · SUCCESS · 첫 턴 · 점검 대상 지역", () => {
  const QC = {
    busan: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } },
    busanGu: { region: { admin_code: "2635000000", level: "SIGUNGU", name: "부산광역시 해운대구" } },
    inje: { region: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" } },
    national: {},
  };
  const RAW = { status: "SUCCESS", result: { answer: "재사용 시험 답" }, meta: { base_time: "2026-10-28T06:00:00+09:00" } };
  const ACTIVE = ["QUEUED", "SUBMITTED", "RUNNING"];
  const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime());
  let D: typeof import("@/lib/server/demoMode");
  let admin: Account;
  beforeAll(async () => {
    D = await import("@/lib/server/demoMode");
    admin = (await import("@/lib/config")).ACCOUNTS.find((a) => a.id === "unes")!;
  });
  /** 시연 모드 켬 — 켠 시각을 agoH 시간 전으로 당긴다(그 뒤 받은 답이 재사용 대상) */
  const demoOn = (agoH = 20) => D.demoSet(admin, true, Date.now() - agoH * 3_600_000);
  afterEach(async () => {
    await D.demoSet(admin, false);
  });
  /** 원래 받은 답 하나 — 같은 키로 접수해 두고 완료 상태와 받은 시각만 정한다(T3Q 슬롯 상황과 무관하게) */
  const answered = async (acc: Account, question: string, qc: Record<string, unknown>, ago: string, status = "SUCCESS") => {
    const j = await J.submitJob(acc, { question, source: "USER", queryContext: qc, noCache: true });
    await sql.query(
      "update sa_agent_jobs set state = 'DONE', t3q_status = $4, http_status = 200, raw = $2, finished_at = now() - $3::interval where id = $1",
      [j.id, JSON.stringify(RAW), ago, status],
    );
    return row(j.id);
  };
  const ask = (acc: Account, question: string, qc: Record<string, unknown>) => J.submitJob(acc, { question, source: "USER", queryContext: qc });

  it("시연 모드가 꺼져 있으면 받아 둔 답을 주지 않는다 — 1분 전 답도 새로 묻는다(RAG 검증)", async () => {
    const src = await answered(inje, "재사용 시험 꺼짐", QC.inje, "1 minute");
    const j = await ask(inje, "재사용 시험 꺼짐", QC.inje);
    expect(j.cached_from).toBeNull();
    expect(j.id).not.toBe(src.id);
    expect(ACTIVE).toContain(j.state);
  });

  it("시연 모드를 켠 뒤 받은 답은 12시간 안이면 다시 쓴다 — 특보 발효 중인 부산도(D5 1시간 단축 없음)", async () => {
    await demoOn();
    const src = await answered(busan, "재사용 시험 켬", QC.busan, "2 hours");
    const j = await ask(busan, "재사용 시험 켬", QC.busan);
    expect(j.state).toBe("DONE");
    expect(j.cached_from).toBe(src.id);
    expect(JSON.stringify((await row(j.id)).raw)).toBe(JSON.stringify(src.raw));
  });

  it("켜기 전에 받은 답은 쓰지 않는다", async () => {
    const src = await answered(inje, "재사용 시험 켜기 전", QC.inje, "30 minutes");
    await D.demoSet(admin, true);
    const j = await ask(inje, "재사용 시험 켜기 전", QC.inje);
    expect(j.cached_from).toBeNull();
    expect(j.id).not.toBe(src.id);
  });

  it("끄고 다시 켜면 앞서 켰을 때 받은 답을 쓰지 않는다", async () => {
    await demoOn(2);
    await answered(inje, "재사용 시험 다시 켬", QC.inje, "1 hour");
    await D.demoSet(admin, false);
    await D.demoSet(admin, true);
    expect((await ask(inje, "재사용 시험 다시 켬", QC.inje)).cached_from).toBeNull();
  });

  it("12시간이 지난 답 · SUCCESS 가 아닌 답은 쓰지 않는다", async () => {
    await demoOn(20);
    await answered(inje, "재사용 시험 13시간", QC.inje, "13 hours");
    expect((await ask(inje, "재사용 시험 13시간", QC.inje)).cached_from).toBeNull();
    await answered(inje, "재사용 시험 일부", QC.inje, "1 hour", "PARTIAL_SUCCESS");
    expect((await ask(inje, "재사용 시험 일부", QC.inje)).cached_from).toBeNull();
  });

  it("점검 대상 지역(시·도·영천시·인제군)만 — 전국·해운대구는 다시 쓰지 않는다", async () => {
    await demoOn();
    await answered(central, "재사용 시험 전국", QC.national, "1 hour");
    expect((await ask(central, "재사용 시험 전국", QC.national)).cached_from).toBeNull();
    await answered(busan, "재사용 시험 구", QC.busanGu, "1 hour");
    expect((await ask(busan, "재사용 시험 구", QC.busanGu)).cached_from).toBeNull();
    expect(J.reuseRegion("4723000000")).toBe(true);
    expect(J.reuseRegion("1100000000")).toBe(true);
    expect(J.reuseRegion("4711000000")).toBe(false);
    expect(J.reuseRegion("47230")).toBe(false);
    expect(J.reuseRegion(null)).toBe(false);
  });

  it("이어서 묻기(T3Q 대화를 잇는 질의)는 다시 쓰지 않는다 — 첫 턴만", async () => {
    await demoOn();
    const prev = await answered(inje, "재사용 시험 앞 질문", QC.inje, "1 hour");
    await sql.query("update sa_agent_jobs set t3q_conversation_id = 'CONV-R52' where id = $1", [prev.id]);
    const follow = () => J.submitJob(inje, { question: "그 다음은?", source: "FOLLOW_UP", queryContext: QC.inje, followUp: { jobId: String(prev.id) } });
    const f1 = await J.submitJob(inje, { question: "그 다음은?", source: "FOLLOW_UP", queryContext: QC.inje, followUp: { jobId: String(prev.id) }, noCache: true });
    await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', raw = $2, finished_at = now() where id = $1", [f1.id, JSON.stringify(RAW)]);
    expect((await follow()).cached_from).toBeNull();
  });

  it("다시 쓴 사본의 시각으로 기간이 늘지 않는다 — 원래 받은 시각으로 판단", async () => {
    await demoOn();
    const src = await answered(busan, "재사용 시험 사본", QC.busan, "30 minutes");
    const copy = await ask(busan, "재사용 시험 사본", QC.busan);
    expect(copy.cached_from).toBe(src.id); // 방금 만든 사본(finished_at = 지금)
    await sql.query("update sa_agent_jobs set finished_at = now() - interval '13 hours' where id = $1", [src.id]);
    expect((await ask(busan, "재사용 시험 사본", QC.busan)).cached_from).toBeNull();
  });

  it("재사용 작업은 원래 답을 받은 시각·그때의 특보 목록을 요약·상세·목록에 함께 준다(재사용이 아니면 null)", async () => {
    await demoOn();
    const src = await answered(inje, "재사용 시험 받은 시각", QC.inje, "3 hours");
    const seen = [{ id: "KMA-호우주의보-부산", type: "호우", level: "주의보", regionId: "busan" }];
    await sql.query("update sa_agent_jobs set wx_seen = $2::jsonb where id = $1", [src.id, JSON.stringify(seen)]);
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
    expect(j.source_wx_seen).toEqual(seen);
    expect(j.wx_seen).toBeNull(); // 사본 자신의 목록은 없다 — 원래 답의 것을 쓴다
    expect(J.jobSummary(j).source_wx_seen).toEqual(seen);
    expect((await J.getJob(inje, j.id))?.source_wx_seen).toEqual(seen);
    expect((await J.getJob(inje, String(src.id)))?.source_finished_at).toBeNull();
    expect((await J.getJob(inje, String(src.id)))?.source_wx_seen).toBeNull();
  });

  it("같은 계정이 같은 질문을 진행 중이면 합류 — 시연 모드와 무관(답 재사용이 아님) · 다른 계정은 합류하지 않는다", async () => {
    const first = await J.submitJob(inje, { question: "합류 시험", source: "USER", queryContext: QC.inje, noCache: true });
    await sql.query("update sa_agent_jobs set state = 'RUNNING' where id = $1", [first.id]);
    expect((await ask(inje, "합류 시험", QC.inje)).id).toBe(first.id);
    expect((await ask(central, "합류 시험", QC.inje)).id).not.toBe(first.id);
  });

  it("브리핑의 받아 둔 답은 시연 모드일 때만 — 꺼져 있으면 실시간이고 고정 대기도 남기지 않는다 · 질문 모음은 시연 모드와 무관", async () => {
    const pinned = await answered(busan, "브리핑 고정 시험", QC.busan, "1 hour");
    await J.demoPins(); // 표 만들기
    await sql.query(
      "insert into sa_demo_pins (item_id, job_id) values ('SH-R52', $1) on conflict (item_id) do update set job_id = excluded.job_id, pending_job_id = null",
      [pinned.id],
    );
    const off = await J.submitJob(busan, { question: "브리핑 고정 시험 1", source: "BRIEFING", queryContext: QC.busan, pinId: "SH-R52" });
    expect(off.cached_from).toBeNull();
    expect((await sql.query("select pending_job_id from sa_demo_pins where item_id = 'SH-R52'"))[0].pending_job_id).toBeNull();
    await D.demoSet(admin, true);
    const on = await J.submitJob(busan, { question: "브리핑 고정 시험 2", source: "BRIEFING", queryContext: QC.busan, pinId: "SH-R52" });
    expect(on.cached_from).toBe(pinned.id);
    await D.demoSet(admin, false);
    const lib = await J.submitJob(busan, { question: "브리핑 고정 시험 3", source: "LIBRARY", queryContext: QC.busan, pinId: "SH-R52" });
    expect(lib.cached_from).toBe(pinned.id);
  });

  it("특보 조회는 /api/weather 처럼 60초 캐시 — 잇달아 접수해도 기상청은 한 번까지만 부른다(답을 받은 때 특보 wx_seen 용)", async () => {
    const before = wx.calls;
    for (const n of [1, 2, 3]) await J.submitJob(inje, { question: `특보 캐시 시험 ${n}`, source: "USER", queryContext: QC.inje });
    expect(wx.calls - before).toBeLessThanOrEqual(1);
  });

  it("작업 엔진은 특보로 재사용 기간을 줄이지 않는다(D5 폐지) — 특보는 답을 받은 때 목록(wx_seen)에만", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../../src/lib/server/jobs.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/warningInEffect|scenarioCuts|scenarioGet/);
    expect(src).not.toMatch(/from "[^"]*(server\/weather|\.\/weather)"/);
    expect(src).toMatch(/import \{ fetchLiveAdvisories \} from "\.\/kma";/);
    expect(src).toMatch(/import \{ SCN_SOURCE \} from "\.\.\/scenario";/);
  });
});

describe("시연 모드 Data API 응답(R52) — 켠 동안만 들고 있다", () => {
  let D: typeof import("@/lib/server/demoMode");
  let admin: Account;
  beforeAll(async () => {
    D = await import("@/lib/server/demoMode");
    admin = (await import("@/lib/config")).ACCOUNTS.find((a) => a.id === "unes")!;
  });
  it("꺼져 있으면 들고 있지 않고, 켜면 첫 번은 받아 두고 두 번째부터 그것을 쓴다 · 끄면 비운다 · 48시간 뒤 꺼짐", async () => {
    await D.demoSet(admin, false);
    const path = "/similar-events/search";
    const body = { query: "호우", request_id: "A" };
    expect((await D.t3qData("POST", path, body)).demoHit).toBeUndefined();
    const st = await D.demoSet(admin, true);
    expect(Date.parse(st.until!) - Date.parse(st.since!)).toBe(48 * 3_600_000);
    const a = await D.t3qData("POST", path, body);
    const b = await D.t3qData("POST", path, { ...body, request_id: "B" }); // request_id 는 열쇠에 들지 않는다
    const status = (a.body as { status?: string } | null)?.status;
    if (a.envelope && a.http < 300 && (status === "SUCCESS" || status === "NO_RESULT")) {
      expect(a.demoHit).toBeUndefined();
      expect(b.demoHit).toBe(true);
      expect(b.body).toEqual(a.body);
      expect(await D.demoEntries(st)).toBeGreaterThan(0);
    } else {
      expect(b.demoHit).toBeUndefined();
    }
    await D.demoSet(admin, false);
    expect((await sql.query("select count(*)::int as n from sa_demo_cache"))[0].n).toBe(0);
    expect((await D.t3qData("POST", path, body)).demoHit).toBeUndefined();
    const old = { on: true, since: new Date(Date.now() - 49 * 3_600_000).toISOString(), until: new Date(Date.now() - 3_600_000).toISOString(), by: null };
    expect(D.demoLive(old)).toBe(false);
    expect(D.demoKey("POST", path, { a: 1, b: 2, caller: { x: 1 } })).toBe(D.demoKey("POST", path, { b: 2, a: 1 }));
  });
});
