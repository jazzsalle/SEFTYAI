// R61 서버 — 902002 잠그는 5회째 응답의 잠금 문구 · 개발서버 비밀번호 해시(PBKDF2-SHA256) 호환 · 옮기기 도구(import_pw.mjs)의 변환
// 로그인 SQL 은 메모리 Postgres(PGlite)에서 돌린다(harness/auth 와 같은 방식). 비밀번호는 시험 안에서 임의로 만든다
// npx vitest run harness/devsync/r61
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { FIXED_IDS, iterationsOf, mustChangeOf, planOf, toPwHash } from "../devsync/import_pw.mjs";

process.env.DATABASE_URL = "pglite:memory://";
process.env.SESSION_SECRET = "test-secret";

type Auth = typeof import("@/lib/server/auth");
let A: Auth;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
const rnd = () => `Rt!${randomBytes(6).toString("hex")}9a`;

/** 개발서버 PasswordHasher.Hash 와 같은 방식으로 만든 acc_user 한 줄(password·password_salt·password_key) */
function devRow(userId: string, pw: string, iterations = 600_000) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(Buffer.from(pw, "utf8"), salt, iterations, 32, "sha256");
  return { user_id: userId, password: hash.toString("base64"), password_salt: salt.toString("base64"), password_key: `PBKDF2-SHA256-${iterations}` };
}

beforeAll(async () => {
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  A = await import("@/lib/server/auth");
});

describe("902002 — 5회째 실패로 잠그는 그 응답에서 잠금 문구(개발서버 AuthService lockedNow)", () => {
  it("1~4회는 일반 문구(401), 5회째는 잠금 문구(423), 잠긴 뒤에도 같은 문구", async () => {
    const pw = rnd();
    await A.upsertAccount("hang", pw, false);
    for (let i = 0; i < 4; i++) {
      const r = await A.login("hang", pw + "x", "ua");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(401);
        expect(r.error).toBe("아이디 또는 비밀번호를 잘못 입력했습니다. 다시 입력하세요.");
      }
    }
    const fifth = await A.login("hang", pw + "x", "ua");
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.status).toBe(423);
      expect(fifth.error).toBe("로그인에 5회 연속 실패하여 계정이 잠겼습니다. 시스템 운영자에게 문의하세요.");
    }
    const after = await A.login("hang", pw, "ua");
    expect(!after.ok && after.error).toBe(A.LOCKED_MSG);
    await A.unlock("hang");
  });
});

describe("개발서버 비밀번호 해시 호환(PBKDF2-SHA256 — 개발서버 PasswordHasher)", () => {
  it("개발서버 방식 해시를 verifyPw 가 통과·오답 거절(UTF-8 — 한글 섞인 비밀번호 포함)", async () => {
    for (const pw of [rnd(), `한글${rnd()}`]) {
      const h = toPwHash(devRow("busan", pw, 1000)) as { pwHash: string };
      expect(h.pwHash).toMatch(/^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
      expect(await A.verifyPw(pw, h.pwHash)).toBe(true);
      expect(await A.verifyPw(pw + "x", h.pwHash)).toBe(false);
      expect(await A.verifyPw(pw.toUpperCase(), h.pwHash)).toBe(false);
    }
  });
  it("개발서버 기본 반복(600000)으로 만든 해시로 실제 로그인되고, 우리 scrypt 형식도 그대로", async () => {
    const pw = rnd();
    await A.upsertAccount("busan2", rnd(), true);
    const plan = (planOf([devRow("busan2", pw)]) as { id: string; pwHash: string }[]).find((p) => p.id === "busan2")!;
    expect(plan.pwHash.startsWith("pbkdf2-sha256$600000$")).toBe(true);
    await sql.query("update sa_accounts set pw_hash = $2 where id = $1", ["busan2", plan.pwHash]);
    expect((await A.login("busan2", pw + "x", "ua")).ok).toBe(false);
    expect((await A.login("busan2", pw, "ua", { force: true })).ok).toBe(true);
    const ours = rnd();
    expect(await A.verifyPw(ours, await A.hashPw(ours))).toBe(true);
  });
  it("깨진 값·모르는 형식은 거절(예외 없이)", async () => {
    for (const bad of ["", "plain", "pbkdf2-sha256$0$AAAA$AAAA", "pbkdf2-sha256$abc$AAAA$AAAA", "pbkdf2-sha256$1000$$", "pbkdf2-sha256$1000$AAAA", "md5$x"]) {
      expect(await A.verifyPw("아무거나", bad), bad).toBe(false);
    }
  });
});

describe("옮기기 도구 import_pw.mjs(미리 보기 기본 · 고정 7계정만)", () => {
  it("반복 횟수는 password_key 마지막 「-」 뒤(없으면 600000) — 개발서버 ParseIterations", () => {
    expect(iterationsOf("PBKDF2-SHA256-600000")).toBe(600000);
    expect(iterationsOf("PBKDF2-SHA256-210000")).toBe(210000);
    expect(iterationsOf("PBKDF2-SHA256")).toBe(600000);
    expect(iterationsOf(null)).toBe(600000);
  });
  it("고정 7계정만, 파일에 없거나 값이 깨진 계정은 「없음」, 첫 로그인 변경은 pwd_chg_de 칸이 있을 때만", () => {
    expect(FIXED_IDS).toEqual(["busan", "busan2", "inje", "01000", "hang", "unes", "issuer"]);
    const rows = [
      { ...devRow("busan", rnd(), 1000), pwd_chg_de: null },
      { ...devRow("inje", rnd(), 1000), pwd_chg_de: "2026-11-01T10:00:00" },
      devRow("unes", rnd(), 1000),
      { user_id: "hang", password: "", password_salt: "", password_key: "PBKDF2-SHA256-600000" },
      { ...devRow("01000", rnd(), 1000), password_key: "SHA1" },
      devRow("someone", rnd(), 1000),
    ];
    const plan = planOf(rows) as { id: string; why?: string; pwHash?: string; mustChange?: boolean }[];
    expect(plan.map((p) => p.id)).toEqual(FIXED_IDS);
    const by = Object.fromEntries(plan.map((p) => [p.id, p]));
    expect(by.busan.mustChange).toBe(true);
    expect(by.inje.mustChange).toBe(false);
    expect(by.unes.mustChange).toBeUndefined();
    expect(by.hang.why).toBe("해시·솔트 없음");
    expect(by["01000"].why).toBe("알 수 없는 해시 방식");
    expect(by.busan2.why).toBe("내보낸 파일에 없음");
    expect(by.issuer.why).toBe("내보낸 파일에 없음");
    expect(mustChangeOf({})).toBeUndefined();
  });
});
