// 시각화(V1~V4) 적용 전후 비교 캡처 — 같은 질문·같은 화면을 찍는다.
// node harness/e2e/shots_viz.mjs <before|after> [baseUrl] [accountId=yc_safety02] [libraryText]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [tag = "before", base = "http://localhost:3100", id = "yc_safety02", qText = "영천시에서 과거 호우로 피해가 컸던 사례는?"] = process.argv.slice(2);
const out = join(APP, "harness", "reports", "shots", "viz");
mkdirSync(out, { recursive: true });
const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
const pw = process.env.SMOKE_PASSWORD ?? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id];
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, el) => {
  await page.waitForTimeout(1200);
  const f = join(out, `${tag}_${name}.png`);
  if (el) await el.screenshot({ path: f });
  else await page.screenshot({ path: f });
  console.log("shot", f);
};

await page.goto(base + "/login");
await page.getByPlaceholder("아이디를 입력하세요").fill(id);
await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
await page.getByRole("button", { name: "로그인", exact: true }).click();
await page.waitForURL("**/explore", { timeout: 20000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "질문 목록 보기" }).click();
await page.getByRole("button", { name: qText, exact: true }).first().click();
await page.waitForSelector(".datacard", { timeout: 30000 });
await page.waitForTimeout(1500);
const card = page.locator(".datacard").first();
await card.scrollIntoViewIfNeeded();
await shot("V1_similar_events_card", card);
await shot("V1_page");

// 첫 사례 행 → 상세 패널 (V2 유사도 근거 · V3 타임라인 · V4 피해·복구)
await card.locator("tr.clk").first().click();
await page.waitForSelector(".rpanel .dpane", { timeout: 30000 });
await page.waitForTimeout(4000);
const panel = page.locator(".rpanel");
await shot("V2V4_event_panel_top", panel);
const body = page.locator(".rpanel .rbody:not(.map)").first();
for (const [i, frac] of [[2, 0.35], [3, 0.7], [4, 1]]) {
  await body.evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f; }, frac);
  await shot(`V2V4_event_panel_${i}`, panel);
}
console.log("errors", errors.length ? errors : "없음");
await browser.close();
