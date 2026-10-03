import "server-only";
/**
 * 업무 흐름 기반 응답 (상황판단·통제·대피·복구·복합위험·반복피해·주민메시지·보고·AI 모드 상황점검)
 * + 사건 연계 후속 질의 (그때 피해지역의 위험·취약지역 / 복구 / 대응 / 사례 비교)
 */
import type { EntityRef, QueryContext, RegionId } from "../../contract/agent";
import { EVENT_BY_ID, R119_BY_ID, SCENARIO, SR_BY_ID, eventRef, fmtKrwThousand, r119Ref, regionRecord, type DisasterEvent, type Report119 } from "../events";
import { MANUAL_BY_REGION, type Manual } from "../manual";
import { LEDGER, type LedgerRec } from "../ledger";
import { RISKS, dist, displayName, rankRisks, relevant119, riskRef, risksIn, type RiskObject } from "../risk";
import { Answer, cite119, citeEvent, citeKMA, citeManual, citeRisk, citeSR, hourlySeries, mdhm, rainThresholds, rname, rshort, situation, ymd, type Situation } from "./core";

const PILOTS: Exclude<RegionId, "national">[] = ["busan", "yeongcheon", "inje"];
const inRegion = (r: RegionId, sido: string, sigungu: string) => r === "national" || (r === "busan" ? sido.includes("부산") : sigungu.includes(rshort(r)));
const planStatus = (o: RiskObject) => String(o.plan?.["진행상태"] ?? o.plan?.["사업구분(진행상태)"] ?? "");
const planState = (o: RiskObject): "완료" | "추진" | "미정비" => (!o.plan ? "미정비" : /완료|해제/.test(planStatus(o)) ? "완료" : /대상아님/.test(planStatus(o)) ? "미정비" : "추진");
const josa = (w: string, a: string, b: string) => { const c = w.charCodeAt(w.length - 1); return c < 0xac00 || c > 0xd7a3 ? b : (c - 0xac00) % 28 ? a : b; };
const cutParen = (t: string) => t.split(" (")[0].split("(")[0].trim();
const lvlOf = (em?: string) => em?.match(/비상\s*[\d·]+단계|초기대응단계|준비단계|평시 및 초기대응|수습·?복구/)?.[0] ?? null;
const decision = (ok: boolean | null, yes: string, no: string, hold = "판단 보류") => (ok === null ? hold : ok ? yes : no);

/* ---------------- 사건 ↔ 위험·취약지역 · 재해대장(복구) 연계 ---------------- */
export function ledgerForEvent(e: DisasterEvent, region: RegionId): LedgerRec[] {
  const names = new Set(e.regions.flatMap((r) => r.damages.publicFacilityLedger?.ledgerDisasterNames ?? []).map((n) => n.trim()));
  return LEDGER.filter((x) => inRegion(region, x.region.sido, x.region.sigungu) && (names.has(x.disaster_name.trim()) || x.date_start === e.startDate));
}
export function risksLinkedToEvent(e: DisasterEvent, region: RegionId): RiskObject[] {
  const names = new Set(e.regions.flatMap((r) => r.damages.publicFacilityLedger?.ledgerDisasterNames ?? []).map((n) => n.trim()));
  const emds = new Set(ledgerForEvent(e, region).map((x) => `${x.region.sigungu}|${x.region.emd ?? ""}`));
  return RISKS.filter((o) => inRegion(region, o.region.sido, o.region.sigungu) && ((o.history ?? []).some((h) => h.date === e.startDate || (h.disaster && names.has(h.disaster.trim()))) || emds.has(`${o.region.sigungu}|${o.region.emd ?? ""}`)));
}
const ledgerRef = (x: LedgerRec): EntityRef => ({
  type: "damage", id: x.id, name: x.facility?.시설명?.slice(0, 26) || x.damage_summary.slice(0, 26), category: `피해·${x.facility?.시설구분 ?? "시설"}`,
  lon: x.lon, lat: x.lat, summary: `${ymd(x.date_start)} ${x.disaster_name.trim()} · ${x.region.sigungu} ${x.region.emd ?? ""} · 복구비 ${fmtKrwThousand(x.recovery_cost_krw_thousand)}`,
  metric: fmtKrwThousand(x.damage_amount_krw_thousand), level: (x.damage_amount_krw_thousand ?? 0) > 3e5 ? "high" : "mid",
});
const recoveryType = (x: LedgerRec) => String((x as unknown as { recovery?: { 복구유형?: string } }).recovery?.복구유형 ?? "미기재");

/** 사건 → 당시 피해 읍면동의 현재 위험·취약지역 (발주처 요구: 과거 재난 ↔ 취약지역 연관) */
export function composeEventRisks(a: Answer, ctx: QueryContext, e: DisasterEvent) {
  a.apis.add("T3Q-07 재난사건 상세");
  a.apis.add("T3Q-04 위험·취약지역 조회");
  const region = ctx.region;
  const linked = rankRisks(risksLinkedToEvent(e, region), region === "national" ? "busan" : region, {}).map((r) => r.o);
  const led = ledgerForEvent(e, region);
  const ev = a.e(eventRef(e, region === "national" ? undefined : region));
  a.title = `${e.title.replace(/^\[시연\]\s*/, "")} 피해지역의 현재 위험·취약지역`;
  const byCat: Record<string, RiskObject[]> = {};
  linked.forEach((o) => (byCat[o.category] ??= []).push(o));
  const ls = linked.filter((o) => /산사태|급경사|붕괴/.test(o.category));
  const notDone = linked.filter((o) => planState(o) !== "완료" && /급경사|붕괴|개선지구|저수지|홍수/.test(o.category));
  const ledLs = led.filter((x) => /산사태|사면|절개|토사/.test(`${x.facility?.시설구분} ${x.damage_summary}`));
  a.push({
    kind: "headline",
    text: `${ev} 때 재해대장 피해 ${led.length}건이 난 읍면동에는 지금 위험·취약지역 **${linked.length}곳**이 관리되고 있습니다. 이 중 산사태·급경사지 계열이 ${ls.length}곳이고${ledLs.length ? `, 당시에도 산사태·사면 피해가 ${ledLs.length}건(${[...new Set(ledLs.map((x) => x.region.emd))].slice(0, 3).join("·")}) 있었습니다` : ""}. **정비가 끝나지 않은 곳 ${notDone.length}곳**${notDone[0] ? `(${notDone.slice(0, 2).map((o) => a.e(riskRef(o))).join(", ")} 등)` : ""}은 같은 강도의 비가 오면 다시 피해가 날 수 있는 우선 점검 대상입니다${citeEvent(a, e, "재해대장 피해 읍면동")}.`,
  });
  a.push({
    kind: "facts",
    title: "당시 피해 ↔ 현재 관리 상태",
    items: [
      { label: "당시 공공시설 피해", value: String(led.length), unit: "건", note: `피해 ${fmtKrwThousand(led.reduce((n, x) => n + (x.damage_amount_krw_thousand ?? 0), 0))} · 복구비 ${fmtKrwThousand(led.reduce((n, x) => n + (x.recovery_cost_krw_thousand ?? 0), 0))}` },
      { label: "같은 지역 위험·취약지역", value: String(linked.length), unit: "곳", note: Object.entries(byCat).sort((x, y) => y[1].length - x[1].length).slice(0, 3).map(([k, v]) => `${k} ${v.length}`).join(" · ") },
      { label: "정비 완료", value: String(linked.filter((o) => planState(o) === "완료").length), unit: "곳", tone: "ok" },
      { label: "정비 추진·미정비", value: String(notDone.length), unit: "곳", tone: notDone.length ? "danger" : undefined, note: "재발 우선 점검" },
    ],
  });
  const paras = Object.entries(byCat).sort((x, y) => y[1].length - x[1].length).slice(0, 4).map(([cat, list]) => {
    const ex = list.slice(0, 3).map((o) => `${a.e(riskRef(o))}(${o.region.emd ?? ""}${o.plan ? ` · 정비 ${planState(o)}` : ""})`).join(", ");
    const ledHere = led.filter((x) => list.some((o) => o.region.emd === x.region.emd)).slice(0, 2).map((x) => `${x.facility?.시설명 ?? ""} ${fmtKrwThousand(x.damage_amount_krw_thousand)}`).join(", ");
    return `**${cat} ${list.length}곳** — ${ex}${ledHere ? `. 같은 동네 당시 피해: ${ledHere}` : ""}.`;
  });
  a.push({ kind: "narrative", title: "범주별 — 당시 피해 동네의 위험·취약지역", paragraphs: paras.length ? paras : ["당시 피해 읍면동과 겹치는 관리대상이 없습니다(데이터 기준)."] });
  a.push({
    kind: "results",
    groups: [
      ...(notDone.length ? [{ key: `ev-nd:${e.eventId}`, label: "정비 미완료 (재발 우선)", total: notDone.length, items: notDone.slice(0, 40).map((o) => riskRef(o)) }] : []),
      { key: `ev-risk:${e.eventId}`, label: "피해지역 내 위험·취약지역", total: linked.length, items: linked.slice(0, 60).map((o) => riskRef(o)) },
      ...(led.length ? [{ key: `ev-led:${e.eventId}`, label: "당시 재해대장 피해", total: led.length, items: led.slice(0, 40).map(ledgerRef) }] : []),
    ],
  });
  [...notDone.slice(0, 8), ...linked.slice(0, 8)].forEach((o) => a.ents.set(o.id, riskRef(o)));
  led.slice(0, 10).forEach((x) => a.ents.set(x.id, ledgerRef(x)));
  a.focus = [...notDone.slice(0, 6).map((o) => o.id), ...led.slice(0, 6).map((x) => x.id)];
  a.focusRef = eventRef(e, region === "national" ? undefined : region);
  a.followUps = ["그때 복구는 어떻게 됐나요?", "그때 어떤 통제·대피 조치를 했나요?", `${notDone[0] ? riskRef(notDone[0]).name : "정비 미완료 지구"}는 왜·언제 위험한가요?`];
}

/** 사건 → 복구 (재해대장 복구유형·복구비, 정비사업 연계) */
export function composeEventRecovery(a: Answer, ctx: QueryContext, e: DisasterEvent) {
  a.apis.add("T3Q-07 재난사건 상세");
  a.apis.add("T3Q-12 복구·정비 조회");
  const region = ctx.region;
  const led = ledgerForEvent(e, region);
  const rec = region === "national" ? e.regions[0] : regionRecord(e, region);
  a.title = `${e.title.replace(/^\[시연\]\s*/, "")} — 복구 현황`;
  if (!led.length && !rec?.damages.privateFacility) {
    a.push({ kind: "headline", text: `${a.e(eventRef(e))}에 연결된 재해대장 복구 기록이 ${rname(region)}에는 없습니다. (진행 중 사건이면 피해 집계 전 단계입니다.)` });
    a.followUps = ["특보 해제 후 우선 복구 대상은?", "과거 비슷한 사건의 복구는 어떻게 됐나요?"];
    return;
  }
  const dmg = led.reduce((n, x) => n + (x.damage_amount_krw_thousand ?? 0), 0);
  const rc = led.reduce((n, x) => n + (x.recovery_cost_krw_thousand ?? 0), 0);
  const types: Record<string, number> = {};
  led.forEach((x) => (types[recoveryType(x)] = (types[recoveryType(x)] ?? 0) + 1));
  const fac: Record<string, number> = {};
  led.forEach((x) => (fac[x.facility?.시설구분 ?? "기타"] = (fac[x.facility?.시설구분 ?? "기타"] ?? 0) + (x.recovery_cost_krw_thousand ?? 0)));
  const top = [...led].sort((x, y) => (y.recovery_cost_krw_thousand ?? 0) - (x.recovery_cost_krw_thousand ?? 0)).slice(0, 6);
  const ratio = dmg ? (rc / dmg).toFixed(1) : "—";
  const improved = types["개량복구"] ?? 0;
  a.push({
    kind: "headline",
    text: `${a.e(eventRef(e, region === "national" ? undefined : region))} 피해 공공시설 **${led.length}건**은 피해액 ${fmtKrwThousand(dmg)}${rc ? ` 대비 **복구비 ${fmtKrwThousand(rc)}(${ratio}배)**로 확정됐습니다` : "이며, 재해대장에 **복구비가 아직 기재되지 않았습니다**(복구계획 확정 전 또는 자체복구)"}${citeEvent(a, e, "재해대장 복구")}. 복구비가 가장 큰 시설은 ${top.slice(0, 2).map((x) => `${a.e(ledgerRef(x))}(${fmtKrwThousand(x.recovery_cost_krw_thousand)})`).join(", ")}이며, ${improved ? `개량복구 ${improved}건은 원래보다 강화해 다시 지었습니다` : "대부분 원상복구로, 같은 강도의 비에 다시 피해가 날 수 있습니다"}.`,
  });
  a.push({
    kind: "facts",
    items: [
      { label: "피해액", value: fmtKrwThousand(dmg), note: `${led.length}건` },
      { label: "복구비", value: fmtKrwThousand(rc), tone: "warn", note: `피해액의 ${ratio}배` },
      { label: "원상복구", value: String(types["원상복구"] ?? 0), unit: "건" },
      { label: "개량복구", value: String(improved), unit: "건", tone: improved ? "ok" : undefined, note: "재발 방지 효과" },
      ...(rec?.damages.privateFacility ? [{ label: "사유시설 피해", value: rec.damages.privateFacility.recordCount.toLocaleString(), unit: "건", note: rec.damages.privateFacility.confirmedDamage_krw_thousand ? fmtKrwThousand(rec.damages.privateFacility.confirmedDamage_krw_thousand) : undefined }] : []),
    ],
  });
  a.push({ kind: "narrative", title: "시설 유형별 복구비", paragraphs: Object.entries(fac).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `**${k}** ${fmtKrwThousand(v)} — ${led.filter((x) => (x.facility?.시설구분 ?? "기타") === k).slice(0, 2).map((x) => `${x.region.emd ?? ""} ${x.facility?.시설명 ?? ""}`).join(", ")}`) });
  const linked = risksLinkedToEvent(e, region).filter((o) => o.plan);
  if (linked.length)
    a.push({ kind: "narrative", title: "같은 지역의 정비사업 (재발 방지)", paragraphs: linked.slice(0, 4).map((o) => `${a.e(riskRef(o))} — ${String(o.plan?.["사업명"] ?? "정비사업")} · ${planStatus(o) || "상태 미기재"}${o.plan?.["총사업비(백만원)"] ? ` · ${Number(o.plan["총사업비(백만원)"]).toLocaleString()}백만원` : ""}${citeRisk(a, o)}`) });
  a.push({ kind: "results", groups: [{ key: `rec:${e.eventId}`, label: "복구 시설 (복구비 순)", total: led.length, items: [...led].sort((x, y) => (y.recovery_cost_krw_thousand ?? 0) - (x.recovery_cost_krw_thousand ?? 0)).slice(0, 40).map(ledgerRef) }] });
  top.forEach((x) => a.ents.set(x.id, ledgerRef(x)));
  a.focus = top.map((x) => x.id);
  a.focusRef = eventRef(e, region === "national" ? undefined : region);
  a.followUps = ["그때 피해 난 곳은 지금 어떻게 관리되나요?", "동일 피해 재발을 막으려면 어떤 개선이 필요한가요?", "그때 어떤 통제·대피 조치를 했나요?"];
}

/** 사건 → 당시 대응 (조치·상황보고·119 처리) vs 현재 매뉴얼 */
export function composeEventResponse(a: Answer, ctx: QueryContext, e: DisasterEvent) {
  a.apis.add("T3Q-10 사건 이력");
  const pr = ctx.region === "national" ? undefined : ctx.region;
  const rec = (pr ? regionRecord(e, pr) : undefined) ?? e.regions[0];
  a.title = `${e.title.replace(/^\[시연\]\s*/, "")} — 당시 대응`;
  const srs = rec.situationReports.map((id) => SR_BY_ID.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const reps = rec.reports119.map((id) => R119_BY_ID.get(id)).filter((x): x is Report119 => !!x);
  type Act = { at: string; text: string; kind: "통제" | "대피" | "구조" | "보고" | "조치"; cite: string };
  const kindOf = (t: string): Act["kind"] => (/대피|철수/.test(t) ? "대피" : /통제|차단|진입/.test(t) ? "통제" : /구조|구급|인명/.test(t) ? "구조" : /보고|전파/.test(t) ? "보고" : "조치");
  const acts: Act[] = [
    ...rec.actions.map((x) => ({ at: x.time, text: x.action, kind: kindOf(x.action), cite: "" })),
    ...srs.flatMap((sr) => sr.actions.map((x) => ({ at: x.time ?? sr.submittedAt, text: x.action, kind: kindOf(x.action), cite: citeSR(a, sr) }))),
    ...reps.map((r) => ({ at: r.신고일시.replace(" ", "T"), text: `${r.ext.locationDetail} ${r.ext.accidentType} → ${r.ext.result}`, kind: (/구조|구출|이송/.test(r.ext.result) ? "구조" : /통제|차단/.test(r.ext.result) ? "통제" : "조치") as Act["kind"], cite: cite119(a, r) })),
  ].filter((x) => x.text && !/연락처|010-/.test(x.text)).sort((x, y) => x.at.localeCompare(y.at));
  const cnt = (k: Act["kind"]) => acts.filter((x) => x.kind === k).length;
  const first = (k: Act["kind"]) => acts.find((x) => x.kind === k);
  const ev = a.e(eventRef(e, pr));
  if (!acts.length) {
    a.push({ kind: "headline", text: `${ev}에는 대응 조치 기록이 연결돼 있지 않습니다. 재해대장에는 피해·복구만 기록되며, 상황보고·119 처리 기록이 있는 사건부터 대응 이력을 제공합니다.` });
    a.focusRef = eventRef(e, pr);
    a.followUps = ["그때 복구는 어떻게 됐나요?", "지금 매뉴얼상 해야 할 일은?"];
    return;
  }
  const fc = first("통제"), fe = first("대피"), fr = first("구조");
  a.push({
    kind: "headline",
    text: `${ev} 때 기록된 대응은 **통제 ${cnt("통제")}건 · 대피 ${cnt("대피")}건 · 구조 ${cnt("구조")}건 · 보고 ${cnt("보고")}건**입니다.${fc ? ` 첫 통제는 ${mdhm(fc.at)} ${fc.text.slice(0, 36)}` : ""}${fe ? `, 첫 대피는 ${mdhm(fe.at)} ${fe.text.slice(0, 30)}` : ""}${fr ? `, 구조는 ${mdhm(fr.at)} ${fr.text.slice(0, 34)}` : ""}.${srs[0] ? ` 상황보고 ${srs.length}건(${srs.map((x) => x.reportNo).join("·")})에 경과가 남아 있습니다${citeSR(a, srs[0])}.` : ""}`,
  });
  a.push({ kind: "facts", title: "당시 대응 경과", items: acts.slice(0, 8).map((x) => ({ label: `${mdhm(x.at)} · ${x.kind}`, value: "", note: `${x.text.slice(0, 90)}${x.cite}`, tone: x.kind === "구조" || x.kind === "대피" ? ("danger" as const) : x.kind === "통제" ? ("warn" as const) : undefined })) });
  const m = pr ? MANUAL_BY_REGION[pr] : null;
  if (m) {
    const st = m.stages.find((x) => /경보 발/.test(x.name));
    a.push({ kind: "notice", tone: "info", text: `과거 조치는 당시 기록이며, 지금 같은 상황이면 현재 매뉴얼(${m.version.split(" (")[0]})의 '${st?.name.replace(/\s*\(.*\)/, "")}' 조치 ${st?.tasks.length}개를 적용합니다${citeManual(a, m, st?.tasks[0]?.page)}.` });
  }
  reps.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  if (reps.length) a.push({ kind: "results", groups: [{ key: `resp119:${e.eventId}`, label: "당시 119 신고·처리", total: reps.length, items: reps.map(r119Ref) }] });
  a.focus = reps.map((r) => r.reportId);
  a.focusRef = eventRef(e, pr);
  a.followUps = ["그때 사건 이력을 자세히 보여줘", "그때 침수흔적도를 보여줘", "그때 복구는 어떻게 됐나요?"];
}

/** 사례 비교 (1·2순위 또는 기준 사건 vs 최유사) */
export function composeCompare(a: Answer, ctx: QueryContext, e1: DisasterEvent, e2: DisasterEvent) {
  const pr = ctx.region === "national" ? undefined : ctx.region;
  const r1 = (pr && regionRecord(e1, pr)) || e1.regions[0], r2 = (pr && regionRecord(e2, pr)) || e2.regions[0];
  a.title = "과거 사례 비교";
  const row = (r: typeof r1, e: DisasterEvent) => ({
    rain: r.weatherLocal?.maxHourlyRain_mm ?? e.weather.maxHourlyRain_mm,
    tot: r.weatherLocal?.totalRain_mm ?? e.weather.totalRain_mm,
    house: r.damages.privateFacility?.housing?.flooded ?? 0,
    pub: r.damages.publicFacilityLedger?.damage_krw_thousand ?? 0,
    traces: r.floodTraces?.count ?? 0,
    tags: r.damageTags,
  });
  const x = row(r1, e1), y = row(r2, e2);
  const moreRain = (x.rain ?? 0) >= (y.rain ?? 0) ? e1 : e2;
  const moreDmg = x.house + x.pub / 1e4 >= y.house + y.pub / 1e4 ? e1 : e2;
  a.push({
    kind: "headline",
    text: `${a.e(eventRef(e1, pr))}과 ${a.e(eventRef(e2, pr))}을 비교하면, 비는 ${moreRain === e1 ? "앞" : "뒤"} 사건이 더 강했고(시간최대 ${x.rain}↔${y.rain}mm) 피해는 ${moreDmg === e1 ? "앞" : "뒤"} 사건이 더 컸습니다. ${moreRain !== moreDmg ? "**강우가 약했는데 피해가 더 컸던 반례**로, 피해유형(" + (moreDmg === e1 ? x.tags : y.tags).slice(0, 3).join("·") + ")과 취약지역 노출 차이를 봐야 합니다." : "강우 강도와 피해 규모가 비례했습니다."}`,
  });
  a.push({
    kind: "facts",
    title: `${e1.title.slice(0, 20)} ↔ ${e2.title.slice(0, 20)}`,
    items: [
      { label: "시간 최대 강우", value: `${x.rain} ↔ ${y.rain}`, unit: "mm" },
      { label: "누적 강우", value: `${Math.round(x.tot ?? 0)} ↔ ${Math.round(y.tot ?? 0)}`, unit: "mm" },
      { label: "주택 침수", value: `${x.house} ↔ ${y.house}`, unit: "동" },
      { label: "공공시설 피해", value: `${fmtKrwThousand(x.pub)} ↔ ${fmtKrwThousand(y.pub)}` },
      { label: "침수흔적", value: `${x.traces} ↔ ${y.traces}`, unit: "개소" },
    ],
  });
  a.push({ kind: "narrative", title: "피해 양상 차이", paragraphs: [`**${e1.title}** — ${r1.summary}${citeEvent(a, e1)}`, `**${e2.title}** — ${r2.summary}${citeEvent(a, e2)}`] });
  a.focusRef = eventRef(e1, pr);
  a.followUps = ["그때 피해 난 곳은 지금 어떻게 관리되나요?", "그때 복구는 어떻게 됐나요?"];
}

/* =========================================================
   업무 흐름 응답
   ========================================================= */

/** 상황판단 — 비상단계·대책본부·극한호우·추세·인명피해·보고 (판단 + 근거) */
export function composeAssess(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-02 상황판단(규칙)");
  const s = situation(ctx);
  if (ctx.region === "national") return composeHotspot(a, ctx);
  const m = s.manual!;
  a.title = `${rshort(s.region)} 상황판단 — 단계·가동·보고`;
  const hr = s.wx?.hourly ?? [];
  const last3 = hr.slice(-3).reduce((n, h) => n + h.mm, 0), prev3 = hr.slice(-6, -3).reduce((n, h) => n + h.mm, 0);
  const r1 = s.rain1hMax ?? ctx.hydro?.rain1h ?? null;
  const r3 = ctx.hydro?.rain3h ?? (hr.length ? Math.max(...hr.map((_, i) => hr.slice(Math.max(0, i - 2), i + 1).reduce((n, h) => n + h.mm, 0))) : null);
  const extreme = r1 != null && ((r1 >= 50 && (r3 ?? 0) >= 90) || r1 >= 72);
  const trend = hr.length >= 6 ? (last3 > prev3 * 1.2 ? "확대" : last3 < prev3 * 0.8 ? "감소" : "유지") : null;
  const rescue = s.reports.reduce((n, r) => n + (r.ext.rescueeCount ?? 0), 0);
  const st = s.stage;
  const lvl = lvlOf(st?.emergencyLevel) ?? (s.level ? "초기대응" : "평시");
  const hq = /비상\s*[23]|2·3/.test(lvl);
  const report = m.reporting.filter((r) => /행정안전부|중앙|도|시/.test(r.to)).slice(0, 2);
  const rows = [
    { k: "비상 단계", v: s.level ? lvl : "평시 (특보 없음)", why: st ? `${st.trigger.slice(0, 50)} — 매뉴얼 단계 기준` : "특보 미발효", c: st?.tasks[0]?.page },
    { k: "재난안전대책본부", v: decision(s.level ? hq : false, "가동 (비상2단계 이상)", s.level ? "실무반 중심 · 상황판단회의로 결정" : "가동 불요"), why: st?.emergencyLevel.slice(0, 70) ?? "", c: m.keyPages.staffingCriteria as number | undefined },
    { k: "극한호우 여부", v: r1 == null ? "판단 보류 (강우 미입력)" : extreme ? "극한호우 수준" : "일반 호우 범위", why: `1시간 ${r1 ?? "—"}mm · 3시간 ${r3 != null ? Math.round(r3) : "—"}mm (기상청 극한호우: 1h 50mm & 3h 90mm 또는 1h 72mm)` },
    { k: "추세", v: trend ? (trend === "확대" ? "확대 중" : trend === "감소" ? "감소 중" : "유지") : "판단 보류 (시계열 없음)", why: hr.length ? `최근 3시간 ${last3.toFixed(1)}mm ↔ 직전 3시간 ${prev3.toFixed(1)}mm` : "직접 입력 조건 — 시간별 강우 없음" },
    { k: "인명피해 가능", v: rescue ? `가능 — 요구조자 ${rescue}명 신고` : s.level === "경보" ? "주의 — 인명피해 우려지역 예찰" : "낮음", why: s.reports.length ? `119 신고 ${s.reports.length}건 중 구조 요청 ${s.reports.filter((r) => r.ext.rescueeCount).length}건` : "진행 중 신고 없음" },
    { k: "상급기관 보고", v: s.level ? "대상 — 정기 보고 시행" : "평시 보고 체계", why: report.map((r) => `${r.what} → ${cutParen(r.to)} (${cutParen(r.when)})`).join(" / "), c: report[0]?.page },
  ];
  a.push({
    kind: "headline",
    text: `${s.rname}${josa(s.rname, "은", "는")} 지금 **${rows[0].v}**${s.level ? ` (${s.advisoryText})` : ""}입니다. 재난안전대책본부는 **${rows[1].v}**, 강우는 **${rows[2].v}**${trend ? `, 추세는 **${rows[3].v}**` : ""}이며, ${rows[4].v.startsWith("가능") ? `**인명피해 가능 단계**(${rows[4].v.split("— ")[1]})` : "인명피해 신고는 아직 없습니다"}. ${s.level ? `상급기관 보고는 ${report[0] ? `**${cutParen(report[0].what)}**를 '${cutParen(report[0].when)}'에 ${cutParen(report[0].to)}로` : "정기 주기로"} 해야 합니다${citeManual(a, m, report[0]?.page)}.` : ""}`,
  });
  a.push({ kind: "facts", title: "판단 근거표", items: rows.map((r) => ({ label: r.k, value: r.v.length > 14 ? r.v.slice(0, 14) + "…" : r.v, note: r.why + (r.c ? "" : ""), tone: /가동 \(|극한|확대|가능 —/.test(r.v) ? ("danger" as const) : /검토|주의/.test(r.v) ? ("warn" as const) : undefined, cite: r.c ? [a.cid(citeManual(a, m, r.c))] : undefined })) });
  if (st) a.push({ kind: "actions", title: "판단에 따른 즉시 조치", stage: { name: st.name.replace(/\s*\(.*\)/, ""), level: lvl }, manualId: `${m.id}:${st.stageId}`, items: st.tasks.slice(0, 6).map((t) => ({ seq: t.seq, task: t.task, owner: t.owner, due: t.timing, cite: [a.cid(citeManual(a, m, t.page))] })) });
  if (s.wx) a.push({ kind: "rainChart", title: "강우 추세 vs 기준", current: { label: "시간당 강우", series: hourlySeries(s.wx) }, thresholds: rainThresholds(s.region).map(({ mm, label, basis }) => ({ mm, label, basis })) });
  a.push({ kind: "notice", tone: "info", text: "판단은 특보·입력 강우·매뉴얼 기준·신고 현황에 근거한 규칙 판정이며, 실시간 수문 예측은 하지 않습니다. 최종 결정은 상황판단회의에서 합니다." });
  void q;
  a.followUps = ["지금 먼저 통제해야 할 도로와 지하차도는?", "대피가 필요한 지역과 대상은?", "주민에게 어떤 메시지를 보내야 하나요?"];
}

/** 통제 — 지하차도·하상도로·하천변·계곡·세월교 : 기준 대비 판정 */
export function composeControl(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  a.apis.add("T3Q-04 위험·취약지역 조회");
  const s = situation(ctx);
  if (ctx.region === "national") return composeHotspot(a, ctx);
  const m = s.manual!;
  const r1 = s.rain1hMax ?? 0;
  const wantValley = /계곡|야영|등산/.test(q);
  const wantCoast = /해안|월파|만조/.test(q) || ctx.hydro?.tide;
  a.title = `${rshort(s.region)} 통제 대상 — 기준 대비 판정`;
  const fa = m.fieldActions.filter((f) => (wantValley ? /계곡|야영|물놀이|유원지|인명피해/ : wantCoast ? /해안|월파|저지대|지하차도/ : /지하차도|하상|하천변|산책로|취약도로|세월교|둔치|주차장|계곡/).test(f.target));
  const thr = (f: (typeof m.fieldActions)[number]) => Number(f.criteria.match(/(\d+)\s*mm\s*이상[^/]*(전면\s*)?통제|30mm|시우량\s*(\d+)/)?.[1] ?? f.criteria.match(/(\d+)\s*(mm|㎜)/)?.[1] ?? NaN);
  const verdicts = fa.slice(0, 6).map((f) => {
    const t = thr(f);
    const over = !Number.isNaN(t) ? r1 >= t : s.level === "경보";
    const status = !Number.isNaN(t) ? (over ? "통제" : r1 >= t * 0.7 ? "통제 준비" : "예찰") : s.level === "경보" ? "통제" : s.level ? "통제 준비" : "예찰";
    return { f, t, status };
  });
  const objs = rankRisks(risksIn(s.region).filter((o) => (wantValley ? o.category === "야영장" : o.category === "지하차도") || (wantCoast && /상습침수|개선지구/.test(o.category))), s.region, { active: s.active }).slice(0, 12);
  const first = verdicts.find((v) => v.status === "통제") ?? verdicts[0];
  a.push({
    kind: "headline",
    text: `현재 ${s.level ? s.advisoryText : "특보 없음"} · 시간 최대 **${r1}mm** 기준으로, **즉시 통제 ${verdicts.filter((v) => v.status === "통제").length}곳 / 통제 준비 ${verdicts.filter((v) => v.status === "통제 준비").length}곳**입니다. 가장 먼저 **${first?.f.target.replace(/\s*\(.*\)/, "")}**${josa(first?.f.target.replace(/\s*\(.*\)/, "") ?? "", "을", "를")} 통제하십시오 — 매뉴얼 기준 '${first?.f.criteria.slice(0, 60)}…'${first ? citeManual(a, m, first.f.page) : ""}.${objs[0] ? ` 대상 시설은 ${objs.slice(0, 3).map((x) => a.e(riskRef(x.o, { near: x.near.length }))).join(", ")} 순입니다.` : ""}`,
  });
  a.push({
    kind: "facts",
    title: "통제 판정 (매뉴얼 기준 ↔ 현재)",
    items: verdicts.map((v) => ({ label: v.f.target.replace(/\s*\(.*\)/, "").slice(0, 16), value: v.status, tone: v.status === "통제" ? ("danger" as const) : v.status === "통제 준비" ? ("warn" as const) : ("ok" as const), note: !Number.isNaN(v.t) ? `기준 ${v.t}mm/h ↔ 현재 ${r1}mm` : `기준: ${v.f.criteria.slice(0, 40)}…`, cite: [a.cid(citeManual(a, m, v.f.page))] })),
  });
  a.push({
    kind: "actions",
    title: "통제 실행 절차",
    stage: { name: s.stage?.name.replace(/\s*\(.*\)/, "") ?? "평시", level: lvlOf(s.stage?.emergencyLevel) ?? undefined },
    manualId: `${m.id}:CTRL`,
    items: verdicts.filter((v) => v.status !== "예찰").flatMap((v) => v.f.actions.filter((l) => !/^\[복구\]/.test(l)).slice(0, 2).map((l) => ({ l, v }))).slice(0, 8).map(({ l, v }, i) => ({ seq: i + 1, task: `[${v.f.target.replace(/\s*\(.*\)/, "")}] ${l.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[p[\d-]+\]$/, "")}`, due: v.status === "통제" ? "즉시" : "준비", cite: [a.cid(citeManual(a, m, v.f.page))] })),
  });
  if (objs.length) a.push({ kind: "results", groups: [{ key: `ctrl:${s.region}`, label: wantValley ? "야영장 (철수 우선순)" : "지하차도 등 통제 대상", total: objs.length, items: objs.map((x) => riskRef(x.o, { near: x.near.length })) }] });
  objs.forEach((x) => a.ents.set(x.o.id, riskRef(x.o, { near: x.near.length })));
  a.focus = objs.slice(0, 6).map((x) => x.o.id);
  a.focusRef = objs[0] ? riskRef(objs[0].o) : undefined;
  a.followUps = ["우회로와 통행 불가 구간은?", "대피가 필요한 지역과 대상은?", "주민에게 어떤 메시지를 보내야 하나요?"];
}

/** 대피 — 대상 지역·인원·대피장소·고립 */
export function composeEvacuation(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-04 위험·취약지역 조회");
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  const s = situation(ctx);
  if (ctx.region === "national") return composeHotspot(a, ctx);
  const m = s.manual!;
  a.title = `${rshort(s.region)} 대피 대상·인원·장소`;
  /** 직접 대피 대상 인원 : 저수지 하류 우려주민·붕괴위험 가구 (개선지구 '인명보호'는 사업 수혜 인구라 참고값) */
  const pop = (o: RiskObject) => Number(o.attrs["인명피해 우려주민수(명)"] ?? (o.category === "붕괴위험지역" ? o.attrs["가구"] : 0) ?? 0);
  const ref = (o: RiskObject) => Number((o.attrs["사업수혜"] as Record<string, number> | undefined)?.["인명보호(명)"] ?? 0);
  const cand = risksIn(s.region)
    .filter((o) => (/저수지|개선지구|붕괴위험|급경사|산사태/.test(o.category) && (pop(o) > 0 || ref(o) > 0)) || (/산사태/.test(q + (ctx.keywords ?? []).join()) && o.category === "산사태취약지역" && o.grade === "A") || (/계곡|야영/.test(q) && o.category === "야영장"))
    .map((o) => ({ o, p: pop(o), near: s.reports.filter((r) => dist({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, o) <= 1 && relevant119(o.category, r.ext.accidentType)).length }))
    .sort((x, y) => y.near * 1e6 + y.p * 10 + Math.min(ref(y.o), 500) - (x.near * 1e6 + x.p * 10 + Math.min(ref(x.o), 500)))
    .slice(0, 20);
  const total = cand.reduce((n, x) => n + x.p, 0);
  const isolated = s.reports.filter((r) => /고립/.test(r.ext.accidentType));
  const evacAct = s.rec?.actions.filter((x) => /대피|철수/.test(x.action)) ?? [];
  const fa = m.fieldActions.find((f) => /주민대피|인명피해/.test(f.target));
  const order = s.level === "경보" && (isolated.length || cand.some((x) => x.near)) ? "대피 명령 검토" : s.level ? "대피 권고(사전대피)" : "대피 준비·예찰";
  a.push({
    kind: "headline",
    text: `대피 판단: **${order}**. 우선 대상은 ${cand.slice(0, 3).map((x) => `${a.e(riskRef(x.o))}(${x.near ? "신고 인근 · " : ""}${x.p ? `${x.p}${x.o.category === "붕괴위험지역" ? "가구" : "명"}` : x.o.category})`).join(", ")} 등 ${cand.length}곳이며, 직접 대피 대상(저수지 하류 우려주민·붕괴위험 가구)은 **${total.toLocaleString()}명·가구**입니다. 침수위험지구 보호인구 ${cand.reduce((n, x) => n + ref(x.o), 0).toLocaleString()}명은 대피 범위 판단 참고값입니다.${isolated.length ? ` 이미 고립 신고 ${isolated.length}건(${isolated.slice(0, 2).map((r) => r.ext.locationDetail).join(", ")})이 있습니다.` : ""}${evacAct.length ? ` 기록상 ${mdhm(evacAct[0].time)} '${evacAct[0].action.slice(0, 40)}'를 시행했습니다.` : ""}`,
  });
  a.push({
    kind: "facts",
    items: [
      { label: "대피 판단", value: order, tone: /명령/.test(order) ? "danger" : "warn" },
      { label: "우선 대상", value: String(cand.length), unit: "곳" },
      { label: "직접 대피 대상", value: total.toLocaleString(), unit: "명·가구", note: "저수지 하류 우려주민 + 붕괴위험 가구 (원천 데이터)" },
      { label: "고립 신고", value: String(isolated.length), unit: "건", tone: isolated.length ? "danger" : undefined },
      { label: "대피장소", value: "지정 대피장소", note: "대피소 데이터 미수신 — 매뉴얼 지정(마을회관·경로당 등)" },
    ],
  });
  if (fa) a.push({ kind: "narrative", title: "매뉴얼 대피 기준·절차", paragraphs: [`**기준** ${fa.criteria}${citeManual(a, m, fa.page)}`, ...fa.actions.slice(0, 4).map((l) => `· ${l.replace(/\s*\[p[\d-]+\]$/, "")}`)] });
  a.push({ kind: "results", groups: [{ key: `evac:${s.region}`, label: "대피 우선 대상", total: cand.length, items: cand.map((x) => ({ ...riskRef(x.o, { near: x.near }), metric: x.p ? `${x.p}${x.o.category === "붕괴위험지역" ? "가구" : "명"}` : ref(x.o) ? `보호인구 ${ref(x.o).toLocaleString()}(참고)` : riskRef(x.o).metric })) }, ...(isolated.length ? [{ key: "iso", label: "고립 신고", total: isolated.length, items: isolated.map(r119Ref) }] : [])] });
  cand.slice(0, 10).forEach((x) => a.ents.set(x.o.id, riskRef(x.o)));
  isolated.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  a.focus = [...cand.slice(0, 6).map((x) => x.o.id), ...isolated.map((r) => r.reportId)];
  a.focusRef = cand[0] ? riskRef(cand[0].o) : undefined;
  a.followUps = ["대피 명령과 권고 중 어느 수준이 맞나요?", "주민에게 어떤 메시지를 보내야 하나요?", "고립 예상 지역은?"];
}

/** 주민 안내 메시지 (재난문자·마을방송) 초안 */
export function composeMessage(a: Answer, ctx: QueryContext) {
  const s = situation(ctx);
  if (ctx.region === "national" || !s.manual) return composeHotspot(a, ctx);
  const m = s.manual;
  a.title = `${rshort(s.region)} 주민 안내 메시지 초안`;
  const top = rankRisks(risksIn(s.region).filter((o) => /지하차도|상습침수|급경사|붕괴|산사태|야영장/.test(o.category)), s.region, { active: s.active }).slice(0, 3);
  const t = m.stages.flatMap((st) => st.tasks).find((x) => /재난문자|CBS|문자|방송|전파/.test(x.task));
  // 장소는 주민이 알아볼 이름으로 (원천 관리번호 대신 지번·지구명)
  const place = top.map((x) => displayName(x.o).replace(/\s*\(.*\)$/, "").replace(/\s*(산사태취약지역|붕괴위험지역|급경사지|상습침수지역)$/, "").trim()).filter((n) => n && !/[A-Z]-[가-힣]+\d{5,}/.test(n)).slice(0, 2).join("·");
  // 참조 특보가 바다·산사태 특보면 그 특보에 맞는 문안
  const ra = ctx.refAdvisory;
  if (ra && /풍랑|해일|산사태/.test(ra.type)) {
    const coast = /풍랑|해일/.test(ra.type);
    const slopes = coast ? [] : rankRisks(risksIn(s.region).filter((o) => /산사태|급경사|붕괴/.test(o.category)), s.region, { active: s.active }).slice(0, 2).map((x) => displayName(x.o).replace(/\s*\(.*\)$/, "").replace(/\s*(산사태취약지역|붕괴위험지역|급경사지)$/, "").trim());
    const sms = coast
      ? `[${rshort(s.region)}] ${ra.area} ${ra.type}${ra.level} 발효 중. 높은 파도로 해안도로·방파제·갯바위 출입을 삼가고, 선박은 안전한 곳으로 피항·결박해 주시기 바랍니다.`
      : `[${rshort(s.region)}] 산사태${ra.level} 발령. ${slopes.length ? slopes.join("·") + " 등 " : ""}산 아래·급경사지 주민은 땅 갈라짐·물 솟음·나무 기울어짐을 보면 즉시 마을회관 등으로 대피하시기 바랍니다.`;
    const cast = coast
      ? `"${ra.area}에 ${ra.type}${ra.level}가 발효되었습니다. 해안도로와 방파제, 갯바위에 가지 마시고, 어선은 항구에 단단히 묶어 두십시오. 파도가 도로로 넘치면 즉시 높은 곳으로 이동해 주십시오."`
      : `"${rshort(s.region)}에 산사태${ra.level}가 발령되었습니다. 비가 그쳐도 산사태가 날 수 있습니다. 산 아래와 급경사지 주변 주민께서는 이상 징후가 보이면 바로 마을회관으로 대피하시고 119로 신고해 주십시오."`;
    a.push({ kind: "headline", text: `${ra.type}${ra.level}에 맞춘 재난문자(CBS) 초안입니다 — 위치·행동을 구체적으로 넣었습니다. 발송 결정·승인은 매뉴얼상 ${t?.owner?.split(" (")[0] ?? "재난부서"}${citeManual(a, m, t?.page)} 소관입니다.` });
    a.push({ kind: "narrative", title: "① 재난문자 (CBS)", paragraphs: [`「${sms}」 (${sms.length}자)`] });
    a.push({ kind: "narrative", title: "② 마을방송·전광판", paragraphs: [cast] });
    if (t) a.push({ kind: "notice", tone: "info", text: `매뉴얼 근거: ${t.task.slice(0, 90)}${citeManual(a, m, t.page, t.task.slice(0, 120))}` });
    a.followUps = ["상황보고는 누구에게 언제 해야 하나요?", coast ? "어디가 제일 위험해?" : "주민 대피가 필요할까?"];
    return;
  }
  const msg = s.level === "경보"
    ? `[${rshort(s.region)}] ${s.advisoryText} 발효 중. 시간당 ${s.rain1hMax ?? "많은"}mm 강한 비. ${place} 등 하천변·지하차도·급경사지 접근 금지, 저지대·반지하 주민은 높은 곳으로 대피 준비 바랍니다.`
    : s.level ? `[${rshort(s.region)}] ${s.advisoryText} 발효. 하천변 산책로·계곡 출입을 자제하고 배수구 주변 물건을 치워 주시기 바랍니다.` : `[${rshort(s.region)}] 비 예보에 대비해 하천변·계곡 이용을 자제하고 기상정보를 확인해 주시기 바랍니다.`;
  a.push({ kind: "headline", text: `재난문자(CBS) 초안입니다 — 90자 내외, 위치·행동을 구체적으로 넣었습니다. 발송 결정·승인은 매뉴얼상 ${t?.owner?.split(" (")[0] ?? "재난부서"}${citeManual(a, m, t?.page)} 소관입니다.` });
  a.push({ kind: "narrative", title: "① 재난문자 (CBS)", paragraphs: [`「${msg}」 (${msg.length}자)`] });
  a.push({ kind: "narrative", title: "② 마을방송·전광판", paragraphs: [`"${rshort(s.region)}${s.level ? `에 ${s.advisoryText}가 발효` : "에 많은 비가 예보"}되었습니다. ${place ? place + " 주변 주민께서는 " : ""}하천과 계곡에 접근하지 마시고, 지하주차장 차량은 미리 옮겨 주십시오. 위험을 발견하면 119로 신고해 주십시오."`] });
  if (t) a.push({ kind: "notice", tone: "info", text: `매뉴얼 근거: ${t.task.slice(0, 90)}${citeManual(a, m, t.page, t.task.slice(0, 120))}` });
  top.forEach((x) => a.ents.set(x.o.id, riskRef(x.o)));
  a.followUps = ["상황보고는 누구에게 언제 해야 하나요?", "대피가 필요한 지역과 대상은?"];
}

/** 상황보고 — 누구에게·언제·무엇을 */
export function composeReporting(a: Answer, ctx: QueryContext) {
  const s = situation(ctx);
  if (ctx.region === "national" || !s.manual) return composeHotspot(a, ctx);
  const m = s.manual;
  a.title = `${rshort(s.region)} 상황보고 체계`;
  a.push({ kind: "headline", text: `${m.responsibleDept} 매뉴얼 기준 보고 의무 ${m.reporting.length}건입니다. ${s.level ? `지금(${s.advisoryText})은 ` : ""}**${m.reporting[0]?.what}**을 ${m.reporting[0]?.when.slice(0, 40)}에 ${m.reporting[0]?.to.slice(0, 40)}로 보고하십시오${citeManual(a, m, m.reporting[0]?.page)}.` });
  a.push({ kind: "timeline", title: "보고 체계 (무엇 → 누구 · 언제)", items: m.reporting.map((r) => ({ at: r.when.slice(0, 26), label: r.what.slice(0, 18), kind: "보고", text: `${r.what} → ${r.to}${citeManual(a, m, r.page)}` })) });
  a.followUps = ["주민에게 어떤 메시지를 보내야 하나요?", "지금 상황에서 비상 몇 단계인가요?"];
}

/** 복합위험 — 침수 + 산사태 중첩 읍면동 */
export function composeCompound(a: Answer, ctx: QueryContext) {
  a.apis.add("T3Q-04 위험·취약지역 조회");
  const regs = ctx.region === "national" ? PILOTS : [ctx.region];
  a.title = `${rshort(ctx.region)} 복합위험(침수+산사태) 중첩 지역`;
  const FLOOD = /상습침수|홍수취약|지하차도|개선지구|소하천|건축물/;
  const SLOPE = /산사태|급경사|붕괴/;
  const map = new Map<string, { emd: string; sgg: string; f: RiskObject[]; l: RiskObject[] }>();
  regs.flatMap((r) => risksIn(r)).forEach((o) => {
    const k = `${o.region.sigungu} ${o.region.emd ?? ""}`;
    const v = map.get(k) ?? { emd: o.region.emd ?? "", sgg: o.region.sigungu, f: [], l: [] };
    if (FLOOD.test(o.category)) v.f.push(o);
    if (SLOPE.test(o.category)) v.l.push(o);
    map.set(k, v);
  });
  const both = [...map.values()].filter((v) => v.f.length && v.l.length).sort((x, y) => y.f.length * y.l.length - x.f.length * x.l.length);
  if (!both.length) {
    a.push({ kind: "headline", text: "침수와 산사태 위험지역이 같은 읍면동에 겹치는 곳이 데이터상 없습니다." });
    return;
  }
  a.push({
    kind: "headline",
    text: `침수 계열과 산사태 계열 위험지역이 **같은 읍면동에 겹치는 곳은 ${both.length}곳**입니다. 가장 중첩이 큰 곳은 ${both.slice(0, 3).map((v) => `**${v.sgg} ${v.emd}**(침수 ${v.f.length}·산사태 ${v.l.length})`).join(", ")}이며, 이곳은 한 번의 호우로 도로 침수와 사면 붕괴가 동시에 나 고립될 수 있습니다.`,
  });
  a.push({ kind: "narrative", title: "중첩 상위 읍면동", paragraphs: both.slice(0, 5).map((v) => `**${v.sgg} ${v.emd}** — 침수: ${v.f.slice(0, 2).map((o) => a.e(riskRef(o))).join(", ")} / 산사태: ${v.l.slice(0, 2).map((o) => a.e(riskRef(o))).join(", ")}`) });
  const items = both.slice(0, 6).flatMap((v) => [...v.f.slice(0, 3), ...v.l.slice(0, 3)]);
  a.push({ kind: "results", groups: [{ key: `cmp:${ctx.region}`, label: "중첩 지역 위험·취약지역", total: items.length, items: items.map((o) => riskRef(o)) }] });
  items.forEach((o) => a.ents.set(o.id, riskRef(o)));
  a.focus = items.slice(0, 10).map((o) => o.id);
  a.followUps = ["고립 예상 지역은?", "대피가 필요한 지역과 대상은?", "그 지역 과거 피해는?"];
}

/** 반복 피해 · 계획 vs 실제 · 정비 상태 */
export function composeRepeat(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-12 복구·정비 조회");
  const region = ctx.region === "national" ? "busan" : ctx.region;
  a.title = `${rshort(region)} 반복 피해와 정비 상태`;
  const led = LEDGER.filter((x) => inRegion(region, x.region.sido, x.region.sigungu));
  const byEmd = new Map<string, LedgerRec[]>();
  led.forEach((x) => { const k = `${x.region.sigungu} ${x.region.emd ?? ""}`; byEmd.set(k, [...(byEmd.get(k) ?? []), x]); });
  const rep = [...byEmd.entries()].map(([k, l]) => ({ k, l, n: new Set(l.map((x) => x.disaster_name.trim())).size })).filter((x) => x.n >= 3).sort((x, y) => y.n - x.n);
  const risks = risksIn(region);
  const repRisk = rep.slice(0, 15).map((r) => ({ ...r, rs: risks.filter((o) => `${o.region.sigungu} ${o.region.emd ?? ""}` === r.k) }));
  const gap = repRisk.filter((r) => !r.rs.some((o) => /개선지구|붕괴|급경사|상습침수|홍수/.test(o.category)));
  const undone = repRisk.flatMap((r) => r.rs.filter((o) => o.plan && planState(o) !== "완료"));
  const st = { 완료: 0, 추진: 0, 미정비: 0 } as Record<string, number>;
  risks.filter((o) => /개선지구|붕괴|저수지/.test(o.category)).forEach((o) => st[planState(o)]++);
  a.push({
    kind: "headline",
    text: /계획|다른|불일치/.test(q)
      ? `재해대장상 **3개 이상 재난에서 반복 피해**가 난 읍면동은 ${rep.length}곳이며, 이 중 **${gap.length}곳은 법정 위험지구(개선지구·붕괴위험·상습침수·홍수취약)로 지정돼 있지 않습니다** — 계획상 위험지구와 실제 피해지역이 어긋나는 곳입니다(예: ${gap.slice(0, 3).map((g) => g.k).join(", ")}).`
      : `${rname(region)}에서 3개 이상 재난에 반복 피해가 난 읍면동은 **${rep.length}곳**입니다. 상위는 ${rep.slice(0, 3).map((r) => `**${r.k}**(${r.n}개 재난·${r.l.length}건)`).join(", ")}이고, 이 동네 위험지구 중 **정비가 끝나지 않은 곳 ${undone.length}곳**${undone[0] ? `(${undone.slice(0, 2).map((o) => a.e(riskRef(o))).join(", ")})` : ""}이 우선 투자 대상입니다.`,
  });
  a.push({ kind: "facts", title: "정비사업 상태 (개선지구·붕괴위험·저수지)", items: [{ label: "정비 완료", value: String(st["완료"]), unit: "곳", tone: "ok" }, { label: "추진 중", value: String(st["추진"]), unit: "곳", tone: "warn" }, { label: "미정비", value: String(st["미정비"]), unit: "곳", tone: "danger" }, { label: "반복 피해 읍면동", value: String(rep.length), unit: "곳" }, { label: "지구 미지정 반복지", value: String(gap.length), unit: "곳", tone: gap.length ? "danger" : undefined }] });
  a.push({ kind: "narrative", title: "반복 피해 상위 읍면동", paragraphs: repRisk.slice(0, 5).map((r) => `**${r.k}** — ${r.n}개 재난 ${r.l.length}건 (${[...new Set(r.l.map((x) => x.date_start.slice(0, 4)))].slice(0, 5).join("·")}년), 관리대상 ${r.rs.length}곳${r.rs[0] ? `: ${r.rs.slice(0, 2).map((o) => a.e(riskRef(o))).join(", ")}` : " (지정 없음)"}`) });
  const pts = repRisk.slice(0, 10).map((r) => r.l.sort((x, y) => (y.damage_amount_krw_thousand ?? 0) - (x.damage_amount_krw_thousand ?? 0))[0]).map(ledgerRef);
  a.push({ kind: "results", groups: [...(undone.length ? [{ key: "undone", label: "반복지 · 정비 미완료", total: undone.length, items: undone.map((o) => riskRef(o)) }] : []), { key: "rep", label: "반복 피해 대표 지점", total: pts.length, items: pts }] });
  [...undone.slice(0, 6).map((o) => riskRef(o)), ...pts].forEach((x) => a.ents.set(x.id, x));
  a.focus = [...undone.slice(0, 5).map((o) => o.id), ...pts.map((p) => p.id)];
  a.followUps = ["동일 피해 재발을 막기 위해 어떤 개선이 필요한가요?", "정비 완료·추진·미정비 상태를 구분해 주세요", "과거 피해가 연결된 위험지구는 어디인가요?"];
}

/** 재발 방지 개선 / 복구 우선순위 (현재 사건) */
export function composeRecovery(a: Answer, ctx: QueryContext, q: string) {
  a.apis.add("T3Q-12 복구·정비 조회");
  const s = situation(ctx);
  if (/재발|개선|투자/.test(q) && !/우선 복구|복구 대상/.test(q)) return composeRepeat(a, ctx, q);
  if (ctx.region === "national" || !s.manual) return composeRepeat(a, ctx, q);
  const m = s.manual;
  const rst = m.stages.find((x) => /해제|복구/.test(x.name));
  a.title = `${rshort(s.region)} 수습·복구 판단`;
  const reps = s.reports;
  const damaged = reps.map((r) => ({ r, n: RISKS.find((o) => dist({ lon: r.ext.coord.lon, lat: r.ext.coord.lat }, o) <= 0.5) })).sort((x, y) => (y.r.ext.rescueeCount ?? 0) - (x.r.ext.rescueeCount ?? 0));
  const roads = reps.filter((r) => /도로|낙석|토사|고립|진입로/.test(r.ext.accidentType));
  const canEnd = !s.level;
  a.push({
    kind: "headline",
    text: `${canEnd ? "특보가 해제돼 **응급 대응을 종료하고 수습·복구 단계로 전환**할 수 있습니다" : `${s.advisoryText}가 아직 발효 중이라 **응급 대응을 유지**하면서 피해지 응급복구만 병행하십시오`}${rst ? citeManual(a, m, rst.tasks[0]?.page) : ""}. 우선 복구는 **통행·고립 관련 ${roads.length}곳**(${roads.slice(0, 2).map((r) => a.e(r119Ref(r))).join(", ")})을 먼저 — 구조·구급 동선과 2차 피해를 막기 위해서입니다. 이후 주택·상가 침수, 하천 시설 순입니다.`,
  });
  a.push({ kind: "facts", items: [{ label: "단계 판단", value: canEnd ? "복구 전환" : "대응 유지", tone: canEnd ? "ok" : "warn" }, { label: "피해 신고", value: String(reps.length), unit: "건" }, { label: "도로·고립 우선", value: String(roads.length), unit: "곳", tone: "danger" }, { label: "복구 단계 조치", value: String(rst?.tasks.length ?? 0), unit: "개" }] });
  if (rst) a.push({ kind: "actions", title: "수습·복구 절차", stage: { name: rst.name.replace(/\s*\(.*\)/, ""), trigger: rst.trigger }, manualId: `${m.id}:${rst.stageId}`, items: rst.tasks.slice(0, 8).map((t) => ({ seq: t.seq, task: t.task, owner: t.owner, due: t.timing, cite: [a.cid(citeManual(a, m, t.page))] })) });
  if (damaged.length) a.push({ kind: "results", groups: [{ key: "recov", label: "복구 우선 대상 (피해 신고 지점)", total: damaged.length, items: [...roads, ...reps.filter((r) => !roads.includes(r))].map(r119Ref) }] });
  reps.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  a.focus = roads.map((r) => r.reportId);
  a.followUps = ["동일 피해 재발을 막기 위해 어떤 개선이 필요한가요?", "과거 비슷한 사건의 복구는 어떻게 됐나요?", "피해 규모는 얼마인가요?"];
}

/** 어디가 가장 위험한가 — 읍면동·지역 비교 */
export function composeHotspot(a: Answer, ctx: QueryContext) {
  a.apis.add("T3Q-04 위험·취약지역 조회");
  const regs = ctx.region === "national" ? PILOTS : [ctx.region];
  a.title = `${rshort(ctx.region)} 위험 집중 지역`;
  const rows = regs.map((r) => {
    const s = situation(ctx, r);
    const ranked = rankRisks(risksIn(r), r, { active: s.active });
    const emd = new Map<string, { score: number; n: number; top: RiskObject; reps: number }>();
    ranked.forEach((x) => {
      const k = `${x.o.region.sigungu} ${x.o.region.emd ?? ""}`;
      const v = emd.get(k) ?? { score: 0, n: 0, top: x.o, reps: 0 };
      v.score += x.score;
      v.n++;
      v.reps += x.near.length;
      emd.set(k, v);
    });
    const tops = [...emd.entries()].sort((x, y) => y[1].score - x[1].score).slice(0, 5);
    return { r, s, tops, idx: ranked.slice(0, 20).reduce((n, x) => n + x.score, 0) * (s.level === "경보" ? 1.5 : s.level ? 1.2 : 1) + s.reports.length * 10 };
  }).sort((x, y) => y.idx - x.idx);
  const t = rows[0];
  a.push({
    kind: "headline",
    text: ctx.region === "national"
      ? `지금 가장 위험한 곳은 **${t.s.rname}**입니다 — ${t.s.advisoryText || "특보 없음"}, 시간 최대 ${t.s.rain1hMax ?? "—"}mm, 119 신고 ${t.s.reports.length}건. 읍면동 단위로는 ${t.tops.slice(0, 3).map(([k]) => `**${k}**`).join(", ")}를 먼저 보십시오. 그다음은 ${rows.slice(1).map((x) => `${rshort(x.r)}(${x.s.advisoryText || "특보 없음"}, 신고 ${x.s.reports.length}건)`).join(", ")} 순입니다.`
      : `${t.s.rname}에서 위험이 가장 집중된 읍면동은 ${t.tops.slice(0, 3).map(([k, v]) => `**${k}**(관리대상 ${v.n}곳${v.reps ? `·신고 인근 ${v.reps}` : ""})`).join(", ")}입니다.`,
  });
  a.push({ kind: "facts", items: rows.map((x) => ({ label: x.s.rname, value: x.s.advisoryText || "특보 없음", tone: x.s.level === "경보" ? ("danger" as const) : x.s.level ? ("warn" as const) : ("ok" as const), note: `시간최대 ${x.s.rain1hMax ?? "—"}mm · 119 ${x.s.reports.length}건 · 1순위 ${x.tops[0]?.[0] ?? "—"}` })) });
  a.push({ kind: "narrative", title: "읍면동 위험 집중 순위", paragraphs: rows.flatMap((x) => x.tops.slice(0, ctx.region === "national" ? 2 : 5).map(([k, v], i) => `${rshort(x.r)} ${i + 1}. **${k}** — 관리대상 ${v.n}곳, 대표 ${a.e(riskRef(v.top))}${v.reps ? `, 진행 중 신고 인근 ${v.reps}건` : ""}`)) });
  const items = rows.flatMap((x) => x.tops.map(([, v]) => riskRef(v.top)));
  a.push({ kind: "results", groups: [{ key: "hot", label: "읍면동 대표 위험지역", total: items.length, items }] });
  items.forEach((x) => a.ents.set(x.id, x));
  a.focus = items.slice(0, 10).map((x) => x.id);
  a.followUps = ["중앙 보고 대상 상황인가요?", "이번 호우로 접수된 119 신고 현황은?", "지금 먼저 통제해야 할 도로와 지하차도는?"];
}

/* =========================================================
   AI 모드 — 기상특보 기반 상황점검 (시나리오 타임라인)
   ========================================================= */
export interface CheckStep { at: string; label: string; region: Exclude<RegionId, "national"> }
export function checkSteps(region: RegionId): CheckStep[] {
  const pr = region === "national" ? "busan" : region;
  const ev = EVENT_BY_ID.get(SCENARIO[pr].eventId);
  const rec = ev && regionRecord(ev, pr);
  const hr = rec?.weatherLocal?.hourly ?? [];
  if (!ev || !hr.length) return [];
  const advs = ev.weather.advisories.filter((x) => new RegExp(rshort(pr)).test(x.area)).map((x) => ({ at: x.issuedAt.length <= 16 ? x.issuedAt + ":00+09:00" : x.issuedAt, label: `${x.type}${x.level} 발표` }));
  const peak = hr.reduce((p, h) => (h.mm > p.mm ? h : p));
  const steps = [
    { at: hr[0].t, label: "강우 시작 · 평시 점검" },
    ...advs,
    { at: peak.t, label: `강우 정점 ${peak.mm}mm/h` },
    { at: SCENARIO[pr].baseTime, label: "현재 시각 점검" },
  ];
  // 경보 발표 후 첫 119 신고
  const firstRep = (rec?.reports119 ?? []).map((id) => R119_BY_ID.get(id)).filter((x): x is Report119 => !!x).sort((x, y) => x.신고일시.localeCompare(y.신고일시))[0];
  if (firstRep) steps.push({ at: firstRep.신고일시.replace(" ", "T") + "+09:00", label: "첫 119 신고 접수" });
  const norm = (t: string) => new Date(t).toISOString();
  const merged = new Map<string, CheckStep>();
  for (const st of steps) {
    const k = norm(st.at).slice(0, 16);
    const ex = merged.get(k);
    merged.set(k, { at: norm(st.at), region: pr, label: ex ? `${/발표/.test(st.label) ? st.label : ex.label} · ${/발표/.test(st.label) ? ex.label : st.label}` : st.label });
  }
  return [...merged.values()].sort((x, y) => x.at.localeCompare(y.at));
}

export function composeCheck(a: Answer, ctx: QueryContext) {
  a.apis.add("UNE-기상특보(기상청)");
  a.apis.add("T3Q-01 상황점검(프리셋)");
  const pr = ctx.region === "national" ? "busan" : ctx.region;
  const t = new Date(ctx.baseTime).getTime();
  const prevT = ctx.prevCheckAt ? new Date(ctx.prevCheckAt).getTime() : null;
  const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", ".");
  a.title = `AI 상황점검 · ${rshort(pr)}`;
  if (ctx.mode === "live") {
    const s = situation(ctx, pr);
    a.push({ kind: "headline", text: `[${kst(ctx.baseTime)} 자동 점검] 기상청 특보 조회 결과 ${s.level ? `**${s.advisoryText}** 발효 중 — 매뉴얼 '${s.stage?.name}' 단계 조치를 확인하십시오` : `${rname(pr)}에 발효 중인 특보가 없습니다. 다음 점검은 10분 뒤입니다`}${citeKMA(a, true, s.advisoryText || "특보 없음")}.` });
    a.push({ kind: "notice", tone: "info", text: "AI 모드는 기상특보 발표·변경·해제 시 또는 10분마다 자동으로 상황을 점검합니다. 수문 실시간 예측은 하지 않으며, 강우·수위는 조건 입력으로 반영합니다." });
    a.followUps = ["현재 상황 브리핑", "평시 점검할 위험·취약지역은?"];
    return;
  }
  const ev = EVENT_BY_ID.get(SCENARIO[pr].eventId)!;
  const rec = regionRecord(ev, pr)!;
  const m = MANUAL_BY_REGION[pr];
  const advs = ev.weather.advisories.filter((x) => new RegExp(rshort(pr)).test(x.area)).map((x) => ({ ...x, ts: new Date(x.issuedAt.length <= 16 ? x.issuedAt + ":00+09:00" : x.issuedAt).getTime() })).filter((x) => x.ts <= t);
  const cur = advs.filter((x) => x.type === "호우").sort((x, y) => y.ts - x.ts)[0];
  const other = advs.filter((x) => x.type !== "호우");
  const hr = (rec.weatherLocal?.hourly ?? []).filter((h) => new Date(h.t).getTime() <= t);
  const last = hr.at(-1);
  const tot = hr.reduce((n, h) => n + h.mm, 0);
  const last3 = hr.slice(-3).reduce((n, h) => n + h.mm, 0);
  const prevTot = prevT ? (rec.weatherLocal?.hourly ?? []).filter((h) => new Date(h.t).getTime() <= prevT).reduce((n, h) => n + h.mm, 0) : 0;
  const reps = rec.reports119.map((id) => R119_BY_ID.get(id)).filter((x): x is Report119 => !!x).filter((r) => new Date(r.신고일시.replace(" ", "T") + "+09:00").getTime() <= t).sort((x, y) => x.신고일시.localeCompare(y.신고일시));
  const newReps = prevT ? reps.filter((r) => new Date(r.신고일시.replace(" ", "T") + "+09:00").getTime() > prevT) : reps;
  const prevAdv = prevT ? advs.filter((x) => x.ts <= prevT && x.type === "호우").sort((x, y) => y.ts - x.ts)[0] : undefined;
  const changed = cur && (!prevAdv || prevAdv.level !== cur.level);
  const level = cur ? (cur.level === "경보" ? "경보" : "주의보") : null;
  const stage = m.stages.find((x) => (level === "경보" ? /경보 발/.test(x.name) : level === "주의보" ? /주의보/.test(x.name) : /예비/.test(x.name)))!;
  const acts = rec.actions.filter((x) => new Date(x.time + ":00+09:00").getTime() <= t);
  const th = rainThresholds(pr).filter((x) => x.basis === "1h");
  const maxNow = Math.max(0, ...hr.map((h) => h.mm));
  const crossed = th.filter((x) => maxNow >= x.mm);
  const ranked = rankRisks(risksIn(pr), pr, { active: !!level }).filter((x) => x.near.every((r) => new Date(r.신고일시.replace(" ", "T") + "+09:00").getTime() <= t)).slice(0, 3);
  const verdict = changed ? `**특보 변경 — ${cur!.type}${cur!.level}**` : level ? `${cur!.type}${cur!.level} 유지` : "특보 전 · 평시 점검";
  a.push({
    kind: "headline",
    text: `[${kst(ctx.baseTime)} 자동 점검] ${verdict}. 누적 ${tot.toFixed(1)}mm${prevT ? `(직전 점검 대비 +${(tot - prevTot).toFixed(1)}mm)` : ""}, 최근 1시간 **${last?.mm ?? 0}mm**·3시간 ${last3.toFixed(1)}mm${crossed.length ? ` — '${crossed.map((c) => c.label).join("', '")}' ${crossed[0].mm}mm 기준 초과` : ""}. ${newReps.length ? `새 119 신고 **${newReps.length}건**(${newReps.slice(0, 2).map((r) => r.ext.accidentType).join("·")}). ` : ""}매뉴얼상 **${stage.name.replace(/\s*\(.*\)/, "")}** 단계${changed ? "로 격상 — 아래 조치를 시작하십시오" : "를 유지합니다"}${citeManual(a, m, stage.tasks[0]?.page)}.`,
  });
  a.push({
    kind: "facts",
    title: "점검 항목",
    items: [
      { label: "기상특보", value: cur ? `${cur.type}${cur.level}` : "없음(예비 단계)", tone: level === "경보" ? "danger" : level ? "warn" : "ok", note: [...(cur ? [`${kst(new Date(cur.ts).toISOString())} 발표`] : []), ...other.map((o) => `${o.type}${o.level}`)].join(" · ") },
      { label: "최근 1시간", value: String(last?.mm ?? 0), unit: "mm", tone: crossed.length ? "danger" : undefined, note: crossed.length ? `기준 ${crossed[0].mm}mm 초과` : "통제 기준 미만" },
      { label: "누적", value: tot.toFixed(1), unit: "mm", note: prevT ? `+${(tot - prevTot).toFixed(1)}mm` : undefined },
      { label: "119 신고", value: String(reps.length), unit: "건", tone: newReps.length ? "warn" : undefined, note: newReps.length ? `신규 ${newReps.length}건` : "신규 없음" },
      { label: "비상 단계", value: stage.emergencyLevel.match(/비상\s*[\d·]+단계/)?.[0] ?? "준비", note: changed ? "격상" : "유지" },
    ],
  });
  const todo = stage.tasks.slice(0, changed ? 5 : 3);
  a.push({ kind: "actions", title: changed ? "격상에 따른 즉시 조치" : "이 시점 확인 사항", stage: { name: stage.name.replace(/\s*\(.*\)/, ""), level: stage.emergencyLevel.match(/비상\s*[\d·]+단계/)?.[0] }, manualId: `${m.id}:${stage.stageId}`, items: todo.map((x) => ({ seq: x.seq, task: x.task, owner: x.owner, due: x.timing, cite: [a.cid(citeManual(a, m, x.page))] })) });
  if (acts.length || newReps.length)
    a.push({ kind: "timeline", title: "직전 점검 이후 변화", items: [...acts.filter((x) => !prevT || new Date(x.time + ":00+09:00").getTime() > prevT).map((x) => ({ at: x.time.replace("T", " ").slice(5, 16), label: "조치", kind: "대응", text: x.action })), ...newReps.map((r) => ({ at: r.신고일시.slice(5, 16), label: "119", kind: "119", text: `${a.e(r119Ref(r))} ${r.ext.callSummary}${cite119(a, r)}` }))].sort((x, y) => x.at.localeCompare(y.at)).slice(0, 8) });
  a.push({ kind: "rainChart", title: "점검 시각까지 시간당 강우", current: { label: "시간당 강우", series: hr.map((h) => ({ t: h.t.slice(11, 13) + "시", mm: h.mm })) }, thresholds: th.map(({ mm, label, basis }) => ({ mm, label, basis })) });
  ranked.forEach((x) => a.ents.set(x.o.id, riskRef(x.o, { near: x.near.length })));
  reps.forEach((r) => a.ents.set(r.reportId, r119Ref(r)));
  a.focus = [...ranked.map((x) => x.o.id), ...newReps.map((r) => r.reportId)];
  a.followUps = ["지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?", "지금 먼저 통제해야 할 도로와 지하차도는?", "대피가 필요한 지역과 대상은?"];
}

export { PILOTS, type Situation, type Manual };
