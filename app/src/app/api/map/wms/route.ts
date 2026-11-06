import { relayImage, vworldKey, wmsUrl } from "@/lib/server/vworldTiles";

/**
 * GET /api/map/wms?SERVICE=WMS&… — VWorld 행정경계 WMS(경계 레이어만, KEY 는 서버가 붙임 — lib/server/vworldTiles).
 * 서버에 키가 없으면 404 + `x-map-status: nokey` — 화면이 개발서버 boundaryStatus 'nokey'(배경지도 고장 안내)로 읽는다(R59).
 * 권한 거절(403)은 화면이 'denied'(「이 지역의 행정경계는 볼 수 없습니다.」)로 읽지만 지금 이 경로는 보내지 않는다 —
 * 개발서버도 경계를 전국 어디든 준다(MapController boundary, 사용자 지시 54).
 */
export async function GET(req: Request) {
  const key = vworldKey();
  if (!key) return new Response(null, { status: 404, headers: { "x-map-status": "nokey", "cache-control": "no-store" } });
  return relayImage(wmsUrl(key, new URL(req.url).searchParams));
}
