import { NextResponse } from "next/server";
import { uxClean } from "@/lib/server/ux";
const J = (b: unknown, init?: ResponseInit) => NextResponse.json(uxClean(b), init);
import { RegionId, type Advisory } from "@/lib/contract/agent";
import { EVENT_BY_ID, SCENARIO, regionRecord, scenarioAdvisories } from "@/lib/server/events";
import { fetchLiveAdvisories } from "@/lib/server/kma";
import { displayName, rankRisks, risksIn } from "@/lib/server/risk";
import { checkSteps } from "@/lib/server/agent/composers2";

export const dynamic = "force-dynamic";

/**
 * GET /api/aim?region=&mode= — AI 모드 (상황 점검 전광판)
 * ① 특보 수집 → ② 사전 정의 질의로 Agent 상황 점검 → ③ 신호등 판정 → ④ 정기(10분)·변경 재점검 이력
 * 신호등 : 적색(경보·즉시 상황확인) · 황색(주의보·주시) · 녹색(특보 없음·작동 중) · 회색(조회 실패·판단 불가)
 */
const Q = {
  경보: [
    { t: "상황 요약", q: "현재 상황을 요약해줘", preset: "briefing" },
    { t: "위험·취약지역", q: "우선 확인할 지역과 시설은?" },
    { t: "유사재난 사례", q: "관련 과거 사례를 보여줘" },
    { t: "행동매뉴얼", q: "대응 매뉴얼을 보여줘" },
    { t: "대응 조치", q: "담당자가 먼저 검토할 조치는?" },
  ],
  주의보: [
    { t: "상황 요약", q: "현재 상황을 요약해줘", preset: "briefing" },
    { t: "특보 기준", q: "특보 기준과 입력한 기상 조건은?" },
    { t: "위험·취약지역", q: "미리 살펴볼 취약지역은?" },
    { t: "유사재난 사례", q: "관련 과거 사례를 보여줘" },
    { t: "행동매뉴얼", q: "사전 대비 매뉴얼을 보여줘" },
  ],
};
const PRI: Record<string, number> = { busan: 0, yeongcheon: 1, inje: 2 };

function message(a: Advisory) {
  const rid = a.regionId;
  if (a.type === "풍랑") return "선박 대피와 해안가 출입 통제 상황을 점검하세요.";
  if (a.type === "강풍") return "옥외 시설물 고정 상태와 고소 작업 중지 여부를 점검하세요.";
  if (a.type === "산사태") return "산사태 취약지역 거주 주민 사전대피와 급경사지 통제 상황을 점검하세요.";
  if (!rid || rid === "national") return a.level === "경보" ? "침수 우려 지역과 지하차도·하천변 통제 상황을 바로 확인하세요." : "저지대·급경사지 등 취약지역의 사전 대비 상황을 점검하세요.";
  const ev = EVENT_BY_ID.get(SCENARIO[rid].eventId);
  const rec = ev && regionRecord(ev, rid);
  const sim = rec && ev?.similarCases?.[rec.regionRecordId]?.[0];
  const past = sim && EVENT_BY_ID.get(sim.eventId);
  const top = rankRisks(risksIn(rid), rid, { active: true })[0];
  if (a.level !== "경보") return `${top ? `${displayName(top.o).replace(/\s*\(.*\)$/, "")} 등 ` : ""}취약지역의 사전 대비 상황을 점검하고, 경보 격상에 대비해 기상 변화를 주시하세요.`;
  const pastText = past ? `${past.startDate.slice(0, 4)}년 ${Number(past.startDate.slice(5, 7))}월 비슷한 비(시간최대 ${past.weather.maxHourlyRain_mm}mm) 때 ${regionRecord(past, rid)?.summary.split(/[,/(]/)[0].trim() ?? "피해"} 기록이 있습니다.` : "";
  const cat = top?.o.category ?? "";
  const act = /저수지/.test(cat) ? "제당 월류·누수 여부와 하류 주민 대피 준비를 먼저 확인하세요." : /산사태|급경사|붕괴/.test(cat) ? "사면 붕괴 징후와 인근 주민 사전대피를 먼저 확인하세요." : /야영장/.test(cat) ? "계곡·하천변 야영객 철수를 먼저 확인하세요." : "침수 이력 지하차도·하천변 도로 통제를 먼저 확인하세요.";
  return `${pastText} ${top ? `${displayName(top.o).replace(/\s*\(.*\)$/, "")} 등 ` : ""}${act}`.trim();
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const region = RegionId.catch("national").parse(u.searchParams.get("region"));
  const mode = u.searchParams.get("mode") === "live" ? "live" : "scenario";
  let ok = true, advs: Advisory[] = [], msg = "";
  if (mode === "live") {
    const l = await fetchLiveAdvisories();
    ok = l.ok;
    advs = l.advisories;
    msg = l.message;
  } else advs = scenarioAdvisories("national").filter((x) => x.status === "발효");
  const mine = (x: Advisory) => region === "national" || x.regionId === region;
  const sorted = [...advs].sort((x, y) => Number(mine(y)) - Number(mine(x)) || (y.level === "경보" ? 1 : 0) - (x.level === "경보" ? 1 : 0) || (PRI[x.regionId ?? ""] ?? 9) - (PRI[y.regionId ?? ""] ?? 9));
  const own = sorted.filter(mine);
  const state = !ok ? "gray" : own.some((x) => x.level === "경보") ? "red" : own.length ? "yellow" : "green";
  const alerts = sorted.map((a) => ({ ...a, mine: mine(a), message: message(a), questions: a.level === "경보" ? Q.경보 : Q.주의보 }));
  const pr = region === "national" ? "busan" : region;
  const baseTime = mode === "scenario" ? SCENARIO[pr].baseTime : new Date().toISOString();
  // 자동 점검 이력 (시나리오 : 사건 타임라인 · 라이브 : 현재 1건)
  const checks =
    mode === "scenario"
      ? checkSteps(pr).map((c) => {
          const ev = EVENT_BY_ID.get(SCENARIO[pr].eventId)!;
          const t = new Date(c.at).getTime();
          const lv = ev.weather.advisories.filter((x) => x.type === "호우" && new RegExp(pr === "busan" ? "부산" : pr === "yeongcheon" ? "영천" : "인제").test(x.area) && new Date(x.issuedAt.length <= 16 ? x.issuedAt + ":00+09:00" : x.issuedAt).getTime() <= t).map((x) => x.level).pop();
          return { at: c.at, label: c.label, state: lv === "경보" ? "red" : lv === "주의보" ? "yellow" : "green" };
        })
      : [{ at: baseTime, label: msg || "정기 점검", state }];
  return J({
    mode, region, state, ok, message: msg,
    lastCheck: baseTime,
    nextCheck: new Date(new Date(baseTime).getTime() + 10 * 60e3).toISOString(),
    alerts,
    checks,
    question: "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 상황확인 또는 재난대응 착수를 우선 검토해야 합니까?",
  });
}
