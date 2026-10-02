import "server-only";
import evRaw from "@data/seed/events.json";
import r119Raw from "@data/seed/reports_119.json";
import srRaw from "@data/seed/situation_reports.json";
import type { Advisory, EntityRef, RegionId } from "../contract/agent";

/* ---------- 타입 (seed 스키마 v1.0) ---------- */
export interface Hourly { t: string; mm: number }
export interface WeatherLocal {
  station?: string;
  maxHourlyRain_mm?: number | null;
  maxHourlyAt?: string;
  totalRain_mm?: number | null;
  since?: string;
  hourly?: Hourly[];
  hydro?: { station: string; level_m: number; stage: string }[];
  tide?: { highTideAt: string; note: string };
}
export interface FloodTrace { traceId: string; emd: string | null; disasterName: string; begin: string; end: string; district: string; cause: string; avgDepth_m: number; area_m2: number; centroid: { lat: number; lon: number } }
export interface PublicFloodItem { date: string; address: string; facilityType: string; damageCause: string; summary: string; damage_krw_thousand: number }
export interface LedgerFacility { facility: string; type: string; emd: string; location: string; damage_krw_thousand: number; recovery_krw_thousand: number; recoveryType: string }
export interface RegionRecord {
  regionRecordId: string;
  sido: string;
  sigungu: string;
  admCode: string;
  terrain?: string;
  period: { start: string; end: string | null };
  crisisLevel: string | null;
  weatherLocal: WeatherLocal | null;
  summary: string;
  damageTags: string[];
  damages: {
    publicFacilityLedger: null | { facilityCount: number; damage_krw_thousand: number; recovery_krw_thousand: number; byFacilityType?: Record<string, number>; bySigungu?: Record<string, number>; topFacilities?: LedgerFacility[]; ledgerDisasterNames?: string[] };
    publicFloodItems: null | { count: number; items: PublicFloodItem[] };
    privateFacility: null | { recordCount: number; byCategory?: Record<string, number>; housing?: { total: number; flooded: number; bySigungu?: Record<string, number> }; confirmedDamage_krw_thousand?: number };
    insurance: null | { house?: { claims: number; paid_krw: number; bySigungu?: Record<string, number> }; sme?: { claims: number; paid_krw: number } };
    human: null | { dead: number | null; missing: number | null; injured: number | null; source?: string };
  };
  recovery: { recovery_krw_thousand: number | null; damage_krw?: number | null };
  floodTraces: null | { count: number; totalArea_m2: number; maxDepth_m: number; districts: string[]; causes: Record<string, number>; records: FloodTrace[] };
  reports119: string[];
  situationReports: string[];
  actions: { time: string; action: string; source?: string }[];
  facts: { fact: string; source: string }[];
  note?: string | null;
}
export interface SimilarCase { eventId: string; title: string; score: number; confidence: string; breakdown: { factor: string; weight: number; score: number; basis: string }[] }
export interface DisasterEvent {
  eventId: string;
  aliasId: string;
  typeCode: string;
  typeName: string;
  startDate: string;
  endDate: string | null;
  status: string;
  title: string;
  summary: string;
  ndmsKey: null | { DSTR_YEAR: string; DSTR_TY_CD: string; DSTR_SN: number; DSTR_NM: string };
  weather: { advisories: { type: string; level: string; issuedAt: string; area: string; status?: string }[]; maxHourlyRain_mm: number | null; totalRain_mm: number | null; station: string | null; rainfallSource: string; byRegion?: Record<string, WeatherLocal>; asOf?: string };
  regions: RegionRecord[];
  synthetic?: boolean;
  training?: boolean;
  totals?: Record<string, number>;
  places?: string[];
  sources?: { key: string; path: string; kind: string }[];
  dataQuality?: Record<string, unknown>;
  similarCases?: Record<string, SimilarCase[]>;
}
export interface Report119 {
  reportId: string;
  eventId: string;
  regionRecordId: string;
  신고일시: string;
  신고지역명: string;
  긴급구조유형1명칭: string;
  원인명: string;
  재난규모: string;
  관제상황구분: string;
  ext: { accidentType: string; locationDetail: string; coord: { lat: number; lon: number }; rescueeCount: number; dispatchUnit: string; result: string; callSummary: string; groundedOn?: string };
  synthetic?: boolean;
  [k: string]: unknown;
}
export interface SituationReport {
  reportId: string;
  eventId: string;
  regionRecordId: string;
  reportKind: string;
  reportNo: string;
  title: string;
  submittedAt: string;
  occurredAt?: string;
  sender?: string;
  receiver?: string;
  location?: { address: string; lat?: number; lon?: number };
  overview: string;
  damage?: { human?: { dead: number; missing: number; injured: number }; other?: string };
  actions: { time: string | null; action: string }[];
  outlook?: string;
  synthetic: boolean;
  sourceType?: string;
  sourceFile?: string;
  message?: string;
  [k: string]: unknown;
}

export const EVENTS = (evRaw as unknown as { events: DisasterEvent[] }).events;
export const REPORTS_119 = (r119Raw as unknown as { reports: Report119[] }).reports;
export const SIT_REPORTS = (srRaw as unknown as { reports: SituationReport[] }).reports;
export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.eventId, e]));
export const R119_BY_ID = new Map(REPORTS_119.map((r) => [r.reportId, r]));
export const SR_BY_ID = new Map(SIT_REPORTS.map((r) => [r.reportId, r]));

export const ADM: Record<Exclude<RegionId, "national">, { code: string; key: string; label: string }> = {
  busan: { code: "26000", key: "BS", label: "부산광역시" },
  yeongcheon: { code: "47230", key: "YC", label: "영천시" },
  inje: { code: "51810", key: "IJ", label: "인제군" },
};
export const regionOfAdm = (code: string): RegionId | undefined =>
  (Object.keys(ADM) as (keyof typeof ADM)[]).find((k) => ADM[k].code === code || code.startsWith(ADM[k].code.slice(0, 2) === "26" ? "26" : ADM[k].code));

export function regionRecord(e: DisasterEvent, r: RegionId): RegionRecord | undefined {
  if (r === "national") return e.regions[0];
  return e.regions.find((x) => x.admCode === ADM[r].code || (r === "inje" && x.sigungu.includes("인제")) || (r === "yeongcheon" && x.sigungu.includes("영천")) || (r === "busan" && x.sido.includes("부산")));
}
export const eventsInRegion = (r: RegionId) => EVENTS.filter((e) => r === "national" || !!regionRecord(e, r));

/* ---------- 시나리오 (진행 중 시연 사건) ---------- */
export const SCENARIO: Record<Exclude<RegionId, "national">, { eventId: string; baseTime: string }> = {
  busan: { eventId: "1001-20261002-01", baseTime: "2026-10-03T09:00:00+09:00" },
  yeongcheon: { eventId: "1001-20261002-01", baseTime: "2026-10-03T09:00:00+09:00" },
  inje: { eventId: "1001-20261002-02", baseTime: "2026-10-03T09:00:00+09:00" },
};
export const SCENARIO_LABEL = "훈련 시나리오 · 10.2~3 호우 (가상)";

export function scenarioAdvisories(region: RegionId): Advisory[] {
  const regs = region === "national" ? (["busan", "yeongcheon", "inje"] as const) : [region];
  const out: Advisory[] = [];
  const seen = new Set<string>();
  for (const r of regs) {
    const ev = EVENT_BY_ID.get(SCENARIO[r].eventId);
    if (!ev) continue;
    for (const a of ev.weather.advisories) {
      const rid: RegionId | undefined = /부산/.test(a.area) ? "busan" : /영천/.test(a.area) ? "yeongcheon" : /인제/.test(a.area) ? "inje" : undefined;
      const id = `SCN-${a.type}${a.level}-${a.area}-${a.issuedAt}`;
      if (seen.has(id) || (rid && region !== "national" && rid !== region)) continue;
      seen.add(id);
      const replaced = /대치|해제/.test(a.status ?? "");
      out.push({
        id,
        type: a.type,
        level: (a.level === "경보" ? "경보" : a.level === "주의보" ? "주의보" : "예비특보") as Advisory["level"],
        area: a.area,
        regionId: rid ?? (/앞바다/.test(a.area) && a.area.includes("부산") ? "busan" : undefined),
        issuedAt: a.issuedAt.length <= 16 ? a.issuedAt + ":00+09:00" : a.issuedAt.replace(/(T\d\d:\d\d)\+/, "$1:00+"),
        status: replaced ? "변경" : "발효",
        text: `${a.area}에 ${a.type}${a.level} ${replaced ? "(" + a.status + ")" : "발효 중"}. 사건 ${ev.eventId} 기준 시연 데이터.`,
        isNew: a.level === "경보" && !replaced,
      });
    }
  }
  return out.sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0) || b.issuedAt.localeCompare(a.issuedAt));
}

export function scenarioWeather(region: Exclude<RegionId, "national">): WeatherLocal | null {
  const ev = EVENT_BY_ID.get(SCENARIO[region].eventId);
  if (!ev) return null;
  const rec = regionRecord(ev, region);
  return rec?.weatherLocal ?? ev.weather.byRegion?.[ADM[region].key] ?? null;
}

/* ---------- EntityRef 변환 ---------- */
const evRegionNames = (e: DisasterEvent) => e.regions.map((r) => (r.sigungu.includes("부산") ? "부산" : r.sigungu.replace(/시$|군$/, ""))).join("·");
export function eventRef(e: DisasterEvent, r?: RegionId): EntityRef {
  const rec = r ? regionRecord(e, r) : e.regions[0];
  const c = rec?.floodTraces?.records?.[0]?.centroid;
  return {
    type: "event",
    id: e.eventId,
    name: e.title.replace(/^\[시연\]\s*/, ""),
    category: "재난사건",
    summary: rec?.summary ?? e.summary,
    metric: e.status === "진행중" ? "진행중" : e.startDate.slice(0, 7).replace("-", "."),
    lon: c?.lon,
    lat: c?.lat,
    level: e.status === "진행중" ? "high" : "info",
  };
}
export function r119Ref(r: Report119): EntityRef {
  return {
    type: "report119",
    id: r.reportId,
    name: `${r.ext.locationDetail}`,
    category: "119신고",
    summary: `${r.synthetic ? "재구성(시연) · " : ""}${r.신고일시.slice(5, 16)} · ${r.ext.accidentType} · ${r.ext.callSummary}`,
    metric: r.ext.accidentType,
    lon: r.ext.coord?.lon,
    lat: r.ext.coord?.lat,
    level: r.ext.rescueeCount > 0 ? "high" : "mid",
  };
}
export { evRegionNames };

export const fmtKrwThousand = (v?: number | null) => {
  if (v == null) return "—";
  const won = v * 1000;
  if (won >= 1e8) return `${(won / 1e8).toFixed(won >= 1e10 ? 0 : 1)}억원`;
  return `${Math.round(won / 1e4).toLocaleString()}만원`;
};
export const fmtKrw = (won?: number | null) => (won == null ? "—" : won >= 1e8 ? `${(won / 1e8).toFixed(1)}억원` : `${Math.round(won / 1e4).toLocaleString()}만원`);
