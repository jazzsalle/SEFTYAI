import type { AdminFeedbackResponse, AdminFeedbackRow } from "@/lib/adminTypes";
import { errText, requireOperator, rows } from "@/lib/server/admin";
import { db, ensureSchema } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";
import { maskSensitive } from "@/lib/server/convStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feedback — 답변 평가 최근 200건 (운영자 전용, R12)
 * 질문은 sa_agent_jobs.question_user 를 붙인다. T3Q-31 전송 결과는 봉투 status 만.
 */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    await ensureSchema();
    const sql = db();
    const [list, summary] = await Promise.all([
      rows<AdminFeedbackRow>(
        sql.query(
          `select f.job_id, f.account_id, f.response_id, f.rating, f.comment, f.rated_at,
                  f.t3q_result->>'status' as t3q_feedback_status,
                  left(j.question_user, 500) as question_user, j.source, j.created_at as asked_at
             from sa_feedback f
             left join sa_agent_jobs j on j.id = f.job_id
            order by f.rated_at desc
            limit 200`,
        ),
      ),
      rows<{ rating: string; n: number }>(sql.query(`select rating, count(*)::int as n from sa_feedback group by rating order by rating`)),
    ]);
    const body: AdminFeedbackResponse = { rows: list.map((r) => ({ ...r, question_user: r.question_user == null ? r.question_user : maskSensitive(String(r.question_user)), comment: r.comment == null ? r.comment : maskSensitive(String(r.comment)) })), summary };
    return json(body);
  } catch (e) {
    return fail(500, "답변 평가를 불러오지 못했습니다. " + errText(e));
  }
}
