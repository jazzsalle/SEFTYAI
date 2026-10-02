import { NextResponse } from "next/server";
import { RegionId } from "@/lib/contract/agent";
import { detail } from "@/lib/server/agent/detail";
import { SCENARIO } from "@/lib/server/events";

/** GET /api/agent/detail?type=&id=&region=&mode= — 상세정보조회 (T3Q-04/05/07/11 대응) */
export function GET(req: Request) {
  const u = new URL(req.url);
  const region = RegionId.catch("national").parse(u.searchParams.get("region"));
  const mode = u.searchParams.get("mode") === "live" ? "live" : "scenario";
  const d = detail(u.searchParams.get("type") ?? "", u.searchParams.get("id") ?? "", {
    region,
    mode,
    disasterType: "호우",
    baseTime: mode === "scenario" ? SCENARIO[region === "national" ? "busan" : region].baseTime : new Date().toISOString(),
  });
  if (!d) return NextResponse.json({ error: { code: "NO_DATA", message: "상세정보가 없습니다" } }, { status: 404 });
  return NextResponse.json(d);
}
