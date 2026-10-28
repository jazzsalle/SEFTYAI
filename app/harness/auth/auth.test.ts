// 하네스 — 로그인·세션의 실제 SQL 을 메모리 Postgres(PGlite)에서 돌린다(2026-10-28: 셸 따옴표가 빠진 SQL 이 시험 없이 지나간 일 재발 방지).
// npx vitest run harness/auth
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "pglite:memory://";
process.env.SESSION_SECRET = "test-secret";

type Auth = typeof import("@/lib/server/auth");
let A: Auth;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
const PW = "Test!pass123";
const req = (cookie?: string, activity = false) => new Request("http://x/", { headers: { ...(cookie ? { cookie } : {}), ...(activity ? { "x-sa-activity": "1" } : {}) } });
const cookieOf = (setCookie: string) => setCookie.split(";")[0];

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  A = await import("@/lib/server/auth");
});

describe("로그인·세션", () => {
  it("계정 발급(기본은 첫 로그인 때 변경 강제) 후 로그인하면 변경 필요 표시가 온다", async () => {
    await A.upsertAccount("bs_safety01", PW);
    const r = await A.login("bs_safety01", PW, "ua");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.mustChangePw).toBe(true);
  });

  it("발급 때 변경 강제를 끄면 표시가 없다", async () => {
    await A.upsertAccount("ij_safety01", PW, false);
    const r = await A.login("ij_safety01", PW, "ua");
    expect(r.ok && r.account.mustChangePw).toBe(false);
  });

  it("5회 틀리면 잠기고, 잠긴 동안에는 맞는 비밀번호도 거절한다", async () => {
    await A.upsertAccount("yc_safety02", PW, false);
    for (let i = 0; i < 5; i++) expect((await A.login("yc_safety02", "Wrong!pass999", "ua")).ok).toBe(false);
    const r = await A.login("yc_safety02", PW, "ua");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(423);
    await A.unlock("yc_safety02");
    expect((await A.login("yc_safety02", PW, "ua")).ok).toBe(true);
  });

  it("동시에 틀려도 실패 횟수가 사라지지 않는다(원자적 집계)", async () => {
    await A.upsertAccount("admin01", PW, false);
    await Promise.all(Array.from({ length: 5 }, () => A.login("admin01", "Wrong!pass999", "ua")));
    const r = await A.login("admin01", PW, "ua");
    expect(r.ok).toBe(false);
    await A.unlock("admin01");
  });

  it("세션: 활동 표시가 있을 때만 유휴 시간을 연장한다", async () => {
    const r = await A.login("ij_safety01", PW, "ua");
    if (!r.ok) throw new Error("login");
    const ck = cookieOf(r.cookie);
    await sql.query("update sa_sessions set last_seen_at = now() - interval '10 minutes'");
    expect(await A.sessionAccount(req(ck))).not.toBeNull();
    const [s1] = await sql.query("select last_seen_at from sa_sessions where revoked_at is null and account_id = 'ij_safety01'");
    expect(Date.now() - new Date(String(s1.last_seen_at)).getTime()).toBeGreaterThan(9 * 60_000); // 폴링은 연장 안 함
    await A.sessionAccount(req(ck, true));
    const [s2] = await sql.query("select last_seen_at from sa_sessions where revoked_at is null and account_id = 'ij_safety01'");
    expect(Date.now() - new Date(String(s2.last_seen_at)).getTime()).toBeLessThan(60_000); // 사용자 조작은 연장
    await sql.query("update sa_sessions set last_seen_at = now() - interval '31 minutes'");
    expect(await A.sessionAccount(req(ck))).toBeNull(); // 유휴 30분 만료
  });

  it("비밀번호 변경: 같은 비밀번호 거절, 바꾸면 다른 세션은 끊긴다", async () => {
    const r1 = await A.login("ij_safety01", PW, "ua");
    if (!r1.ok) throw new Error("login");
    const ck1 = cookieOf(r1.cookie);
    expect(await A.changePw("ij_safety01", PW, PW, A.currentSid(req(ck1)))).toMatch(/다른 비밀번호/);
    // 다른 기기 세션을 하나 더 만든다(새 로그인은 기존 세션을 끊으므로 직접 넣음)
    await sql.query("insert into sa_sessions (sid, account_id, created_at, last_seen_at, expires_at) values ('other-device', 'ij_safety01', now(), now(), now() + interval '1 hour')");
    expect(await A.changePw("ij_safety01", PW, "New!pass4567", A.currentSid(req(ck1)))).toBeNull();
    const [o] = await sql.query("select revoked_at from sa_sessions where sid = 'other-device'");
    expect(o.revoked_at).not.toBeNull();
    expect(await A.sessionAccount(req(ck1, true))).not.toBeNull(); // 지금 세션은 유지
    expect((await A.login("ij_safety01", "New!pass4567", "ua")).ok).toBe(true);
  });

  it("비활성 계정의 세션은 무효", async () => {
    const r = await A.login("bs_safety01", PW, "ua");
    if (!r.ok) throw new Error("login");
    await sql.query("update sa_accounts set status = 'DISABLED' where id = 'bs_safety01'");
    expect(await A.sessionAccount(req(cookieOf(r.cookie), true))).toBeNull();
  });
});
