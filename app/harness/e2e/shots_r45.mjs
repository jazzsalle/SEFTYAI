// 하네스 — R44(기준지역 잠금에서 AI 모드 점검 빼기) · R45(시연 시나리오를 켠 동안 시연 계정은 기상청 실시간 특보 끊음) 화면 확인
//  (가) 시나리오 켬 → 부산 bs_safety01 특보 줄: 「부산 호우경보 발효 중 · 시연 시나리오」 · 「HH:MM 켬 · 기상청 실시간 특보 끊음」(기상청 시각 없음) · /api/weather realtimeCut
//  (나) AI 모드 창(실제 T3Q 점검 1건 — 같은 10분 구간이면 원래 점검 작업을 돌려받음) — 「켬 · 시연 시나리오 · 기상청 실시간 특보 끊음」
//  (다) R44·R47 — 점검이 도는 동안 기준지역 고르기가 막히지 않고, 서울특별시로 바꾸면 확인 창(두 줄) → AI 모드 꺼짐 · 진행 중이던 부산 점검 취소 · 새 지역 점검 없음.
//       서울특별시에서 AI 모드를 다시 켜면 시나리오 특보 없는 점검(실제 T3Q 점검 1건)
//       → 특보 줄 「실시간 끊음」(회색) · 「서울특별시에는 시연 시나리오 특보가 없습니다」 · 갱신 칸 「기상청 실시간 특보 끊음」 · 「특보 없음」·「발효 중인 기상특보가 없습니다」 없음
//       · 머리줄 AI 모드 단추 회색 · AI 모드 창
//  (라) mois_dsd01 — 기상청 실시간 그대로(끊음 없음 · 기상청 시각)
//  (마) 운영관리 — 「시연 시나리오 특보」·「시연 세트 예열」 설명
//  (바) 시나리오 끔 → 부산 다시 실시간
// node harness/e2e/shots_r45.mjs [baseUrl=http://localhost:3100]   → harness/reports/shots/r45_*.png
// 끝나면(실패해도) 시나리오를 끈다. 로그인하면 그 계정의 다른 세션은 끊긴다. 실제 T3Q 질의는 AI 모드 점검 2건까지
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
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) process.exitCode = 1;
};
const shot = async (target, name) => {
  await (target.page ? target.page() : target).waitForTimeout(700);
  await target.screenshot({ path: join(out, `r45_${name}.png`) });
  console.log("  shot", `r45_${name}.png`);
};
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");
const CUT = "기상청 실시간 특보 끊음";
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
const reload = async (page) => {
  await page.reload();
  await page.locator(".wxbar .tit").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
};
const weather = (page) => page.evaluate(async () => fetch("/api/weather").then((r) => r.json()));
/** 이 화면이 보낸 AI 모드 점검 접수(본문·응답 작업) */
function aimPosts(page) {
  const list = [];
  page.on("response", async (r) => {
    const q = r.request();
    if (q.method() !== "POST" || new URL(r.url()).pathname !== "/api/agent/jobs") return;
    const body = JSON.parse(q.postData() ?? "{}");
    if (body.source !== "AI_MODE") return;
    const j = await r.json().catch(() => ({}));
    list.push({ trigger: body.aiMode?.trigger, base: body.condition?.base?.name ?? null, warnings: body.warnings, job: j.job ?? null });
  });
  return list;
}
/** 노드 쪽 값이 채워질 때까지(최대 ms) */
const until = async (f, ms) => {
  for (const t = Date.now(); !f() && Date.now() - t < ms; ) await new Promise((r) => setTimeout(r, 200));
};
const waitAnswer = (page) =>
  page.waitForFunction(() => {
    const t = document.querySelector(".aim-ai")?.textContent ?? "";
    return t && !/기다리는 중|준비하고 있습니다|불러오는 중/.test(t);
  }, null, { timeout: 240000 });

const admin = await session("admin01");
const setScenario = (on) =>
  admin.page.evaluate(async (v) => {
    const r = await fetch("/api/admin/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v ? { on: true, until: new Date(Date.now() + 2 * 3600_000).toISOString() } : { on: false }) });
    return r.json();
  }, on);

try {
  // ── (가) 켬 → 부산 특보 줄 ──
  const st = await setScenario(true);
  ok(st.live === true, `시나리오 켬 · ${st.state?.startedAt}`);
  const bs = await session("bs_safety01");
  if (await bs.page.locator(".ai-pill.on").count()) await bs.page.locator(".ai-pill").click();
  await reload(bs.page);
  const w = await weather(bs.page);
  ok(w.realtimeCut === true && w.advisories.map((a) => a.id).join() === "SCN-BS-1" && w.preliminary.length === 0 && w.advisories[0].issuedAt === st.state.startedAt && Math.abs(Date.parse(w.status.fetchedAt) - Date.now()) < 120_000,
    `/api/weather — realtimeCut · SCN-BS-1 만 · 예비특보 없음 · 발표 시각 = 켠 시각 · 조회 시각 = 지금(${w.status.fetchedAt}) · 「${w.status.message}」`);
  const bar = await text(bs.page, ".wxbar");
  const meta = await text(bs.page, ".wxbar .meta");
  ok(bar.includes("부산 호우경보 발효 중") && bar.includes(SCN), `부산 특보 줄 「${bar.slice(0, 90)}」`);
  ok(/^\d\d:\d\d 켬 · 기상청 실시간 특보 끊음$/.test(meta) && !/기상청 \d\d:\d\d/.test(bar), `갱신 칸 「${meta}」`);
  await shot(bs.page, "01_busan_wxbar_cut");

  // ── (나) AI 모드 창 — 실제 점검 1건 ──
  const posts = aimPosts(bs.page);
  await bs.page.getByRole("button", { name: "AI 모드", exact: true }).click();
  await bs.page.locator(".modal.aim").waitFor({ timeout: 20000 });
  await bs.page.waitForFunction(() => document.querySelector(".aim-card")?.textContent?.includes("켬"), null, { timeout: 20000 });
  const card = await text(bs.page, ".aim-card");
  ok(card.includes(`켬 · ${SCN} · ${CUT}`) && !card.includes("발표 · 기상청"), `AI 모드 창 「${card.slice(0, 90)}」`);
  await until(() => posts.length > 0, 20000);
  await bs.page.waitForTimeout(800);
  const p0 = posts[0];
  const p0at = p0?.warnings?.collected_at;
  ok(p0?.trigger === "START" && p0?.base === "부산광역시" && p0?.warnings?.source === "시연 시나리오(가상 특보)" && p0?.warnings?.items?.map((i) => i.warning_key).join() === "SCN-BS-1" && !p0?.warnings?.items?.[0]?.source
    && p0?.warnings?.items?.[0]?.announced_at === st.state.startedAt && Math.abs(Date.parse(p0at) - Date.now()) < 180_000,
    `점검 1 — ${p0?.trigger} · ${p0?.base} · ${p0?.warnings?.source} · ${p0?.warnings?.items?.map((i) => i.warning_key).join()} · 수집 ${p0at} · 작업 ${p0?.job?.state}`);
  await shot(bs.page.locator(".modal.aim"), "02_busan_aimode_cut");

  // ── (다) R44·R47 — 점검이 도는 동안에도 기준지역을 바꿀 수 있고, 바꾸면 확인 창(두 줄) → AI 모드 꺼짐 · 부산 점검 취소 · 새 지역으로 따라가지 않음 ──
  await bs.page.getByRole("button", { name: "접기", exact: true }).click();
  const sido = bs.page.getByRole("combobox", { name: "기준지역 시·도" });
  const running = (await text(bs.page, ".aim-bar")).includes("점검 중");
  // 점검이 도는 동안일 때만 R44 확인으로 센다(같은 10분 구간이라 끝난 원래 점검을 돌려받았으면 확인이 아니다)
  ok(running && !(await sido.isDisabled()), `AI 모드 점검이 ${running ? "도는 동안" : "끝난 뒤(R44 확인 아님)"} 기준지역 고르기 열림 · 띠 「${(await text(bs.page, ".aim-bar")).slice(0, 90)}」`);
  await shot(bs.page, "03_r44_aim_running_picker_open");
  await sido.selectOption({ label: "서울특별시" });
  const dlg = bs.page.getByRole("alertdialog", { name: "기준지역 변경" });
  await dlg.waitFor({ timeout: 10000 });
  const dlgText = ((await dlg.textContent()) ?? "").replace(/\s+/g, " ").trim();
  ok(dlgText.includes("1. 기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.") && dlgText.includes("2. 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다."), `확인 창(R47) 「${dlgText.slice(0, 120)}」`);
  await shot(bs.page, "04_r47_base_dialog");
  await dlg.getByRole("button", { name: "새 대화로 시작" }).click();
  await bs.page.waitForTimeout(2500);
  // 아무도 보지 않을 부산 점검(진행 중이던 것)은 취소된다 — 계정 동시 한도를 비움
  // 취소 요청은 확인 즉시 나가지만(세션 setBase) 개발 서버는 처음 부를 때 경로를 컴파일하느라 늦을 수 있다 — 최대 30초 기다린다
  let j0 = null;
  for (let t = Date.now(); p0?.job?.id && Date.now() - t < 30_000; await bs.page.waitForTimeout(1000)) {
    j0 = await bs.page.evaluate(async (id) => (await (await fetch(`/api/agent/jobs/${id}`)).json()).job, p0.job.id);
    if (!running || j0?.state !== "RUNNING") break;
  }
  ok(!running || j0?.state === "CANCELLED", `이전 지역(부산) 점검 작업 ${j0?.id?.slice(0, 8)} — ${j0?.state}`);
  ok(posts.length === 1 && !(await bs.page.locator(".ai-pill.on").count()) && !(await bs.page.locator(".aim-bar").count()), `AI 모드 꺼짐 · 띠 없음 · 점검 접수 ${posts.length}건(부산 1 — 서울로 따라가지 않음)`);
  // 구역 밖(서울특별시)에서 AI 모드를 다시 켜면 — 시나리오 특보 없음 점검(빈 목록 · source 시연 시나리오)
  await bs.page.getByRole("button", { name: "AI 모드", exact: true }).click();
  await bs.page.locator(".modal.aim").waitFor({ timeout: 20000 });
  await until(() => posts.length > 1, 20000);
  const p1 = posts[1];
  ok(p1?.trigger === "START" && p1?.base === "서울특별시" && p1?.warnings?.source === "시연 시나리오(가상 특보)" && p1?.warnings?.items?.length === 0,
    `서울특별시에서 다시 켬 → 점검 — ${p1?.trigger} · ${p1?.base} · ${p1?.warnings?.source} · 특보 ${p1?.warnings?.items?.length}건 · 작업 ${p1?.job?.state}`);
  await bs.page.getByRole("button", { name: "접기", exact: true }).click();
  const bar2 = await text(bs.page, ".wxbar");
  const tag2 = await bs.page.$eval(".wxbar .tag", (e) => ({ t: e.textContent, c: e.className, bg: getComputedStyle(e).backgroundColor }));
  ok(tag2.t === "실시간 끊음" && tag2.c === "tag fail", `구역 밖 꼬리표 「${tag2.t}」 ${tag2.c} ${tag2.bg}`);
  ok(bar2.includes("서울특별시에는 시연 시나리오 특보가 없습니다") && (await text(bs.page, ".wxbar .meta")) === CUT && !bar2.includes("특보 없음") && !bar2.includes("발효 중인 기상특보가 없습니다"), `구역 밖 특보 줄 「${bar2.slice(0, 110)}」`);
  const pill = await bs.page.$eval(".ai-pill", (e) => e.className);
  ok(pill.includes("st-gray"), `머리줄 AI 모드 단추 ${pill}`);
  const band = await text(bs.page, ".aim-bar");
  ok(band.includes("서울특별시 시연 시나리오 특보 없음") && band.includes(CUT) && !band.includes("발효 특보 없음"), `띠 「${band.slice(0, 110)}」`);
  await shot(bs.page, "04b_r47_base_changed_wxbar");
  await bs.page.getByRole("button", { name: "AI 모드 펼치기" }).click();
  await bs.page.locator(".modal.aim").waitFor({ timeout: 20000 });
  await waitAnswer(bs.page).catch(() => console.log("  (점검 답 기다림 시간 넘음)"));
  const card2 = await text(bs.page, ".aim-card");
  ok(card2.includes("서울특별시 시연 시나리오 특보 없음") && card2.includes(CUT), `구역 밖 AI 모드 창 「${card2.slice(0, 160)}」`);
  await shot(bs.page.locator(".modal.aim"), "05_r47_aimode_reenabled_out_of_zone");
  // 다음 단계에서 다시 점검하지 않게 AI 모드를 끈다
  await bs.page.getByRole("button", { name: "AI 모드 종료" }).click();

  // ── (라) 행안부 — 기상청 실시간 그대로 ──
  const mo = await session("mois_dsd01");
  const mw = await weather(mo.page);
  const mbar = await text(mo.page, ".wxbar");
  ok(!mw.realtimeCut && !mw.advisories.some((a) => a.scenario) && !mbar.includes("끊음") && !mbar.includes(SCN) && /기상청 \d\d:\d\d|조회 \d\d:\d\d|최종 시도/.test(mbar), `행안부 특보 줄 「${mbar.slice(0, 110)}」`);
  await shot(mo.page, "06_central_realtime");

  // ── (마) 운영관리 설명 ──
  await admin.page.goto(base + "/admin?tab=demo");
  await admin.page.getByRole("heading", { name: "시연 시나리오 특보" }).waitFor({ timeout: 20000 });
  const desc = await text(admin.page, "section[aria-label='시연 시나리오 특보'] > p");
  ok(desc.includes("기상청 실시간 특보를 받지 않고") && desc.includes("24시간 동안 이전 답") && desc.includes("1~2분 안에"), `시나리오 설명 「${desc.slice(0, 260)}」`);
  await shot(admin.page.locator("section[aria-label='시연 시나리오 특보']"), "07_admin_scenario_desc");

  // ── (바) 끔 → 다시 실시간 ──
  const offSt = await setScenario(false);
  ok(offSt.live === false, "시나리오 끔");
  await reload(bs.page);
  const ow = await weather(bs.page);
  const obar = await text(bs.page, ".wxbar");
  ok(!ow.realtimeCut && !obar.includes("끊음") && !obar.includes(SCN), `끈 뒤 부산 특보 줄 「${obar.slice(0, 110)}」`);
  await shot(bs.page, "08_busan_realtime_again");
} finally {
  const r = await setScenario(false).catch((e) => ({ error: String(e) }));
  console.log("  끝 — 시나리오 꺼짐:", r?.live === false ? "확인" : JSON.stringify(r));
}
console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
