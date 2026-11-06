import "server-only";
import { randomInt } from "node:crypto";
import { ACCOUNTS } from "../config";
import {
  GRADES, GRADE_ISSUER, ID_MAX, ID_MIN, ID_PATTERN, ID_PATTERN_TEXT, MEMO_MAX, PW_MIN, PW_RULE_TEXT, TEAMS,
  allowedTeams, gradeName, isAllowedTeam, isGrade, isIssuableGrade, teamOf, validateId,
} from "../accountRules";
import type { AccountMeta, AccountSummary, IssuedAccount, IssueItem, IssueResponse } from "../accountTypes";
import { hashPw, pwRule } from "./auth";
import { db, ensureSchema } from "./db";

/**
 * 계정 발급·폐기(R55) — 개발서버 Dsai.Account.Bll AccountService · AccountRules 그대로
 *  · 비밀번호는 서버가 만든다(login.txt 6번). 평문은 발급·재발급 응답에서만 나가고 저장은 scrypt 해시뿐 — 로그·감사 기록에 남기지 않는다
 *  · 발급·재발급 직후는 「초기 비밀번호」 — 첫 로그인에서 바꾸게 한다(must_change_pw)
 *  · 고정 7계정(lib/config ACCOUNTS)은 시연·로그인 화면이 쓰는 계정이라 폐기·비밀번호 재발급을 막는다(잠금 해제는 됨) — 개발서버와 다른 점
 */
export class AccountError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const FIXED = new Map(ACCOUNTS.map((a) => [a.id.toLowerCase(), a]));
export const isFixedAccount = (id: string) => FIXED.has(id.toLowerCase());

// 사람이 헷갈리는 글자(0 O o, 1 l I)는 뺀다 — 발급자가 말·메모로 전달하기 때문(개발서버 AccountRules)
const GEN_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const GEN_LOWER = "abcdefghijkmnpqrstuvwxyz";
const GEN_DIGIT = "23456789";
const GEN_SPECIAL = "!@#$%^&*?";

/** 발급용 비밀번호 — 대·소문자·숫자·특수문자를 한 글자씩 먼저 심고 섞는다(개발서버 GeneratePassword, 기본 12자) */
export function generatePassword(length = 12): string {
  const n = Math.max(length, PW_MIN);
  const pools = [GEN_UPPER, GEN_LOWER, GEN_DIGIT, GEN_SPECIAL];
  const all = pools.join("");
  const pick = (p: string) => p[randomInt(p.length)];
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = [...pools.map(pick), ...Array.from({ length: n - pools.length }, () => pick(all))];
    for (let i = c.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [c[i], c[j]] = [c[j], c[i]];
    }
    const pw = c.join("");
    if (pwRule(pw)) return pw;
  }
  throw new Error(`규칙(${PW_RULE_TEXT})을 만족하는 비밀번호를 만들지 못했습니다.`);
}

/** 등급·소속 목록과 입력 규칙(개발서버 GET /accounts/meta) — 등급은 발급할 수 있는 것만, 소속은 이름 사전이라 운영사까지 */
export function accountMeta(): AccountMeta {
  return {
    grades: GRADES.filter((g) => isIssuableGrade(g.sn)).map((g) => ({ gradSn: g.sn, gradName: g.name, teamSns: allowedTeams(g.sn).map((t) => t.sn) })),
    teams: TEAMS.map((t) => ({ teamSn: t.sn, teamName: t.name, adminCode: t.adminCode })),
    rules: { idMinLength: ID_MIN, idMaxLength: ID_MAX, idPattern: ID_PATTERN, idPatternText: ID_PATTERN_TEXT, passwordMinLength: PW_MIN, passwordRuleText: PW_RULE_TEXT },
  };
}

interface Row {
  id: string; grade: number | null; team_sn: number | null; memo: string | null; created_at: string; created_by: string | null;
  must_change_pw: boolean; locked: boolean; failed_count: number; status: string;
}

/** 등급·소속 — 발급한 계정은 DB 칸, 고정 계정은 설정 */
const gradeTeam = (r: Pick<Row, "id" | "grade" | "team_sn">) => {
  const f = FIXED.get(r.id.toLowerCase());
  return { grade: r.grade ?? f?.grade ?? null, team: r.team_sn ?? f?.teamSn ?? null };
};

/** 계정 목록(개발서버 GET /accounts) — sa_accounts 전부, 발급 차례 */
export async function listAccounts(): Promise<AccountSummary[]> {
  await ensureSchema();
  const rows = (await db().query(
    `select id, grade, team_sn, memo, created_at, created_by, must_change_pw, failed_count, status,
            (locked_until is not null and locked_until > now()) as locked
       from sa_accounts order by created_at, id`,
  )) as Row[];
  return rows.map((r) => {
    const { grade, team } = gradeTeam(r);
    return {
      userId: r.id, userName: r.id, gradSn: grade, gradName: gradeName(grade), teamSn: team, teamName: teamOf(team)?.name ?? "—",
      memo: r.memo, createdAt: new Date(r.created_at).toISOString(), createdBy: r.created_by, mustChangePassword: !!r.must_change_pw,
      isLocked: !!r.locked, loginFailCount: r.failed_count, fixed: isFixedAccount(r.id), active: r.status === "ACTIVE",
    };
  });
}

/** 줄 하나 검사(개발서버 AccountService.ValidateAsync 차례·문구) — 있는 ID 는 따로 본다 */
function validateItem(item: IssueItem, id: string, seen: Set<string>): string | null {
  const idErr = validateId(id);
  if (idErr) return idErr;
  if (seen.has(id.toLowerCase())) return "같은 요청 안에 ID가 중복됩니다.";
  if (!isGrade(item.gradSn)) return "없는 등급입니다.";
  if (!isIssuableGrade(item.gradSn)) return "계정 발급자 등급은 이 화면에서 발급할 수 없습니다.";
  if (!isAllowedTeam(item.gradSn, item.teamSn)) return "이 등급에서 쓸 수 없는 소속입니다.";
  if (item.memo && item.memo.length > MEMO_MAX) return `비고는 ${MEMO_MAX}자를 넘을 수 없습니다.`;
  if (isFixedAccount(id)) return "이미 쓰고 있는 ID입니다.";
  return null;
}

/** 계정 발급(개발서버 POST /accounts) — 맞는 줄은 발급하고 틀린 줄만 사유를 돌려준다 */
export async function issueAccounts(items: IssueItem[], by: string): Promise<IssueResponse> {
  await ensureSchema();
  const sql = db();
  const results: IssuedAccount[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = i + 1;
    const id = (item.userId ?? "").trim();
    const error = validateItem(item, id, seen);
    if (error) {
      results.push({ row, userId: id, ok: false, password: null, error });
      continue;
    }
    seen.add(id.toLowerCase());
    const [taken] = (await sql.query("select id from sa_accounts where lower(id) = lower($1) limit 1", [id])) as { id: string }[];
    if (taken) {
      results.push({ row, userId: id, ok: false, password: null, error: "이미 쓰고 있는 ID입니다." });
      continue;
    }
    const team = teamOf(item.teamSn)!;
    const role = GRADES.find((g) => g.sn === item.gradSn)!.role;
    const password = generatePassword();
    const memo = item.memo?.trim() ? item.memo.trim() : null;
    // 동시에 같은 ID 를 발급하면 기본 키가 막는다 — 들어가지 않았으면 실패 줄로
    const done = (await sql.query(
      `insert into sa_accounts (id, name, org, role, admin_code, pw_hash, must_change_pw, failed_count, status, created_at, grade, team_sn, memo, created_by)
       values ($1, $1, $2, $3, $4, $5, true, 0, 'ACTIVE', now(), $6, $7, $8, $9)
       on conflict (id) do nothing returning id`,
      [id, team.name, role, team.adminCode, await hashPw(password), item.gradSn, item.teamSn, memo, by],
    )) as { id: string }[];
    results.push(done.length ? { row, userId: id, ok: true, password, error: null } : { row, userId: id, ok: false, password: null, error: "이미 쓰고 있는 ID입니다." });
  }
  return { issued: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

async function target(id: string) {
  await ensureSchema();
  const [r] = (await db().query("select id, grade, team_sn from sa_accounts where id = $1", [id])) as Pick<Row, "id" | "grade" | "team_sn">[];
  if (!r) throw new AccountError(404, "ACCOUNT_NOT_FOUND", "계정을 찾을 수 없습니다.");
  return r;
}

/** 계정 폐기(개발서버 DELETE /accounts/{sn}) — 행을 지우고 접속·계정 설정(kv acct:)도 함께 지운다 */
export async function deleteAccount(id: string, actor: string): Promise<void> {
  const r = await target(id);
  if (r.id === actor) throw new AccountError(422, "ACCOUNT_SELF_DELETE_FORBIDDEN", "자기 계정은 지울 수 없습니다.");
  if (isFixedAccount(r.id)) throw new AccountError(422, "ACCOUNT_FIXED", "시연·로그인 화면이 쓰는 고정 계정이라 폐기할 수 없습니다.");
  const { grade } = gradeTeam(r);
  if (grade === GRADE_ISSUER) {
    const [c] = (await db().query("select count(*)::int as n from sa_accounts where grade = $1", [GRADE_ISSUER])) as { n: number }[];
    if ((c?.n ?? 0) + ACCOUNTS.filter((a) => a.grade === GRADE_ISSUER).length <= 1)
      throw new AccountError(422, "ACCOUNT_LAST_ISSUER_FORBIDDEN", "마지막 남은 계정 발급자는 지울 수 없습니다.");
  }
  await db().query("delete from sa_sessions where account_id = $1", [r.id]);
  await db().query("delete from sa_kv where scope = $1", [`acct:${r.id}`]);
  await db().query("delete from sa_accounts where id = $1", [r.id]);
}

/** 비밀번호 재발급(개발서버 POST /accounts/{sn}/password) — 새 초기 비밀번호 · 잠금 해제 겸함 · 기존 접속 끊음 */
export async function resetPassword(id: string): Promise<IssuedAccount> {
  const r = await target(id);
  if (isFixedAccount(r.id)) throw new AccountError(422, "ACCOUNT_FIXED", "시연·로그인 화면이 쓰는 고정 계정이라 비밀번호를 재발급할 수 없습니다.");
  const password = generatePassword();
  await db().query("update sa_accounts set pw_hash = $2, must_change_pw = true, failed_count = 0, locked_until = null where id = $1", [r.id, await hashPw(password)]);
  await db().query("update sa_sessions set revoked_at = now(), revoked_reason = 'RESET' where account_id = $1 and revoked_at is null", [r.id]);
  return { row: 1, userId: r.id, ok: true, password, error: null };
}

/** 잠금 해제(개발서버 POST /accounts/{sn}/unlock) */
export async function unlockAccount(id: string): Promise<void> {
  const r = await target(id);
  await db().query("update sa_accounts set failed_count = 0, locked_until = null where id = $1", [r.id]);
}
