import "server-only";

/**
 * 기준지역 선택지 — 브이월드(국토교통부) 행정구역 자료에서 시·도 / 시·군·구 / 읍·면·동 이름·코드만 받는다(좌표 없음).
 * 지도에 그리는 브이월드 행정경계와 같은 원천. 코드는 법정동 기준(시도 2·시군구 5·읍면동 8자리) — T3Q region.admin_code 와 같은 체계.
 * 브이월드 키는 등록한 서비스 주소(domain)와 묶여 있다 → VWORLD_DOMAIN(기본: 등록된 배포 주소)을 함께 보낸다.
 * 결과는 서버 메모리에 하루 보관한다.
 */
export type AdminLevel = "sido" | "sigungu" | "emd";
export interface AdminArea { code: string; name: string }

const SPEC: Record<AdminLevel, { data: string; code: string; name: string; parentLen: number }> = {
  sido: { data: "LT_C_ADSIDO_INFO", code: "ctprvn_cd", name: "ctp_kor_nm", parentLen: 0 },
  sigungu: { data: "LT_C_ADSIGG_INFO", code: "sig_cd", name: "sig_kor_nm", parentLen: 2 },
  emd: { data: "LT_C_ADEMD_INFO", code: "emd_cd", name: "emd_kor_nm", parentLen: 5 },
};
const TTL_MS = 24 * 3600_000;
const PAGE = 1000;
const cache = new Map<string, { at: number; items: AdminArea[] }>();

export class AdminLookupError extends Error {}

async function page(level: AdminLevel, parent: string, n: number) {
  const s = SPEC[level];
  const key = process.env.VWORLD_KEY || process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (!key) throw new AdminLookupError("브이월드 인증키가 설정되지 않았습니다.");
  const u = new URL("https://api.vworld.kr/req/data");
  const p: Record<string, string> = {
    service: "data", request: "GetFeature", version: "2.0", format: "json", data: s.data, key,
    domain: process.env.VWORLD_DOMAIN || "safetyai-three.vercel.app", geometry: "false", attribute: "true", size: String(PAGE), page: String(n),
  };
  if (parent) p.attrFilter = `${s.code}:like:${parent}`;
  else p.geomFilter = "BOX(120,32,134,40)"; // 우리나라 전체(시·도 목록)
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  const r = await fetch(u, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  const j = (await r.json().catch(() => null)) as {
    response?: { status?: string; error?: { text?: string }; record?: { total?: string }; result?: { featureCollection?: { features?: { properties: Record<string, string> }[] } } };
  } | null;
  const res = j?.response;
  if (res?.status === "NOT_FOUND") return { total: 0, items: [] as AdminArea[] };
  if (!res || res.status !== "OK") throw new AdminLookupError(`행정구역 목록을 받지 못했습니다. (${res?.error?.text ?? `HTTP ${r.status}`})`);
  const items = (res.result?.featureCollection?.features ?? []).map((f) => ({ code: String(f.properties[s.code]), name: String(f.properties[s.name]) }));
  return { total: Number(res.record?.total ?? items.length), items };
}

/** level 의 목록(parent = 상위 코드: 시군구는 시도 2자리, 읍면동은 시군구 5자리). 받은 이름 그대로, 코드 순 */
export async function adminAreas(level: AdminLevel, parent = ""): Promise<AdminArea[]> {
  const s = SPEC[level];
  if (s.parentLen && !new RegExp(`^\\d{${s.parentLen}}$`).test(parent)) throw new AdminLookupError("상위 지역 코드가 올바르지 않습니다.");
  const ck = `${level}|${parent}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const first = await page(level, parent, 1);
  const all = [...first.items];
  for (let n = 2; all.length < first.total && n <= 20; n++) all.push(...(await page(level, parent, n)).items);
  // like 는 「포함」이라 앞자리 일치만 남긴다(예: 26 → 11260 이 섞이지 않게)
  const items = all.filter((a) => a.code.startsWith(parent)).sort((a, b) => a.code.localeCompare(b.code));
  cache.set(ck, { at: Date.now(), items });
  return items;
}
