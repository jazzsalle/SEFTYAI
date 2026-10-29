// 데모(11/5 행정안전부 국장 보고) 데이터 재고 조사(A)
// 부산·인제·영천 × 사용자 요구 주제별로 T3Q Data API 에 실제로 무엇이 있는지 조회해 정리한다.
// - Agent 질의(POST /agent/query)는 보내지 않는다 — 데이터 API 만.
// - 토큰은 client.mjs 가 app/.env.local 에서 읽기만 한다(출력·기록하지 않음).
// - 지역당 30회 안쪽 · 전체 동시 3 · 조회마다 응답 시간(ms = 왕복, server_ms = meta.elapsed_ms) 기록.
// - 같은 요청(같은 사건의 근거·타임라인 등)은 지역이 달라도 한 번만 부른다.
// 실행: node harness/demo/probe_inventory.mjs  → docs/renewal/analysis/demo_day/A_data_inventory.json
// 보충 조회(9회)는 이 스크립트 다음에 node harness/demo/probe_inventory_extra.mjs — 같은 JSON 에 supplement 로 붙는다.
// (이 스크립트를 다시 돌리면 JSON 을 새로 쓰므로 보충 조회도 다시 돌려야 한다.)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP, t3q } from "../t3q/client.mjs";

const OUT = join(APP, "..", "docs", "renewal", "analysis", "demo_day", "A_data_inventory.json");
const CALLER = { user_id: "U-PROBE-INVENTORY", role: "LOCAL_GOV_OFFICER" };
const MAX_PER_REGION = 30;
const CONCURRENCY = 3;

// ── 전체 동시 3 ──
let active = 0;
const waiters = [];
const acquire = () => new Promise((res) => { if (active < CONCURRENCY) { active++; res(); } else waiters.push(res); });
const release = () => { const next = waiters.shift(); if (next) next(); else active--; };

const calls = [];
const cache = new Map();
const baseTimes = new Set();

async function call(ctx, api, label, method, path, body) {
  const key = `${method} ${path} ${JSON.stringify(body ?? null)}`;
  if (cache.has(key)) {
    const hit = await cache.get(key);
    ctx.reused.push({ api, label, path, from_region: hit?.rec?.region ?? null });
    return hit;
  }
  if (ctx.used >= MAX_PER_REGION) { ctx.skipped.push({ api, label, path }); return null; }
  ctx.used++;
  const p = (async () => {
    await acquire();
    const startedAt = new Date().toISOString();
    let r;
    try {
      r = await t3q(method, path, method === "GET" ? undefined : { caller: CALLER, ...(body || {}) }, { timeoutMs: 60000 });
    } catch (e) {
      r = { http: 0, ms: null, json: null, text: String(e?.message || e).slice(0, 200) };
    } finally {
      release();
    }
    const j = r.json;
    const res = j?.result ?? null;
    const items = Array.isArray(res?.items) ? res.items : null;
    const rec = {
      seq: calls.length + 1, region: ctx.key, api, label, method, path, request: body ?? null, started_at: startedAt,
      http: r.http, ms: r.ms, server_ms: j?.meta?.elapsed_ms ?? null, status: j?.status ?? null,
      total_count: res?.total_count ?? null, n_items: items ? items.length : null,
      data_gaps: j?.data_gaps ?? [], warnings: (j?.warnings ?? []).map((w) => `${w.code}: ${w.message ?? ""}`.trim()),
      error: r.text ?? null,
    };
    calls.push(rec);
    if (j?.meta?.base_time) baseTimes.add(j.meta.base_time);
    console.log(`${ctx.key.padEnd(10)} ${api.padEnd(7)} ${String(r.http).padEnd(3)} ${String(j?.status ?? "-").padEnd(18)} ${String(r.ms).padStart(5)}ms n=${items ? items.length : "-"} tot=${res?.total_count ?? "-"}  ${label}`);
    return { rec, json: j, result: res, items };
  })();
  cache.set(key, p);
  return p;
}

// ── 도우미 ──
const countBy = (arr, f) => {
  const m = {};
  for (const x of arr || []) { const k = f(x) ?? "(없음)"; m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));
const timing = (x) => (x ? { http: x.rec.http, status: x.rec.status, ms: x.rec.ms, server_ms: x.rec.server_ms } : { skipped: true });
const compactRisk = (i) => ({
  object_id: i.object_id, data_group: i.data_group, category: i.category, type: i.type, source_subtype: i.source_subtype,
  name: i.name, grade: i.grade?.value ?? null, admin_name: i.admin_name, address: i.address,
});
const dedupe = (arr) => { const s = new Map(); for (const i of arr) if (i?.object_id && !s.has(i.object_id)) s.set(i.object_id, i); return [...s.values()]; };

function pickItem(pool, spec, taken) {
  const cands = pool.filter((i) => i.category === spec.cat && !taken.has(i.object_id));
  for (const pref of spec.prefer || []) { const hit = cands.find(pref); if (hit) return hit; }
  return cands[0] ?? null;
}

const REASON_LIKE = /사유|원인|유형|요인|지정|재해|위험|사업|정비|내용|통제|대피|피해|기준|대응/;

function detailSummary(x, spec) {
  if (!x) return { why: spec.why, skipped: true };
  const res = x.result || {};
  const r = res.risk || {};
  const attrs = (r.attributes || []).map((a) => ({ key: a.key, label: a.label, value: a.value }));
  return {
    why: spec.why, ...timing(x),
    object_id: res.object_id, category: res.category, type: res.type, source_subtype: res.source_subtype, name: res.name,
    admin: res.admin_area?.name ?? null, address: res.address ?? null,
    risk_fixed_fields: pick(r, ["designation_reason", "key_risk_condition", "expected_damage", "vulnerability", "designated_at", "designation_no", "area_or_length"]),
    grade: r.grade ?? null, risk_score_detail: r.risk_score_detail ?? null,
    attribute_labels: attrs.map((a) => a.label),
    reason_like_attributes: attrs.filter((a) => REASON_LIKE.test(a.label || "")),
    attributes: attrs,
    basis: res.basis ?? null, management: res.management ?? null, source: res.source ?? null,
    data_gaps: x.rec.data_gaps,
  };
}

function floodSummary(items, names) {
  const nm = (code, len) => names.get(String(code || "").slice(0, len)) ?? String(code || "").slice(0, len);
  const area = items.reduce((s, i) => s + (Number(i.area_m2) || 0), 0);
  return {
    n: items.length,
    by_year: sortKeys(countBy(items, (i) => i.flood_year)),
    by_event_name: countBy(items, (i) => (i.flood_event ? `${i.flood_event.name} (${i.flood_event.flood_event_id})` : null)),
    by_sigungu: countBy(items, (i) => nm(i.admin_code, 5)),
    by_emd_top15: Object.fromEntries(Object.entries(countBy(items, (i) => nm(i.admin_code, 8))).slice(0, 15)),
    causes_top10: Object.fromEntries(Object.entries(countBy(items, (i) => i.cause)).slice(0, 10)),
    area_m2_sum: Math.round(area),
    with_district_name: items.filter((i) => i.district_name).length,
    with_damage_amount: items.filter((i) => i.damage_amount_krw != null).length,
    examples: items.slice(0, 8).map((i) => ({ ...pick(i, ["flood_trace_id", "district_name", "admin_code", "flood_year", "started_on", "ended_on", "cause", "area_m2", "avg_flood_depth_raw", "flood_hours"]), emd: nm(i.admin_code, 8), flood_event: i.flood_event?.name ?? null })),
  };
}

const KW = {
  통제: /통제/, 대피: /대피/, 지하차도: /지하차도/, "하천·둔치·산책로": /하천|천변|둔치|산책로/, 계곡: /계곡/,
  "야영·캠핑": /야영|캠핑/, "산사태·급경사지·사면": /산사태|토사|급경사|사면|낙석/, 침수: /침수/, 소하천: /소하천/,
};
function timelineSummary(x, nameRe) {
  if (!x) return { skipped: true };
  const items = x.items || [];
  const txt = (i) => `${i.description ?? ""} ${i.agency ?? ""} ${i.source_ref ?? ""}`;
  const regional = items.filter((i) => nameRe.test(txt(i)));
  const kwCount = (arr) => Object.fromEntries(Object.entries(KW).map(([k, re]) => [k, arr.filter((i) => re.test(i.description ?? "")).length]));
  const ex = (i) => pick(i, ["occurred_at", "category", "description", "agency", "source_ref"]);
  return {
    ...timing(x), total_count: x.result?.total_count ?? null, n_returned: items.length,
    time_origin: x.result?.time_origin ?? null,
    by_category: countBy(items, (i) => i.category),
    keyword_hits_all: kwCount(items),
    regional_n: regional.length,
    regional_by_category: countBy(regional, (i) => i.category),
    keyword_hits_regional: kwCount(regional),
    regional_examples: regional.slice(0, 8).map(ex),
    control_evac_examples_regional: regional.filter((i) => /통제|대피/.test(i.description ?? "")).slice(0, 8).map(ex),
    control_evac_examples_any: items.filter((i) => /통제|대피/.test(i.description ?? "")).slice(0, 5).map(ex),
    message_examples_any: items.filter((i) => i.category !== "특보").slice(0, 3).map(ex),
    first_at: items[0]?.occurred_at ?? null, last_at: items[items.length - 1]?.occurred_at ?? null,
    warnings: x.rec.warnings, data_gaps: x.rec.data_gaps,
  };
}

function evidenceSummary(x) {
  if (!x) return { skipped: true };
  return {
    ...timing(x), total_count: x.result?.total_count ?? null,
    items: (x.items || []).map((i) => ({
      ...pick(i, ["evidence_ref", "document_id", "document_type", "title", "page", "pdf_page", "section_path", "quote_type", "source_availability", "download_allowed"]),
      paragraphs_n: (i.paragraphs || []).length, source_row: i.source_row ?? null,
      table_caption: i.table?.caption ?? null, coverage_note: i.coverage_note ?? null,
    })),
    data_gaps: x.rec.data_gaps,
  };
}

function damageSummary(x) {
  if (!x) return { skipped: true };
  const d = x.result?.damage || {};
  const f = d.facilities || {};
  return {
    ...timing(x), human: d.human ?? null, property: d.property ?? null,
    public: f.public ? { record_count: f.public.record_count, damage_amount_krw: f.public.damage_amount_krw, by_category: f.public.by_category } : null,
    private: f.private ?? null, recovery: f.recovery ?? null, damage_registers: f.damage_registers ?? null,
    response: x.result?.response ?? null, data_gaps: x.rec.data_gaps,
  };
}

function eventDetailSummary(x, sidoCode) {
  if (!x) return { skipped: true };
  const r = x.result || {};
  return {
    ...timing(x), ...pick(r, ["event_master_id", "display_name", "disaster_types", "disaster_type_code", "lifecycle_status", "lead_agency", "event_summary", "available_sections", "evidence_refs"]),
    period: r.time_profile ? `${r.time_profile.started_at} ~ ${r.time_profile.ended_at}` : null,
    affected_admin_areas: (r.affected_admin_areas || []).map((a) => a.name),
    includes_region_sido: (r.affected_admin_areas || []).some((a) => a.admin_code === sidoCode) || r.representative_admin_area?.admin_code === sidoCode,
    representative_admin_area: r.representative_admin_area ?? null, data_gaps: x.rec.data_gaps,
  };
}

const seItem = (i) => ({ ...pick(i, ["event_master_id", "display_name", "disaster_types", "started_at", "ended_at"]), score: i.similarity?.score ?? null, rank: i.similarity?.rank ?? null, representative: i.representative_admin_area?.name ?? null });
const planItem = (i) => ({ ...pick(i, ["plan_id", "plan_type", "scope_type", "name", "target_area", "base_year", "version", "linked_risk_area_count", "summary"]), target_admin_codes: i.target_admin_codes ?? null, target_rivers: (i.target_rivers || []).map((r) => `${r.river_name}(${r.river_id})`), river_plan_summary: i.river_plan_summary ?? null });

// ── 지역 설정 ──
const REGIONS = [
  {
    key: "busan", label: "부산광역시", short: "부산", sido: "2600000000",
    theme: "도심 침수 — 도심하천·지하차도·반지하의 과거 침수 이력, 위험지구 지정 사유, 통제·대피 기준",
    region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" },
    nameRe: /부산/,
    lists: [
      { label: "지하차도 전체", categories: ["지하차도(취약시설)"] },
      { label: "홍수취약지구 전체", categories: ["홍수취약지구"] },
      { label: "자연재해위험개선지구·풍수해생활권 전체", categories: ["자연재해위험개선지구", "풍수해생활권 종합정비지구"] },
    ],
    details: [
      { why: "지하차도 — 이름에 «초량» 우선", cat: "지하차도(취약시설)", prefer: [(i) => /초량/.test(i.name || "")] },
      { why: "지하차도 — 도심하천(온천천·수영강·동천) 쪽 이름 우선", cat: "지하차도(취약시설)", prefer: [(i) => /구서|내성|수영강|센텀|문현|온천/.test(i.name || "")] },
      { why: "자연재해위험개선지구 — 침수위험·가등급 우선", cat: "자연재해위험개선지구", prefer: [(i) => i.type === "침수위험" && i.grade?.value === "가", (i) => i.type === "침수위험"] },
      { why: "홍수취약지구", cat: "홍수취약지구", prefer: [] },
      { why: "풍수해생활권 종합정비지구", cat: "풍수해생활권 종합정비지구", prefer: [] },
    ],
    eventSearches: [
      // 조건입력 흉내: 강우·특보 조건을 함께 보내 서버가 어떻게 다루는지(경고) 기록
      { tag: "호우·2020(조건 포함)", disaster: "호우", from: "2020-07-23", keywords: ["2020년", "호우"], size: 50, detail: { warning_kind: "호우", warning_level: "경보", conditions: [{ item: "RAIN_1H", label: "1시간 강우", value: 80, unit: "mm", source_type: "MANUAL" }] } },
      { tag: "태풍·2022", disaster: "태풍", from: "2022-09-05", keywords: ["2022년", "태풍"], size: 50 },
    ],
    events: [
      { tag: "2020년 7월 부산 집중호우(7.23)", windows: [["2020-07-20", "2020-07-26"]], fallback: "T10107-20200723-0001", full: true },
      { tag: "2022년 태풍 힌남노", windows: [["2022-09-01", "2022-09-08"]], fallback: null, full: false },
    ],
    planKeywords: ["온천천", "수영강"],
    kg: true,
  },
  {
    key: "inje", label: "강원특별자치도 인제군", short: "인제", sido: "5100000000",
    theme: "산사태·계곡 재해 — 산사태·급경사지·캠핑·야영장 주변의 과거 피해사례와 당시 통제·대피 조치",
    region: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" },
    nameRe: /인제/,
    lists: [
      { label: "산사태취약지역(1쪽 100건)", categories: ["산사태취약지역"] },
      { label: "급경사지(1쪽 100건)", categories: ["급경사지"] },
      { label: "자연재해위험개선지구·풍수해생활권·붕괴위험지역 전체", categories: ["자연재해위험개선지구", "풍수해생활권 종합정비지구", "붕괴위험지역(정비 중기계획)"] },
      { label: "자연재해저감 종합계획 위험지구(1쪽 100건)", categories: ["자연재해저감 종합계획 위험지구"] },
    ],
    details: [
      { why: "산사태취약지역 — 1등급·A 우선", cat: "산사태취약지역", prefer: [(i) => /^(1|1등급|A|가)$/.test(i.grade?.value ?? "")] },
      { why: "급경사지 — E·D 등급 우선", cat: "급경사지", prefer: [(i) => i.grade?.value === "E", (i) => i.grade?.value === "D"] },
      { why: "붕괴위험지역(정비 중기계획)", cat: "붕괴위험지역(정비 중기계획)", prefer: [] },
      { why: "자연재해위험개선지구 — 붕괴·고립·유실·토사 위험 우선", cat: "자연재해위험개선지구", prefer: [(i) => /붕괴|고립|유실|토사|사면/.test(i.type || "")] },
      { why: "자연재해저감 종합계획 위험지구 — 산사태·토사·사면 우선", cat: "자연재해저감 종합계획 위험지구", prefer: [(i) => /산사태|토사|사면|토석|계곡/.test(`${i.type || ""} ${i.name || ""}`)] },
    ],
    eventSearches: [
      { tag: "호우·2006", disaster: "호우", from: "2006-07-15", keywords: ["2006년", "호우"], size: 50 },
      { tag: "태풍·2006", disaster: "태풍", from: "2006-07-15", keywords: ["2006년", "태풍"], size: 50 },
    ],
    events: [
      { tag: "2006년 7월 인제 집중호우", windows: [["2006-07-01", "2006-07-31"]], fallback: null, full: true },
      { tag: "2020년 7.28~8.11 호우(인제 침수흔적 사건명과 같은 기간)", windows: [["2020-07-27", "2020-07-29"]], fallback: "T10107-20200728-0001", full: true },
      { tag: "2023년 태풍 카눈", windows: [["2023-08-08", "2023-08-11"]], fallback: "T10105-20230809-0001", full: false },
    ],
    planKeywords: ["인북천", "내린천"],
    kg: false,
  },
  {
    key: "yeongcheon", label: "경상북도 영천시", short: "영천", sido: "4700000000",
    theme: "소하천 범람·침수 — 소하천 주변 재해위험지구, 과거 피해 이력, 소하천 정비계획 연계로 우선 점검할 구역",
    region: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" },
    nameRe: /영천/,
    lists: [
      { label: "법정 위험지구 전체(개선지구·풍수해·홍수취약·붕괴위험·재해위험저수지)", categories: ["자연재해위험개선지구", "풍수해생활권 종합정비지구", "홍수취약지구", "붕괴위험지역(정비 중기계획)", "재해위험저수지"] },
    ],
    details: [
      { why: "풍수해생활권 종합정비지구 — 이름 «자천» 우선", cat: "풍수해생활권 종합정비지구", prefer: [(i) => /자천/.test(i.name || "")] },
      { why: "풍수해생활권 종합정비지구 — 이름 «신양» 우선", cat: "풍수해생활권 종합정비지구", prefer: [(i) => /신양/.test(i.name || "")] },
      { why: "자연재해위험개선지구 — 침수위험·가등급 우선", cat: "자연재해위험개선지구", prefer: [(i) => i.type === "침수위험" && i.grade?.value === "가", (i) => i.type === "침수위험"] },
      { why: "홍수취약지구", cat: "홍수취약지구", prefer: [] },
      { why: "재해위험저수지", cat: "재해위험저수지", prefer: [] },
      { why: "지하차도", cat: "지하차도(취약시설)", prefer: [] },
    ],
    eventSearches: [
      { tag: "태풍·2022", disaster: "태풍", from: "2022-09-05", keywords: ["2022년", "태풍"], size: 50 },
      { tag: "호우·2024", disaster: "호우", from: "2024-07-08", keywords: ["2024년", "호우"], size: 50 },
    ],
    events: [
      { tag: "2022년 태풍 힌남노", windows: [["2022-09-01", "2022-09-08"]], fallback: null, full: true },
      { tag: "2024년 7월 호우", windows: [["2024-07-07", "2024-07-10"]], fallback: "T10107-20240708-0001", full: true },
    ],
    planKeywords: ["소하천", "영천", "금호강"],
    kg: true,
  },
];

async function runRegion(cfg) {
  const ctx = { key: cfg.key, used: 0, skipped: [], reused: [] };
  const out = { key: cfg.key, label: cfg.label, theme: cfg.theme, region: cfg.region };
  const qcPreview = { region: cfg.region, disaster_types: ["호우"] };

  // ① 미리보기(preview.ts)와 같은 요청 5건 + 종류별 목록 + 사건 검색
  const first = await Promise.all([
    call(ctx, "T3Q-05", "미리보기 RISK_AREA(size 50)", "POST", "/risk-knowledge/search", { data_group: "RISK_AREA", region: cfg.region, page: { page: 1, size: 50 } }),
    call(ctx, "T3Q-05", "미리보기 RISK_FACILITY(size 50)", "POST", "/risk-knowledge/search", { data_group: "RISK_FACTOR_FACILITY", region: cfg.region, page: { page: 1, size: 50 } }),
    call(ctx, "T3Q-30", "미리보기 FLOOD_TRACE(size 50)", "POST", "/flood-traces/search", { region: cfg.region, page: { page: 1, size: 50 } }),
    call(ctx, "T3Q-04", "미리보기 SIMILAR_EVENT(size 20)", "POST", "/similar-events/search", { query_context: qcPreview, page: { page: 1, size: 20 } }),
    call(ctx, "T3Q-06", "미리보기 PLAN(size 20)", "POST", "/plans/search", { region: cfg.region, page: { page: 1, size: 20 } }),
    ...cfg.lists.map((l) => call(ctx, "T3Q-05", `목록 ${l.label}`, "POST", "/risk-knowledge/search", { categories: l.categories, region: cfg.region, page: { page: 1, size: 100 } })),
    ...cfg.eventSearches.map((s) => call(ctx, "T3Q-04", `사건 검색 ${s.tag}`, "POST", "/similar-events/search", {
      query_context: { region: cfg.region, disaster_types: [s.disaster], period: { from: s.from }, detail: { keywords: s.keywords, ...(s.detail || {}) } },
      page: { page: 1, size: s.size },
    })),
  ]);
  const [pRA, pRF, pFT, pSE, pPL] = first;
  const lists = first.slice(5, 5 + cfg.lists.length);
  const searches = first.slice(5 + cfg.lists.length);

  const pool = dedupe([...(pRA?.items || []), ...(pRF?.items || []), ...lists.flatMap((l) => l?.items || [])]);
  const names = new Map();
  for (const i of pool) {
    if (!i.admin_code || !i.admin_name) continue;
    const t = i.admin_name.split(" ");
    if (!names.has(i.admin_code.slice(0, 8))) names.set(i.admin_code.slice(0, 8), t.slice(0, 3).join(" "));
    if (!names.has(i.admin_code.slice(0, 5))) names.set(i.admin_code.slice(0, 5), t.slice(0, 2).join(" "));
  }

  out.preview = {
    _note: "앱 preview.ts 와 같은 요청(질문을 보내는 순간 「자동 조회 데이터」로 먼저 보이는 것)",
    RISK_AREA: { ...timing(pRA), total_count: pRA?.result?.total_count ?? null, category_counts: pRA?.result?.category_counts ?? null, first50_by_category: countBy(pRA?.items, (i) => i.category) },
    RISK_FACILITY: { ...timing(pRF), total_count: pRF?.result?.total_count ?? null, category_counts: pRF?.result?.category_counts ?? null, first50_by_category: countBy(pRF?.items, (i) => i.category) },
    FLOOD_TRACE: { ...timing(pFT), total_count: pFT?.result?.total_count ?? null, first50_by_year: sortKeys(countBy(pFT?.items, (i) => i.flood_year)), data_gaps: pFT?.rec.data_gaps ?? null },
    SIMILAR_EVENT: { ...timing(pSE), total_count: pSE?.result?.total_count ?? null, top5: (pSE?.items || []).slice(0, 5).map(seItem), warnings: pSE?.rec.warnings ?? null },
    PLAN: { ...timing(pPL), total_count: pPL?.result?.total_count ?? null, items: (pPL?.items || []).map(planItem), warnings: pPL?.rec.warnings ?? null },
  };

  out.risk = {
    groups: {
      RISK_AREA: { total_count: pRA?.result?.total_count ?? null, category_counts: pRA?.result?.category_counts ?? null },
      RISK_FACTOR_FACILITY: { total_count: pRF?.result?.total_count ?? null, category_counts: pRF?.result?.category_counts ?? null },
    },
    lists: cfg.lists.map((l, k) => {
      const x = lists[k];
      const items = x?.items || [];
      return {
        label: l.label, categories: l.categories, ...timing(x), total_count: x?.result?.total_count ?? null, n: items.length,
        grade_counts: countBy(items, (i) => `${i.category} · ${i.grade?.value ?? "등급 없음"}`),
        type_counts: countBy(items, (i) => `${i.category} · ${i.type ?? "-"}${i.source_subtype ? " / " + i.source_subtype : ""}`),
        by_emd: countBy(items, (i) => i.admin_name),
        items: items.map(compactRisk),
      };
    }),
    soha_mentions_in_names: pool.filter((i) => /소하천/.test(`${i.name ?? ""} ${i.address ?? ""} ${i.type ?? ""}`)).map(compactRisk),
  };

  // ② 상세 · 침수흔적 전체 · 사건(상세·근거·타임라인·피해)
  const taken = new Set();
  const picks = cfg.details.map((d) => { const it = pickItem(pool, d, taken); if (it) taken.add(it.object_id); return { spec: d, item: it }; });
  const detailP = Promise.all(picks.map((p) => (p.item ? call(ctx, "T3Q-15", `상세 ${p.item.object_id} ${p.item.name ?? ""}`, "GET", `/risk-objects/${encodeURIComponent(p.item.object_id)}`) : Promise.resolve(null))));

  const ftTotal = pFT?.result?.total_count ?? 0;
  const ftPages = ftTotal > 50 ? Math.min(Math.ceil(ftTotal / 100), 5) : 0;
  const ftP = Promise.all(Array.from({ length: ftPages }, (_, k) => call(ctx, "T3Q-30", `침수흔적 전체 ${k + 1}/${ftPages}쪽(size 100)`, "POST", "/flood-traces/search", { region: cfg.region, page: { page: k + 1, size: 100 } })));

  const searchItems = searches.flatMap((s) => s?.items || []);
  const chosen = cfg.events.map((ev) => {
    let hit = null;
    let inWindow = [];
    for (const [a, b] of ev.windows) {
      inWindow = searchItems.filter((i) => i.started_at >= a && i.started_at <= b).sort((x, y) => (y.similarity?.score ?? 0) - (x.similarity?.score ?? 0));
      if (inWindow.length) { hit = inWindow[0]; break; }
    }
    return { tag: ev.tag, windows: ev.windows, full: ev.full, found_in_search: !!hit, used_fallback: !hit && !!ev.fallback, event_master_id: hit?.event_master_id ?? ev.fallback ?? null, search_item: hit ? seItem(hit) : null, candidates_in_window: inWindow.map(seItem) };
  });
  const eventsP = Promise.all(chosen.map(async (ev) => {
    if (!ev.event_master_id) return { ...ev, note: "검색 결과(상위 50)에 이 기간 사건이 없고 대체 ID 도 없음 — 조회하지 않음" };
    const id = ev.event_master_id;
    const d10 = await call(ctx, "T3Q-10", `사건 상세 ${id}`, "GET", `/events/${encodeURIComponent(id)}`);
    if (!d10 || d10.rec.http !== 200) return { ...ev, detail: d10 ? { ...timing(d10) } : { skipped: true }, note: "사건 상세가 없음(404 등) — 근거·타임라인 조회 안 함" };
    const [d19, d12, d13] = await Promise.all([
      call(ctx, "T3Q-19", `근거 ${id}`, "POST", "/evidence/search", { object_id: id, include_passage: true, context_paragraphs: 0, page: { page: 1, size: 20 } }),
      call(ctx, "T3Q-12", `타임라인 ${id}`, "GET", `/events/${encodeURIComponent(id)}/timeline?page=1&size=500`),
      ev.full ? call(ctx, "T3Q-13", `피해·복구 ${id}`, "GET", `/events/${encodeURIComponent(id)}/damage-response`) : Promise.resolve(null),
    ]);
    return { ...ev, detail: eventDetailSummary(d10, cfg.sido), evidence: evidenceSummary(d19), timeline: timelineSummary(d12, cfg.nameRe), damage: ev.full ? damageSummary(d13) : { not_requested: true } };
  }));

  const [details, ftPagesRes, events] = await Promise.all([detailP, ftP, eventsP]);
  out.risk.details = picks.map((p, k) => detailSummary(details[k], p.spec));

  const ftItems = ftPages ? ftPagesRes.flatMap((x) => x?.items || []) : (pFT?.items || []);
  out.flood_traces = {
    total_count: ftTotal, status: pFT?.rec.status ?? null, pages_fetched: ftPages,
    paging_ms: ftPagesRes.map((x) => (x ? x.rec.ms : null)),
    ...floodSummary(ftItems, names),
    data_gaps: pFT?.rec.data_gaps ?? null,
  };

  const allYears = searchItems.map((i) => Number(String(i.started_at || "").slice(0, 4))).filter(Boolean);
  out.events = {
    searches: cfg.eventSearches.map((s, k) => {
      const x = searches[k];
      const items = x?.items || [];
      return {
        tag: s.tag, request_summary: { disaster: s.disaster, from: s.from, keywords: s.keywords, with_conditions: !!s.detail }, ...timing(x),
        total_count: x?.result?.total_count ?? null,
        years_in_results: sortKeys(countBy(items, (i) => String(i.started_at || "").slice(0, 4))),
        top10: items.slice(0, 10).map(seItem), warnings: x?.rec.warnings ?? null, data_gaps: x?.rec.data_gaps ?? null,
      };
    }),
    search_year_range: allYears.length ? [Math.min(...allYears), Math.max(...allYears)] : null,
    selected: events,
  };

  // ③ 계획문서(키워드) → ④ 하천 계획지식 · 객체관계
  const plans = await Promise.all(cfg.planKeywords.map((kw) => call(ctx, "T3Q-06", `계획 검색 keyword=${kw}`, "POST", "/plans/search", { keyword: kw, page: { page: 1, size: 20 } })));
  out.plans = {
    region_filter: out.preview.PLAN,
    keyword_searches: cfg.planKeywords.map((kw, k) => ({ keyword: kw, ...timing(plans[k]), total_count: plans[k]?.result?.total_count ?? null, items: (plans[k]?.items || []).map(planItem), warnings: plans[k]?.rec.warnings ?? null })),
  };
  const riverCands = [];
  plans.forEach((p, k) => { for (const it of p?.items || []) for (const r of it.target_rivers || []) if (r.river_id) riverCands.push({ kw: cfg.planKeywords[k], river_id: r.river_id, river_name: r.river_name, plan_id: it.plan_id }); });
  const riverPick = riverCands.find((r) => r.river_name === r.kw) || riverCands.find((r) => r.kw !== "소하천" && r.river_name?.includes(r.kw)) || null;
  const tail = [];
  tail.push(riverPick ? call(ctx, "T3Q-16", `하천 계획지식 ${riverPick.river_id} ${riverPick.river_name}`, "GET", `/rivers/${encodeURIComponent(riverPick.river_id)}/plan-knowledge?station_limit=5`) : Promise.resolve(null));
  const hzIds = out.risk.details.filter((d) => d.object_id && /^HZ-/.test(d.object_id)).map((d) => d.object_id).slice(0, 3);
  tail.push(cfg.kg && hzIds.length ? call(ctx, "T3Q-18", `객체관계 ${hzIds.join(",")}`, "POST", "/kg/query", { source_ids: hzIds, relation_types: null, depth: 1 }) : Promise.resolve(null));
  const [rv, kg] = await Promise.all(tail);
  out.rivers = {
    candidates: riverCands.slice(0, 20), picked: riverPick,
    plan_knowledge: rv ? {
      ...timing(rv), ...pick(rv.result, ["river_id", "river_code", "river_name", "river_basic", "station_total", "facilities", "facility_items", "evidence_refs"]),
      plan: rv.result?.plan ?? null, stations_sample: (rv.result?.stations || []).slice(0, 5), data_gaps: rv.rec.data_gaps, warnings: rv.rec.warnings,
    } : null,
  };
  out.kg = kg ? { ...timing(kg), source_ids: hzIds, nodes: kg.result?.nodes ?? null, edges: kg.result?.edges ?? null, group_counts: kg.result?.group_counts ?? null, warnings: kg.rec.warnings, data_gaps: kg.rec.data_gaps } : null;

  out.calls_used = ctx.used;
  out.calls_skipped_over_budget = ctx.skipped;
  out.calls_reused_from_other_region = ctx.reused;
  return out;
}

function latencyStats() {
  const by = {};
  for (const c of calls) (by[c.api] ||= []).push(c);
  const med = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  return Object.fromEntries(Object.entries(by).sort().map(([api, cs]) => [api, {
    n: cs.length, ms_median: med(cs.map((c) => c.ms)), ms_min: Math.min(...cs.map((c) => c.ms ?? Infinity)), ms_max: Math.max(...cs.map((c) => c.ms ?? -Infinity)),
    server_ms_median: med(cs.map((c) => c.server_ms)),
  }]));
}

const t0 = Date.now();
const results = await Promise.all(REGIONS.map(runRegion));
const doc = {
  _about: "11/5 시연용 데이터 재고 조사(A) — 부산·인제·영천 × 주제별 T3Q Data API 실조회 결과. Agent 질의 없음. ms = 하네스 왕복 시간, server_ms = 응답 meta.elapsed_ms.",
  generated_at: new Date().toISOString(),
  script: "app/harness/demo/probe_inventory.mjs",
  base_time: [...baseTimes],
  elapsed_ms_total: Date.now() - t0,
  rules: { max_calls_per_region: MAX_PER_REGION, concurrency: CONCURRENCY, agent_query_sent: false },
  calls_per_region: Object.fromEntries(results.map((r) => [r.key, r.calls_used])),
  latency_by_api: latencyStats(),
  regions: Object.fromEntries(results.map((r) => [r.key, r])),
  calls,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2), "utf8");
console.log(`\n${calls.length}회 · ${Math.round((Date.now() - t0) / 1000)}초 · 지역별 ${JSON.stringify(doc.calls_per_region)}\n${OUT}`);
