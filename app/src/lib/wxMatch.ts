/**
 * 기상특보 구역 ↔ 기준지역 (R32) — 화면(특보 줄·AI 모드·특보로 질문·답을 받은 뒤 특보)과 서버(재사용 기준 D5)가 함께 쓰는 한 규칙.
 * 기상청 특보 현황의 구역 글(Advisory.area — 「부산」 「경상남도(김해, 양산)」 「강원도(인제평지, 인제산지)」
 * 「전라남도(신안(흑산면제외), 흑산도.홍도)」 「제주도(추자도 제외)」 「제주도남쪽바깥먼바다」 …)이 기준지역을 덮는지만 본다.
 * 기준지역 이름은 브이월드 행정구역 이름 그대로(시·도 「경상북도」, 시·군·구 「영천시」 「수원시 장안구」).
 *
 *  · 전국 → 모든 특보
 *  · 시·도 → 구역의 시·도(괄호 앞 이름)가 그 시·도의 기상청 이름인 특보(부산광역시→부산, 경상북도→경상북도·경북, 강원특별자치도→강원도,
 *    전북특별자치도→전북자치도·전라북도, 제주특별자치도→제주도, 전남광주통합특별시→광주·전라남도 …). 시·도 이름이 붙지 않는 섬 구역
 *    (울릉도.독도·서해5도·흑산도.홍도·거문도.초도)은 속한 시·도로, 바다 구역(…앞바다·…먼바다·…해상)은 이름(괄호 안 구역 포함)이
 *    그 시·도 기상청 이름으로 시작할 때만(부산앞바다·경북북부앞바다·제주도남쪽바깥먼바다)
 *  · 시·군·구(읍·면·동이면 그 시·군·구) → 그 시·도 특보 가운데 괄호 목록이 없거나(시·도 전체), 목록에 시·군·구 짧은 이름
 *    (영천시→영천, 인제군→인제, 수원시 장안구→수원)으로 시작하는 구역이 있는 것(목록의 「인천영종」처럼 시·도 이름이 붙은 구역은 떼고 본다).
 *    목록 끝이 「…제외」면 목록 전체를 뺀 특보 — 「경상북도(영덕, 포항, 울진평지, 경주중북부, 경주동부, 경주남부 제외)」 = 경상북도에서
 *    그 여섯 구역을 뺀 곳(같은 날 예전 특보 「경상북도(청도, 고령, …, 경주서부)」의 나머지). 그 시·군·구 전체가 목록에 있을 때만 덮지 않고,
 *    일부만 뺀 곳(경주남부·울진평지·군산옥도면(어청도제외))이면 덮는다. 울릉군은 기상청이 시·도와 따로 쓰는 섬 구역 「울릉도.독도」만
 *    (대구청 통보문 「o 강풍주의보 : 울릉도.독도」 — 경상북도 특보는 덮지 않음). 광역시·특별시의 구·군은 그 시 전체 특보와 그 시 바다
 *    구역(부산앞바다)도. 도의 시·군은 시·군 이름으로 시작하는 바다 구역(거제시동부앞바다)만
 */

/** 특보를 맞출 기준지역 — null 이면 전국 */
export interface WxTarget {
  /** 시·도 이름(브이월드 그대로) */
  sido: string;
  /** 시·군·구 이름(브이월드 그대로). 없으면 시·도 전체 */
  sigungu?: string | null;
}

/** 시·도(브이월드 이름) → 기상청 특보 구역에 쓰는 이름 */
const KMA_SIDO: Record<string, string[]> = {
  서울특별시: ["서울"],
  부산광역시: ["부산"],
  대구광역시: ["대구"],
  인천광역시: ["인천"],
  광주광역시: ["광주"],
  대전광역시: ["대전"],
  울산광역시: ["울산"],
  세종특별자치시: ["세종"],
  경기도: ["경기도", "경기"],
  강원특별자치도: ["강원도", "강원", "강원특별자치도"],
  강원도: ["강원도", "강원"],
  충청북도: ["충청북도", "충북"],
  충청남도: ["충청남도", "충남"],
  전북특별자치도: ["전북자치도", "전라북도", "전북", "전북특별자치도"],
  전라북도: ["전라북도", "전북", "전북자치도"],
  전라남도: ["전라남도", "전남"],
  전남광주통합특별시: ["광주", "전라남도", "전남"],
  경상북도: ["경상북도", "경북"],
  경상남도: ["경상남도", "경남"],
  제주특별자치도: ["제주도", "제주", "제주특별자치도"],
};

/** 통합 시·도 — 구(옛 광역시의 자치구)와 시·군(옛 도)이 쓰는 기상청 이름이 다르다 */
const MERGED: Record<string, { gu: string[]; rest: string[] }> = {
  전남광주통합특별시: { gu: ["광주"], rest: ["전라남도", "전남"] },
};

/**
 * 시·도 이름 없이 나오는 섬 특보 구역 → 속한 시·도(기상청 이름)·시·군 짧은 이름.
 * whole = 그 시·군 전체가 이 구역 하나이고 기상청이 시·도 특보와 따로 쓴다(울릉군 — 경상북도 특보·「…제외」 목록에 들지 않는다)
 */
const ISLANDS: Record<string, { sido: string; sgg: string; whole?: boolean }> = {
  "울릉도.독도": { sido: "경상북도", sgg: "울릉", whole: true },
  서해5도: { sido: "인천", sgg: "옹진" },
  "흑산도.홍도": { sido: "전라남도", sgg: "신안" },
  "거문도.초도": { sido: "전라남도", sgg: "여수" },
};

const isMetro = (sido: string) => /광역시$/.test(sido) || sido === "서울특별시" || sido === "세종특별자치시";
const isSea = (zone: string) => /(바다|해상)$/.test(zone);
const isExcept = (item: string) => /제외$/.test(item);
const noSpace = (s: string) => s.replace(/\s+/g, "");

/** 괄호 깊이 0 의 구분자로 나눈다 — 「전라남도(신안(흑산면제외), 흑산도.홍도), 제주도(…)」 → 2개 */
export function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 구역 하나 → 괄호 앞 이름 + 괄호 안 목록(괄호 깊이 0 의 쉼표로). 빈칸은 뺀다(특보 id 의 구역 글은 빈칸이 없다) */
export function parseArea(area: string): { head: string; items: string[] } {
  const s = area.trim();
  const i = s.indexOf("(");
  if (i < 0) return { head: noSpace(s), items: [] };
  const j = s.lastIndexOf(")");
  return { head: noSpace(s.slice(0, i)), items: splitTop(j > i ? s.slice(i + 1, j) : s.slice(i + 1)).map(noSpace) };
}

/** 시·군·구 짧은 이름 — 첫 낱말 끝의 시·군·구를 뗀다(영천시→영천, 인제군→인제, 수원시 장안구→수원). 한 글자가 되면(중구) 떼지 않는다 */
export function sggShort(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const s = first.replace(/(시|군|구)$/, "");
  return s.length >= 2 ? s : first;
}

/** 기준지역 시·도의 기상청 이름 — 통합 시·도는 시·군·구가 구면 옛 광역시, 시·군이면 옛 도 이름만 */
export function kmaSidoNames(sido: string, sigungu?: string | null): string[] {
  const m = MERGED[sido];
  if (m && sigungu) return /구$/.test(sigungu.trim().split(/\s+/)[0] ?? "") ? m.gu : m.rest;
  const known = KMA_SIDO[sido];
  if (known) return known;
  const short = sido.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  return [...new Set([sido, short].filter((x) => x.length >= 2))];
}

/** 괄호 목록이 그 시·군·구를 덮는가 */
function listCovers(items: string[], sigungu: string, sidoNames: string[]): boolean {
  const short = sggShort(sigungu);
  // 목록 끝이 「…제외」 — 시·도 전체에서 목록의 구역을 모두 뺀 특보(「경상북도(영덕, 포항, …, 경주남부 제외)」)
  const except = items.length > 0 && isExcept(items[items.length - 1]);
  // 울릉군 — 기상청이 시·도와 따로 쓰는 섬 구역(울릉도.독도)이 시·군 전체. 시·도 전체·「…제외」 특보는 덮지 않고, 포함 목록에 그 구역이 있을 때만
  if (Object.values(ISLANDS).some((i) => i.whole && i.sgg === short && sidoNames.includes(i.sido)))
    return !except && items.some((it) => ISLANDS[it.replace(/\(.*$/, "")]?.sgg === short);
  if (!items.length) return true; // 시·도 전체 특보
  const full = noSpace(sigungu.trim().split(/\s+/)[0] ?? "");
  // 「…제외」 목록 — 그 시·군·구 전체를 뺀 것이 아니면 덮는다(경주남부·군산옥도면(어청도제외)처럼 일부만 뺐으면 나머지가 특보 구역)
  if (except) return !items.some((it) => [short, full].includes(it.replace(/제외$/, "")));
  const inc = items.filter((it) => !isExcept(it));
  return inc.some((it) => {
    const isl = ISLANDS[it.replace(/\(.*$/, "")];
    if (isl) return isl.sgg === short;
    const bare = sidoNames.filter((n) => it.length > n.length && it.startsWith(n)).map((n) => it.slice(n.length));
    return [it, ...bare].some((x) => x.startsWith(short));
  });
}

/** 특보 구역(Advisory.area)이 기준지역을 덮는가 — 기준지역이 null(전국)이면 언제나 그렇다 */
export function wxCovers(area: string, target: WxTarget | null): boolean {
  if (!target) return true;
  const sgg = target.sigungu?.trim() || null;
  const names = kmaSidoNames(target.sido, sgg);
  const { head, items } = parseArea(area);
  // 육상 — 괄호 앞 이름이 그 시·도
  if (names.includes(head)) return !sgg || listCovers(items, sgg, names);
  // 시·도 이름이 붙지 않는 섬 구역
  const isl = ISLANDS[head];
  if (isl) return names.includes(isl.sido) && (!sgg || sggShort(sgg) === isl.sgg);
  // 바다 구역 — 이름(괄호 안 구역 포함, 「인천·경기북부앞바다」는 · 로 나눠)이 그 시·도 이름으로 시작
  if (isSea(head)) {
    const zones = [head, ...items].flatMap((z) => z.split("·"));
    if (!sgg || isMetro(target.sido)) return zones.some((z) => names.some((n) => z.startsWith(n)));
    const full = noSpace(sgg.split(/\s+/)[0] ?? "");
    return zones.some((z) => z.startsWith(full));
  }
  return false;
}

/**
 * T3Q query_context.region({admin_code, level, name}) → 특보를 맞출 기준지역. 지역을 보내지 않았으면 전국(null),
 * 이름을 읽을 수 없으면 undefined(모름). 이름은 시·도부터 이은 브이월드 이름(「경상북도 영천시」 「부산광역시 해운대구 우동」 — lib/baseRegion baseWire)
 */
export function wxTargetOfT3q(region: unknown): WxTarget | null | undefined {
  if (region == null) return null;
  if (typeof region !== "object") return undefined;
  const r = region as { admin_code?: unknown; level?: unknown; name?: unknown };
  const words = (typeof r.name === "string" ? r.name : "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return r.admin_code == null || r.admin_code === "" ? null : undefined;
  const code = String(r.admin_code ?? "").replace(/\D/g, "");
  const level =
    r.level === "SIDO" || r.level === "SIGUNGU" || r.level === "EMD"
      ? r.level
      : code.length === 10 && code.slice(5, 8) !== "000"
        ? "EMD"
        : code.length === 10 && code.slice(2, 5) !== "000"
          ? "SIGUNGU"
          : "SIDO";
  const sgg = level === "SIGUNGU" ? words.slice(1) : level === "EMD" ? words.slice(1, -1) : [];
  return { sido: words[0], sigungu: sgg.length ? sgg.join(" ") : null };
}

/** 특보 id — 「KMA-종류단계-구역」(빈칸 없음). 서버 kma.ts 가 만들고, 답을 받은 때 특보(wx_seen)의 구역 글을 여기서 다시 읽는다 */
export const kmaAdvId = (type: string, level: string, area: string) => `KMA-${type}${level}-${area}`.replace(/\s/g, "");

/** 답을 받은 때 특보(wx_seen 한 건)의 구역 글 — 특보 id 에서 읽는다. 그 꼴이 아니면 null */
export function seenArea(w: { id: string; type: string; level: string }): string | null {
  const p = kmaAdvId(w.type, w.level, "");
  return w.id.startsWith(p) && w.id.length > p.length ? w.id.slice(p.length) : null;
}

/**
 * 전환용(임시) — 지금 운영에 떠 있는 판의 kma.ts 는 괄호 안 괄호가 있는 구역(「전라남도(…, 영광(낙월면 제외), 나주동남부, …, 구례평지)」)을
 * 쪼개 특보 id 를 여럿 만들었다(「전라남도(…영광(낙월면제외)」 「나주동남부」 … 「구례평지)」). 그 판으로 받은 답의 wx_seen 과 맞춰 보려고
 * 같은 구역 글에서 그때의 id 들을 다시 만든다(괄호 안 괄호가 없으면 지금 id 하나와 같다). 그 판으로 받은 답이 남아 있는 동안만 필요
 */
export const legacyAdvIds = (type: string, level: string, area: string): string[] =>
  (area.match(/[^,(]+(?:\([^)]*\))?/g) ?? []).map((p) => p.trim()).filter(Boolean).map((p) => kmaAdvId(type, level, p));
