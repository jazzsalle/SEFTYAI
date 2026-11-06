import { weatherFor } from "@/lib/server/weather";
import { bulletinByKey } from "@/lib/server/kmaBulletin";
import { parseBulletinKey } from "@/lib/wxBulletin";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather/bulletin?key=지점|발표시각|번호 — 통보문 한 장의 본문(목록은 제목까지만 — 펼칠 때 한 장씩). 로그인 필요.
 * 열쇠를 경로가 아니라 질의로 받는다(「|」가 경로에 들어가면 막히는 서버가 있다 — 개발 서버 WeatherController.Bulletin).
 * 통보문은 기상청이 공개로 내는 글이라 기준지역으로 막지 않는다. 시연 시나리오를 켠 시연 계정(R45)은 기상청을 부르지 않는다
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const key = new URL(req.url).searchParams.get("key");
  if (!parseBulletinKey(key)) return fail(400, "통보문 열쇠가 올바르지 않습니다.");
  if ((await weatherFor(who)).realtimeCut) return fail(409, "시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다");
  try {
    const b = await bulletinByKey(key!);
    return b ? json(b) : fail(404, "통보문을 찾지 못했습니다.");
  } catch {
    return fail(502, "기상청 통보문을 받지 못했습니다.");
  }
}
