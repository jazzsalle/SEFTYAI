// 데이터 재고 조사(A) 보충 조회 — probe_inventory.mjs 를 돌린 다음에 실행한다.
// 본 조회 결과를 보고 고른 9건(부산 1 · 인제 3 · 영천 5)만 더 불러 같은 JSON 의 supplement 로 붙인다.
// 지역별 합계가 30회를 넘지 않게(본 조회 부산 29 · 인제 27 · 영천 24 → 30 · 30 · 29). 동시 3. Agent 질의 없음. 토큰 출력 없음.
// 이미 한 보충 조회(라벨 기준)는 건너뛰므로 다시 돌려도 같은 조회를 두 번 보내지 않는다.
// 실행: node harness/demo/probe_inventory_extra.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, t3q } from "../t3q/client.mjs";

const OUT = join(APP, "..", "docs", "renewal", "analysis", "demo_day", "A_data_inventory.json");
const CALLER = { user_id: "U-PROBE-INVENTORY", role: "LOCAL_GOV_OFFICER" };
const doc = JSON.parse(readFileSync(OUT, "utf8"));

const PLAN = [
  { region: "busan", api: "T3Q-30", label: "침수흔적 기간 조건 2020-07-23~07-25(2020년 7월 부산 집중호우 기간)", method: "POST", path: "/flood-traces/search",
    body: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" }, period: { from: "2020-07-23", to: "2020-07-25" }, page: { page: 1, size: 100 } } },
  { region: "inje", api: "T3Q-15", label: "상세 HZ-206 송계(상남면 미산리 · 고립위험 가)", method: "GET", path: "/risk-objects/HZ-206" },
  { region: "inje", api: "T3Q-15", label: "상세 HZ-209 서화교(서화면 · 유실위험 가)", method: "GET", path: "/risk-objects/HZ-209" },
  { region: "yeongcheon", api: "T3Q-15", label: "상세 HZ-1236 북안명주(풍수해생활권 · 침수위험 가)", method: "GET", path: "/risk-objects/HZ-1236" },
  { region: "yeongcheon", api: "T3Q-15", label: "상세 HZ-1233 신대(개선지구 · 유실위험 가)", method: "GET", path: "/risk-objects/HZ-1233" },
  { region: "yeongcheon", api: "T3Q-15", label: "상세 HZ-1249 삼부(개선지구 · 침수위험 가)", method: "GET", path: "/risk-objects/HZ-1249" },
  { region: "yeongcheon", api: "T3Q-15", label: "상세 HZ-1231 가수(개선지구 · 유실위험 다)", method: "GET", path: "/risk-objects/HZ-1231" },
  // 위험·취약 대상의 근거(EV-OBJ-…)에 쪽 번호가 있는지 — 사건 근거(EV-EVT, 재해연보 쪽)와 견주기
  { region: "inje", api: "T3Q-19", label: "근거 EV-OBJ 산사태취약지역·급경사지(쪽 번호 여부)", method: "POST", path: "/evidence/search",
    body: { evidence_refs: ["EV-OBJ-LS-B-라사48749694-22-001", "EV-OBJ-SL-4281000013"], include_passage: true, page: { page: 1, size: 20 } } },
  { region: "yeongcheon", api: "T3Q-19", label: "근거 EV-OBJ 풍수해생활권·지하차도(쪽 번호 여부)", method: "POST", path: "/evidence/search",
    body: { evidence_refs: ["EV-OBJ-HZ-1245", "EV-OBJ-UP-465"], include_passage: true, page: { page: 1, size: 20 } } },
];

// 이미 한 보충 조회는 건너뛴다(다시 돌려도 같은 조회를 두 번 보내지 않게)
const done = new Set(doc.calls.filter((c) => c.label?.startsWith("[보충] ")).map((c) => c.label.slice("[보충] ".length)));
const todo = PLAN.filter((p) => !done.has(p.label));
const used = { ...doc.calls_per_region };
for (const p of todo) {
  used[p.region] = (used[p.region] || 0) + 1;
  if (used[p.region] > 30) throw new Error(`${p.region} 30회 초과 — 보충 조회 중단`);
}
PLAN.splice(0, PLAN.length, ...todo);
if (!PLAN.length) { console.log("새로 할 보충 조회 없음"); process.exit(0); }

let next = 0;
const results = new Array(PLAN.length);
async function worker() {
  while (next < PLAN.length) {
    const k = next++;
    const p = PLAN[k];
    const startedAt = new Date().toISOString();
    const r = await t3q(p.method, p.path, p.method === "GET" ? undefined : { caller: CALLER, ...p.body }, { timeoutMs: 60000 });
    const j = r.json;
    results[k] = { p, r, j, startedAt };
    console.log(`${p.region.padEnd(10)} ${p.api} ${r.http} ${String(j?.status ?? "-").padEnd(16)} ${String(r.ms).padStart(5)}ms  ${p.label}`);
  }
}
await Promise.all([worker(), worker(), worker()]);

const countBy = (arr, f) => { const m = {}; for (const x of arr || []) { const k = f(x) ?? "(없음)"; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const supplement = doc.supplement ?? { _note: "본 조회 결과를 보고 고른 보충 조회(probe_inventory_extra.mjs)", busan: [], inje: [], yeongcheon: [] };
for (const { p, r, j, startedAt } of results) {
  const res = j?.result ?? null;
  doc.calls.push({
    seq: doc.calls.length + 1, region: p.region, api: p.api, label: `[보충] ${p.label}`, method: p.method, path: p.path, request: p.body ?? null, started_at: startedAt,
    http: r.http, ms: r.ms, server_ms: j?.meta?.elapsed_ms ?? null, status: j?.status ?? null, total_count: res?.total_count ?? null,
    n_items: Array.isArray(res?.items) ? res.items.length : null, data_gaps: j?.data_gaps ?? [], warnings: (j?.warnings ?? []).map((w) => `${w.code}: ${w.message ?? ""}`.trim()), error: r.text ?? null,
  });
  const base = { api: p.api, label: p.label, http: r.http, status: j?.status ?? null, ms: r.ms, server_ms: j?.meta?.elapsed_ms ?? null, data_gaps: j?.data_gaps ?? [] };
  if (p.api === "T3Q-30") {
    const items = res?.items || [];
    supplement[p.region].push({
      ...base, request: p.body, total_count: res?.total_count ?? null,
      by_started_on: countBy(items, (i) => i.started_on), by_event_name: countBy(items, (i) => i.flood_event?.name),
      by_sigungu_code: countBy(items, (i) => String(i.admin_code || "").slice(0, 5)), causes: countBy(items, (i) => i.cause),
      area_m2_sum: Math.round(items.reduce((s, i) => s + (Number(i.area_m2) || 0), 0)),
      items: items.map((i) => ({ flood_trace_id: i.flood_trace_id, district_name: i.district_name, admin_code: i.admin_code, started_on: i.started_on, ended_on: i.ended_on, cause: i.cause, area_m2: i.area_m2, flood_hours: i.flood_hours, flood_event: i.flood_event?.name ?? null })),
    });
  } else if (p.api === "T3Q-19") {
    supplement[p.region].push({
      ...base, request: p.body, total_count: res?.total_count ?? null,
      items: (res?.items || []).map((i) => ({
        evidence_ref: i.evidence_ref, document_id: i.document_id ?? null, document_type: i.document_type ?? null, title: i.title ?? null, page: i.page ?? null, pdf_page: i.pdf_page ?? null,
        section_path: i.section_path ?? null, quote_type: i.quote_type ?? null, source_availability: i.source_availability ?? null, paragraphs_n: (i.paragraphs || []).length,
        source_row: i.source_row ?? null, table_caption: i.table?.caption ?? null, related_object_ids: i.related_object_ids ?? [],
      })),
    });
  } else {
    const rk = res?.risk || {};
    supplement[p.region].push({
      ...base, object_id: res?.object_id, category: res?.category, type: res?.type, name: res?.name, admin: res?.admin_area?.name ?? null, address: res?.address ?? null,
      designation_reason: rk.designation_reason ?? null, designated_at: rk.designated_at ?? null, area_or_length: rk.area_or_length ?? null, grade: rk.grade ?? null,
      attributes: (rk.attributes || []).map((a) => ({ label: a.label, value: a.value })), related_plans: res?.basis?.related_plans ?? [], related_documents: res?.basis?.related_documents ?? [], source: res?.source ?? null,
    });
  }
}

doc.supplement = supplement;
doc.calls_per_region = used;
const by = {};
for (const c of doc.calls) (by[c.api] ||= []).push(c);
const med = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
doc.latency_by_api = Object.fromEntries(Object.entries(by).sort().map(([api, cs]) => [api, {
  n: cs.length, ms_median: med(cs.map((c) => c.ms)), ms_min: Math.min(...cs.map((c) => c.ms ?? Infinity)), ms_max: Math.max(...cs.map((c) => c.ms ?? -Infinity)), server_ms_median: med(cs.map((c) => c.server_ms)),
}]));
doc.supplement_generated_at = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(doc, null, 2), "utf8");
console.log(`보충 ${PLAN.length}회 · 지역별 합계 ${JSON.stringify(used)}\n${OUT}`);
