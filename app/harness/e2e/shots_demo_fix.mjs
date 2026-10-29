// 하네스 — R42·R43 검토 지적 반영 화면 확인(실제 T3Q 에이전트 질의 없음)
//  (가) 영천 yc_safety02 — 「재난담당자의 하루」 탭: 실시간 주의 없음(운영관리에만) · YC-02 「사용자 입력 조건」 · 소개 글 · 마우스를 올리면 항목 이름에만 밑줄
//  (나) 운영관리 admin01 — 「시연 세트 예열」: 실시간 안내에 YC-02, 표에 YC-01(YC-02 없음 — 사용자 결정 2026-10-30) · 계정 = 시연 계정 · 빨강 표지 없음 · 무대 질의 대기 주의
//  (다) 부산 bs_safety01 — /explore?brief=1 이 저장된 「내 브리핑 항목」으로 보내는지(기본 4문항이 아니라). 접수 요청은 가로채 보내지 않는다(대화 저장도 막음)
//       시험 동안 이 계정 브리핑 항목을 대본 세트(BR-01~03 + 「하천 옆 지하차도」)로 바꾸고 끝나면 원래 값으로 되돌린다
//  (라) 시나리오 켬 → 부산 [특보로 질문] 으로 시나리오 참조 → 끔 → 참조가 저절로 떨어짐
//  (마) 같은 브라우저에서 창 A(mois_dsd01)를 연 채 창 B 로 ij_safety01 로그인 → 창 A 는 시나리오 특보를 띄우지 않고 세션 만료 안내
// node harness/e2e/shots_demo_fix.mjs [baseUrl=http://localhost:3100]   → harness/reports/shots/r42_fix_*.png
// 끝나면(실패해도) 시나리오를 끄고 브리핑 항목을 되돌린다. 로그인하면 그 계정의 다른 세션은 끊긴다.
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
const BRF4 = JSON.parse(readFileSync(join(APP, "harness", "recordings", "demo_v3", "BRF-BS-4.json"), "utf8")).question;
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) process.exitCode = 1;
};
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `r42_fix_${name}.png`) });
  console.log("  shot", `r42_fix_${name}.png`);
};
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");
const SCN = "시연 시나리오";

function watch(page, acc) {
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${acc}: ${m.text()}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() < 400 || (r.status() === 401 && u.pathname === "/api/auth/me")) return;
    if (r.status() === 503 && u.pathname === "/api/agent/jobs") return; // (다) 가로챈 접수
    errors.push(`${acc}: ${r.status()} ${r.request().method()} ${u.pathname}`);
  });
}
async function login(page, acc) {
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/(explore|admin)/, { timeout: 30000 });
  await page.waitForTimeout(1500);
}
async function session(acc) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  watch(page, acc);
  await login(page, acc);
  return { ctx, page };
}
const aimOff = async (page) => {
  if (await page.locator(".ai-pill.on").count()) await page.locator(".ai-pill").click();
};

const admin = await session("admin01");
const setScenario = (on) =>
  admin.page.evaluate(async (v) => {
    const r = await fetch("/api/admin/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v ? { on: true, until: new Date(Date.now() + 2 * 3600_000).toISOString() } : { on: false }) });
    return r.json();
  }, on);
let restoreBrief = null;

try {
  await setScenario(false);

  // ── (가) 영천 — 「재난담당자의 하루」 ──
  const yc = await session("yc_safety02");
  await aimOff(yc.page);
  await yc.page.getByRole("button", { name: "질문 목록 보기" }).click();
  await yc.page.getByRole("button", { name: "재난담당자의 하루" }).click();
  const intro = await text(yc.page, ".drawer-b > p");
  ok(!intro.includes("관련 데이터를 먼저 조회") && intro.includes("입력창의 재난상황 조건은 싣지 않으며"), `소개 글 「${intro}」`);
  const row = (title) => yc.page.locator(".drawer .day-q", { has: yc.page.locator("b", { hasText: title }) });
  const yc01 = await row("소하천이 있는 미해제 위험지구").textContent();
  // 실시간 장면 주의는 운영관리에만 — 서랍은 무대 화면에 보이므로 띄우지 않는다
  ok(!yc01.includes("누르지 마세요"), "YC-01 서랍에 실시간 주의 없음(운영관리에만)");
  const yc02 = await row("호우경보 때 북안면·신녕면·화북면 재해위험저수지").textContent();
  ok(yc02.includes("사용자 입력 조건") && !yc02.includes("누르지 마세요"), "YC-02 「사용자 입력 조건」 · 실시간 주의 없음");
  ok(!(await row("힌남노 때 북안면 피해·복구").textContent()).includes("사용자 입력 조건"), "YC-04(재난유형만) 표지 없음");
  const btn = yc.page.locator(".drawer .day-btn").first();
  await btn.hover();
  const deco = await btn.evaluate((b) => ({ btn: getComputedStyle(b).textDecorationLine, name: getComputedStyle(b.querySelector("b")).textDecorationLine }));
  ok(deco.btn === "none" && deco.name === "underline", `마우스 올림 — 단추 ${deco.btn} · 항목 이름 ${deco.name}`);
  await shot(yc.page, "01_yc_day_tab");

  // ── (나) 운영관리 — 시연 세트 예열 ──
  await admin.page.goto(base + "/admin?tab=demo");
  await admin.page.getByRole("heading", { name: "시연 세트 예열" }).waitFor({ timeout: 20000 });
  const note = await text(admin.page, ".adm-note");
  ok(note.includes("재해위험저수지") && !note.includes("소하천이 있는 미해제 위험지구") && note.includes("차례를 기다릴 수 있습니다"), `실시간 안내 「${note.slice(0, 160)}」`);
  const titles = await admin.page.$$eval(".adm-sec .adm-q b", (l) => l.map((e) => e.textContent));
  ok(titles.includes("소하천이 있는 미해제 위험지구") && !titles.includes("호우경보 때 북안면·신녕면·화북면 재해위험저수지"), "예열 표 — YC-01 있음 · YC-02 없음");
  const accs = [...new Set(await admin.page.$$eval(".adm-sec .adm-tbl tbody tr td:nth-child(4)", (l) => l.map((e) => e.textContent)))].sort();
  ok(accs.join() === "bs_safety01,ij_safety01,yc_safety02", `예열 계정 ${accs.join(" · ")}`);
  const red = await admin.page.locator(".adm-sec .badge.danger, .panel .notice.danger, section[aria-label='시연 시나리오 특보'] .notice.danger").count();
  ok(red === 0, `새 패널·표 빨강 표지 ${red}개`);
  await shot(admin.page, "02_admin_demo_warm");

  // ── (다) 부산 — /explore?brief=1 은 저장된 브리핑 항목으로 ──
  const bs = await session("bs_safety01");
  await aimOff(bs.page);
  const orig = await bs.page.evaluate(async () => (await fetch("/api/kv?scope=acct:bs_safety01").then((r) => r.json())).brief?.value ?? null);
  restoreBrief = async () => {
    await bs.page.evaluate(async (v) => {
      await fetch("/api/kv", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "acct:bs_safety01", key: "brief", value: v }) });
    }, orig);
    console.log("  브리핑 항목 되돌림:", orig ? `${orig.length}개` : "저장 안 된 상태(기본 4문항)");
  };
  const lib = (id, label, q) => ({ key: id, preset: id, label, q, on: true });
  const set = [
    lib("BR-01", "위험·취약지역", "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?"),
    lib("BR-02", "과거 피해 이력", "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?"),
    lib("BR-03", "통제·대피 대상", "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?"),
    { ...lib("BR-04", "행동매뉴얼", "현장조치 행동매뉴얼상 지금 단계에서 해야 할 일은?"), on: false },
    { key: "c-BS-01", label: "하천 옆 지하차도", q: BRF4, on: true },
  ];
  await bs.page.evaluate(async (v) => {
    const r = await fetch("/api/kv", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "acct:bs_safety01", key: "brief", value: v }) });
    if (!r.ok) throw new Error(`kv ${r.status}`);
  }, set);
  const sent = [];
  await bs.page.route("**/api/agent/jobs", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "화면 확인 — 보내지 않음" }) });
  });
  await bs.page.route("**/api/conversations", (route) => (route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 200, contentType: "application/json", body: "{}" })));
  await bs.page.goto(base + "/explore?brief=1");
  await bs.page.waitForFunction((n) => document.querySelectorAll(".brief-block .bb-cells li").length >= n, 4, { timeout: 30000 }).catch(() => {});
  await bs.page.waitForTimeout(2000);
  const items = sent.map((b) => b.briefing?.briefing_item_id);
  ok(items.join() === "BR-01,BR-02,BR-03,c-BS-01", `?brief=1 이 보낸 항목 ${items.join(" · ") || "없음"}(저장된 체크 항목 — BR-04 없음)`);
  ok(sent[3]?.question === BRF4 && !sent[3]?.libraryId && sent.every((b) => b.source === "BRIEFING"), "4번 = 「하천 옆 지하차도」 질의문 그대로 · 문항 아님(자동 조회 없음) · 출처 브리핑");
  await shot(bs.page, "03_busan_brief_param");
  await bs.page.unroute("**/api/agent/jobs");
  await bs.page.unroute("**/api/conversations");
  await restoreBrief();
  restoreBrief = null;

  // ── (라)·(마) 시나리오 켬 ──
  await setScenario(true);
  await bs.page.goto(base + "/explore");
  await bs.page.locator(".wxbar .tit").waitFor({ timeout: 20000 });
  await bs.page.waitForFunction(() => (document.querySelector(".wxbar")?.textContent ?? "").includes("시연 시나리오"), null, { timeout: 30000 });
  await bs.page.getByRole("button", { name: /특보로 질문/ }).click();
  const pick = bs.page.locator("[role=menuitem]", { hasText: SCN });
  if (await pick.count()) await pick.first().click();
  const chip = () => text(bs.page, ".wxbar");
  ok((await chip()).includes(`참조 중 · 호우경보 (${SCN})`), "부산 [특보로 질문] — 「참조 중 · 호우경보 (시연 시나리오)」");
  await shot(bs.page, "04_busan_wxref_scenario");

  // (마) 같은 브라우저 — 창 A 중앙정부 · 창 B 인제 로그인(쿠키가 인제로 바뀜)
  const shared = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
  const winA = await shared.newPage();
  watch(winA, "창A");
  await login(winA, "mois_dsd01");
  const winB = await shared.newPage();
  watch(winB, "창B");
  await login(winB, "ij_safety01");
  ok((await text(winB, ".wxbar")).includes(SCN), "창 B(인제) 특보 줄에 시나리오");
  // 창 A 의 60초 특보 조회가 인제 기준으로 답한다 → 계정이 달라 버리고 세션 만료
  const expired = await winA.getByText("로그인 세션이 만료되었습니다").waitFor({ timeout: 80000 }).then(() => true, () => false);
  ok(expired, "창 A(중앙정부 표시) — 세션 만료 안내");
  ok(!(await text(winA, ".wxbar")).includes(SCN), `창 A 특보 줄에 시나리오 없음 「${(await text(winA, ".wxbar")).slice(0, 60)}」`);
  await shot(winA, "05_other_window_expired");
  await shared.close();

  // (라) 끔 → 부산 참조가 떨어짐(특보 조회 60초 · 서버 캐시 10초 안)
  await setScenario(false);
  const cleared = await bs.page
    .waitForFunction(() => !(document.querySelector(".wxbar")?.textContent ?? "").includes("참조 중"), null, { timeout: 90000 })
    .then(() => true, () => false);
  ok(cleared && !(await chip()).includes(SCN), `끈 뒤 부산 특보 줄 「${(await chip()).slice(0, 80)}」`);
  await shot(bs.page, "06_busan_wxref_cleared");
} finally {
  if (restoreBrief) await restoreBrief().catch((e) => console.log("  브리핑 항목 되돌리기 실패", String(e)));
  const r = await setScenario(false).catch((e) => ({ error: String(e) }));
  console.log("  끝 — 시나리오 꺼짐:", r?.live === false ? "확인" : JSON.stringify(r));
}
console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
