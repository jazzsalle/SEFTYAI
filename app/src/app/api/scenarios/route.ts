import { NextResponse } from "next/server";
import { RegionId } from "@/lib/contract/agent";
import { CONDITION_SCENARIOS } from "@/lib/server/scenarios";
import { demoFlows, library } from "@/lib/server/library";
import { checkSteps } from "@/lib/server/agent/composers2";

/** GET /api/scenarios?region= — 재난상황 조건 시나리오 · 추천 질의 · 연속 질의 시연 · AI 모드 점검 타임라인 */
export function GET(req: Request) {
  const region = RegionId.catch("national").parse(new URL(req.url).searchParams.get("region"));
  return NextResponse.json({
    conditions: CONDITION_SCENARIOS.filter((s) => region === "national" || s.region === region || s.region === "national"),
    library: library(region),
    flows: demoFlows(region),
    checkSteps: checkSteps(region),
  });
}
