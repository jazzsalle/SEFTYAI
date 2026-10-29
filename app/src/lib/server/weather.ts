import "server-only";
import type { Account } from "../config";
import { WeatherResponse } from "../contract/agent";
import { scenarioAdvisories, withScenario } from "../scenario";
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
 * 이 계정 화면이 받는 특보 — 기상청 실시간 + 시연 시나리오 특보(R43: 시연 계정 · 켜짐 · 끝나는 시각 전일 때만, 서버에서 판단).
 * /api/weather 와 「시연 세트 예열」(브리핑 특보)이 같이 쓴다
 */
export async function weatherFor(acc: Account): Promise<WeatherResponse> {
  const live = await liveWeather();
  return withScenario(live, scenarioAdvisories(await scenarioGet(), acc.id));
}
