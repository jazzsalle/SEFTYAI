import "server-only";
import type { QueryContext, RegionId } from "../../contract/agent";
import { EVENTS, SCENARIO, eventRef, fmtKrwThousand, regionRecord, scenarioWeather, type DisasterEvent } from "../events";
import { MANUAL_BY_REGION, stageFor, type Manual } from "../manual";
import { RISKS, displayName, rankRisks, riskRef, type RiskObject } from "../risk";
import { Answer, citeEvent, citeKMA, citeManual, citeRisk, mdhm, rname, rshort, situation } from "./core";

/**
 * 특보 참조 질의 (UFR-001-001-04) — [특보로 질문]으로 대화에 건 특보를 질문과 함께 받아 답한다.
 * 특보는 조건이 아니라 참조 정보 : 질문 의도는 그대로 두고, 지역·특보 단계·특보 종류에 맞춰 답의 초점을 바꾼다.
 */
export type RefAdvisory = NonNullable<QueryContext["refAdvisory"]>;
export type AdvKind = "rain" | "landslide" | "coast" | "wind";
export const advKind = (type: string): AdvKind => (/산사태/.test(type) ? "landslide" : /풍랑|해일/.test(type) ? "coast" : /강풍/.test(type) ? "wind" : "rain");
export const advName = (a: RefAdvisory) => `${a.type}${a.level}`;
export const advRegion = (a: RefAdvisory, ctx: QueryContext): RegionId =>
  a.regionId ?? (/부산/.test(a.area) ? "busan" : /영천/.test(a.area) ? "yeongcheon" : /인제/.test(a.area) ? "inje" : ctx.region);

/** 기상청·산림청 특보 발표 기준 */
const CRIT: Record<string, Record<string, string>> = {
  호우: { 예비특보: "호우주의보 기준 도달이 예상될 때 미리 발표", 주의보: "3시간 강우량 60mm 이상 또는 12시간 강우량 110mm 이상 예상", 경보: "3시간 강우량 90mm 이상 또는 12시간 강우량 180mm 이상 예상" },
  태풍: { 예비특보: "태풍 영향이 예상될 때 미리 발표", 주의보: "태풍으로 강풍·풍랑·호우·폭풍해일이 주의보 기준에 도달할 것으로 예상", 경보: "태풍으로 강풍(풍랑) 경보 기준, 총 강우량 200mm 이상 또는 폭풍해일 경보 기준 도달 예상" },
  풍랑: { 예비특보: "풍랑주의보 기준 도달이 예상될 때 미리 발표", 주의보: "해상 풍속 14m/s 이상이 3시간 이상 지속되거나 유의파고 3m 초과 예상", 경보: "해상 풍속 21m/s 이상이 3시간 이상 지속되거나 유의파고 5m 초과 예상" },
  강풍: { 예비특보: "강풍주의보 기준 도달이 예상될 때 미리 발표", 주의보: "육상 풍속 14m/s 이상 또는 순간풍속 20m/s 이상 예상 (산지 17m/s·25m/s)", 경보: "육상 풍속 21m/s 이상 또는 순간풍속 26m/s 이상 예상 (산지 24m/s·30m/s)" },
  폭풍해일: { 주의보: "천문조·폭풍·저기압 등으로 해수면이 지역별 주의보 기준값 이상 상승 예상", 경보: "해수면이 지역별 경보 기준값 이상 상승 예상" },
  산사태: { 주의보: "토양함수지수 80% 도달 시 산림청·지자체가 발령하는 산사태 위험예보", 경보: "토양함수지수 100% 도달 시 발령하는 산사태 위험예보" },
};
export const advCriteria = (a: RefAdvisory) => CRIT[a.type]?.[a.level] ?? `${a.type}${a.level} 발표 기준`;
const RAIN_NUM: Record<string, { h3: number; h12: number }> = { 주의보: { h3: 60, h12: 110 }, 경보: { h3: 90, h12: 180 } };

const FA_RE: Record<AdvKind, RegExp> = { rain: /지하차도|하천|저지대|침수/, landslide: /산사태|급경사|산악/, coast: /해안|월파|해일|선박|항포구|방파/, wind: /강풍|옥외|시설물|간판/ };
const isCoastal = (o: RiskObject) => /해일|해안|방파|월파|호안|해수욕/.test(`${o.name} ${o.reason}`);
const FA_PREF: Record<AdvKind, RegExp> = { rain: /지하차도|하천/, landslide: /산사태|산악/, coast: /해안|월파/, wind: /강풍/ };
const faScore = (f: { target: string; criteria: string }, k: AdvKind) => (FA_PREF[k].test(f.target) ? 2 : 0) + (FA_PREF[k].test(f.target.split(/[\s(/]/)[0]) ? 1 : 0) - (/미기재/.test(f.criteria) ? 3 : 0);
const fieldActs = (m: Manual | null, k: AdvKind) => (m ? m.fieldActions.filter((f) => FA_RE[k].test(f.target)).sort((x, y) => faScore(y, k) - faScore(x, k)) : []);
const clean = (l: string) => l.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[p[\d-]+\]$/, "");
const first = (t: string, n = 90) => {
  const s1 = t.split(/(?<!\d)[.。](?!\d)/)[0];
  if (s1.length <= n) return s1;
  const cut = s1.slice(0, n);
  const at = Math.max(cut.lastIndexOf(" / "), cut.lastIndexOf(", "));
  return at > 20 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, "");
};
/** 받침에 맞는 조사 (은/는 · 이/가) */
const josa = (w: string, withB: string, without: string) => {
  const c = w.charCodeAt(w.length - 1);
  return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? withB : without);
};
const toDate = (s: string) => new Date(s.length <= 16 ? s + ":00+09:00" : s);
const gapText = (min: number) => `${Math.floor(min / 60) ? `${Math.floor(min / 60)}시간` : ""}${min % 60 ? ` ${min % 60}분` : ""}`.trim();

/** 시간별 강우에서 n시간 최대 누적 */
function maxWindow(hourly: { t: string; mm: number }[], n: number) {
  let best = 0;
  for (let i = 0; i < hourly.length; i++) best = Math.max(best, hourly.slice(i, i + n).reduce((s, h) => s + h.mm, 0));
  return Math.round(best * 10) / 10;
}

/** 지역 사건 특보 경과 (시나리오 사건) */
function advHistory(region: RegionId, type: string) {
  if (region === "national") return [];
  const ev = EVENTS.find((e) => e.eventId === SCENARIO[region].eventId);
  const re = new RegExp(rshort(region));
  return (ev?.weather.advisories ?? []).filter((x) => x.type === type && (re.test(x.area) || (type === "풍랑" && region === "busan"))).sort((x, y) => x.issuedAt.localeCompare(y.issuedAt));
}

/** 같은 지역에 같은 종류 특보가 났던 과거 사건 (특보 이력이 없는 사건은 재난유형으로 보완) */
function pastSameAdvisory(region: RegionId, a: RefAdvisory, k: AdvKind): DisasterEvent[] {
  const re = region === "national" ? /./ : new RegExp(rshort(region));
  const inRegion = (e: DisasterEvent) => region === "national" || !!regionRecord(e, region);
  const past = EVENTS.filter((e) => !e.synthetic && !e.training && inRegion(e));
  const exact = past.filter((e) => e.weather.advisories.some((x) => x.type === a.type && x.level === a.level && re.test(x.area)));
  const dmg = (e: DisasterEvent) => (region === "national" ? e.regions : [regionRecord(e, region)!]).reduce((s, r) => s + (r?.damages.publicFacilityLedger?.damage_krw_thousand ?? 0), 0);
  const byType =
    k === "coast" || k === "wind"
      ? past.filter((e) => e.typeName.includes("태풍") || /해안|월파|해일|너울|강풍/.test(JSON.stringify(e.regions.map((r) => r.summary))))
      : k === "landslide"
        ? past.filter((e) => e.regions.some((r) => /산사태|토사|사면/.test(`${r.summary} ${r.damageTags.join(" ")} ${Object.keys(r.damages.publicFacilityLedger?.byFacilityType ?? {}).join(" ")}`)))
        : past.filter((e) => e.typeName.includes("호우"));
  const out = [...exact, ...byType.filter((e) => !exact.includes(e)).sort((x, y) => dmg(y) - dmg(x))];
  return out.slice(0, 4);
}

const QQ = (a: RefAdvisory) => [
  `이 ${advName(a)}에서 우선 확인해야 할 위험·취약지역은?`,
  `이 ${advName(a)}와 비슷한 과거 재난사례는?`,
  `이 ${advName(a)} 단계에서 행동매뉴얼상 확인할 대응절차는?`,
];

/* ---------------- ① 특보 자체 : 무엇이고, 기준을 넘었나, 매뉴얼상 어느 단계인가 ---------------- */
export function composeAdvisoryInfo(a: Answer, ctx: QueryContext, adv: RefAdvisory, q = "") {
  const focus: "criteria" | "history" | "end" = /해제|끝나|끝날|지속|계속|언제까지|풀리/.test(q) ? "end" : /격상|경과|이력|언제\s*(발표|발효|나왔)|처음|바뀌/.test(q) ? "history" : "criteria";
  a.apis.add("UNE-기상특보(기상청)");
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  const region = advRegion(adv, ctx);
  const k = advKind(adv.type);
  const pr = region === "national" ? null : region;
  const s = situation(ctx, region);
  const m = pr ? MANUAL_BY_REGION[pr] : null;
  const name = advName(adv);
  a.title = `${adv.area} ${name} — 기준과 대응 단계`;
  const kma = citeKMA(a, ctx.mode === "live", `${adv.area} ${name} ${adv.issuedAt}`);

  // 현재 값 vs 발표 기준
  let now = "";
  const facts: { label: string; value: string; unit?: string; note?: string; tone?: "danger" | "warn" | "ok" | "info" }[] = [
    { label: "발표", value: mdhm(adv.issuedAt), note: adv.area },
    { label: "발표 기준", value: name, note: advCriteria(adv) },
  ];
  if (k === "rain") {
    const wx = pr && ctx.mode === "scenario" ? scenarioWeather(pr) : null;
    const hourly = wx?.hourly ?? [];
    const h3 = ctx.hydro?.rain3h ?? (hourly.length ? maxWindow(hourly, 3) : null);
    const h12 = ctx.hydro?.rain12h ?? (hourly.length ? maxWindow(hourly, 12) : null);
    const lim = RAIN_NUM[adv.level === "경보" ? "경보" : "주의보"];
    if (h3 != null || h12 != null) {
      const over3 = h3 != null && h3 >= RAIN_NUM.경보.h3, over12 = h12 != null && h12 >= RAIN_NUM.경보.h12;
      now = ` ${ctx.hydro?.rain3h != null ? "입력하신" : "관측된"} 3시간 최대 **${h3 ?? "—"}mm**, 12시간 최대 **${h12 ?? "—"}mm**로 ${over3 || over12 ? "**경보 기준을 이미 넘었습니다**" : h3 != null && h3 >= RAIN_NUM.주의보.h3 ? "주의보 기준은 넘었고 경보 기준(3시간 90mm)에는 아직 못 미칩니다" : "아직 주의보 기준 아래입니다"}.${adv.level === "경보" && !(over3 || over12) ? " 경보는 앞으로 올 비(예상 강우)를 보고 발표하므로, 지금까지 내린 양이 기준 아래여도 경보 단계로 대응해야 합니다." : ""}`;
      facts.push({ label: "3시간 최대", value: String(h3 ?? "—"), unit: "mm", tone: h3 != null && h3 >= lim.h3 ? "danger" : "warn", note: `${adv.level} 기준 ${lim.h3}mm` });
      facts.push({ label: "12시간 최대", value: String(h12 ?? "—"), unit: "mm", tone: h12 != null && h12 >= lim.h12 ? "danger" : undefined, note: `${adv.level} 기준 ${lim.h12}mm` });
    } else now = " 실시간 강우 관측값은 제공하지 않습니다. 강우량을 [조건 변경]에 입력하시면 발표 기준과 비교해 드립니다.";
  } else if (k === "landslide") {
    const wx = pr && ctx.mode === "scenario" ? scenarioWeather(pr) : null;
    now = wx?.totalRain_mm ? ` 이번 비로 누적 **${wx.totalRain_mm}mm**가 내려 지반이 포화에 가까워진 상태입니다. 산사태는 비가 그친 뒤에도 일어날 수 있어 특보 해제 전까지 사면 징후를 계속 봐야 합니다.` : " 산사태는 비가 그친 뒤에도 일어날 수 있어 특보 해제 전까지 사면 징후를 계속 봐야 합니다.";
  } else if (k === "coast") {
    now = " 바다 기상특보라 육상 침수 기준과는 별개이며, 해안가 월파·너울성 파도와 선박·항포구 안전이 핵심입니다. 같은 시각 육상에 호우특보가 겹치면 저지대 배수가 바닷물에 막혀 침수가 커질 수 있습니다.";
  }

  // 매뉴얼 단계
  let stageTxt = "";
  const fa = fieldActs(m, k);
  if (m && (k === "rain")) {
    const st = stageFor(m, adv.level === "경보" ? "경보" : adv.level === "주의보" ? "주의보" : "예비특보");
    if (st) {
      stageTxt = ` 매뉴얼상 **${st.name.replace(/\s*\(.*\)/, "")}**(${st.emergencyLevel.split(" — ")[0]}) 단계입니다${citeManual(a, m, st.tasks[0]?.page, st.trigger)}.`;
      facts.push({ label: "매뉴얼 단계", value: st.emergencyLevel.split(" — ")[0], note: st.trigger.slice(0, 40), tone: adv.level === "경보" ? "danger" : "warn" });
    }
  } else if (m && fa.length) {
    stageTxt = ` 매뉴얼은 '${fa[0].target.replace(/\s*\(.*\)/, "")}'에 대해 "${fa[0].criteria.slice(0, 70)}${fa[0].criteria.length > 70 ? "…" : ""}" 기준으로 대응하도록 정하고 있습니다${citeManual(a, m, fa[0].page, fa[0].criteria.slice(0, 140))}.`;
    facts.push({ label: "매뉴얼 해당 항목", value: fa[0].target.replace(/\s*\(.*\)/, ""), note: fa[0].page ? `p.${fa[0].page}` : undefined });
  } else if (!m) stageTxt = " 대응 매뉴얼은 시범 3개 지역(부산·영천·인제)만 제공합니다.";

  const hist = advHistory(region, adv.type);
  let lead = `${adv.area}에 **${name}**가 ${mdhm(adv.issuedAt)}에 발표돼 발효 중입니다${kma}. 이 특보는 '${advCriteria(adv)}'일 때 발표됩니다.${now}${stageTxt}`;
  if (focus === "history") {
    const cur = hist.findIndex((x) => x.level === adv.level) >= 0 ? hist.findIndex((x) => x.level === adv.level) : hist.length - 1;
    const firstAdv = hist[0];
    if (hist.length > 1 && firstAdv && firstAdv.level !== adv.level) {
      const gap = Math.round((toDate(adv.issuedAt).getTime() - toDate(firstAdv.issuedAt).getTime()) / 6e4);
      lead = `${josa(adv.area, "은", "는")} ${mdhm(firstAdv.issuedAt)}에 **${firstAdv.type}${firstAdv.level}**가 먼저 발표됐고, **${gapText(gap)}** 뒤인 ${mdhm(adv.issuedAt)}에 **${name}**로 격상됐습니다${kma}.${now}${stageTxt}`;
    } else lead = `이번 **${name}**는 ${mdhm(adv.issuedAt)}에 처음 발표됐고, 그 전에 같은 종류의 낮은 단계 특보는 없었습니다${kma}. 이 특보는 '${advCriteria(adv)}'일 때 발표됩니다.${stageTxt}`;
    void cur;
  } else if (focus === "end") {
    const after = m ? stageFor(m, "복구") : null;
    const keep = k === "landslide" ? "비가 그쳐도 땅속에 머금은 물 때문에 산사태가 이어질 수 있어, 해제 뒤에도 하루 정도는 급경사지·사면 징후 점검을 이어가야 합니다." : k === "coast" ? "해제 전까지는 해안도로·갯바위·방파제 통제와 선박 피항을 유지하고, 해제 뒤 파고를 확인해 통제를 풉니다." : `해제 전까지는 지금 단계 근무를 유지하고, 해제되면 매뉴얼 '${after?.name.replace(/\s*\(.*\)/, "") ?? "수습·복구"}' 단계로 넘어갑니다${after && m ? citeManual(a, m, after.tasks[0]?.page, after.trigger) : ""}${after?.tasks.length ? ` — ${after.tasks.slice(0, 2).map((t, i) => `${"①②"[i]} ${t.task}`).join(" ")}` : ""}.`;
    lead = `**${name}**의 해제 시각은 기상청(${k === "landslide" ? "산사태는 산림청" : "기상특보"})이 해제를 발표해야 알 수 있어 미리 예측하지 않습니다${kma}. 현재 ${mdhm(adv.issuedAt)} 발표 이후 계속 발효 중입니다. ${keep} AI 모드를 켜 두면 10분마다 특보를 다시 확인해 해제·변경을 신호등으로 알려 드립니다.`;
  }
  a.push({ kind: "headline", text: lead });
  a.push({ kind: "facts", items: facts });

  // 특보 경과 (주의보 → 경보 격상 등)
  if (hist.length > 1) {
    const items = hist.map((x, i) => {
      const prev = hist[i - 1];
      const gap = prev ? Math.round((toDate(x.issuedAt).getTime() - toDate(prev.issuedAt).getTime()) / 6e4) : 0;
      return { at: x.issuedAt.replace("T", " ").slice(5, 16), label: `${x.type}${x.level}`, kind: "특보", text: `${x.area}${x.status ? ` (${x.status})` : ""}${prev ? ` · 직전 특보 ${gapText(gap)} 뒤` : ""}` };
    });
    a.push({ kind: "timeline", title: "이번 특보 경과", items });
  }

  // 같은 특보가 났던 과거 사건
  const past = pastSameAdvisory(region, adv, k);
  if (past.length) {
    const top = past[0];
    const rec = pr ? regionRecord(top, pr) : top.regions[0];
    const exact = top.weather.advisories.some((x) => x.type === adv.type && x.level === adv.level);
    a.push({
      kind: "notice",
      tone: "warn",
      text: `${exact ? `같은 ${name}가 났던` : k === "coast" || k === "wind" ? "바다·바람 피해가 컸던" : k === "landslide" ? "산사태 피해가 있었던" : "비슷한 비가 왔던"} ${a.e(eventRef(top, pr ?? undefined))} 때는 ${first(rec?.summary ?? top.summary)}${citeEvent(a, top)}.`,
    });
    a.push({
      kind: "results",
      groups: [{ key: `advpast:${adv.type}`, label: exact ? `${name} 과거 사건` : "관련 과거 사건", total: past.length, items: past.map((e) => eventRef(e, pr ?? undefined)) }],
    });
  }
  a.followUps = QQ(adv);
}

/* ---------------- ② 해안(풍랑·폭풍해일) : 위험지역 · 과거 사례 · 대응 ---------------- */
export function composeCoast(a: Answer, ctx: QueryContext, adv: RefAdvisory, part: "risk" | "case" | "act", q = "") {
  const region = advRegion(adv, ctx);
  const pr = region === "national" ? "busan" : region;
  const m = MANUAL_BY_REGION[pr];
  const name = advName(adv);
  const kma = citeKMA(a, ctx.mode === "live", `${adv.area} ${name} ${adv.issuedAt}`);
  const fa = fieldActs(m, "coast");
  if (part === "risk") {
    a.apis.add("T3Q-04 위험·취약지역 조회");
    const list = RISKS.filter((o) => isCoastal(o) && o.region.sido.includes(rname(pr).slice(0, 2)));
    const ranked = rankRisks(list, pr, {}).map((r) => r.o);
    a.title = `${adv.area} ${name} — 먼저 볼 해안 위험지역`;
    if (!ranked.length) {
      a.push({ kind: "headline", text: `${adv.area}에 **${name}**가 발효 중입니다${kma}. ${rname(pr)}에는 해일·해안 위험으로 지정된 관리대상이 조회되지 않습니다. 해안도로·갯바위·방파제 접근 통제를 먼저 확인하세요.` });
      a.followUps = QQ(adv).slice(1);
      return;
    }
    const top = ranked.slice(0, 3);
    const hh = (o: RiskObject) => (o.reason.match(/세대\s*([\d,]+)/)?.[1] ?? "");
    a.push({
      kind: "headline",
      text: `${adv.area}에 **${name}**가 ${mdhm(adv.issuedAt)}부터 발효 중입니다${kma}. 바람·너울로 바닷물이 넘칠 수 있는 해일·해안 위험지구 **${list.length}곳** 중 먼저 볼 곳은 ${top.map((o) => `${a.e(riskRef(o))}${citeRisk(a, o)}`).join(", ")}입니다.${hh(top[0]) ? ` ${displayName(top[0]).replace(/\s*\(.*\)$/, "")}은 배후에 ${hh(top[0])}세대가 있습니다.` : ""}`,
    });
    a.push({
      kind: "facts",
      items: [
        { label: "해일·해안 위험지구", value: String(list.length), unit: "곳", note: [...new Set(list.map((o) => o.region.sigungu))].slice(0, 4).join("·") },
        { label: "위험시설", value: [...new Set(list.map((o) => o.reason.match(/위험시설:\s*([^;(]+)/)?.[1]?.trim()).filter(Boolean))].slice(0, 2).join("·") || "해안호안·방파벽" },
        ...(fa[0] ? [{ label: "매뉴얼 기준", value: fa[0].target.replace(/\s*\(.*\)/, ""), note: `p.${fa[0].page}` }] : []),
      ],
    });
    if (fa.length) {
      a.push({
        kind: "actions",
        title: "무엇을 해야 하나 — 행동매뉴얼 현장조치",
        stage: { name: `${name} 발효`, trigger: fa[0].criteria.slice(0, 120) },
        manualId: `${m.id}:FA`,
        items: fa.flatMap((f) => f.actions.map((l) => ({ l, f }))).slice(0, 6).map(({ l, f }, i) => ({ seq: i + 1, task: clean(l), due: "즉시", cite: [a.cid(citeManual(a, m, f.page, f.criteria.slice(0, 140)))] })),
      });
    }
    a.push({ kind: "results", groups: [{ key: `coast:${pr}`, label: "해일·해안 위험지구", total: list.length, items: ranked.slice(0, 20).map((o) => riskRef(o)) }] });
    a.focus = top.map((o) => o.id);
    a.followUps = [`${displayName(top[0]).replace(/\s*\(.*\)$/, "")}은 왜 위험한가요?`, ...QQ(adv).slice(1)];
    return;
  }
  if (part === "case") {
    a.apis.add("T3Q-06 유사사례 조회");
    const past = pastSameAdvisory(pr, adv, "coast");
    a.title = `${adv.area} ${name} — 과거 바다·태풍 피해 사례`;
    if (!past.length) {
      a.push({ kind: "headline", text: `${rname(pr)}에서 ${name}와 연결된 과거 피해 사건이 조회되지 않습니다.` });
      a.followUps = QQ(adv);
      return;
    }
    const lines = past.slice(0, 3).map((e) => {
      const rec = regionRecord(e, pr);
      const led = rec?.damages.publicFacilityLedger;
      return `${a.e(eventRef(e, pr))}${citeEvent(a, e)} — ${first(rec?.summary ?? e.summary, 110)}${led && !/억원/.test(first(rec?.summary ?? e.summary, 110)) ? ` (공공시설 피해 ${fmtKrwThousand(led.damage_krw_thousand)})` : ""}`;
    });
    a.push({ kind: "headline", text: `${adv.area}의 ${name}와 같이 바다·바람이 원인이 된 과거 피해는 ${past.length}건이 조회됩니다. 가장 컸던 ${lines[0]}.` });
    if (lines.length > 1) a.push({ kind: "narrative", paragraphs: lines.slice(1) });
    a.push({ kind: "results", groups: [{ key: "coastpast", label: "관련 과거 사건", total: past.length, items: past.map((e) => eventRef(e, pr)) }] });
    a.focusRef = eventRef(past[0], pr);
    a.followUps = ["그때 피해가 난 곳은 지금 어떻게 관리되나요?", "그때 어떤 통제·대피 조치를 했나요?", QQ(adv)[0]];
    return;
  }
  // act
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  a.title = `${adv.area} ${name} — 행동매뉴얼 대응절차`;
  const s = situation(ctx, pr);
  a.push({
    kind: "headline",
    text: `${adv.area}에 **${name}**가 발효 중입니다${kma}. ${fa.length ? `매뉴얼은 '${fa[0].target.replace(/\s*\(.*\)/, "")}'에 "${fa[0].criteria}" 기준으로 책임자를 배치하고 월파 안전대책을 하도록 정하고 있습니다${citeManual(a, m, fa[0].page, fa[0].criteria)}.` : ""}${/대피/.test(q) ? (() => { const cl = RISKS.filter((o) => isCoastal(o) && o.region.sido.includes(rname(pr).slice(0, 2))); const hh = cl.reduce((n, o) => n + Number((o.reason.match(/세대\s*([\d,]+)/)?.[1] ?? "0").replace(/,/g, "")), 0); return ` 풍랑특보만으로 주민 대피 명령 대상은 아니며, 월파가 시작되면 해일·해안 위험지구 ${cl.length}곳 배후 **${hh.toLocaleString()}세대**가 우선 대피 검토 대상입니다.`; })() : ""} 풍랑특보는 매뉴얼의 비상근무 단계 기준(호우·태풍)이 아니므로${s.active ? `, 비상단계는 현재 발효 중인 ${s.advisoryText} 기준(${s.stage?.emergencyLevel.split(" — ")[0] ?? ""})을 따릅니다` : " 해안 현장조치 중심으로 대응합니다"}.`,
  });
  a.push({
    kind: "actions",
    title: "지금 할 일 — 해안·항포구",
    stage: { name: `${name} 발효`, trigger: fa[0]?.criteria.slice(0, 120) },
    manualId: `${m.id}:FA`,
    items: [
      ...fa.flatMap((f) => f.actions.map((l) => ({ task: clean(l), cite: [a.cid(citeManual(a, m, f.page, f.criteria.slice(0, 140)))] }))),
      { task: "어선·소형선박 피항·결박 상태 확인 (항포구 관리 부서·해경과 공유)", cite: [] as string[] },
      { task: "해수욕장·갯바위·방파제·해안 산책로 출입 통제와 안내방송", cite: [] as string[] },
      { task: "해안 저지대 배수시설 점검 — 만조와 호우가 겹치면 역류 위험", cite: [] as string[] },
    ].slice(0, 6).map((x, i) => ({ seq: i + 1, task: x.task, due: "즉시", cite: x.cite.length ? x.cite : undefined })),
  });
  a.followUps = [QQ(adv)[0], QQ(adv)[1], "재난문자 문안을 만들어 주세요"];
}

export const advisoryFollowUps = QQ;

/* ---------------- ③ 산사태 : 과거 사례 · 대응절차 ---------------- */
export function composeLandslide(a: Answer, ctx: QueryContext, adv: RefAdvisory, part: "case" | "act") {
  const region = advRegion(adv, ctx);
  const pr = region === "national" ? "inje" : region;
  const m = MANUAL_BY_REGION[pr];
  const name = advName(adv);
  const kma = citeKMA(a, ctx.mode === "live", `${adv.area} ${name} ${adv.issuedAt}`);
  const s = situation(ctx, pr);
  const slopes = rankRisks(RISKS.filter((o) => /산사태|급경사|붕괴/.test(o.category) && o.region.sigungu.includes(rshort(pr)) || (pr === "busan" && /산사태|급경사|붕괴/.test(o.category) && o.region.sido.includes("부산"))), pr, { active: s.active && s.mode === "scenario" }).map((r) => r.o);
  if (part === "case") {
    a.apis.add("T3Q-06 유사사례 조회");
    const past = pastSameAdvisory(pr, adv, "landslide");
    a.title = `${adv.area} ${name} — 과거 산사태 피해 사례`;
    if (!past.length) {
      a.push({ kind: "headline", text: `${rname(pr)}에서 산사태 피해가 기록된 과거 사건이 조회되지 않습니다${kma}.` });
      a.followUps = QQ(adv);
      return;
    }
    const lines = past.slice(0, 3).map((e) => {
      const rec = regionRecord(e, pr);
      const n = rec?.damages.publicFacilityLedger?.byFacilityType?.["산사태"];
      return `${a.e(eventRef(e, pr))}${citeEvent(a, e)} — ${first(rec?.summary ?? e.summary, 110)}${n ? ` — 이 중 산사태 피해시설 ${n}건` : ""}`;
    });
    a.push({ kind: "headline", text: `${adv.area}에 **${name}**가 발령된 지금과 같이 산사태·토사 피해가 있었던 과거 사건은 ${past.length}건입니다${kma}. 가장 컸던 ${lines[0]}.` });
    if (lines.length > 1) a.push({ kind: "narrative", paragraphs: lines.slice(1) });
    a.push({ kind: "results", groups: [{ key: "slidepast", label: "산사태 피해 과거 사건", total: past.length, items: past.map((e) => eventRef(e, pr)) }, ...(slopes.length ? [{ key: "slides", label: "지금 먼저 볼 산사태·급경사지", total: slopes.length, items: slopes.slice(0, 10).map((o) => riskRef(o)) }] : [])] });
    a.focusRef = eventRef(past[0], pr);
    a.followUps = ["그때 피해가 난 곳은 지금 어떻게 관리되나요?", QQ(adv)[0], QQ(adv)[2]];
    return;
  }
  a.apis.add("T3Q-09 행동매뉴얼 대응절차");
  a.title = `${adv.area} ${name} — 행동매뉴얼 대응절차`;
  const fa = fieldActs(m, "landslide");
  const top = slopes.slice(0, 3);
  a.push({
    kind: "headline",
    text: `${adv.area}에 **${name}**가 ${mdhm(adv.issuedAt)}에 발령됐습니다${kma}. ${fa.length ? `매뉴얼은 '${fa[0].target.replace(/\s*\(.*\)/, "")}'에 대해 "${first(fa[0].criteria, 80)}" 때 아래 조치를 하도록 정하고 있습니다${citeManual(a, m, fa[0].page, fa[0].criteria.slice(0, 140))}.` : ""}${s.active ? ` 비상근무 단계는 함께 발효 중인 ${s.advisoryText} 기준(${s.stage?.emergencyLevel.split(" — ")[0] ?? ""})을 유지합니다.` : ""}${top.length ? ` 현장 확인은 ${top.map((o) => a.e(riskRef(o))).join(", ")}부터 하십시오.` : ""}`,
  });
  a.push({
    kind: "actions",
    title: "지금 할 일 — 산사태·급경사지",
    stage: { name: `${name} 발령`, trigger: fa[0]?.criteria.slice(0, 120) },
    manualId: `${m.id}:FA`,
    items: fa.flatMap((f) => f.actions.map((l) => ({ l, f }))).slice(0, 7).map(({ l, f }, i) => ({ seq: i + 1, task: `[${f.target.replace(/\s*\(.*\)/, "")}] ${clean(l)}`, due: "즉시", cite: [a.cid(citeManual(a, m, f.page, f.criteria.slice(0, 140)))] })),
  });
  if (slopes.length) a.push({ kind: "results", groups: [{ key: "slides", label: "먼저 볼 산사태·급경사지", total: slopes.length, items: slopes.slice(0, 20).map((o) => riskRef(o)) }] });
  a.focus = top.map((o) => o.id);
  a.followUps = [top[0] ? `${displayName(top[0]).replace(/\s*\(.*\)$/, "")}은 왜 위험한가요?` : QQ(adv)[0], QQ(adv)[1], "주민 대피가 필요할까요?"];
}
