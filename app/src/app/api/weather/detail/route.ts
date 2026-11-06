import { wxDetail } from "@/lib/server/kmaBulletin";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather/detail?sido=26 — 기상특보 상세(특보 줄을 펼친 창): 최근 24시간 통보문 목록(제목까지)·상태 이력 단계·특보마다 「이 특보로 질의」 기준지역. 로그인 필요.
 * sido = 기준지역 시·도 코드(앞 두 자리) — 그 시·도를 맡는 지방청과 본청(전국) 통보문만. 없으면 전국(지점 열 곳 모두).
 * 띠(/api/weather)와 창구를 나눈 까닭은 부르는 횟수 — 띠는 1분마다 다시 묻고, 상세는 사람이 열었을 때만 묻는다(개발 서버 WeatherController 와 같은 나눔).
 * 시연 시나리오를 켠 시연 계정(R45)은 기상청을 부르지 않는다(realtimeCut — lib/server/kmaBulletin wxDetail)
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const sido = new URL(req.url).searchParams.get("sido");
  if (sido && !/^\d{2}$/.test(sido)) return fail(400, "시·도 코드가 올바르지 않습니다.");
  return json(await wxDetail(who, sido || null));
}
