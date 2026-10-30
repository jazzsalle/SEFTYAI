// 하네스 — 11/5 시연 로컬 리허설(대본 docs/renewal/design/11_demo_day_story.md v3.2)
//  운영 순서(§7.1) ① 부산 시연 계정 브리핑 4번 넣기 → ② 시나리오 켜기(세 지역) → ③ 「시연 세트 예열 시작」 → ⑤ 「진행 중 0」 → ④ 특보 줄 확인
//  무대(§4) 부산 단계 1~10 → 인제 11-0(선택)~15 → 영천 16-0(선택)~19 를 화면 경로 그대로 누르고, 누른 때부터 답이 보일 때까지 잰다.
//  예열한 항목은 「이전 답변 재사용」으로 바로 떠야 하고(아니면 ✗), 실시간 항목(BS-02·IJ-05-R·YC-02)·AI 모드 점검은 새 질의다.
//  끝(⑦): AI 모드 끄기 · 시나리오 끄기 · 부산 브리핑 항목 기본으로 되돌리기
// node harness/e2e/rehearsal.mjs [baseUrl=http://localhost:3100]
//  → 답 원문 harness/recordings/rehearsal_<시각>/<단계>.json + _result.json(시각·재사용·처리 시간) · 화면 harness/reports/shots/rh_*.png
//  → 대본 인용 대조: node harness/demo/check_story_quotes.mjs --rec harness/recordings/rehearsal_<시각>
// 실제 T3Q 질의: 예열 최대 18(24시간 안 원본이 있으면 재사용) · 실시간 3 · AI 모드 점검 3(부산·인제·영천 — 동구로 바꾸면 AI 모드가 꺼진다, R47)
// 로컬(localhost·127.0.0.1)에서만 돈다 — 실시간 세 질문을 보내므로, 운영 서버에서 시연 24시간 안에 돌리면 무대 장면이 「이전 답변」이 된다(대본 §7.1 ⑥).
// 로그인하면 그 계정의 다른 세션은 끊긴다. 비밀번호: env SMOKE_PASSWORD 또는 app/.env.development.local 의 SA_INIT_PASSWORDS(출력하지 않음)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const [base = "http://localhost:3100"] = process.argv.slice(2);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) {
  console.error(`로컬에서만 돕니다(받은 주소 ${base}) — 실시간 질문을 보내므로 운영 서버에서는 돌리지 않습니다.`);
  process.exit(2);
}
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const recDir = join(APP, "harness", "recordings", `rehearsal_${STAMP}`);
const shotDir = join(APP, "harness", "reports", "shots");
mkdirSync(recDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
const pwOf = (acc) => {
  if (process.env.SMOKE_PASSWORD) return process.env.SMOKE_PASSWORD;
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  return JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[acc];
};
/** 브리핑 4번 질의문 = 녹화 demo_v3/BRF-BS-4 질문 글자 그대로(대본 §7.1 ①) */
const BRF4 = JSON.parse(readFileSync(join(APP, "harness", "recordings", "demo_v3", "BRF-BS-4.json"), "utf8")).question;
const BRF4_LABEL = "하천 옆 지하차도";
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
const result = { base, startedAt: new Date().toISOString(), ops: {}, warm: null, scenes: [], checks: [] };
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  result.checks.push({ ok: !!c, m });
  if (!c) process.exitCode = 1;
};
const shot = async (page, name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shotDir, `rh_${name}.png`) });
  console.log("  shot", `rh_${name}.png`);
};
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");
const sec = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 노드 쪽 값이 채워질 때까지(최대 ms) */
const until = async (f, ms) => {
  for (const t = Date.now(); !f() && Date.now() - t < ms; ) await sleep(200);
};
const ACTIVE = ["QUEUED", "SUBMITTED", "RUNNING"];
const SCN = "시연 시나리오";

async function session(acc) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  /** 이 화면이 보낸 질의 접수(본문·응답 작업) — 새로 받기(retry)도 */
  const posts = [];
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${acc}: ${m.text()}`));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && !(r.status() === 401 && u.pathname === "/api/auth/me")) errors.push(`${acc}: ${r.status()} ${r.request().method()} ${u.pathname}`);
    const q = r.request();
    if (q.method() !== "POST" || !/^\/api\/agent\/jobs(\/[^/]+\/retry)?$/.test(u.pathname)) return;
    let body = {};
    try { body = JSON.parse(q.postData() ?? "{}"); } catch {}
    const j = await r.json().catch(() => ({}));
    posts.push({ at: Date.now(), retry: u.pathname !== "/api/agent/jobs", source: body.source ?? null, libraryId: body.libraryId ?? null, aiMode: body.aiMode ?? null, warnings: body.warnings ?? null, base: body.condition?.base ?? null, job: j.job ?? null });
  });
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/(explore|admin)/, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { acc, ctx, page, posts };
}
const getJob = (page, id, full = false) =>
  page.evaluate(async ([i, f]) => (await (await fetch(`/api/agent/jobs/${i}${f ? "?full=1" : ""}`)).json()).job ?? null, [id, full]);
async function waitJob(page, id, ms = 900_000) {
  const t = Date.now();
  for (;;) {
    const j = await getJob(page, id).catch(() => null);
    if ((j && !ACTIVE.includes(j.state)) || Date.now() - t > ms) return j;
    await sleep(1500);
  }
}
/** 답 원문 저장 — check_story_quotes --rec 가 읽는 꼴(raw.result.answer). key 가 함수면 받은 작업으로 이름을 정한다(브리핑 = 요청의 항목 번호) */
async function dump(s, key, jobId) {
  const j = await getJob(s.page, jobId, true).catch(() => null);
  if (typeof key === "function") key = j ? key(j) : null;
  if (!j || !key) return console.log(`  (원문 못 받음 ${key} ${jobId})`);
  writeFileSync(
    join(recDir, `${key}.json`),
    JSON.stringify({ id: key, account: s.acc, question: j.question_user, jobId: j.id, cachedFrom: j.cached_from ?? null, sourceFinishedAt: j.source_finished_at ?? null, state: j.state, t3qStatus: j.t3q_status, elapsedMs: j.raw?.meta?.elapsed_ms ?? null, request: j.request, raw: j.raw }, null, 2),
  );
}
const scene = (o) => {
  result.scenes.push(o);
  return o;
};
/** 그 작업의 턴(#job-<id>)에 답(또는 실패) 카드가 보일 때까지 */
const cardShown = (page, id, ms) =>
  page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return !!el && !!el.querySelector(".acard.ans, .acard.err") && !el.querySelector(".acard.loading");
    }, `#job-${id}`, { timeout: ms })
    .then(() => true, () => false);

/** AI 모드 켜기 — 창이 뜨고 점검 답이 보일 때까지(실시간) */
async function aimOn(s, key, step) {
  const n0 = s.posts.length;
  const t0 = Date.now();
  await s.page.getByRole("button", { name: "AI 모드", exact: true }).click();
  await s.page.locator(".modal.aim").waitFor({ timeout: 20000 });
  await until(() => s.posts.slice(n0).some((p) => p.source === "AI_MODE"), 30000);
  const p = s.posts.slice(n0).find((x) => x.source === "AI_MODE");
  await s.page
    .waitForFunction(() => {
      const t = document.querySelector(".aim-ai")?.textContent ?? "";
      return t && !/기다리는 중|준비하고 있습니다|불러오는 중/.test(t);
    }, null, { timeout: 600_000 })
    .catch(() => console.log("  (AI 모드 점검 답 기다림 시간 넘음)"));
  const shown = Date.now() - t0;
  const card = await text(s.page, ".aim-card");
  const ai = await text(s.page, ".aim-ai");
  const j = p?.job?.id ? await waitJob(s.page, p.job.id, 60_000) : null;
  if (p?.job?.id) await dump(s, key, p.job.id);
  const sc = scene({ step, key, kind: "AI_MODE", account: s.acc, jobId: p?.job?.id ?? null, reused: !!p?.job?.cached_from, state: j?.state ?? null, shownSec: sec(shown), elapsedSec: sec(j?.elapsed_ms ?? null), warnings: p?.warnings?.items?.map((i) => i.warning_key) ?? null, card: card.slice(0, 160), answer: ai.slice(0, 300) });
  ok(!!p && j?.state === "DONE", `${step} AI 모드 점검 — 화면 ${sc.shownSec}초 · 처리 ${sc.elapsedSec}초 · 특보 ${sc.warnings?.join(",") ?? "—"}${sc.reused ? " · 재사용" : ""}`);
  console.log(`    「${ai.slice(0, 200)}」`);
  return sc;
}

/** 질문 모음 「재난담당자의 하루」 항목 누르기 — 접수 응답·그 작업의 답 카드가 보일 때까지 */
async function clickDemo(s, key, step, title, { live = false } = {}) {
  const { page, posts } = s;
  const n0 = posts.length;
  await page.getByRole("button", { name: "질문 목록 보기" }).click();
  await page.getByRole("button", { name: "재난담당자의 하루" }).click();
  const btn = page.locator(".drawer .day-btn", { hasText: title });
  await btn.waitFor({ timeout: 20000 });
  const t0 = Date.now();
  await btn.click();
  // 묶음 항목은 출처 LIBRARY — 같은 화면의 AI 모드 점검(동구 재점검 등)과 섞지 않는다
  await until(() => posts.slice(n0).some((p) => p.source === "LIBRARY"), 120_000);
  const p = posts.slice(n0).find((x) => x.source === "LIBRARY");
  const posted = p ? p.at - t0 : null;
  let job = p?.job ?? null;
  const seen = job?.id ? await cardShown(page, job.id, live ? 900_000 : 180_000) : false;
  if (!seen) console.log(`  (${key} 답 카드 기다림 시간 넘음)`);
  let shown = Date.now() - t0;
  const reusedFirst = !!job?.cached_from;
  const reuseNote = job?.id ? await text(page, `#job-${job.id} .ans-reuse`) : "";
  const qc = job?.id ? await text(page, `#job-${job.id} .qb-cond`) : "";
  let renewed = null;
  // 실시간 항목이 24시간 안 원본으로 재사용됐으면 — 이번 리허설의 실시간 시간 재기는 「새로 받기」로(무대에서는 이런 일이 없어야 한다 — 운영 순서 ⑥)
  if (live && reusedFirst) {
    const n1 = posts.length;
    const t1 = Date.now();
    await page.locator(`#job-${job.id} .ans-reuse`).getByRole("button", { name: "새로 받기" }).click();
    await until(() => posts.slice(n1).some((x) => x.retry), 60_000);
    const r = posts.slice(n1).find((x) => x.retry);
    const nid = r?.job?.id ?? null;
    if (nid) await cardShown(page, nid, 900_000);
    renewed = { jobId: nid, shownSec: sec(Date.now() - t1) };
    shown = Date.now() - t1;
    if (nid) job = { ...job, id: nid };
  }
  const final = job?.id ? await waitJob(page, job.id, live ? 900_000 : 120_000) : null;
  if (job?.id) await dump(s, key, job.id);
  const sc = scene({ step, key, kind: live ? "LIVE" : "WARM", account: s.acc, title, jobId: job?.id ?? null, reused: reusedFirst, renewed, state: final?.state ?? null, t3qStatus: final?.t3q_status ?? null, postedSec: sec(posted), shownSec: sec(shown), elapsedSec: sec(final?.elapsed_ms ?? null), preset: qc || null, reuseNote: reuseNote || null });
  if (live) ok(final?.state === "DONE" && (!reusedFirst || renewed?.jobId), `${step} ${key} 실시간 — 화면 ${sc.shownSec}초 · 처리 ${sc.elapsedSec}초 · ${final?.t3q_status ?? final?.state}${reusedFirst ? " · 처음엔 재사용됨(24시간 안 원본 있음) → 새로 받기로 잼" : ""}${qc ? ` · ${qc}` : ""}`);
  else ok(reusedFirst && final?.state === "DONE" && shown < 15_000, `${step} ${key} 예열 — ${reusedFirst ? "이전 답변 재사용" : "재사용 아님(새 질의!)"} · 접수 ${sc.postedSec}초 · 화면 ${sc.shownSec}초${qc ? ` · ${qc}` : ""}`);
  return sc;
}

/** 대응절차 — 단계 바 「다음」 줄과 [대응절차 전체] → [전체 부서 보기] 의 조치 번호 */
async function sopCheck(s, step, { next = [], find = [] }, name) {
  const nexts = await s.page.$$eval(".sopbar .sb-next button", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim())).catch(() => []);
  const bar = await text(s.page, ".sopbar");
  for (const n of next) ok(nexts.some((x) => x.includes(n)), `${step} 대응절차 「다음」에 「${n}」 — ${nexts.join(" / ") || "(없음)"}`);
  await s.page.locator(".sopbar").getByRole("button", { name: /대응절차 전체/ }).click();
  const all = s.page.getByRole("button", { name: "전체 부서 보기" });
  await all.waitFor({ timeout: 20000 });
  await all.click();
  await s.page.waitForTimeout(1200);
  const found = {};
  for (const f of find) {
    const loc = s.page.getByText(f).first();
    found[f] = (await loc.count()) > 0;
    ok(found[f], `${step} [전체 부서 보기]에 「${f}」`);
    if (found[f]) await loc.scrollIntoViewIfNeeded().catch(() => {});
  }
  await shot(s.page, name);
  scene({ step, key: "SOP", kind: "SOP", account: s.acc, bar: bar.slice(0, 200), next: nexts, found });
}

/** 「기준지역 변경」 확인 창(R47 — 바꿀 때마다)에서 새 대화로 — 창의 글을 돌려준다(없으면 null) */
async function confirmBase(page) {
  const dlg = page.getByRole("alertdialog", { name: "기준지역 변경" });
  if (!(await dlg.waitFor({ timeout: 4000 }).then(() => true, () => false))) return null;
  const t = ((await dlg.textContent()) ?? "").replace(/\s+/g, " ").trim();
  await dlg.getByRole("button", { name: "새 대화로 시작" }).click();
  return t;
}
async function setSigungu(page, label) {
  await page.getByRole("combobox", { name: "기준지역 시·군·구" }).selectOption(label === "" ? { value: "" } : { label });
  return confirmBase(page);
}
const pickedLabel = (page, name) => page.getByRole("combobox", { name }).evaluate((e) => e.selectedOptions[0]?.textContent?.trim() ?? "").catch(() => "");
/** 기준지역 = 계정 기본(시·도 · 시·군·구 — null 이면 시·군·구 전체) */
async function ensureBase(s, sido, sigungu) {
  await s.page.getByRole("combobox", { name: "기준지역 시·도" }).waitFor({ timeout: 30000 });
  if ((await pickedLabel(s.page, "기준지역 시·도")) !== sido) {
    await s.page.getByRole("combobox", { name: "기준지역 시·도" }).selectOption({ label: sido });
    await confirmBase(s.page);
    await s.page.waitForTimeout(1500);
  }
  const sg = s.page.getByRole("combobox", { name: "기준지역 시·군·구" });
  const cur = (await sg.count()) ? await sg.inputValue() : "";
  if (sigungu ? (await pickedLabel(s.page, "기준지역 시·군·구")) !== sigungu : cur !== "") {
    await setSigungu(s.page, sigungu ?? "");
    await s.page.waitForTimeout(1500);
  }
}

const admin = await session("admin01");
const sessions = [];
try {
  // ── ① 부산 시연 계정 브리핑 4번 ──
  const bs = await session("bs_safety01");
  sessions.push(bs);
  const briefPage = async () => {
    const kv = bs.page.waitForResponse((r) => r.url().includes("/api/kv?scope=acct:"), { timeout: 30000 }).catch(() => null);
    await bs.page.goto(base + "/settings/briefing");
    await kv;
    await bs.page.getByRole("button", { name: "+ 항목 추가" }).waitFor({ timeout: 30000 });
    await bs.page.waitForTimeout(500);
  };
  const briefRows = () => bs.page.$$eval("table.tbl tbody tr", (trs) => trs.map((tr) => ({ on: tr.querySelector("input[type=checkbox]")?.checked, label: tr.querySelector("input[aria-label='항목 이름']")?.value, q: tr.querySelector("input[aria-label='질의문']")?.value })));
  await briefPage();
  await bs.page.getByRole("button", { name: "기본 항목으로 되돌리기" }).click();
  await bs.page.getByRole("alertdialog", { name: "기본 항목으로 되돌리기" }).getByRole("button", { name: "되돌리기" }).click();
  await bs.page.getByRole("button", { name: "+ 항목 추가" }).click();
  const rows = bs.page.locator("table.tbl tbody tr");
  const n = await rows.count();
  await rows.nth(n - 1).getByLabel("항목 이름").fill(BRF4_LABEL);
  await rows.nth(n - 1).getByLabel("질의문").fill(BRF4);
  // BR-04(행동매뉴얼 — 기본 4번째) 체크 해제
  await rows.nth(3).locator("input[type=checkbox]").uncheck();
  const put = bs.page.waitForResponse((r) => r.url().includes("/api/kv") && r.request().method() === "PUT", { timeout: 30000 }).catch(() => null);
  await bs.page.getByRole("button", { name: "저장", exact: true }).click();
  await put;
  await briefPage();
  const saved = await briefRows();
  result.ops.brief = saved;
  const on = saved.filter((x) => x.on);
  ok(on.length === 4 && on.at(-1)?.label === BRF4_LABEL && on.at(-1)?.q === BRF4, `① 브리핑 항목(다시 읽음) — ${saved.map((x) => `${x.on ? "☑" : "☐"}${x.label}`).join(" · ")}`);
  await shot(bs.page, "01_brief_settings");

  // ── ② 시나리오 켜기(운영관리 화면 — 세 지역, 끝나는 시각 6시간 뒤) ──
  await admin.page.goto(base + "/admin?tab=demo");
  await admin.page.getByRole("heading", { name: "시연 시나리오 특보" }).waitFor({ timeout: 30000 });
  await admin.page.locator(".adm-scn .badge", { hasText: /켜짐|꺼짐/ }).waitFor({ timeout: 30000 });
  const scnSec = admin.page.locator("section[aria-label='시연 시나리오 특보']");
  for (const cb of await scnSec.locator("tbody input[type=checkbox]").all()) await cb.check();
  const u = new Date(Date.now() + 6 * 3600_000);
  const pad = (x) => String(x).padStart(2, "0");
  await scnSec.locator("input[type=datetime-local]").fill(`${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}T${pad(u.getHours())}:${pad(u.getMinutes())}`);
  await scnSec.getByRole("button", { name: /시나리오 켜기|지역·끝나는 시각 저장/ }).click();
  await admin.page.locator(".adm-scn .badge", { hasText: "켜짐" }).waitFor({ timeout: 20000 });
  await admin.page.waitForTimeout(800);
  result.ops.scenario = await text(admin.page, ".adm-scn[role=status]");
  ok(/켬 · .*저절로 꺼짐/.test(result.ops.scenario) && (result.ops.scenario.match(/·/g) ?? []).length >= 3, `② 시나리오 「${result.ops.scenario}」`);
  await shot(admin.page, "02_admin_scenario_on");

  // ── ③ 시연 세트 예열 시작 → ⑤ 진행 중 0(작업 상태는 API 로 — 운영관리 화면은 열어 둔 채 대기 문항을 차례로 보낸다) ──
  let warmRes = null;
  admin.page.on("response", async (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/admin/warm/demo") warmRes = await r.json().catch(() => null);
  });
  const tw = Date.now();
  await admin.page.getByRole("button", { name: "시연 세트 예열 시작" }).click();
  await until(() => warmRes, 120_000);
  const ids = (warmRes?.items ?? []).map((i) => i.job?.id).filter(Boolean);
  for (;;) {
    const st = await Promise.all(ids.map((id) => getJob(admin.page, id).then((j) => j?.state, () => null)));
    const act = st.filter((x) => !x || ACTIVE.includes(x)).length;
    if (!act || Date.now() - tw > 40 * 60_000) break;
    console.log(`    예열 진행 중 ${act}/${ids.length} · ${sec(Date.now() - tw)}초`);
    await sleep(15_000);
  }
  const warmSec = sec(Date.now() - tw);
  await admin.page.waitForTimeout(6000);
  const summary = (await admin.page.locator("section.adm-sec h2", { hasText: "예열 항목" }).locator("small").textContent().catch(() => "")) ?? "";
  const items = [];
  for (const it of warmRes?.items ?? []) {
    const j = it.job?.id ? await getJob(admin.page, it.job.id).catch(() => null) : null;
    items.push({ region: it.region, kind: it.kind, itemId: it.itemId, scene: it.scene, title: it.title, outcome: it.outcome, warnings: it.warnings ?? null, jobId: it.job?.id ?? null, state: j?.state ?? it.job?.state ?? null, t3qStatus: j?.t3q_status ?? null, elapsedSec: sec(j?.elapsed_ms ?? null), sourceFinishedAt: it.sourceFinishedAt ?? null, error: it.error ?? null });
  }
  result.warm = { summary, wallSec: warmSec, items };
  const bad = items.filter((i) => i.state !== "DONE" || !["SUCCESS", "PARTIAL_SUCCESS"].includes(i.t3qStatus ?? ""));
  ok(items.length === 18 && !bad.length, `③⑤ 시연 세트 예열 ${items.length}건 · 화면 「${summary}」 · 걸린 시간 ${warmSec}초${bad.length ? ` · 문제 ${bad.map((b) => `${b.itemId}(${b.state}/${b.t3qStatus}${b.error ? ` ${b.error}` : ""})`).join(", ")}` : ""}`);
  for (const i of items) console.log(`    ${String(i.scene).padEnd(5)} ${i.kind === "BRIEFING" ? `브리핑 ${i.title}` : i.itemId} — ${i.outcome} · ${i.state}/${i.t3qStatus} · 처리 ${i.elapsedSec}초${i.warnings ? ` · 특보 ${i.warnings.join(",") || "없음"}` : ""}`);
  ok(items.filter((i) => i.kind === "BRIEFING").length === 4 && items.filter((i) => i.kind === "BRIEFING").every((i) => i.warnings?.join() === "SCN-BS-1"), "③ 브리핑 4줄 「특보 SCN-BS-1」");
  await shot(admin.page, "03_admin_warm_done");

  // ── ④ 특보 줄(세 시연 계정) · 무대 전 정리(기준지역 = 계정 기본 · AI 모드 끔 · 조건 비움) ──
  const ij = await session("ij_safety01");
  const yc = await session("yc_safety02");
  sessions.push(ij, yc);
  const STAGE = {
    bs_safety01: { sido: "부산광역시", sigungu: null, wx: "부산 호우경보 발효 중" },
    ij_safety01: { sido: "강원특별자치도", sigungu: "인제군", wx: "강원도(인제평지, 인제산지) 호우주의보 발효 중" },
    yc_safety02: { sido: "경상북도", sigungu: "영천시", wx: "경상북도(영천) 호우경보 발효 중" },
  };
  for (const s of [bs, ij, yc]) {
    await s.page.goto(base + "/explore");
    await s.page.locator(".wxbar .tit").waitFor({ timeout: 30000 });
    if (await s.page.locator(".ai-pill.on").count()) await s.page.locator(".ai-pill").click();
    await ensureBase(s, STAGE[s.acc].sido, STAGE[s.acc].sigungu);
    await s.page.waitForFunction(() => !/확인하고 있습니다/.test(document.querySelector(".wxbar .tit")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    const bar = await text(s.page, ".wxbar");
    const meta = await text(s.page, ".wxbar .meta");
    ok(bar.includes(STAGE[s.acc].wx) && bar.includes(SCN) && /^\d\d:\d\d 켬 · 기상청 실시간 특보 끊음$/.test(meta), `④ ${s.acc} 특보 줄 「${bar.slice(0, 90)}」 · 갱신 칸 「${meta}」`);
    const cond = await text(s.page, ".cmp-cond");
    ok(/재난유형 전체/.test(cond) && /상황 상세정보 0개/.test(cond), `${s.acc} 입력창 조건 비움 「${cond.slice(0, 80)}」`);
  }

  // ── 부산 ──
  await aimOn(bs, "AIM-BS", "1");
  await shot(bs.page, "04_bs_aimode");
  // 단계 2 — AI 모드 창 [브리핑 시작] (예열 4항목)
  const nb = bs.posts.length;
  const tb = Date.now();
  await bs.page.locator(".modal.aim").getByRole("button", { name: /브리핑 시작/ }).click();
  await until(() => bs.posts.slice(nb).filter((p) => p.source === "BRIEFING").length >= 4, 60_000);
  await bs.page
    .waitForFunction(() => {
      const st = [...document.querySelectorAll(".bb-cells .bb-st")];
      return st.length >= 4 && st.every((e) => /\b(done|part)\b/.test(e.className));
    }, null, { timeout: 300_000 })
    .catch(() => console.log("  (브리핑 현황 기다림 시간 넘음)"));
  const briefShown = Date.now() - tb;
  const bps = bs.posts.slice(nb).filter((p) => p.source === "BRIEFING");
  const cells = await bs.page.$$eval(".bb-cells .bb-cell", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  // 네 항목을 동시에 보내 접수 응답 순서가 섞인다 — 파일 이름은 요청의 항목 번호(briefing.item_no)로
  for (const p of bps) if (p.job?.id) await dump(bs, (j) => (j.request?.briefing?.item_no ? `BRF-BS-${j.request.briefing.item_no}` : null), p.job.id);
  scene({ step: "2", key: "BRF-BS", kind: "WARM", account: bs.acc, shownSec: sec(briefShown), reused: bps.map((p) => !!p.job?.cached_from), warnings: bps.map((p) => p.warnings?.items?.map((i) => i.warning_key).join() ?? null), cells });
  ok(bps.length === 4 && bps.every((p) => p.job?.cached_from) && briefShown < 20_000, `2 브리핑 4항목 — 재사용 ${bps.filter((p) => p.job?.cached_from).length}/4 · 화면 ${sec(briefShown)}초 · ${cells.join(" / ").slice(0, 200)}`);
  await shot(bs.page, "05_bs_brief_board");
  // 단계 3·6 — 대응절차
  await sopCheck(bs, "3·6", { next: ["7-1 기상특보 접수", "8-1 기상특보 상황보고(시장, 부시장)"], find: ["16-1"] }, "06_bs_sop");
  // 단계 5 — BS-02 실시간
  await clickDemo(bs, "BS-02", "5", "호우경보 때 지하차도 차단시설·설비", { live: true });
  await shot(bs.page, "07_bs_BS-02_live");
  await clickDemo(bs, "BS-04", "7", "초량동·문현동 침수흔적");
  await clickDemo(bs, "BS-05", "8", "2020년 7월 집중호우 — 재해연보 쪽·특보·문자");
  await clickDemo(bs, "BS-06", "9", "2023년 9월 16일 호우경보 — 대피·통제 문자");
  await shot(bs.page, "08_bs_BS-06");
  // 단계 10 — 기준지역 동구: 「기준지역 변경」 확인 창(R47 — AI 모드를 켜 두었으므로 종료 안내 + 새 대화 두 줄) → AI 모드 꺼짐 · 새 대화(새 지역 점검 없음) → BS-07(예열 — 기준지역 동구)
  const nd = bs.posts.length;
  const td = Date.now();
  const dlg = await setSigungu(bs.page, "동구");
  ok(!!dlg && dlg.includes("1. 기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.") && dlg.includes("2. 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다."), `10 확인 창 「${dlg}」`);
  await bs.page.waitForTimeout(2500);
  const aimLeft = await bs.page.locator(".ai-pill.on").count();
  ok(aimLeft === 0 && !(await bs.page.locator(".aim-bar").count()) && !bs.posts.slice(nd).some((p) => p.source === "AI_MODE"), "10 동구로 바꾼 뒤 AI 모드 꺼짐 · 띠 없음 · 새 지역 점검 없음(R47)");
  const dongBar = await text(bs.page, ".wxbar");
  ok(dongBar.includes("부산 호우경보 발효 중") && dongBar.includes(SCN), `10 동구 특보 줄 「${dongBar.slice(0, 90)}」`);
  const bs07 = await clickDemo(bs, "BS-07-v3", "10", "초량동 침수흔적 안 지하층 주택");
  scene({ step: "10", key: "BASE-DONGGU", kind: "BASE", account: bs.acc, dialog: dlg, aimOff: aimLeft === 0, baseChangeSec: sec(Date.now() - td - (bs07.shownSec ?? 0) * 1000) });
  await shot(bs.page, "09_bs_BS-07_donggu");

  // ── 인제 ──
  await aimOn(ij, "AIM-IJ", "11-0");
  await ij.page.locator(".modal.aim").getByRole("button", { name: "접기", exact: true }).click().catch(() => {});
  await clickDemo(ij, "IJ-01", "11", "급경사지 D·E등급과 안전점검");
  await clickDemo(ij, "IJ-02", "12", "호우주의보 때 진동리 숙박·야영장");
  await sopCheck(ij, "13", { find: ["40-6"] }, "10_ij_sop");
  await clickDemo(ij, "IJ-04", "13-1", "진동리 과거 호우·태풍 피해");
  await clickDemo(ij, "IJ-05", "14", "2020년 9월 태풍 때 특보·문자");
  await clickDemo(ij, "IJ-05-R", "14", "2023년 9월 16일 이후 계곡·급경사지 통제 문자", { live: true });
  await clickDemo(ij, "IJ-07-R", "15", "2020년 9월 태풍 피해액·복구비 합계와 근거 쪽");
  await shot(ij.page, "11_ij_IJ-07-R");

  // ── 영천 ──
  await aimOn(yc, "AIM-YC", "16-0");
  await yc.page.locator(".modal.aim").getByRole("button", { name: "접기", exact: true }).click().catch(() => {});
  await clickDemo(yc, "YC-01-v3", "16", "소하천이 있는 미해제 위험지구");
  await clickDemo(yc, "YC-02", "17", "호우경보 때 북안면·신녕면·화북면 재해위험저수지", { live: true });
  await clickDemo(yc, "YC-04", "18", "힌남노 때 북안면 피해·복구");
  await clickDemo(yc, "YC-05", "18-1", "힌남노 때 홍수특보·문자");
  await clickDemo(yc, "YC-06", "18-1", "2024년 7월 10일 홍수특보 시간표");
  await clickDemo(yc, "YC-09", "19", "북안명주·대평지·용계리 소하천 비교 표");
  await shot(yc.page, "12_yc_YC-09");
} catch (e) {
  ok(false, `리허설 중단 — ${e?.message ?? e}`);
} finally {
  // ⑦ 끝 — AI 모드 끄기(10분 재점검 멈춤) · 시나리오 끄기 · 부산 브리핑 항목 기본으로
  for (const s of sessions) if (await s.page.locator(".ai-pill.on").count().catch(() => 0)) await s.page.locator(".ai-pill").click().catch(() => {});
  const off = await admin.page.evaluate(async () => (await fetch("/api/admin/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: false }) })).json()).catch((e) => ({ error: String(e) }));
  console.log("  끝 — 시나리오 꺼짐:", off?.live === false ? "확인" : JSON.stringify(off));
  const bs = sessions.find((s) => s.acc === "bs_safety01");
  if (bs) {
    const kv = bs.page.waitForResponse((r) => r.url().includes("/api/kv?scope=acct:"), { timeout: 30000 }).catch(() => null);
    await bs.page.goto(base + "/settings/briefing").catch(() => {});
    await kv;
    const reset = await bs.page.getByRole("button", { name: "기본 항목으로 되돌리기" }).click({ timeout: 30000 }).then(() => true, () => false);
    if (reset) {
      await bs.page.getByRole("alertdialog", { name: "기본 항목으로 되돌리기" }).getByRole("button", { name: "되돌리기" }).click().catch(() => {});
      const put = bs.page.waitForResponse((r) => r.url().includes("/api/kv") && r.request().method() === "PUT", { timeout: 30000 }).catch(() => null);
      await bs.page.getByRole("button", { name: "저장", exact: true }).click().catch(() => {});
      await put;
    }
    console.log("  끝 — 부산 브리핑 항목 기본으로:", reset ? "확인" : "못 함");
  }
  result.finishedAt = new Date().toISOString();
  result.errors = errors;
  writeFileSync(join(recDir, "_result.json"), JSON.stringify(result, null, 2));
  console.log(`결과 ${join(recDir, "_result.json")}`);
}
console.log("페이지 오류", errors.length ? errors : "없음");
await browser.close();
