// 정답셋(gold_set.json) 생성 : node scripts/build_gold.mjs [baseUrl]
//  · 질문 = 골든 질문(golden.mjs) + 특보 참조 질문(wxref.mjs) + 업무 단계별 추천 질문(CQ ID 포함)
//  · 기대 의도 = 스크립트에 적힌 기대값(골든·특보 참조) 또는 현재 응답
//  · 기대 대상 ID·근거 = 현재 응답(훈련 시나리오) 기준
//  · 기대 항목값(dqId) = 시드 원본(risk_areas.json · events.json)에서 직접 읽음 — 응답 생성 코드를 거치지 않는 독립 값
//  T3Q 정답셋을 받으면 이 파일 대신 그 값을 넣는다.
import fs from "fs";
const BASE = process.argv[2] || "http://localhost:3100";
const BASE_TIME = "2026-10-03T09:00:00+09:00";
const risks = new Map(JSON.parse(fs.readFileSync("data/seed/risk_areas.json", "utf8")).map((r) => [r.id, r]));
const events = new Map(JSON.parse(fs.readFileSync("data/seed/events.json", "utf8")).events.map((e) => [e.eventId, e]));

// 범주별 기대 항목 : [항목 라벨, 값 위치, 03 시트 ID]
const PICK = {
  붕괴위험지역: [["재해위험도평가등급", "attrs", "DQ-10-009"], ["재해위험도평가점수", "attrs", "DQ-10-009"], ["보수보강방법", "plan", "DQ-10-011"], ["사업명", "plan", "DQ-10-004"]],
  급경사지: [["급경사지관리번호", "attrs", "DQ-10-012"], ["급경사지명", "attrs", "DQ-10-001"]],
  위험저수지: [["정밀안전진단 위험등급", "attrs", "DQ-10-006"], ["준공년도", "attrs", "DQ-10-006"], ["총사업비(백만원)", "plan", "DQ-10-008"]],
  풍수해개선지구: [["위험등급", "attrs", "DQ-10-025"], ["유형", "attrs", "DQ-10-025"], ["사업명", "plan", "DQ-10-025"]],
  상습침수지역: [["최대침수건수", "attrs", "DQ-10-028"], ["필지수", "attrs", "DQ-10-028"]],
  산사태취약지역: [["위험등급", "attrs", "DQ-10-017"], ["종류", "attrs", "DQ-10-017"]],
  홍수취약지구: [["유형", "attrs", "DQ-10-021"], ["하천등급", "attrs", "DQ-10-021"], ["관리번호('26)", "attrs", "DQ-10-024"]],
  지하차도: [["시설명", "attrs", "DQ-11-001"], ["진행상태", "plan", "DQ-11-008"]],
  야영장: [["야영장명", "attrs", "DQ-11-001"]],
  건축물지하공간: [["지하층수", "attrs", "DQ-11-010"], ["주용도", "attrs", "DQ-11-012"]],
  소하천: [["소하천명칭", "attrs", "DQ-13-001"], ["총길이(m)", "attrs", "DQ-13-003"]],
  하천위험요소: [["위험요소", "attrs", "DQ-15-007"], ["대상시설", "attrs", "DQ-15-007"]],
};
const GR10 = new Set(["급경사지", "붕괴위험지역", "산사태취약지역", "위험저수지", "풍수해개선지구", "상습침수지역", "홍수취약지구"]);
const scalar = (v) => v != null && v !== "" && typeof v !== "object";

function valuesFor(ent) {
  const out = [];
  if (ent.type === "risk") {
    const o = risks.get(ent.id);
    if (!o) return out;
    if (GR10.has(o.category) && scalar(o.grade)) out.push({ dqId: "DQ-10-001", entityType: "risk", entityId: o.id, field: "위험 등급", expected: String(o.grade) });
    for (const [field, where, dqId] of PICK[o.category] ?? []) {
      const v = (o[where] ?? {})[field];
      if (scalar(v)) out.push({ dqId, entityType: "risk", entityId: o.id, field, expected: String(v) });
    }
  } else if (ent.type === "event") {
    const e = events.get(ent.id);
    if (!e) return out;
    out.push({ dqId: "DQ-04-008", entityType: "event", entityId: e.eventId, field: "재난마스터 ID", expected: e.eventId });
    out.push({ dqId: "DQ-04-001", entityType: "event", entityId: e.eventId, field: "재난유형", expected: e.typeName });
    out.push({ dqId: "DQ-04-001", entityType: "event", entityId: e.eventId, field: "기간", expected: e.startDate });
  }
  return out;
}

async function ask(question, presetKey, context) {
  const r = await fetch(`${BASE}/api/agent/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: "gold", question, presetKey, context }) });
  if (!r.ok) throw new Error(`${r.status} ${question}`);
  return r.json();
}
function expectFrom(res, intent) {
  const head = res.blocks.find((b) => b.kind === "headline")?.text ?? "";
  const headIds = [...new Set([...head.matchAll(/\{\{e:([^}]+)\}\}/g)].map((m) => m[1]))];
  const ids = (res.mapFocus?.entityIds?.length ? res.mapFocus.entityIds : headIds).slice(0, 5);
  const byId = new Map(res.entities.map((e) => [e.id, e]));
  const values = [...new Set([...headIds, ...ids])].map((id) => byId.get(id)).filter((e) => e && (e.type === "risk" || e.type === "event")).slice(0, 2).flatMap(valuesFor);
  return { intent: intent ?? res.intent, entityIds: ids, values, citations: res.citations.slice(0, 2).map((c) => ({ docId: c.docId, ...(c.page != null ? { page: c.page } : {}) })) };
}
const clean = (o) => JSON.parse(JSON.stringify(o));

const items = [];
// ① 골든 질문 (AI 모드 켜짐 기준)
const golden = [...fs.readFileSync("scripts/golden.mjs", "utf8").matchAll(/\["(\w+)", "([^"]+)", "([\w-]+)"(?:, "(\w+)")?\]/g)];
for (const [i, m] of golden.entries()) {
  const [, region, q, want, preset] = m;
  const context = { region, disasterType: "호우", baseTime: BASE_TIME, mode: "scenario", aiMode: true };
  const res = await ask(q, preset, context);
  items.push(clean({ id: `G-${String(i + 1).padStart(2, "0")}`, group: "골든 질문", question: q, presetKey: preset, context, expect: expectFrom(res, want) }));
}
// ② 특보 참조 질문
const wx = (await (await fetch(`${BASE}/api/weather?region=national&mode=scenario`)).json()).advisories;
const wxref = [...fs.readFileSync("scripts/wxref.mjs", "utf8").matchAll(/\["([^"]+)", "([^"]+)", "(\w+)", "([^"]+)", "([\w-]+)"(?:, "([\w-]+)")?\]/g)];
for (const [i, m] of wxref.entries()) {
  const [, type, level, regionId, q, want, preset] = m;
  const adv = wx.find((a) => a.type === type && a.level === level && a.regionId === regionId && a.status === "발효");
  if (!adv) continue;
  const context = { region: "national", disasterType: "호우", baseTime: BASE_TIME, mode: "scenario", refAdvisory: { id: adv.id, type, level, area: adv.area, issuedAt: adv.issuedAt, regionId } };
  const res = await ask(q, preset, context);
  items.push(clean({ id: `W-${String(i + 1).padStart(2, "0")}`, group: "특보로 질문", question: q, presetKey: preset, context, expect: expectFrom(res, want) }));
}
// ③ 업무 단계별 추천 질문 (역량질문 CQ)
for (const region of ["busan", "yeongcheon", "inje", "national"]) {
  const s = await (await fetch(`${BASE}/api/scenarios?region=${region}`)).json();
  for (const it of s.library) {
    const context = { region, disasterType: "호우", baseTime: BASE_TIME, mode: "scenario", aiMode: true };
    const res = await ask(it.q, it.preset, context);
    if (res.intent === "clarify") continue;
    items.push(clean({ id: `CQ-${region.slice(0, 2).toUpperCase()}-${it.id}`, cq: it.cq, group: it.stage, question: it.q, presetKey: it.preset, context, expect: expectFrom(res) }));
  }
}
const out = {
  meta: {
    name: "UNE 시드 기준 정답셋 v0.1",
    builtAt: new Date().toISOString(),
    source: "기대 의도 = 회귀 점검 기대값 · 기대 대상 ID·근거 = 훈련 시나리오 응답 · 기대 항목값 = 시드 원본. T3Q 정답셋 수신 시 교체",
    count: items.length,
  },
  items,
};
fs.writeFileSync("data/seed/gold_set.json", JSON.stringify(out, null, 1) + "\n");
console.log("items", items.length, "values", items.reduce((n, x) => n + x.expect.values.length, 0), "by group", Object.entries(items.reduce((m, x) => ((m[x.group] = (m[x.group] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(" · "));
