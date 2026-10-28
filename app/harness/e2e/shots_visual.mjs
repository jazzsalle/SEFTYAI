// 하네스 — 시각 설계 2판 적용 전후 비교 화면. 부산 브리핑 4문항(현황판·답변), 유사재난 사례 목록 → 사건 상세, 침수흔적, 위험·취약 시설 목록 → 대상 상세, 노트북(1366×768) 첫 화면.
// node harness/e2e/shots_visual.mjs <before|after> [baseUrl]   → harness/reports/shots/visual/<tag>_*.png
// 같은 질문·조건이면 24시간 캐시로 같은 답이 다시 나온다(특보 발효 중에는 재사용 기준이 짧아 새 답일 수 있음).
// 선택자는 화면 글자 위주 — 구조가 바뀌어도 같은 장면을 찍도록. 로딩 중인 답에는 aria-busy="true" 가 붙어 있어야 한다.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [tag = "before", base = "http://localhost:3100"] = process.argv.slice(2);
const id = "bs_safety01";
const BR2 = "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?";
const BR3 = "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?";
const out = join(APP, "harness", "reports", "shots", "visual");
mkdirSync(out, { recursive: true });
const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
const pw = process.env.SMOKE_PASSWORD ?? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id];
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const log = (...a) => console.log(...a);

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, locale: "ko-KR" });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(id);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pw);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/explore", { timeout: 90000 }); // 개발 서버는 고친 직후 첫 화면 컴파일이 길다
  await page.waitForTimeout(2500);
  return page;
}
const shot = async (page, name, el) => { await page.waitForTimeout(900); const f = join(out, `${tag}_${name}.png`); await (el ?? page).screenshot({ path: f }); log("shot", `${tag}_${name}.png`); };
/** el 을 품은 세로 스크롤 상자 */
const scrollerOf = (loc) => loc.evaluateHandle((el) => {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) return e;
  }
  return document.scrollingElement;
});
async function segments(page, name, anchor, max = 10) {
  const sc = await scrollerOf(anchor);
  const total = await sc.evaluate((e) => e.scrollHeight - e.clientHeight);
  const step = await sc.evaluate((e) => Math.round(e.clientHeight * 0.85));
  const start = await anchor.evaluate((el, s) => { const r = el.getBoundingClientRect(), p = s.getBoundingClientRect ? s.getBoundingClientRect() : { top: 0 }; return Math.max(0, s.scrollTop + r.top - p.top - 8); }, sc);
  for (let i = 0, y = start; i < max; i++, y += step) {
    await sc.evaluate((e, v) => { e.scrollTop = v; }, Math.min(y, total));
    await shot(page, `${name}_${i + 1}`);
    if (y >= total) break;
  }
}
async function waitAnswers(page, minutes = 8) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < minutes * 60000) {
    await page.waitForTimeout(8000);
    const busy = await page.locator('[aria-busy="true"]').count();
    const sending = await page.getByText(/보내는 중|불러오는 중/).count();
    log(`  ${Math.round((Date.now() - t0) / 1000)}초 · 진행 중 ${busy + sending}`);
    calm = busy + sending === 0 ? calm + 1 : 0;
    if (calm >= 2) return true;
  }
  return false;
}
const step = async (name, fn) => { try { await fn(); } catch (e) { log(`건너뜀 ${name}: ${String(e).split("\n")[0]}`); } };
/** 대화 상자에서 el 을 맨 위로 — 브리핑 안이면 위에 붙는 접힌 한 줄(40px)에 가리지 않게 그만큼 덜 내린다 */
const toTop = (loc) => loc.evaluate((el) => {
  el.scrollIntoView({ block: "start" });
  const sc = el.closest(".thread");
  if (sc && el.closest(".brief-card")) sc.scrollTop -= 48;
});

// 1) 브리핑(1920×1080)
const page = await open(1920, 1080);
await page.getByRole("button", { name: /브리핑 시작/ }).first().click();
await page.waitForTimeout(3000);
await shot(page, "D_brief_submitted");
log("브리핑 답 기다리는 중…", (await waitAnswers(page)) ? "모두 끝남" : "시간 초과");
await step("D 브리핑 전체", async () => {
  // 대화 상자의 브리핑 카드부터 아래로(질문 목록의 「브리핑」 글자를 잡으면 질문 목록만 굴러간다)
  const card = page.locator(".thread .brief-card").first();
  await segments(page, "D_brief", (await card.count()) ? card : page.getByText(/브리핑/).first(), 14);
});

// 2) 유사재난 사례 목록 → 첫 사건 상세
await step("A 목록", async () => {
  const t = page.getByText("유사재난 사례").first();
  await t.scrollIntoViewIfNeeded();
  await toTop(t);
  await shot(page, "A_list");
});
await step("A 사건 상세", async () => {
  // 유사재난 사례 카드의 첫 사건(1위 카드 · 예전 표 카드면 첫 행). 바깥 브리핑 section 을 잡으면 다른 카드의 행을 누르게 되어 카드로 좁힌다
  const sec = page.locator(".datacard-sec", { hasText: "유사재난 사례" }).first();
  const row = (await sec.locator(".sim-top .sim-name").count()) ? sec.locator(".sim-top .sim-name").first() : sec.locator("tr.clk").first();
  await row.click();
  await page.waitForTimeout(6000);
  const panel = page.locator(".rpanel, [aria-label='우측 패널']").first();
  await segments(page, "A_detail", panel.locator(".dpane").first(), 8);
});

// 3) 침수흔적
await step("B 침수흔적", async () => {
  const t = page.getByText(/침수흔적/).first();
  await toTop(t);
  await shot(page, "B_flood");
});

// 4) 위험·취약 시설 목록 → 첫 대상 상세
await step("B 위험·취약 목록", async () => {
  const q3 = page.getByText(BR3, { exact: true }).first();
  await q3.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const t = page.getByText(/잠재 위험요소·취약시설|위험·취약 대상/).first();
  await toTop(t);
  await shot(page, "B_risk_list");
});
await step("B 대상 상세", async () => {
  const sec = page.locator("section, .datacard-sec, [data-card]", { hasText: /잠재 위험요소·취약시설|위험·취약 대상/ }).first();
  const row = (await sec.locator("tr.clk").count()) ? sec.locator("tr.clk").first() : sec.getByRole("button").filter({ hasText: /지하차도|지구|급경사지|시설/ }).first();
  await row.click();
  await page.waitForTimeout(5000);
  const panel = page.locator(".rpanel, [aria-label='우측 패널']").first();
  await segments(page, "B_detail", panel.getByText(/상세|등급|지하차도/).first(), 6);
});

// 5) 노트북 첫 화면 — 브리핑 2번 답 머리
await step("C 노트북 첫 화면", async () => {
  const small = await open(1366, 768);
  await small.getByRole("button", { name: /브리핑 시작/ }).first().click();
  await waitAnswers(small, 3);
  const t = small.getByText(BR2, { exact: true }).first();
  await t.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot(small, "C_first_view_1366");
  await small.close();
});

log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
