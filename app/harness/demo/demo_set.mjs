// 시연 세트(「재난담당자의 하루」 · harness/cq/demo_questions.json) 공용 — 읽기 · 모양 검사 · 앱과 같은 요청 · 자동 조회 본문.
// 쓰는 곳: cq/run.mjs --set demo · demo/probe_preview.mjs. T3Q 를 부르지 않는다(토큰을 다루지 않음).
// queryContext.ts·preview.ts 는 server-only·확장자 없는 import 라 node 로 바로 못 읽어 규칙을 옮겨 적었다 — 앱이 바뀌면 함께 바꾼다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP } from "../t3q/client.mjs";
import { LIBRARY, fillText } from "../../src/lib/library.ts";
import { PILOT_T3Q } from "../../src/lib/t3q/region.ts";

export const DEMO_FILE = join(APP, "harness", "cq", "demo_questions.json");
export const loadDemo = () => JSON.parse(readFileSync(DEMO_FILE, "utf8"));

const has = (o, k) => typeof k === "string" && Object.hasOwn(o, k);
const LEVEL = { SGG: "SIGUNGU", SIGUNGU: "SIGUNGU", SIDO: "SIDO", EMD: "EMD" };
const PREFIX = { busan: "BS", inje: "IJ", yeongcheon: "YC" };
/** 조건 편집 창(Composer.tsx ITEMS)과 같은 항목·이름·단위 */
export const COND_ITEMS = {
  RAIN_1H: { label: "1시간 강우", unit: "mm" },
  RAIN_3H: { label: "3시간 누적 강우", unit: "mm" },
  RAIN_24H: { label: "24시간 누적 강우", unit: "mm" },
  WATER_LEVEL: { label: "하천 수위", unit: "m" },
  WIND_SPEED: { label: "풍속", unit: "m/s" },
};
const DRAFT_KEYS = ["reference_time", "region", "disaster_types", "period", "detail"];
const DETAIL_KEYS = ["warning_kind", "warning_level", "keywords", "conditions"];

/** 초안 → 앱이 보낼 query_context — buildQueryContext 와 같은 순서·규칙(빈 값은 안 보냄, SGG→SIGUNGU, 조건 원소에 source_type "MANUAL") */
export function demoQueryContext(x) {
  const d = x.query_context_draft ?? {};
  const qc = {};
  if (d.reference_time) qc.reference_time = d.reference_time;
  if (d.region) qc.region = { admin_code: d.region.admin_code, level: LEVEL[d.region.level] ?? d.region.level, name: d.region.name };
  const dt = (d.disaster_types ?? []).filter((t) => t && t !== "전체");
  if (dt.length) qc.disaster_types = dt;
  if (d.period?.from || d.period?.to) qc.period = { from: d.period.from ?? null, to: d.period.to ?? null };
  const s = d.detail ?? {};
  const detail = {};
  if (s.warning_kind) detail.warning_kind = s.warning_kind;
  if (s.warning_level) detail.warning_level = s.warning_level;
  if (s.keywords?.length) detail.keywords = s.keywords;
  if (s.conditions?.length) detail.conditions = s.conditions.map((c) => ({ ...c, source_type: "MANUAL" }));
  if (Object.keys(detail).length) qc.detail = detail;
  return qc;
}

/** 에이전트 질의 본문(response_mode 는 askAsync 가 붙인다). weather_warnings·quick_query_id 는 넣지 않는다 — 특보는 기상청 실시간만(R6) */
export const demoRequest = (x) => ({ question: x.question.trim(), question_source: x.question_source ?? "USER", query_context: demoQueryContext(x) });

/** 자동 조회 — app/src/lib/server/preview.ts SPEC 과 같은 이름·경로·본문 */
export const PREVIEW_SPEC = {
  RISK_AREA: { apiId: "T3Q-05", label: "위험·취약지역 목록", path: "/risk-knowledge/search", body: (qc) => ({ data_group: "RISK_AREA", region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  RISK_FACILITY: { apiId: "T3Q-05", label: "잠재 위험요소·취약시설 목록", path: "/risk-knowledge/search", body: (qc) => ({ data_group: "RISK_FACTOR_FACILITY", region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  FLOOD_TRACE: { apiId: "T3Q-30", label: "침수흔적 목록", path: "/flood-traces/search", body: (qc) => ({ region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  SIMILAR_EVENT: { apiId: "T3Q-04", label: "유사재난 사례", path: "/similar-events/search", body: (qc) => ({ query_context: qc, page: { page: 1, size: 20 } }) },
  PLAN: { apiId: "T3Q-06", label: "계획문서 목록", path: "/plans/search", body: (qc) => ({ region: qc.region ?? null, page: { page: 1, size: 20 } }) },
};

/**
 * 복제가 preview.ts 와 글자 그대로 같은지 — 종류마다 SPEC 한 줄, 지역 없을 때 거르는 줄, 시간 제한 8초.
 * 돌려주는 값 = 못 찾은 항목 이름(빈 배열이면 같음)
 */
export function previewSpecDrift() {
  const src = readFileSync(join(APP, "src", "lib", "server", "preview.ts"), "utf8");
  const want = Object.entries(PREVIEW_SPEC).map(([k, s]) => [k, `${k}: { apiId: "${s.apiId}", label: "${s.label}", path: "${s.path}", body: ${s.body.toString()} },`]);
  want.push(["지역 없으면 유사사례만", `q.preview.filter((a) => a === "SIMILAR_EVENT" || qc.region)`], ["시간 제한 8초", "{ timeoutMs: 8000 }"]);
  return want.filter(([, line]) => !src.includes(line)).map(([k]) => k);
}

/** 그 문항에서 앱이 부를 자동 조회 — runPreview 와 같이 지역이 없으면 유사사례만 */
export function previewCalls(x) {
  const qc = demoQueryContext(x);
  return (x.preview ?? [])
    .filter((k) => has(PREVIEW_SPEC, k) && (k === "SIMILAR_EVENT" || qc.region))
    .map((k) => ({ kind: k, apiId: PREVIEW_SPEC[k].apiId, label: PREVIEW_SPEC[k].label, path: PREVIEW_SPEC[k].path, body: PREVIEW_SPEC[k].body(qc) }));
}

/** 모양 검사 → [{level: "필수"|"참고", rule, bad: [문자열]}]. 필수가 하나라도 걸리면 시험하지 않는다 */
export function checkDemo(items) {
  const out = [];
  const rule = (level, name, bad) => out.push({ level, rule: name, bad });
  const ids = items.map((x) => x.id);
  const byId = new Map(items.map((x) => [x.id, x]));
  const draft = (x) => x.query_context_draft ?? {};
  const conds = (x) => draft(x).detail?.conditions ?? [];
  const ymd = (v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v);

  rule("필수", "id 중복 없음", ids.filter((id, i) => ids.indexOf(id) !== i));
  rule("필수", "질문 글 있음", items.filter((x) => typeof x.question !== "string" || !x.question.trim()).map((x) => String(x.id)));
  rule("필수", "지역 코드·이름 맞음(region ↔ query_context_draft.region, app/src/lib/t3q/region.ts PILOT_T3Q)", items.filter((x) => {
    const want = has(PILOT_T3Q, x.region) ? PILOT_T3Q[x.region] : null;
    const g = draft(x).region;
    return !want || !g || g.admin_code !== want.admin_code || g.name !== want.name || LEVEL[g.level] !== want.level;
  }).map((x) => `${x.id}: ${x.region} → ${JSON.stringify(draft(x).region ?? null)}`));
  rule("필수", "alt_of 가 있는 id 를 가리킴", items.filter((x) => x.alt_of !== undefined && !byId.has(x.alt_of)).map((x) => `${x.id} → ${x.alt_of}`));
  rule("필수", "조건 item = RAIN_1H·RAIN_3H·RAIN_24H·WATER_LEVEL·WIND_SPEED", items.flatMap((x) => conds(x).filter((c) => !has(COND_ITEMS, c?.item)).map((c) => `${x.id}: ${c?.item}`)));

  rule("참고", "id 앞자리 = 지역(BS·IJ·YC)", items.filter((x) => !has(PREFIX, x.region) || !String(x.id).startsWith(`${PREFIX[x.region]}-`)).map((x) => `${x.id}: ${x.region}`));
  rule("참고", "자동 조회 종류 = preview.ts 5종", items.flatMap((x) => (Array.isArray(x.preview) ? x.preview : ["(preview 칸 없음)"]).filter((k) => !has(PREVIEW_SPEC, k)).map((k) => `${x.id}: ${k}`)));
  rule("참고", "초안·detail 칸 = 앱이 보내는 칸만(빠지는 칸 없음)", items.flatMap((x) => [
    ...Object.keys(draft(x)).filter((k) => !DRAFT_KEYS.includes(k)),
    ...Object.keys(draft(x).detail ?? {}).filter((k) => !DETAIL_KEYS.includes(k)).map((k) => `detail.${k}`),
  ].map((k) => `${x.id}: ${k}`)));
  rule("참고", "조건 이름·단위 = 조건 편집 창, 값 = 0 이상 수", items.flatMap((x) => conds(x).filter((c) => has(COND_ITEMS, c?.item) && (c.label !== COND_ITEMS[c.item].label || c.unit !== COND_ITEMS[c.item].unit || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value < 0)).map((c) => `${x.id}: ${JSON.stringify(c)}`)));
  rule("참고", "재난유형 0~1개(조건 편집 창은 하나만 고른다)", items.filter((x) => (draft(x).disaster_types ?? []).length > 1).map((x) => `${x.id}: ${draft(x).disaster_types.join("·")}`));
  rule("참고", "특보 단계 = 주의보·경보(조건 편집 창 선택지)", items.filter((x) => draft(x).detail?.warning_level && !["주의보", "경보"].includes(draft(x).detail.warning_level)).map((x) => `${x.id}: ${draft(x).detail.warning_level}`));
  rule("참고", "기간 = YYYY-MM-DD(조건 편집 창 날짜 칸), 시작 ≤ 끝", items.filter((x) => {
    const p = draft(x).period;
    return p && (!(p.from || p.to) || !ymd(p.from) || !ymd(p.to) || (p.from && p.to && p.from > p.to));
  }).map((x) => `${x.id}: ${JSON.stringify(draft(x).period)}`));
  rule("참고", "역할 — main 은 alt_of 없음, alt 는 같은 지역·장면의 main 을 가리킴", items.filter((x) => {
    if (x.role === "main") return x.alt_of !== undefined;
    if (x.role !== "alt") return true;
    const m = byId.get(x.alt_of);
    return !m || m.role !== "main" || m.region !== x.region || m.scene !== x.scene;
  }).map((x) => `${x.id}: ${x.role} → ${x.alt_of ?? "-"}`));
  rule("참고", "질문 모음 문항(library_id) — library.ts 에 있고 지역·글·재난유형·자동 조회가 같음", items.filter((x) => x.library_id).flatMap((x) => {
    const lib = LIBRARY.find((q) => q.id === x.library_id);
    if (!lib) return [`${x.id}: ${x.library_id} 없음`];
    const diff = [];
    if (lib.regions && !lib.regions.includes(x.region)) diff.push("지역");
    if (fillText(lib, PILOT_T3Q[x.region]?.name ?? "") !== x.question) diff.push("글");
    if (JSON.stringify(lib.disasterTypes ?? []) !== JSON.stringify(draft(x).disaster_types ?? [])) diff.push("재난유형");
    if (JSON.stringify(lib.preview ?? []) !== JSON.stringify(x.preview ?? [])) diff.push("자동 조회");
    return diff.length ? [`${x.id}(${x.library_id}): ${diff.join("·")} 다름`] : [];
  }));
  return out;
}

/** 검사 결과를 한 줄씩 찍고, 걸린 필수 규칙 수를 돌려준다 */
export function printCheck(results, log = console.log) {
  for (const r of results) log(`${r.bad.length ? "×" : "○"} [${r.level}] ${r.rule}${r.bad.length ? ` — ${r.bad.length}건: ${r.bad.join(" / ")}` : ""}`);
  return results.filter((r) => r.level === "필수" && r.bad.length).length;
}
