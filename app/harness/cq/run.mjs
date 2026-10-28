// 하네스 ④ 역량질문 배치 러너 — cq_variants.json 을 T3Q Agent(ASYNC)에 보내 원응답을 녹화하고 판정 리포트를 만든다.
// node harness/cq/run.mjs [--only A-02-v1,B-08-g] [--limit 10] [--conc 3] [--set cq|regional]
//  → harness/recordings/cq_<ts>/<id>.json (원응답 그대로) · harness/reports/cq_<ts>.md
// 판정은 검증 리포트용이다. 화면 표출과 무관(무가공 원칙).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, askAsync } from "../t3q/client.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg("only", "")?.split(",").filter(Boolean);
const limit = Number(arg("limit", 0)) || Infinity;
const conc = Number(arg("conc", 3));
const set = arg("set", "cq");

const src = set === "regional" ? "regional_questions.json" : "cq_variants.json";
let items = JSON.parse(readFileSync(join(APP, "harness", "cq", src), "utf8"));
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

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const recDir = join(APP, "harness", "recordings", `${set}_${ts}`);
mkdirSync(recDir, { recursive: true });
const rows = [];
let next = 0;
async function worker() {
  while (next < items.length) {
    const x = items[next++];
    const body = toRequest(x);
    const t0 = Date.now();
    const { question, ...rest } = body;
    const r = await askAsync(question, rest, { maxMs: 15 * 60000 });
    const res = r.final?.result ?? {};
    const j = judge(x, res.answer);
    writeFileSync(join(recDir, `${x.id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`), JSON.stringify({ id: x.id, question: x.question, request: body, final: r.final, waitedMs: r.waitedMs, timeout: !!r.timeout }, null, 2));
    rows.push({ id: x.id, status: r.timeout ? "TIMEOUT" : r.final?.status, sec: Math.round((Date.now() - t0) / 1000), len: (res.answer ?? "").length, refs: (res.refs ?? []).length, ...j, expected: x.expected_answer, prev: x.agent416_result?.grade });
    console.log(`${x.id.padEnd(12)} ${String(rows.at(-1).status).padEnd(10)} ${String(rows.at(-1).sec).padStart(4)}s refs=${rows.at(-1).refs} ${j.verdict} ${j.hits}/${j.total}`);
  }
}
await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker));

rows.sort((a, b) => a.id.localeCompare(b.id));
const cnt = (k) => rows.filter((r) => r.verdict === k).length;
const secs = rows.map((r) => r.sec).sort((a, b) => a - b);
const md = [
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
