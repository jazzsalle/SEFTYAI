#!/usr/bin/env node
/**
 * 운영 DB 계정 아이디 바꾸기 (R50, 2026-11-06 「개발서버 아이디로 바꾸기」) — 운영자 전용. 사용자가 직접 실행한다.
 *   app 폴더에서
 *     node harness/ops/rename_accounts.mjs --pw-file <저장소 밖 파일>            미리 보기(읽기만): 표·칸별로 옛 아이디가 든 행 수
 *     node harness/ops/rename_accounts.mjs --pw-file <저장소 밖 파일> --apply    실행: 한 트랜잭션
 *
 * DB 주소는 app/.env.local 의 DATABASE_URL(운영 Neon)만 읽는다.
 * 하는 일(--apply, 한 트랜잭션 — 하나라도 실패하면 전부 되돌림)
 *  1) 옮김 bs_safety01→busan · ij_safety01→inje · yc_safety02→01000 · mois_dsd01→hang · admin01→unes
 *     public 스키마의 모든 표에서 글자(text·varchar)·JSON(json·jsonb) 칸을 훑어, 옛 아이디가 든 값을 새 아이디로 바꾼다
 *     (sa_accounts.id — 비밀번호 해시·잠금 상태는 그대로 이어받음, account_id·by_id·updated_by, kv 범위 acct:<계정>, JSON 안의 아이디 등)
 *  2) 옛 아이디의 살아 있는 세션은 끊는다(revoked_at) — 새 아이디로 다시 로그인
 *  3) 새 계정 busan2 · issuer 를 발급한다(이미 있으면 건너뜀) — 7개 계정 모두 사용자가 지정한 비밀번호, 첫 로그인 변경 요구 없음(2026-11-06).
 *     초기 비밀번호는 --pw-file 파일(SA_INIT_PASSWORDS='{"busan2":"…","issuer":"…"}')에서 읽고, 파일이 없으면 --apply 때 새로 만들어 적는다.
 *     해시는 lib/server/auth.ts hashPw 와 같은 방식(scrypt N=2^15 r=8 p=1, 16바이트 소금)
 *  4) sa_audit 에 account.rename 한 줄(새 아이디만)
 * 비밀번호·해시·DB 주소는 출력하지 않는다(표 이름·칸 이름·행 수·계정 아이디만).
 */
import { randomBytes, randomInt, scrypt as _scrypt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import { ACCOUNTS } from "../../src/lib/config.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP = [
  ["bs_safety01", "busan"],
  ["ij_safety01", "inje"],
  ["yc_safety02", "01000"],
  ["mois_dsd01", "hang"],
  ["admin01", "unes"],
];
const NEW_ACCOUNTS = ["busan2", "issuer"];
const OLD = MAP.map(([o]) => o);

const fail = (m) => { console.error("중단:", m); process.exit(1); };
const apply = process.argv.includes("--apply");
const flag = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const pwFile = flag("--pw-file") ? resolve(flag("--pw-file")) : fail("--pw-file <저장소 밖 파일> 이 필요하다 (새 계정 초기 비밀번호)");
if ((pwFile + "\\").toLowerCase().startsWith((resolve(APP, "..") + "\\").toLowerCase()) || (pwFile + "/").startsWith(resolve(APP, "..") + "/")) fail("--pw-file 은 저장소(SEFTYAI) 밖이어야 한다");

function prodUrl() {
  const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 운영 DATABASE_URL(postgres://…)이 없다");
  return url;
}
const sql = neon(prodUrl());
const q = (id) => `"${id.replace(/"/g, '""')}"`;

// ── 새 계정 초기 비밀번호 (deploy_setup.mjs 와 같은 규칙: 14자, 영문 대·소문자·숫자·특수문자) ──
const pwRule = (pw) => pw.length >= 9 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
const genPw = () => {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%^&*"];
  const all = sets.join("");
  const chars = [...sets.map((s) => s[randomInt(s.length)]), ...Array.from({ length: 10 }, () => all[randomInt(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
};
function readPwFile() {
  const line = readFileSync(pwFile, "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  let pws;
  try { pws = JSON.parse(line.slice("SA_INIT_PASSWORDS=".length).replace(/^'|'$/g, "")); } catch { fail(`비밀번호 파일 형식이 맞지 않다: ${pwFile}`); }
  for (const id of NEW_ACCOUNTS) if (typeof pws?.[id] !== "string" || !pwRule(pws[id])) fail(`비밀번호 파일에 ${id} 값이 없거나 규칙 위반`);
  return pws;
}
const scrypt = promisify(_scrypt);
async function hashPw(pw) {
  const N = 2 ** 15, R = 8, P = 1, salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${h.toString("base64")}`;
}

// ── 훑기 ──
async function columns() {
  return (await sql.query(
    `select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and data_type in ('text', 'character varying', 'json', 'jsonb')
      order by table_name, ordinal_position`,
  ));
}
const asText = (c) => (c.data_type === "json" || c.data_type === "jsonb" ? `${q(c.column_name)}::text` : q(c.column_name));
const hasAny = (c) => `(${OLD.map((o) => `strpos(${asText(c)}, '${o}') > 0`).join(" or ")})`;

async function scan(cols) {
  const out = [];
  for (const c of cols) {
    const sel = OLD.map((o, i) => `count(*) filter (where strpos(${asText(c)}, '${o}') > 0)::int as n${i}`).join(", ");
    const [r] = await sql.query(`select ${sel} from ${q(c.table_name)}`);
    OLD.forEach((o, i) => { if (r[`n${i}`]) out.push({ 표: c.table_name, 칸: c.column_name, 옛아이디: o, 행: r[`n${i}`] }); });
  }
  return out;
}
async function tableRows(tables) {
  const out = {};
  for (const t of tables) out[t] = (await sql.query(`select count(*)::int as n from ${q(t)}`))[0].n;
  return out;
}
const accountIds = async () => (await sql.query("select id from sa_accounts order by id")).map((r) => r.id);

// ── 본문 ──
const cols = await columns();
const tables = [...new Set(cols.map((c) => c.table_name))];
const before = await scan(cols);
const ids0 = await accountIds();
console.log(`운영 DB 계정(지금): ${ids0.join(", ")}`);
console.log(before.length ? "옛 아이디가 든 행 (표·칸별):" : "옛 아이디가 든 행 없음");
if (before.length) console.table(before);
const clash = MAP.filter(([o, n]) => ids0.includes(o) && ids0.includes(n)).map(([o, n]) => `${o}→${n}`);
if (clash.length) fail(`새 아이디가 이미 있어 옮길 수 없다: ${clash.join(", ")}`);
const newMissing = NEW_ACCOUNTS.filter((id) => !ids0.includes(id));
console.log(`새로 발급할 계정: ${newMissing.length ? newMissing.join(", ") : "없음(이미 있음)"} · 비밀번호 파일 ${existsSync(pwFile) ? "있음" : "없음(--apply 때 만듦)"}`);

if (!apply) {
  console.log("\n미리 보기만 했다. 실행하려면 --apply 를 붙인다.");
  process.exit(0);
}

const rows0 = await tableRows(tables);
if (newMissing.length && !existsSync(pwFile)) {
  const pws = Object.fromEntries(NEW_ACCOUNTS.map((id) => [id, genPw()]));
  writeFileSync(pwFile, `# R50 새 계정 초기 비밀번호 (${new Date().toISOString()}) — 첫 로그인 때 변경 강제\nSA_INIT_PASSWORDS='${JSON.stringify(pws)}'\n`, { mode: 0o600 });
  console.log(`새 계정 초기 비밀번호 파일을 만들었다: ${pwFile}`);
}
const pws = newMissing.length ? readPwFile() : {};

const replaceExpr = (c) => {
  let e = asText(c);
  for (const [o, n] of MAP) e = `replace(${e}, '${o}', '${n}')`;
  return c.data_type === "jsonb" ? `(${e})::jsonb` : c.data_type === "json" ? `(${e})::json` : e;
};
const stmts = [];
// 옛 세션 끊기(아이디를 바꾸기 전에)
stmts.push(sql.query(`update sa_sessions set revoked_at = now() where account_id = any($1) and revoked_at is null`, [OLD]));
for (const t of tables) {
  const tc = cols.filter((c) => c.table_name === t && before.some((b) => b.표 === t && b.칸 === c.column_name));
  for (const c of tc) stmts.push(sql.query(`update ${q(t)} set ${q(c.column_name)} = ${replaceExpr(c)} where ${hasAny(c)}`));
}
for (const id of newMissing) {
  const a = ACCOUNTS.find((x) => x.id === id) ?? fail(`config ACCOUNTS 에 ${id} 가 없다`);
  stmts.push(sql.query(
    `insert into sa_accounts (id, name, org, role, admin_code, pw_hash, must_change_pw, failed_count, status, created_at)
     values ($1, $2, $3, $4, null, $5, true, 0, 'ACTIVE', now()) on conflict (id) do nothing`,
    [id, a.name, a.region, a.role, await hashPw(pws[id])],
  ));
}
stmts.push(sql.query("insert into sa_audit (org_id, account_id, action, detail) values (null, null, 'account.rename', $1)", [
  JSON.stringify({ decision: "R50", renamed: MAP.map(([, n]) => n), issued: newMissing }), // 옛 아이디는 적지 않음(사후 훑기에 걸리지 않게 — 대응은 00_decisions R50)
]));
await sql.transaction(stmts);

const after = await scan(cols);
const rows1 = await tableRows(tables);
console.log(`\n실행 끝(한 트랜잭션, 문 ${stmts.length}개). 운영 DB 계정(지금): ${(await accountIds()).join(", ")}`);
console.log(after.length ? "아직 옛 아이디가 든 행:" : "옛 아이디가 든 행 없음");
if (after.length) console.table(after);
console.table(tables.filter((t) => rows0[t] !== rows1[t] || before.some((b) => b.표 === t)).map((t) => ({ 표: t, 전: rows0[t], 후: rows1[t] })));
