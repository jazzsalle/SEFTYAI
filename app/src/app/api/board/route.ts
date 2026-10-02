import { NextResponse } from "next/server";
import { RegionId, type Advisory, type QueryContext } from "@/lib/contract/agent";
import { BoardResponse } from "@/lib/contract/board";
import { SCENARIO, SCENARIO_LABEL, eventRef, r119Ref, scenarioAdvisories } from "@/lib/server/events";
import { fetchLiveAdvisories } from "@/lib/server/kma";
import { STAGE_STEPS, stepIndex } from "@/lib/server/manual";
import { rankRisks, riskRef, risksIn } from "@/lib/server/risk";
import { hourlySeries, rainThresholds, situation } from "@/lib/server/agent/core";

export const dynamic = "force-dynamic";

const SUGG: Record<RegionId, { kicker: string; q: string; preset?: string }[]> = {
  busan: [
    { kicker: "위험·취약지역 · 어디/왜/언제", q: "부산 급경사지는 어디 있고, 왜·언제 위험한가요?" },
    { kicker: "과거 유사사례 · 강우-피해", q: "시간당 60mm 안팎일 때 과거 부산 어디가 침수됐나요?" },
    { kicker: "행동매뉴얼 · 지금 할 일", q: "호우경보가 발효됐는데 자연재난과 담당자인 제가 지금 해야 할 일은?" },
    { kicker: "하천 · 통제 기준", q: "온천천 하상도로는 언제 통제해야 하나요?" },
  ],
  yeongcheon: [
    { kicker: "위험·취약지역 · 어디/왜/언제", q: "영천 위험저수지는 어디 있고 왜 위험한가요?" },
    { kicker: "하천 · 과거 피해", q: "금호강 주변 위험지역과 과거 피해는?" },
    { kicker: "행동매뉴얼 · 지금 할 일", q: "호우경보 발효 시 안전재난하천과가 지금 해야 할 일은?" },
    { kicker: "지하차도 · 통제 기준", q: "영천 지하차도 통제 기준과 대상은?" },
  ],
  inje: [
    { kicker: "야영장 · 철수 판단", q: "인제 계곡 야영장 중 먼저 철수시킬 곳은 어디인가요?" },
    { kicker: "하천 · 위험 구간", q: "내린천 주변 위험 구간과 대응은?" },
    { kicker: "산사태 · 대피 시점", q: "인제 산사태 취약지역은 어디고 언제 대피해야 하나요?" },
    { kicker: "재난사건 · 과거 피해", q: "2013년 7월 인제 호우 때 어떤 피해가 있었나요?" },
  ],
  national: [
    { kicker: "지역 비교 · 위험·취약지역", q: "시범 3개 지역 급경사지 현황을 비교해 주세요" },
    { kicker: "재난마스터 · 사건 정리", q: "2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?" },
    { kicker: "재난사건 · 태풍", q: "태풍 힌남노 때 시범지역 피해는?" },
    { kicker: "119 · 진행 중 사건", q: "이번 호우로 접수된 119 신고 현황은?" },
  ],
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const region = RegionId.catch("national").parse(u.searchParams.get("region"));
  const mode = u.searchParams.get("mode") === "live" ? "live" : "scenario";
  const sigungu = u.searchParams.get("sigungu") || undefined;
  const pr = region === "national" ? "busan" : region;
  const baseTime = mode === "scenario" ? SCENARIO[pr].baseTime : new Date().toISOString();

  let advs: Advisory[] = [];
  if (mode === "live") {
    const live = await fetchLiveAdvisories();
    advs = live.advisories;
  } else advs = scenarioAdvisories(region);
  const mine = advs.filter((a) => a.status === "발효" && (region === "national" || a.regionId === region));
  const advisory = mine.find((a) => a.level === "경보" && a.type === "호우") ?? mine.find((a) => a.type === "호우") ?? mine[0] ?? null;

  const ctx: QueryContext = {
    region, sigungu, disasterType: "호우", baseTime, mode,
    advisory: advisory ? { type: advisory.type, level: advisory.level, issuedAt: advisory.issuedAt, area: advisory.area } : undefined,
  };
  const regs = region === "national" ? (["busan", "yeongcheon", "inje"] as const) : [region];
  const sits = regs.map((r) => situation(ctx, r));
  const s = sits[0];

  const ranked = regs
    .flatMap((r, i) => { const seen = new Set<string>(); return rankRisks(risksIn(r, sigungu), r, { active: sits[i].active && mode === "scenario" }).filter((x) => { const k = `${x.o.region.sigungu}-${x.o.region.emd}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, region === "national" ? 2 : 6); })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const reps = sits.flatMap((x) => x.reports).sort((a, b) => b.신고일시.localeCompare(a.신고일시));
  const stage = region !== "national" && s.manual && s.stage ? s.stage : null;
  const lv = s.level === "경보" ? "경보" : s.level === "주의보" ? "주의보" : s.level === "예비특보" ? "예비특보" : null;

  const body: BoardResponse = {
    region,
    mode,
    baseTime,
    scenarioLabel: mode === "scenario" ? SCENARIO_LABEL : undefined,
    advisory,
    stage: stage && s.manual
      ? { name: stage.name.replace(/\s*\(.*\)/, ""), level: stage.emergencyLevel.split(" — ")[0].replace(/\(.*\)/, "").trim(), step: stepIndex(lv), steps: STAGE_STEPS, trigger: stage.trigger, manualId: `${s.manual.id}:${stage.stageId}`, manualTitle: `${s.manual.responsibleDept} 매뉴얼` }
      : null,
    todo: stage
      ? stage.tasks.slice(0, 4).map((t) => ({ seq: t.seq, task: `${t.task.split(" — ")[0]}${t.page ? ` · p.${t.page}` : ""}`, owner: t.owner?.split(" (")[0], due: t.timing?.replace(/^경보 발표\s*/, "") || "즉시" }))
      : sits.some((x) => x.stage)
        ? sits.filter((x) => x.stage).map((x, i) => ({ seq: i + 1, task: `[${x.rname.split(" ").pop()}] ${x.stage!.tasks[0]?.task.split(" — ")[0]}`, owner: x.manual?.responsibleDept, due: x.stage!.tasks[0]?.timing }))
        : region !== "national" && s.manual
          ? s.manual.stages[0].tasks.slice(0, 4).map((t) => ({ seq: t.seq, task: t.task.split(" — ")[0], owner: t.owner?.split(" (")[0], due: "예비특보 시" }))
          : sits.filter((x) => x.manual).map((x, i) => ({ seq: i + 1, task: `[${x.rname.split(" ").pop()}] ${x.manual!.stages[0].tasks[0]?.task.split(" — ")[0]}`, owner: x.manual!.responsibleDept, due: "예비특보 시" })),
    topRisks: ranked.map((r) => riskRef(r.o, { near: r.near.length })),
    feed119: reps.slice(0, 8).map((r) => ({ t: r.신고일시.slice(11, 16), text: `${r.ext.accidentType} · ${r.ext.locationDetail} — ${r.ext.callSummary.slice(0, 40)}`, entity: r119Ref(r) })),
    rain: { label: s.wx ? `${s.wx.station ?? ""} 시간당 강우` : "시간당 강우(입력 시 비교)", series: hourlySeries(s.wx), thresholds: rainThresholds(region).map(({ mm, label, basis }) => ({ mm, label, basis })) },
    event: s.event ? eventRef(s.event, region === "national" ? undefined : region) : null,
    counts: { risk: (regs as readonly RegionId[]).reduce<number>((n, r) => n + risksIn(r, sigungu).length, 0), events: 0, reports119: reps.length, damages: 0 },
    suggestions: SUGG[region],
    citations: [],
  };
  return NextResponse.json(BoardResponse.parse(body));
}
