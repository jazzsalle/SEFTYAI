import { NextResponse } from "next/server";
import type { WeatherResponse } from "@/lib/contract/agent";
import { weatherFor } from "@/lib/server/weather";
import { fail, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather — 기상청 기상특보 실시간 (R6: 훈련 시나리오 삭제, 실시간만). 로그인 필요.
 * 시연 시나리오 특보(R43)는 로그인 계정이 시연 계정이고 운영자가 켠 동안에만 붙는다(lib/server/weather weatherFor). 기상청 조회는 60초 서버 캐시
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  // 계정 id 를 함께 — 같은 브라우저에서 다른 계정으로 로그인해 쿠키가 바뀌면 화면(lib/session)이 이 응답을 버린다
  const body: WeatherResponse = { ...(await weatherFor(who)), accountId: who.id };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
