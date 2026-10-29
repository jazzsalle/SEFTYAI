import "server-only";
import type { Account } from "../config";
import { WeatherResponse } from "../contract/agent";
import { scenarioWeather } from "../scenario";
import { fetchLiveAdvisories } from "./kma";
import { scenarioGet } from "./scenario";

/** 서버 캐시 60초 — 탭·사용자가 많아도 기상청은 1분에 한 번만 부른다(설계 §7) */
let cache: { at: number; body: WeatherResponse } | null = null;

/** 기상청 기상특보 실시간 (R6) — 모든 계정이 같은 값 */
export async function liveWeather(): Promise<WeatherResponse> {
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
  return cache.body;
}

/**
 * 이 계정 화면이 받는 특보 — 기상청 실시간. 시연 시나리오를 켠 동안의 시연 계정(R45: 시연 계정 · 켜짐 · 끝나는 시각 전 · 그 지역 켬, 서버에서 판단)은
 * 기상청을 부르지 않고 시나리오 특보만(예비특보 없음 · 조회 시각 = 지금, 특보 발표 시각 = 켠 시각 · realtimeCut — lib/scenario scenarioWeather).
 * /api/weather 와 「시연 세트 예열」(브리핑 특보)이 같이 쓴다
 */
export async function weatherFor(acc: Account): Promise<WeatherResponse> {
  return scenarioWeather(await scenarioGet(), acc.id) ?? (await liveWeather());
}
