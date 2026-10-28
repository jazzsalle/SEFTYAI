#!/usr/bin/env node
/**
 * 계정 사전 발급·비밀번호 재설정 (R7 · UFR-007) — 서버 POST /api/auth/seed 를 부른다.
 *
 * 환경 변수
 *   SEED_URL           서버 주소. 기본 http://localhost:3000
 *                      원격 서버는 https 로만 보낸다(비밀번호·SEED_SECRET 보호). 꼭 필요하면 SEED_ALLOW_HTTP=1
 *   SEED_SECRET        서버 env SEED_SECRET 과 같은 값. 서버에 SEED_SECRET 이 없으면 /api/auth/seed 는 404(비활성)
 *   SA_INIT_PASSWORDS  {"계정ID":"비밀번호", ...} JSON — 넣은 계정만 발급·재설정한다
 *                      계정: bs_safety01(부산) ij_safety01(인제) yc_safety02(영천) mois_dsd01(정부기관) admin01(운영자)
 *                      규칙: 9자 이상 + 영문·숫자·특수문자
 *
 * 사용법 (app 폴더에서, Node 18 이상)
 *   bash
 *     SEED_URL=https://<배포주소> SEED_SECRET=<비밀값> \
 *     SA_INIT_PASSWORDS='{"bs_safety01":"<비밀번호>","admin01":"<비밀번호>"}' node scripts/seed_accounts.mjs
 *   PowerShell
 *     $env:SEED_URL = "https://<배포주소>"; $env:SEED_SECRET = "<비밀값>"
 *     $env:SA_INIT_PASSWORDS = '{"bs_safety01":"<비밀번호>","admin01":"<비밀번호>"}'
 *     node scripts/seed_accounts.mjs
 *   셸 기록에 비밀번호를 남기지 않으려면 저장소 밖 파일에 적고 Node 20.6+ --env-file 로 읽는다
 *     (파일 내용 예: SA_INIT_PASSWORDS='{"bs_safety01":"<비밀번호>"}')
 *     node --env-file=<저장소 밖 경로>/seed.env scripts/seed_accounts.mjs
 *
 * - 이미 있는 계정은 비밀번호가 바뀌고 연속 실패·잠금이 풀린다(상태 ACTIVE). 로그인 중인 세션은 끊긴다.
 * - 발급·재설정한 계정은 첫 로그인 때 비밀번호 변경이 강제된다(R24 — 바꾸기 전에는 질의 등이 막힘).
 * - 이 스크립트는 비밀번호를 출력하지 않는다(계정 ID 와 결과만).
 */

const KNOWN = ["bs_safety01", "ij_safety01", "yc_safety02", "mois_dsd01", "admin01"];
/** 서버 lib/server/auth.ts pwRule 과 같은 규칙 — 서버는 첫 위반에서 멈추므로 보내기 전에 모두 확인한다 */
const pwRule = (pw) => pw.length >= 9 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const base = (process.env.SEED_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
let url;
try {
  url = new URL(base + "/api/auth/seed");
} catch {
  die(`SEED_URL 형식이 맞지 않습니다: ${base}`);
}
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (url.protocol !== "https:" && !local && process.env.SEED_ALLOW_HTTP !== "1")
  die(`원격 서버(${url.host})에는 https 로만 보냅니다. 꼭 필요하면 SEED_ALLOW_HTTP=1 을 함께 주세요.`);

const secret = process.env.SEED_SECRET;
if (!secret) die("SEED_SECRET 이 없습니다 (서버 env SEED_SECRET 과 같은 값).");

const raw = process.env.SA_INIT_PASSWORDS;
if (!raw) die('SA_INIT_PASSWORDS 가 없습니다. 예: {"bs_safety01":"<비밀번호>"}');
let accounts;
try {
  accounts = JSON.parse(raw);
} catch {
  // 파싱 오류 문구에는 입력 일부가 들어갈 수 있어 그대로 출력하지 않는다
  die('SA_INIT_PASSWORDS 가 올바른 JSON 이 아닙니다. 예: {"bs_safety01":"<비밀번호>"}');
}
if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) die('SA_INIT_PASSWORDS 는 {"계정ID":"비밀번호"} 꼴의 객체여야 합니다.');

const ids = Object.keys(accounts);
if (!ids.length) die("발급할 계정이 없습니다.");
const unknown = ids.filter((id) => !KNOWN.includes(id));
if (unknown.length) die(`알 수 없는 계정: ${unknown.join(", ")} (허용: ${KNOWN.join(", ")})`);
const notString = ids.filter((id) => typeof accounts[id] !== "string");
if (notString.length) die(`비밀번호는 문자열이어야 합니다: ${notString.join(", ")}`);
const weak = ids.filter((id) => !pwRule(accounts[id]));
if (weak.length) die(`비밀번호 규칙(9자 이상, 영문·숫자·특수문자) 위반: ${weak.join(", ")}`);

console.log(`→ ${url.origin} 에 계정 ${ids.length}개 발급·재설정 요청: ${ids.join(", ")}`);
let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-seed-secret": secret },
    body: JSON.stringify({ accounts }),
    signal: AbortSignal.timeout(60_000),
  });
} catch (e) {
  die(`서버에 연결하지 못했습니다 (${e?.name === "TimeoutError" ? "60초 시간 초과" : e?.cause?.code ?? e?.message ?? "알 수 없는 오류"}).`);
}
const body = await res.json().catch(() => null);
if (res.status === 404) die("404 — SEED_SECRET 이 서버 값과 다르거나, 서버에 SEED_SECRET 이 설정되지 않았습니다.");
if (!res.ok) {
  const done = Array.isArray(body?.done) ? body.done : [];
  die(`발급 실패 (HTTP ${res.status}): ${body?.error ?? "알 수 없는 오류"}${done.length ? ` — 먼저 처리된 계정: ${done.join(", ")}` : ""}`);
}
console.log(`✔ 발급·재설정 완료: ${(Array.isArray(body?.done) ? body.done : ids).join(", ")}`);
