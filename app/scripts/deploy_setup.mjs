#!/usr/bin/env node
/**
 * 배포 준비 — Vercel 운영(Production) 환경변수 등록 + 계정 발급 파일 만들기. 사용자가 직접 실행한다(비밀값을 다루므로).
 *   app 폴더에서:  node scripts/deploy_setup.mjs
 *
 * 1) T3Q_BASE_URL · T3Q_CLIENT_TOKEN — app/.env.local 의 값을 그대로 등록
 * 2) SESSION_SECRET · SEED_SECRET — 새로 만들어 등록(이미 있으면 건너뜀)
 * 3) 계정 5개 초기 비밀번호를 새로 만들어 저장소 밖 파일 D:\vibecoding\safetyai\_secrets\seed.env 에 저장
 *    (SEED_URL · SEED_SECRET · SA_INIT_PASSWORDS). 배포 뒤:  node --env-file=<그 파일> scripts/seed_accounts.mjs
 * 값은 화면에 출력하지 않는다(이름·결과·파일 경로만).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = "D:\\vibecoding\\safetyai\\_secrets";
const OUT = join(OUT_DIR, "seed.env");
const SITE = "https://safetyai-three.vercel.app";
const ACCOUNTS = ["bs_safety01", "ij_safety01", "yc_safety02", "mois_dsd01", "admin01"];

const env = Object.fromEntries(
  readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const vercel = process.platform === "win32" ? "vercel.cmd" : "vercel";
const existing = execFileSync(vercel, ["env", "ls", "production"], { cwd: APP, encoding: "utf8", shell: process.platform === "win32" });
const has = (name) => new RegExp(`^\\s*${name}\\s`, "m").test(existing);

function add(name, value) {
  if (!value) return console.log(`✖ ${name} — 값이 없어 건너뜀`);
  if (has(name)) return console.log(`· ${name} — 이미 있음, 건너뜀`);
  const r = spawnSync(vercel, ["env", "add", name, "production"], { cwd: APP, input: value, encoding: "utf8", shell: process.platform === "win32" });
  console.log(r.status === 0 ? `✓ ${name} 등록` : `✖ ${name} 등록 실패 (${(r.stderr || r.stdout || "").split("\n").find(Boolean) ?? r.status})`);
}

// 비밀번호 규칙: 9자 이상 + 영문·숫자·특수문자 — 14자로 만든다
const pw = () => {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%^&*"];
  const all = sets.join("");
  const chars = [...sets.map((s) => s[randomInt(s.length)]), ...Array.from({ length: 10 }, () => all[randomInt(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
};

add("T3Q_BASE_URL", env.T3Q_BASE_URL);
add("T3Q_CLIENT_TOKEN", env.T3Q_CLIENT_TOKEN);
add("SESSION_SECRET", randomBytes(32).toString("base64url"));
let seedSecret = randomBytes(32).toString("base64url");
if (has("SEED_SECRET")) {
  console.log("· SEED_SECRET — 이미 있음. 발급 파일에는 기존 값이 필요하므로 파일을 만들지 않는다(필요하면 Vercel 에서 지우고 다시 실행).");
  seedSecret = null;
} else add("SEED_SECRET", seedSecret);

if (seedSecret) {
  if (existsSync(OUT)) console.log(`· 발급 파일이 이미 있어 덮어쓰지 않음: ${OUT}`);
  else {
    mkdirSync(OUT_DIR, { recursive: true });
    const pws = Object.fromEntries(ACCOUNTS.map((a) => [a, pw()]));
    writeFileSync(OUT, `SEED_URL=${SITE}\nSEED_SECRET=${seedSecret}\nSA_INIT_PASSWORDS='${JSON.stringify(pws)}'\n`, { mode: 0o600 });
    console.log(`✓ 계정 발급 파일(비밀번호 포함, 저장소 밖): ${OUT}`);
  }
}
console.log("끝. 등록한 값은 다음 배포부터 적용됩니다.");
