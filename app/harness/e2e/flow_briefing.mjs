// 하네스 ⑥-2 흐름 확인 — 브리핑 4문항 병렬 → 질문 목록 진행 표시 → 완료순 표시, AI 모드, 운영관리 화면.
// node harness/e2e/flow_briefing.mjs [baseUrl] [accountId=ij_safety01]   (실제 T3Q 를 부른다 — 약 2~4분)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100", id = "ij_safety01"] = process.argv.slice(2);
const out = join(APP, "harness", "reports", "shots");
mkdirSync(out, { recursive: true });
const pwOf = (acc) => {
  if (process.env.SMOKE_PASSWORD) return process.env.SMOKE_PASSWORD;
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  return JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[acc];
};
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
async function session(acc) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR" });
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/explore", { timeout: 20000 });
  await page.waitForTimeout(2000);
  return page;
}
const shot = async (page, name) => { await page.waitForTimeout(600); await page.screenshot({ path: join(out, `${name}.png`) }); console.log("shot", name); };

// 1) 브리핑 병렬
const p = await session(id);
const t0 = Date.now();
await p.getByRole("button", { name: /브리핑 시작/ }).first().click();
await p.waitForSelector(".brief-card", { timeout: 30000 });
await shot(p, "10_briefing_submitted");
let done = 0;
while (Date.now() - t0 < 8 * 60000) {
  await p.waitForTimeout(10000);
  done = await p.locator(".brief-item .acard:not(.loading)").count();
  const act = await p.locator(".qp-item.act").count();
  console.log(`  ${Math.round((Date.now() - t0) / 1000)}s 완료 ${done}/4 · 진행 ${act}`);
  if (done === 1) await shot(p, "11_briefing_first_done");
  if (done >= 4) break;
}
await p.locator(".brief-card").scrollIntoViewIfNeeded();
await shot(p, "12_briefing_all_done");

// 2) AI 모드
await p.getByRole("button", { name: /AI 모드/ }).first().click();
await p.waitForTimeout(3000);
await shot(p, "13_aimode_open");
await p.getByRole("button", { name: "AI 모드 종료" }).click().catch(() => {});

// 3) 운영관리
const a = await session("admin01");
await a.goto(base + "/admin");
await a.waitForTimeout(3000);
await shot(a, "14_admin");
console.log("errors", errors.length ? errors : "없음");
await browser.close();
