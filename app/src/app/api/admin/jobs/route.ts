import type { AdminJobRow, AdminJobsResponse } from "@/lib/adminTypes";
import type { JobState } from "@/lib/jobTypes";
import { errText, requireOperator, rows, t3qHealth } from "@/lib/server/admin";
import { db, ensureSchema } from "@/lib/server/db";
import { medianMs, sweepAny } from "@/lib/server/jobs";
import { fail, json } from "@/lib/server/who";
import { maskSensitive } from "@/lib/server/convStore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 목록용 열 — 큰 열(request·raw·preview·geo)은 존재 여부만 (원문은 /api/agent/jobs/{id}?full=1) */
const COLS = `id, account_id, conv_id, turn_no, source, library_id, left(question_user, 500) as question_user,
  (question_sent is distinct from question_user) as sent_differs, state, t3q_status, http_status, cached_from, retry_of, error_code,
  t3q_request_id, t3q_conversation_id, created_at, submitted_at, last_polled_at, finished_at, elapsed_ms,
  coalesce(jsonb_typeof(raw) <> 'null', false) as has_raw, coalesce(jsonb_typeof(preview) <> 'null', false) as has_preview`;
const WINDOW_DAYS = 7;
const PER_ACCOUNT = 4; // lib/server/jobs.ts PER_ACCOUNT 와 같은 값

interface Timing { n: number; avg_ms: number | null; p50_ms: number | null; p90_ms: number | null; max_ms: number | null; avg_wait_ms: number | null }

/**
 * GET /api/admin/jobs — 질의 현황 (운영자 전용, S7)
 * 전체 계정 최근 200건 · 진행 중 목록 · 상태별 개수(전체/24시간) · 응답 시간(최근 7일, 캐시 제외) · 동시 슬롯 · T3Q 상태
 */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    await ensureSchema();
    // 방치된 작업 거두기(운영 화면이 열려 있는 동안 5초마다) — 소유자가 화면을 닫은 작업도 결과를 받는다
    await sweepAny(3).catch((e) => { console.error("[admin] sweepAny", e); return 0; });
    const sql = db();
    const [recent, active, counts, timing, slots, expectedMs, t3q] = await Promise.all([
      rows<AdminJobRow>(sql.query(`select ${COLS} from sa_agent_jobs order by created_at desc limit 200`)),
      rows<AdminJobRow>(sql.query(`select ${COLS} from sa_agent_jobs where state in ('QUEUED','SUBMITTED','RUNNING') order by created_at asc limit 200`)),
      rows<{ state: JobState; total: number; last24h: number }>(
        sql.query(
          `select state, count(*)::int as total, (count(*) filter (where created_at > now() - interval '24 hours'))::int as last24h
             from sa_agent_jobs group by state order by state`,
        ),
      ),
      rows<Timing>(
        sql.query(
          `select count(*)::int as n,
                  round(avg(elapsed_ms))::int as avg_ms,
                  percentile_cont(0.5) within group (order by elapsed_ms) as p50_ms,
                  percentile_cont(0.9) within group (order by elapsed_ms) as p90_ms,
                  max(elapsed_ms) as max_ms,
                  round(avg(extract(epoch from (submitted_at - created_at)) * 1000))::int as avg_wait_ms
             from sa_agent_jobs
            where state = 'DONE' and cached_from is null and elapsed_ms > 0 and finished_at > now() - interval '${WINDOW_DAYS} days'`,
        ),
      ),
      rows<{ running: number; cooling: number }>(
        sql.query(
          `select (count(*) filter (where state in ('SUBMITTED','RUNNING')))::int as running,
                  (count(*) filter (where state = 'CANCELLED' and finished_at > now() - interval '120 seconds'))::int as cooling
             from sa_agent_jobs where state in ('SUBMITTED','RUNNING','CANCELLED')`,
        ),
      ),
      medianMs(),
      t3qHealth(),
    ]);
    const t = timing[0];
    const num = (v: unknown) => (v == null ? null : Math.round(Number(v)));
    // 운영 화면에는 질문 속 개인정보(전화번호 등)를 가려서 보인다(대화 이력과 같은 규칙)
    const mask = (r: AdminJobRow) => ({ ...r, question_user: maskSensitive(String(r.question_user ?? "")) });
    const body: AdminJobsResponse = {
      recent: recent.map(mask),
      active: active.map(mask),
      counts,
      timing: { windowDays: WINDOW_DAYS, n: t?.n ?? 0, avgMs: num(t?.avg_ms), p50Ms: num(t?.p50_ms), p90Ms: num(t?.p90_ms), maxMs: num(t?.max_ms), avgWaitMs: num(t?.avg_wait_ms) },
      expectedMs,
      slots: {
        running: slots[0]?.running ?? 0,
        cooling: slots[0]?.cooling ?? 0,
        queued: counts.find((c) => c.state === "QUEUED")?.total ?? 0,
        perAccount: PER_ACCOUNT,
        global: Number(process.env.T3Q_MAX_GLOBAL || 8),
      },
      t3q,
      at: new Date().toISOString(),
    };
    return json(body);
  } catch (e) {
    return fail(500, "질의 현황을 불러오지 못했습니다. " + errText(e));
  }
}
