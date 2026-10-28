// 하네스 — 전국 기준지역(R32) 화면 확인: 머리줄 시·도/시·군·구/읍·면·동, 계정별 기본값, 특보 줄·특보로 질문·AI 모드가 기준지역을 따라감,
// 질의·응답 중 막힘, 「기준지역 변경」 확인 창(취소 = 그대로 · 새 대화로 시작 = 새 대화), 대화 이력의 기준지역 이름,
// 이력에서 다시 연 다른 기준지역의 대화(질문 → 새 대화, 접수 실패 다시 보내기 막힘), 기상청 05:00 현황(실응답 원문) 다시 보기로 「…제외」 특보.
// node harness/e2e/shots_region.mjs [baseUrl=http://localhost:3100]   → harness/reports/shots/region_*.png
// 실제 T3Q 에 질문 1건·AI 모드 점검 2건을 보내고 곧바로 취소한다(다시 연 대화의 질문은 화면 확인용으로 접수를 막아 보내지 않음).
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
let regionsBlocked = false;
let jobsBlocked = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) process.exitCode = 1;
};
const BUSY = "질의·응답이 진행 중이라 기준지역을 바꿀 수 없습니다";
const SIDO = 'select[aria-label="기준지역 시·도"]';
const SGG = 'select[aria-label="기준지역 시·군·구"]';
const EMD = 'select[aria-label="기준지역 읍·면·동"]';

/** 기상청 현황 원문(t6) → /api/weather 응답 꼴 — lib/server/kma.ts parseStatusText 와 같은 나누기(괄호 깊이 0 의 쉼표) */
const splitTop = (s) => {
  const out = [];
  let d = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") d++;
    else if (ch === ")") d = Math.max(0, d - 1);
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
function weatherOf(t6, tmFc) {
  const s = String(tmFc);
  const at = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  const advisories = [];
  for (const line of t6.replace(/\r/g, "").split(/\n|(?=o\s)/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^o\s*([가-힣]+?)(주의보|경보)\s*:\s*(.+)$/);
    if (!m) continue;
    for (const area of splitTop(m[3])) {
      const regionId = [["busan", /부산/], ["yeongcheon", /영천/], ["inje", /인제/]].find(([, re]) => re.test(area))?.[0];
      advisories.push({ id: `KMA-${m[1]}${m[2]}-${area}`.replace(/\s/g, ""), type: m[1], level: m[2], area, regionId, issuedAt: at, status: "발효" });
    }
  }
  return { mode: "live", status: { ok: true, fetchedAt: at, message: `기상청 ${at.slice(11, 16)} 발표` }, advisories, preliminary: [] };
}

async function session(acc, before) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR" });
  if (before) await before(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${acc}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${acc}: ${m.text()}`));
  // 실패한 요청은 주소와 함께(로그인 화면의 세션 확인 401·일부러 막은 목록 조회·질의 접수는 정상)
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() < 400 || (r.status() === 401 && u.pathname === "/api/auth/me") || (regionsBlocked && u.pathname === "/api/regions")) return;
    if (jobsBlocked && u.pathname === "/api/agent/jobs" && r.request().method() === "POST") return;
    errors.push(`${acc}: ${r.status()} ${r.request().method()} ${u.pathname}${u.search}`);
  });
  await page.goto(base + "/login");
  await page.getByPlaceholder("아이디를 입력하세요").fill(acc);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(pwOf(acc));
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/explore", { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `region_${name}.png`) });
  console.log("  shot", `region_${name}.png`);
};
/** 선택지가 들어올 때까지(첫 보기 「전국」·「…전체」 말고 하나 이상) */
const loaded = (page, s) => page.waitForFunction((q) => (document.querySelector(q)?.options.length ?? 0) > 1, s, { timeout: 20000 });
const value = (page, s) => page.$eval(s, (e) => e.value).catch(() => null);
const text = (page, s) => page.$eval(s, (e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "").catch(() => "");
const pick = async (page, s, v) => {
  await loaded(page, s);
  await page.selectOption(s, v);
  await page.waitForTimeout(500);
};
/** 이 계정의 진행 중 작업을 모두 취소(앱의 취소 API) — 실서버 T3Q 부하를 줄인다 */
const cancelActive = (page) =>
  page.evaluate(async () => {
    const r = await fetch("/api/agent/jobs?active=1&limit=20", { credentials: "same-origin" }).then((x) => x.json());
    const out = [];
    for (const j of r.jobs ?? []) {
      await fetch(`/api/agent/jobs/${j.id}/cancel`, { method: "POST", credentials: "same-origin" });
      out.push(`${j.source}:${j.question_user}`);
    }
    return out;
  });
const enabledAgain = (page) => page.waitForFunction((q) => document.querySelector(q) && !document.querySelector(q).disabled, SIDO, { timeout: 60000 });

// ── 1) 중앙정부(mois_dsd01) — 기본 전국, 시·도 16개 ──
const { ctx: c1, page: p } = await session("mois_dsd01");
await loaded(p, SIDO);
const sidoOpts = await p.$$eval(`${SIDO} option`, (os) => os.map((o) => o.textContent));
ok((await value(p, SIDO)) === "" && sidoOpts[0] === "전국", `중앙정부 기본 기준지역 = 전국 (${sidoOpts[0]})`);
ok(sidoOpts.length === 17, `시·도 보기 = 전국 + ${sidoOpts.length - 1}개: ${sidoOpts.slice(1).join(", ")}`);
ok((await p.$(SGG)) === null, "전국이면 시·군·구 고르기 없음");
console.log("  특보 줄:", await text(p, ".wxbar"));
await shot(p, "01_mois_default_national");

// 부산광역시 → 해운대구 → 읍·면·동 (시작 화면 — 확인 창 없이 바로)
await pick(p, SIDO, "26");
await pick(p, SGG, "26350");
const emdOpts = await (async () => { await loaded(p, EMD); return p.$$eval(`${EMD} option`, (os) => os.map((o) => o.textContent)); })();
ok(emdOpts[0] === "읍·면·동 전체" && emdOpts.length > 1, `해운대구 읍·면·동 보기 ${emdOpts.length - 1}개: ${emdOpts.slice(1).join(", ")}`);
await pick(p, EMD, "26350105");
ok((await p.$(".acm-dlg")) === null, "대화가 없으면 확인 창 없이 바로 바뀜");
ok([await value(p, SIDO), await value(p, SGG), await value(p, EMD)].join("/") === "26/26350/26350105", "부산광역시 / 해운대구 / 우동 선택됨");
const wx2 = await text(p, ".wxbar .tit");
ok(wx2.includes("부산광역시 해운대구 우동"), `특보 줄이 기준지역을 따름: ${wx2}`);
const tiles = await p.$$eval(".start-tiles .tile-q", (ts) => ts.map((t) => t.textContent));
ok(tiles.some((t) => t.includes("부산광역시 해운대구 우동")), "시작 화면 질문의 {지역} = 부산광역시 해운대구 우동");
await shot(p, "02_mois_busan_haeundae_udong");

// 제주특별자치도 — 특보 줄·특보로 질문 후보가 그 지역 특보로
await pick(p, SIDO, "50");
const wx3 = await text(p, ".wxbar");
console.log("  특보 줄(제주):", wx3);
await p.locator(".wxask button").first().click();
await p.waitForTimeout(400);
const cands = await p.$$eval(".wxpick button .ar", (bs) => bs.map((b) => b.textContent));
if (cands.length) ok(cands.every((a) => a.startsWith("제주도")), `특보로 질문 후보 = 제주 구역만: ${cands.join(", ")}`);
else {
  // 후보가 하나면 고르기 없이 바로 참조로 건다 — 그 하나 = 특보 줄의 특보
  const btn = await text(p, ".wxask button");
  const tit = await text(p, ".wxbar .tit");
  ok(btn.startsWith("참조 중 ·") && tit.startsWith("제주도"), `특보로 질문 후보 하나(바로 참조) = 제주 구역: ${tit} · ${btn}`);
}
await shot(p, "03_mois_jeju_wx_follows_base");
if (cands.length > 1) await p.locator(".wxask button").first().click();

// 부산광역시 해운대구에서 질문 1건 → 진행 중이면 고르기 막힘
await pick(p, SIDO, "26");
await pick(p, SGG, "26350");
const hm = new Date().toTimeString().slice(0, 5).replace(":", "");
await p.locator(".composer textarea").fill(`해운대구에서 침수 위험이 큰 곳은 어디인가요? (화면 확인 ${hm})`); // 아래 q1 과 같은 글
await p.getByRole("button", { name: "질의", exact: true }).click();
await p.waitForSelector(".thread .turn", { timeout: 20000 });
await p.waitForFunction((q) => document.querySelector(q)?.disabled === true, SIDO, { timeout: 20000 }).catch(() => {});
const dis = await p.$$eval(".scope select", (ss) => ss.map((s) => ({ d: s.disabled, t: s.title })));
ok(dis.length === 3 && dis.every((x) => x.d && x.t === BUSY), `질의 진행 중 — 고르기 ${dis.length}개(시·도·시·군·구·읍·면·동) 모두 막힘, 제목 「${dis[0]?.t}」`);
await shot(p, "04_busy_selects_disabled");
// 질의 취소 → 다시 고를 수 있음
await p.getByRole("button", { name: "질의 취소" }).first().click();
await enabledAgain(p);
ok(true, "질의를 취소하면 다시 고를 수 있음");

// 대화가 열린 채 시·군·구를 바꾸면 확인 창
const convTitle = await text(p, ".thread-h b");
await p.selectOption(SGG, "26500");
await p.waitForSelector(".acm-dlg", { timeout: 5000 });
const dlg = await text(p, ".acm-dlg");
ok(dlg.includes("기준지역 변경") && dlg.includes("기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.") && dlg.includes("새 대화로 시작") && dlg.includes("취소"), `확인 창: ${dlg}`);
await shot(p, "05_confirm_dialog");
await p.locator(".acm-dlg").getByRole("button", { name: "취소" }).click();
await p.waitForTimeout(500);
ok((await p.$(".acm-dlg")) === null && (await value(p, SGG)) === "26350", "취소 — 기준지역 그대로(해운대구)");
ok((await text(p, ".thread-h b")) === convTitle && (await p.$(".thread .turn")) !== null, `취소 — 같은 대화 그대로(${convTitle})`);
await shot(p, "06_cancel_keeps_base_and_conversation");
// 다시 바꾸고 「새 대화로 시작」
await p.selectOption(SGG, "26500");
await p.waitForSelector(".acm-dlg", { timeout: 5000 });
await p.locator(".acm-dlg").getByRole("button", { name: "새 대화로 시작" }).click();
await p.waitForTimeout(800);
ok((await value(p, SGG)) === "26500", "새 대화로 시작 — 기준지역 수영구로 바뀜");
ok((await p.$(".start")) !== null && (await p.$(".thread")) === null, "새 대화로 시작 — 빈 대화(시작 화면)");
await shot(p, "07_new_conversation_after_change");

// 대화 이력 — 앞 대화는 남고 기준지역 이름이 보인다(화면 안 이동 — 새로 읽으면 세션 복원 기본값으로 돌아간다)
await p.locator(".gnb").getByRole("link", { name: "대화 이력" }).click();
await p.waitForSelector(".tbl tbody tr", { timeout: 15000 });
const row1 = await text(p, ".tbl tbody tr:first-child");
ok(row1.includes("부산광역시 해운대구"), `대화 이력 첫 줄: ${row1}`);
await shot(p, "08_history_base_name");
await p.locator(".gnb").getByRole("link", { name: "통합 탐색" }).click();
await p.waitForSelector(".start", { timeout: 15000 });
ok((await value(p, SGG)) === "26500", "화면을 옮겨도 기준지역 그대로(부산광역시 수영구)");

// 이력에서 다른 기준지역(해운대구)의 대화를 다시 열고 질문 → 새 대화로(대화 하나 = 기준지역 하나).
// 질의 접수는 화면 확인용으로 막는다(T3Q 에 보내지 않음 — 2.5초 뒤 실패로 돌려줘 안내 문구를 읽을 틈을 둔다)
let posts = 0;
jobsBlocked = true;
await p.route("**/api/agent/jobs", async (r) => {
  if (r.request().method() !== "POST") return r.continue();
  posts++;
  await new Promise((res) => setTimeout(res, 2500));
  return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "화면 확인용으로 접수를 막았습니다." }) });
});
const q1 = `해운대구에서 침수 위험이 큰 곳은 어디인가요? (화면 확인 ${hm})`;
const q2 = `수영구 저지대 침수 위험은? (화면 확인 ${hm})`;
const openFromHistory = async (hasText) => {
  await p.locator(".gnb").getByRole("link", { name: "대화 이력" }).click();
  await p.waitForSelector(".tbl tbody tr", { timeout: 15000 });
  await p.locator(".tbl tbody tr", { hasText }).first().click();
  await p.waitForSelector(".thread .turn", { timeout: 15000 });
};
/** 그 글이 든 안내(토스트)가 뜰 때까지 — 앞서 뜬 다른 안내를 읽지 않게 */
const toastWith = (part) =>
  p.waitForFunction((t) => document.querySelector(".toast")?.textContent?.includes(t), part, { timeout: 5000 }).catch(() => {}).then(() => text(p, ".toast"));
/** 대화 이력의 한 줄 — 칸마다 글자(기준지역 = 5번째, 질문 수 = 6번째) */
const historyRow = (hasText) => p.locator(".tbl tbody tr", { hasText }).first().locator("td").allTextContents();
await openFromHistory(q1);
const oldTitle = await text(p, ".thread-h b");
await p.locator(".composer textarea").fill(q2);
await p.getByRole("button", { name: "질의", exact: true }).click();
const toast1 = await toastWith("새 대화로");
ok(toast1 === "기준지역이 이 대화(부산광역시 해운대구)와 달라 새 대화로 보냅니다.", `다시 연 해운대구 대화에서 질문(지금 수영구) — 안내: ${toast1}`);
const title2 = await text(p, ".thread-h b");
const turns2 = await p.$$eval(".thread .turn", (ts) => ts.length);
ok(title2 === q2 && turns2 === 1, `새 대화로 시작 — 「${title2}」 질문 ${turns2}개(앞 대화 「${oldTitle}」에 붙이지 않음)`);
await shot(p, "14_reopened_other_base_new_conversation");
await p.waitForSelector(".acard.err", { timeout: 15000 });
// 앞 대화는 그대로(질문 1개), 새 대화는 지금 기준지역 이름으로 이력에
await p.locator(".gnb").getByRole("link", { name: "대화 이력" }).click();
await p.waitForSelector(".tbl tbody tr", { timeout: 15000 });
const rowOld = await historyRow(q1);
const rowNew = await historyRow(q2);
ok(rowOld[4] === "부산광역시 해운대구" && rowOld[5] === "1", `대화 이력 — 앞 대화 그대로: 기준지역 ${rowOld[4]} · 질문 ${rowOld[5]}`);
ok(rowNew[4] === "부산광역시 수영구" && rowNew[5] === "1", `대화 이력 — 새 대화는 지금 기준지역: 기준지역 ${rowNew[4]} · 질문 ${rowNew[5]}`);

// 접수 실패한 질문이 있는 대화(수영구)를 다른 기준지역(연제구)에서 다시 열면 「다시 보내기」를 막는다(지금 기준지역으로 가게 되므로)
await p.locator(".gnb").getByRole("link", { name: "통합 탐색" }).click();
await p.waitForSelector(".start", { timeout: 15000 });
await pick(p, SGG, "26470");
ok((await value(p, SGG)) === "26470", "시작 화면에서 연제구로 바꿈");
await openFromHistory(q2);
const before = posts;
// 앞선 안내가 사라진 뒤에 누른다(앞 안내의 닫힘 시계가 새 안내를 일찍 닫지 않게 — 화면 사진에 안내가 남도록)
await p.waitForSelector(".toast", { state: "detached", timeout: 8000 }).catch(() => {});
await p.locator(".acard.err").getByRole("button", { name: "다시 보내기" }).click();
const toast2 = await toastWith("다시 보낼 수");
ok(toast2 === "기준지역이 이 대화(부산광역시 수영구)와 달라 다시 보낼 수 없습니다.", `다른 기준지역에서 다시 보내기 — 안내: ${toast2}`);
await shot(p, "15_retry_blocked_other_base");
ok(posts === before && (await p.$(".acard.err")) !== null, "다시 보내기를 보내지 않음(접수 요청 없음, 접수 실패 그대로)");
await p.getByRole("button", { name: "＋ 새 대화" }).click();
await p.waitForSelector(".start", { timeout: 15000 });
await pick(p, SGG, "26500");
await p.unroute("**/api/agent/jobs");
jobsBlocked = false;
ok((await value(p, SGG)) === "26500", "시작 화면에서 수영구로 되돌림");

// AI 모드 — 기준지역을 따르고, 바뀌면 그 지역으로 다시 점검
await p.locator(".ai-pill").click();
await p.waitForSelector(".modal.aim", { timeout: 10000 });
await p.waitForTimeout(2500);
const aim1 = await text(p, ".modal.aim");
ok(aim1.includes("부산광역시 수영구"), "AI 모드 — 부산광역시 수영구로 점검");
await shot(p, "09_aimode_suyeong");
console.log("  취소한 진행 작업:", (await cancelActive(p)).join(" | "));
await enabledAgain(p);
await p.locator(".modal.aim").getByRole("button", { name: "접기", exact: true }).click();
await p.waitForTimeout(400);
await pick(p, SIDO, "50");
await p.waitForTimeout(2500);
await p.locator(".aim-strip").click().catch(() => {});
await p.waitForSelector(".modal.aim", { timeout: 10000 });
const aim2 = await text(p, ".modal.aim");
ok(aim2.includes("제주") && !aim2.includes("부산광역시 수영구"), "AI 모드 — 기준지역을 바꾸면 제주특별자치도로 처음부터 다시 점검");
const latest = await p.evaluate(async () => (await fetch("/api/agent/jobs?limit=3", { credentials: "same-origin" }).then((x) => x.json())).jobs.filter((j) => j.source === "AI_MODE").map((j) => `${j.state}:${j.question_user}`));
ok(latest[0]?.startsWith("제공된 기상특보 정보를 기준으로"), `새 AI 모드 점검 질문(요구사항 원문): ${latest[0]?.slice(0, 40)}`);
await shot(p, "10_aimode_restarted_jeju");
console.log("  취소한 진행 작업:", (await cancelActive(p)).join(" | "));
await enabledAgain(p);
await p.getByRole("button", { name: "AI 모드 종료" }).click();
await c1.close();

// ── 2) 지자체(yc_safety02) — 기본 경상북도 영천시, 바꿀 수 있음 ──
const { ctx: c2, page: y } = await session("yc_safety02");
await loaded(y, SIDO);
await loaded(y, SGG);
ok((await value(y, SIDO)) === "47" && (await value(y, SGG)) === "47230", `지자체 기본 = 경상북도 영천시 (${await value(y, SIDO)}/${await value(y, SGG)})`);
ok(!(await y.$eval(SIDO, (e) => e.disabled)), "지자체도 고르기 가능(막히지 않음)");
console.log("  특보 줄:", await text(y, ".wxbar"));
await y.waitForSelector(".sopbar", { timeout: 15000 }).catch(() => {});
ok((await y.$(".sopbar")) !== null, "대응절차 단계 바(관할 매뉴얼) 그대로");
await shot(y, "11_yc_default_yeongcheon");
await pick(y, SIDO, "11");
await pick(y, SGG, "11110");
ok([await value(y, SIDO), await value(y, SGG)].join("/") === "11/11110", "지자체가 서울특별시 종로구로 바꿈");
const wxY = await text(y, ".wxbar .tit");
ok(wxY.includes("서울특별시 종로구"), `특보 줄: ${wxY}`);
ok((await y.$(".sopbar")) !== null, "기준지역을 바꿔도 대응절차는 관할(영천) 그대로");
await shot(y, "12_yc_changed_to_seoul_jongno");
await c2.close();

// ── 2-1) 같은 날 05:00 기상청 현황(실응답 원문 harness/region/kma_t6_samples.json cold)을 다시 보여 —
//      「경상북도(영덕, 포항, 울진평지, 경주중북부, 경주동부, 경주남부 제외)」 한파주의보 = 경북에서 그 구역을 뺀 곳: 영천시는 덮고 포항시 북구는 덮지 않는다 ──
const KMA = JSON.parse(readFileSync(join(APP, "harness", "region", "kma_t6_samples.json"), "utf8"));
const cold = KMA.samples.find((x) => x.key === "cold");
const coldBody = JSON.stringify(weatherOf(cold.t6, cold.tmFc));
const { ctx: c4, page: k } = await session("yc_safety02", (ctx) => ctx.route("**/api/weather", (r) => r.fulfill({ status: 200, contentType: "application/json", body: coldBody })));
await loaded(k, SGG);
ok((await value(k, SGG)) === "47230", "지자체 기본 = 경상북도 영천시");
const wxCold = await text(k, ".wxbar .tit");
ok(wxCold === "경상북도(영덕, 포항, 울진평지, 경주중북부, 경주동부, 경주남부 제외) 한파주의보 발효 중", `05:00 현황 — 영천시 특보 줄: ${wxCold}`);
await shot(k, "16_yc_cold0500_yeongcheon_covered");
await pick(k, SGG, "47113");
const wxPh = await text(k, ".wxbar .tit");
ok(wxPh === "경상북도 포항시 북구에 발효 중인 기상특보가 없습니다", `05:00 현황 — 포항시 북구(목록에서 뺀 곳) 특보 줄: ${wxPh}`);
await shot(k, "17_yc_cold0500_pohang_excluded");
await c4.close();

// ── 3) 목록을 받지 못하면 — 「전국」만(지어낸 보기 없음) + 짧은 안내, 다시 불러오기로 회복 ──
const { ctx: c3, page: f } = await session("mois_dsd01");
regionsBlocked = true;
await c3.route("**/api/regions**", (r) => r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "행정구역 목록을 받지 못했습니다." }) }));
await f.reload();
await f.waitForSelector(".scope-err", { timeout: 20000 });
const failOpts = await f.$$eval(`${SIDO} option`, (os) => os.map((o) => o.textContent));
ok(failOpts.length === 1 && failOpts[0] === "전국", `목록 실패 — 보기 「${failOpts.join(", ")}」만`);
const note = await text(f, ".scope-err");
ok(note.startsWith("지역 목록을 불러오지 못했습니다"), `목록 실패 안내(글자로, 툴팁 아님): ${note}`);
await shot(f, "13_list_failed_national_only");
await c3.unroute("**/api/regions**");
regionsBlocked = false;
await f.locator(".scope-err").getByRole("button", { name: "다시 불러오기" }).click();
await loaded(f, SIDO);
ok((await f.$$eval(`${SIDO} option`, (os) => os.length)) === 17 && (await f.$(".scope-err")) === null, "다시 불러오기 — 시·도 16개, 안내 사라짐");
await c3.close();

console.log("errors", errors.length ? errors.slice(0, 10) : "없음");
await browser.close();
