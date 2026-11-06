import "server-only";

/**
 * 배경지도 타일·행정경계(WMS)를 서버가 대신 받는다 — 개발서버 MapController tiles·VWorldClient.TileAsync(kjw 998facb) 이식(2026-11-07).
 * 브라우저가 VWorld 를 직접 부르면 주소에 인증키가 드러난다 → 키는 서버 환경값에만(이름은 기존 것 그대로: VWORLD_KEY, 없으면 NEXT_PUBLIC_VWORLD_KEY).
 * 받는 것은 국토교통부가 공개한 배경지도·경계뿐이라 로그인을 묻지 않는다(지도 라이브러리가 <img> 로 가져가 머리글을 붙일 수 없음 — 개발서버와 같음).
 * 못 받으면 404 로 비운다 — 화면은 오류 수를 세어 OSM·경계 없음으로 물러선다.
 * 인증은 등록 도메인의 Referer 로도 되므로(MapView 주석 — WMS 는 DOMAIN 을 붙이면 INCORRECT_KEY 가 섞임) 등록 주소를 Referer 로 보낸다.
 */

/** 받는 종류 — 경로를 그대로 상류 주소에 끼우므로 표에 있는 이름만 */
export const TILE_LAYERS: Record<string, { ext: string; maxZoom: number }> = {
  Base: { ext: "png", maxZoom: 19 },
  white: { ext: "png", maxZoom: 18 },
  Satellite: { ext: "jpeg", maxZoom: 19 },
  Hybrid: { ext: "png", maxZoom: 19 },
};

/** WMS 로 넘기는 칸(그 밖은 버린다) — KEY 는 서버가 붙인다 */
export const WMS_PARAMS = ["SERVICE", "REQUEST", "VERSION", "LAYERS", "STYLES", "FORMAT", "TRANSPARENT", "WIDTH", "HEIGHT", "CRS", "BBOX"] as const;
/** 경계 레이어(MapView VW_WMS_LAYERS) 만 */
const WMS_LAYER = /^lt_c_ad(sido|sigg|emd)$/;

export const vworldKey = () => process.env.VWORLD_KEY || process.env.NEXT_PUBLIC_VWORLD_KEY || "";
const referer = () => `https://${process.env.VWORLD_DOMAIN || "safetyai-three.vercel.app"}/`;

/** 타일 한 장 주소 — 틀린 칸이면 null */
export function tileUrl(key: string, layer: string, z: string, y: string, x: string): string | null {
  const spec = TILE_LAYERS[layer];
  if (!key || !spec) return null;
  const n = [z, y, x].map((v) => (/^\d{1,7}$/.test(v) ? Number(v) : NaN));
  if (n.some((v) => !Number.isFinite(v))) return null;
  const [zz, yy, xx] = n;
  const max = 2 ** zz;
  if (zz < 0 || zz > spec.maxZoom || yy >= max || xx >= max) return null;
  return `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/${layer}/${zz}/${yy}/${xx}.${spec.ext}`;
}

/** WMS 주소 — 받은 칸에서 고른 것만 옮기고 KEY 를 붙인다. 경계 레이어가 아니면 null */
export function wmsUrl(key: string, query: URLSearchParams): string | null {
  if (!key) return null;
  const pick = new Map<string, string>();
  for (const [k, v] of query) {
    const K = k.toUpperCase();
    if ((WMS_PARAMS as readonly string[]).includes(K)) pick.set(K, v);
  }
  const layers = (pick.get("LAYERS") ?? "").split(",").filter(Boolean);
  if (!layers.length || layers.length > 4 || !layers.every((l) => WMS_LAYER.test(l))) return null;
  const u = new URL("https://api.vworld.kr/req/wms");
  for (const [k, v] of pick) u.searchParams.set(k, v);
  u.searchParams.set("KEY", key);
  return u.toString();
}

/** 상류에서 이미지를 받아 그대로 돌려준다. 이미지가 아니면(VWorld 는 권한 밖도 200 에 XML 오류) 404 */
export async function relayImage(url: string | null): Promise<Response> {
  if (!url) return new Response(null, { status: 404 });
  try {
    const r = await fetch(url, { headers: { referer: referer() }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(await r.arrayBuffer(), {
      status: 200,
      // 배경지도는 거의 바뀌지 않는다 — 브라우저 하루, 공용 캐시 일주일(함수 호출 수를 줄임)
      headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=604800" },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
}
