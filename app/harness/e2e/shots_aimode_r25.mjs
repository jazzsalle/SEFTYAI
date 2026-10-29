// 하네스 — R39·R40·R41 화면 확인
//  (가) AI 모드(부산 bs_safety01): 켜고 점검 답 → 질문 목록에 점검이 없음 → 새로 고침·새 탭에서도 같은 점검 작업(새 행 없음)
//  (나) 특보 줄(전국 admin01): 지금 기상청 현황 그대로 + 특보가 여럿인 때(기상청 실응답 원문 harness/region/kma_t6_samples.json gale 다시 보기)
//       — 「외 n건」·개수 숫자 없이 나머지 특보 이름을 받은 순서로 · 로, [모두 보기] = 발효 특보 전체(받은 순서, Esc·바깥 누르기로 닫힘, 390·768px 화면 안)
//  (다) 사건 상세 근거(부산 대화 이력에서 「2020년 7.23.~25. 호우, 강풍, 풍랑」 사건을 연다 — 새 질의 없음): T3Q-19 받은 값 그대로
// node harness/e2e/shots_aimode_r25.mjs [baseUrl=http://localhost:3100]   → harness/reports/shots/r39_*.png
//  env ONLY=aim(가·다) | wx(나) 이면 그 부분만
// 실제 T3Q 에이전트 질의 = AI 모드 점검만(같은 10분 구간이면 1건 — 새로 고침·새 탭은 원래 점검 작업을 돌려받는다). 사건 상세는 데이터 조회만.
// 비밀번호: env SMOKE_PASSWORD 또는 app/.env.development.local 의 SA_INIT_PASSWORDS(출력하지 않음)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100"] = process.argv.slice(2);
const only = process.env.ONLY ?? "";
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
  await (target.waitForTimeout ? target : target.page()).waitForTimeout(700);
  await target.screenshot({ path: join(out, `r39_${name}.png`) });
  console.log("  shot", `r39_${name}.png`);
};
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");

/** 기상청 현황 원문(t6) → /api/weather 응답 꼴 — shots_region.mjs 와 같은 나누기(괄호 깊이 0 의 쉼표) */
const splitTop = (s) => {
  const r = [];
  let d = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") d++;
    else if (ch === ")") d = Math.max(0, d - 1);
    if (ch === "," && d === 0) { r.push(cur); cur = ""; } else cur += ch;
  }
  r.push(cur);
  return r.map((x) => x.trim()).filter(Boolean);
};
function weatherOf(t6, tmFc) {
  const s = String(tmFc);
  const at = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  const advisories = [];
  for (const line of t6.replace(/\r/g, "").split(/\n|(?=o\s)/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^o\s*([가-힣]+?)(주의보|경보)\s*:\s*(.+)$/);
    if (!m) continue;
    for (const area of splitTop(m[3])) advisories.push({ id: `KMA-${m[1]}${m[2]}-${area}`.replace(/\s/g, ""), type: m[1], level: m[2], area, issuedAt: at, status: "발효" });
  }
  return { mode: "live", status: { ok: true, fetchedAt: at, message: `기상청 ${at.slice(11, 16)} 발표` }, advisories, preliminary: [] };
}

async function session(acc, before) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
  if (before) await before(ctx);
  const page = await ctx.newPage();
  watch(page, acc);
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/explore", { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
function watch(page, acc) {
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${acc}: ${m.text()}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() < 400 || (r.status() === 401 && u.pathname === "/api/auth/me")) return;
    errors.push(`${acc}: ${r.status()} ${r.request().method()} ${u.pathname}`);
  });
}
/** AI 모드 점검 접수 응답(POST /api/agent/jobs, source AI_MODE)의 작업 id 를 모은다 */
function aimIds(page) {
  const ids = [];
  page.on("response", async (r) => {
    if (r.request().method() !== "POST" || new URL(r.url()).pathname !== "/api/agent/jobs") return;
    const body = JSON.parse(r.request().postData() ?? "{}");
    if (body.source !== "AI_MODE") return;
    const j = await r.json().catch(() => null);
    if (j?.job?.id) ids.push(j.job.id);
  });
  return ids;
}
/** 이 계정의 AI 모드 점검 작업 행(최근 50건 안, 같은 10분 구간) */
const aimRows = (page, bucket) =>
  page.evaluate(async (b) => {
    const r = await fetch("/api/agent/jobs?limit=50", { credentials: "same-origin" }).then((x) => x.json());
    return (r.jobs ?? []).filter((j) => j.source === "AI_MODE" && Math.floor(new Date(j.created_at).getTime() / 600000) === b).map((j) => j.id);
  }, bucket);
const answered = (page) =>
  page.waitForFunction(() => {
    const t = document.querySelector(".aim-ai")?.textContent ?? "";
    return t && !/기다리는 중|준비하고 있습니다|불러오는 중/.test(t);
  }, null, { timeout: 240000 });

// ── (가) AI 모드 — 부산 ──
if (!only || only === "aim") {
// 10분 구간 끝 3분 안이면 다음 구간까지 기다린다(새로 고침·새 탭이 같은 구간에 들게)
const left = 600 - ((Date.now() / 1000) % 600);
if (left < 180) {
  console.log(`  10분 구간 끝까지 ${Math.round(left)}초 — 다음 구간까지 기다림`);
  await new Promise((r) => setTimeout(r, (left + 5) * 1000));
}
const bucket = Math.floor(Date.now() / 600000);
const { ctx: c1, page: p } = await session("bs_safety01");
const ids = aimIds(p);
const before = await aimRows(p, bucket);
await p.getByRole("button", { name: "AI 모드", exact: true }).click();
await p.locator(".modal.aim").waitFor({ timeout: 20000 });
const t0 = Date.now();
await answered(p);
console.log(`  점검 답 ${Math.round((Date.now() - t0) / 1000)}초 · ${(await text(p, ".aim-ai")).slice(0, 120)}`);
const aiColor = await p.$eval(".aim-ai > .xs.b", (e) => getComputedStyle(e).color);
ok(aiColor === "rgb(6, 58, 116)", `「AI 안내」 이름표 = 남색(${aiColor}) — 빨강 아님`);
await shot(p.locator(".modal.aim"), "01_aimode_modal");
const first = ids.at(-1);
ok(!!first, `점검 작업 접수 ${first}`);

await p.getByRole("button", { name: "접기", exact: true }).click();
const tab = p.getByRole("button", { name: "질문 목록 열기" });
if (await tab.count()) await tab.click();
await p.locator(".qpanel").waitFor({ timeout: 10000 });
const qtext = await text(p, ".qpanel");
ok(!qtext.includes("제공된 기상특보 정보를 기준으로"), "질문 목록에 AI 모드 점검이 없음");
console.log("  질문 목록:", qtext.slice(0, 160));
await shot(p, "02_queue_no_aimode");
const rows1 = await aimRows(p, bucket);
ok(rows1.length === before.length + 1 || (before.includes(first) && rows1.length === before.length), `이번 구간 점검 행 ${before.length} → ${rows1.length}`);

// 새로 고침 — AI 모드는 켜진 채(브라우저 저장)로 다시 START 점검 → 같은 작업
await p.reload();
await p.locator(".modal.aim").waitFor({ timeout: 30000 });
await answered(p);
await p.waitForTimeout(1500);
const afterReload = ids.at(-1);
ok(afterReload === first, `새로 고침 뒤 점검 = 원래 작업 (${afterReload})`);
// 「다음 점검」 = 돌려받은 원래 점검의 접수 시각(마지막 점검) + 10분
const times = (await text(p, ".modal.aim")).match(/마지막 점검 (\d\d):(\d\d) · 다음 점검 (\d\d):(\d\d)/);
const gap = times ? (((+times[3] * 60 + +times[4]) - (+times[1] * 60 + +times[2])) + 1440) % 1440 : null;
ok(gap === 10, `새로 고침 뒤 마지막 점검 ${times?.[1]}:${times?.[2]} · 다음 점검 ${times?.[3]}:${times?.[4]}(간격 ${gap}분)`);
// 켜자마자 새로 고침(3초 안 재요청) — 3초 중복 차단 없이 같은 작업
await p.reload();
await p.locator(".modal.aim").waitFor({ timeout: 30000 });
await p.waitForTimeout(800);
await p.reload();
await p.locator(".modal.aim").waitFor({ timeout: 30000 });
await answered(p);
await p.waitForTimeout(1000);
ok(ids.at(-1) === first, `잇달아 새로 고침해도 같은 점검 작업 (${ids.at(-1)})`);
const rows2 = await aimRows(p, bucket);
ok(rows2.length === rows1.length, `새로 고침 뒤 점검 행 ${rows1.length} → ${rows2.length}(새 행 없음)`);
await shot(p.locator(".modal.aim"), "03_aimode_after_reload");

// 새 탭
const p2 = await c1.newPage();
watch(p2, "bs_safety01(새 탭)");
const ids2 = aimIds(p2);
await p2.goto(base + "/explore");
await p2.locator(".modal.aim").waitFor({ timeout: 30000 });
await answered(p2);
await p2.waitForTimeout(1500);
ok(ids2.at(-1) === first, `새 탭 점검 = 원래 작업 (${ids2.at(-1)})`);
const rows3 = await aimRows(p2, bucket);
ok(rows3.length === rows1.length, `새 탭 뒤 점검 행 ${rows1.length} → ${rows3.length}(새 행 없음)`);
await shot(p2.locator(".modal.aim"), "04_aimode_new_tab");
await p2.getByRole("button", { name: "AI 모드 종료" }).click();
await p2.close();

// ── (다) 사건 상세 근거 — 부산 대화 이력(새 질의 없음) ──
const EVENT = "2020년 7.23.~25. 호우, 강풍, 풍랑";
const convs = await p.evaluate(() => fetch("/api/conversations", { credentials: "same-origin" }).then((x) => x.json()));
const conv = convs.find((c) => /피해가 났던 곳/.test(c.title ?? "") && (c.turns ?? []).length === 1) ?? convs.find((c) => /피해가 났던 곳/.test(c.title ?? ""));
ok(!!conv, `사건이 든 대화 이력 ${conv?.id}`);
if (conv) {
  await p.goto(base + `/explore?c=${conv.id}`);
  const ev = p.getByText(EVENT, { exact: true }).first();
  await ev.waitFor({ timeout: 60000 });
  await ev.click();
  const panel = p.locator(".rpanel").first();
  await panel.waitFor({ timeout: 30000 });
  const sec = panel.locator("section.ev-sec", { has: p.locator("h3", { hasText: /^근거$/ }) }).first();
  await sec.waitFor({ timeout: 30000 });
  await p.waitForFunction(() => {
    const s = [...document.querySelectorAll(".rpanel section.ev-sec")].find((x) => x.querySelector("h3")?.textContent === "근거");
    return s && !/불러오는 중/.test(s.textContent ?? "");
  }, null, { timeout: 30000 });
  const lines = await sec.locator("ul.ev-evd > li").allTextContents();
  console.log("  근거 줄:", lines);
  console.log("  근거 칸:", (await sec.textContent())?.replace(/\s+/g, " ").slice(0, 300));
  // 받은 값과 맞추기 — 같은 조회를 우리 서버로 다시 불러 받은 칸으로 줄을 만든다
  const env = await p.evaluate(async (id) => {
    const r = await fetch("/api/t3q/data", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ api: "T3Q-19", body: { object_id: id, include_passage: true, context_paragraphs: 0, page: { page: 1, size: 20 } } }) });
    return (await r.json()).envelope;
  }, "T10107-20200723-0001");
  const want = (env?.result?.items ?? []).map((it) => {
    const head = [it.title, it.page].filter((v) => typeof v === "string" && v).join(" ");
    return [head, it.section_path].filter(Boolean).join(" · ") || "—";
  });
  ok(lines.length > 0 && JSON.stringify(lines) === JSON.stringify(want), `근거 줄 = 받은 칸 그대로 (${want.join(" | ")})`);
  ok(lines.some((l) => /재해연보 p\.\d+/.test(l)), "재해연보 쪽이 보임");
  ok(!!env?.meta?.base_time && ((await sec.textContent()) ?? "").includes(`데이터 기준 ${env.meta.base_time}`), `데이터 기준 시각 그대로 (${env?.meta?.base_time})`);
  await sec.scrollIntoViewIfNeeded();
  await shot(panel, "05_event_evidence");
}
await c1.close();
}

// ── (나) 특보 줄 — 전국 admin01 ──
if (!only || only === "wx") {
const { ctx: c2, page: a } = await session("admin01");
const live = await text(a, ".wxbar");
console.log("  특보 줄(지금 기상청):", live);
ok(!/외 |\d+\s*건/.test(live), "특보 줄(지금)에 「외 」·「n건」 없음");
await shot(a, "06_wxbar_live");
await c2.close();

const KMA = JSON.parse(readFileSync(join(APP, "harness", "region", "kma_t6_samples.json"), "utf8"));
const gale = KMA.samples.find((s) => s.key === "gale");
const galeBody = JSON.stringify(weatherOf(gale.t6, gale.tmFc));
const { ctx: c3, page: g } = await session("admin01", (ctx) => ctx.route("**/api/weather", (r) => r.fulfill({ status: 200, contentType: "application/json", body: galeBody })));
await g.locator(".wxbar .more").waitFor({ timeout: 20000 });
const bar = await text(g, ".wxbar");
console.log("  특보 줄(기상청 원문 다시 보기):", bar.slice(0, 220));
ok(!/외 |\d+\s*건/.test(bar), "특보가 여럿이어도 「외 」·「n건」 없음");
const clipped = await g.$eval(".wxbar .more", (e) => ({ cut: e.scrollWidth > e.clientWidth, h: e.getBoundingClientRect().height }));
ok(clipped.h < 30, `나머지 특보 이름 한 줄(높이 ${Math.round(clipped.h)}px${clipped.cut ? " · 말줄임" : ""})`);
const tit = await g.$eval(".wxbar .tit", (e) => ({ sw: e.scrollWidth, cw: e.clientWidth, t: e.textContent }));
ok(tit.sw <= tit.cw, `첫 특보 제목은 잘리지 않음(${tit.t} · ${tit.sw}/${tit.cw}px)`);
const recv = JSON.parse(galeBody).advisories;
const topAdv = [...recv].sort((x, y) => (y.level === "경보" ? 1 : 0) - (x.level === "경보" ? 1 : 0))[0];
const restWant = recv.filter((x) => x !== topAdv).map((x) => `${x.type}${x.level}`).join(" · ");
ok((await text(g, ".wxbar .more")) === `· ${restWant}`, "나머지 특보 = 받은 순서 그대로");
await shot(g.locator(".wxbar"), "07_wxbar_many");
const allBtn = g.getByRole("button", { name: "모두 보기" });
await allBtn.click();
const list = g.getByRole("list", { name: "발효 중인 특보" });
await list.waitFor({ timeout: 5000 });
const n = await list.locator("[role=listitem]").count();
const listText = (await list.textContent()) ?? "";
ok(n === recv.length, `[모두 보기] 목록 = 받은 발효 특보 전부(${n}줄)`);
ok(!/\d+\s*건/.test(listText), "[모두 보기] 목록에 개수 숫자 없음");
const areas = await list.locator("[role=listitem] .ar").allTextContents();
ok(JSON.stringify(areas) === JSON.stringify(recv.map((x) => x.area)), "[모두 보기] 목록 = 받은 순서 그대로");
await shot(g, "08_wxbar_all");
await g.keyboard.press("Escape");
ok((await list.count()) === 0, "Esc 로 닫힘");
await allBtn.click();
await list.waitFor({ timeout: 5000 });
await g.mouse.click(800, 700);
ok((await list.count()) === 0, "바깥을 누르면 닫힘");
// 좁은 화면 — 목록이 화면 안(좌우 12px)
for (const w of [390, 768]) {
  await g.setViewportSize({ width: w, height: 844 });
  await g.waitForTimeout(400);
  await allBtn.click();
  await list.waitFor({ timeout: 5000 });
  const box = await list.boundingBox();
  ok(!!box && box.x >= 0 && box.x + box.width <= w, `${w}px 목록이 화면 안(${Math.round(box?.x ?? -1)} ~ ${Math.round((box?.x ?? 0) + (box?.width ?? 0))})`);
  if (w === 390) await shot(g, "09_wxbar_all_390");
  await g.keyboard.press("Escape");
}
await c3.close();
}

console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
