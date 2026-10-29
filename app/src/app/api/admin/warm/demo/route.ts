import { z } from "zod";
import { WARM_REGIONS, type DemoWarmItem, type DemoWarmResponse, type WarmJob } from "@/lib/adminTypes";
import type { Account } from "@/lib/config";
import { DEFAULT_BRIEFING, DEMO_DAY_BRIEFING, libById } from "@/lib/library";
import { SCN_ACCOUNT } from "@/lib/scenario";
import { errText, requireOperator, t3qHealth } from "@/lib/server/admin";
import { audit, ensureSchema } from "@/lib/server/db";
import { submitJob, type Job } from "@/lib/server/jobs";
import { kvGet } from "@/lib/server/kvStore";
import { briefWarningsOf, demoAccountOf, demoBriefPlan, demoChainPlan, warnNosOf, type BriefLike, type DemoWarmEntry } from "@/lib/server/warmPlan";
import { weatherFor } from "@/lib/server/weather";
import { fail, json } from "@/lib/server/who";
import { PILOT_T3Q } from "@/lib/t3q/region";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  regions: z.array(z.enum(["busan", "inje", "yeongcheon"])).min(1).max(3).optional(),
  /** 24시간 캐시를 무시하고 새로 질의 */
  force: z.boolean().optional(),
  /** 이 항목만(묶음 항목 id · 브리핑 항목 key) — 결과 표에서 한 항목을 다시 돌릴 때 */
  ids: z.array(z.string().max(80)).min(1).max(40).optional(),
});
/** 함수 시간 한도(60초) 안에 끝내기 위한 접수 예산 — 넘으면 남은 문항은 SKIPPED (다시 실행하면 이어서 접수) */
const BUDGET_MS = 40_000;

const pick = (j: Job): WarmJob => ({
  id: j.id, account_id: j.account_id, state: j.state, t3q_status: j.t3q_status, http_status: j.http_status,
  cached_from: j.cached_from, error_code: j.error_code, created_at: j.created_at, finished_at: j.finished_at, elapsed_ms: j.elapsed_ms,
});

/** 계정에 저장된 「내 브리핑 항목」(kv acct:<계정> brief) — 저장한 적 없으면 기본 4문항(lib/briefing loadBrief 와 같게) */
async function briefItemsOf(acc: Account): Promise<BriefLike[]> {
  const v = (await kvGet(`acct:${acc.id}`)).brief?.value;
  if (Array.isArray(v) && v.length) return v as BriefLike[];
  return DEFAULT_BRIEFING.flatMap((id) => {
    const q = libById(id);
    return q ? [{ key: id, preset: id, label: q.category, q: q.text, on: true }] : [];
  });
}

/**
 * POST /api/admin/warm/demo {regions?, force?, ids?} — 시연 세트 예열 (운영자 전용)
 * 질문 모음 「재난담당자의 하루」 묶음 가운데 실시간이 아닌 항목 + 브리핑 장면이 있는 지역(부산) 담당자 계정의 브리핑 세트를
 * 그 지역 시연 계정(lib/scenario SCN_ACCOUNT) 명의로 접수한다(lib/server/warmPlan — 화면과 같은 열쇠). 실시간 장면 항목은 보내지 않는다.
 * 동시성(계정 4·전체 8)은 submitJob 이 맡는다 — 한도를 넘는 문항은 QUEUED 로 남고, 운영관리 화면의 상태 조회 때 차례로 제출된다.
 * 시연 계정 자리를 무대 질의와 나눠 쓰므로 예열이 끝나기 전에 그 계정으로 질의하면 대기할 수 있다(운영관리 표에 주의로 적음 · 대본 §5.4)
 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return fail(400, "요청 형식이 맞지 않습니다.");
  const regions = WARM_REGIONS.filter((r) => !b.data.regions || b.data.regions.includes(r));
  const force = !!b.data.force;
  const health = await t3qHealth();
  if (!health.ok) return fail(503, `T3Q 연결 상태가 정상이 아니어서 예열하지 않았습니다. (${health.detail ?? "상태 확인 실패"})`);
  try {
    await ensureSchema();
  } catch (e) {
    return fail(500, "서버 DB를 준비하지 못했습니다. " + errText(e));
  }

  const t0 = Date.now();
  const items: DemoWarmItem[] = [];
  for (const r of regions) {
    // 시연 계정(시나리오 특보가 붙는 계정)으로 — 같은 지역 계정이 늘어도 다른 계정의 브리핑 항목·특보로 예열하지 않게
    const acc = demoAccountOf(r);
    const head = { region: r, regionName: PILOT_T3Q[r].name, accountId: acc?.id ?? SCN_ACCOUNT[r] };
    if (!acc) {
      items.push({ ...head, kind: "CHAIN", itemId: "—", scene: "—", title: "—", question: "", outcome: "ERROR", job: null, error: `시연 계정(${SCN_ACCOUNT[r]})이 설정(ACCOUNTS)에 없습니다.` });
      continue;
    }
    let plan: DemoWarmEntry[] = demoChainPlan(acc, r);
    if (DEMO_DAY_BRIEFING.includes(r)) {
      try {
        // 특보 = 그 계정 화면이 받는 특보(시연 시나리오 포함, R43)로 AI 모드가 켜진 화면과 같게 — 시나리오를 켠 채 예열해야 무대와 열쇠가 같다
        plan = [...demoBriefPlan(acc, await briefItemsOf(acc), briefWarningsOf(await weatherFor(acc), acc)), ...plan];
      } catch (e) {
        items.push({ ...head, kind: "BRIEFING", itemId: "—", scene: "2", title: "브리핑 세트", question: "", outcome: "ERROR", job: null, error: "브리핑 세트를 읽지 못했습니다. " + errText(e) });
      }
    }
    for (const p of plan.filter((x) => !b.data.ids || b.data.ids.includes(x.itemId))) {
      // 브리핑 줄은 실린 특보 번호를 함께(열쇠에 들어감 — 시나리오를 켠 채 예열했는지 표에서 본다)
      const row = { ...head, kind: p.kind, itemId: p.itemId, scene: p.scene, title: p.title, question: p.input.question, ...(p.kind === "BRIEFING" ? { warnings: warnNosOf(p.input.weatherWarnings) } : {}) };
      if (Date.now() - t0 > BUDGET_MS) {
        items.push({ ...row, outcome: "SKIPPED", job: null, error: "처리 시간 한도로 접수하지 못했습니다. 다시 실행하면 이어서 접수합니다." });
        continue;
      }
      try {
        const job = await submitJob(acc, { ...p.input, noCache: force });
        // 캐시 적중 = 새 행 + cached_from · 진행 중 합류 = 이번 요청 전에 만든 행
        const outcome: DemoWarmItem["outcome"] = job.cached_from ? "CACHED" : new Date(job.created_at).getTime() < t0 - 2000 ? "JOINED" : "NEW";
        items.push({ ...row, outcome, job: pick(job), sourceFinishedAt: job.source_finished_at ?? null });
      } catch (e) {
        items.push({ ...row, outcome: "ERROR", job: null, error: errText(e) });
      }
    }
  }
  await audit(null, g.who.id, "admin.warm.demo", { regions, force, ids: b.data.ids ?? null, jobs: items.map((i) => i.job?.id ?? null) }).catch(() => {});
  const body: DemoWarmResponse = { items, at: new Date().toISOString() };
  return json(body);
}
