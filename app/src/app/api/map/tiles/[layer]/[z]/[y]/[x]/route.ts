import { relayImage, tileUrl, vworldKey } from "@/lib/server/vworldTiles";

/** GET /api/map/tiles/{Base|white|Satellite|Hybrid}/{z}/{y}/{x} — VWorld 배경지도 타일(키는 서버에만, lib/server/vworldTiles) */
export async function GET(_req: Request, { params }: { params: Promise<{ layer: string; z: string; y: string; x: string }> }) {
  const { layer, z, y, x } = await params;
  return relayImage(tileUrl(vworldKey(), layer, z, y, x.replace(/\.(png|jpe?g)$/i, "")));
}
