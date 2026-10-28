import "server-only";
import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ACCOUNTS, type Account } from "../config";
import { db, ensureSchema } from "./db";

/**
 * 로그인·세션 (R7, UFR-007) — 사전 발급 5계정, scrypt 해시, 서명 쿠키 sa_sid
 * 유휴 30분(슬라이딩, last_seen 갱신은 60초에 1회) · 절대 12시간 · 같은 계정 새 로그인 시 기존 세션 종료
 * 비밀번호 9자 이상 + 영문·숫자·특수문자 · 5회 실패 15분 잠금
 */
const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opt: object) => Promise<Buffer>;
export const COOKIE = "sa_sid";
const IDLE_MS = 30 * 60_000;
const ABS_MS = 12 * 3600_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAIL = 5;
const N = 2 ** 15, R = 8, P = 1;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.VERCEL_ENV === "production") throw new Error("SESSION_SECRET 이 설정되지 않았다");
  return s || "dev-only-session-secret";
}

export const pwRule = (pw: string) => pw.length >= 9 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);

export async function hashPw(pw: string) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${h.toString("base64")}`;
}

async function verifyPw(pw: string, stored: string) {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(want, got);
}

export const sign = (sid: string) => `${sid}.${createHmac("sha256", secret()).update(sid).digest("base64url")}`;
function unsign(v: string | undefined) {
  if (!v) return null;
  const i = v.lastIndexOf(".");
  const sid = v.slice(0, i);
  const a = Buffer.from(v.slice(i + 1)), b = Buffer.from(sign(sid).slice(i + 1));
  return a.length === b.length && timingSafeEqual(a, b) ? sid : null;
}

export const cookieOf = (req: Request, name = COOKIE) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(name + "="))?.slice(name.length + 1);

export function sessionCookie(value: string, maxAgeSec: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export type LoginResult = { ok: true; account: Account; cookie: string } | { ok: false; error: string; status: number };
const LOCKED_MSG = "비밀번호를 5회 잘못 입력해 잠시 잠겼습니다. 15분 뒤 다시 시도하거나 운영자에게 해제를 요청하세요.";

/** 실패 1회를 원자적으로 센다 — 5회째에 15분 잠금. 실패 경로에서는 잠금 시각을 지우지 않는다(동시 시도에도 안전) */
async function countFailure(id: string) {
  await db().query(
    `update sa_accounts set
       failed_count = case when failed_count + 1 >= $2 then 0 else failed_count + 1 end,
       locked_until = case when failed_count + 1 >= $2 then now() + make_interval(secs => $3) else locked_until end
     where id = $1`,
    [id, MAX_FAIL, LOCK_MS / 1000],
  );
}

export async function login(id: string, pw: string, ua: string): Promise<LoginResult> {
  await ensureSchema();
  const sql = db();
  const generic = { ok: false as const, error: "아이디 또는 비밀번호가 올바르지 않습니다.", status: 401 };
  const [row] = (await sql.query(
    "select id, pw_hash, status, (locked_until is not null and locked_until > now()) as locked from sa_accounts where id = $1", [id],
  )) as { id: string; pw_hash: string; status: string; locked: boolean }[];
  const account = ACCOUNTS.find((a) => a.id === id);
  if (!row || !account || row.status !== "ACTIVE") return generic;
  if (row.locked) return { ok: false, error: LOCKED_MSG, status: 423 };
  if (!(await verifyPw(pw, row.pw_hash))) {
    await countFailure(id);
    return generic;
  }
  // 성공 — 그 사이 다른 실패로 잠겼다면 들이지 않는다
  const [ok] = (await sql.query(
    "update sa_accounts set failed_count = 0, locked_until = null, last_login_at = now() where id = $1 and (locked_until is null or locked_until <= now()) returning must_change_pw", [id],
  )) as { must_change_pw: boolean }[];
  if (!ok) return { ok: false, error: LOCKED_MSG, status: 423 };
  const sid = randomBytes(32).toString("hex");
  const now = Date.now();
  await sql.query("update sa_sessions set revoked_at = now() where account_id = $1 and revoked_at is null", [id]);
  await sql.query("insert into sa_sessions (sid, account_id, created_at, last_seen_at, expires_at, ua_hash) values ($1, $2, now(), now(), $3, $4)", [
    sid, id, new Date(now + ABS_MS), createHmac("sha256", "ua").update(ua).digest("hex").slice(0, 16),
  ]);
  return { ok: true, account: { ...account, mustChangePw: !!ok.must_change_pw }, cookie: sessionCookie(sign(sid), ABS_MS / 1000) };
}

export async function logout(req: Request) {
  const sid = unsign(cookieOf(req));
  if (sid) await db().query("update sa_sessions set revoked_at = now() where sid = $1", [sid]);
}

/** 이 요청의 세션 ID(서명 확인된 것) */
export const currentSid = (req: Request) => unsign(cookieOf(req));

/**
 * 요청의 세션 → 계정. 만료·폐기·계정 비활성이면 null.
 * 유휴 30분은 **사용자 조작**으로만 연장한다 — 화면이 사용자 입력 직후 보낸 요청(x-sa-activity: 1)만 last_seen 을 올린다(60초에 1회).
 * 백그라운드 폴링(질문 목록·체크·특보)은 세션을 연장하지 않는다.
 */
export async function sessionAccount(req: Request): Promise<Account | null> {
  const sid = unsign(cookieOf(req));
  if (!sid) return null;
  await ensureSchema();
  const [s] = (await db().query(
    `select s.account_id, s.last_seen_at, s.expires_at, s.revoked_at, a.status, a.must_change_pw
       from sa_sessions s left join sa_accounts a on a.id = s.account_id where s.sid = $1`, [sid],
  )) as { account_id: string; last_seen_at: string; expires_at: string; revoked_at: string | null; status: string | null; must_change_pw: boolean | null }[];
  if (!s || s.revoked_at || s.status !== "ACTIVE") return null;
  const now = Date.now(), seen = new Date(s.last_seen_at).getTime();
  if (now - seen > IDLE_MS || now > new Date(s.expires_at).getTime()) return null;
  if (req.headers.get("x-sa-activity") === "1" && now - seen > 60_000) await db().query("update sa_sessions set last_seen_at = now() where sid = $1", [sid]);
  const acc = ACCOUNTS.find((a) => a.id === s.account_id);
  return acc ? { ...acc, mustChangePw: !!s.must_change_pw } : null;
}

/** 계정 발급·비밀번호 재설정 — /api/auth/seed(SEED_SECRET 필요). 기본은 첫 로그인 때 비밀번호 변경 강제(Figma 101002), 기존 세션 폐기 */
export async function upsertAccount(id: string, pw: string, mustChange = true) {
  const a = ACCOUNTS.find((x) => x.id === id);
  if (!a) throw new Error("알 수 없는 계정 " + id);
  if (!pwRule(pw)) throw new Error("비밀번호 규칙(9자 이상, 영문·숫자·특수문자) 위반: " + id);
  await ensureSchema();
  await db().query(
    `insert into sa_accounts (id, name, org, role, admin_code, pw_hash, must_change_pw, failed_count, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,0,'ACTIVE',now())
     on conflict (id) do update set pw_hash = excluded.pw_hash, must_change_pw = excluded.must_change_pw, failed_count = 0, locked_until = null, status = 'ACTIVE'`,
    [id, a.name, a.region, a.role, null, await hashPw(pw), mustChange],
  );
  await db().query("update sa_sessions set revoked_at = now() where account_id = $1 and revoked_at is null", [id]);
}

/** 비밀번호 변경 — 현재 비밀번호 오입력도 잠금 횟수에 센다. 같은 비밀번호 금지. 이 세션 말고 다른 세션은 끊는다 */
export async function changePw(id: string, oldPw: string, newPw: string, keepSid: string | null) {
  const [row] = (await db().query(
    "select pw_hash, (locked_until is not null and locked_until > now()) as locked from sa_accounts where id = $1", [id],
  )) as { pw_hash: string; locked: boolean }[];
  if (!row) return "계정을 찾을 수 없습니다.";
  if (row.locked) return LOCKED_MSG;
  if (!(await verifyPw(oldPw, row.pw_hash))) {
    await countFailure(id);
    return "현재 비밀번호가 올바르지 않습니다.";
  }
  if (newPw === oldPw) return "현재 비밀번호와 다른 비밀번호로 바꾸세요.";
  if (!pwRule(newPw)) return "새 비밀번호는 9자 이상이며 영문·숫자·특수문자를 모두 포함해야 합니다.";
  await db().query("update sa_accounts set pw_hash = $2, must_change_pw = false, failed_count = 0 where id = $1", [id, await hashPw(newPw)]);
  await db().query("update sa_sessions set revoked_at = now() where account_id = $1 and revoked_at is null and sid <> $2", [id, keepSid ?? ""]);
  return null;
}

export async function unlock(id: string) {
  await db().query("update sa_accounts set failed_count = 0, locked_until = null where id = $1", [id]);
}
