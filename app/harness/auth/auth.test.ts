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
    await A.upsertAccount("busan", PW);
    const r = await A.login("busan", PW, "ua");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.mustChangePw).toBe(true);
  });

  it("발급 때 변경 강제를 끄면 표시가 없다", async () => {
    await A.upsertAccount("inje", PW, false);
    const r = await A.login("inje", PW, "ua");
    expect(r.ok && r.account.mustChangePw).toBe(false);
  });

  it("5회 틀리면 잠기고, 잠긴 동안에는 맞는 비밀번호도 거절한다", async () => {
    await A.upsertAccount("01000", PW, false);
    for (let i = 0; i < 5; i++) expect((await A.login("01000", "Wrong!pass999", "ua")).ok).toBe(false);
    const r = await A.login("01000", PW, "ua");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(423);
    await A.unlock("01000");
    expect((await A.login("01000", PW, "ua")).ok).toBe(true);
  });

  it("동시에 틀려도 실패 횟수가 사라지지 않는다(원자적 집계)", async () => {
    await A.upsertAccount("unes", PW, false);
    await Promise.all(Array.from({ length: 5 }, () => A.login("unes", "Wrong!pass999", "ua")));
    const r = await A.login("unes", PW, "ua");
    expect(r.ok).toBe(false);
    await A.unlock("unes");
  });

  it("세션 수명 240분(R57 — 개발서버 Jwt:AccessTokenMinutes): 조작·폴링은 늘리지 않고, 다하면 끝난다", async () => {
    const r = await A.login("inje", PW, "ua", { force: true });
    if (!r.ok) throw new Error("login");
    const ck = cookieOf(r.cookie);
    expect(r.cookie).toContain(`Max-Age=${240 * 60}`);
    expect(new Date(r.expiresAt).getTime() - Date.now()).toBeGreaterThan(239 * 60_000);
    await sql.query("update sa_sessions set last_seen_at = now() - interval '10 minutes'");
    expect(await A.sessionAccount(req(ck))).not.toBeNull();
    const [s1] = await sql.query("select last_seen_at from sa_sessions where revoked_at is null and account_id = 'inje'");
    expect(Date.now() - new Date(String(s1.last_seen_at)).getTime()).toBeGreaterThan(9 * 60_000); // 폴링은 조작 기록도 안 남김
    const before = (await A.sessionInfo(req(ck)))?.expiresAt;
    await A.sessionAccount(req(ck, true));
    const [s2] = await sql.query("select last_seen_at from sa_sessions where revoked_at is null and account_id = 'inje'");
    expect(Date.now() - new Date(String(s2.last_seen_at)).getTime()).toBeLessThan(60_000); // 조작은 기록만
    expect((await A.sessionInfo(req(ck)))?.expiresAt).toBe(before); // 수명은 그대로
    // 로그인 239분 뒤 — 아직 유효, 241분 뒤 — 끝(조작이 있었어도)
    await sql.query("update sa_sessions set expires_at = now() + interval '1 minute', last_seen_at = now() where account_id = 'inje' and revoked_at is null");
    expect(await A.sessionAccount(req(ck))).not.toBeNull();
    await sql.query("update sa_sessions set expires_at = now() - interval '1 minute', last_seen_at = now() where account_id = 'inje' and revoked_at is null");
    expect(await A.sessionAccount(req(ck, true))).toBeNull();
    expect(await A.beat(req(ck))).toEqual({ code: A.SESSION_EXPIRED });
  });

  it("[시간 연장]은 수명을 지금부터 240분으로 다시 세고, 끝난 접속은 되살리지 않는다", async () => {
    const r = await A.login("inje", PW, "ua", { force: true });
    if (!r.ok) throw new Error("login");
    const ck = cookieOf(r.cookie);
    await sql.query("update sa_sessions set expires_at = now() + interval '5 minutes' where account_id = 'inje' and revoked_at is null");
    const E = await import("@/app/api/auth/extend/route");
    const res = await E.POST(new Request("http://x/api/auth/extend", { method: "POST", headers: { cookie: ck } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`Max-Age=${240 * 60}`);
    const body = (await res.json()) as { expiresAt: string };
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(239 * 60_000);
    const b = await A.beat(req(ck));
    expect("expiresAt" in b && b.expiresAt).toBe(body.expiresAt); // 두드림이 같은 시각을 돌려준다(다른 창이 따라감)
    await sql.query("update sa_sessions set expires_at = now() - interval '1 second' where account_id = 'inje' and revoked_at is null");
    const late = await E.POST(new Request("http://x/api/auth/extend", { method: "POST", headers: { cookie: ck } }));
    expect(late.status).toBe(401);
    expect(((await late.json()) as { code?: string }).code).toBe("AUTH_SESSION_EXPIRED");
    expect(await A.sessionAccount(req(ck))).toBeNull();
  });

  it("비밀번호 변경: 같은 비밀번호 거절, 바꾸면 다른 세션은 끊긴다", async () => {
    const r1 = await A.login("inje", PW, "ua", { force: true });
    if (!r1.ok) throw new Error("login");
    const ck1 = cookieOf(r1.cookie);
    expect(await A.changePw("inje", PW, PW, A.currentSid(req(ck1)))).toMatch(/다른 비밀번호/);
    // 다른 기기 세션을 하나 더 만든다(새 로그인은 기존 세션을 끊으므로 직접 넣음)
    await sql.query("insert into sa_sessions (sid, account_id, created_at, last_seen_at, expires_at) values ('other-device', 'inje', now(), now(), now() + interval '1 hour')");
    expect(await A.changePw("inje", PW, "New!pass4567", A.currentSid(req(ck1)))).toBeNull();
    const [o] = await sql.query("select revoked_at from sa_sessions where sid = 'other-device'");
    expect(o.revoked_at).not.toBeNull();
    expect(await A.sessionAccount(req(ck1, true))).not.toBeNull(); // 지금 세션은 유지
    expect((await A.login("inje", "New!pass4567", "ua", { force: true })).ok).toBe(true);
  });

  it("비활성 계정의 세션은 무효", async () => {
    const r = await A.login("busan", PW, "ua", { force: true });
    if (!r.ok) throw new Error("login");
    await sql.query("update sa_accounts set status = 'DISABLED' where id = 'busan'");
    expect(await A.sessionAccount(req(cookieOf(r.cookie), true))).toBeNull();
  });
});

// 중복 접속 「끊고 들어갈까요」(R53, 개발서버 AuthService.LoginAsync·SessionLife·/auth/ping·/auth/leaving)
describe("중복 접속", () => {
  const ping = async (cookie?: string) => {
    const R = await import("@/app/api/auth/ping/route");
    const res = await R.POST(new Request("http://x/api/auth/ping", { method: "POST", headers: cookie ? { cookie } : {} }));
    return { status: res.status, body: (await res.json()) as { code?: string } };
  };

  it("다른 곳에서 접속 중이면(자취 2분 안) 비밀번호가 맞아도 409 로 되묻고, 실패 기록은 지우지 않는다", async () => {
    await A.upsertAccount("hang", PW, false);
    const a = await A.login("hang", PW, "ua");
    expect(a.ok).toBe(true);
    await sql.query("update sa_accounts set failed_count = 2 where id = 'hang'");
    const b = await A.login("hang", PW, "ua");
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.status).toBe(409);
      expect(b.code).toBe(A.SESSION_EXISTS);
      expect(b.error).toBe("다른 곳에서 이 계정으로 접속 중입니다. 로그인하면 그 접속은 종료됩니다.");
    }
    const [acc] = await sql.query("select failed_count from sa_accounts where id = 'hang'");
    expect(acc.failed_count).toBe(2);
    // 앞 접속은 그대로 살아 있다
    if (a.ok) expect(await A.sessionAccount(req(cookieOf(a.cookie)))).not.toBeNull();
  });

  it("비밀번호가 틀리면 접속 여부를 알려 주지 않는다(401 그대로)", async () => {
    const r = await A.login("hang", "Wrong!pass999", "ua");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.code).toBeUndefined();
      expect(r.error).toBe("아이디 또는 비밀번호를 잘못 입력했습니다. 다시 입력하세요.");
    }
    await A.unlock("hang");
  });

  it("force 면 앞 접속을 끊고 들어가고, 끊긴 쪽 두드림은 401 AUTH_SESSION_TAKEN_OVER", async () => {
    const [old] = await sql.query("select sid from sa_sessions where account_id = 'hang' and revoked_at is null");
    const oldCookie = `sa_sid=${A.sign(String(old.sid))}`;
    expect((await ping(oldCookie)).status).toBe(200);
    const b = await A.login("hang", PW, "ua", { force: true });
    expect(b.ok).toBe(true);
    expect(await A.sessionAccount(req(oldCookie))).toBeNull();
    const p = await ping(oldCookie);
    expect(p.status).toBe(401);
    expect(p.body.code).toBe(A.TAKEN_OVER);
    if (b.ok) expect((await ping(cookieOf(b.cookie))).status).toBe(200);
  });

  it("자취가 2분 넘게 끊긴 접속(창을 닫음)은 되묻지 않는다", async () => {
    await sql.query("update sa_sessions set beat_at = now() - interval '121 seconds' where account_id = 'hang' and revoked_at is null");
    expect((await A.login("hang", PW, "ua")).ok).toBe(true);
  });

  it("창 닫힘(/api/auth/leaving)은 자취만 늙혀 다른 브라우저가 바로 들어온다", async () => {
    const [s] = await sql.query("select sid from sa_sessions where account_id = 'hang' and revoked_at is null");
    const ck = `sa_sid=${A.sign(String(s.sid))}`;
    expect((await A.login("hang", PW, "ua")).ok).toBe(false); // 아직 접속 중
    const L = await import("@/app/api/auth/leaving/route");
    await L.POST(new Request("http://x/api/auth/leaving", { method: "POST", headers: { cookie: ck } }));
    expect(await A.sessionAccount(req(ck))).not.toBeNull(); // 접속 자체는 그대로
    expect((await A.login("hang", PW, "ua")).ok).toBe(true);
  });

  it("남아 있는 접속이 바로 이 브라우저의 것이면 되묻지 않는다", async () => {
    const [s] = await sql.query("select sid from sa_sessions where account_id = 'hang' and revoked_at is null");
    expect((await A.login("hang", PW, "ua", { currentSid: String(s.sid) })).ok).toBe(true);
  });

  it("로그아웃·만료로 끝난 접속의 두드림은 AUTH_SESSION_EXPIRED, 쿠키가 없어도 같다", async () => {
    const [s] = await sql.query("select sid from sa_sessions where account_id = 'hang' and revoked_at is null");
    const ck = `sa_sid=${A.sign(String(s.sid))}`;
    await A.logout(req(ck));
    expect((await ping(ck)).body.code).toBe(A.SESSION_EXPIRED);
    expect((await ping()).body.code).toBe(A.SESSION_EXPIRED);
    // 로그아웃한 뒤에는 되묻지 않는다
    expect((await A.login("hang", PW, "ua")).ok).toBe(true);
  });

  it("로그인 라우트는 409 에 code 를 싣고, force: true 로 다시 보내면 들어간다", async () => {
    const R = await import("@/app/api/auth/login/route");
    const post = (body: Record<string, unknown>) => R.POST(new Request("http://x/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const r1 = await post({ id: "hang", password: PW });
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as { code?: string }).code).toBe("AUTH_SESSION_EXISTS");
    const r2 = await post({ id: "hang", password: PW, force: true });
    expect(r2.status).toBe(200);
  });
});
