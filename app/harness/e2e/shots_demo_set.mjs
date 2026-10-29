// 하네스 — R42(시연 묶음·프리셋·예열) · R43(시연 시나리오 특보) 화면 확인
//  (가) 부산 bs_safety01 — 질문 모음 「재난담당자의 하루」 탭
//  (나) 인제 ij_safety01 — 묶음 항목(IJ-01, 예열해 둔 답) 누름 → 질문 아래 「이 질문에 붙인 조건」 · 입력창 세션 조건 그대로
//  (다) 운영관리 admin01 — 「시연 세트 예열」 화면(시나리오 패널 · 예열 표). 「이 항목만 예열」은 IJ-01 한 항목만(예열해 둔 답이면 캐시 재사용 — 새 질의 없음)
//  (라) 시나리오 켬 → 부산 특보 줄·AI 모드 창(실제 점검 1건)·AI 모드 띠에 「시연 시나리오」, 대응절차 추천 3단계 · 인제 특보 줄
//  (마) 중앙정부 mois_dsd01 · 운영자 admin01 에는 안 보임(특보 줄 · /api/weather 응답)
//  (바) 끔 → 부산 특보 줄에서 사라짐
// node harness/e2e/shots_demo_set.mjs [baseUrl=http://localhost:3100]   → harness/reports/shots/r42_*.png
// 실제 T3Q 에이전트 질의 = (라) 부산 AI 모드 점검 1건(같은 10분 구간·같은 특보면 재사용). (나)·(다)는 예열해 둔 답이면 재사용(24시간 안).
// 끝나면(실패해도) 시나리오를 끈다. 로그인하면 그 계정의 다른 세션은 끊긴다.
// 비밀번호: env SMOKE_PASSWORD 또는 app/.env.development.local 의 SA_INIT_PASSWORDS(출력하지 않음)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100"] = process.argv.slice(2);
const out = join(APP, "harness", "reports", "shots");
mkdirSync(out, { recursive: true });
const pwOf = (acc) => {
  if (process.env.SMOKE_PASSWORD) return process.env.SMOKE_PASSWORD;
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  return JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[acc];
};
const IJ01 = JSON.parse(readFileSync(join(APP, "harness", "recordings", "demo_chain_inje", "IJ-01.json"), "utf8")).question;
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) process.exitCode = 1;
};
const shot = async (target, name) => {
  await (target.waitForTimeout ? target : target.page()).waitForTimeout(700);
  await target.screenshot({ path: join(out, `r42_${name}.png`) });
  console.log("  shot", `r42_${name}.png`);
};
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");
const SCN = "시연 시나리오";

async function session(acc) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${acc}: ${m.text()}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() < 400 || (r.status() === 401 && u.pathname === "/api/auth/me")) return;
    errors.push(`${acc}: ${r.status()} ${r.request().method()} ${u.pathname}`);
  });
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/(explore|admin)/, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
/** 이 계정의 /api/weather — 시나리오 특보 id */
const scnIds = (page) => page.evaluate(async () => ((await fetch("/api/weather").then((r) => r.json())).advisories ?? []).filter((a) => a.scenario || /^SCN-/.test(a.id)).map((a) => a.id));
/** 특보 줄이 다시 받은 특보로 바뀌게 새로 고침 */
const reload = async (page) => {
  await page.reload();
  await page.locator(".wxbar .tit").waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !/확인하고 있습니다/.test(document.querySelector(".wxbar .tit")?.textContent ?? ""), null, { timeout: 20000 });
};

const admin = await session("admin01");
const setScenario = (on) =>
  admin.page.evaluate(async (v) => {
    const r = await fetch("/api/admin/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v ? { on: true, until: new Date(Date.now() + 2 * 3600_000).toISOString() } : { on: false }) });
    return r.json();
  }, on);

try {
  // 시작은 꺼진 상태
  await setScenario(false);

  // ── (가) 부산 — 질문 모음 「재난담당자의 하루」 ──
  const bs = await session("bs_safety01");
  // AI 모드가 켜진 채 남아 있으면 끈다(이 단계에서 점검을 보내지 않게)
  if (await bs.page.locator(".ai-pill.on").count()) await bs.page.locator(".ai-pill").click();
  await bs.page.getByRole("button", { name: "질문 목록 보기" }).click();
  await bs.page.getByRole("button", { name: "재난담당자의 하루" }).click();
  const day = await text(bs.page, ".drawer");
  ok(day.includes("재난담당자의 하루") && (await bs.page.locator(".drawer .day-btn").count()) === 5, `부산 묶음 항목 ${await bs.page.locator(".drawer .day-btn").count()}개`);
  await shot(bs.page, "01_busan_day_tab");
  await bs.page.getByRole("button", { name: "닫기" }).click();

  // ── (나) 인제 — 묶음 항목 누름(예열해 둔 IJ-01) ──
  const ij = await session("ij_safety01");
  if (await ij.page.locator(".ai-pill.on").count()) await ij.page.locator(".ai-pill").click();
  const condBefore = await text(ij.page, ".cmp-cond");
  await ij.page.getByRole("button", { name: "질문 목록 보기" }).click();
  await ij.page.getByRole("button", { name: "재난담당자의 하루" }).click();
  await ij.page.locator(".drawer .day-btn", { hasText: IJ01 }).click();
  await ij.page.locator(".qb-cond").last().waitFor({ timeout: 20000 });
  const qc = await ij.page.locator(".qb-cond").last().textContent();
  ok(/^이 질문에 붙인 조건 · /.test(qc ?? ""), `질문 아래 조건 「${qc}」`);
  await ij.page.waitForFunction(() => !document.querySelector(".acard.loading"), null, { timeout: 200000 }).catch(() => {});
  const condAfter = await text(ij.page, ".cmp-cond");
  ok(condBefore === condAfter, `입력창 조건 그대로 「${condAfter}」`);
  await shot(ij.page, "02_inje_preset_question");

  // ── (다) 운영관리 — 시연 세트 예열(시나리오 꺼짐) ──
  await admin.page.goto(base + "/admin?tab=demo");
  await admin.page.getByRole("heading", { name: "시연 시나리오 특보" }).waitFor({ timeout: 20000 });
  await admin.page.locator(".adm-scn .badge", { hasText: "꺼짐" }).waitFor({ timeout: 20000 });
  const row = admin.page.locator("tr", { has: admin.page.locator(`span.clamp[title="${IJ01}"]`) });
  const runBtn = row.getByRole("button", { name: "이 항목만 예열" });
  if (await runBtn.count()) {
    await runBtn.click();
    await row.locator(".badge").first().waitFor({ timeout: 60000 });
    console.log("  IJ-01 예열:", await text(admin.page, `tr:has(span.clamp[title="${IJ01}"])`));
  }
  await shot(admin.page, "03_admin_demo_warm");

  // ── (라) 시나리오 켬 — 운영관리 화면에서 ──
  await admin.page.getByRole("button", { name: "시나리오 켜기" }).click();
  await admin.page.locator(".adm-scn .badge", { hasText: "켜짐" }).waitFor({ timeout: 20000 });
  ok((await text(admin.page, ".adm-scn[role=status]")).includes("저절로 꺼짐"), `운영관리 상태 「${await text(admin.page, ".adm-scn[role=status]")}」`);
  await shot(admin.page.locator("section[aria-label='시연 시나리오 특보']"), "04_admin_scenario_on");

  await reload(bs.page);
  const bsBar = await text(bs.page, ".wxbar");
  ok(bsBar.includes("부산 호우경보 발효 중") && bsBar.includes(SCN), `부산 특보 줄 「${bsBar.slice(0, 80)}」`);
  ok((await scnIds(bs.page)).join() === "SCN-BS-1", "부산 /api/weather = SCN-BS-1");
  const sop = await text(bs.page, ".sopbar");
  ok(sop.includes("비상대응 추천") && sop.includes(SCN), `대응절차 줄 「${sop.slice(0, 90)}」`);
  await shot(bs.page, "05_busan_wxbar_scenario");
  // AI 모드 — 실제 점검 1건
  await bs.page.getByRole("button", { name: "AI 모드", exact: true }).click();
  await bs.page.locator(".modal.aim").waitFor({ timeout: 20000 });
  ok((await text(bs.page, ".aim-card")).includes(SCN), "AI 모드 창 「시연 시나리오」");
  const t0 = Date.now();
  await bs.page.waitForFunction(() => {
    const t = document.querySelector(".aim-ai")?.textContent ?? "";
    return t && !/기다리는 중|준비하고 있습니다|불러오는 중/.test(t);
  }, null, { timeout: 240000 });
  console.log(`  점검 답 ${Math.round((Date.now() - t0) / 1000)}초 · ${(await text(bs.page, ".aim-ai")).slice(0, 160)}`);
  await shot(bs.page.locator(".modal.aim"), "06_busan_aimode_modal");
  await bs.page.getByRole("button", { name: "접기", exact: true }).click();
  const aimBar = await text(bs.page, ".aim-bar");
  ok(aimBar.includes(`호우경보 (${SCN})`), `AI 모드 띠 「${aimBar.slice(0, 80)}」`);
  await shot(bs.page, "07_busan_aimode_bar");
  // 다음 단계에서 다시 점검하지 않게 AI 모드를 끈다
  await bs.page.locator(".ai-pill").click();

  await reload(ij.page);
  const ijBar = await text(ij.page, ".wxbar");
  ok(ijBar.includes("강원도(인제평지, 인제산지) 호우주의보 발효 중") && ijBar.includes(SCN), `인제 특보 줄 「${ijBar.slice(0, 80)}」`);
  ok((await text(ij.page, ".sopbar")).includes("초기대응 추천"), "인제 대응절차 2단계 「초기대응」 추천");
  await shot(ij.page, "08_inje_wxbar_scenario");

  // ── (마) 중앙정부·운영자에는 안 보임 ──
  const mo = await session("mois_dsd01");
  ok(!(await text(mo.page, ".wxbar")).includes(SCN) && (await scnIds(mo.page)).length === 0, `중앙정부 특보 줄 「${(await text(mo.page, ".wxbar")).slice(0, 80)}」 · /api/weather 시나리오 없음`);
  await shot(mo.page, "09_central_no_scenario");
  await admin.page.goto(base + "/explore");
  await admin.page.locator(".wxbar .tit").waitFor({ timeout: 20000 });
  await admin.page.waitForTimeout(1500);
  ok(!(await text(admin.page, ".wxbar")).includes(SCN) && (await scnIds(admin.page)).length === 0, `운영자 특보 줄 「${(await text(admin.page, ".wxbar")).slice(0, 80)}」 · /api/weather 시나리오 없음`);
  await shot(admin.page, "10_admin_no_scenario");

  // ── (바) 끔 → 사라짐 ──
  await admin.page.goto(base + "/admin?tab=demo");
  await admin.page.getByRole("button", { name: "시나리오 끄기" }).click();
  await admin.page.locator(".adm-scn .badge", { hasText: "꺼짐" }).waitFor({ timeout: 20000 });
  await reload(bs.page);
  const off = await text(bs.page, ".wxbar");
  ok(!off.includes(SCN) && (await scnIds(bs.page)).length === 0, `끈 뒤 부산 특보 줄 「${off.slice(0, 80)}」`);
  ok(!(await text(bs.page, ".sopbar")).includes(SCN), "끈 뒤 대응절차 줄에 시나리오 없음");
  await shot(bs.page, "11_busan_scenario_off");
} finally {
  const r = await setScenario(false).catch((e) => ({ error: String(e) }));
  console.log("  끝 — 시나리오 꺼짐:", r?.live === false ? "확인" : JSON.stringify(r));
}
console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
