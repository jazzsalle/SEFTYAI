// 하네스 — 따라하기 슬라이드용 답 화면: 로컬 리허설(rehearsal.mjs)이 남긴 단계별 작업을 대화 이력에서 다시 열어 답 카드 머리를 찍는다.
//  질의를 보내지 않는다(대화 이력 열기만). 로그인하면 그 계정의 다른 세션은 끊긴다 — 리허설이 끝난 뒤에 돌린다.
// node harness/e2e/deck_answers.mjs <harness/recordings/rehearsal_<시각>> [baseUrl=http://localhost:3100]
//  → harness/reports/shots/deck_s<단계>_<항목>_card.png
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [dirArg, base = "http://localhost:3100"] = process.argv.slice(2);
if (!dirArg || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) {
  console.error("사용: node harness/e2e/deck_answers.mjs <리허설 폴더> [로컬 주소]");
  process.exit(2);
}
const result = JSON.parse(readFileSync(join(resolve(dirArg), "_result.json"), "utf8"));
const shotDir = join(APP, "harness", "reports", "shots");
mkdirSync(shotDir, { recursive: true });
const pwOf = (acc) => {
  if (process.env.SMOKE_PASSWORD) return process.env.SMOKE_PASSWORD;
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  return JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[acc];
};
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });

/** 단계별 작업(묶음 항목 — 예열·실시간) */
const scenes = result.scenes.filter((s) => s.jobId && (s.kind === "WARM" || s.kind === "LIVE"));
const byAcc = Map.groupBy(scenes, (s) => s.account);
let n = 0;
try {
  for (const [acc, list] of byAcc) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto(base + "/login");
    await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
    await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/explore/, { timeout: 60000 });
    const convs = await page.evaluate(async () => (await fetch("/api/conversations")).json());
    for (const s of list) {
      const c = convs.find((x) => x.turns?.some((t) => t.jobId === s.jobId));
      if (!c) {
        console.log(`  (대화 못 찾음 ${s.step} ${s.key})`);
        continue;
      }
      await page.goto(`${base}/explore?c=${c.id}`);
      const card = page.locator(`#job-${s.jobId} .acard.ans`);
      if (!(await card.waitFor({ timeout: 30000 }).then(() => true, () => false))) {
        console.log(`  (답 카드 없음 ${s.step} ${s.key})`);
        continue;
      }
      await card.evaluate((e) => {
        e.scrollIntoView({ block: "start" });
        e.closest("main, .conv, .chat, [class*='scroll']")?.scrollBy?.(0, -70);
      });
      await page.waitForTimeout(1200);
      const name = `deck_s${s.step}_${s.key}_card.png`;
      await page.screenshot({ path: join(shotDir, name) });
      console.log("  card", name);
      n++;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`답 화면 ${n}/${scenes.length}`);
