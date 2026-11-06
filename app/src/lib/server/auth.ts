import "server-only";
import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ACCOUNTS, type Account } from "../config";
import { inspectPw, issuedAccount, PW_CHAR_MSG, pwRuleOk } from "../accountRules";
import { db, ensureSchema } from "./db";

/**
 * 로그인·세션 (R7, UFR-007) — 고정 7계정(R50 개발서버 아이디)과 계정 발급 화면에서 만든 계정(R55), scrypt 해시, 서명 쿠키 sa_sid
 * 세션 수명 240분(개발서버 Jwt:AccessTokenMinutes — R57, R34 유휴 4시간·절대 12시간 대체): 로그인한 때 또는 사람이 [시간 연장]을 누른 때부터 센다.
 *   화면 조작·폴링·새로고침은 수명을 늘리지 않는다(개발서버 AuthService.IsOver·RefreshAsync extend). 다하면 다음 요청부터 401(AUTH_SESSION_EXPIRED)
 * 비밀번호 9자 이상 + 영문·숫자·특수문자 · 5회 실패 15분 잠금
 * 한 사람당 접속 하나 — 개발서버 AuthService(R53): 비밀번호가 맞았는데 다른 곳에서 접속 중이면(자취 beat_at 이 2분 안·이 브라우저의 세션이 아님)
 * 바로 들이지 않고 409 AUTH_SESSION_EXISTS 로 되묻는다(SCR-UNE-101003). force 면 그 접속을 끊고(revoked_reason TAKEN_OVER) 들어간다.
 * 끊긴 쪽은 다음 두드림(/api/auth/ping)에서 AUTH_SESSION_TAKEN_OVER 를 받아 「접속이 종료되었습니다」(101004)를 띄운다.
 */
const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opt: object) => Promise<Buffer>;
export const COOKIE = "sa_sid";
/** 세션 수명 — 로그인·[시간 연장]부터 240분(개발서버 appsettings Jwt:AccessTokenMinutes 240, R57) */
export const SESSION_MS = 240 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAIL = 5;
const N = 2 ** 15, R = 8, P = 1;
/** 이 시간 안에 자취가 있으면 「접속 중」(개발서버 SessionLife.Window) */
export const LIVE_WINDOW_MS = 2 * 60_000;
/** 자취를 다시 찍는 간격(개발서버 SessionLife.TouchEvery) */
const TOUCH_MS = 20_000;
export const SESSION_EXISTS = "AUTH_SESSION_EXISTS";
export const TAKEN_OVER = "AUTH_SESSION_TAKEN_OVER";
export const SESSION_EXPIRED = "AUTH_SESSION_EXPIRED";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.VERCEL_ENV === "production") throw new Error("SESSION_SECRET 이 설정되지 않았다");
  return s || "dev-only-session-secret";
}

/** 아이디 → 계정 — 고정 7계정은 설정(ACCOUNTS), 그 밖은 발급 화면이 남긴 등급·소속(R55). 어느 쪽도 아니면 null */
export const accountOf = (id: string, grade?: number | null, teamSn?: number | null): Account | null =>
  ACCOUNTS.find((a) => a.id === id) ?? issuedAccount(id, grade, teamSn);

/** 비밀번호 규칙 — lib/accountRules pwRuleOk(개발서버 AccountRules.ValidatePassword: 공백·한글 등 거절, R60) */
export const pwRule = (pw: string) => pwRuleOk(pw);

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

export type LoginResult = { ok: true; account: Account; cookie: string; expiresAt: string } | { ok: false; error: string; status: number; code?: string };
/** 화면설계 SCR-UNE-101003 의 확정 문구 */
export const SESSION_EXISTS_MSG = "다른 곳에서 이 계정으로 접속 중입니다. 로그인하면 그 접속은 종료됩니다.";
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

/**
 * 로그인. opts.force = 다른 곳의 접속을 끊고 들어간다, opts.currentSid = 이 브라우저가 들고 온 세션(남아 있는 접속이 바로 이 브라우저의 것이면 되묻지 않는다)
 */
export async function login(id: string, pw: string, ua: string, opts: { force?: boolean; currentSid?: string | null } = {}): Promise<LoginResult> {
  await ensureSchema();
  const sql = db();
  // 화면설계 SCR-UNE-101001 의 확정 문구 — 어느 칸이 틀렸는지도, 그 계정이 있는지도 알려 주지 않는다
  const generic = { ok: false as const, error: "아이디 또는 비밀번호를 잘못 입력했습니다. 다시 입력하세요.", status: 401 };
  const [row] = (await sql.query(
    "select id, pw_hash, status, grade, team_sn, (locked_until is not null and locked_until > now()) as locked from sa_accounts where id = $1", [id],
  )) as { id: string; pw_hash: string; status: string; grade: number | null; team_sn: number | null; locked: boolean }[];
  const account = row ? accountOf(row.id, row.grade, row.team_sn) : null;
  if (!row || !account || row.status !== "ACTIVE") return generic;
  if (row.locked) return { ok: false, error: LOCKED_MSG, status: 423 };
  if (!(await verifyPw(pw, row.pw_hash))) {
    await countFailure(id);
    return generic;
  }
  // 다른 곳에서 접속 중이면 되묻는다 — 비밀번호를 확인한 «뒤에»(먼저 물으면 아이디만으로 접속 여부가 드러난다), 실패 기록을 지우기 전에
  if (!opts.force) {
    const live = (await sql.query(
      `select sid from sa_sessions where account_id = $1 and revoked_at is null and expires_at > now()
         and beat_at > now() - make_interval(secs => $2) and sid <> $3 limit 1`,
      [id, LIVE_WINDOW_MS / 1000, opts.currentSid ?? ""],
    )) as { sid: string }[];
    if (live.length) return { ok: false, error: SESSION_EXISTS_MSG, status: 409, code: SESSION_EXISTS };
  }
  // 성공 — 그 사이 다른 실패로 잠겼다면 들이지 않는다
  const [ok] = (await sql.query(
    "update sa_accounts set failed_count = 0, locked_until = null, last_login_at = now() where id = $1 and (locked_until is null or locked_until <= now()) returning must_change_pw", [id],
  )) as { must_change_pw: boolean }[];
  if (!ok) return { ok: false, error: LOCKED_MSG, status: 423 };
  const sid = randomBytes(32).toString("hex");
  const now = Date.now();
  // 앞의 접속은 끊는다 — 끊긴 쪽이 「다른 곳에서 로그인했습니다」를 알 수 있게 까닭을 적는다
  await sql.query("update sa_sessions set revoked_at = now(), revoked_reason = 'TAKEN_OVER' where account_id = $1 and revoked_at is null", [id]);
  await sql.query("insert into sa_sessions (sid, account_id, created_at, last_seen_at, beat_at, expires_at, ua_hash) values ($1, $2, now(), now(), now(), $3, $4)", [
    sid, id, new Date(now + SESSION_MS), createHmac("sha256", "ua").update(ua).digest("hex").slice(0, 16),
  ]);
  return { ok: true, account: { ...account, mustChangePw: !!ok.must_change_pw }, cookie: sessionCookie(sign(sid), SESSION_MS / 1000), expiresAt: new Date(now + SESSION_MS).toISOString() };
}

export async function logout(req: Request) {
  const sid = unsign(cookieOf(req));
  if (sid) await db().query("update sa_sessions set revoked_at = now(), revoked_reason = 'LOGOUT' where sid = $1 and revoked_at is null", [sid]);
}

/**
 * 「아직 보고 있습니다」(개발서버 /auth/ping) — 살아 있으면 자취(beat_at)를 찍고(20초에 1회) 끝나는 시각,
 * 끊겼으면 까닭: 다른 곳의 로그인으로 끊긴 것은 TAKEN_OVER, 그 밖(만료·로그아웃·없음)은 EXPIRED. 수명은 늘리지 않는다
 */
export async function beat(req: Request): Promise<{ code: string } | { expiresAt: string }> {
  const sid = unsign(cookieOf(req));
  if (!sid) return { code: SESSION_EXPIRED };
  await ensureSchema();
  const [s] = (await db().query(
    `select s.revoked_at, s.revoked_reason, s.expires_at, s.beat_at, a.status
       from sa_sessions s left join sa_accounts a on a.id = s.account_id where s.sid = $1`, [sid],
  )) as { revoked_at: string | null; revoked_reason: string | null; expires_at: string; beat_at: string | null; status: string | null }[];
  if (!s) return { code: SESSION_EXPIRED };
  if (s.revoked_at) return { code: s.revoked_reason === "TAKEN_OVER" ? TAKEN_OVER : SESSION_EXPIRED };
  const now = Date.now();
  if (s.status !== "ACTIVE" || now >= new Date(s.expires_at).getTime()) return { code: SESSION_EXPIRED };
  if (!s.beat_at || now - new Date(s.beat_at).getTime() > TOUCH_MS) await db().query("update sa_sessions set beat_at = now() where sid = $1", [sid]);
  return { expiresAt: new Date(s.expires_at).toISOString() };
}

/** 창이 닫힌다 — 접속은 두고 자취만 창(2분)보다 한 뼘 더 뒤로 보낸다. 다른 브라우저가 곧바로 들어와도 닫힌 창을 가리키며 되묻지 않는다 */
export async function markLeft(req: Request) {
  const sid = unsign(cookieOf(req));
  if (!sid) return;
  await ensureSchema();
  await db().query("update sa_sessions set beat_at = now() - make_interval(secs => $2) where sid = $1 and revoked_at is null", [sid, LIVE_WINDOW_MS / 1000 + 1]);
}

/** 이 요청의 세션 ID(서명 확인된 것) */
export const currentSid = (req: Request) => unsign(cookieOf(req));

/**
 * 요청의 세션 → 계정. 만료(수명 240분)·폐기·계정 비활성이면 null.
 * last_seen 은 «마지막 조작» 기록일 뿐 수명을 늘리지 않는다 — 화면이 사용자 입력 직후 보낸 요청(x-sa-activity: 1)만 올린다(60초에 1회, 운영관리 「접속 중」 표시용).
 */
export async function sessionAccount(req: Request): Promise<Account | null> {
  return (await sessionInfo(req))?.account ?? null;
}

/** 세션 → 계정과 끝나는 시각(사용자 메뉴 「로그아웃까지 남은 시간」 — /api/auth/me) */
export async function sessionInfo(req: Request): Promise<{ account: Account; expiresAt: string } | null> {
  const sid = unsign(cookieOf(req));
  if (!sid) return null;
  await ensureSchema();
  const [s] = (await db().query(
    `select s.account_id, s.last_seen_at, s.expires_at, s.revoked_at, a.status, a.must_change_pw, a.grade, a.team_sn
       from sa_sessions s left join sa_accounts a on a.id = s.account_id where s.sid = $1`, [sid],
  )) as { account_id: string; last_seen_at: string; expires_at: string; revoked_at: string | null; status: string | null; must_change_pw: boolean | null; grade: number | null; team_sn: number | null }[];
  if (!s || s.revoked_at || s.status !== "ACTIVE") return null;
  const now = Date.now(), seen = new Date(s.last_seen_at).getTime();
  if (now >= new Date(s.expires_at).getTime()) return null;
  if (req.headers.get("x-sa-activity") === "1" && now - seen > 60_000) await db().query("update sa_sessions set last_seen_at = now() where sid = $1", [sid]);
  const acc = accountOf(s.account_id, s.grade, s.team_sn);
  return acc ? { account: { ...acc, mustChangePw: !!s.must_change_pw }, expiresAt: new Date(s.expires_at).toISOString() } : null;
}

/**
 * [시간 연장] — 사람이 누른 것이므로 수명을 지금부터 다시 센다(개발서버 /auth/refresh?extend=true · IssueTokensAsync resetAge).
 * 이미 끝난 접속은 되살리지 않는다(null — 개발서버 RefreshAsync IsOver). 쿠키도 같은 수명으로 다시 낸다
 */
export async function extendSession(req: Request): Promise<{ expiresAt: string; cookie: string } | null> {
  const sid = unsign(cookieOf(req));
  if (!sid) return null;
  await ensureSchema();
  const [row] = (await db().query(
    `update sa_sessions s set expires_at = now() + make_interval(secs => $2), last_seen_at = now()
       from sa_accounts a
      where s.sid = $1 and a.id = s.account_id and a.status = 'ACTIVE' and s.revoked_at is null and s.expires_at > now()
      returning s.expires_at`,
    [sid, SESSION_MS / 1000],
  )) as { expires_at: string }[];
  if (!row) return null;
  return { expiresAt: new Date(row.expires_at).toISOString(), cookie: sessionCookie(sign(sid), SESSION_MS / 1000) };
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
  await db().query("update sa_sessions set revoked_at = now(), revoked_reason = 'RESET' where account_id = $1 and revoked_at is null", [id]);
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
  if (inspectPw(newPw).other) return PW_CHAR_MSG;
  if (!pwRule(newPw)) return "새 비밀번호는 9자 이상이며 영문·숫자·특수문자를 모두 포함해야 합니다.";
  await db().query("update sa_accounts set pw_hash = $2, must_change_pw = false, failed_count = 0 where id = $1", [id, await hashPw(newPw)]);
  await db().query("update sa_sessions set revoked_at = now(), revoked_reason = 'PASSWORD' where account_id = $1 and revoked_at is null and sid <> $2", [id, keepSid ?? ""]);
  return null;
}

export async function unlock(id: string) {
  await db().query("update sa_accounts set failed_count = 0, locked_until = null where id = $1", [id]);
}
