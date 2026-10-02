import { NextResponse } from "next/server";
import { RegionId } from "@/lib/contract/agent";
import { eventsInRegion, regionRecord } from "@/lib/server/events";

/** GET /api/events?region= — 재난마스터 목록 */
export function GET(req: Request) {
  const region = RegionId.catch("national").parse(new URL(req.url).searchParams.get("region"));
  const rows = eventsInRegion(region)
    .map((e) => {
      const recs = region === "national" ? e.regions : [regionRecord(e, region)!].filter(Boolean);
      const sum = (f: (r: (typeof recs)[number]) => number | null | undefined) => recs.reduce((n, r) => n + (f(r) ?? 0), 0);
      return {
        eventId: e.eventId,
        title: e.title.replace(/^\[시연\]\s*/, ""),
        typeName: e.typeName,
        typeCode: e.typeCode,
        startDate: e.startDate,
        endDate: e.endDate,
        status: e.status,
        synthetic: !!e.synthetic,
        training: !!e.training,
        regions: e.regions.map((r) => (r.sido.includes("부산") ? "부산" : r.sigungu.replace(/[시군]$/, ""))),
        regionRecords: e.regions.map((r) => r.regionRecordId),
        maxRain: e.weather.maxHourlyRain_mm,
        rainVerified: !e.synthetic,
        damageThousand: sum((r) => r.damages.publicFacilityLedger?.damage_krw_thousand),
        housesFlooded: sum((r) => r.damages.privateFacility?.housing?.flooded),
        traces: sum((r) => r.floodTraces?.count),
        reports119: sum((r) => r.reports119.length),
        situationReports: sum((r) => r.situationReports.length),
        ndms: e.ndmsKey ? `${e.ndmsKey.DSTR_YEAR}/${e.ndmsKey.DSTR_TY_CD}/${e.ndmsKey.DSTR_SN}` : null,
        damageTags: [...new Set(recs.flatMap((r) => r.damageTags))],
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return NextResponse.json({ events: rows });
}
