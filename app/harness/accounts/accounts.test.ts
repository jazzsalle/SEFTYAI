// 하네스 — 계정 발급(R55, 개발서버 nia_ai-account AccountService·AccountRules 복제)을 메모리 Postgres(PGlite)에서 돌린다
// npx vitest run harness/accounts
import { beforeAll, describe, expect, it } from "vitest";
import { allowedTeams, issuedAccount, validateId } from "@/lib/accountRules";

process.env.DATABASE_URL = "pglite:memory://";
process.env.SESSION_SECRET = "test-secret";

type Auth = typeof import("@/lib/server/auth");
type Acc = typeof import("@/lib/server/accounts");
let A: Auth;
let S: Acc;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
const PW = "Test!pass123";
const cookieOf = (setCookie: string) => setCookie.split(";")[0];
let issuerCookie = "";

async function loginCookie(id: string, pw: string) {
  const r = await A.login(id, pw, "ua", { force: true });
  if (!r.ok) throw new Error(`${id} 로그인 실패 ${r.error}`);
  return cookieOf(r.cookie);
}

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  A = await import("@/lib/server/auth");
  S = await import("@/lib/server/accounts");
  for (const id of ["issuer", "unes", "busan", "hang"]) await A.upsertAccount(id, PW, false);
  issuerCookie = await loginCookie("issuer", PW);
});

describe("계정 규칙(개발서버 AccountRules)", () => {
  it("만든 비밀번호는 12자 · 영문·숫자·특수문자 모두 · 헷갈리는 글자(0 O o 1 l I) 없음", () => {
    for (let i = 0; i < 200; i++) {
      const pw = S.generatePassword();
      expect(pw).toHaveLength(12);
      expect(A.pwRule(pw)).toBe(true);
      expect(pw).not.toMatch(/[0Oo1lI]/);
    }
  });

  it("ID 는 4~50자 · 영문·숫자·_·- 만, SYS- 앞머리는 막는다", () => {
    expect(validateId("abc")).toMatch(/4글자 이상/);
    expect(validateId("a".repeat(51))).toMatch(/50글자/);
    expect(validateId("한글아이디")).toMatch(/만 쓸 수 있습니다/);
    expect(validateId("SYS-AIM-2600000000")).toMatch(/시스템/);
    expect(validateId("busan_ops-01")).toBeNull();
  });

  it("등급이 소속을 정한다 — 시스템 관리자 = 유엔이, 정부기관 = 행안부, 지자체 = 부산·영천·인제", () => {
    expect(allowedTeams(1).map((t) => t.name)).toEqual(["유엔이"]);
    expect(allowedTeams(2).map((t) => t.name)).toEqual(["행안부"]);
    expect(allowedTeams(3).map((t) => t.name)).toEqual(["부산", "영천", "인제"]);
    expect(allowedTeams(0)).toEqual([]);
  });

  it("등급 → 우리 역할·지역: 계정 발급자·시스템 관리자 = 운영자, 정부기관 = 중앙정부, 지자체 = 소속 지역", () => {
    expect(issuedAccount("x1", 1, 0)).toMatchObject({ role: "운영자", region: "national", grade: 1 });
    expect(issuedAccount("x2", 2, 1)).toMatchObject({ role: "중앙정부", region: "national" });
    expect(issuedAccount("x3", 3, 3)).toMatchObject({ role: "지자체", region: "yeongcheon", org: "경상북도 영천시" });
    expect(issuedAccount("x4", 3, 99)).toBeNull();
    expect(issuedAccount("x5", null, null)).toBeNull();
  });
});

describe("계정 발급·관리", () => {
  it("맞는 줄은 발급하고 틀린 줄만 사유를 돌려준다", async () => {
    const r = await S.issueAccounts([
      { gradSn: 3, userId: "busan_ops", teamSn: 2, memo: "부산 담당" },
      { gradSn: 3, userId: "BUSAN_OPS", teamSn: 2, memo: null },
      { gradSn: 0, userId: "issuer2", teamSn: 1, memo: null },
      { gradSn: 2, userId: "gov_ops", teamSn: 2, memo: null },
      { gradSn: 3, userId: "busan", teamSn: 2, memo: null },
      { gradSn: 1, userId: "sysadmin2", teamSn: 0, memo: null },
      { gradSn: 2, userId: "gov_ops", teamSn: 1, memo: null },
    ], "issuer");
    expect(r.issued).toBe(3);
    expect(r.results.map((x) => x.error)).toEqual([
      null,
      "같은 요청 안에 ID가 중복됩니다.",
      "계정 발급자 등급은 이 화면에서 발급할 수 없습니다.",
      "이 등급에서 쓸 수 없는 소속입니다.",
      "이미 쓰고 있는 ID입니다.",
      null,
      null,
    ]);
    for (const x of r.results) if (x.ok) expect(A.pwRule(x.password!)).toBe(true);
    else expect(x.password).toBeNull();
    // 이미 있는 ID 는 대소문자를 가리지 않고 막는다
    const again = await S.issueAccounts([{ gradSn: 3, userId: "Busan_Ops", teamSn: 2, memo: null }], "issuer");
    expect(again.results[0].error).toBe("이미 쓰고 있는 ID입니다.");
    // 저장된 것은 해시뿐
    const [row] = await sql.query("select pw_hash, grade, team_sn, memo, created_by, must_change_pw from sa_accounts where id = 'busan_ops'");
    expect(String(row.pw_hash)).toMatch(/^scrypt\$/);
    expect(String(row.pw_hash)).not.toContain(r.results[0].password!);
    expect(row).toMatchObject({ grade: 3, team_sn: 2, memo: "부산 담당", created_by: "issuer", must_change_pw: true });
  });

  it("발급한 계정으로 로그인하면 등급·소속대로 역할·지역이 서고, 첫 로그인 변경을 요구한다", async () => {
    const r = await S.issueAccounts([{ gradSn: 3, userId: "inje_new", teamSn: 4, memo: null }], "issuer");
    const pw = r.results[0].password!;
    const L = await A.login("inje_new", pw, "ua");
    expect(L.ok).toBe(true);
    if (!L.ok) return;
    expect(L.account).toMatchObject({ id: "inje_new", role: "지자체", region: "inje", grade: 3, mustChangePw: true });
    const who = await A.sessionAccount(new Request("http://x/", { headers: { cookie: cookieOf(L.cookie) } }));
    expect(who).toMatchObject({ id: "inje_new", role: "지자체", region: "inje" });
  });

  it("고정 계정은 설정 그대로(이름·지역·등급)", async () => {
    const L = await A.login("busan", PW, "ua", { force: true });
    expect(L.ok && L.account).toMatchObject({ id: "busan", name: "부산광역시 담당자", region: "busan", role: "지자체", grade: 3 });
    const I = await A.login("issuer", PW, "ua", { force: true });
    expect(I.ok && I.account).toMatchObject({ role: "운영자", grade: 0 });
    if (I.ok) issuerCookie = cookieOf(I.cookie);
  });

  it("비밀번호 재발급 — 옛 비밀번호는 안 되고 새 것은 되며, 잠금이 풀리고 접속이 끊긴다. 고정 계정은 막는다", async () => {
    const r = await S.issueAccounts([{ gradSn: 3, userId: "yc_new", teamSn: 3, memo: null }], "issuer");
    const old = r.results[0].password!;
    const ck = await loginCookie("yc_new", old);
    await sql.query("update sa_accounts set locked_until = now() + interval '10 minutes', failed_count = 3 where id = 'yc_new'");
    const n = await S.resetPassword("yc_new");
    expect(n.password).not.toBe(old);
    expect(await A.sessionAccount(new Request("http://x/", { headers: { cookie: ck } }))).toBeNull();
    expect((await A.login("yc_new", old, "ua")).ok).toBe(false);
    const L = await A.login("yc_new", n.password!, "ua");
    expect(L.ok && L.account.mustChangePw).toBe(true);
    await expect(S.resetPassword("busan")).rejects.toMatchObject({ status: 422, code: "ACCOUNT_FIXED" });
    await expect(S.resetPassword("nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("잠금 해제", async () => {
    await sql.query("update sa_accounts set locked_until = now() + interval '10 minutes' where id = 'busan_ops'");
    expect((await S.listAccounts()).find((x) => x.userId === "busan_ops")?.isLocked).toBe(true);
    await S.unlockAccount("busan_ops");
    expect((await S.listAccounts()).find((x) => x.userId === "busan_ops")?.isLocked).toBe(false);
  });

  it("폐기 — 행·접속·계정 설정을 지운다. 자기 계정·고정 계정은 막는다", async () => {
    const r = await S.issueAccounts([{ gradSn: 2, userId: "gov_tmp", teamSn: 1, memo: null }], "issuer");
    const ck = await loginCookie("gov_tmp", r.results[0].password!);
    await sql.query("insert into sa_kv (scope, key, value) values ('acct:gov_tmp', 'briefing', '[]')");
    await S.deleteAccount("gov_tmp", "issuer");
    expect(await sql.query("select id from sa_accounts where id = 'gov_tmp'")).toHaveLength(0);
    expect(await sql.query("select scope from sa_kv where scope = 'acct:gov_tmp'")).toHaveLength(0);
    expect(await A.sessionAccount(new Request("http://x/", { headers: { cookie: ck } }))).toBeNull();
    await expect(S.deleteAccount("issuer", "issuer")).rejects.toMatchObject({ code: "ACCOUNT_SELF_DELETE_FORBIDDEN" });
    await expect(S.deleteAccount("busan", "issuer")).rejects.toMatchObject({ code: "ACCOUNT_FIXED" });
  });

  it("목록 — 고정 계정은 설정의 등급·소속, 발급한 계정은 DB 칸", async () => {
    const list = await S.listAccounts();
    expect(list.find((x) => x.userId === "busan")).toMatchObject({ gradName: "지자체", teamName: "부산", fixed: true });
    expect(list.find((x) => x.userId === "unes")).toMatchObject({ gradName: "시스템 관리자", teamName: "유엔이" });
    expect(list.find((x) => x.userId === "sysadmin2")).toMatchObject({ gradName: "시스템 관리자", teamName: "유엔이", createdBy: "issuer", fixed: false });
  });
});

describe("계정 발급 API — 계정 발급자만", () => {
  const call = async (mod: string, method: string, cookie: string, body?: unknown, id?: string) => {
    const R = (await import(mod)) as Record<string, (req: Request, ctx?: unknown) => Promise<Response>>;
    const req = new Request("http://x/api/accounts", { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return R[method](req, id ? { params: Promise.resolve({ id }) } : undefined);
  };

  it("다른 등급(운영자 unes 포함)은 403, 로그인 없으면 401", async () => {
    const unes = await loginCookie("unes", PW);
    expect((await call("@/app/api/accounts/route", "GET", unes)).status).toBe(403);
    expect((await call("@/app/api/accounts/route", "GET", "")).status).toBe(401);
    expect((await call("@/app/api/accounts/[id]/password/route", "POST", unes, undefined, "busan_ops")).status).toBe(403);
  });

  it("issuer 는 목록·발급을 받고, 비밀번호는 응답에만 있고 감사 기록에는 없다", async () => {
    const g = await call("@/app/api/accounts/route", "GET", issuerCookie);
    expect(g.status).toBe(200);
    const gj = await g.json();
    expect(gj.meta.grades.map((x: { gradName: string }) => x.gradName)).toEqual(["시스템 관리자", "정부기관", "지자체"]);
    const p = await call("@/app/api/accounts/route", "POST", issuerCookie, { items: [{ gradSn: 3, userId: "api_new", teamSn: 2, memo: null }] });
    expect(p.status).toBe(200);
    const pj = await p.json();
    const pw = pj.results[0].password as string;
    expect(A.pwRule(pw)).toBe(true);
    const audit = await sql.query("select detail::text as d from sa_audit where action like 'account.%'");
    expect(audit.length).toBeGreaterThan(0);
    for (const a of audit) expect(String(a.d)).not.toContain(pw);
    const r = await call("@/app/api/accounts/[id]/password/route", "POST", issuerCookie, undefined, "api_new");
    const rj = await r.json();
    expect(r.status).toBe(200);
    for (const a of await sql.query("select detail::text as d from sa_audit")) expect(String(a.d)).not.toContain(rj.password);
    expect((await call("@/app/api/accounts/[id]/route", "DELETE", issuerCookie, undefined, "api_new")).status).toBe(204);
    expect((await call("@/app/api/accounts/route", "POST", issuerCookie, { items: [] })).status).toBe(400);
  });
});
