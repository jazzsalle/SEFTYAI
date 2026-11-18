// 운영자 전용 — 개발서버 계정(acc_user)의 비밀번호를 우리 고정 7계정(sa_accounts)에 옮긴다(R61, 사용자 지시 「ID/PW도 동일하게 복사」).
// node harness/devsync/import_pw.mjs [내보낸 파일.json] [--apply]
//  · 입력 기본 경로 = ../../SEFTYAI-history/devserver-dump/acc_user_pw.json(app 기준 — 저장소 밖 비공개 이력 저장소). 저장소에 커밋하지 않는다
//  · 입력 = 개발서버 DB 에서 내보낸 JSON 배열 — 줄마다 { user_id, password, password_salt, password_key[, pwd_chg_de] }
//      예) 개발서버 PostgreSQL 에서: select user_id, password, password_salt, password_key, pwd_chg_de from acc_user
//      칸 이름은 개발서버 Dsai.Models/Entities/User.cs(acc_user)와 같다. password = 해시 base64, password_salt = 솔트 base64,
//      password_key = 「PBKDF2-SHA256-<반복>」(개발서버 PasswordHasher — PBKDF2-HMAC-SHA256, 비밀번호는 UTF-8 바이트)
//  · 우리 형식으로 바꿔 넣는다: pw_hash = pbkdf2-sha256$<반복>$<솔트 base64>$<해시 base64> (lib/server/auth.ts verifyPw 가 검증)
//    반복은 password_key 의 마지막 「-」 뒤 숫자(없으면 개발서버 기본 600000 — PasswordHasher.ParseIterations)
//  · 고정 7계정(busan·busan2·inje·01000·hang·unes·issuer)만 바꾼다. 그 밖의 줄·우리에게 없는 계정은 건너뛴다
//    바꾸면 failed_count = 0, locked_until = null. pwd_chg_de 칸이 있으면 첫 로그인 변경 여부(must_change_pw = pwd_chg_de 가 비었는가)도 맞춘다
//    (개발서버 User.MustChangePassword => PwdChgDe is null). 칸이 없으면 must_change_pw 는 그대로 둔다. 바꾼 계정의 기존 접속은 끊는다(비밀번호 재설정과 같게)
//  · 기본은 미리 보기(쓰지 않음) — 계정별 「바꿀 것 / 없음」만 찍는다. 해시·솔트 값은 어디에도 찍지 않는다
//    --apply 를 붙이면 app/.env.local 의 DATABASE_URL(운영 Neon)에 쓴다
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** 고정 7계정 — lib/config ACCOUNTS 의 아이디(개발서버 아이디, R50) */
export const FIXED_IDS = ["busan", "busan2", "inje", "01000", "hang", "unes", "issuer"];
/** 개발서버 PasswordHasher.DefaultIterations */
const DEFAULT_ITERATIONS = 600_000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** password_key → 반복 횟수(개발서버 ParseIterations 와 같게: 마지막 「-」 뒤 양의 정수, 아니면 기본) */
export function iterationsOf(key) {
  const k = typeof key === "string" ? key.trim() : "";
  const i = k.lastIndexOf("-");
  if (i >= 0) {
    const n = Number(k.slice(i + 1));
    if (Number.isInteger(n) && n > 0) return n;
  }
  return DEFAULT_ITERATIONS;
}

/** 개발서버 한 줄 → 우리 pw_hash. 쓸 수 없으면 { why } */
export function toPwHash(row) {
  const hash = typeof row?.password === "string" ? row.password.trim() : "";
  const salt = typeof row?.password_salt === "string" ? row.password_salt.trim() : "";
  if (!hash || !salt) return { why: "해시·솔트 없음" };
  if (!B64.test(hash) || !B64.test(salt)) return { why: "해시·솔트가 base64 가 아님" };
  const key = typeof row?.password_key === "string" ? row.password_key.trim() : "";
  if (key && !/^PBKDF2-SHA256(-\d+)?$/i.test(key)) return { why: "알 수 없는 해시 방식" };
  return { pwHash: `pbkdf2-sha256$${iterationsOf(key)}$${salt}$${hash}` };
}

/** 첫 로그인 변경 여부 — pwd_chg_de 칸이 있을 때만(없으면 undefined = 그대로 둔다) */
export const mustChangeOf = (row) => (row && Object.prototype.hasOwnProperty.call(row, "pwd_chg_de") ? row.pwd_chg_de == null || row.pwd_chg_de === "" : undefined);

/** 줄들 → 계정별 계획(고정 7계정 순서) */
export function planOf(rows) {
  const byId = new Map();
  for (const r of rows) {
    const id = String(r?.user_id ?? "").trim();
    if (FIXED_IDS.includes(id)) byId.set(id, r);
  }
  return FIXED_IDS.map((id) => {
    const r = byId.get(id);
    if (!r) return { id, why: "내보낸 파일에 없음" };
    const h = toPwHash(r);
    return h.why ? { id, why: h.why } : { id, pwHash: h.pwHash, mustChange: mustChangeOf(r) };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const fail = (m) => {
    console.error("중단:", m);
    process.exit(1);
  };
  const apply = args.includes("--apply");
  const file = args.find((a) => !a.startsWith("--")) ?? join(APP, "..", "..", "SEFTYAI-history", "devserver-dump", "acc_user_pw.json");

  let rows;
  try {
    rows = JSON.parse(readFileSync(resolve(file), "utf8").replace(/^﻿/, ""));
  } catch (e) {
    fail(`파일을 읽지 못했습니다 — ${e.message}`);
  }
  if (!Array.isArray(rows)) fail("JSON 배열이어야 합니다");

  const plan = planOf(rows);
  // 해시·솔트 값은 찍지 않는다 — 계정별 바꿀 것/없음만
  for (const p of plan) {
    const extra = p.why ? "" : p.mustChange === undefined ? "" : p.mustChange ? " · 첫 로그인 때 변경" : " · 첫 로그인 변경 없음";
    console.log(`  ${p.id.padEnd(8)} ${p.why ? `없음 — ${p.why}` : `바꿀 것${extra}`}`);
  }
  const ok = plan.filter((p) => !p.why);
  console.log(`고정 7계정 중 ${ok.length}개 바꿀 것${apply ? "" : " (미리 보기 — 쓰려면 --apply)"}`);
  if (!apply || !ok.length) return;

  const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 DATABASE_URL(postgres://…)이 없다");
  const sql = neon(url);
  let done = 0;
  for (const p of ok) {
    const r = (await sql.query(
      `update sa_accounts set pw_hash = $2, failed_count = 0, locked_until = null,
         must_change_pw = coalesce($3::boolean, must_change_pw)
       where id = $1 returning id`,
      [p.id, p.pwHash, p.mustChange ?? null],
    ));
    if (!r.length) {
      console.log(`  ${p.id.padEnd(8)} 우리 DB 에 계정이 없어 건너뜀`);
      continue;
    }
    await sql.query("update sa_sessions set revoked_at = now(), revoked_reason = 'RESET' where account_id = $1 and revoked_at is null", [p.id]);
    done++;
  }
  console.log(`${done}개 계정의 비밀번호를 바꿈`);
}

// 시험에서 함수만 가져다 쓸 때는 돌지 않는다
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
