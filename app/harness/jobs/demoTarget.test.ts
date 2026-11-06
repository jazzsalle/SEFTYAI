// 하네스 — 시연 모드 대상 계정(R52-1, 사용자 결정 2026-11-06): 켜져 있어도 저장 답은 운영자가 켤 때 고른 계정만(demoFor).
//  · 기본 대상 = busan2 하나 · 운영자(unes·issuer)만 켜고 끄고 대상을 바꾼다 · 끄면 대상도 비운다
//  · 대상 계정은 다시 쓰고(켠 뒤 받은 답이면 대상 아닌 계정이 받은 것도), 대상 아닌 계정은 켜져 있어도 늘 새로 받는다
//  · Data API 응답 저장소는 대상 계정끼리만 — 대상 아닌 계정은 읽지도 쓰지도 않는다
// npx vitest run harness/jobs/demoTarget.test.ts
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/config";
import type { AdminDemoModeResponse } from "@/lib/adminTypes";

vi.mock("@/lib/server/kma", () => ({
  fetchLiveAdvisories: async () => ({ ok: true, message: "특보 없음", advisories: [], preliminary: [] }),
}));
// 로그인 계정 — 시험이 정한다(세션 쿠키 대신)
const who = vi.hoisted(() => ({ acc: null as Account | null }));
vi.mock("@/lib/server/who", async (orig) => ({ ...(await orig<typeof import("@/lib/server/who")>()), whoami: async () => who.acc }));

process.env.DATABASE_URL = "pglite:memory://";
process.env.T3Q_MODE = "replay";
process.env.T3Q_MAX_GLOBAL = "8";

let ACC: Record<string, Account>;
let D: typeof import("@/lib/server/demoMode");
let J: typeof import("@/lib/server/jobs");
let GET: (req: Request) => Promise<Response>;
let POST: (req: Request) => Promise<Response>;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  ACC = Object.fromEntries((await import("@/lib/config")).ACCOUNTS.map((a) => [a.id, a]));
  D = await import("@/lib/server/demoMode");
  J = await import("@/lib/server/jobs");
  const r = await import("@/app/api/admin/demo-mode/route");
  GET = r.GET;
  POST = r.POST;
});
afterEach(async () => {
  await D.demoSet(ACC.unes, false);
});

const req = (body?: unknown) => new Request("http://t/api", body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const post = async (id: string, body: unknown) => {
  who.acc = ACC[id];
  const r = await POST(req(body));
  return { status: r.status, body: (await r.json()) as AdminDemoModeResponse };
};

describe("시연 모드 대상 계정(R52-1) — 운영자만 켜고, 고른 계정만 저장 답을 쓴다", () => {
  it("운영자만 켜고 끄고 대상을 바꾼다 — 지자체·중앙정부는 403", async () => {
    for (const id of ["busan", "busan2", "inje", "01000", "hang"]) {
      who.acc = ACC[id];
      expect((await POST(req({ on: true }))).status).toBe(403);
      expect((await POST(req({ accounts: [id] }))).status).toBe(403);
      expect((await GET(req())).status).toBe(403);
    }
    expect(D.demoLive(await D.demoRead())).toBe(false);
  });

  it("켤 때 고르지 않으면 기본 busan2 하나 · 켜 둔 채 바꾸기(켠 시각 그대로) · 끄면 대상도 비움 · 꺼져 있으면 바꾸기 409", async () => {
    const on = await post("unes", { on: true });
    expect(on.status).toBe(200);
    expect(on.body.live).toBe(true);
    expect(on.body.state.accounts).toEqual(["busan2"]);
    const ch = await post("issuer", { accounts: ["inje", "busan", "없는계정"] });
    expect(ch.status).toBe(200);
    expect(ch.body.state.accounts).toEqual(["busan", "inje"]); // 있는 계정만, 계정 순서대로
    expect(ch.body.state.since).toBe(on.body.state.since);
    expect((await post("unes", { accounts: ["없는계정"] })).status).toBe(400);
    expect((await post("unes", { on: true, accounts: [] })).status).toBe(400);
    const off = await post("unes", { on: false });
    expect(off.body.live).toBe(false);
    expect(off.body.state.accounts).toEqual([]);
    expect((await post("unes", { accounts: ["busan"] })).status).toBe(409);
    const picked = await post("unes", { on: true, accounts: ["busan", "inje", "01000"] });
    expect(picked.body.state.accounts).toEqual(["busan", "01000", "inje"]);
  });

  it("demoFor — 켜짐·끝나는 시각 전·대상 계정일 때만", async () => {
    expect(await D.demoFor("busan2")).toBeNull();
    await D.demoSet(ACC.unes, true);
    expect(await D.demoFor("busan2")).not.toBeNull();
    for (const id of ["busan", "inje", "01000", "hang", "unes", "issuer", null]) expect(await D.demoFor(id)).toBeNull();
    // 48시간 지나 저절로 꺼짐
    await D.demoSet(ACC.unes, true, Date.now() - 49 * 3_600_000, ["busan2"]);
    expect(await D.demoFor("busan2")).toBeNull();
  });

  const QC = { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } };
  const RAW = { status: "SUCCESS", result: { answer: "대상 계정 시험 답" } };
  const answered = async (acc: Account, question: string, ago = "30 minutes") => {
    const j = await J.submitJob(acc, { question, source: "USER", queryContext: QC, noCache: true });
    await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() - $3::interval where id = $1", [j.id, JSON.stringify(RAW), ago]);
    return j.id;
  };

  it("첫 턴 답 — 대상 계정은 다시 쓰고(대상 아닌 계정이 켠 뒤 받은 답도) · 대상 아닌 계정은 켜져 있어도 새로 받는다", async () => {
    await D.demoSet(ACC.unes, true, Date.now() - 3_600_000); // 기본 대상 busan2
    const src = await answered(ACC.busan, "대상 계정 시험 1");
    expect((await J.submitJob(ACC.busan2, { question: "대상 계정 시험 1", source: "USER", queryContext: QC })).cached_from).toBe(src);
    const other = await J.submitJob(ACC.busan, { question: "대상 계정 시험 1", source: "USER", queryContext: QC });
    expect(other.cached_from).toBeNull();
    expect(other.id).not.toBe(src);
    // 켜기 전에 받은 답은 대상 계정도 쓰지 않는다
    await answered(ACC.busan2, "대상 계정 시험 2", "2 hours");
    expect((await J.submitJob(ACC.busan2, { question: "대상 계정 시험 2", source: "USER", queryContext: QC })).cached_from).toBeNull();
  });

  it("브리핑의 받아 둔 답 — 대상 계정만", async () => {
    const pinned = await answered(ACC.busan2, "대상 계정 브리핑");
    await J.demoPins(); // 표 만들기
    await sql.query(
      "insert into sa_demo_pins (item_id, job_id) values ('SH-R52-1', $1) on conflict (item_id) do update set job_id = excluded.job_id, pending_job_id = null",
      [pinned],
    );
    await D.demoSet(ACC.unes, true);
    const other = await J.submitJob(ACC.busan, { question: "대상 계정 브리핑 1", source: "BRIEFING", queryContext: QC, pinId: "SH-R52-1" });
    expect(other.cached_from).toBeNull();
    const target = await J.submitJob(ACC.busan2, { question: "대상 계정 브리핑 2", source: "BRIEFING", queryContext: QC, pinId: "SH-R52-1" });
    expect(target.cached_from).toBe(pinned);
  });

  it("Data API 응답 — 대상 계정끼리만 저장·재사용, 대상 아닌 계정은 읽지도 쓰지도 않는다", async () => {
    await D.demoSet(ACC.unes, true, Date.now(), ["busan2", "inje"]);
    const path = "/similar-events/search";
    const body = { query: "대상 계정 시험" };
    const n = async () => (await sql.query("select count(*)::int as n from sa_demo_cache"))[0].n as number;
    const x = await D.t3qData("busan", "POST", path, body);
    expect(x.demoHit).toBeUndefined();
    expect(await n()).toBe(0); // 대상 아닌 계정은 쓰지 않는다
    const a = await D.t3qData("busan2", "POST", path, body);
    const status = (a.body as { status?: string } | null)?.status;
    const stored = a.envelope && a.http < 300 && (status === "SUCCESS" || status === "NO_RESULT");
    expect((await D.t3qData("inje", "POST", path, body)).demoHit).toBe(stored ? true : undefined); // 대상끼리 함께 쓴다
    expect((await D.t3qData("busan", "POST", path, body)).demoHit).toBeUndefined(); // 대상 아닌 계정은 읽지 않는다
    expect((await D.t3qData("unes", "POST", path, body)).demoHit).toBeUndefined();
  });
});
