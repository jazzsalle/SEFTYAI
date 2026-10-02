import "server-only";
import raw from "@data/seed/risk_areas.json";
import type { EntityRef, RegionId } from "../contract/agent";
import { REPORTS_119, SCENARIO } from "./events";

export interface RiskObject {
  id: string;
  category: string;
  name: string;
  region: { sido: string; sigungu: string; emd?: string; code?: string };
  lon: number;
  lat: number;
  coordApprox?: boolean;
  grade: string | null;
  risk_level: "high" | "medium" | "low" | string;
  reason: string;
  trigger: { text: string; derived: boolean; basis?: string[]; thresholds?: Record<string, number | string>; past_flood_dates?: string[] };
  plan: Record<string, unknown> | null;
  attrs: Record<string, unknown>;
  source: { dataset: string; file?: string; sheet?: string; row?: number };
  history?: { disaster?: string; date: string; damaged_facilities_in_emd?: number; parcels_flooded?: number; source?: string }[];
  tags?: string[];
  sample?: boolean;
}

export const RISKS = raw as unknown as RiskObject[];
export const RISK_BY_ID = new Map(RISKS.map((r) => [r.id, r]));

export const regionOfRisk = (r: RiskObject): RegionId =>
  r.region.sido.includes("부산") ? "busan" : r.region.sigungu.includes("영천") ? "yeongcheon" : r.region.sigungu.includes("인제") ? "inje" : "national";

export function risksIn(region: RegionId, sigungu?: string) {
  return RISKS.filter((r) => (region === "national" || regionOfRisk(r) === region) && (!sigungu || r.region.sigungu === sigungu));
}

/** 질문 키워드 → 위험 범주 */
export const CATEGORY_KEYWORDS: [string[], RegExp][] = [
  [["급경사지", "붕괴위험지역"], /급경사|비탈|사면|붕괴|낙석|옹벽|절개/],
  [["산사태취약지역"], /산사태|토석류/],
  [["지하차도"], /지하차도|언더패스|차도/],
  [["상습침수지역"], /상습\s*침수|침수.*(지역|구역|필지)|저지대/],
  [["홍수취약지구"], /홍수\s*취약|제방|범람/],
  [["풍수해개선지구"], /개선지구|위험지구|법정\s*위험|재해위험/],
  [["위험저수지"], /저수지|댐|제당/],
  [["야영장"], /야영|캠핑|계곡|물놀이/],
  [["소하천"], /소하천|세월교/],
  [["하천위험요소"], /하천\s*기본계획|하천.*위험요소|시설물 능력/],
  [["건축물지하공간"], /지하\s*(공간|주차장|층)|반지하|건축물/],
];
export function categoriesFromText(q: string): string[] {
  const out: string[] = [];
  for (const [cats, re] of CATEGORY_KEYWORDS) if (re.test(q)) out.push(...cats);
  return [...new Set(out)];
}

const LEVEL_W: Record<string, number> = { high: 3, medium: 2, low: 1 };
const GRADE_W = (g: string | null) => (!g ? 0 : /^A|D등급|^D$|^E|가/.test(g) ? 2 : /^B|^C|나/.test(g) ? 1 : 0);
const dist = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const dx = (a.lon - b.lon) * 88.8, dy = (a.lat - b.lat) * 111; // km (위도 36° 근사)
  return Math.sqrt(dx * dx + dy * dy);
};

/** 진행 중 사건의 119 신고 지점 */
export function activeReportPoints(region: RegionId) {
  const evIds = region === "national" ? new Set(Object.values(SCENARIO).map((s) => s.eventId)) : new Set([SCENARIO[region].eventId]);
  return REPORTS_119.filter((r) => evIds.has(r.eventId) && r.ext?.coord);
}

/** 위험 범주 ↔ 119 사고유형 관련성 */
const REL: Record<string, RegExp> = {
  급경사지: /토사|낙석|붕괴|산사태/, 붕괴위험지역: /토사|낙석|붕괴|산사태/, 산사태취약지역: /토사|낙석|산사태|수목/,
  지하차도: /지하차도|차량|도로/, 상습침수지역: /침수|고립|역류/, 홍수취약지구: /하천|범람|제방|둔치/, 풍수해개선지구: /침수|하천|범람|토사|고립/,
  위험저수지: /저수지|제방|범람/, 야영장: /하천|계곡|고립|야영/, 소하천: /하천|범람|고립|세월교/, 하천위험요소: /하천|범람|제방/, 건축물지하공간: /지하|침수|역류/,
};
export const relevant119 = (cat: string, accidentType: string) => (REL[cat] ? REL[cat].test(accidentType) : true);

/**
 * 우선순위 점수 — "지금 먼저 볼 곳"
 * 위험수준·등급 + 과거 동일 읍면동 피해 이력 + 진행 중 119 신고 근접(1km) + 실좌표 여부
 */
export function rankRisks(list: RiskObject[], region: RegionId, opts: { active?: boolean } = {}) {
  const pts = opts.active ? activeReportPoints(region).map((r) => ({ lon: r.ext.coord.lon, lat: r.ext.coord.lat, r })) : [];
  return list
    .map((o) => {
      const hist = (o.history ?? []).reduce((s, h) => s + (h.damaged_facilities_in_emd ?? h.parcels_flooded ?? 1), 0);
      const near = pts.filter((p) => dist(p, o) <= 1.0 && relevant119(o.category, p.r.ext.accidentType));
      const done = !!o.plan && /완료|해제/.test(String(o.plan["진행상태"] ?? o.plan["사업구분(진행상태)"] ?? ""));
      const score = (LEVEL_W[o.risk_level] ?? 1) * 10 + GRADE_W(o.grade) * 6 + Math.min(hist, 30) * 0.5 + near.length * 12 + (o.coordApprox ? 0 : 2) + (o.sample ? -20 : 0) + (done ? -9 : 0);
      return { o, score, near: near.map((n) => n.r), hist };
    })
    .sort((a, b) => b.score - a.score);
}

export function displayName(o: RiskObject) {
  if (o.category === "산사태취약지역") {
    const loc = String(o.attrs["위치"] ?? "").replace(/^(경상북도|강원특별자치도|강원도|부산광역시)\s*(\S+[시군구])?\s*/, "").split(" ").slice(0, 3).join(" ");
    const kind = String(o.attrs["종류"] ?? "").match(/\((.+)\)/)?.[1] ?? "산사태";
    return `${loc || o.region.emd || ""} 산사태취약지역(${kind}${o.grade ? `·${o.grade}등급` : ""})`;
  }
  return o.name
    .replace(/\s*\(자연재해위험개선지구·([^)]*)\)/, " ($1지구)")
    .replace(/\s*\(재해위험저수지\)/, " 저수지")
    .replace(/저수지 저수지/, "저수지")
    .replace(/\s*\((None|nan|-)\)/, "")
    .replace(/^\[샘플\]\s*/, "(샘플) ");
}

export function riskRef(o: RiskObject, extra?: { near?: number }): EntityRef {
  const lvl = o.risk_level === "high" ? "high" : o.risk_level === "low" ? "low" : "mid";
  const shortReason = o.reason.split(/ — |;|\. /)[0].slice(0, 70);
  return {
    type: "risk",
    id: o.id,
    name: displayName(o),
    category: o.category,
    lon: o.lon,
    lat: o.lat,
    summary: `${o.region.sigungu} ${o.region.emd ?? ""} · ${shortReason}`,
    metric: extra?.near ? `119 신고 ${extra.near}건 인근` : o.grade ? (o.grade.length <= 2 ? `${o.grade}등급` : o.grade) : undefined,
    level: lvl,
  };
}

/** 객체 주변(반경 km) 위험객체 */
export function nearbyRisks(p: { lon: number; lat: number }, km = 1, exclude?: string) {
  return RISKS.filter((r) => r.id !== exclude && dist(p, r) <= km).sort((a, b) => dist(p, a) - dist(p, b));
}
export { dist };
