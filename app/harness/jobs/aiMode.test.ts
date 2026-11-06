// 하네스 — AI 모드 상황점검(R52, 개발서버 AiModeService·T3qAiModeAgent 복제)의 실제 SQL 을 메모리 Postgres(PGlite)에서 돌린다.
// T3Q 는 녹화본 재생(replay). 특보는 서버 weather 를 흉내 낸다(서명 바뀜을 시험하려고 60초 캐시 없이)
// npx vitest run harness/jobs/aiMode
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const wx = vi.hoisted(() => ({
  ok: true,
  advisories: [] as Record<string, unknown>[],
}));
const body = () => ({
  mode: "live" as const,
  status: { ok: wx.ok, fetchedAt: new Date().toISOString(), message: "흉내" },
  advisories: wx.advisories,
  preliminary: [],
});
vi.mock("@/lib/server/kma", () => ({
  fetchLiveAdvisories: async () => ({ ok: wx.ok, message: "흉내", advisories: wx.advisories, preliminary: [] }),
}));
vi.mock("@/lib/server/weather", async () => {
  const { scenarioWeather } = await import("@/lib/scenario");
  const { scenarioGet } = await import("@/lib/server/scenario");
  return {
    liveWeather: async () => body(),
    weatherFor: async (acc: { id: string }) => scenarioWeather(await scenarioGet(), acc.id) ?? body(),
  };
});

process.env.DATABASE_URL = "pglite:memory://";
process.env.T3Q_MODE = "replay";
process.env.T3Q_MAX_GLOBAL = "8";

type Account = import("@/lib/config").Account;
let A: typeof import("@/lib/server/aiMode");
let L: typeof import("@/lib/aiMode");
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
let busan: Account;
let central: Account;
let admin: Account;

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  A = await import("@/lib/server/aiMode");
  L = await import("@/lib/aiMode");
  const { ACCOUNTS } = await import("@/lib/config");
  busan = ACCOUNTS.find((a) => a.id === "busan")!;
  central = ACCOUNTS.find((a) => a.id === "hang")!;
  admin = ACCOUNTS.find((a) => a.id === "unes")!;
});

const adv = (id: string, level: "경보" | "주의보", area: string) => ({ id, type: "호우", level, area, issuedAt: "2026-11-06T06:00:00+09:00", status: "발효" });
/** 사용자별 점검 지역(배경 그룹에 없음) */
const GN = { code: "48", name: "경상남도", level: "SIDO" as const };
/** 배경 점검 지역(그룹 0) */
const BS = { code: "26", name: "부산광역시", level: "SIDO" as const };

const checks = async (code: string) => sql.query("select * from sa_aim_checks where admin_code = $1 order by requested_at", [code]);
const jobsOf = async (c: Record<string, unknown>) => (c.jobs as { warningKey: string | null; jobId: string }[]) ?? [];
/** 점검의 질의 작업을 끝낸다 — 특보 번호별 답(null 이면 실패) */
async function finish(c: Record<string, unknown>, answers: Record<string, string | null>) {
  for (const j of await jobsOf(c)) {
    const a = answers[j.warningKey ?? ""];
    await sql.query(
      "update sa_agent_jobs set state = 'DONE', t3q_status = $2, http_status = 200, raw = $3::jsonb, finished_at = now() where id = $1",
      [j.jobId, a === null ? "FAILED" : "SUCCESS", JSON.stringify(a === null ? { status: "FAILED" } : { status: "SUCCESS", result: { answer: `  ${a}  `, no_warning_message: j.warningKey ? null : a } })],
    );
  }
}
const reset = async () => {
  await sql.query("delete from sa_aim_checks");
  wx.ok = true;
  wx.advisories = [];
};

describe("AI 모드 점검(R52) — 사용자별", () => {
  afterEach(reset);

  it("발효 특보마다 질의를 하나씩 — 그 특보 하나만 싣고 AI 모드 질의(공통 질의 글 그대로 · 시스템 호출자)", async () => {
    wx.advisories = [adv("W-1", "경보", "경남"), adv("W-2", "주의보", "경남"), adv("W-X", "경보", "서울")];
    const r = await A.aimCheck(busan, GN);
    expect(r.supported).toBe(true);
    expect(r.managed).toBe(false);
    expect(r.running).toBe(true);
    const [c] = await checks("4800000000");
    expect(c.trigger).toBe("FIRST");
    const js = await jobsOf(c);
    expect(js.map((x) => x.warningKey).sort()).toEqual(["W-1", "W-2"]); // 기준지역을 덮지 않는 서울 특보는 빠진다
    for (const x of js) {
      const [row] = await sql.query("select * from sa_agent_jobs where id = $1", [x.jobId]);
      const req = row.request as Record<string, Record<string, unknown> & { items?: { warning_key: string }[] }>;
      expect(row.account_id).toBe("SYS-AIM-4800000000");
      expect(row.source).toBe("AI_MODE");
      expect(row.question_user).toBe(L.AIM_Q);
      expect(req.weather_warnings.items!.map((i) => i.warning_key)).toEqual([x.warningKey]);
      expect(req.ai_mode.prompt_id).toBe(L.AIM_PROMPT_ID);
      expect(String(req.ai_mode.check_id)).toMatch(/^AIM-\d{8}-[0-9A-F]{6}-[12]$/);
      expect((req.caller as Record<string, unknown>).role).toBe("SYSTEM_OPERATOR");
    }
  });

  it("특보가 없으면 한 번 — 특보 목록은 비워 보낸다", async () => {
    await A.aimCheck(busan, GN);
    const [c] = await checks("4800000000");
    const js = await jobsOf(c);
    expect(js).toHaveLength(1);
    expect(js[0].warningKey).toBeNull();
    const [row] = await sql.query("select request from sa_agent_jobs where id = $1", [js[0].jobId]);
    expect((row.request as { weather_warnings: { items: unknown[] } }).weather_warnings.items).toEqual([]);
    await finish(c, { "": "대응 검토가 필요한 사유를 확인하지 못했습니다." });
    const v = (await A.aimLatest(busan, GN)).view!;
    expect(v.status).toBe("DONE");
    expect(v.guides).toEqual([]);
    expect(v.noWarningMessage).toBe("대응 검토가 필요한 사유를 확인하지 못했습니다.");
  });

  it("받은 답 = 그 특보 카드 안내(앞뒤 공백만 걷음) · 일부 실패면 받은 것만 · 모두 실패면 FAILED", async () => {
    wx.advisories = [adv("W-1", "경보", "경남"), adv("W-2", "주의보", "경남")];
    await A.aimCheck(busan, GN);
    let [c] = await checks("4800000000");
    await finish(c, { "W-1": "하천 주변 통제를 먼저 확인하십시오.", "W-2": null });
    const v = (await A.aimLatest(busan, GN)).view!;
    expect(v.status).toBe("DONE");
    expect(v.guides.map((g) => [g.warningKey, g.level, g.message])).toEqual([["W-1", "경보", "하천 주변 통제를 먼저 확인하십시오."]]);
    expect(v.warnings).toHaveLength(2);
    // 특보가 바뀌면(W-2 해제) 새로 묻고, 모두 실패면 점검 실패
    wx.advisories = [adv("W-1", "경보", "경남")];
    expect((await A.aimCheck(busan, GN)).running).toBe(true);
    c = (await checks("4800000000"))[1];
    expect(c.trigger).toBe("WARNING_CHANGED");
    await finish(c, { "W-1": null });
    expect((await A.aimLatest(busan, GN)).view!.status).toBe("FAILED");
  });

  it("특보 서명이 같고 60분 안이면 다시 묻지 않고, 60분이 지나면 SCHEDULED", async () => {
    wx.advisories = [adv("W-1", "경보", "경남")];
    await A.aimCheck(busan, GN);
    await finish((await checks("4800000000"))[0], { "W-1": "안내" });
    await A.aimLatest(busan, GN);
    expect((await A.aimCheck(busan, GN)).running).toBe(false);
    expect(await checks("4800000000")).toHaveLength(1);
    await A.aimCheck(busan, GN, Date.now() + 61 * 60_000);
    const all = await checks("4800000000");
    expect(all).toHaveLength(2);
    expect(all[1].trigger).toBe("SCHEDULED");
  });

  it("사람마다 따로 — 다른 계정의 점검은 보이지 않는다", async () => {
    await A.aimCheck(busan, GN);
    await finish((await checks("4800000000"))[0], { "": "없음" });
    expect((await A.aimLatest(busan, GN)).view).not.toBeNull();
    expect((await A.aimLatest(central, GN)).view).toBeNull();
  });
});

describe("AI 모드 점검(R52) — 배경 지역(지역 공용 회차)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await reset();
  });

  it("회차마다 한 번만 서고(여러 화면이 불러도) 지역 공용 결과를 함께 본다 · check 는 읽기만", async () => {
    wx.advisories = [adv("B-1", "경보", "부산")];
    const r1 = await A.aimLatest(busan, BS);
    expect(r1.managed).toBe(true);
    expect(r1.running).toBe(true);
    await A.aimLatest(central, BS);
    await A.aimCheck(central, BS);
    let all = await checks("2600000000");
    expect(all).toHaveLength(1);
    expect(all[0].account_id).toBeNull();
    expect(all[0].slot).not.toBeNull();
    expect((await jobsOf(all[0]))[0].jobId).toBeTruthy();
    const [row] = await sql.query("select account_id from sa_agent_jobs where id = $1", [(await jobsOf(all[0]))[0].jobId]);
    expect(row.account_id).toBe("SYS-AIM-2600000000");
    await finish(all[0], { "B-1": "부산 안내" });
    const v1 = (await A.aimLatest(busan, BS)).view!;
    const v2 = (await A.aimLatest(central, BS)).view!;
    expect(v1.checkId).toBe(v2.checkId);
    expect(v1.guides[0].message).toBe("부산 안내");
    // 다음 회차(10분 뒤) — 특보 그대로·답이 젊으면 SKIPPED 줄만
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await A.aimLatest(busan, BS);
    all = await checks("2600000000");
    expect(all.map((c) => c.status)).toEqual(["DONE", "SKIPPED"]);
    // 그다음 회차에 특보가 바뀌면 WARNING_CHANGED
    wx.advisories = [adv("B-1", "경보", "부산"), adv("B-2", "주의보", "부산")];
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await A.aimLatest(busan, BS)).running).toBe(true);
    all = await checks("2600000000");
    expect(all[2].trigger).toBe("WARNING_CHANGED");
    expect(await jobsOf(all[2])).toHaveLength(2);
  });

  it("크론(aimTickAll)은 배경 지역 전부의 회차를 건다", async () => {
    const n = await A.aimTickAll();
    expect(n).toBe(L.AIM_GROUPS.flatMap((g) => g.codes).length);
    const rows = await sql.query("select distinct admin_code from sa_aim_checks");
    expect(rows).toHaveLength(n);
  });

  it("시연 시나리오로 기상청 실시간이 끊긴 계정(R45)은 사람별 점검 — 시나리오 특보로 묻는다", async () => {
    const { scenarioSet } = await import("@/lib/server/scenario");
    const { SCN_SOURCE } = await import("@/lib/scenario");
    wx.advisories = [adv("B-1", "경보", "부산")];
    await scenarioSet(admin, { on: true, until: new Date(Date.now() + 4 * 3_600_000).toISOString(), regions: ["busan"] });
    try {
      const r = await A.aimCheck(busan, BS);
      expect(r.managed).toBe(false);
      const mine = (await checks("2600000000")).filter((c) => c.account_id === busan.id);
      expect(mine).toHaveLength(1);
      const js = await jobsOf(mine[0]);
      expect(js.map((x) => x.warningKey)).toEqual(["SCN-BS-PRE-1"]);
      const [row] = await sql.query("select request from sa_agent_jobs where id = $1", [js[0].jobId]);
      expect((row.request as { weather_warnings: { source: string } }).weather_warnings.source).toBe(SCN_SOURCE);
      // 끊지 않은 계정은 그대로 배경 지역
      expect((await A.aimLatest(central, BS)).managed).toBe(true);
    } finally {
      await scenarioSet(admin, { on: false });
    }
  });
});

describe("AI 모드 규칙(lib/aiMode)", () => {
  it("쓸 수 있는 지역 = 시·도 + 영천시·인제군", () => {
    expect(L.aimSupported({ code: "26", name: "부산광역시", level: "SIDO" })).toBe(true);
    expect(L.aimSupported({ code: "47230", name: "경상북도 영천시", level: "SIGUNGU" })).toBe(true);
    expect(L.aimSupported({ code: "51810", name: "강원특별자치도 인제군", level: "SIGUNGU" })).toBe(true);
    expect(L.aimSupported({ code: "26350", name: "부산광역시 해운대구", level: "SIGUNGU" })).toBe(false);
    expect(L.aimSupported(null)).toBe(false);
  });

  it("회차 시작 — 주기 10분, 두 그룹은 5분씩 엇갈린다(AiModeSchedule.CronOf)", () => {
    const t = Date.UTC(2026, 10, 6, 3, 17, 30);
    expect(new Date(L.aimSlotStart(0, t)).getUTCMinutes()).toBe(10);
    expect(new Date(L.aimSlotStart(1, t)).getUTCMinutes()).toBe(15);
    expect(new Date(L.aimSlotStart(1, Date.UTC(2026, 10, 6, 3, 13))).getUTCMinutes()).toBe(5);
    expect(L.aimGroupOf("2600000000")).toBe(0);
    expect(L.aimGroupOf("2700000000")).toBe(1);
    expect(L.aimGroupOf("4800000000")).toBe(-1);
  });

  it("서명은 특보 번호 순서와 무관", () => {
    expect(A.aimSignature([{ id: "a" }, { id: "b" }])).toBe(A.aimSignature([{ id: "b" }, { id: "a" }]));
    expect(A.aimSignature([])).not.toBe(A.aimSignature([{ id: "a" }]));
  });
});
