import { NextResponse } from "next/server";
import { WeatherResponse } from "@/lib/contract/agent";
import { fetchLiveAdvisories } from "@/lib/server/kma";
import { fail, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** 서버 캐시 60초 — 탭·사용자가 많아도 기상청은 1분에 한 번만 부른다(설계 §7) */
let cache: { at: number; body: WeatherResponse } | null = null;

/** GET /api/weather — 기상청 기상특보 실시간 (R6: 훈련 시나리오 삭제, 실시간만). 로그인 필요 */
export async function GET(req: Request) {
  if (!(await whoami(req))) return fail(401, "로그인이 필요합니다.");
  if (!cache || Date.now() - cache.at > 60_000) {
    const live = await fetchLiveAdvisories();
    cache = {
      at: Date.now(),
      body: WeatherResponse.parse({
        mode: "live",
        status: { ok: live.ok, fetchedAt: new Date().toISOString(), message: live.message },
        advisories: live.advisories,
        preliminary: live.preliminary,
      }),
    };
  }
  return NextResponse.json(cache.body, { headers: { "cache-control": "no-store" } });
}
