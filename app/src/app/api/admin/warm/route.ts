import { z } from "zod";
import { WARM_REGIONS, type WarmItem, type WarmJob, type WarmResponse } from "@/lib/adminTypes";
import { ACCOUNTS } from "@/lib/config";
import { briefingDefaults } from "@/lib/briefingSet";
import { briefRequest } from "@/lib/library";
import { errText, requireOperator, t3qHealth } from "@/lib/server/admin";
import { audit, ensureSchema } from "@/lib/server/db";
import { demoGet, demoLive } from "@/lib/server/demoMode";
import { submitJob, type Job } from "@/lib/server/jobs";
import { fail, json } from "@/lib/server/who";
import { PILOT_T3Q } from "@/lib/t3q/region";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  regions: z.array(z.enum(["busan", "inje", "yeongcheon"])).min(1).max(3).optional(),
  /** 받아 둔 답을 무시하고 새로 질의 */
  force: z.boolean().optional(),
});
/** 함수 시간 한도(60초) 안에 끝내기 위한 접수 예산 — 넘으면 남은 문항은 SKIPPED (다시 실행하면 이어서 접수) */
const BUDGET_MS = 40_000;

const pick = (j: Job): WarmJob => ({
  id: j.id, account_id: j.account_id, state: j.state, t3q_status: j.t3q_status, http_status: j.http_status,
  cached_from: j.cached_from, error_code: j.error_code, created_at: j.created_at, finished_at: j.finished_at, elapsed_ms: j.elapsed_ms,
});

/**
 * POST /api/admin/warm {regions?, force?} — 브리핑 예열 (운영자 전용, §5)
 * 부산·인제·영천 × 기본 브리핑 세트(lib/briefingSet 기본 항목 가운데 체크된 것 — 개발서버 ai_briefing_item is_default)를 그 지역의 시연 대상 계정 명의로 접수한다(source BRIEFING).
 * 대상 계정(R52-1)은 시연 모드를 켤 때 고른 계정 — 그 지역에 대상 계정이 없으면 그 지역은 예열하지 않는다(ERROR 로 알린다). 대상 아닌 계정은 받아 둔 답을 쓰지 않으므로.
 * 화면 [브리핑 시작]과 같게 질의문 그대로 · 문항 없음 · query_context 는 기준지역만(재난유형 없음).
 * 동시성(계정 4·전체 8)은 submitJob 이 맡는다 — 한도를 넘는 문항은 QUEUED 로 남고, 상태 조회 때 차례로 제출된다.
 * 경쟁 없이 슬롯을 세도록 한 건씩 차례로 접수한다. 완료된 답은 시연 모드를 켠 동안 12시간까지 같은 질문에 즉시 쓰인다(R52).
 * 시연 모드가 꺼져 있으면 받은 답을 다시 쓰지 않으므로(RAG 검증 — 늘 실시간) 예열하지 않는다(409).
 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return fail(400, "요청 형식이 맞지 않습니다.");
  const regions = WARM_REGIONS.filter((r) => !b.data.regions || b.data.regions.includes(r));
  const force = !!b.data.force;
  const demo = await demoGet();
  if (!demoLive(demo)) return fail(409, "시연 모드가 꺼져 있어 예열하지 않았습니다. 꺼져 있으면 받은 답을 다시 쓰지 않고 늘 새로 묻습니다. 시연 모드를 먼저 켜세요.");
  const health = await t3qHealth();
  if (!health.ok) return fail(503, `T3Q 연결 상태가 정상이 아니어서 예열하지 않았습니다. (${health.detail ?? "상태 확인 실패"})`);

  const t0 = Date.now();
  const items: WarmItem[] = [];
  try {
    await ensureSchema();
  } catch (e) {
    return fail(500, "서버 DB를 준비하지 못했습니다. " + errText(e));
  }
  for (const r of regions) {
    const acc = ACCOUNTS.find((a) => a.role === "지자체" && a.region === r && demo.accounts.includes(a.id));
    const region = PILOT_T3Q[r];
    const set = briefingDefaults().filter((x) => x.checked);
    for (const [i, it] of set.entries()) {
      const req = briefRequest(it, i, set.length, region.name);
      const question = req.question;
      const base = { region: r, regionName: region.name, accountId: acc?.id ?? "", libraryId: it.id, question };
      if (!acc) {
        items.push({ ...base, outcome: "ERROR", job: null, error: "이 지역에는 시연 대상 계정이 없습니다. 「시연 모드」 탭에서 이 지역 계정을 대상으로 고르세요." });
        continue;
      }
      if (Date.now() - t0 > BUDGET_MS) {
        items.push({ ...base, outcome: "SKIPPED", job: null, error: "처리 시간 한도로 접수하지 못했습니다. 다시 실행하면 이어서 접수합니다." });
        continue;
      }
      try {
        const job = await submitJob(acc, {
          question,
          source: "BRIEFING",
          libraryId: null,
          queryContext: { region },
          briefing: req.briefing,
          turnNo: i + 1,
          noCache: force,
        });
        // 캐시 적중 = 새 행 + cached_from · 진행 중 합류 = 이번 요청 전에 만든 행
        const outcome: WarmItem["outcome"] = job.cached_from ? "CACHED" : new Date(job.created_at).getTime() < t0 - 2000 ? "JOINED" : "NEW";
        items.push({ ...base, outcome, job: pick(job) });
      } catch (e) {
        items.push({ ...base, outcome: "ERROR", job: null, error: errText(e) });
      }
    }
  }
  await audit(null, g.who.id, "admin.warm", { regions, force, jobs: items.map((i) => i.job?.id ?? null) }).catch(() => {});
  const body: WarmResponse = { items, at: new Date().toISOString() };
  return json(body);
}
