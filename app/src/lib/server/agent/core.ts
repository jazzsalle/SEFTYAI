import "server-only";
import type { AnswerBlock, Citation, EntityRef, QueryContext, RegionId } from "../../contract/agent";
import { EVENTS, EVENT_BY_ID, R119_BY_ID, REPORTS_119, SCENARIO, regionRecord, scenarioWeather, type DisasterEvent, type RegionRecord, type Report119, type SituationReport, type WeatherLocal } from "../events";
import { MANUAL_BY_REGION, stageFor, type Manual, type ManualStage } from "../manual";
import type { RiskObject } from "../risk";
import { REGIONS } from "../../config";
import { SCENARIO_BY_ID } from "../scenarios";

/* ---------------- 응답 빌더 ---------------- */
export class Answer {
  blocks: AnswerBlock[] = [];
  ents = new Map<string, EntityRef>();
  cites: Citation[] = [];
  datasets = new Set<string>();
  apis = new Set<string>();
  followUps: string[] = [];
  focus: string[] = [];
  /** 이어서 질문하기 기준 객체 */
  focusRef?: EntityRef;
  title = "";
  status: "ok" | "partial" | "clarify" = "ok";

  /** 엔티티 등록 후 본문 토큰 반환 */
  e(ref: EntityRef) {
    this.ents.set(ref.id, { ...this.ents.get(ref.id), ...ref });
    return `{{e:${ref.id}}}`;
  }
  /** 근거 등록 (docId+page 중복 제거) 후 [[cN]] 토큰 반환 */
  c(c: Omit<Citation, "id">) {
    const ex = this.cites.find((x) => x.docId === c.docId && x.page === c.page && x.locator === c.locator);
    if (ex) return `[[${ex.id}]]`;
    const id = `c${this.cites.length + 1}`;
    this.cites.push({ ...c, id });
    if (c.dataset) this.datasets.add(c.dataset);
    return `[[${id}]]`;
  }
  cid(token: string) {
    return token.replace(/\[\[|\]\]/g, "");
  }
  push(b: AnswerBlock) {
    this.blocks.push(b);
  }
}

/* ---------------- 근거 생성기 ---------------- */
export const citeManual = (a: Answer, m: Manual, page: number | undefined, quote?: string) =>
  a.c({ docId: `MAN:${m.id}`, title: `${m.region.replace("강원특별자치도 ", "").replace("경상북도 ", "")} 풍수해 현장조치 행동매뉴얼`, kind: "매뉴얼", page, quote, dataset: "풍수해 현장조치 행동매뉴얼" });
export const citeRisk = (a: Answer, o: RiskObject) =>
  a.c({ docId: `RISK:${o.id}`, title: shortDataset(o.source.dataset), kind: o.plan ? "정비계획" : "데이터셋", locator: o.source.sheet ? `${o.source.sheet}${o.source.row ? ` ${o.source.row}행` : ""}` : undefined, dataset: starName(o.category) });
export const citeEvent = (a: Answer, e: DisasterEvent, what = "재해대장·피해 집계") =>
  a.c({ docId: `EV:${e.eventId}`, title: `${e.title.replace(/^\[시연\]\s*/, "")}`, kind: "재해대장", locator: `재난마스터 ${e.eventId} · ${what}`, dataset: e.synthetic ? undefined : "재해대장" });
export const cite119 = (a: Answer, r: Report119) =>
  a.c({ docId: `R119:${r.reportId}`, title: `119 신고 ${r.신고일시.slice(5, 16)}`, kind: "119신고", locator: r.ext.locationDetail, dataset: "소방 신고정보" });
export const citeSR = (a: Answer, s: SituationReport) =>
  a.c({ docId: `SR:${s.reportId}`, title: s.title, kind: "상황보고", locator: `${s.reportKind} ${s.reportNo}`, dataset: s.synthetic ? undefined : "NDMS 상황보고" });
export const citeKMA = (a: Answer, live: boolean, text: string) =>
  a.c({ docId: `KMA:${live ? "live" : "scenario"}`, title: live ? "기상청 기상특보 (실시간)" : "기상특보 (시연 사건)", kind: "기상특보", quote: text });

const STAR: Record<string, string> = {
  급경사지: "재해위험지구 사업현황", 붕괴위험지역: "재해위험지구 사업현황", 위험저수지: "재해위험지구 사업현황", 풍수해개선지구: "재해위험지구 사업현황",
  상습침수지역: "상습침수지역·피해데이터", 지하차도: "지하차도 현황", 야영장: "전국 캠핑장", 산사태취약지역: "산사태 취약정보", 홍수취약지구: "홍수취약지구",
  소하천: "소하천 전체 목록", 하천위험요소: "하천기본계획 위험요소", 건축물지하공간: "건축물 지하공간",
};
export const starName = (cat: string) => STAR[cat] ?? cat;
export const shortDataset = (s: string) => {
  const t = s.split(" + ")[0].replace(/^\(취합\)\s*/, "").replace(/^\(샘플\)\s*/, "").replace(/\s*\(.*$/, "").replace(/^★+\s*/, "").replace(/\.(geojson|xlsx|csv)$/, "").replace(/\s*>.*$/, "").trim();
  return t.length > 30 ? t.slice(0, 29) + "…" : t;
};

/* ---------------- 현재 상황 ---------------- */
export interface Situation {
  region: RegionId;
  rname: string;
  mode: "scenario" | "live";
  active: boolean;
  level: "경보" | "주의보" | "예비특보" | null;
  advisoryText: string;
  issuedAt?: string;
  event: DisasterEvent | null;
  rec: RegionRecord | null;
  wx: WeatherLocal | null;
  rain1hMax: number | null;
  rainTotal: number | null;
  peakAt?: string;
  reports: Report119[];
  manual: Manual | null;
  stage: ManualStage | null;
  baseTime: string;
}

export const rname = (r: RegionId) => REGIONS[r].name;
export const rshort = (r: RegionId) => REGIONS[r].short;

export function situation(ctx: QueryContext, regionOverride?: RegionId): Situation {
  const region = regionOverride ?? ctx.region;
  const pr = region === "national" ? null : region;
  const preset = ctx.scenarioId ? SCENARIO_BY_ID.get(ctx.scenarioId) : undefined;
  const scenario = ctx.mode === "scenario" && (!preset || preset.useEvent);
  const event = scenario && pr ? EVENT_BY_ID.get(SCENARIO[pr].eventId) ?? null : null;
  const rec = event && pr ? regionRecord(event, pr) ?? null : null;
  const wx = scenario && pr ? scenarioWeather(pr) : null;
  let level: Situation["level"] = null;
  let advisoryText = "";
  let issuedAt: string | undefined;
  if (scenario && event && pr) {
    const advs = event.weather.advisories.filter((a) => new RegExp(rshort(pr)).test(a.area) && !/대치|해제/.test(a.status ?? "") && a.type === "호우");
    const top = advs.find((a) => a.level === "경보") ?? advs[0];
    if (top) {
      level = top.level as Situation["level"];
      advisoryText = `${top.type}${top.level}`;
      issuedAt = top.issuedAt;
    }
  }
  if (preset) {
    level = preset.advisory ? (preset.advisory.level as Situation["level"]) : null;
    advisoryText = preset.advisory ? `${preset.advisory.type}${preset.advisory.level}` : "";
    issuedAt = issuedAt ?? ctx.baseTime;
  } else if (!(scenario && event && pr) && ctx.advisory && (region === "national" || !ctx.advisory.area || new RegExp(rshort(region)).test(ctx.advisory.area))) {
    level = ctx.advisory.level as Situation["level"];
    advisoryText = `${ctx.advisory.type}${ctx.advisory.level}`;
    issuedAt = ctx.advisory.issuedAt;
  }
  const hourly = wx?.hourly ?? [];
  const peak = hourly.reduce<{ t: string; mm: number } | null>((p, h) => (!p || h.mm > p.mm ? h : p), null);
  const rain1hMax = ctx.hydro?.rain1h ?? wx?.maxHourlyRain_mm ?? null;
  const rainTotal = ctx.hydro?.rainTotal ?? wx?.totalRain_mm ?? null;
  const reports = rec ? rec.reports119.map((id) => R119_BY_ID.get(id)).filter((r): r is Report119 => !!r) : [];
  const manual = pr ? MANUAL_BY_REGION[pr] : null;
  const stage = manual ? stageFor(manual, level === "경보" ? "경보" : level === "주의보" ? "주의보" : level === "예비특보" ? "예비특보" : null) : null;
  return {
    region,
    rname: rname(region),
    mode: ctx.mode,
    active: !!level,
    level,
    advisoryText,
    issuedAt,
    event,
    rec,
    wx,
    rain1hMax,
    rainTotal,
    peakAt: peak ? peak.t : undefined,
    reports: reports.length ? reports : scenario && pr ? REPORTS_119.filter((r) => r.eventId === SCENARIO[pr].eventId && r.regionRecordId === rec?.regionRecordId) : [],
    manual,
    stage,
    baseTime: ctx.baseTime,
  };
}

/** 지역 최대 피해 과거 사건의 시간최대 강우 (T3Q 기상결합) */
function worstPast(region: Exclude<RegionId, "national">) {
  let best: { mm: number; label: string; eventId: string; dmg: number } | null = null;
  for (const e of EVENTS) {
    if (e.status === "진행중" || e.training) continue;
    const rec = regionRecord(e, region);
    const mm = rec?.weatherLocal?.maxHourlyRain_mm;
    if (!rec || mm == null) continue;
    const dmg = (rec.damages.publicFacilityLedger?.damage_krw_thousand ?? 0) + (rec.damages.privateFacility?.housing?.flooded ?? 0) * 3e4;
    if (!best || dmg > best.dmg) best = { mm, label: `${e.startDate.slice(0, 4)}.${Number(e.startDate.slice(5, 7))} ${e.title.replace(/^\d{4}년\s*/, "").replace(/\(.*\)/, "").trim().slice(0, 12)} 피해`, eventId: e.eventId, dmg };
  }
  return best;
}

/** 지역별 강우 임계치 (매뉴얼 원문 + 과거 사건) */
export function rainThresholds(region: RegionId): { mm: number; label: string; basis: "1h" | "total"; page?: number; eventId?: string }[] {
  const wp = region !== "national" && region !== "busan" ? worstPast(region) : null;
  const past = wp ? [{ mm: wp.mm, label: wp.label, basis: "1h" as const, eventId: wp.eventId }] : [];
  switch (region) {
    case "busan":
      return [
        { mm: 30, label: "온천천 하상도로 전면통제(매뉴얼)", basis: "1h", page: 119 },
        { mm: 81.6, label: "2020.7.23 초량지하차도 침수", basis: "1h", eventId: "1001-20200723-01" },
      ];
    case "yeongcheon":
      return [
        { mm: 30, label: "산사태·토석류 위험 급증(일반)", basis: "1h" },
        ...past,
        { mm: 100, label: "영천지하차도 통제 시우량(매뉴얼)", basis: "1h", page: 289 },
      ];
    case "inje":
      return [
        { mm: 20, label: "계곡 야영객 대피 기준(매뉴얼)", basis: "1h", page: 58 },
        { mm: 30, label: "산사태·토석류 위험 급증(일반)", basis: "1h" },
        ...past,
      ];
    default:
      return [
        { mm: 30, label: "하상도로·계곡 통제 수준", basis: "1h" },
        { mm: 81.6, label: "2020.7.23 부산 초량 침수", basis: "1h", eventId: "1001-20200723-01" },
      ];
  }
}

export const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
export const mdhm = (iso?: string) => (iso ? `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}. ${iso.slice(11, 16)}` : "");
export const ymd = (iso?: string | null) => (iso ? `${iso.slice(0, 4)}.${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}.` : "");
export const hourlySeries = (wx: WeatherLocal | null) => (wx?.hourly ?? []).map((h) => ({ t: h.t.slice(11, 13) + "시", mm: h.mm }));
