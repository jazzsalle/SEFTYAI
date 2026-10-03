import { NextResponse } from "next/server";
import { uxClean } from "@/lib/server/ux";
const J = (b: unknown, init?: ResponseInit) => NextResponse.json(uxClean(b), init);
import { RegionId, WeatherResponse } from "@/lib/contract/agent";
import { fetchLiveAdvisories } from "@/lib/server/kma";
import { SCENARIO, SCENARIO_LABEL, scenarioAdvisories } from "@/lib/server/events";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode") === "live" ? "live" : "scenario";
  const region = RegionId.catch("national").parse(u.searchParams.get("region"));

  if (mode === "live") {
    const live = await fetchLiveAdvisories();
    const body: WeatherResponse = {
      mode,
      status: { ok: live.ok, fetchedAt: new Date().toISOString(), message: live.message },
      advisories: live.advisories,
      preliminary: live.preliminary,
    };
    return J(WeatherResponse.parse(body));
  }

  const sc = SCENARIO[region === "national" ? "busan" : region];
  const body: WeatherResponse = {
    mode,
    scenario: { id: sc.eventId, label: SCENARIO_LABEL, eventId: sc.eventId, baseTime: sc.baseTime },
    status: { ok: true, fetchedAt: sc.baseTime, message: "시연 시나리오" },
    advisories: scenarioAdvisories("national"),
    preliminary: [],
  };
  return J(WeatherResponse.parse(body));
}
