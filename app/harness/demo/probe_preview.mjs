// 시연 세트 자동 조회 실측 — demo_questions.json 문항마다 preview 종류의 T3Q Data API 를 앱(preview.ts runPreview)과 같은
// 경로·본문으로 불러 응답 시간(ms)·건수(result.total_count)·HTTP 상태를 잰다. 한 문항의 호출은 동시에(앱 Promise.all),
// 문항은 하나씩 차례로, 같은 순서로 여러 바퀴. 시간 제한 8초(앱과 같음). 에이전트 질의(POST /agent/query)는 보내지 않는다.
// 토큰·주소는 app/.env.local 에서 읽기만 하고 출력·기록하지 않는다.
// node harness/demo/probe_preview.mjs [--rounds 2] [--gap 300] [--only BS-1,IJ-2]
//   → harness/recordings/demo_preview_<ts>.json (요청·결과, 원응답은 1차만) · 전체 실행이면 docs/renewal/analysis/demo_day/F_preview_latency.md
// node harness/demo/probe_preview.mjs --from harness/recordings/demo_preview_<ts>.json — T3Q 를 부르지 않고 그 원자료로 문서만 다시 쓴다
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { APP, loadEnv, sleep } from "../t3q/client.mjs";
import { checkDemo, loadDemo, previewCalls, previewSpecDrift, printCheck } from "./demo_set.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
let rounds = Math.max(1, Math.floor(Number(arg("rounds", 2))) || 1);
let gapMs = Math.max(0, Number(arg("gap", 300)) || 0);
let only = String(arg("only", "")).split(",").filter(Boolean);
const from = arg("from", "");
const TIMEOUT_MS = 8000;

const all = loadDemo();
let checks = checkDemo(all);
if (printCheck(checks)) {
  console.error("demo_questions.json 모양 검사(필수)에 걸려 재지 않는다");
  process.exit(1);
}
let drift = previewSpecDrift();
console.log(drift.length ? `× preview.ts 와 다른 곳: ${drift.join(" · ")}` : "○ 자동 조회 본문 = preview.ts SPEC(글자 대조)");
/** app/src/lib/t3q/client.ts 와 같은 머리글(매번 새 X-Request-Id)·본문. ms = 보낸 때부터 본문을 다 받은 때까지 */
async function call({ base, token }, path, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", "X-Request-Id": randomBytes(16).toString("hex") },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 본문이 JSON 이 아님 */ }
    return { http: r.status, ms: Date.now() - t0, json };
  } catch (e) {
    return { http: 0, ms: Date.now() - t0, json: null, error: e?.name === "TimeoutError" ? "시간 초과(8초)" : "연결 실패" };
  }
}

/** 잰다 — 문항 차례로, 한 문항의 호출은 동시에, rounds 바퀴 */
async function measure(items) {
  const env = loadEnv();
  const calls = [];
  const perQ = [];
  for (let round = 1; round <= rounds; round++) {
    for (const x of items) {
      const plan = previewCalls(x);
      if (!plan.length) {
        perQ.push({ round, id: x.id, maxMs: null, wallMs: null });
        continue;
      }
      const t0 = Date.now();
      const res = await Promise.all(plan.map((p) => call(env, p.path, p.body)));
      const wallMs = Date.now() - t0;
      res.forEach((r, i) => {
        const p = plan[i];
        const list = r.json?.result?.items;
        const target = p.kind === "SIMILAR_EVENT" ? x.target_event?.id ?? null : null;
        const rank = target && Array.isArray(list) ? list.findIndex((it) => it?.event_master_id === target) + 1 : null;
        const c = {
          round, id: x.id, region: x.region, kind: p.kind, apiId: p.apiId, path: p.path, body: p.body,
          http: r.http, ms: r.ms, error: r.error ?? null, status: r.json?.status ?? null, t3qMs: r.json?.meta?.elapsed_ms ?? null,
          total: r.json?.result?.total_count ?? null, rows: Array.isArray(list) ? list.length : null,
          gaps: Array.isArray(r.json?.data_gaps) ? r.json.data_gaps.length : null, warns: Array.isArray(r.json?.warnings) ? r.json.warnings.length : null,
          target, rank,
        };
        if (round === 1) c.response = r.json;
        calls.push(c);
        console.log(`${round}차 ${x.id.padEnd(6)} ${p.kind.padEnd(13)} ${String(r.http).padStart(3)} ${String(c.status ?? c.error).padEnd(15)} ${String(r.ms).padStart(5)}ms 건수=${c.total ?? "-"}${target ? ` 목표 사건 ${rank || "없음"}위` : ""}`);
      });
      perQ.push({ round, id: x.id, maxMs: Math.max(...res.map((r) => r.ms)), wallMs });
      if (gapMs) await sleep(gapMs);
    }
  }
  return { calls, perQ };
}

let startedAt, finishedAt, calls, perQ, recRel;
if (from) {
  // 원자료로 문서만 다시 쓴다(T3Q 를 부르지 않음) — 문항 정보는 지금의 demo_questions.json
  const recPath = isAbsolute(from) ? from : join(APP, from);
  const rec = JSON.parse(readFileSync(recPath, "utf8"));
  ({ calls, perQuestion: perQ, rounds, gapMs } = rec);
  only = rec.only ?? [];
  checks = rec.checks ?? checks;
  drift = rec.specDrift ?? drift;
  startedAt = new Date(rec.startedAt);
  finishedAt = new Date(rec.finishedAt);
  recRel = relative(APP, recPath).replace(/\\/g, "/");
} else {
  startedAt = new Date();
  ({ calls, perQ } = await measure(only.length ? all.filter((x) => only.includes(x.id)) : all));
  finishedAt = new Date();
  recRel = `harness/recordings/demo_preview_${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  mkdirSync(join(APP, "harness", "recordings"), { recursive: true });
  writeFileSync(join(APP, recRel), JSON.stringify({ startedAt, finishedAt, rounds, gapMs, timeoutMs: TIMEOUT_MS, source: "harness/cq/demo_questions.json", only, specDrift: drift, checks, calls, perQuestion: perQ }, null, 1));
  console.log("원자료", join(APP, recRel));
}
if (only.length) {
  console.log("--only 실행이라 F_preview_latency.md 는 쓰지 않는다");
  process.exit(0);
}
const items = all;

// ── F_preview_latency.md ──
const KST = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const REG = { busan: "부산", inje: "인제", yeongcheon: "영천" };
const LABEL = { RISK_AREA: "위험·취약지역 목록(T3Q-05)", RISK_FACILITY: "잠재 위험요소·취약시설 목록(T3Q-05)", FLOOD_TRACE: "침수흔적 목록(T3Q-30)", SIMILAR_EVENT: "유사재난 사례(T3Q-04)", PLAN: "계획문서 목록(T3Q-06)" };
const R = Array.from({ length: rounds }, (_, i) => i + 1);
const n = (v) => (v == null ? "-" : Number(v).toLocaleString("ko-KR"));
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const median = (a) => {
  const s = a.filter((v) => v != null).sort((p, q) => p - q);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const max = (a) => { const s = a.filter((v) => v != null); return s.length ? Math.max(...s) : null; };
const st = (c) => (c.http === 0 ? `0 ${c.error}` : `${c.http} ${c.status ?? "(봉투 아님)"}`);
const inRound = (arr, r) => arr.filter((c) => c.round === r);
const same = (vals) => vals.every((v) => v === vals[0]);
const groupBy = (arr, f) => arr.reduce((m, v) => m.set(f(v), [...(m.get(f(v)) ?? []), v]), new Map());

const byQK = groupBy(calls, (c) => `${c.id}|${c.kind}`);
const qIds = items.map((x) => x.id);
const withPreview = items.filter((x) => previewCalls(x).length);
const noPreview = items.filter((x) => !previewCalls(x).length).map((x) => x.id);
const waitBand = (ms) => (ms == null ? null : ms <= 1000 ? "≤1초" : ms <= 2000 ? "1~2초" : "2초 넘음");

const lines = [];
const out = (...l) => lines.push(...l);
out(
  "# F. 자동 조회 데이터 응답 시간 — 시연 세트 실측",
  "",
  `> ${KST(startedAt)}~${KST(finishedAt).slice(11)} (KST) 실측 · ${rounds}바퀴 · 스크립트 \`app/harness/demo/probe_preview.mjs\` · 원자료 \`app/${recRel}\``,
  "",
  "## 잰 방법",
  "",
  `- 대상: \`app/harness/cq/demo_questions.json\` ${items.length}문 가운데 자동 조회(\`preview\`)가 있는 ${withPreview.length}문, 문항 × 종류 ${byQK.size}건/바퀴.${noPreview.length ? ` 자동 조회 없는 문항: ${noPreview.join("·")}.` : ""}`,
  "- 요청: 종류마다 `app/src/lib/server/preview.ts` SPEC 과 같은 경로·본문. 지역은 문항 지역(부산광역시 SIDO · 강원특별자치도 인제군 SIGUNGU · 경상북도 영천시 SIGUNGU), 유사재난은 문항 query_context 전체(재난유형·기간·키워드·특보·조건, 조건 원소 source_type MANUAL).",
  `- 복제 확인: ${drift.length ? `preview.ts 와 다른 곳 — ${drift.join(" · ")}` : "preview.ts 의 SPEC 다섯 줄·지역 없을 때 거르는 줄·시간 제한 8초가 하네스(`app/harness/demo/demo_set.mjs`)와 글자 그대로 같다(실행 때 대조)"}.`,
  `- 방식: 한 문항의 호출은 동시에(앱 \`runPreview\` 의 Promise.all), 문항은 하나씩 차례로(사이 ${gapMs / 1000}초), 같은 순서로 ${rounds}바퀴. 시간 제한 8초(앱과 같음 — 넘으면 앱의 그 조회 카드는 오류 상태로 행 없이 뜬다). 매 호출 새 X-Request-Id(앱 클라이언트와 같음).`,
  "- ms = 이 PC 에서 보낸 때부터 응답 본문을 다 받은 때까지(앱 `t3q()` 의 ms 와 같은 재기). 「T3Q 처리」 = 응답 `meta.elapsed_ms`. 앱은 배포 서버에서 부르므로 네트워크 몫은 다를 수 있다.",
  "- 같은 지역·종류의 목록 조회는 여러 문항이 같은 본문을 보낸다(아래 4장). 에이전트 질의(POST /agent/query)는 보내지 않았다.",
  "",
  "## 1. 요약",
  "",
  `| 항목 | ${R.map((r) => `${r}차`).join(" | ")} |`,
  `|---|${R.map(() => "---").join("|")}|`,
  `| 호출 | ${R.map((r) => inRound(calls, r).length).join(" | ")} |`,
  `| HTTP 200 · 그 밖 · 시간 초과/연결 실패 | ${R.map((r) => { const a = inRound(calls, r); return `${a.filter((c) => c.http === 200).length} · ${a.filter((c) => c.http && c.http !== 200).length} · ${a.filter((c) => !c.http).length}`; }).join(" | ")} |`,
  `| 봉투 상태 | ${R.map((r) => [...groupBy(inRound(calls, r), (c) => c.status ?? c.error ?? "(봉투 아님)")].map(([k, v]) => `${k} ${v.length}`).join(" · ")).join(" | ")} |`,
  `| 호출 1회 ms 중앙값 · 최대 | ${R.map((r) => { const a = inRound(calls, r).map((c) => c.ms); return `${n(median(a))} · ${n(max(a))}`; }).join(" | ")} |`,
  `| T3Q 처리 ms 중앙값 · 최대 | ${R.map((r) => { const a = inRound(calls, r).map((c) => c.t3qMs); return `${n(median(a))} · ${n(max(a))}`; }).join(" | ")} |`,
  `| 문항 기다림(그 문항 호출 가운데 가장 느린 것) 중앙값 · 최대 | ${R.map((r) => { const a = inRound(perQ, r).map((q) => q.maxMs); return `${n(median(a))} · ${n(max(a))}`; }).join(" | ")} |`,
  `| 문항 기다림 ≤1초 · 1~2초 · 2초 넘음 | ${R.map((r) => { const a = inRound(perQ, r).map((q) => waitBand(q.maxMs)).filter(Boolean); return `${a.filter((b) => b === "≤1초").length} · ${a.filter((b) => b === "1~2초").length} · ${a.filter((b) => b === "2초 넘음").length}`; }).join(" | ")} |`,
  "",
  "### 종류별(모든 바퀴)",
  "",
  "| 자동 조회 | 문항 수 | 호출 | ms 중앙값 | ms 최대 | T3Q 처리 ms 중앙값 | 건수(total_count) 범위 |",
  "|---|---|---|---|---|---|---|",
  ...Object.keys(LABEL).filter((k) => calls.some((c) => c.kind === k)).map((k) => {
    const a = calls.filter((c) => c.kind === k);
    const tot = a.map((c) => c.total).filter((v) => v != null);
    return `| ${k} ${LABEL[k]} | ${new Set(a.map((c) => c.id)).size} | ${a.length} | ${n(median(a.map((c) => c.ms)))} | ${n(max(a.map((c) => c.ms)))} | ${n(median(a.map((c) => c.t3qMs)))} | ${tot.length ? `${n(Math.min(...tot))}~${n(Math.max(...tot))}` : "-"} |`;
  }),
  "",
  "## 2. 문항 × 자동 조회",
  "",
  "건수 = 응답 `result.total_count`(전체 건수), 받은 행 = 이번에 받은 `items` 수(앱 쪽수 50·20). 목표 사건 순위 = 문항 `target_event.id` 가 유사재난 목록(20건)의 몇 번째인지(괄호는 설계 때 잰 순위 `rank_probe`).",
  "",
  `| id | 지역 | preview | ${R.map((r) => `ms ${r}차`).join(" | ")} | T3Q 처리 ms(1차) | 건수 | 받은 행 | 상태 | 목표 사건 순위 |`,
  `|---|---|---|${R.map(() => "---").join("|")}|---|---|---|---|---|`,
);
for (const x of items) {
  const plan = previewCalls(x);
  if (!plan.length) {
    out(`| ${x.id} | ${REG[x.region] ?? x.region} | (없음) | ${R.map(() => "-").join(" | ")} | - | - | - | 자동 조회 없음 | - |`);
    continue;
  }
  for (const p of plan) {
    const a = byQK.get(`${x.id}|${p.kind}`) ?? [];
    const c1 = a.find((c) => c.round === 1);
    const tots = a.map((c) => c.total);
    const sts = a.map(st);
    const ranks = a.map((c) => c.rank);
    const rankTxt = p.kind !== "SIMILAR_EVENT" ? "" : !x.target_event ? "(목표 없음)" : `${same(ranks) ? (ranks[0] ? `${ranks[0]}위` : "20위 안 없음") : ranks.map((v) => (v ? `${v}위` : "없음")).join("→")} (${x.target_event.rank_probe ?? "-"})`;
    out(`| ${x.id} | ${REG[x.region] ?? x.region} | ${p.kind} | ${R.map((r) => n(a.find((c) => c.round === r)?.ms)).join(" | ")} | ${n(c1?.t3qMs)} | ${same(tots) ? n(tots[0]) : tots.map(n).join("→")} | ${n(c1?.rows)} | ${same(sts) ? sts[0] : sts.join(" / ")} | ${rankTxt} |`);
  }
}
out(
  "",
  "## 3. 문항별 기다림",
  "",
  "기다림 = 그 문항의 자동 조회 호출 가운데 가장 느린 것(앱 `runPreview` 는 모두 받은 뒤 한꺼번에 돌려준다). 앱은 이 자동 조회와 작업 접수(DB 기록 + T3Q 제출, 재사용이면 DB 조회만)를 함께 기다린 뒤 접수 응답에 실어 보낸다(`app/src/app/api/agent/jobs/route.ts` 58~66행) — 화면에 뜨는 때는 이 표의 기다림보다 조금 늦을 수 있다.",
  "",
  "질문 모음 = `library_id`. 앱은 질문 모음(`app/src/lib/library.ts`) 문항으로 보낸 질문에만 자동 조회를 붙인다(`route.ts` 57~58행, 2026-10-28 소스) — 「—」 문항은 질문 모음에 넣기 전에는 앱에서 자동 조회가 뜨지 않는다.",
  "",
  `| id | 장면 | 역할 | 질문 모음 | 자동 조회 | ${R.map((r) => `기다림 ${r}차(ms)`).join(" | ")} |`,
  `|---|---|---|---|---|${R.map(() => "---").join("|")}|`,
  ...items.map((x) => `| ${x.id} | ${cell(x.scene)} | ${cell(x.role)} | ${x.library_id ?? "—"} | ${previewCalls(x).map((p) => p.kind).join("·") || "(없음)"} | ${R.map((r) => n(perQ.find((q) => q.round === r && q.id === x.id)?.maxMs)).join(" | ")} |`),
  "",
  "## 4. 응답 내용(1차, 같은 본문끼리 묶음 — 응답 글자 그대로)",
  "",
);
const firsts = inRound(calls, 1);
for (const [, group] of groupBy(firsts, (c) => `${c.kind}|${JSON.stringify(c.body)}`)) {
  const c = group[0];
  const res = c.response?.result ?? {};
  const head = `- **${REG[c.region] ?? c.region} · ${c.kind}** (${group.map((g) => g.id).join("·")}) — 건수 ${n(c.total)} · 받은 행 ${n(c.rows)} · ms ${group.map((g) => n(g.ms)).join("·")}`;
  const parts = [];
  if (Array.isArray(res.category_counts) && res.category_counts.length) parts.push(`분류별: ${res.category_counts.map((k) => `${k.category} ${n(k.count)}`).join(" · ")}`);
  if (c.kind === "PLAN" && Array.isArray(res.items)) parts.push(`계획: ${[...new Set(res.items.map((it) => it?.name).filter(Boolean))].join(" · ")}`);
  if (c.kind === "SIMILAR_EVENT" && Array.isArray(res.items)) {
    parts.push(`조건: ${cell(JSON.stringify(c.body.query_context))}`);
    parts.push(`앞 3건: ${res.items.slice(0, 3).map((it) => `${it?.display_name ?? "-"}(${it?.event_master_id ?? "-"})`).join(" · ")}`);
    if (c.target) parts.push(`목표 사건 ${c.target}: ${c.rank ? `${c.rank}위` : "20건 안에 없음"}`);
  }
  const gaps = c.response?.data_gaps;
  if (Array.isArray(gaps) && gaps.length) parts.push(`data_gaps: ${gaps.map((g) => `${g?.component ?? "-"} ${g?.reason ?? ""}`.trim()).join(" · ")}`);
  const warns = c.response?.warnings;
  if (Array.isArray(warns) && warns.length) parts.push(`warnings: ${warns.map((w) => `${w?.code ?? "-"} «${w?.message ?? ""}»`).join(" · ")}`);
  out(head, ...parts.map((p) => `  - ${cell(p)}`));
}
out(
  "",
  "## 5. demo_questions.json 모양 검사",
  "",
  "| 구분 | 규칙 | 결과 |",
  "|---|---|---|",
  ...checks.map((r) => `| ${r.level} | ${cell(r.rule)} | ${r.bad.length ? `${r.bad.length}건 — ${cell(r.bad.join(" / "))}` : "통과"} |`),
  "",
  `문항 ${all.length}개 · id 는 ${qIds.length === new Set(qIds).size ? "모두 다름" : "겹침 있음"}.`,
);
const mdPath = join(APP, "..", "docs", "renewal", "analysis", "demo_day", "F_preview_latency.md");
mkdirSync(dirname(mdPath), { recursive: true });
writeFileSync(mdPath, lines.join("\n") + "\n");
console.log("문서", mdPath);
