import "server-only";
import type { EntityRef, QueryContext, RegionId } from "../../contract/agent";
import riversIdx from "@data/geo/rivers_index.json";
import riverPlans from "@data/seed/river_plans.json";
import { EVENTS, EVENT_BY_ID, SR_BY_ID, eventRef, eventsInRegion, fmtKrw, fmtKrwThousand, r119Ref, regionRecord, type DisasterEvent, type RegionRecord } from "../events";
import { MANUAL_BY_REGION, type Manual } from "../manual";
import { ledgerMentioning } from "../ledger";
import { risksLinkedToEvent } from "./composers2";
import { relevant119, RISKS, categoriesFromText, dist, nearbyRisks, rankRisks, riskRef, risksIn, type RiskObject } from "../risk";
import {
  Answer, cite119, citeEvent, citeKMA, citeManual, citeRisk, citeSR, hhmm, hourlySeries, mdhm, rainThresholds, rname, rshort, situation, ymd, type Situation,
} from "./core";

/* =========================================================
   공통 유틸
   ========================================================= */
const PILOTS: Exclude<RegionId, "national">[] = ["busan", "yeongcheon", "inje"];
const top = (m: Record<string, number> | undefined, n = 3) =>
  Object.entries(m ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n) as [string, number][];
/** "(a 1·b 2)" — 비어 있으면 빈 문자열 */
const paren = (m: Record<string, number> | undefined, n = 3, sep = "·") => {
  const t = top(m, n);
  return t.length ? `(${t.map(([k, v]) => `${k} ${v}`).join(sep)})` : "";
};
const josa = (w: string, a: string, b: string) => {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
};
/** 원천 지구명 중 날짜·기간 문자열 제외 */
const cleanDistricts = (l: string[]) => l.filter((d) => !/^\d|장마철|집중호우/.test(d));
export const tidyBasis = (b: string) => b.replace(/↔\s*미상\s*mm/g, "↔ 자료 없음").replace(/10월\(태풍·늦여름\)/g, "10월(가을 태풍기)");
const firstSentence = (s: string, max = 120) => {
  const t = s.split(/(?<=[.다])\s|;\s| — /)[0];
  return t.length > max ? t.slice(0, max) + "…" : t;
};
const CAT_LABEL = (cats: string[]) =>
  cats.length === 0 ? "위험·취약지역" : cats.includes("급경사지") && cats.includes("붕괴위험지역") ? "급경사지(붕괴위험지역 포함)" : cats.join("·");

/** 매뉴얼 현장조치 중 범주와 관련된 것 */
const FA_RE: Record<string, RegExp> = {
  지하차도: /지하차도|취약도로/, 급경사지: /급경사|산사태|사면/, 붕괴위험지역: /급경사|산사태|사면/, 산사태취약지역: /산사태|급경사|산악/,
  상습침수지역: /저지대|침수|주차장/, 홍수취약지구: /하천|제방|범람/, 풍수해개선지구: /재해위험|급경사|저지대|인명피해/, 위험저수지: /저수지|인명피해/,
  야영장: /계곡|야영|물놀이|유원지/, 소하천: /세월교|하천|계곡/, 하천위험요소: /하천|하상/, 건축물지하공간: /지하|저지대/,
};
function fieldActionsFor(m: Manual, cats: string[]) {
  const res = cats.length ? cats.map((c) => FA_RE[c]).filter(Boolean) : [/./];
  return m.fieldActions.filter((f) => res.some((re) => re.test(f.target)));
}
/** 현장조치 문장 중 현재 단계 표시가 붙은 것 우선 */
function stageLines(lines: string[], level: Situation["level"]) {
  const tag = level === "경보" ? /호우경보|경보/ : level === "주의보" ? /주의보/ : /예비|평상/;
  const tagged = lines.filter((l) => /^\[/.test(l));
  const hit = tagged.filter((l) => tag.test(l.slice(0, 12)));
  return (hit.length ? hit : lines.filter((l) => !/^\[복구\]/.test(l))).slice(0, 3);
}

/* =========================================================
   1. 위험·취약지역 — 어디 / 왜 / 언제 / 무엇을
   ========================================================= */
export function composeRisk(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-04 위험·취약지역 조회");
  let cats = categoriesFromText(q);
  if (cats.includes("급경사지") || cats.includes("붕괴위험지역")) cats = [...new Set([...cats, "급경사지", "붕괴위험지역"])];
  const s = situation(ctx);
  if (ctx.region === "national") return composeRiskNational(a, ctx, cats);

  const list = risksIn(ctx.region, ctx.sigungu).filter((r) => !cats.length || cats.includes(r.category));
  if (!list.length) {
    a.status = "clarify";
    a.push({ kind: "notice", tone: "warn", text: `${rname(ctx.region)}${ctx.sigungu ? " " + ctx.sigungu : ""}에서 ${CAT_LABEL(cats)} 데이터가 조회되지 않습니다. 해당 범주는 수신 데이터에 이 지역 레코드가 없습니다(예: 인제군 지하차도 0곳).` });
    a.followUps = [`${rname(ctx.region)} 위험·취약지역 전체를 보여주세요`, "산사태 취약지역은 어디인가요?"];
    a.title = `${rshort(ctx.region)} ${CAT_LABEL(cats)} 조회`;
    return;
  }
  const ranked = rankRisks(list, ctx.region, { active: s.active && s.mode === "scenario" });
  const t3 = diverse(ranked, 3);
  const label = CAT_LABEL(cats);
  a.title = `${rshort(ctx.region)} ${label} — 어디·왜·언제 위험한가`;

  // 헤드라인
  const names = t3.map((r) => a.e(riskRef(r.o, { near: r.near.length })));
  let head = `${rname(ctx.region)}${ctx.sigungu ? " " + ctx.sigungu : ""}의 ${label} **${list.length.toLocaleString()}곳** 중 지금 먼저 볼 곳은 ${names.join(", ")}입니다.`;
  if (s.active) head += ` ${s.advisoryText}가 ${mdhm(s.issuedAt)}부터 발효 중이고 시간 최대 **${s.rain1hMax}mm**(${hhmm(s.peakAt)})가 관측돼, 아래 '언제 위험해지나' 기준을 이미 넘었거나 근접한 곳을 우선했습니다.`;
  const nearTop = t3.find((r) => r.near.length);
  if (nearTop) {
    const rp = nearTop.near[0];
    head += ` 특히 ${a.e(riskRef(nearTop.o))} 1km 안에서 ${hhmm(rp.신고일시.replace(" ", "T"))} '${rp.ext.callSummary.slice(0, 32)}' 119 신고${cite119(a, rp)}가 접수됐습니다.`;
  }
  a.push({ kind: "headline", text: head });

  // 핵심 수치
  const high = list.filter((r) => r.risk_level === "high").length;
  const withPlan = list.filter((r) => r.plan && !/완료|해제|대상아님/.test(String(r.plan["진행상태"] ?? r.plan["사업구분(진행상태)"] ?? ""))).length;
  const withHist = list.filter((r) => r.history?.length).length;
  const nearN = ranked.filter((r) => r.near.length).length;
  a.push({
    kind: "facts",
    items: [
      { label: `${label} 전체`, value: list.length.toLocaleString(), unit: "곳", note: Object.entries(countBy(list, (r) => r.category)).map(([k, v]) => `${k} ${v}`).join(" · ") },
      { label: "위험수준 상", value: String(high), unit: "곳", tone: high ? "danger" : undefined, note: "원천별 등급 기준 상이(급경사지 D·E, 개선지구 가, 산사태 A 등)" },
      { label: "정비 진행·계획", value: String(withPlan), unit: "곳", note: "'26~'30 중기계획 등 정비사업" },
      { label: "과거 피해 이력", value: String(withHist), unit: "곳", note: "같은 읍면동 재해대장 피해" },
      ...(s.active && nearN ? [{ label: "진행 중 119 신고 인근", value: String(nearN), unit: "곳", tone: "warn" as const, note: "관련 유형 신고 지점 반경 1km" }] : []),
    ],
  });

  // 어디·왜·언제
  const paras = t3.map((r, i) => {
    const o = r.o;
    const where = `${o.region.sigungu} ${o.region.emd ?? ""}${addrOf(o) ? ` (${addrOf(o)})` : ""}${o.coordApprox ? " · 위치는 읍면동 내 근사" : ""}`;
    const hist = (o.history ?? []).slice(0, 2).map((h) => `${ymd(h.date)} ${h.disaster ?? "침수"}${h.damaged_facilities_in_emd ? ` 때 같은 읍면동 공공시설 ${h.damaged_facilities_in_emd}건 피해` : h.parcels_flooded ? ` 침수` : ""}`).join(", ");
    const plan = o.plan ? planText(o.plan) : "";
    return `**${i + 1}. ${a.e(riskRef(o))}** — **어디** ${where}. **왜** ${firstSentence(o.reason, 140)}${citeRisk(a, o)}. **언제** ${firstSentence(o.trigger.text, 150)}${o.trigger.derived ? " (일반 기준 적용)" : " (지자체·기관 제출 기준)"}.${hist ? ` **이력** ${hist}.` : ""}${plan ? ` **정비** ${plan}.` : ""}`;
  });
  a.push({ kind: "narrative", title: "먼저 볼 곳 — 어디 · 왜 · 언제", paragraphs: paras });

  // 무엇을 (매뉴얼)
  const m = s.manual;
  if (m) {
    const fas = fieldActionsFor(m, cats.length ? cats : [...new Set(t3.map((r) => r.o.category))]).slice(0, 3);
    const items = fas.flatMap((f) => stageLines(f.actions, s.level).map((l) => ({ l, f })));
    if (items.length) {
      a.push({
        kind: "actions",
        title: "무엇을 해야 하나 — 행동매뉴얼 현장조치",
        stage: { name: s.stage?.name.replace(/\s*\(.*\)/, "") ?? "평시·예비특보 대비", level: s.stage?.emergencyLevel.split(" — ")[0], trigger: fas[0]?.criteria.slice(0, 120) },
        manualId: `${m.id}:FA`,
        items: items.slice(0, 7).map(({ l, f }, i) => ({ seq: i + 1, task: `[${f.target.replace(/\s*\(.*\)/, "")}] ${l.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[p[\d-]+\]$/, "")}`, owner: undefined, due: s.level === "경보" ? "즉시" : undefined, cite: [a.cid(citeManual(a, m, f.page, f.criteria.slice(0, 160)))] })),
      });
    }
  }

  // 조회결과 목록
  const groups = Object.entries(countBy(list, (r) => r.category))
    .sort((x, y) => y[1] - x[1])
    .map(([cat]) => {
      const rr = ranked.filter((r) => r.o.category === cat);
      return { key: `risk:${cat}`, label: cat, total: rr.length, items: rr.slice(0, 60).map((r) => riskRef(r.o, { near: r.near.length })) };
    });
  a.push({ kind: "results", groups });
  groups.forEach((g) => g.items.slice(0, 12).forEach((it) => a.ents.set(it.id, it)));
  a.focus = t3.map((r) => r.o.id);
  a.focusRef = t3[0] ? riskRef(t3[0].o) : undefined;
  a.followUps = [
    `${t3[0] ? riskRef(t3[0].o).name : label} 주변 과거 피해는?`,
    "지금 특보 단계에서 매뉴얼상 해야 할 일은?",
    "비슷한 강우 때 과거에 어디가 침수됐나요?",
  ];
}

function composeRiskNational(a: Answer, ctx: QueryContext, cats: string[]) {
  const label = CAT_LABEL(cats);
  a.title = `시범 3개 지역 ${label} 비교`;
  const rows = PILOTS.map((r) => {
    const list = risksIn(r).filter((x) => !cats.length || cats.includes(x.category));
    const s = situation(ctx, r);
    return { r, list, s, ranked: rankRisks(list, r, { active: s.active && s.mode === "scenario" }) };
  });
  a.push({
    kind: "headline",
    text: rows.map((x) => `${rshort(x.r)} ${x.list.length.toLocaleString()}곳${x.ranked[0] ? `(우선 ${a.e(riskRef(x.ranked[0].o, { near: x.ranked[0].near.length }))})` : ""}`).join(", ") + `의 ${label}을 관리하고 있습니다. 특보가 발효 중인 지역은 ${rows.filter((x) => x.s.active).map((x) => `${rshort(x.r)}(${x.s.advisoryText})`).join(", ") || "없습니다"}.`,
  });
  a.push({
    kind: "facts",
    items: rows.map((x) => ({ label: rname(x.r), value: x.list.length.toLocaleString(), unit: "곳", tone: x.s.level === "경보" ? ("danger" as const) : undefined, note: top(countBy(x.list, (o) => o.category), 3).map(([k, v]) => `${k} ${v}`).join(" · ") })),
  });
  a.push({ kind: "results", groups: rows.map((x) => ({ key: `risk:${x.r}`, label: rshort(x.r), total: x.list.length, items: x.ranked.slice(0, 40).map((r) => riskRef(r.o, { near: r.near.length })) })) });
  rows.forEach((x) => x.ranked.slice(0, 5).forEach((r) => a.ents.set(r.o.id, riskRef(r.o, { near: r.near.length }))));
  a.focus = rows.flatMap((x) => x.ranked.slice(0, 3).map((r) => r.o.id));
  a.followUps = ["부산 급경사지는 어디고 왜 위험한가요?", "인제군 계곡 야영장 중 먼저 철수시킬 곳은?", "영천 위험저수지 현황은?"];
}

/** 상위 n개 — 같은 읍면동 중복 회피 (부족하면 순위대로 채움) */
function diverse<T extends { o: RiskObject }>(ranked: T[], n: number) {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    const k = `${r.o.region.sigungu}-${r.o.region.emd ?? ""}`;
    if (!seen.has(k)) { out.push(r); seen.add(k); }
    if (out.length === n) return out;
  }
  for (const r of ranked) if (!out.includes(r) && out.length < n) out.push(r);
  return out;
}

function addrOf(o: RiskObject) {
  const at = o.attrs;
  return String(at["주소"] ?? at["위치"] ?? at["대표지번"] ?? at["상세주소"] ?? at["대지위치"] ?? "").replace(/^(부산광역시|경상북도|강원특별자치도|강원도)\s*/, "").slice(0, 40);
}
function planText(p: Record<string, unknown>) {
  const nm = p["사업명"] ? String(p["사업명"]) : "";
  const st = p["진행상태"] ?? p["사업구분(진행상태)"];
  const cost = p["총사업비(백만원)"];
  const per = (p["기간"] as Record<string, unknown> | undefined)?.["투자연도"];
  if (!nm && !st) return "";
  return `${nm}${cost ? ` · 총 ${Number(cost).toLocaleString()}백만원` : ""}${per ? ` · ${per}` : ""}${st ? ` · ${st}` : ""}`;
}
function countBy<T>(l: T[], f: (x: T) => string) {
  const m: Record<string, number> = {};
  l.forEach((x) => (m[f(x)] = (m[f(x)] ?? 0) + 1));
  return m;
}

/* =========================================================
   2. 과거 유사사례 — "몇 mm일 때 어디가 침수됐나"
   ========================================================= */
interface Sim { e: DisasterEvent; score: number; breakdown: { weather: number; space: number; damage: number; response: number }; reasons: string[]; confidence: string }

function similarFor(ctx: QueryContext, s: Situation): Sim[] {
  const pr = s.region === "national" ? null : s.region;
  const rec = s.rec;
  if (rec && s.event?.similarCases?.[rec.regionRecordId]) {
    return s.event.similarCases[rec.regionRecordId]
      .map((c) => {
        const e = EVENT_BY_ID.get(c.eventId);
        if (!e) return null;
        const f = (n: string) => c.breakdown.find((b) => b.factor === n)?.score ?? 0;
        return {
          e,
          score: Math.round(c.score),
          breakdown: { weather: Math.round(f("강우량") + f("계절")), space: Math.round(f("지역")), damage: Math.round(f("피해유형")), response: Math.round(f("재난유형")) },
          reasons: c.breakdown.map((b) => `${b.factor} ${b.score}/${b.weight} — ${tidyBasis(b.basis)}`),
          confidence: c.confidence,
        } as Sim;
      })
      .filter((x): x is Sim => !!x);
  }
  // 직접 계산 (라이브·조건 입력)
  const r1 = ctx.hydro?.rain1h ?? null;
  const month = Number(ctx.baseTime.slice(5, 7));
  return eventsInRegion(s.region)
    .filter((e) => e.status !== "진행중" && !e.training)
    .map((e) => {
      const typeS = ctx.disasterType === "전체" || e.typeName.includes(ctx.disasterType) ? 20 : e.typeName.match(/호우|태풍/) ? 12 : 4;
      const em = e.weather.maxHourlyRain_mm;
      const rainS = r1 && em ? Math.max(0, 30 * (1 - Math.abs(em - r1) / Math.max(em, r1))) : 12;
      const regS = pr && regionRecord(e, pr) ? 20 : 8;
      const mo = Number(e.startDate.slice(5, 7));
      const seasonS = Math.max(0, 10 - Math.abs(mo - month) * 3.3);
      const rec2 = pr ? regionRecord(e, pr) : e.regions[0];
      const dmgS = Math.min(20, (rec2?.damageTags.length ?? 0) * 4);
      const score = Math.round(typeS + rainS + regS + seasonS + dmgS);
      return {
        e,
        score,
        breakdown: { weather: Math.round(rainS + seasonS), space: regS, damage: dmgS, response: typeS },
        reasons: [`재난유형 ${e.typeName}`, em ? `시간최대 ${em}mm${r1 ? ` ↔ 입력 ${r1}mm` : ""}` : "강우자료 미확보(ASOS 연계 필요) — 강우항목 중립 처리", `계절 ${mo}월`],
        confidence: em ? "높음" : "보통(강우 미확보)",
      };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
}

/** 사건의 "어디가 어떻게" 요약 문장 */
function whereFlooded(a: Answer, e: DisasterEvent, rec: RegionRecord | undefined) {
  if (!rec) return "";
  const parts: string[] = [];
  const h = rec.damages.privateFacility?.housing;
  if (h?.flooded) parts.push(`주택 ${h.flooded.toLocaleString()}동 침수${paren(h.bySigungu)}`);
  const ft = rec.floodTraces;
  const cd = cleanDistricts(ft?.districts ?? []);
  if (ft?.count) parts.push(`침수흔적 ${ft.count}개소 ${Math.round(ft.totalArea_m2 / 10000).toLocaleString()}ha${cd.length ? `(${cd.slice(0, 3).join("·")} 등)` : ""}`);
  const pl = rec.damages.publicFacilityLedger;
  if (pl?.facilityCount) parts.push(`공공시설 ${pl.facilityCount}건 피해 ${fmtKrwThousand(pl.damage_krw_thousand)}${paren(pl.bySigungu, 2)}`);
  const pf = rec.damages.publicFloodItems;
  if (pf?.count && !pl) parts.push(`공공시설 침수피해 ${pf.count}건(${pf.items.slice(0, 2).map((i) => i.address.replace(/^부산광역시\s*|^경상북도\s*|^강원특별자치도\s*/, "").split(" ").slice(0, 3).join(" ")).join(", ")} 등)`);
  const ins = rec.damages.insurance;
  if (ins?.house?.claims) parts.push(`풍수해보험 주택 ${ins.house.claims}건 지급`);
  const hu = rec.damages.human;
  if (hu?.dead) parts.push(`사망 ${hu.dead}명${/검증/.test(hu.source ?? "") ? "※" : ""}`);
  return parts.length ? parts.slice(0, 3).join(", ") + citeEvent(a, e) : "";
}

export function composeSimilar(a: Answer, ctx: QueryContext) {
  a.apis.add("T3Q-06 유사사례 조회");
  a.apis.add("T3Q-07 재난사건 상세");
  const s = situation(ctx);
  const sims = similarFor(ctx, s);
  const pr = s.region === "national" ? undefined : s.region;
  a.title = `${rshort(s.region)} 과거 유사 강우 피해 사례`;
  if (!sims.length) {
    a.status = "clarify";
    a.push({ kind: "notice", tone: "warn", text: "조건에 맞는 과거 사건을 찾지 못했습니다. 재난유형·지역 조건을 넓혀 주세요." });
    return;
  }
  const t = sims[0];
  const rec = pr ? regionRecord(t.e, pr) : t.e.regions[0];
  const cur = s.rain1hMax != null ? `시간당 **${s.rain1hMax}mm**${s.rainTotal ? ` · 누적 ${s.rainTotal}mm` : ""}인 지금과` : "현재 조건과";
  const tRain = t.e.weather.maxHourlyRain_mm != null ? `시간 최대 **${t.e.weather.maxHourlyRain_mm}mm**${/검증/.test(t.e.weather.rainfallSource) ? "※" : ""}` : "강우자료 미확보";
  const wf = whereFlooded(a, t.e, rec);
  a.push({
    kind: "headline",
    text: `${cur} 가장 비슷한 과거 사례는 ${a.e(eventRef(t.e, pr))}(유사도 ${t.score})입니다. 당시 ${tRain}의 비로 ${wf || "피해가 발생했습니다"}.${/※/.test(tRain + wf) ? " ※ 공개자료 기반 수치(기상청·NDMS 검증 필요)" : ""}`,
  });

  // 핵심 수치: 1순위 사건
  const facts = [];
  if (t.e.weather.maxHourlyRain_mm != null) facts.push({ label: "당시 시간 최대 강우", value: String(t.e.weather.maxHourlyRain_mm), unit: "mm", tone: "danger" as const, note: s.rain1hMax != null ? `현재 ${s.rain1hMax}mm (${Math.round((s.rain1hMax / t.e.weather.maxHourlyRain_mm) * 100)}% 수준)` : undefined });
  const h = rec?.damages.privateFacility?.housing;
  if (h?.flooded) facts.push({ label: "주택 침수", value: h.flooded.toLocaleString(), unit: "동", tone: "warn" as const, note: top(h.bySigungu, 3).map(([k, v]) => `${k} ${v}`).join(" · ") });
  if (rec?.floodTraces?.count) facts.push({ label: "침수흔적", value: String(rec.floodTraces.count), unit: "개소", note: `침수면적 ${Math.round(rec.floodTraces.totalArea_m2 / 10000)}ha` });
  const pl = rec?.damages.publicFacilityLedger;
  if (pl) facts.push({ label: "공공시설 피해·복구", value: fmtKrwThousand(pl.damage_krw_thousand), note: `복구비 ${fmtKrwThousand(pl.recovery_krw_thousand)} · ${pl.facilityCount}건` });
  if (rec?.damages.human?.dead) facts.push({ label: "인명피해", value: String(rec.damages.human.dead), unit: "명", tone: "danger" as const, note: "사망 · 공개자료 기반(검증필요)" });
  if (facts.length) a.push({ kind: "facts", title: `${t.e.title} — 그때 무슨 일이`, items: facts });

  // 사건별 어디가 어떻게
  const paras = sims.slice(0, 3).map((x, i) => {
    const r2 = pr ? regionRecord(x.e, pr) : x.e.regions[0];
    const traces = r2?.floodTraces?.records?.filter((f) => !/^\d|장마철/.test(f.district)).slice(0, 3).map((f) => `${f.district}(${Math.round(f.area_m2).toLocaleString()}㎡, ${f.begin.slice(5)}~)`).join(", ");
    const items = r2?.damages.publicFloodItems?.items?.slice(0, 2).map((it) => `${it.address.replace(/^(부산광역시|경상북도|강원특별자치도)\s*/, "")} ${it.summary.slice(0, 28)}`).join("; ");
    const tops = r2?.damages.publicFacilityLedger?.topFacilities?.slice(0, 2).map((f) => `${f.facility}(${f.type}, ${fmtKrwThousand(f.damage_krw_thousand)})`).join(", ");
    return `**${i + 1}. ${a.e(eventRef(x.e, pr))}** — ${x.e.weather.maxHourlyRain_mm != null ? `시간최대 ${x.e.weather.maxHourlyRain_mm}mm. ` : "강우 미확보(ASOS 연계 대상). "}${whereFlooded(a, x.e, r2) || r2?.summary || ""}.${traces ? ` 침수 지점: ${traces}.` : ""}${items ? ` 시설 피해: ${items}.` : ""}${tops ? ` 큰 피해 시설: ${tops}.` : ""}`;
  });
  a.push({ kind: "narrative", title: "어느 정도 비에 어디가 잠겼나", paragraphs: paras });

  a.push({
    kind: "similar",
    items: sims.slice(0, 5).map((x) => ({ eventId: x.e.eventId, title: x.e.title, score: x.score, breakdown: x.breakdown, summary: (pr ? regionRecord(x.e, pr)?.summary : x.e.summary)?.slice(0, 90) ?? "", reasons: x.reasons })),
  });
  sims.forEach((x) => a.ents.set(x.e.eventId, eventRef(x.e, pr)));

  // 1순위 사건 침수흔적을 지도에
  const ft = rec?.floodTraces?.records ?? [];
  const pts: EntityRef[] = ft.slice(0, 12).map((f) => ({ type: "damage", id: f.traceId, name: f.district, category: "침수흔적", lon: f.centroid.lon, lat: f.centroid.lat, summary: `${f.disasterName} · 침수면적 ${Math.round(f.area_m2).toLocaleString()}㎡ · ${f.cause}`, metric: `${Math.round(f.area_m2 / 1000).toLocaleString()}천㎡`, level: "mid" }));
  if (pts.length) {
    a.push({ kind: "results", groups: [{ key: `trace:${t.e.eventId}`, label: `${ymd(t.e.startDate)} 침수흔적`, total: rec?.floodTraces?.count ?? pts.length, items: pts }] });
    pts.forEach((p) => a.ents.set(p.id, p));
    a.focus = pts.map((p) => p.id);
  }
  // 과거 재난 ↔ 현재 위험·취약지역 연관 (발주처 요구)
  const linked = risksLinkedToEvent(t.e, s.region === "national" ? "busan" : s.region);
  const undone = linked.filter((o) => /급경사|붕괴|개선지구|저수지|홍수/.test(o.category) && !/완료|해제/.test(String(o.plan?.["진행상태"] ?? o.plan?.["사업구분(진행상태)"] ?? "")));
  if (linked.length) {
    a.push({ kind: "notice", tone: "warn", text: `그때 피해가 난 동네에는 지금 위험·취약지역 **${linked.length}곳**(산사태·급경사 ${linked.filter((o) => /산사태|급경사|붕괴/.test(o.category)).length}곳 포함)이 관리되고 있고, 이 중 법정 위험지구 **${undone.length}곳은 정비가 끝나지 않았습니다** — ${undone.slice(0, 3).map((o) => a.e(riskRef(o))).join(", ")}. 같은 강도의 비가 오면 먼저 볼 곳입니다.` });
  }
  a.focusRef = eventRef(t.e, pr);
  if (sims.some((x) => x.e.weather.maxHourlyRain_mm == null))
    a.push({ kind: "notice", tone: "info", text: `수신 데이터(재해대장·피해내역)에는 강우량이 없어 ${sims.filter((x) => x.e.weather.maxHourlyRain_mm == null).length}개 사건은 강우를 비교하지 못했습니다. T3Q가 사건 기간·시군구로 기상청 ASOS/AWS 강우를 결합하면 "몇 mm에서 어디가 잠겼는지"가 사건마다 채워집니다.` });
  a.followUps = ["그때 피해가 난 곳은 지금 어떻게 관리되나요?", "그때 복구는 어떻게 됐나요?", "그때 어떤 통제·대피 조치를 했나요?", "1·2순위 사례를 비교해 주세요"];
}

/* =========================================================
   3. 행동매뉴얼 대응절차 — "내가 지금 뭘 해야 하지"
   ========================================================= */
export function composeManual(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  const s = situation(ctx);
  if (ctx.region === "national" || !s.manual) {
    a.status = "clarify";
    a.title = "행동매뉴얼 대응절차 — 지역 선택";
    a.push({ kind: "headline", text: "행동매뉴얼은 지자체별로 다릅니다. 어느 지역 매뉴얼로 안내할까요? 시범 3개 지역 매뉴얼의 단계 구성은 아래와 같습니다." });
    a.push({
      kind: "facts",
      items: PILOTS.map((r) => {
        const m = MANUAL_BY_REGION[r];
        const ss = situation(ctx, r);
        return { label: rname(r), value: ss.stage ? ss.stage.name.replace(/\s*\(.*\)/, "") : "평시", note: `${m.responsibleDept} · ${m.stages.length}단계 · 조치 ${m.taskCount}개`, tone: ss.level === "경보" ? ("danger" as const) : undefined };
      }),
    });
    a.followUps = PILOTS.map((r) => `${rshort(r)} 매뉴얼상 지금 해야 할 일은?`);
    return;
  }
  const m = s.manual;
  const damage = /신고|피해|접수|발생/.test(q);
  const recover = /복구|해제|수습/.test(q);
  const stage = damage ? m.stages.find((x) => /신고/.test(x.name)) ?? m.stages.find((x) => /피해 발생/.test(x.name)) ?? s.stage : recover ? m.stages.find((x) => /해제|복구/.test(x.name)) ?? s.stage : s.stage ?? m.stages[0];
  if (!stage) return;
  a.title = `${rshort(s.region)} ${stage.name.replace(/\s*\(.*\)/, "")} — 매뉴얼 대응절차`;
  const tasks = stage.tasks;
  const first3 = tasks.slice(0, 3).map((t) => t.task.split(" — ")[0]);
  const lvl = stage.emergencyLevel.split(" — ")[0];
  const lvlShort = (lvl.match(/(지대본\s*)?비상\s*[\d·]+단계/)?.[0] ?? lvl.replace(/\(.*\)/, "")).replace(/^지대본\s*/, "").trim();
  a.push({
    kind: "headline",
    text: s.active && !damage && !recover
      ? `${s.rname}에 **${s.advisoryText}**가 ${mdhm(s.issuedAt)}부터 발효 중이므로, ${m.responsibleDept} 매뉴얼상 **${lvlShort}**(${stage.name.replace(/\s*\(.*\)/, "")} 시)입니다${citeManual(a, m, tasks[0]?.page)}. 가장 먼저 ① ${first3[0]} ② ${first3[1] ?? ""} ③ ${first3[2] ?? ""}부터 하십시오.`
      : `${m.region} 매뉴얼 **${stage.name.replace(/\s*\(.*\)/, "")}** 단계 조치입니다${citeManual(a, m, tasks[0]?.page)}. ${s.active ? "" : "현재 발효 특보는 없으며, 특보가 발표되면 이 순서대로 진행합니다."}`,
  });
  const staffing = stage.emergencyLevel.match(/근무[:：]?\s*([^[]+)/)?.[1]?.trim();
  const reportRule = m.reporting.find((r) => /대처상황|상황보고/.test(r.what) && /\d+시/.test(r.when));
  a.push({
    kind: "facts",
    items: [
      { label: "비상 단계", value: lvlShort.slice(0, 12), tone: s.level === "경보" ? "danger" : "warn", note: stage.trigger.slice(0, 60) },
      { label: "이 단계 조치", value: String(tasks.length), unit: "개", note: `매뉴얼 전체 ${m.taskCount}개 중` },
      ...(staffing ? [{ label: "근무 체계", value: staffing.match(/\((\d+명\+?α?)\)/)?.[1] ?? staffing.match(/=\s*(\d+명)/)?.[1] ?? staffing.match(/\d+명/)?.[0] ?? "—", note: staffing.slice(0, 80) }] : []),
      ...(reportRule ? [{ label: "정기 보고", value: (reportRule.when.match(/[\d·]+시/) ?? ["수시"])[0], note: `${reportRule.what} → ${reportRule.to.slice(0, 30)}`, cite: [a.cid(citeManual(a, m, reportRule.page))] }] : []),
    ],
  });
  a.push({
    kind: "actions",
    title: "지금 할 일 — 순서대로",
    stage: { name: stage.name.replace(/\s*\(.*\)/, ""), level: lvlShort, trigger: stage.trigger },
    manualId: `${m.id}:${stage.stageId}`,
    items: tasks.slice(0, 12).map((t) => ({ seq: t.seq, task: t.task, owner: t.owner, due: t.timing, cite: [a.cid(citeManual(a, m, t.page, t.task.slice(0, 120)))] })),
  });
  // 현장 통제 기준 (특보 단계에 해당하는 줄)
  const fa = m.fieldActions.slice(0, 6).map((f) => {
    const lines = stageLines(f.actions, s.level);
    return `**${f.target.replace(/\s*\(.*\)/, "")}** — ${f.criteria.slice(0, 110)}${f.criteria.length > 110 ? "…" : ""}${citeManual(a, m, f.page)} → ${lines.map((l) => l.replace(/\s*\[p[\d-]+\]$/, "")).join(" / ").slice(0, 200)}`;
  });
  a.push({ kind: "narrative", title: "현장 통제 기준 (이 단계 해당분)", paragraphs: fa });
  if (s.reports.length && !recover) {
    const n = s.reports.length;
    a.push({ kind: "notice", tone: "warn", text: `이미 119 신고 ${n}건이 접수됐습니다. 매뉴얼 '피해 발생/신고 접수 시' 단계 조치(현장 확인·응급조치·피해 상황보고)를 병행하십시오.` });
  }
  a.followUps = [damage ? "지금 특보 단계 조치를 다시 보여주세요" : "피해 신고가 들어오면 어떤 절차인가요?", "지하차도 통제 기준과 대상은?", "특보 해제 후 복구 절차는?"];
}

/* =========================================================
   4. 현재 기상상황
   ========================================================= */
export function composeWeather(a: Answer, ctx: QueryContext) {
  a.apis.add("UNE-기상특보(기상청)");
  const s = situation(ctx);
  a.title = `${rshort(s.region)} 현재 기상·강우 상황`;
  if (s.region === "national") {
    const rows = PILOTS.map((r) => situation(ctx, r));
    a.push({ kind: "headline", text: rows.map((x) => `${rshort(x.region)} ${x.active ? `**${x.advisoryText}**(시간최대 ${x.rain1hMax ?? "—"}mm)` : "특보 없음"}`).join(", ") + citeKMA(a, ctx.mode === "live", rows.map((x) => x.advisoryText).join(", ")) + "." });
    a.push({ kind: "facts", items: rows.map((x) => ({ label: x.rname, value: x.advisoryText || "특보 없음", tone: x.level === "경보" ? ("danger" as const) : x.level ? ("warn" as const) : ("ok" as const), note: x.rainTotal ? `누적 ${x.rainTotal}mm` : undefined })) });
    a.followUps = PILOTS.map((r) => `${rshort(r)} 강우와 하천 수위는?`);
    return;
  }
  if (!s.active && !s.wx) {
    a.push({ kind: "headline", text: `${s.rname}에는 현재 발효 중인 기상특보가 없습니다${citeKMA(a, ctx.mode === "live", "현재 발효 특보 없음")}. 실시간 강우·수위 관측값은 v1.71 요구사항에서 제외되어, 강우는 [조건 변경]에서 직접 입력하면 과거 피해 임계치와 비교해 드립니다.` });
    a.push({ kind: "rainChart", title: "과거 피해 발생 강우 수준 (참고)", current: { label: "입력 강우", series: ctx.hydro?.rain1h ? [{ t: "입력", mm: ctx.hydro.rain1h }] : [] }, thresholds: rainThresholds(s.region).map(({ mm, label, basis }) => ({ mm, label, basis })) });
    a.followUps = ["시간당 50mm가 오면 어디가 위험한가요?", "우리 지역 위험·취약지역은?"];
    return;
  }
  const th = rainThresholds(s.region);
  const over = th.filter((t) => s.rain1hMax != null && s.rain1hMax >= t.mm);
  const m = s.manual!;
  a.push({
    kind: "headline",
    text: `${s.rname}에 **${s.advisoryText}**가 ${mdhm(s.issuedAt)}부터 발효 중입니다${citeKMA(a, false, `${s.advisoryText} ${s.issuedAt}`)}. ${s.wx?.since ? mdhm(s.wx.since) + "부터 " : ""}누적 **${s.rainTotal}mm**, 시간 최대 **${s.rain1hMax}mm**(${hhmm(s.peakAt)}, ${s.wx?.station ?? ""})로${over.length ? ` ${over.map((o) => `'${o.label}' ${o.mm}mm`).join(", ")} 기준을 넘었습니다${o0cite(a, m, over)}.` : " 아직 매뉴얼 통제 기준 아래입니다."}`,
  });
  const hy = s.wx?.hydro ?? [];
  a.push({
    kind: "facts",
    items: [
      { label: "발효 특보", value: s.advisoryText, tone: s.level === "경보" ? "danger" : "warn", note: `${mdhm(s.issuedAt)} 발표` },
      { label: "시간 최대 강우", value: String(s.rain1hMax ?? "—"), unit: "mm", tone: over.length ? "danger" : undefined, note: `${hhmm(s.peakAt)} 관측` },
      { label: "누적 강우", value: String(s.rainTotal ?? "—"), unit: "mm", note: s.wx?.since ? `${mdhm(s.wx.since)}부터` : undefined },
      ...hy.map((h) => ({ label: h.station.replace(/\(가상\)/, ""), value: String(h.level_m), unit: "m", tone: /범람|근접/.test(h.stage) ? ("danger" as const) : ("warn" as const), note: `수위 단계 ${h.stage}` })),
      ...(s.wx?.tide ? [{ label: "만조", value: hhmm(s.wx.tide.highTideAt), note: s.wx.tide.note.replace(/\(가상\)/, "") }] : []),
    ],
  });
  a.push({ kind: "rainChart", title: "시간당 강우 vs 매뉴얼 통제 기준·과거 피해 강우", current: { label: "시간당 강우", series: hourlySeries(s.wx) }, thresholds: th.map(({ mm, label, basis }) => ({ mm, label, basis })) });
  if (ctx.mode === "scenario") a.push({ kind: "notice", tone: "info", text: "시연 사건의 강우·수위 값은 가상 데이터입니다. 운영 시 강우는 담당자 입력값 또는 T3Q가 결합한 기상청 관측값을 사용합니다." });
  a.followUps = ["지금 강우에서 먼저 볼 위험·취약지역은?", "비슷한 강우 때 과거에 어디가 침수됐나요?", "지금 매뉴얼상 해야 할 일은?"];
}
function o0cite(a: Answer, m: Manual, over: { page?: number }[]) {
  return over.filter((o) => o.page).map((o) => citeManual(a, m, o.page)).join("");
}

/* =========================================================
   5. 119 신고
   ========================================================= */
export function compose119(a: Answer, ctx: QueryContext) {
  a.apis.add("T3Q-11 소방 신고정보 조회");
  const s = situation(ctx);
  const regs = s.region === "national" ? PILOTS.map((r) => situation(ctx, r)) : [s];
  const reps = regs.flatMap((x) => x.reports).sort((x, y) => x.신고일시.localeCompare(y.신고일시));
  const ev = s.event ?? regs.find((x) => x.event)?.event ?? null;
  a.title = `${rshort(s.region)} 119 신고 현황`;
  if (!reps.length || !ev) {
    a.push({ kind: "headline", text: `${s.rname}에 현재 진행 중인 풍수해 사건과 연결된 119 신고가 없습니다. 과거 사건의 신고는 재난사건 상세의 '119 신고' 탭에서 볼 수 있습니다.` });
    a.followUps = ["2020년 7월 23일 부산 호우 때 신고 내용은?", "우리 지역 위험·취약지역은?"];
    return;
  }
  const byType = countBy(reps, (r) => r.ext.accidentType);
  const rescue = reps.reduce((n, r) => n + (r.ext.rescueeCount ?? 0), 0);
  const first = reps[0];
  const peakHour = top(countBy(reps, (r) => r.신고일시.slice(11, 13)), 1)[0];
  a.push({
    kind: "headline",
    text: `${a.e(eventRef(ev, s.region === "national" ? undefined : s.region))}과 관련해 ${s.rname}에 119 신고 **${reps.length}건**이 접수됐습니다. ${mdhm(first.신고일시.replace(" ", "T"))} ${a.e(r119Ref(first))} '${first.ext.callSummary.slice(0, 40)}'${cite119(a, first)}${first.ext.groundedOn && /2020/.test(first.ext.groundedOn) ? "(2020.7.23 침수 지점 — 선제 통제 대상)" : ""}를 시작으로 **${peakHour?.[0]}시대에 ${peakHour?.[1]}건**이 몰렸고, 유형은 ${top(byType, 3).map(([k, v]) => `${k} ${v}건`).join(", ")} 순입니다.${rescue ? ` 구조가 필요한 인원은 **${rescue}명**입니다.` : ""}`,
  });
  a.push({
    kind: "facts",
    items: [
      { label: "신고 접수", value: String(reps.length), unit: "건", tone: "warn" },
      { label: "요구조자", value: String(rescue), unit: "명", tone: rescue ? "danger" : undefined },
      { label: "최다 유형", value: top(byType, 1)[0]?.[0] ?? "—", note: `${top(byType, 1)[0]?.[1] ?? 0}건` },
      { label: "집중 시간대", value: `${peakHour?.[0]}시`, note: s.peakAt ? `강우 정점 ${hhmm(s.peakAt)}과 겹침` : undefined },
    ],
  });
  a.push({
    kind: "timeline",
    title: "신고 → 출동 → 처리 경과",
    items: reps.slice(0, 14).map((r) => ({ at: r.신고일시.slice(5, 16), label: r.ext.accidentType, kind: "119", text: `${a.e(r119Ref(r))} ${r.ext.callSummary} → ${r.ext.result}${cite119(a, r)}` })),
  });
  // 신고 지점 인근 관리대상
  const nearPairs = reps
    .map((r) => ({ r, n: nearbyRisks({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, 0.6)[0] }))
    .filter((x) => x.n);
  if (nearPairs.length) {
    a.push({ kind: "narrative", title: "신고 지점 인근 관리대상 (이미 알려진 위험지역에서 신고가 나오는지)", paragraphs: nearPairs.slice(0, 4).map((x) => `${a.e(r119Ref(x.r))} 신고 지점 ${Math.round(dist({ lon: x.r.ext.coord.lon, lat: x.r.ext.coord.lat }, x.n) * 1000)}m 거리에 ${a.e(riskRef(x.n))}(${x.n.category}${x.n.grade ? `, ${x.n.grade}` : ""})가 있습니다 — ${firstSentence(x.n.reason, 80)}${citeRisk(a, x.n)}.`) });
  }
  a.push({ kind: "results", groups: [{ key: "r119", label: "119 신고", total: reps.length, items: reps.map(r119Ref) }] });
  reps.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  a.focus = reps.map((r) => r.reportId);
  if (reps.some((r) => r.synthetic)) a.push({ kind: "notice", tone: "info", text: "소방긴급구조정보(표준) 21개 항목 구조를 그대로 따르되, 원천 '신고내용'은 개인정보로 마스킹되어 유통되므로 신고 요약은 풍수해 필터링·요약 가공을 가정한 시연값입니다." });
  a.followUps = ["신고가 들어오면 매뉴얼상 어떤 절차인가요?", "신고 지점 주변 과거 침수 이력은?", "지금 먼저 볼 위험·취약지역은?"];
}

/* =========================================================
   6. 특정 재난사건 (재난마스터)
   ========================================================= */
const EVENT_KEYS: [RegExp, string][] = [
  [/초량|2020.{0,6}7.{0,3}23|7\.?23/, "1001-20200723-01"],
  [/힌남노/, "1005-20220903-01"], [/차바/, "1005-20161003-01"], [/마이삭|하이선/, "1005-20200901-01"], [/카눈/, "1005-20230809-01"],
  [/미탁/, "1005-20191001-01"], [/산바/, "1005-20120914-01"], [/콩레이/, "1005-20181004-01"], [/타파/, "1005-20190921-01"], [/오마이스/, "1005-20210822-01"],
  [/쁘라삐룬/, "1008-20180626-01"], [/2014.{0,6}8.{0,3}25|구포|8\.?25/, "1001-20140825-01"], [/최장\s*장마|2020.{0,6}7.{0,3}28/, "1001-20200728-01"],
  [/미시령/, "1099-20231008-01"], [/이번\s*(사건|호우)|진행\s*중|현재\s*사건/, "CURRENT"],
];
export function matchEvent(q: string, region: RegionId): DisasterEvent | null {
  for (const [re, id] of EVENT_KEYS) if (re.test(q)) return id === "CURRENT" ? null : EVENT_BY_ID.get(id) ?? null;
  const y = q.match(/(20\d\d)\s*년?\s*(\d{1,2})\s*월?/);
  if (y) {
    const cand = eventsInRegion(region).filter((e) => e.startDate.startsWith(`${y[1]}-${y[2].padStart(2, "0")}`));
    if (cand.length) return cand[0];
  }
  return null;
}
export function composeEvent(a: Answer, ctx: QueryContext, e: DisasterEvent) {
  a.apis.add("T3Q-07 재난사건 상세");
  a.apis.add("T3Q-10 사건 이력");
  const pr = ctx.region === "national" ? undefined : ctx.region;
  const rec = (pr ? regionRecord(e, pr) : undefined) ?? e.regions[0];
  a.title = `${e.title.replace(/^\[시연\]\s*/, "")} — 사건 정리`;
  const where = whereFlooded(a, e, rec);
  a.push({
    kind: "headline",
    text: `${a.e(eventRef(e, pr))}(재난마스터 **${e.eventId}**)은 ${ymd(e.startDate)}~${e.endDate ? ymd(e.endDate) : "진행중"} ${e.regions.map((r) => (r.sido.includes("부산") ? "부산" : r.sigungu)).join("·")}에 영향을 준 ${e.typeName} 사건입니다. ${e.weather.maxHourlyRain_mm != null ? `시간 최대 ${e.weather.maxHourlyRain_mm}mm${/검증/.test(e.weather.rainfallSource) ? "(공개자료·검증필요)" : ""}. ` : ""}${rshort(ctx.region)}에서는 ${where || rec.summary}.`,
  });
  const facts = [];
  const pl = rec.damages.publicFacilityLedger;
  if (pl) facts.push({ label: "공공시설 피해", value: fmtKrwThousand(pl.damage_krw_thousand), note: `${pl.facilityCount}건 · 복구비 ${fmtKrwThousand(pl.recovery_krw_thousand)}` });
  const pf = rec.damages.privateFacility;
  if (pf) facts.push({ label: "사유시설 피해", value: pf.recordCount.toLocaleString(), unit: "건", note: pf.confirmedDamage_krw_thousand ? `확정 ${fmtKrwThousand(pf.confirmedDamage_krw_thousand)}` : undefined });
  if (rec.floodTraces) facts.push({ label: "침수흔적", value: String(rec.floodTraces.count), unit: "개소", note: `${Math.round(rec.floodTraces.totalArea_m2 / 10000)}ha · 최대 ${rec.floodTraces.maxDepth_m}m` });
  if (rec.damages.insurance?.house) facts.push({ label: "풍수해보험(주택)", value: String(rec.damages.insurance.house.claims), unit: "건", note: fmtKrw(rec.damages.insurance.house.paid_krw) });
  if (rec.reports119.length) facts.push({ label: "119 신고", value: String(rec.reports119.length), unit: "건" });
  if (facts.length) a.push({ kind: "facts", items: facts });

  // 타임라인: 특보 → 조치 → 상황보고 → 신고
  const tl: { at: string; label: string; kind: string; text: string }[] = [];
  e.weather.advisories.forEach((ad) => tl.push({ at: (ad.issuedAt ?? "").replace("T", " ").slice(0, 16), label: "특보", kind: "특보", text: `${ad.area} ${ad.type}${ad.level}${ad.status ? ` (${ad.status})` : ""}` }));
  rec.actions.forEach((ac) => tl.push({ at: ac.time.replace("T", " ").slice(0, 16), label: "대응", kind: "대응", text: ac.action }));
  rec.situationReports.map((id) => SR_BY_ID.get(id)).forEach((sr) => sr && tl.push({ at: sr.submittedAt.replace("T", " ").slice(0, 16), label: `상황보고 ${sr.reportNo}`, kind: "보고", text: `${sr.overview.slice(0, 90)}${citeSR(a, sr)}` }));
  rec.facts.forEach((f) => tl.push({ at: e.startDate, label: "사실", kind: "피해", text: `${f.fact}${/검증/.test(f.source) ? " (공개자료·검증필요)" : ""}` }));
  if (tl.length) a.push({ kind: "timeline", title: "사건 경과 (특보 → 대응 → 보고)", items: tl.sort((x, y) => x.at.localeCompare(y.at)).slice(0, 16) });

  const pts: EntityRef[] = (rec.floodTraces?.records ?? []).slice(0, 12).map((f) => ({ type: "damage", id: f.traceId, name: f.district, category: "침수흔적", lon: f.centroid.lon, lat: f.centroid.lat, summary: `침수면적 ${Math.round(f.area_m2).toLocaleString()}㎡ · ${f.cause}`, metric: `${Math.round(f.area_m2 / 1000).toLocaleString()}천㎡`, level: "mid" }));
  const groups = [];
  if (pts.length) groups.push({ key: `trace:${e.eventId}`, label: "침수흔적", total: rec.floodTraces!.count, items: pts });
  const pfi = rec.damages.publicFloodItems?.items ?? [];
  if (pfi.length) groups.push({ key: `pfi:${e.eventId}`, label: "공공시설 침수피해", total: rec.damages.publicFloodItems!.count, items: pfi.map((it, i) => ({ type: "damage" as const, id: `${e.eventId}-PFI-${i}`, name: it.address.replace(/^(부산광역시|경상북도|강원특별자치도)\s*/, "").slice(0, 30), category: it.facilityType, summary: `${it.damageCause} · ${it.summary.slice(0, 50)}`, metric: fmtKrwThousand(it.damage_krw_thousand) })) });
  const tf = rec.damages.publicFacilityLedger?.topFacilities ?? [];
  if (tf.length) groups.push({ key: `led:${e.eventId}`, label: "재해대장 주요 피해시설", total: rec.damages.publicFacilityLedger!.facilityCount, items: tf.map((f, i) => ({ type: "damage" as const, id: `${e.eventId}-LED-${i}`, name: f.facility, category: f.type, summary: `${f.emd} · ${f.location.slice(0, 30)} · 복구비 ${fmtKrwThousand(f.recovery_krw_thousand)}`, metric: fmtKrwThousand(f.damage_krw_thousand) })) });
  if (groups.length) a.push({ kind: "results", groups });
  pts.forEach((p) => a.ents.set(p.id, p));
  a.focus = pts.map((p) => p.id);
  a.push({ kind: "notice", tone: "info", text: `재난마스터 ID 규칙: (재난유형코드 ${e.typeCode}=${e.typeName})-(발생일 ${e.startDate.replace(/-/g, "")})-(같은 날 같은 유형 순번). 한 사건 아래 지역별 기록(${e.regions.map((r) => r.regionRecordId.slice(-5)).join(", ")})에 신고·피해·복구·침수흔적·상황보고를 묶습니다.${e.ndmsKey ? ` NDMS 키 ${e.ndmsKey.DSTR_YEAR}/${e.ndmsKey.DSTR_TY_CD}/${e.ndmsKey.DSTR_SN}(${e.ndmsKey.DSTR_NM})와 연결됩니다.` : ""}` });
  a.focusRef = eventRef(e, pr);
  a.followUps = ["그때 피해가 난 곳은 지금 어떻게 관리되나요?", "그때 복구는 어떻게 됐나요?", "그때 어떤 통제·대피 조치를 했나요?"];
}

/* =========================================================
   7. 하천
   ========================================================= */
interface RiverIdx { riverId: string; name: string; label: string; grade: string; region: RegionId; regionName: string; sigungu: string[]; bbox: number[]; center: [number, number]; length_km: number; aliases: string[]; standardAttrs?: Record<string, string> }
export const RIVERS = (riversIdx as unknown as { rivers: RiverIdx[] }).rivers ?? (riversIdx as unknown as RiverIdx[]);
export function matchRiver(q: string, region: RegionId): RiverIdx | null {
  const cands = RIVERS.filter((r) => (region === "national" || r.region === region) && r.name.length >= 2 && (q.includes(r.name) || r.aliases?.some((al) => q.includes(al))));
  return cands.sort((a, b) => b.name.length - a.name.length || b.length_km - a.length_km)[0] ?? null;
}
export const riverRef = (r: RiverIdx): EntityRef => ({ type: "river", id: r.riverId, name: r.label || r.name, category: "하천", summary: `${r.grade} · ${r.length_km}km · ${r.sigungu.join("·")}`, metric: r.grade, level: "info" });

export function riverRelated(r: RiverIdx) {
  const [x0, y0, x1, y1] = r.bbox;
  const pad = 0.004;
  return RISKS.filter(
    (o) => String(o.attrs["하천명"] ?? o.attrs["하천"] ?? o.attrs["인근하천"] ?? "").includes(r.name) || (o.lon >= x0 - pad && o.lon <= x1 + pad && o.lat >= y0 - pad && o.lat <= y1 + pad && /지하차도|홍수|상습침수|소하천|하천|야영장/.test(o.category) && dist({ lon: o.lon, lat: o.lat }, { lon: r.center[0], lat: r.center[1] }) < Math.max(2, r.length_km / 2)),
  );
}
interface RiverPlan { name: string; region: string; planYear: number; planTitle: string; designFreq: string; designFlood_cms: number; requiredFreeboard_m: number; page: number; sections: { station: string; location: string; designFloodLevel_m: number; currentLevee_m: number | null; planLevee_m: number; freeboard_m: number | null; status: string; note: string }[]; riskFactors: { factor: string; detail: string; source: string }[] }
const PLANS = (riverPlans as unknown as { rivers: RiverPlan[] }).rivers;
const citePlan = (a: Answer, p: RiverPlan) => a.c({ docId: `PLAN:${p.name}`, title: p.planTitle, kind: "계획문서", page: p.page, dataset: "하천기본계획(T3Q 지식)" });

/** 하천기본계획 — 계획홍수위·제방고·여유고 비교 (데모 질의 "적정 제방고 대비 실제 제방고") */
function composeRiverPlan(a: Answer, r: RiverIdx, p: RiverPlan) {
  a.title = `${r.name} 제방고·여유고 검토`;
  const short = p.sections.filter((x) => x.status !== "확보");
  a.push({
    kind: "headline",
    text: `${a.e(riverRef(r))} ${p.planTitle}(${p.planYear}, ${p.designFreq}) 기준 계획홍수량 ${p.designFlood_cms.toLocaleString()}㎥/s로 **여유고 ${p.requiredFreeboard_m}m 이상**이 필요합니다. 검토 측점 ${p.sections.length}곳 중 **${short.length}곳이 부족**합니다 — ${short.slice(0, 2).map((x) => `${x.station}(현 제방고 ${x.currentLevee_m ?? "무제부"}m, 여유고 ${x.freeboard_m ?? "—"}m)`).join(", ")}${citePlan(a, p)}.`,
  });
  a.push({
    kind: "facts",
    title: "측점별 제방고 (계획홍수위 · 현 제방고 → 여유고)",
    items: p.sections.map((x) => ({ label: x.station, value: x.freeboard_m == null ? "무제부" : `${x.freeboard_m}m`, tone: x.status === "확보" ? ("ok" as const) : ("danger" as const), note: `계획홍수위 ${x.designFloodLevel_m}m · 현 ${x.currentLevee_m ?? "—"}m / 계획 ${x.planLevee_m}m${x.note ? ` · ${x.note}` : ""}` })),
  });
  a.focusRef = riverRef(r);
  a.followUps = [`${r.name} 풍수해 위험요인은?`, `${r.name} 주변 과거 피해는?`, "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?"];
}

export function composeRiver(a: Answer, ctx: QueryContext, r: RiverIdx, q = "") {
  const plan = PLANS.find((p) => p.name === r.name && p.region === r.region);
  if (plan && /제방|여유고|계획\s*홍수|홍수위|하천기본계획/.test(q)) {
    a.apis.add("T3Q-05 하천 상세(하천기본계획)");
    return composeRiverPlan(a, r, plan);
  }
  a.apis.add("T3Q-05 하천 상세");
  const s = situation(ctx, r.region);
  a.title = `${r.name} — 위험 구간과 대응`;
  const rel = rankRisks(riverRelated(r), r.region, { active: s.active }).slice(0, 20);
  const m = MANUAL_BY_REGION[r.region as Exclude<RegionId, "national">];
  const fa = m?.fieldActions.filter((f) => f.target.includes(r.name) || f.criteria.includes(r.name) || f.actions.some((l) => l.includes(r.name))) ?? [];
  const evs = EVENTS.filter((e) => e.regions.some((rr) => rr.floodTraces?.records?.some((t) => t.centroid.lon >= r.bbox[0] - 0.003 && t.centroid.lon <= r.bbox[2] + 0.003 && t.centroid.lat >= r.bbox[1] - 0.003 && t.centroid.lat <= r.bbox[3] + 0.003))).slice(0, 3);
  const rf = plan?.riskFactors ?? [];
  a.push({
    kind: "headline",
    text: rf.length ? `${a.e(riverRef(r))}의 풍수해 위험요인은 **${rf.map((x) => x.factor).slice(0, 3).join(", ")}**입니다${citePlan(a, plan!)}. ${rf[0].detail}.${s.active && s.rain1hMax ? ` 지금 시간 최대 ${s.rain1hMax}mm입니다.` : ""} 주변 관리대상 ${rel.length}곳 중 ${rel.slice(0, 2).map((x) => a.e(riskRef(x.o))).join(", ")}을 먼저 보십시오.` : `${a.e(riverRef(r))}${josa(r.name, "은", "는")} ${r.regionName}${r.region === "busan" ? " " + r.sigungu.join("·") : ""}${josa(r.region === "busan" ? r.sigungu.at(-1) ?? "" : r.regionName, "을", "를")} 흐르는 ${r.grade}(연장 ${r.length_km}km)입니다. 하천 주변 관리대상은 ${rel.length}곳이며${rel[0] ? ` ${rel.slice(0, 3).map((x) => a.e(riskRef(x.o))).join(", ")} 등을 먼저 보십시오` : ""}.${fa[0] ? ` 매뉴얼에는 '${fa[0].criteria.slice(0, 70)}…' 기준이 있습니다${citeManual(a, m, fa[0].page)}.` : ""}${s.active && s.rain1hMax ? ` 현재 시간 최대 ${s.rain1hMax}mm입니다.` : ""}`,
  });
  if (rf.length) a.push({ kind: "facts", title: "위험요인", items: rf.map((x) => ({ label: x.factor, value: "", note: `${x.detail} (${x.source})` })) });
  const sa = r.standardAttrs ?? {};
  a.push({ kind: "facts", items: [{ label: "하천 등급", value: r.grade }, { label: "연장", value: String(r.length_km), unit: "km" }, { label: "관리기관", value: sa["관리기관명"] ?? r.regionName }, { label: "주변 관리대상", value: String(rel.length), unit: "곳" }] });
  if (fa.length) a.push({ kind: "narrative", title: "매뉴얼 통제 기준", paragraphs: fa.map((f) => `**${f.target}** — ${f.criteria}${citeManual(a, m, f.page)} → ${f.actions.slice(0, 3).join(" / ")}`) });
  const led = ledgerMentioning(r.name, (x) => (r.region === "busan" ? x.region.sido.includes("부산") : x.region.sigungu.includes(rshort(r.region))));
  if (led.length) {
    const tot = led.reduce((n, x) => n + (x.damage_amount_krw_thousand ?? 0), 0);
    const years = [...new Set(led.map((x) => x.date_start.slice(0, 4)))];
    a.push({
      kind: "narrative",
      title: `재해대장에 기록된 ${r.name} 피해 (${led.length}건 · ${years.slice(0, 5).join("·")}년)`,
      paragraphs: [
        `${years.length}개 연도에 걸쳐 ${led.length}건이 기록돼 있고 피해액 합계는 ${fmtKrwThousand(tot)}입니다${a.c({ docId: `LED:${r.name}`, title: "재해대장(2010~2025)", kind: "재해대장", locator: `'${r.name}' 포함 ${led.length}건`, dataset: "재해대장" })}.`,
        ...led.slice(0, 5).map((x) => `· ${ymd(x.date_start)} **${x.disaster_name.trim()}** — ${x.facility?.시설명 ?? ""}: ${x.damage_summary.replace(/^[^-]+-\s*/, "")} (피해 ${fmtKrwThousand(x.damage_amount_krw_thousand)}${x.recovery_cost_krw_thousand ? `, 복구비 ${fmtKrwThousand(x.recovery_cost_krw_thousand)}` : ""})`),
      ],
    });
  }
  if (evs.length) a.push({ kind: "narrative", title: "과거 이 하천 주변 침수흔적", paragraphs: evs.map((e) => `${a.e(eventRef(e, r.region))} — ${regionRecord(e, r.region)?.summary ?? e.summary}`) });
  if (rel.length) a.push({ kind: "results", groups: [{ key: `river:${r.riverId}`, label: `${r.name} 주변 관리대상`, total: rel.length, items: rel.map((x) => riskRef(x.o)) }] });
  rel.slice(0, 10).forEach((x) => a.ents.set(x.o.id, riskRef(x.o)));
  a.focus = rel.slice(0, 8).map((x) => x.o.id);
  a.focusRef = riverRef(r);
  a.followUps = plan ? [`${r.name}의 적정 제방고 대비 실제 제방고는 얼마인가요?`, "하천변 출입 통제가 필요한가요?", "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?"] : [`${r.name} 주변 지하차도 통제 기준은?`, "지금 특보 단계에서 해야 할 일은?", "비슷한 강우 때 과거 피해는?"];
}

/* =========================================================
   8. 특정 객체 (참조대상)
   ========================================================= */
export function matchRisk(q: string, region: RegionId): RiskObject | null {
  const pool = risksIn(region).filter((o) => !o.sample);
  const hits = pool.filter((o) => {
    const core = o.name.replace(/\s*\(.*$/, "").replace(/(급경사지|붕괴위험지역|상습침수지역|지하차도)$/, "").trim();
    return core.length >= 3 && q.includes(core);
  });
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}
export function composeObject(a: Answer, ctx: QueryContext, o: RiskObject) {
  a.apis.add("T3Q-04 위험·취약 객체 상세");
  const region = o.region.sido.includes("부산") ? "busan" : o.region.sigungu.includes("영천") ? "yeongcheon" : "inje";
  const s = situation(ctx, region);
  a.title = `${riskRef(o).name} — 왜·언제 위험하고 무엇을 하나`;
  const nearRep = s.reports.filter((r) => dist({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, o) <= 1 && relevant119(o.category, r.ext.accidentType));
  a.push({
    kind: "headline",
    text: `${a.e(riskRef(o))}는 ${o.region.sigungu} ${o.region.emd ?? ""}의 ${o.category}${o.grade ? `(${o.grade})` : ""}입니다. ${firstSentence(o.reason, 150)}${citeRisk(a, o)}.${s.active ? ` 지금 ${s.advisoryText} 발효 중(시간 최대 ${s.rain1hMax}mm)이라 아래 '언제' 기준에 해당합니다.` : ""}${nearRep.length ? ` 1km 안에서 119 신고 ${nearRep.length}건이 접수됐습니다.` : ""}`,
  });
  a.push({
    kind: "narrative",
    title: "어디 · 왜 · 언제",
    paragraphs: [
      `**어디** ${o.region.sido} ${o.region.sigungu} ${o.region.emd ?? ""} ${addrOf(o)}${o.coordApprox ? " (좌표는 읍면동 내 근사)" : ""}`,
      `**왜** ${o.reason}`,
      `**언제** ${o.trigger.text}${o.trigger.thresholds ? ` — 기준값: ${Object.entries(o.trigger.thresholds).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`,
      ...(o.history?.length ? [`**과거** ${o.history.slice(0, 4).map((h) => `${ymd(h.date)} ${h.disaster ?? ""}${h.damaged_facilities_in_emd ? `(같은 읍면동 ${h.damaged_facilities_in_emd}건)` : ""}`).join(", ")}`] : []),
      ...(o.plan ? [`**정비** ${planText(o.plan)}`] : []),
    ],
  });
  const m = s.manual;
  if (m) {
    const fas = fieldActionsFor(m, [o.category]).slice(0, 2);
    const items = fas.flatMap((f) => stageLines(f.actions, s.level).map((l) => ({ l, f })));
    if (items.length)
      a.push({
        kind: "actions",
        title: "무엇을 해야 하나",
        stage: { name: s.stage?.name.replace(/\s*\(.*\)/, "") ?? "평시", level: s.stage?.emergencyLevel.split(" — ")[0] },
        manualId: `${m.id}:OBJ:${o.id}`,
        items: items.slice(0, 6).map(({ l, f }, i) => ({ seq: i + 1, task: l.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[p[\d-]+\]$/, ""), owner: f.target.replace(/\s*\(.*\)/, ""), cite: [a.cid(citeManual(a, m, f.page))] })),
      });
  }
  const near = nearbyRisks(o, 0.8, o.id).slice(0, 8);
  if (near.length || nearRep.length)
    a.push({ kind: "results", groups: [...(nearRep.length ? [{ key: `nr:${o.id}`, label: "인근 119 신고", total: nearRep.length, items: nearRep.map(r119Ref) }] : []), ...(near.length ? [{ key: `nb:${o.id}`, label: "반경 800m 관리대상", total: near.length, items: near.map((x) => riskRef(x)) }] : [])] });
  a.ents.set(o.id, riskRef(o));
  a.focus = [o.id];
  a.focusRef = riskRef(o);
  const hist = (o.history ?? []).map((h) => EVENTS.find((e) => e.startDate === h.date)).filter((e): e is DisasterEvent => !!e);
  if (hist.length) a.push({ kind: "results", groups: [{ key: `oh:${o.id}`, label: "이 동네가 피해를 입은 재난사건", total: hist.length, items: hist.slice(0, 8).map((e) => eventRef(e, region)) }] });
  a.followUps = ["이 주변에서 과거 어떤 피해가 있었나요?", "같은 유형 위험지역 전체를 보여주세요", "지금 매뉴얼상 해야 할 일은?"];
}

/* =========================================================
   9. 현재 상황 브리핑 (프리셋 일괄)
   ========================================================= */
export function composeBriefing(a: Answer, ctx: QueryContext) {
  a.apis.add("T3Q-01 브리핑(프리셋 일괄)");
  const s = situation(ctx);
  a.title = `현재 상황 브리핑 · ${rname(ctx.region)}`;
  const regs = ctx.region === "national" ? PILOTS : [ctx.region];
  const sits = regs.map((r) => situation(ctx, r));
  const allRisk = regs.flatMap((r) => risksIn(r, ctx.sigungu));
  const ranked = regs.flatMap((r) => rankRisks(risksIn(r, ctx.sigungu), r, { active: situation(ctx, r).active && ctx.mode === "scenario" }).slice(0, 3)).sort((x, y) => y.score - x.score);
  const t1 = ranked[0];
  const sim = s.region !== "national" ? similarFor(ctx, s)[0] : null;
  const reps = sits.flatMap((x) => x.reports);

  if (ctx.region !== "national" && s.manual) {
    const st = s.stage;
    a.push({
      kind: "headline",
      text: s.active
        ? `${s.rname}에 **${s.advisoryText}** 발효 중(${mdhm(s.issuedAt)}~), 시간 최대 **${s.rain1hMax}mm**·누적 ${s.rainTotal}mm입니다. ${t1 ? `${a.e(riskRef(t1.o, { near: t1.near.length }))} 등 ${ranked.length}곳을 먼저 확인하고, ` : ""}${sim ? `가장 비슷한 과거 사례는 ${a.e(eventRef(sim.e, s.region))}(유사도 ${sim.score})입니다. ` : ""}매뉴얼상 **${st?.name.replace(/\s*\(.*\)/, "")}** 단계이며 '${st?.tasks[0]?.task.split(" — ")[0]}'부터 시작합니다${citeManual(a, s.manual, st?.tasks[0]?.page)}.${reps.length ? ` 119 신고 ${reps.length}건이 접수됐습니다.` : ""}`
        : `${s.rname}에 발효 중인 특보는 없습니다. 위험·취약지역 ${allRisk.length.toLocaleString()}곳을 관리 중이며 ${t1 ? `${a.e(riskRef(t1.o))} 등이 우선 점검 대상입니다.` : ""} 특보가 발표되면 '${s.manual.stages[0].name}' 절차를 안내합니다.`,
    });
  } else {
    a.push({ kind: "headline", text: `시범 3개 지역 중 ${sits.filter((x) => x.active).map((x) => `${rshort(x.region)}(${x.advisoryText}, 시간최대 ${x.rain1hMax}mm)`).join(", ") || "특보 발효 지역 없음"}. 119 신고 ${reps.length}건, 위험·취약지역 ${allRisk.length.toLocaleString()}곳을 관리 중입니다.` });
  }
  a.push({
    kind: "briefing",
    items: [
      { key: "wx", label: "현재 기상상황", summary: sits.map((x) => (x.active ? `${rshort(x.region)} ${x.advisoryText} · 시간최대 ${x.rain1hMax}mm` : `${rshort(x.region)} 특보 없음`)).join(" / "), count: `${sits.filter((x) => x.active).length}건`, status: "ok", question: "지금 우리 지역 기상특보와 강우 상황은 어떤가요?" },
      { key: "risk", label: "위험·취약지역", summary: t1 ? `1순위 {{e:${t1.o.id}}} 외 · ${t1.o.category}` : "—", count: `${allRisk.length.toLocaleString()}곳`, status: "ok", question: "지금 강우 조건에서 먼저 확인해야 할 위험·취약지역은 어디인가요?" },
      ctx.region === "national"
        ? { key: "similar", label: "과거 유사사례", summary: sits.map((x) => { const t = similarFor(ctx, x)[0]; if (t) a.ents.set(t.e.eventId, eventRef(t.e, x.region)); return t ? `${rshort(x.region)} {{e:${t.e.eventId}}}(${t.score})` : `${rshort(x.region)} —`; }).join(" / "), count: "3개 지역", status: "ok" as const, question: "부산에서 비슷한 강우 때 과거에 어디서 어떤 피해가 있었나요?" }
        : { key: "similar", label: "과거 유사사례", summary: sim ? `가장 비슷한 {{e:${sim.e.eventId}}} · 유사도 ${sim.score}` : "—", count: sim ? "5건" : "—", status: "ok" as const, question: "비슷한 강우 때 과거에 어디서 어떤 피해가 있었나요?" },
      ctx.region === "national"
        ? { key: "manual", label: "행동매뉴얼 대응절차", summary: sits.map((x) => `${rshort(x.region)} ${x.stage ? x.stage.emergencyLevel.split(" — ")[0].replace(/\(.*\)/, "").trim() : "평시"}`).join(" / "), count: `${sits.reduce((n, x) => n + (x.stage?.tasks.length ?? 0), 0)}개`, status: "ok" as const, question: "지금 매뉴얼상 해야 할 일은?" }
        : { key: "manual", label: "행동매뉴얼 대응절차", summary: s.stage ? `${s.stage.name.replace(/\s*\(.*\)/, "")} · ${s.stage.tasks[0]?.task.split(" — ")[0]} 외` : "—", count: s.stage ? `${s.stage.tasks.length}개` : "—", status: "ok" as const, question: "지금 특보 단계에서 행동매뉴얼상 제가 해야 할 일은 무엇인가요?" },
      { key: "report119", label: "119 신고", summary: reps.length ? `${reps[reps.length - 1].ext.accidentType} 등 · 최근 ${reps[reps.length - 1].신고일시.slice(11, 16)}` : "진행 중 사건 신고 없음", count: `${reps.length}건`, status: "ok", question: "이번 사건으로 접수된 119 신고 내용은 무엇인가요?" },
    ],
  });
  if (t1) a.ents.set(t1.o.id, riskRef(t1.o, { near: t1.near.length }));
  if (sim) a.ents.set(sim.e.eventId, eventRef(sim.e, s.region === "national" ? undefined : s.region));
  if (s.wx) a.push({ kind: "rainChart", title: "시간당 강우 vs 매뉴얼 통제 기준·과거 피해 강우", current: { label: "시간당 강우", series: hourlySeries(s.wx) }, thresholds: rainThresholds(s.region).map(({ mm, label, basis }) => ({ mm, label, basis })) });
  ranked.slice(0, 8).forEach((r) => a.ents.set(r.o.id, riskRef(r.o, { near: r.near.length })));
  reps.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  a.focus = ranked.slice(0, 5).map((r) => r.o.id);
  a.followUps = ["급경사지는 어디고 왜·언제 위험한가요?", "비슷한 강우 때 과거 피해는?", "지금 매뉴얼상 해야 할 일은?"];
}

/* =========================================================
   10. 되묻기 (추측 금지)
   ========================================================= */
export function composeClarify(a: Answer, ctx: QueryContext, q: string) {
  a.status = "clarify";
  a.title = q.slice(0, 30);
  a.push({ kind: "headline", text: `질문을 정확히 이해하지 못했습니다. 근거 없이 추측해 답하지 않도록, 아래 중 원하시는 것을 골라 주세요. (기준: ${rname(ctx.region)} · ${ctx.disasterType})` });
  a.push({ kind: "notice", tone: "info", text: "이렇게 물어보면 정확합니다 — \"영천 급경사지는 어디고 왜 위험해?\", \"시간당 50mm면 부산 어디가 잠겼었어?\", \"호우경보인데 내가 지금 뭘 해야 해?\", \"온천천 통제 기준은?\", \"힌남노 때 피해는?\"" });
  a.followUps = ["현재 상황 브리핑", "지금 먼저 볼 위험·취약지역은?", "비슷한 강우 때 과거 피해는?", "지금 매뉴얼상 해야 할 일은?", "119 신고 현황은?"];
}

export { type RiverIdx };
