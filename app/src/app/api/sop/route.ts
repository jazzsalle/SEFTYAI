import { NextResponse } from "next/server";
import { uxClean } from "@/lib/server/ux";
import { RegionId } from "@/lib/contract/agent";
import { sopByRegion } from "@/lib/server/sop";

/** GET /api/sop?region= — 지자체 행동매뉴얼 대응절차 (자기 지역 매뉴얼만 요청) */
export function GET(req: Request) {
  const region = RegionId.catch("national").parse(new URL(req.url).searchParams.get("region"));
  const m = region === "national" ? undefined : sopByRegion(region);
  if (!m) return NextResponse.json({ error: "대응절차가 없는 지역입니다" }, { status: 404 });
  return NextResponse.json(uxClean(m), { headers: { "cache-control": "public, max-age=3600" } });
}
