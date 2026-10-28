// 시각화 전후 비교 2 — 부산 브리핑 타일(과거 피해) → 유사재난 사례 → 지정 사건 상세(타임라인·피해·복구가 있는 사건)
// node harness/e2e/shots_viz2.mjs <before|after> [baseUrl] [사건 이름]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [tag = "before", base = "http://localhost:3100", eventName = "2021년 07.05~07.08 호우"] = process.argv.slice(2);
const id = "bs_safety01";
const tileText = "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?";
const out = join(APP, "harness", "reports", "shots", "viz");
mkdirSync(out, { recursive: true });
const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
const pw = process.env.SMOKE_PASSWORD ?? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id];
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, locale: "ko-KR" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, el) => { await page.waitForTimeout(1200); const f = join(out, `${tag}_${name}.png`); await (el ?? page).screenshot({ path: f }); console.log("shot", f); };

await page.goto(base + "/login");
await page.getByPlaceholder("아이디를 입력하세요").fill(id);
await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
await page.getByRole("button", { name: "로그인", exact: true }).click();
await page.waitForURL("**/explore", { timeout: 20000 });
await page.waitForTimeout(1500);
await page.locator(".tile", { hasText: tileText }).first().click();
await page.waitForSelector(".datacard", { timeout: 30000 });
await page.waitForTimeout(2000);
const sec = page.locator(".datacard-sec", { hasText: "유사재난 사례" }).first();
await sec.scrollIntoViewIfNeeded();
await shot("busan_V1_card", sec);
await sec.locator("tr.clk", { hasText: eventName }).first().click();
await page.waitForSelector(".rpanel .dpane", { timeout: 30000 });
await page.waitForTimeout(6000);
const panel = page.locator(".rpanel");
const body = page.locator(".rpanel .rbody:not(.map)").first();
const h = await body.evaluate((el) => el.scrollHeight - el.clientHeight);
for (let i = 0, y = 0; i < 6; i++, y += 900) {
  await body.evaluate((el, v) => { el.scrollTop = v; }, y);
  await shot(`busan_event_${i + 1}`, panel);
  if (y >= h) break;
}
console.log("errors", errors.length ? errors : "없음");
await browser.close();
