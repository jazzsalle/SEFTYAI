// 하네스 — 초기 비밀번호 변경 강제(Figma 101002) 흐름을 실제 화면에서 확인한다(로컬 개발 서버 전용).
// node harness/e2e/flow_forcepw.mjs [baseUrl] [accountId=mois_dsd01]
// 1) 발급(변경 강제) → 2) 로그인 시 닫을 수 없는 "초기 비밀번호 변경" 창 → 3) 바꾸기 전 질의·연락망 저장은 403 → 4) 원상 복구(강제 해제)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100", id = "mois_dsd01"] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("로컬 개발 서버에서만 돌린다: " + base);
const out = join(APP, "harness", "reports", "shots");
mkdirSync(out, { recursive: true });
const env = Object.fromEntries(
  readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const pw = JSON.parse(env.SA_INIT_PASSWORDS)[id];
const seed = async (mustChange) => {
  const r = await fetch(base + "/api/auth/seed", { method: "POST", headers: { "content-type": "application/json", "x-seed-secret": env.SEED_SECRET }, body: JSON.stringify({ accounts: { [id]: pw }, mustChange }) });
  return `${r.status} ${JSON.stringify(await r.json())}`;
};
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "통과" : "실패"} · ${name}${detail ? " — " + detail : ""}`); };

console.log("발급(변경 강제):", await seed(true));
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR" });
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(id);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/explore", { timeout: 20000 });
  const dlg = page.getByRole("dialog", { name: "초기 비밀번호 변경" });
  const shown = await dlg.waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("로그인하면 초기 비밀번호 변경 창이 뜬다", shown);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Esc 로 닫히지 않는다", await dlg.isVisible());
  check("닫기·취소 단추가 없다", (await dlg.getByRole("button", { name: /닫기|취소/ }).count()) === 0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, "20_forced_pw_modal.png") });

  const ask = await page.request.post(base + "/api/agent/jobs", { data: { question: "초기 비밀번호 시험 질문", source: "USER" }, headers: { "x-sa-activity": "1" } });
  check("바꾸기 전 질의 접수는 403", ask.status() === 403, `${ask.status()} ${(await ask.text()).slice(0, 80)}`);
  const ct = await page.request.put(base + "/api/contacts", { data: {}, headers: { "x-sa-activity": "1" } });
  check("바꾸기 전 연락망 저장은 403", ct.status() === 403, String(ct.status()));
  const dt = await page.request.post(base + "/api/t3q/data", { data: { api: "T3Q-04" }, headers: { "x-sa-activity": "1" } });
  check("바꾸기 전 T3Q 자료 조회는 403", dt.status() === 403, String(dt.status()));
  const me = await page.request.get(base + "/api/auth/me");
  check("내 정보에 변경 필요 표시", (await me.json())?.account?.mustChangePw === true);
} finally {
  await browser.close();
  console.log("원상 복구(강제 해제):", await seed(false));
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `실패 ${failed}건` : `모두 통과 (${results.length}건)`);
process.exit(failed ? 1 : 0);
