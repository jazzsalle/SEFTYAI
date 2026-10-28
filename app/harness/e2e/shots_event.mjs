// 하네스 — 사건 상세(오른쪽 패널)만 찍기: 부산 브리핑(캐시) → 유사재난 사례에서 이름이 같은 사건을 눌러 패널을 열고, 패널을 내려 가며 찍는다.
// node harness/e2e/shots_event.mjs <tag> [사건 이름=2021년 07.05~07.08 호우] [baseUrl]   → harness/reports/shots/visual/<tag>_event_<n>.png
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [tag = "after", eventName = "2021년 07.05~07.08 호우", base = "http://localhost:3100"] = process.argv.slice(2);
const id = "bs_safety01";
const out = join(APP, "harness", "reports", "shots", "visual");
mkdirSync(out, { recursive: true });
const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
const pw = process.env.SMOKE_PASSWORD ?? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id];
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, locale: "ko-KR" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(base + "/login");
await page.getByPlaceholder("아이디를 입력하세요").fill(id);
await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
await page.getByRole("button", { name: "로그인", exact: true }).click();
await page.waitForURL("**/explore", { timeout: 90000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /브리핑 시작/ }).first().click();
await page.getByText(eventName, { exact: true }).first().waitFor({ timeout: 240000 });
await page.waitForTimeout(2000);
await page.getByText(eventName, { exact: true }).first().click();
const panel = page.locator(".rpanel").first();
await panel.waitFor({ timeout: 30000 });
await page.waitForTimeout(6000);
const body = panel.locator(".rbody:not(.map)").first();
const max = await body.evaluate((el) => el.scrollHeight - el.clientHeight);
const step = await body.evaluate((el) => Math.round(el.clientHeight * 0.9));
for (let i = 0, y = 0; i < 8; i++, y += step) {
  await body.evaluate((el, v) => { el.scrollTop = v; }, Math.min(y, max));
  await page.waitForTimeout(700);
  await panel.screenshot({ path: join(out, `${tag}_event_${i + 1}.png`) });
  console.log("shot", `${tag}_event_${i + 1}.png`);
  if (y >= max) break;
}
console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
