// 하네스 ⑥ 화면 확인 — 설치된 Chrome(headless, playwright-core)으로 로그인 → 시작 화면 → 질문 목록의 완료 답 → 지도 를 찍는다.
// node harness/e2e/shots.mjs [baseUrl=http://localhost:3100] [outDir] [accountId=bs_safety01]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100", out = join(APP, "harness", "reports", "shots"), id = "bs_safety01"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
let pw = process.env.SMOKE_PASSWORD;
if (!pw && existsSync(join(APP, ".env.development.local"))) {
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  pw = line ? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id] : undefined;
}
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = async (name) => { await page.waitForTimeout(800); await page.screenshot({ path: join(out, `${name}.png`) }); console.log("shot", name); };

await page.goto(base + "/login");
await shot("01_login");
await page.getByPlaceholder("아이디를 입력하세요").fill(id);
await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
await page.getByRole("button", { name: "로그인", exact: true }).click();
await page.waitForURL("**/explore", { timeout: 20000 });
await page.waitForTimeout(2500);
await shot("02_start");

// 질문 목록의 완료 답 하나 열기
const done = page.locator(".qp-item.ok").first();
if (await done.count()) {
  await done.click();
  await page.waitForSelector(".acard .md", { timeout: 20000 }).catch(() => {});
  await shot("03_answer");
  const all = page.getByRole("button", { name: "지도에서 모두 보기" }).first();
  if (await all.count()) {
    await all.click();
    await page.waitForTimeout(4000);
    await shot("04_map");
    const chip = page.locator(".ref-chip").first();
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(2500);
      await shot("05_chip");
    }
  }
}
// 질문 모음
await page.getByRole("button", { name: "질문 목록 보기" }).click().catch(() => {});
await page.waitForTimeout(800);
await shot("06_library");
await page.keyboard.press("Escape");
console.log("errors", errors.length ? errors.slice(0, 10) : "없음");
await browser.close();
