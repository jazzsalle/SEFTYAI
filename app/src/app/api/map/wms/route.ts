import { relayImage, vworldKey, wmsUrl } from "@/lib/server/vworldTiles";

/** GET /api/map/wms?SERVICE=WMS&… — VWorld 행정경계 WMS(경계 레이어만, KEY 는 서버가 붙임 — lib/server/vworldTiles) */
export async function GET(req: Request) {
  return relayImage(wmsUrl(vworldKey(), new URL(req.url).searchParams));
}
