import { NextResponse } from "next/server";
import { RegionId } from "@/lib/contract/agent";
import { sopByRegion } from "@/lib/server/sop";
import { whoami } from "@/lib/server/who";

/** GET /api/sop?region= — 지자체 행동매뉴얼 대응절차 (자기 지역 매뉴얼만 요청) */
export async function GET(req: Request) {
  if (!(await whoami(req))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const region = RegionId.catch("national").parse(new URL(req.url).searchParams.get("region"));
  const m = region === "national" ? undefined : sopByRegion(region);
  if (!m) return NextResponse.json({ error: "대응절차가 없는 지역입니다" }, { status: 404 });
  return NextResponse.json(m, { headers: { "cache-control": "private, max-age=3600" } });
}
