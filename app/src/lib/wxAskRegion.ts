/**
 * 「이 특보로 질의」의 기준지역 — 그 특보가 걸린 행정구역 (개발 서버 kjw 998facb WeatherRepository.AskRegionsAsync 를 옮김).
 * 특보는 기상청 구역 글(「강원도(인제평지, 인제산지)」)로 오고, 질의 조건은 행정구역(브이월드 이름·코드)으로 간다.
 *  · 한 곳이면   그 시·군·구 (강원도(인제평지, 인제산지) → 강원특별자치도 인제군) — 좁을수록 답이 또렷하다
 *  · 여럿이면   아우르는 시·도 (경상남도(김해, 양산) → 경상남도). 괄호 목록이 없으면(시·도 전체) 그 시·도
 *  · 「…제외」 목록 · 읽을 수 없는 구역이 섞이면 시·도 (고르지 않는다)
 *  · 바다 구역 · 시·도를 모르는 구역이면 null — 걸리는 행정구역이 없다. 지금 기준지역을 그대로 쓴다
 * 세션의 기준지역은 바꾸지 않는다 — 그 질문 하나에만 싣는다(lib/session SubmitArgs.base).
 * 시·도·시·군·구 목록은 서버가 브이월드에서 받아 넘긴다(lib/server/vworldAdmin) — 이 파일은 순수 함수라 하네스가 그대로 쓴다.
 */
import type { AreaPick, BaseRegion } from "./baseRegion";
import { ISLANDS, isSeaArea, kmaSidoNames, parseArea, sggShort } from "./wxMatch";

/** 기상청 구역 이름(괄호 앞) → 브이월드 시·도. 첫 이름이 같은 시·도를 먼저(통합 시·도가 옛 이름을 함께 쓰는 경우) */
export function sidoOfKma(head: string, sidos: AreaPick[]): AreaPick | null {
  const hits = sidos.filter((s) => kmaSidoNames(s.name).includes(head));
  return hits.find((s) => kmaSidoNames(s.name)[0] === head) ?? hits[0] ?? null;
}

/** 괄호 목록 한 구역(「인제평지」 「김천북부」 「신안(흑산면제외)」 「인천영종」) → 그 시·도의 시·군·구. 하나로 정해지지 않으면 null */
function sigunguOfItem(item: string, sidoNames: string[], sigungus: AreaPick[]): AreaPick | null {
  const bare0 = item.replace(/\(.*$/, "").replace(/\s+/g, "");
  const isl = ISLANDS[bare0];
  if (isl) return pickOne(sigungus.filter((g) => sggShort(g.name) === isl.sgg));
  // 「인천영종」처럼 시·도 이름이 붙은 구역은 떼고 본다
  const prefix = sidoNames.filter((n) => bare0.length > n.length && bare0.startsWith(n)).sort((a, b) => b.length - a.length)[0];
  const bare = prefix ? bare0.slice(prefix.length) : bare0;
  return pickOne(sigungus.filter((g) => bare.startsWith(sggShort(g.name))));
}

/** 같은 시(「수원시 장안구」 「수원시 권선구」)로만 모이면 하나로 보지 않는다 — 구를 고를 수 없다 */
const pickOne = (xs: AreaPick[]) => (xs.length === 1 ? xs[0] : null);

/**
 * 특보 구역 글 → 질의 기준지역. sigungusOf(시·도 코드) = 그 시·도의 시·군·구 목록(받지 못했으면 null → 시·도까지만)
 */
export function resolveAskRegion(area: string, sidos: AreaPick[], sigungusOf: (sidoCode: string) => AreaPick[] | null): BaseRegion | null {
  if (!area.trim() || isSeaArea(area)) return null;
  const { head, items } = parseArea(area);
  // 시·도 이름이 붙지 않는 섬 구역(울릉도.독도 · 서해5도 …) — 속한 시·도의 그 시·군
  const isl = ISLANDS[head];
  if (isl) {
    const sido = sidoOfKma(isl.sido, sidos);
    if (!sido) return null;
    const g = pickOne((sigungusOf(sido.code) ?? []).filter((x) => sggShort(x.name) === isl.sgg));
    return g ? { sido, sigungu: g } : { sido };
  }
  const sido = sidoOfKma(head, sidos);
  if (!sido) return null;
  if (!items.length || /제외$/.test(items[items.length - 1])) return { sido };
  const sigungus = sigungusOf(sido.code);
  if (!sigungus?.length) return { sido };
  const names = kmaSidoNames(sido.name);
  const picks = items.map((it) => sigunguOfItem(it, names, sigungus));
  if (picks.some((p) => !p)) return { sido };
  const codes = new Set(picks.map((p) => p!.code));
  return codes.size === 1 ? { sido, sigungu: picks[0]! } : { sido };
}
