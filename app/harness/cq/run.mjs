// 하네스 ④ 역량질문 배치 러너 — cq_variants.json 을 T3Q Agent(ASYNC)에 보내 원응답을 녹화하고 판정 리포트를 만든다.
// node harness/cq/run.mjs [--only A-02-v1,B-08-g] [--limit 10] [--conc 3] [--set cq|regional|demo] [--dry]
//  → harness/recordings/<set>_<ts>/<id>.json (원응답 그대로) · harness/reports/<set>_<ts>.md
//  --set demo: demo_questions.json(시연 「재난담당자의 하루」). 모양 검사(demo/demo_set.mjs)를 통과해야 보낸다.
//    query_context_draft 를 앱(buildQueryContext)과 같은 꼴로 그대로 보낸다 — 기간·특보 종류/단계·키워드·조건,
//    조건 원소에 source_type "MANUAL", SGG→SIGUNGU. weather_warnings·quick_query_id 는 넣지 않는다.
//  --dry: T3Q 에 보내지 않고 보낼 본문만 한 줄씩 찍는다(녹화·리포트 없음). 주의: --limit 0 은 «제한 없음»이다.
//  모르는 --set 은 오류로 끝난다.
// 판정은 검증 리포트용이다. 화면 표출과 무관(무가공 원칙).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, askAsync } from "../t3q/client.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg("only", "")?.split(",").filter(Boolean);
const limit = Number(arg("limit", 0)) || Infinity;
const conc = Number(arg("conc", 3));
const set = arg("set", "cq");
const dry = process.argv.includes("--dry");

const SETS = { cq: "cq_variants.json", regional: "regional_questions.json", demo: "demo_questions.json" };
if (typeof set !== "string" || !Object.hasOwn(SETS, set)) {
  console.error(`모르는 --set "${set}" — cq · regional · demo 가운데 하나`);
  process.exit(2);
}
const src = SETS[set];
let items = JSON.parse(readFileSync(join(APP, "harness", "cq", src), "utf8"));
// 시연 세트 모듈은 --set demo 일 때만 읽는다(cq·regional 실행은 예전 그대로)
const demo = set === "demo" ? await import("../demo/demo_set.mjs") : null;
if (demo && demo.printCheck(demo.checkDemo(items))) {
  console.error("demo_questions.json 모양 검사(필수)에 걸려 보내지 않는다");
  process.exit(1);
}
if (only?.length) items = items.filter((x) => only.includes(x.id));
items = items.slice(0, limit);

const LEVEL = { SGG: "SIGUNGU", SIDO: "SIDO", EMD: "EMD" };
/** 초안 조건 → T3Q query_context(common.py) + weather_warnings. 특보는 문서 조건 그대로 옮긴 것(가짜 아님 — 역량질문의 시험 조건) */
function toRequest(x) {
  const d = x.query_context_draft ?? {};
  const qc = {};
  if (d.reference_time) qc.reference_time = d.reference_time;
  if (d.region) qc.region = { admin_code: d.region.admin_code, name: d.region.name, level: LEVEL[d.region.level] ?? d.region.level };
  if (d.disaster_types?.length) qc.disaster_types = d.disaster_types;
  const w = d.weather_alerts?.[0];
  if (w) qc.detail = { warning_kind: w.alert_type, warning_level: w.alert_level };
  const body = { question: x.question, question_source: x.question_source ?? "USER", query_context: qc };
  if (x.quick_query_id) body.quick_query_id = x.quick_query_id;
  if (d.weather_alerts?.length)
    body.weather_warnings = { collect_status: "COLLECTED", source: "역량질문 시험 조건", items: d.weather_alerts.map((a, i) => ({ warning_key: `CQ-${x.id}-${i}`, kind: a.alert_type, level: a.alert_level, change: a.status })) };
  return body;
}
const build = demo ? demo.demoRequest : toRequest;

if (dry) {
  // askAsync 가 보내는 모양 그대로({question, response_mode, ...나머지}) — 토큰·주소는 찍지 않는다
  for (const x of items) {
    const { question, ...rest } = build(x);
    console.log(JSON.stringify({ id: x.id, body: { question, response_mode: "ASYNC", ...rest } }));
  }
  console.log(`드라이런 ${set} ${items.length}건 — T3Q 에 보내지 않았다(녹화·리포트 없음)`);
  process.exit(0);
}

const norm = (s) => String(s).replace(/[\s,]/g, "");
function judge(x, answer) {
  if (!answer) return { verdict: "NO_ANSWER", hits: 0, total: 0 };
  const exp = x.expected_answer_json;
  const vals = [];
  const walk = (v) => { if (v == null) return; if (typeof v === "object") Object.values(v).forEach(walk); else vals.push(v); };
  if (exp && typeof exp === "object") walk(exp);
  if (!vals.length) return { verdict: "HUMAN", hits: 0, total: 0 };
  const a = norm(answer);
  const hits = vals.filter((v) => a.includes(norm(typeof v === "number" ? v.toLocaleString("en-US") : v)) || a.includes(norm(v))).length;
  return { verdict: hits === vals.length ? "AUTO_PASS" : hits ? "PARTIAL" : "AUTO_MISS", hits, total: vals.length };
}

// 시연 세트 — 답 글에 근거 문서명·쪽이 적혔는지(11_demo_day.md §6.1 정규식 + 재난연감).
// 쪽은 숫자가 붙은 것만 센다(«북쪽»·«오른쪽» 같은 방향 낱말이 걸리지 않게)
const DOC_RE = /재해연보|재난연감|총괄조서|중기정비계획|중기계획|지하차도 현황|홍수취약지구 현황|급경사지정보|사면정보/g;
const PAGE_RE = /\b[pP]{1,2}\.\s?\d+(?:\s?[~-]\s?\d+)?|\d+\s?(?:쪽|페이지)/g;
const uniq = (a) => [...new Set(a ?? [])];
function demoFacts(r, res) {
  const answer = res.answer ?? "";
  return {
    elapsedMs: r.final?.meta?.elapsed_ms ?? null,
    waitedMs: r.waitedMs ?? null,
    gaps: Array.isArray(r.final?.data_gaps) ? r.final.data_gaps.length : 0,
    evRefs: Array.isArray(res.evidence_refs) ? res.evidence_refs.length : 0,
    docs: uniq(answer.match(DOC_RE)),
    pages: uniq(answer.match(PAGE_RE)).slice(0, 4),
  };
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const recDir = join(APP, "harness", "recordings", `${set}_${ts}`);
mkdirSync(recDir, { recursive: true });
const rows = [];
let next = 0;
async function worker() {
  while (next < items.length) {
    const x = items[next++];
    const body = build(x);
    const t0 = Date.now();
    const { question, ...rest } = body;
    const r = await askAsync(question, rest, { maxMs: 15 * 60000 });
    const res = r.final?.result ?? {};
    const j = judge(x, res.answer);
    writeFileSync(join(recDir, `${x.id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`), JSON.stringify({ id: x.id, question: x.question, request: body, final: r.final, waitedMs: r.waitedMs, timeout: !!r.timeout }, null, 2));
    rows.push({ id: x.id, status: r.timeout ? "TIMEOUT" : r.final?.status, sec: Math.round((Date.now() - t0) / 1000), len: (res.answer ?? "").length, refs: (res.refs ?? []).length, ...j, expected: x.expected_answer, prev: x.agent416_result?.grade });
    const row = rows.at(-1);
    if (set === "demo") {
      Object.assign(row, { scene: x.scene, role: x.role, live: x.live }, demoFacts(r, res));
      console.log(`${x.id.padEnd(7)} ${String(row.status).padEnd(15)} 처리 ${String(row.elapsedMs == null ? "-" : Math.floor(row.elapsedMs / 1000)).padStart(3)}초 · 기다림 ${String(Math.floor((row.waitedMs ?? 0) / 1000)).padStart(3)}초 · refs=${row.refs} · 문서 ${row.docs.join("·") || "-"} · 쪽 ${row.pages.join("·") || "-"}`);
    } else console.log(`${x.id.padEnd(12)} ${String(row.status).padEnd(10)} ${String(row.sec).padStart(4)}s refs=${row.refs} ${j.verdict} ${j.hits}/${j.total}`);
  }
}
await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker));

rows.sort((a, b) => a.id.localeCompare(b.id));
const cnt = (k) => rows.filter((r) => r.verdict === k).length;
const secs = rows.map((r) => r.sec).sort((a, b) => a - b);
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
/**
 * 시연 세트 리포트 — 판정 기준은 T3Q meta.elapsed_ms(11_demo_day.md §6.2: ≤85초 · 86~125초 · ≥126초).
 * elapsed_ms 는 10초 계단(예 85,499 · 125,495)이라 초는 버림으로 센다 — 반올림하면 85.5초 계단이 86초로 넘어간다
 */
function demoReport() {
  const el = rows.map((r) => r.elapsedMs).filter((v) => v != null).sort((a, b) => a - b);
  const s = (ms) => (ms == null ? "-" : Math.floor(ms / 1000));
  const band = (ms) => (ms == null ? "-" : s(ms) <= 85 ? "≤85초" : s(ms) <= 125 ? "86~125초" : "≥126초");
  const nBand = (b) => rows.filter((r) => band(r.elapsedMs) === b).length;
  return [
    `# 시연 질문(재난담당자의 하루) 실행 리포트 — ${ts}`,
    "",
    `원응답: \`harness/recordings/${set}_${ts}/\` · 동시 ${conc} · ${rows.length}건 · 요청 = 앱과 같은 query_context(조건 원소 source_type MANUAL) · weather_warnings 없음`,
    "이 러너는 T3Q 를 직접 부른다 — 앱 캐시를 채우지 않는다(예열 아님). 시간은 «예열이 빗나갔을 때 기다릴 시간»으로 읽는다.",
    "",
    `처리 시간(meta.elapsed_ms): 중앙값 ${s(el[Math.floor(el.length / 2)])}초 · 최대 ${s(el.at(-1))}초 · ≤85초 ${nBand("≤85초")}건 · 86~125초 ${nBand("86~125초")}건 · ≥126초 ${nBand("≥126초")}건 · 시간 없음 ${nBand("-")}건`,
    "",
    "| ID | 장면 | 역할 | 예상 | 상태 | 처리(초, 버림) | 구간 | 기다림(초, 버림) | 답 길이 | refs | 근거 refs | 정보 부족 | 답 글 문서명 | 답 글 쪽 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${cell(r.scene)} | ${cell(r.role)} | ${cell(r.live)} | ${r.status} | ${s(r.elapsedMs)} | ${band(r.elapsedMs)} | ${s(r.waitedMs)} | ${r.len} | ${r.refs} | ${r.evRefs} | ${r.gaps} | ${cell(r.docs.join("·"))} | ${cell(r.pages.join("·"))} |`),
    "",
    "구간은 한 번 잰 값이다. 두 번 잰 값의 차이·대조값 일치는 따로 본다(11_demo_day.md §6.2). 문서명·쪽은 답 글에서 정규식으로 찾은 글자 그대로다(맞는 쪽인지는 사람이 본다).",
  ].join("\n");
}
const md = set === "demo" ? demoReport() : [
  `# ${set === "regional" ? "지역 질문" : "역량질문 변형"} 실행 리포트 — ${ts}`,
  "",
  `원응답: \`harness/recordings/${set}_${ts}/\` · 동시 ${conc} · ${rows.length}건`,
  "",
  `| 판정 | 건수 |`, `|---|---|`,
  ...["AUTO_PASS", "PARTIAL", "AUTO_MISS", "HUMAN", "NO_ANSWER"].map((k) => `| ${k} | ${cnt(k)} |`),
  "",
  `응답 시간: 중앙값 ${secs[Math.floor(secs.length / 2)] ?? "-"}초 · 최대 ${secs.at(-1) ?? "-"}초`,
  "",
  "| ID | 상태 | 초 | 답 길이 | refs | 판정 | 일치 | 이전(416) | 정답(원문) |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.status} | ${r.sec} | ${r.len} | ${r.refs} | ${r.verdict} | ${r.hits}/${r.total} | ${r.prev ?? ""} | ${String(r.expected ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160)} |`),
  "",
  "판정: AUTO_PASS = 정답의 값이 모두 답 글에 있음 · PARTIAL = 일부 · AUTO_MISS = 하나도 없음(표기 차이일 수 있음 — 사람 확인) · HUMAN = 서술형 정답.",
].join("\n");
mkdirSync(join(APP, "harness", "reports"), { recursive: true });
writeFileSync(join(APP, "harness", "reports", `${set}_${ts}.md`), md);
console.log("리포트", join(APP, "harness", "reports", `${set}_${ts}.md`));
