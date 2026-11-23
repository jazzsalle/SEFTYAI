import { weatherFor } from "@/lib/server/weather";
import { wxInfos } from "@/lib/server/kmaBulletin";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather/infos?sido=26 — 기준지역을 맡는 지방청·본청이 발표 12시간 안에 낸 기상정보문(강수·기온 현황과 전망) 최신 3장, 본문까지(개발 서버 74974d2 GET /api/weather/infos).
 * 「이 특보로 질의」가 weather_warnings.weather_info(「기상정보(예보)」)로 싣는다. 통보문처럼 공개로 내는 글이라 권한으로 막지 않는다. 로그인 필요.
 * 시연 시나리오를 켠 시연 계정(R45)은 기상청을 부르지 않는다
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const sido = new URL(req.url).searchParams.get("sido");
  if (sido && !/^\d{2}$/.test(sido)) return fail(400, "시·도 코드가 올바르지 않습니다.");
  if ((await weatherFor(who)).realtimeCut) return fail(409, "시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다");
  return json({ items: await wxInfos(sido || null) });
}
