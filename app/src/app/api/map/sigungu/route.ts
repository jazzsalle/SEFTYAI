import { AdminLookupError, sigunguShapes } from "@/lib/server/vworldAdmin";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/map/sigungu?sido=26 — 시도 안 시군구 경계(브이월드 LT_C_ADSIGG_INFO, 경위도).
 * 지도 「요약 보기」가 구마다 대상 수로 칠한다(개발 서버 mapApi.boundary 대응). 브이월드 키는 서버에만 둔다
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const sido = new URL(req.url).searchParams.get("sido") ?? "";
  try {
    return json({ sido, items: await sigunguShapes(sido) });
  } catch (e) {
    if (e instanceof AdminLookupError) return fail(e.message.includes("올바르지") ? 400 : 502, e.message);
    return fail(502, "행정경계를 받지 못했습니다.");
  }
}
